// Made-to-order rules, mirrored from place_order() in schema.sql (the database has the final say).
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (x) => String(x).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

export function daysText(days) {
  if (!days || !days.length || days.length === 7) return 'any day'
  const sorted = [...days].sort((a, b) => a - b)
  const run = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  if (run && sorted.length > 2) return `${DAY_NAMES[sorted[0]]}–${DAY_NAMES[sorted[sorted.length - 1]]}`
  return sorted.map((d) => DAY_NAMES[d]).join(', ')
}

export function leadText(p) {
  const lead = Number(p.lead_time_days) || 0
  return lead === 0 ? 'Can be made the same day' : lead === 1 ? 'Order at least 1 day ahead' : `Order at least ${lead} days ahead`
}

// Rules across everything made-to-order in the cart
export function dateRules(lines) {
  const lead = Math.max(0, ...lines.map((l) => Number(l.lead_time_days) || 0))
  let allowed = [0, 1, 2, 3, 4, 5, 6]
  for (const l of lines) if (l.order_days && l.order_days.length) allowed = allowed.filter((d) => l.order_days.includes(d))
  const earliest = new Date(); earliest.setHours(0, 0, 0, 0); earliest.setDate(earliest.getDate() + lead)
  let first = null
  if (allowed.length) {
    const d = new Date(earliest)
    for (let k = 0; k < 14; k++) { if (allowed.includes(d.getDay())) { first = ymd(d); break } d.setDate(d.getDate() + 1) }
  }
  return { lead, allowed, min: ymd(earliest), first }
}

export function checkDate(value, rules) {
  if (!value) return 'Choose the date you need it'
  if (value < rules.min) return `The earliest date is ${parse(rules.min).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
  if (!rules.allowed.includes(parse(value).getDay())) return `Not available on ${parse(value).toLocaleDateString('en-GB', { weekday: 'long' })}s. Available ${daysText(rules.allowed)}.`
  return null
}

export const niceDate = (s) => (s ? parse(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '')

export const LOCATION_TEXT = { at_customer: 'At your place', at_seller: "At the seller's place", online: 'Online' }

export function howText(p) {
  if (p.fulfilment === 'service') {
    const lead = Number(p.lead_time_days) || 0
    return [p.duration_text, LOCATION_TEXT[p.service_location], lead ? `Book ${lead} day${lead > 1 ? 's' : ''} ahead` : 'Book for today or later', `Available ${daysText(p.order_days)}`].filter(Boolean).join('. ')
  }
  if (p.fulfilment === 'made_to_order') return `Made to order. ${leadText(p)}. Available ${daysText(p.order_days)}`
  return null
}
