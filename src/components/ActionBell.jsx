import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { money } from '../lib/format'
import { chime, soundOn, setSound, unlock } from '../lib/chime'
import { pushSupported, needsHomeScreen, enablePush, disablePush, currentSubscription } from '../lib/push'

// Remembering what you have seen, kept out of the component so a private
// window or blocked storage cannot take the bell down with it.
const save = (map) => {
  try { localStorage.setItem('zamarket-bell-seen-v2', JSON.stringify(map)) } catch { /* ignore */ }
}

// A notification the operating system shows, so an order that arrives while
// ZaMarket is in another tab still reaches you. The browser only allows this
// after you have granted permission, and only while the site is open
// somewhere — it is not a replacement for a phone alert when everything is
// closed, and it never pretends to be.
export const canNotify = () => typeof Notification !== 'undefined'
export const notifyState = () => (canNotify() ? Notification.permission : 'unsupported')

export async function askToNotify() {
  if (!canNotify()) return 'unsupported'
  try { return await Notification.requestPermission() } catch { return 'denied' }
}

function notify(groups, urgent) {
  if (!canNotify() || Notification.permission !== 'granted') return
  const lead = groups[0]
  const rest = groups.length - 1
  const title = urgent ? 'ZaMarket — needs you now' : 'ZaMarket'
  const body = `${lead.label}${rest > 0 ? ` and ${rest} other thing${rest > 1 ? 's' : ''}` : ''}`
  try {
    const n = new Notification(title, { body, tag: 'zamarket-action', renotify: true })
    n.onclick = () => { try { window.focus() } catch { /* ignore */ } n.close() }
  } catch { /* some browsers refuse outside a service worker; the chime still plays */ }
}

const ago = (iso) => {
  if (!iso) return null
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(1, mins)} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''}`
  const days = Math.round(hrs / 24)
  return `${days} day${days > 1 ? 's' : ''}`
}

const ASKED = 'zamarket-alerts-asked'
const DISMISSED = 'zamarket-bell-cleared'
const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') } catch { return {} } }
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }
const asked = () => { try { return !!localStorage.getItem(ASKED) } catch { return true } }
const markAsked = () => { try { localStorage.setItem(ASKED, '1') } catch { /* ignore */ } }

// One bell for everything waiting: orders, money, applications, requests.
// No switches on it: alerts are offered once ("Turn on alerts"), and the
// choices live behind the gear in the panel.
export default function ActionBell() {
  const { user } = useAuth() || {}
  const [groups, setGroups] = useState([])
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('list')
  const [sound, setSoundOn] = useState(soundOn())
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushNote, setPushNote] = useState('')
  const pushRef = useRef(false)
  useEffect(() => { pushRef.current = pushOn }, [pushOn])
  const [emailOn, setEmailOn] = useState(true)
  const [offer, setOffer] = useState(false)
  const [cleared, setCleared] = useState(() => readJson(DISMISSED))
  useEffect(() => {
    currentSubscription().then((sub) => {
      setPushOn(!!sub)
      // Offer alerts once per device, a moment after the dashboard opens.
      if (!sub && !asked() && (pushSupported() || canNotify())) setTimeout(() => setOffer(true), 1500)
    })
  }, [])
  useEffect(() => {
    if (!user?.id) return
    supabase.from('alert_prefs').select('email').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setEmailOn(data.email !== false) }, () => {})
  }, [user?.id])

  // One tap turns on everything this device can do: the sound inside the
  // dashboard, and phone alerts that arrive with ZaMarket closed.
  const turnOn = async () => {
    unlock(); setSound(true); setSoundOn(true); chime()
    setPushBusy(true); setPushNote('')
    let r = { ok: false, reason: '' }
    if (pushSupported() && !needsHomeScreen()) r = await enablePush()
    else if (canNotify()) { const p = await askToNotify(); r = { ok: p === 'granted', reason: p === 'granted' ? '' : 'Notifications are blocked for this site in your browser settings.' } }
    else r = { ok: false, reason: needsHomeScreen() ? 'On an iPhone, add ZaMarket to your home screen first, then turn alerts on from there.' : 'This browser cannot show alerts.' }
    setPushOn(!!r.ok && pushSupported()); setPushNote(r.ok ? '' : r.reason); setPushBusy(false)
    markAsked(); setOffer(false)
    return r.ok
  }
  const togglePush = async () => {
    if (pushOn) { setPushBusy(true); await disablePush(); setPushOn(false); setPushBusy(false); return }
    await turnOn()
  }
  const toggleEmail = async () => {
    const v = !emailOn
    setEmailOn(v)
    if (user?.id) await supabase.from('alert_prefs').upsert({ user_id: user.id, email: v, updated_at: new Date().toISOString() })
  }
  const box = useRef(null)
  // The badge counts what has arrived SINCE YOU LAST LOOKED, per kind of work.
  const [seen, setSeen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zamarket-bell-seen-v2') || '{}') } catch { return {} }
  })
  const lastCounts = useRef(null)

  const load = async () => {
    const { data, error } = await supabase.rpc('action_center')
    if (error) return
    const next = data || []
    const counts = Object.fromEntries(next.map((g) => [g.key, Number(g.count || 0)]))
    const was = lastCounts.current
    setGroups(next)
    lastCounts.current = counts
    setSeen((prev) => {
      const merged = { ...prev }
      let changed = false
      for (const [k, v] of Object.entries(counts)) {
        if (merged[k] != null && merged[k] > v) { merged[k] = v; changed = true }
      }
      for (const k of Object.keys(merged)) {
        if (counts[k] == null) { delete merged[k]; changed = true }
      }
      if (changed) save(merged)
      return changed ? merged : prev
    })
    // Cleared items come back when something new of that kind arrives.
    setCleared((prev) => {
      const next2 = { ...prev }
      let changed = false
      for (const k of Object.keys(next2)) if ((counts[k] ?? 0) !== next2[k] && (counts[k] ?? 0) < next2[k]) { next2[k] = counts[k] ?? 0; changed = true }
      if (changed) writeJson(DISMISSED, next2)
      return changed ? next2 : prev
    })
    if (was) {
      const arrived = next.filter((g) => Number(g.count || 0) > Number(was[g.key] || 0))
      if (arrived.length) {
        const urgentNow = arrived.some((g) => g.tone === 'urgent')
        chime({ urgent: urgentNow })
        // With phone alerts on, the phone itself announces it; don't double up.
        if (!pushRef.current) notify(arrived, urgentNow)
      }
    }
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    const wake = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', wake)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', wake) }
  }, [])
  useEffect(() => {
    const away = (e) => { if (open && box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const shown = groups.filter((g) => Number(g.count || 0) > Number(cleared[g.key] ?? -1))
  const total = shown.reduce((t, g) => t + Number(g.count || 0), 0)
  const fresh = shown.reduce((t, g) => t + Math.max(0, Number(g.count || 0) - Number(seen[g.key] || 0)), 0)
  const urgent = shown.some((g) => g.tone === 'urgent')

  const markSeen = () => {
    const now = Object.fromEntries(groups.map((g) => [g.key, Number(g.count || 0)]))
    setSeen(now)
    save(now)
  }
  const clearAll = () => {
    const now = Object.fromEntries(groups.map((g) => [g.key, Number(g.count || 0)]))
    setCleared(now); writeJson(DISMISSED, now); markSeen()
  }

  return (
    <div className="bell-wrap" ref={box}>
      <button className={`bell ${urgent && fresh > 0 ? 'urgent' : ''}`}
        onClick={() => { const next = !open; setOpen(next); setView('list'); if (next) { load(); markSeen() } }}
        aria-label={fresh > 0 ? `${fresh} new, ${total} things need you` : `${total} things need you`}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {fresh > 0 && <span className="bell-count">{fresh > 99 ? '99+' : fresh}</span>}
      </button>

      {offer && !open && (
        <div className="bell-offer" role="dialog" aria-label="Turn on alerts">
          <strong>Get alerts on this {/Android|iPhone|iPad/i.test(navigator.userAgent) ? 'phone' : 'device'}?</strong>
          <span>A sound and a notification when an order or anything else needs you, even with ZaMarket closed.</span>
          <div className="btn-row">
            <button className="btn sm primary" disabled={pushBusy} onClick={turnOn}>{pushBusy ? 'Turning on…' : 'Turn on alerts'}</button>
            <button className="btn sm ghost" onClick={() => { markAsked(); setOffer(false) }}>Not now</button>
          </div>
        </div>
      )}

      {open && (
        <div className="bell-panel">
          <div className="bell-head">
            <span className="bell-title">
              <strong>{view === 'settings' ? 'Alerts' : 'What needs you'}</strong>
              {view === 'list' && <em>{total > 0 ? `${total} still to do` : 'All clear'}</em>}
            </span>
            <span className="bell-actions">
              {view === 'list' && shown.length > 0 && <button type="button" className="bell-link" onClick={markSeen}>Mark all read</button>}
              {view === 'list' && shown.length > 0 && <button type="button" className="bell-link" onClick={clearAll}>Clear</button>}
              <button type="button" className="bell-gear" aria-label={view === 'settings' ? 'Back to the list' : 'Alert settings'} onClick={() => setView(view === 'settings' ? 'list' : 'settings')}>
                {view === 'settings'
                  ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
                  : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>}
              </button>
            </span>
          </div>

          {view === 'settings' ? (
            <div className="bell-settings">
              <label className="bell-switch">
                <span><strong>Phone alerts</strong><small>{pushOn ? 'On for this device, even with ZaMarket closed.' : 'Get a notification with your phone’s sound.'}</small></span>
                <input type="checkbox" role="switch" checked={pushOn} disabled={pushBusy || !(pushSupported() || canNotify())} onChange={togglePush} />
              </label>
              <label className="bell-switch">
                <span><strong>Sound in the dashboard</strong><small>A short chime while ZaMarket is open.</small></span>
                <input type="checkbox" role="switch" checked={sound} onChange={() => { const v = !sound; setSound(v); setSoundOn(v); if (v) { unlock(); chime() } }} />
              </label>
              <label className="bell-switch">
                <span><strong>Emails</strong><small>Approvals, orders to prepare, payouts sent.</small></span>
                <input type="checkbox" role="switch" checked={emailOn} onChange={toggleEmail} />
              </label>
              {pushNote && <p className="bell-note">{pushNote}</p>}
              <p className="bell-note">Phone alerts use your phone’s own notification sound. If you hear nothing, check that notifications for your browser are not muted in the phone’s settings.</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="bell-clear">
              <span aria-hidden>✓</span>
              <p>{groups.length ? 'Cleared. New things will show here.' : 'Nothing waiting. Everything is handled.'}</p>
            </div>
          ) : (
            <ul className="bell-list">
              {shown.map((g) => (
                <li key={g.key}>
                  <Link to={g.link} onClick={() => setOpen(false)} className={`bell-item ${g.tone}`}>
                    <span className="bell-n">{g.count}</span>
                    <span className="bell-text">
                      <strong>{g.label}</strong>
                      <span className="tiny muted">
                        {g.amount != null && Number(g.amount) > 0 ? money(g.amount) : ''}
                        {g.amount != null && Number(g.amount) > 0 && g.oldest ? ' · ' : ''}
                        {g.oldest ? `oldest waiting ${ago(g.oldest)}` : ''}
                      </span>
                    </span>
                    <span aria-hidden>›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
