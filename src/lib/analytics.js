// Google Analytics, off unless you switch it on.
//
// Nothing here loads until an analytics_id is saved in Settings. With the
// setting empty — which is how it ships — no Google script is fetched, no
// cookie is set and no request leaves the page. That is deliberate: a tag
// that loads on every visit before anyone has decided to use it is both a
// privacy problem and a page-speed problem, and it is the sort of thing that
// gets added "temporarily" and never removed.
//
// What this is FOR: how people move around the site, which pages they leave
// from, and which products they look at but do not buy. What it is NOT for:
// money. Revenue, commissions and completed orders are read from Supabase,
// which is the only record that is actually authoritative — Analytics misses
// anyone with an ad blocker or a locked-down browser, and in practice that is
// a lot of people. If the two ever disagree, Supabase is right.

let loaded = ''
let failed = false

const ID = /^G-[A-Z0-9]{6,}$/i

export function analyticsId(settings) {
  const raw = String(settings?.analytics_id || '').trim()
  return ID.test(raw) ? raw.toUpperCase() : ''
}

// Load the tag once, on the first page that needs it. Safe to call on every
// render: it does nothing after the first successful load, and nothing at all
// without a valid ID.
export function startAnalytics(settings) {
  if (typeof window === 'undefined' || failed) return ''
  const id = analyticsId(settings)
  if (!id || loaded === id) return loaded

  try {
    window.dataLayer = window.dataLayer || []
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments) }
    window.gtag('js', new Date())
    // send_page_view is off because this is a single-page app: React Router
    // changes the URL without a page load, so page views are sent by hand in
    // trackPage() below. Left on, the first page would be counted and no
    // other ever would.
    window.gtag('config', id, { send_page_view: false, anonymize_ip: true })

    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    s.onerror = () => { failed = true }
    document.head.appendChild(s)
    loaded = id
  } catch { failed = true }
  return loaded
}

const send = (event, params) => {
  if (!loaded || typeof window === 'undefined' || !window.gtag) return
  try { window.gtag('event', event, params || {}) } catch { /* never break the page for a tag */ }
}

// ---- Meta Pixel (Facebook and Instagram ads) ---------------------------------
// The same rule as Analytics: nothing loads until a Pixel ID is saved in
// Settings. What it is for: so ads can learn who looks, asks and buys, and
// show the next ad to people like them instead of to anyone who scrolls.
// Only events are sent (a product looked at, a WhatsApp tap, an order and its
// total); never a name, phone number, email or address.
let pixel = ''
let pixelFailed = false
const PIXEL = /^\d{10,20}$/
export function pixelId(settings) {
  const raw = String(settings?.meta_pixel_id || '').replace(/\s/g, '')
  return PIXEL.test(raw) ? raw : ''
}
export function startPixel(settings) {
  if (typeof window === 'undefined' || pixelFailed) return ''
  const id = pixelId(settings)
  if (!id || pixel === id) return pixel
  try {
    if (!window.fbq) {
      const n = function () { if (n.callMethod) n.callMethod.apply(n, arguments); else n.queue.push(arguments) }
      window.fbq = n; if (!window._fbq) window._fbq = n
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []
      const s = document.createElement('script')
      s.async = true
      s.src = 'https://connect.facebook.net/en_US/fbevents.js'
      s.onerror = () => { pixelFailed = true }
      document.head.appendChild(s)
    }
    window.fbq('init', id)
    pixel = id
  } catch { pixelFailed = true }
  return pixel
}
export const pixelEvent = (event, params, eventId) => {
  if (!pixel || typeof window === 'undefined' || !window.fbq) return
  try { window.fbq('track', event, params || {}, eventId ? { eventID: String(eventId) } : {}) } catch { /* never break the page */ }
}
const fbItems = (lines) => ({ content_ids: (lines || []).map((l) => String(l.id)).filter(Boolean), content_type: 'product', num_items: (lines || []).reduce((n, l) => n + (Number(l.qty) || 1), 0) })

// Both trackers at once: whichever are switched on.
export function startTracking(settings) {
  const ga = startAnalytics(settings)
  const fb = startPixel(settings)
  return !!(ga || fb)
}

export const trackPage = (path, title) => {
  send('page_view', { page_path: path, page_title: title || document.title, page_location: window.location.href })
  pixelEvent('PageView')
}

// The standard ecommerce events, in the shape GA4 expects. The currency is
// ZMW so the figures are not silently read as dollars.
const item = (p, qty = 1) => ({
  item_id: p?.id, item_name: p?.name, item_category: p?.category || undefined,
  item_brand: p?.vendor_name || undefined, price: Number(p?.price) || 0, quantity: qty,
})

export const trackViewItem = (p) => {
  send('view_item', { currency: 'ZMW', value: Number(p?.price) || 0, items: [item(p)] })
  pixelEvent('ViewContent', { content_ids: [String(p?.id || '')], content_type: 'product', content_name: p?.name, currency: 'ZMW', value: Number(p?.price) || 0 })
}

export const trackAddToCart = (p, qty = 1) => {
  send('add_to_cart', { currency: 'ZMW', value: (Number(p?.price) || 0) * qty, items: [item(p, qty)] })
  pixelEvent('AddToCart', { content_ids: [String(p?.id || '')], content_type: 'product', content_name: p?.name, currency: 'ZMW', value: (Number(p?.price) || 0) * qty })
}

export const trackBeginCheckout = (lines, total) => {
  send('begin_checkout', { currency: 'ZMW', value: Number(total) || 0, items: (lines || []).map((l) => item({ id: l.id, name: l.name, price: l.price }, l.qty)) })
  pixelEvent('InitiateCheckout', { ...fbItems(lines), currency: 'ZMW', value: Number(total) || 0 })
}

// Sent when an order is actually placed. The order number is passed as the
// transaction id so a figure in Analytics can be traced to a real order —
// no customer name, phone or address is ever sent to Google.
export const trackPurchase = (orderNumber, total, lines) => {
  send('purchase', { transaction_id: String(orderNumber || ''), currency: 'ZMW', value: Number(total) || 0, items: (lines || []).map((l) => item({ id: l.id, name: l.name, price: l.price }, l.qty)) })
  pixelEvent('Purchase', { ...fbItems(lines), currency: 'ZMW', value: Number(total) || 0 }, orderNumber ? `order-${orderNumber}` : '')
}

// A weekly lunch booked (paid after confirmation, so it counts as a lead
// with its value), and a tap to ask a seller or ZaMarket on WhatsApp or by
// phone: the two moments that show someone means it.
export const trackLunchBooked = (ref, total) => pixelEvent('Lead', { content_name: 'Weekly lunch', content_category: 'lunch', currency: 'ZMW', value: Number(total) || 0 }, ref ? `lunch-${ref}` : '')
export const trackContact = (kind, productId) => pixelEvent(kind === 'enquiry' ? 'Lead' : 'Contact', productId ? { content_ids: [String(productId)], content_type: 'product' } : {})
