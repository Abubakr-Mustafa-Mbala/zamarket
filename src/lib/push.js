import { supabase } from './supabase'

// Turning phone notifications on for this browser.
//
// Web push is the only channel here that is free, needs nobody's approval and
// works with the browser closed. The trade is that it is per-browser: turning
// it on on your laptop does not turn it on on your phone. That is a property
// of how push works, not something we can hide, so the dashboard says which
// device it is talking about rather than pretending there is one switch.
//
// iPhone note: Safari only allows this once the site has been added to the
// home screen. We detect that rather than showing a button that silently
// fails, which is the usual experience.

export const pushSupported = () => typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'

// An iPhone or iPad that has not been installed to the home screen cannot
// subscribe, however many times the button is pressed.
export const needsHomeScreen = () => {
  if (typeof navigator === 'undefined') return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!ios) return false
  const installed = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone
  return !installed
}

const urlBase64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const deviceLabel = () => {
  const ua = navigator.userAgent || ''
  const os = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad/i.test(ua) ? 'iPhone'
      : /Windows/i.test(ua) ? 'Windows'
        : /Mac/i.test(ua) ? 'Mac' : 'This device'
  const browser = /EdgA?\//i.test(ua) ? 'Edge'
    : /Chrome\//i.test(ua) ? 'Chrome'
      : /Firefox\//i.test(ua) ? 'Firefox'
        : /Safari\//i.test(ua) ? 'Safari' : 'browser'
  return `${os} · ${browser}`
}

// Ask the server for the public key. Replaces the old build-time VITE_
// variable, which silently stayed empty until the site was rebuilt.
export async function serverPushKey() {
  try {
    const res = await fetch('/api/push-key', { cache: 'no-store' })
    if (!res.ok) return { key: '', reason: 'The server did not answer.' }
    const body = await res.json()
    if (body.key) return { key: body.key, reason: '' }
    if (body.configured && !body.valid) {
      return { key: '', reason: 'The notification key on the server does not look right — check VAPID_PUBLIC_KEY in Netlify for a missing or extra character.' }
    }
    return { key: '', reason: 'Add VAPID_PUBLIC_KEY in Netlify, then try again. No rebuild is needed.' }
  } catch {
    return { key: '', reason: 'Could not reach the server.' }
  }
}

export async function registerWorker() {
  if (!pushSupported()) return null
  try { return await navigator.serviceWorker.register('/sw.js', { scope: '/' }) } catch { return null }
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    return (await reg?.pushManager?.getSubscription?.()) || null
  } catch { return null }
}

// Ask, subscribe, and save. Returns a short reason on failure so the screen
// can say what actually went wrong instead of "something went wrong".
export async function enablePush() {
  if (!pushSupported()) return { ok: false, reason: 'This browser cannot do phone notifications.' }
  if (needsHomeScreen()) {
    return { ok: false, reason: 'On an iPhone, add ZaMarket to your home screen first, then turn this on from there.' }
  }
  const { key: vapidPublicKey, reason: keyProblem } = await serverPushKey()
  if (!vapidPublicKey) return { ok: false, reason: keyProblem }

  let permission
  try { permission = await Notification.requestPermission() } catch { permission = 'denied' }
  if (permission !== 'granted') {
    return { ok: false, reason: 'Your browser blocked notifications. Allow them for zamarket.shop in the site settings, then try again.' }
  }

  const reg = await registerWorker()
  if (!reg) return { ok: false, reason: 'Could not start the background worker.' }
  await navigator.serviceWorker.ready

  let sub
  try {
    sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
    }
  } catch (e) {
    return { ok: false, reason: `This browser refused the subscription. ${e.message || ''}`.trim() }
  }

  const json = sub.toJSON()
  const { data: who } = await supabase.auth.getUser()
  const userId = who?.user?.id
  if (!userId) return { ok: false, reason: 'Sign in first.' }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    label: deviceLabel(),
  }, { onConflict: 'endpoint' })
  if (error) return { ok: false, reason: error.message }
  return { ok: true, label: deviceLabel() }
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return { ok: true }
  const endpoint = sub.endpoint
  try { await sub.unsubscribe() } catch { /* already gone */ }
  // Remove the row as well: a dead endpoint left behind means the server
  // keeps trying to reach a browser that will never answer.
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  return { ok: true }
}
