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
// database charges: each day's subtotal less that day's discount, the larger
// of the team discount (lunches that day) and the package discount (number
// of days booked). Never both.
export function planTotals(picks, menu, tiers = [], dayTiers = []) {
  const counts = menu.map((day) => {
    const chosen = picks?.[day.date] || {}
    let q = 0, sub = 0
    for (const dish of day.dishes) {
      const n = Number(chosen[dish.id] || 0)
      if (n > 0) { q += n; sub += n * Number(dish.price || 0) }
    }
    return { date: day.date, q, sub }
  }).filter((d) => d.q > 0)
  const days = counts.length
  let lunches = 0, subtotal = 0, discount = 0
  const byDate = {}
  for (const { date, q, sub } of counts) {
    const off = Math.round(sub * Math.max(groupPct(tiers, q), groupPct(dayTiers, days))) / 100
    lunches += q; subtotal += sub; discount += off
    byDate[date] = Math.round((sub - off) * 100) / 100
  }
  discount = Math.round(discount * 100) / 100
  return { lunches, total: Math.round((subtotal - discount) * 100) / 100, days, subtotal, discount, byDate }
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
    // Dish photos and the cover only: kitchen photos and customer messages
    // are never put on a poster.
    images: [...new Set([deal.cover_url, ...dishes.map((x) => x.images?.[0])].filter(Boolean))],
    description: deal.tagline || '', benefits: [deal.tagline, deal.in_the_box].filter(Boolean),
    cutoff_hour: deal.cutoff_hour, vendor_name: vendorName,
    share_caption: lunchPostText({ deal, vendorName, from, link }),
  }
}

// ---- Weekly packages ------------------------------------------------------
// The menu grouped into working weeks (Monday to Friday). Each weekday says
// whether it can be booked and, if so, the dishes that day. Days that have
// passed, are past the cut-off, or have no dish are shown as closed.
export function workingWeeks(menu, count = 3) {
  const byDate = new Map((menu || []).map((d) => [d.date, d]))
  if (!byDate.size) return []
  const first = [...byDate.keys()].sort()[0]
  const monday = addDays(first, -((dow(first) + 6) % 7))
  const out = []
  for (let w = 0; w < count; w++) {
    const start = addDays(monday, w * 7)
    const days = [0, 1, 2, 3, 4].map((i) => {
      const date = addDays(start, i)
      const day = byDate.get(date) || null
      const open = !!day && day.dishes.some((x) => !x.soldOut)
      return { date, weekday: i + 1, label: dayLabel(date), day, open }
    })
    if (days.some((d) => d.open)) out.push({ start, end: addDays(start, 4), days, open: days.filter((d) => d.open).length })
  }
  return out
}

export const PACKAGES = [
  { id: 'week', title: 'Full working week', sub: 'Monday to Friday' },
  { id: 'monthu', title: 'Monday to Thursday', sub: 'Four days, Friday off' },
  { id: 'two', title: 'Two weeks', sub: 'Monday to Friday, both weeks' },
  { id: 'custom', title: 'Choose my days', sub: 'Any days you like' },
]

// The dates a package covers, starting from week index w (open days only).
export function packageDates(weeks, w, pkg) {
  const take = (week, max) => (week ? week.days.filter((d) => d.open && d.weekday <= max).map((d) => d.date) : [])
  if (pkg === 'monthu') return take(weeks[w], 4)
  if (pkg === 'two') return [...take(weeks[w], 5), ...take(weeks[w + 1], 5)]
  return take(weeks[w], 5)
}

// The first open dish of a day: what a customer gets unless they choose.
export const defaultDish = (day) => day?.dishes.find((x) => !x.soldOut) || null

// Turn chosen dates (+ optional dish choices and lunches a day) into picks.
export function picksFromDates(dates, menu, choice = {}, perDay = 1) {
  const byDate = new Map((menu || []).map((d) => [d.date, d]))
  const out = {}
  for (const date of dates) {
    const day = byDate.get(date)
    if (!day) continue
    const chosen = day.dishes.find((x) => x.id === choice[date] && !x.soldOut) || defaultDish(day)
    if (!chosen) continue
    const max = chosen.remaining == null ? 50 : chosen.remaining
    out[date] = { [chosen.id]: Math.max(1, Math.min(Number(perDay) || 1, max)) }
  }
  return out
}

// Which package a set of dates matches, or 'custom'.
export function matchPackage(weeks, w, dates) {
  const key = (list) => [...list].sort().join(',')
  const k = key(dates)
  for (const p of ['week', 'monthu', 'two']) {
    const pd = packageDates(weeks, w, p)
    if (pd.length && key(pd) === k) return p
  }
  return 'custom'
}

// "Mon 23 – Fri 27 Nov" for a list of dates.
export function dateRange(dates) {
  const s = [...dates].sort()
  if (!s.length) return ''
  if (s.length === 1) return dayLabel(s[0])
  return `${dayLabel(s[0]).replace(/ \w+$/, '')} – ${dayLabel(s[s.length - 1])}`
}

// The price of a package: the default dish each open day, one lunch a day.
export function packagePrice(weeks, w, pkg, menu, deal = null) {
  const dates = packageDates(weeks, w, pkg)
  const t = planTotals(picksFromDates(dates, menu), menu, [], deal?.day_discounts || [])
  return { dates, total: t.total, before: t.subtotal, discount: t.discount }
}

// The package discount a number of days earns, as a percentage (0 if none).
export const dayPct = (deal, days) => groupPct(deal?.day_discounts || [], days)
