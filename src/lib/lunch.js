// Lunch plans: the dates a customer can book, what is left, and the totals.
// Every number shown to a customer comes from the seller's own settings
// (cooking days, daily limits, prices) and from real bookings, never invented.

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "Now" in Lusaka, whatever the phone's clock zone is.
export function lusakaNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lusaka', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (t) => Number(parts.find((p) => p.type === t)?.value)
  return { date: `${get('year')}-${String(get('month')).padStart(2, '0')}-${String(get('day')).padStart(2, '0')}`, hour: get('hour') }
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const dow = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay()
export function dayLabel(iso, long = false) {
  const d = new Date(`${iso}T12:00:00Z`)
  return `${(long ? DAY : SHORT)[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
}

// The first date that can still be booked: tomorrow before the cut-off hour,
// otherwise the day after.
export function firstBookable(cutoffHour = 18, now = new Date()) {
  const { date, hour } = lusakaNow(now)
  return addDays(date, hour >= cutoffHour ? 2 : 1)
}

const cooksOn = (product, iso) => {
  const days = product?.order_days
  return !Array.isArray(days) || days.length === 0 ? dow(iso) >= 1 && dow(iso) <= 5 : days.includes(dow(iso))
}

// The menu for the coming days: each date with the dishes cooked that day and
// how many are left (null when the seller set no limit).
export function upcomingMenu({ deal, products, availability = [], days = 12, now = new Date() }) {
  const start = firstBookable(deal?.cutoff_hour ?? 18, now)
  const byId = new Map((products || []).map((p) => [p.id, p]))
  const left = new Map(availability.map((a) => [`${a.product_id}|${a.day}`, a.day_limit == null ? null : Math.max(0, Number(a.day_limit) - Number(a.booked || 0))]))
  const out = []
  for (let i = 0; i < days; i++) {
    const iso = addDays(start, i)
    const dishes = (deal?.dishes || []).map((d) => {
      const p = byId.get(d.product_id)
      if (!p || !cooksOn(p, iso)) return null
      const lead = Number(p.lead_time_days || 0)
      if (iso < addDays(lusakaNow(now).date, lead)) return null
      const key = `${p.id}|${iso}`
      const remaining = left.has(key) ? left.get(key) : (p.daily_limit == null ? null : Number(p.daily_limit))
      return { ...p, kind: d.kind || 'box', serves: d.serves || null, remaining, soldOut: remaining === 0 }
    }).filter(Boolean)
    if (dishes.length) out.push({ date: iso, label: dayLabel(iso), long: dayLabel(iso, true), dishes })
  }
  return out
}

// Team discount tiers set by ZaMarket on a lunch plan: [{ min, pct }].
// The best tier one delivery reaches applies to that day (at most 10%).
export function cleanTiers(tiers) {
  return (Array.isArray(tiers) ? tiers : [])
    .map((t) => ({ min: Math.round(Number(t?.min)), pct: Math.min(10, Number(t?.pct)) }))
    .filter((t) => t.min >= 2 && t.pct > 0)
    .sort((a, b) => a.min - b.min)
}
export function groupPct(tiers, qty) {
  let pct = 0
  for (const t of cleanTiers(tiers)) if (qty >= t.min) pct = Math.max(pct, t.pct)
  return pct
}

// picks: { [date]: { [productId]: quantity } }. Totals match what the
// database charges: each day's subtotal less that day's team discount.
export function planTotals(picks, menu, tiers = []) {
  let lunches = 0, subtotal = 0, discount = 0, days = 0
  for (const day of menu) {
    const chosen = picks?.[day.date] || {}
    let q = 0, sub = 0
    for (const dish of day.dishes) {
      const n = Number(chosen[dish.id] || 0)
      if (n > 0) { q += n; sub += n * Number(dish.price || 0) }
    }
    if (q > 0) {
      days++; lunches += q; subtotal += sub
      discount += Math.round(sub * groupPct(tiers, q)) / 100
    }
  }
  discount = Math.round(discount * 100) / 100
  return { lunches, total: Math.round((subtotal - discount) * 100) / 100, days, subtotal, discount }
}

export function planPayloadDays(picks) {
  return Object.entries(picks || {})
    .map(([date, items]) => ({ date, items: Object.entries(items).filter(([, q]) => Number(q) > 0).map(([product_id, q]) => ({ product_id, quantity: Number(q) })) }))
    .filter((d) => d.items.length)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// The lowest price a lunch costs on this deal.
export function fromPrice(products, deal) {
  const ids = new Set((deal?.dishes || []).map((d) => d.product_id))
  const prices = (products || []).filter((p) => ids.has(p.id) && Number(p.price) > 0).map((p) => Number(p.price))
  return prices.length ? Math.min(...prices) : 0
}

// What an affiliate earns: rate % of each lunch's price, on delivery.
export function affiliateEarnings(rate, menu) {
  const r = Number(rate || 0) / 100
  if (!(r > 0)) return null
  // "Per lunch" means one person's lunch box; sharing trays would inflate it.
  const all = menu.flatMap((d) => d.dishes)
  const boxes = all.filter((x) => x.kind !== 'tray')
  const perLunch = (boxes.length ? boxes : all).map((x) => Number(x.price || 0) * r)
  if (!perLunch.length) return null
  const avg = perLunch.reduce((a, b) => a + b, 0) / perLunch.length
  return { perLunch: Math.round(avg * 100) / 100, week: Math.round(avg * 5 * 100) / 100, month: Math.round(avg * 22 * 100) / 100 }
}

// A ready post for WhatsApp, Facebook or Instagram.
export function lunchPostText({ deal, vendorName, from, link }) {
  return [
    `🍲 ${deal.title}${vendorName ? ` by ${vendorName}` : ''}`,
    deal.tagline || 'Homemade lunch delivered to your workplace.',
    from > 0 ? `💰 From K${Math.round(from).toLocaleString('en-ZM')} a lunch` : '',
    `🕛 Delivered ${(deal.delivery_windows || []).join(', ')}`,
    `📅 Order by ${deal.cutoff_hour ?? 18}:00 the day before`,
    deal.guarantee ? '✅ Late or not as described? That lunch is free.' : '',
    '',
    'See this week\'s menu and book:',
    link,
  ].filter((l) => l !== null && l !== undefined && l !== false).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// A lunch plan as the poster maker sees it: the cover and dish photos, the
// lowest price, and the ready post as the caption.
export function lunchShareProduct({ deal, vendorName, dishes = [], from = 0, link }) {
  return {
    offering_type: 'lunch', name: deal.title, price: from, category: 'Lunch at work',
    images: [...new Set([deal.cover_url, ...dishes.map((x) => x.images?.[0]), ...(deal.proof_images || [])].filter(Boolean))],
    description: deal.tagline || '', benefits: [deal.tagline, deal.in_the_box].filter(Boolean),
    cutoff_hour: deal.cutoff_hour, vendor_name: vendorName,
    share_caption: lunchPostText({ deal, vendorName, from, link }),
  }
}
