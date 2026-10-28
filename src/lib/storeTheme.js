// A vendor decorates their shop: they pick a colourway, and it carries the
// background, the accent and the text of their whole store page.
//
// The important part is that legibility is CALCULATED, never hand-set. A vendor
// can choose a near-black background or a pale pink one, and the engine works
// out from the colour's luminance whether text should be light or dark, how far
// to lift a card off the background, and whether a price on the accent colour
// should be black or white. That is why a bad-looking shop is not possible here:
// the palette is curated, and whatever is picked stays readable.

const hex = (h) => {
  const s = h.replace('#', '')
  const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16))
}
const toHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

// WCAG relative luminance.
export const luminance = (h) => {
  const [r, g, b] = hex(h).map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// WCAG contrast ratio between two colours, 1 (identical) to 21 (black on white).
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const isLight = (h) => luminance(h) > 0.4
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t))

// Black or white, whichever is easier to read on this colour.
export const readableOn = (bg) => (contrast('#FFFFFF', bg) >= contrast('#0E1013', bg) ? '#FFFFFF' : '#0E1013')

// The curated colourways. Each is a background plus an accent chosen to sit on
// it; everything else is derived. Deep, muted and expensive-looking rather than
// the primary colours a colour picker lands on by default.
export const THEMES = [
  // --- dark ---
  { key: 'ink', name: 'Ink', group: 'Dark', bg: '#101114', brand: '#D9A441', note: 'Near-black with brass' },
  { key: 'midnight', name: 'Midnight', group: 'Dark', bg: '#121A2B', brand: '#C8A84B', note: 'Deep navy with old gold' },
  { key: 'forest', name: 'Forest', group: 'Dark', bg: '#102019', brand: '#C6A868', note: 'Dark green with sand' },
  { key: 'bordeaux', name: 'Bordeaux', group: 'Dark', bg: '#211017', brand: '#D2A072', note: 'Wine with warm clay' },
  { key: 'aubergine', name: 'Aubergine', group: 'Dark', bg: '#1A1322', brand: '#C3A3D6', note: 'Deep plum with lilac' },
  { key: 'espresso', name: 'Espresso', group: 'Dark', bg: '#1B1510', brand: '#D6A96A', note: 'Dark brown with caramel' },
  // --- light ---
  { key: 'bone', name: 'Bone', group: 'Light', bg: '#F4F1EB', brand: '#1F2933', note: 'Warm off-white, charcoal type' },
  { key: 'champagne', name: 'Champagne', group: 'Light', bg: '#F7EFE1', brand: '#8A6A22', note: 'Soft cream with bronze' },
  { key: 'blush', name: 'Blush', group: 'Light', bg: '#F8EAEA', brand: '#8C3A4E', note: 'Pale pink with deep rose' },
  { key: 'sage', name: 'Sage', group: 'Light', bg: '#EAF0EB', brand: '#2F5A42', note: 'Soft green with pine' },
  { key: 'mist', name: 'Mist', group: 'Light', bg: '#E9EEF4', brand: '#1F4A6B', note: 'Cool grey with deep blue' },
  { key: 'linen', name: 'Linen', group: 'Light', bg: '#F1EDE4', brand: '#5A4632', note: 'Natural linen with walnut' },
]

export const STYLES = [
  { key: 'clean', name: 'Clean', note: 'Colour on the details, plain background' },
  { key: 'tinted', name: 'Tinted', note: 'The colour washes the whole shop' },
  { key: 'bold', name: 'Bold', note: 'Full colour, strongest look' },
]

export const themeOf = (vendor) => {
  const t = vendor?.theme || {}
  const colour = THEMES.find((x) => x.key === t.colour) || THEMES[0]
  const style = STYLES.find((x) => x.key === t.style) || STYLES[1]
  return { colour, style }
}

// Everything the store page needs, derived so that nothing can come out
// unreadable. `strength` is how much of the chosen background actually shows:
// Clean keeps the marketplace's own background, Tinted and Bold take it over.
export function themeVars(vendor) {
  const { colour, style } = themeOf(vendor)
  const site = '#0E1013'
  const strength = style.key === 'bold' ? 1 : style.key === 'tinted' ? 0.82 : 0
  const bg = strength === 0 ? site : mix(site, colour.bg, strength)

  const light = isLight(bg)
  // Cards lift off the background: lighter on a dark shop, deeper on a light one.
  const card = mix(bg, light ? '#000000' : '#FFFFFF', light ? 0.045 : 0.055)
  const raised = mix(bg, light ? '#000000' : '#FFFFFF', light ? 0.09 : 0.11)
  const ink = light ? '#15181C' : '#F2F4F7'
  const ink2 = mix(ink, bg, 0.26)
  // Muted is used for real sentences, not just labels, so it has to clear the
  // 4.5:1 bar for small text against the CARD — which is itself lifted off the
  // background. It is the first colour to fail, so it is held close to the ink.
  const muted = mix(ink, bg, 0.3)
  const line = mix(bg, light ? '#000000' : '#FFFFFF', light ? 0.12 : 0.14)
  const lineStrong = mix(bg, light ? '#000000' : '#FFFFFF', light ? 0.24 : 0.26)

  // The accent has to be legible against this background too. If the vendor's
  // pick is too close to it — a dark accent on a dark shop — it is pulled
  // towards the readable end until it clears the AA bar for large text.
  let brand = colour.brand
  let guard = 0
  while (contrast(brand, bg) < 3.2 && guard < 14) {
    brand = mix(brand, light ? '#000000' : '#FFFFFF', 0.12)
    guard += 1
  }

  // The same accent is also used for small text — links, chips, the stars — and
  // 3:1 is not enough for that. It appears on several surfaces (the page, a
  // card, a raised chip, a tint of itself), so it is pushed until it clears
  // 4.5:1 against the WORST of them, not just against one.
  const tint = mix(bg, brand, 0.16)
  const surfaces = [bg, card, raised, tint]
  const worst = (c) => Math.min(...surfaces.map((s) => contrast(c, s)))
  let brandText = brand
  guard = 0
  while (worst(brandText) < 4.5 && guard < 30) {
    brandText = mix(brandText, light ? '#000000' : '#FFFFFF', 0.07)
    guard += 1
  }

  // Status colours are tuned for the marketplace's dark page. Inside a light
  // shop they have to swing back, or "In stock" turns into pale green on cream.
  const status = light
    ? { ok: '#0E6B4C', okSoft: '#DCF0E7', warn: '#8A5A00', warnSoft: '#FAEFD8',
        bad: '#A8322D', badSoft: '#F7E2E0', info: '#E2EAF2' }
    : { ok: '#58C79A', okSoft: '#10322A', warn: '#E0A94A', warnSoft: '#332814',
        bad: '#E8736B', badSoft: '#3A1F1E', info: '#1B2630' }

  return {
    '--store-bg': bg,
    '--store-ink': ink,
    '--store-ok': status.ok,
    '--store-ok-soft': status.okSoft,
    '--store-warn': status.warn,
    '--store-warn-soft': status.warnSoft,
    '--store-bad': status.bad,
    '--store-bad-soft': status.badSoft,
    '--store-info-soft': status.info,
    '--store-light': light ? '1' : '0',
    '--store-ink-2': ink2,
    '--store-muted': muted,
    '--store-card': card,
    '--store-raised': raised,
    '--store-line': line,
    '--store-line-strong': lineStrong,
    '--brand': brand,                       // accent as a fill
    '--brand-text': brandText,              // accent as small text
    '--brand-on': readableOn(brand),        // text that sits ON the accent
    '--brand-text-on': readableOn(brandText),
    '--brand-soft': tint,                   // a tint of the accent, on this background
    '--brand-deep': brand,
    '--store-shadow': light
      ? '0 1px 2px rgba(0,0,0,0.05), 0 10px 26px -16px rgba(0,0,0,0.35)'
      : '0 1px 0 rgba(255,255,255,0.04) inset, 0 10px 28px -16px rgba(0,0,0,0.8)',
  }
}

// Used by the vendor's own preview swatches.
export const swatch = (t) => ({ background: t.bg, color: t.brand, borderColor: t.brand })
