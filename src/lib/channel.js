// Which platform a visitor actually arrived from.
//
// This is the one measurement a Zambian marketplace cannot buy off the shelf.
// Google Analytics works out a visitor's source from the referrer header, and
// WhatsApp — where most of this business will be done — sends no referrer at
// all. Facebook's in-app browser and a QR code scanned off a printed poster
// send nothing useful either. In GA4 all of that lands in one bucket called
// "Direct", which is another way of saying "we don't know".
//
// So we do not ask the browser where someone came from. We put it in the link
// ourselves: every poster, every status, every printed QR carries ?src=, we
// read it on arrival, keep it with the referral touch, and send it through to
// the order. The result is a sentence nobody can otherwise say honestly:
// "eleven completed orders came from WhatsApp statuses and two from TikTok."
//
// It costs nothing and it does not depend on a single outside service.

// A closed list. The tag ends up in a database column and on a dashboard, so
// an unknown or hostile value becomes 'other' rather than being stored.
export const CHANNELS = [
  'whatsapp',   // a one-to-one chat or a group
  'status',     // a WhatsApp status / story post
  'facebook',
  'instagram',
  'tiktok',
  'x',
  'linkedin',
  'qr',         // scanned off a printed poster, card or shop window
  'flyer',      // a printed handout with a short link
  'email',
  'sms',
  'search',     // tagged links we place ourselves; organic search is detected
  'other',
]

export const CHANNEL_LABEL = {
  whatsapp: 'WhatsApp chat', status: 'WhatsApp status', facebook: 'Facebook',
  instagram: 'Instagram', tiktok: 'TikTok', x: 'X', linkedin: 'LinkedIn',
  qr: 'Scanned QR code', flyer: 'Printed flyer', email: 'Email', sms: 'SMS',
  search: 'Search', other: 'Somewhere else', marketplace: 'Came straight here',
  organic: 'Found us directly',
}

export const cleanChannel = (value) => {
  const v = String(value || '').trim().toLowerCase()
  return CHANNELS.includes(v) ? v : ''
}

// Read the tag off a URL. `src` is ours; `utm_source` is accepted too, because
// anything pasted into an ad platform will come back with that name instead.
export function channelFromSearch(search) {
  const p = search instanceof URLSearchParams ? search : new URLSearchParams(search || '')
  return cleanChannel(p.get('src')) || cleanChannel(p.get('utm_source')) || ''
}

// A last resort when no tag is present: the referrer, where there is one.
// Never guesses — an unrecognised or missing referrer returns '' so the order
// is recorded as untagged rather than as a channel we invented.
export function channelFromReferrer(ref) {
  const r = String(ref || '').toLowerCase()
  if (!r) return ''
  if (/facebook\.|fb\.|fbclid/.test(r)) return 'facebook'
  if (/instagram\./.test(r)) return 'instagram'
  if (/tiktok\./.test(r)) return 'tiktok'
  if (/whatsapp\./.test(r)) return 'whatsapp'
  if (/linkedin\./.test(r)) return 'linkedin'
  if (/(^|\/\/)(x\.com|twitter\.com)/.test(r)) return 'x'
  if (/google\.|bing\.|duckduckgo\.|yahoo\./.test(r)) return 'search'
  return ''
}

// Where this visit came from, best information first. Returns '' when there
// is genuinely nothing to go on, and '' is an honest answer.
export function detectChannel(search, referrer) {
  return channelFromSearch(search) || channelFromReferrer(referrer)
}

// Add the tag to a link we are about to hand someone to share. Existing query
// parameters are preserved and an existing src is not overwritten.
export function tagLink(url, channel) {
  const ch = cleanChannel(channel)
  if (!url || !ch) return url
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://zamarket.shop')
    if (!u.searchParams.get('src')) u.searchParams.set('src', ch)
    return u.toString()
  } catch {
    return url + (url.includes('?') ? '&' : '?') + `src=${encodeURIComponent(ch)}`
  }
}

// The channel is kept for the life of the referral touch, so a status post
// seen on Monday still gets the credit for Thursday's order. Stored separately
// from the touch itself: someone can arrive through an affiliate link on
// WhatsApp, and both facts matter.
const KEY = 'zm-channel'
const DAYS = 30

export function rememberChannel(channel) {
  const ch = cleanChannel(channel)
  if (!ch || typeof localStorage === 'undefined') return
  try { localStorage.setItem(KEY, JSON.stringify({ ch, at: Date.now() })) } catch { /* private mode */ }
}

export function storedChannel() {
  if (typeof localStorage === 'undefined') return ''
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!v || !cleanChannel(v.ch)) return ''
    if (Date.now() - Number(v.at || 0) > DAYS * 86400000) return ''
    return v.ch
  } catch { return '' }
}
