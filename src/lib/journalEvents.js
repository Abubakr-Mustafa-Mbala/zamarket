import { supabase } from './supabase'

// Ephemeral random token for approximate per-session engagement analytics.
// No browser fingerprinting or personal contact information is sent.
let fallbackToken
function visitorToken() {
  try {
    let token = sessionStorage.getItem('zm-journal-anon')
    if (!token) {
      token = crypto.randomUUID()
      sessionStorage.setItem('zm-journal-anon', token)
    }
    return token
  } catch {
    fallbackToken ||= crypto.randomUUID()
    return fallbackToken
  }
}
export function trackJournalEvent(slug, event) {
  if (!slug || !['engaged_read', 'product_click', 'share_click'].includes(event)) return
  // Optional RPC: the Journal itself continues working before the migration.
  supabase.rpc('journal_track_event', {
    p_slug: slug, p_event: event, p_visitor: visitorToken(),
  }).then(() => {}).catch(() => {})
}
