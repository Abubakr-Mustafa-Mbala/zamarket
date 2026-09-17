export const CURRENCY = 'K'

export function money(n, opts = {}) {
  const v = Number(n || 0)
  const d = opts.whole ? 0 : 2
  const s = Math.abs(opts.whole ? Math.round(v) : v).toLocaleString('en-ZM', { minimumFractionDigits: d, maximumFractionDigits: d })
  if (v < 0) return `−${CURRENCY}${s}`
  return opts.sign && v > 0 ? `+${CURRENCY}${s}` : `${CURRENCY}${s}`
}

export function pct(n, digits = 1) {
  const v = Number(n || 0)
  return `${v.toFixed(digits)}%`
}

export function num(n) {
  return Number(n || 0).toLocaleString('en-ZM')
}

export function date(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function datetime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function title(s) {
  return String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function n(v) {
  const x = parseFloat(v)
  return Number.isFinite(x) ? x : 0
}
