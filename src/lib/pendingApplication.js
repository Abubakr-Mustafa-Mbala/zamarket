// An application is filled in before the person has an account. It waits here
// while they choose a Google account, and is sent the moment they are back.
//
// Google may hand the person back to the front page rather than the form
// (that depends on a list of allowed addresses kept in Supabase, outside this
// code), so the app looks for a waiting application wherever they land.

export const PENDING = 'zm-pending-apply'

// Long enough for a slow sign-in, short enough that a form abandoned on a
// shared phone is not sent later under somebody else's account.
export const PENDING_MAX_AGE_MS = 2 * 60 * 60 * 1000

export function packPending({ kind, f, attribution }, now = Date.now()) {
  const { password, ...answers } = f || {}
  return JSON.stringify({ kind, f: answers, attribution: attribution || {}, at: now })
}

export function readPending(raw, now = Date.now()) {
  if (!raw) return null
  let p
  try { p = JSON.parse(raw) } catch { return null }
  if (!p || (p.kind !== 'vendor' && p.kind !== 'reseller') || !p.f || typeof p.f !== 'object') return null
  // Applications saved before the timestamp existed are let through once.
  if (typeof p.at === 'number' && now - p.at > PENDING_MAX_AGE_MS) return null
  return p
}

// Where a signed-in person with a waiting application should be taken, or
// null when they are already there or there is nothing waiting.
export function resumeTarget(pathname, raw, now = Date.now()) {
  const p = readPending(raw, now)
  if (!p) return null
  const target = `/apply/${p.kind}`
  if (pathname === target) return null
  // Never pull somebody out of the middle of paying.
  if (pathname.startsWith('/checkout')) return null
  return target
}
