// Curated, editable export palettes. Theme controls live in Creative Studio,
// not in the marketplace's CSS: exported pictures carry their own colors.
export const STUDIO_PALETTES = Object.freeze({
  violet: { key: 'violet', label: 'Royal violet', background: '#171126', accent: '#B98CFF', ink: '#FFFFFF', panel: '#2A203C', muted: '#D3C8E2', warm: '#F5D58C' },
  copper: { key: 'copper', label: 'Ivory & copper', background: '#FFF8F0', accent: '#B84D22', ink: '#2C1813', panel: '#FFF0E1', muted: '#6F5147', warm: '#E8AD67' },
  emerald: { key: 'emerald', label: 'Emerald & gold', background: '#F9F8EF', accent: '#006A50', ink: '#103D32', panel: '#E6F1E7', muted: '#516A5D', warm: '#DAA845' },
  midnight: { key: 'midnight', label: 'Midnight gold', background: '#101620', accent: '#E4BC71', ink: '#FFFFFF', panel: '#222C3A', muted: '#C7CFDB', warm: '#E4BC71' },
  ruby: { key: 'ruby', label: 'Rose & burgundy', background: '#FFF6F5', accent: '#A62350', ink: '#391A28', panel: '#FCE5E9', muted: '#76525F', warm: '#F1B68B' },
  ocean: { key: 'ocean', label: 'Ocean blue', background: '#F1F9FC', accent: '#126F9D', ink: '#0D344B', panel: '#DFEFF6', muted: '#527084', warm: '#A4D4E8' },
})

export const DEFAULT_STUDIO_PALETTE = 'copper'
const VALID_HEX = /^#[0-9a-f]{6}$/i
export function normalizeHex(value, fallback) {
  return typeof value === 'string' && VALID_HEX.test(value) ? value.toUpperCase() : fallback
}
export function luminance(hex) {
  const parts = [1, 3, 5].map((p) => parseInt(hex.slice(p, p + 2), 16) / 255)
  return parts.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0)
}
export function contrastInk(hex) { return luminance(hex) > 0.38 ? '#18202B' : '#FFFFFF' }
export function studioPalette(key = DEFAULT_STUDIO_PALETTE, overrides = {}) {
  const base = STUDIO_PALETTES[key] || STUDIO_PALETTES[DEFAULT_STUDIO_PALETTE]
  const background = normalizeHex(overrides.background, base.background)
  const accent = normalizeHex(overrides.accent, base.accent)
  const dark = luminance(background) < 0.18
  // Custom backgrounds receive recalculated readable foreground colors.
  return { ...base, background, accent, ink: background === base.background ? base.ink : contrastInk(background),
    panel: background === base.background ? base.panel : (dark ? '#263144' : '#FFFFFF'),
    muted: background === base.background ? base.muted : (dark ? '#D5DDE9' : '#576473'),
    dark, onAccent: contrastInk(accent), accentText: luminance(accent) > 0.33 ? (dark ? '#20202B' : '#39243F') : accent }
}
export const STUDIO_QUALITY = Object.freeze({ preview: 1, export: 2 })
export function premiumPageSize(sheet) { return sheet === 'story' ? 4 : sheet === 'a4' ? 4 : sheet === 'square' ? 2 : 3 }
export function premiumPagesFor(products, sheet = 'post') {
  if (!products?.length) return []
  const max = premiumPageSize(sheet)
  const pages = []
  for (let i = 0; i < products.length; i += max) pages.push(products.slice(i, i + max))
  return pages
}
