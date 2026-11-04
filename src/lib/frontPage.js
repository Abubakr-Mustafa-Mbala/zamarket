// What goes on the front page, and in what order.
//
// The homepage used to be sorted purely by newest first. That has two faults.
// The obvious one: whoever uploaded most recently owns the whole first
// screen, so a vendor adding twenty products buries every other seller. The
// quieter one: the page is identical on every visit until somebody uploads,
// so a shopper who came yesterday sees nothing new and stops coming back.
//
// Three rules, in order of how much they matter:
//
//   1. One seller at a time. Go round the sellers taking their best item
//      each, so the first row comes from as many different shops as there
//      are shops. This is what makes it read as a marketplace.
//   2. A photograph is required. A listing with no picture does not sell and
//      makes the whole site look unfinished. It still appears in search and
//      on the seller's own page — just not at the front door.
//   3. The order moves each day. Same products, different arrangement, fixed
//      for the whole day. Deliberately NOT random per refresh: that breaks
//      pagination and makes people think items have disappeared.
//
// There is no ranking by popularity here on purpose. With a new marketplace
// there is no traffic to rank by, and ranking by noise is worse than being
// fair. Once the Growth page shows real numbers, that is the time.

// A stable number from a string. Same input, same output, everywhere —
// so the server, the phone and the laptop all agree on today's order.
function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

// Today in Lusaka. The rotation turns over at local midnight, not UTC, so it
// changes overnight rather than at two in the morning.
export function lusakaDay(now = new Date()) {
  return new Date(now.getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10)
}

export const hasPhoto = (p) => Boolean(p?.images?.[0])

// How good a listing is, before any rotation. Nothing here is a popularity
// measure — it is completeness, which is the thing a new seller can fix.
function quality(p) {
  let score = 0
  if (hasPhoto(p)) score += 3
  if ((p.images?.length || 0) > 1) score += 1
  if (String(p.description || '').trim().length > 40) score += 1
  if ((p.benefits || []).length) score += 1
  if (Number(p.stock_available) > 0 || p.fulfilment !== 'in_stock') score += 1
  if (Number(p.normal_price) > Number(p.price)) score += 1
  return score
}

// New in the last fortnight. Newness still counts for something — it just
// no longer decides the whole page on its own.
function freshness(p) {
  const days = (Date.now() - new Date(p.created_at || 0).getTime()) / 86400000
  if (!Number.isFinite(days) || days < 0) return 0
  return days <= 14 ? 2 : days <= 45 ? 1 : 0
}

// The front page, in order.
//
// `products` is the whole published catalogue. Returns the same products,
// rearranged — nothing is dropped except photoless listings, and even those
// come back at the end if there would otherwise be too few to fill the page.
export function frontPageOrder(products = [], { day = lusakaDay(), minimum = 8 } = {}) {
  const live = products.filter(Boolean)
  const withPhoto = live.filter(hasPhoto)
  const without = live.filter((p) => !hasPhoto(p))

  // If there are barely any photographed products, showing an empty-looking
  // shop is worse than showing the rest. The rule relaxes rather than
  // leaving the page bare.
  const pool = withPhoto.length >= minimum ? withPhoto : live

  // Group by seller. Products with no vendor are the marketplace's own and
  // are treated as one more seller, not as a privileged one.
  const bySeller = new Map()
  for (const p of pool) {
    const key = p.vendor_id || 'zamarket'
    if (!bySeller.has(key)) bySeller.set(key, [])
    bySeller.get(key).push(p)
  }

  // Each seller's own products, best first, with today's shuffle breaking
  // ties so the same item is not always that shop's shopfront.
  for (const [, items] of bySeller) {
    items.sort((a, b) => (
      (quality(b) + freshness(b)) - (quality(a) + freshness(a))
      || hash(`${day}:${a.id}`) - hash(`${day}:${b.id}`)
    ))
  }

  // Seller order also rotates daily, so the same shop is not first every day.
  const sellers = [...bySeller.keys()].sort((a, b) => hash(`${day}:${a}`) - hash(`${day}:${b}`))

  // Round robin: everyone's first product, then everyone's second, and so on.
  const ordered = []
  for (let round = 0; ; round++) {
    let added = false
    for (const key of sellers) {
      const items = bySeller.get(key)
      if (items[round]) { ordered.push(items[round]); added = true }
    }
    if (!added) break
  }

  // Photoless listings are not hidden from the site, only from the front of
  // the queue. They are still reachable everywhere else.
  return pool === live ? ordered : [...ordered, ...without]
}

// The "Just added" row, where newest-first genuinely belongs. New stock still
// gets its moment — in the place where that is what the reader is asking for.
export function justAdded(products = [], count = 8) {
  return [...products]
    .filter(hasPhoto)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, count)
}
