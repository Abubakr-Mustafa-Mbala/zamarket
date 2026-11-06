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

// Take turns between the sellers in a given set of products.
//
// Shared by the whole-page order and by each department shelf, so a shelf is
// fair between shops in exactly the way the front page is.
function rotateBySeller(items = [], day = lusakaDay()) {
  // Products with no vendor are the marketplace's own and are treated as one
  // more seller, not as a privileged one.
  const bySeller = new Map()
  for (const p of items) {
    const key = p.vendor_id || 'zamarket'
    if (!bySeller.has(key)) bySeller.set(key, [])
    bySeller.get(key).push(p)
  }

  // Each seller's own products, best first, with today's shuffle breaking
  // ties so the same item is not always that shop's shopfront.
  for (const [, own] of bySeller) {
    own.sort((a, b) => (
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
      const own = bySeller.get(key)
      if (own[round]) { ordered.push(own[round]); added = true }
    }
    if (!added) break
  }
  return ordered
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
  const ordered = rotateBySeller(pool, day)

  // Photoless listings are not hidden from the site, only from the front of
  // the queue. They are still reachable everywhere else.
  return pool === live ? ordered : [...ordered, ...without]
}

// The front page, grouped into departments.
//
// Taking turns between sellers makes the page fair, but on its own it also
// makes it incoherent: a cake lands between a toilet cleaner and a bench saw
// because those happen to be three different shops. Nothing is wrong with any
// one listing and the whole thing still reads as a jumble sale.
//
// So the turn-taking moves down a level. Products are grouped by their
// department first, and the rotation runs inside each one. A shopper sees
// "Food & cakes" with food in it; a baker is still not buried by a hardware
// shop that uploaded twenty things this morning.
//
// Which department leads also rotates daily, with one thumb on the scale:
// a department stocked by several different shops goes before one stocked by
// a single shop, because it is the one that looks like a market.
// The hand-picked shop window.
//
// Everything below arranges itself, which is fair but is not a shop window:
// one seller uploading their whole range makes the whole page theirs, because
// nothing can say "these are the things worth seeing first". `front_rank` is
// that. It is set by hand, lowest first, and nothing else influences it — not
// the daily rotation, not the department grouping, not how new the item is.
//
// Picked products are pulled out of everything underneath so the page does
// not show the same thing twice.
export function pickedForFront(products = []) {
  return products
    .filter((p) => p && p.front_rank != null)
    .sort((a, b) => Number(a.front_rank) - Number(b.front_rank))
}

export function departmentShelves(products = [], {
  day = lusakaDay(), minPerShelf = 3, perShelf = 12, minimum = 8, maxShelves = 6,
  excludeIds = null,
} = {}) {
  const skip = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || [])
  const live = products.filter(Boolean).filter((p) => !skip.has(p.id))
  const withPhoto = live.filter(hasPhoto)
  const pool = withPhoto.length >= minimum ? withPhoto : live

  const byDept = new Map()
  for (const p of pool) {
    const name = String(p.category || '').trim() || 'More on ZaMarket'
    if (!byDept.has(name)) byDept.set(name, [])
    byDept.get(name).push(p)
  }

  // A department with one or two things in it is not a shelf, it is a gap.
  // Those products join the mixed shelf at the end rather than being dropped.
  const full = []
  const spare = []
  for (const [name, items] of byDept) {
    if (items.length < minPerShelf) { spare.push(...items); continue }
    full.push({ name, items, sellers: new Set(items.map((p) => p.vendor_id || 'zamarket')).size })
  }

  full.sort((a, b) => (
    (b.sellers > 1 ? 1 : 0) - (a.sellers > 1 ? 1 : 0)
    || hash(`${day}:dept:${a.name}`) - hash(`${day}:dept:${b.name}`)
  ))

  const shelves = full.slice(0, maxShelves).map((d) => ({
    name: d.name,
    sellers: d.sellers,
    total: d.items.length,
    items: rotateBySeller(d.items, day).slice(0, perShelf),
  }))

  // Everything that did not make the cut, including whole departments past
  // the limit, so the page still offers a way into the rest of the shop.
  const shown = new Set(shelves.flatMap((s) => s.items.map((p) => p.id)))
  const rest = [...spare, ...full.slice(maxShelves).flatMap((d) => d.items)]
    .filter((p) => !shown.has(p.id))
  // Any leftover at all earns the mixed shelf, even a single product. A short
  // row looks slightly thin; a seller whose only listing never appears on the
  // front page at all is worse, and they have no way to fix it.
  if (rest.length) {
    shelves.push({
      name: 'More on ZaMarket', sellers: new Set(rest.map((p) => p.vendor_id || 'zamarket')).size,
      total: rest.length, items: rotateBySeller(rest, day).slice(0, perShelf), mixed: true,
    })
  }

  return shelves
}

// The "Just added" row, where newest-first genuinely belongs. New stock still
// gets its moment — in the place where that is what the reader is asking for.
export function justAdded(products = [], count = 8) {
  return [...products]
    .filter(hasPhoto)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, count)
}
