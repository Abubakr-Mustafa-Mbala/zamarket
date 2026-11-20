import { supabase } from './supabase'
import { detectChannel, storedChannel } from './channel'
import { trackContact } from './analytics'

// First-party, anonymous visit counting: which pages people open, which
// vehicles they look at, and what they tap (WhatsApp, call, enquiry, share).
// A visitor is a random id kept only in their own browser. No name, phone or
// IP address is sent. Failures are silent: counting must never break a page.

const KEY = 'zm-visitor'
let memoryId = ''

export function visitorId() {
  try {
    let v = localStorage.getItem(KEY)
    if (!v || v.length < 8) { v = randomId(); localStorage.setItem(KEY, v) }
    return v
  } catch {
    if (!memoryId) memoryId = randomId()
    return memoryId
  }
}

function randomId() {
  try { return crypto.randomUUID() } catch { return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}` }
}

// Which website sent them, by host name only (google.com, facebook.com).
export function fromSite(referrer, ownHost) {
  try {
    const h = new URL(referrer).hostname.replace(/^www\./, '')
    return h && h !== String(ownHost || '').replace(/^www\./, '') ? h : ''
  } catch { return '' }
}

// Pages that belong to staff, sellers and affiliates are not counted.
export const PRIVATE_PATHS = /^\/(admin|vendor|reseller|ops|finance|delivery|marketing|account|login|auth|checkout)(\/|$)/

let firstSent = false
export function track(kind, { path = null, product = null, ref = null } = {}) {
  if (typeof window === 'undefined') return
  if (kind === 'whatsapp' || kind === 'call' || kind === 'enquiry') trackContact(kind, product)
  try {
    const search = window.location.search
    const channel = detectChannel(search, document.referrer) || storedChannel() || null
    const from = !firstSent ? fromSite(document.referrer, window.location.hostname) : ''
    firstSent = true
    const m = window.location.pathname.match(/^\/r\/([^/]+)/)
    supabase.rpc('track_event', {
      p_kind: kind, p_path: path, p_product: product, p_visitor: visitorId(),
      p_ref: ref || (m ? decodeURIComponent(m[1]) : null), p_channel: channel, p_from: from || null,
    }).then(() => {}, () => {})
  } catch { /* never break the page */ }
}

export const trackVisit = (path) => { if (!PRIVATE_PATHS.test(path)) track('visit', { path }) }
