// Client-side guard only; server-side checkout must independently validate attribution.
export const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
export function validAttributionTouch(touch, now = Date.now()) {
  if (!touch || typeof touch !== 'object') return false
  if (!['reseller', 'store', 'campaign', 'invite', 'vendor_ref'].includes(touch.type)) return false
  if (typeof touch.code !== 'string' || !touch.code.trim()) return false
  if (!Number.isFinite(touch.at) || touch.at > now) return false
  return now - touch.at < ATTRIBUTION_WINDOW_MS
}
