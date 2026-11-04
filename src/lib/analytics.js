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

export const trackPage = (path, title) => send('page_view', {
  page_path: path, page_title: title || document.title, page_location: window.location.href,
})

// The standard ecommerce events, in the shape GA4 expects. The currency is
// ZMW so the figures are not silently read as dollars.
const item = (p, qty = 1) => ({
  item_id: p?.id, item_name: p?.name, item_category: p?.category || undefined,
  item_brand: p?.vendor_name || undefined, price: Number(p?.price) || 0, quantity: qty,
})

export const trackViewItem = (p) => send('view_item', {
  currency: 'ZMW', value: Number(p?.price) || 0, items: [item(p)],
})

export const trackAddToCart = (p, qty = 1) => send('add_to_cart', {
  currency: 'ZMW', value: (Number(p?.price) || 0) * qty, items: [item(p, qty)],
})

export const trackBeginCheckout = (lines, total) => send('begin_checkout', {
  currency: 'ZMW', value: Number(total) || 0,
  items: (lines || []).map((l) => item({ id: l.id, name: l.name, price: l.price }, l.qty)),
})

// Sent when an order is actually placed. The order number is passed as the
// transaction id so a figure in Analytics can be traced to a real order —
// no customer name, phone or address is ever sent to Google.
export const trackPurchase = (orderNumber, total, lines) => send('purchase', {
  transaction_id: String(orderNumber || ''), currency: 'ZMW', value: Number(total) || 0,
  items: (lines || []).map((l) => item({ id: l.id, name: l.name, price: l.price }, l.qty)),
})
