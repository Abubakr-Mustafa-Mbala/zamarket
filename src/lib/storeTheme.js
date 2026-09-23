// A vendor picks a colour and a style; their shop takes it on.
// The palette is curated so nothing ever comes out unreadable.

export const THEMES = [
  { key: 'pine', name: 'Pine green', brand: '#0B6B50', soft: '#E8F5F0', deep: '#0A4F3C' },
  { key: 'ocean', name: 'Ocean blue', brand: '#12558C', soft: '#E4EEF7', deep: '#0C3C66' },
  { key: 'sky', name: 'Sky blue', brand: '#1E7FB8', soft: '#E6F2F9', deep: '#125C87' },
  { key: 'plum', name: 'Plum', brand: '#6B2D6B', soft: '#F3E8F3', deep: '#4E1F4E' },
  { key: 'rose', name: 'Rose', brand: '#A8325A', soft: '#FBE9EF', deep: '#7D2343' },
  { key: 'clay', name: 'Clay', brand: '#A8502A', soft: '#FBEDE5', deep: '#7C3A1E' },
  { key: 'gold', name: 'Gold', brand: '#9A7413', soft: '#FBF2DC', deep: '#6F5309' },
  { key: 'charcoal', name: 'Charcoal', brand: '#1F2933', soft: '#EDF1F3', deep: '#111A21' },
]

export const STYLES = [
  { key: 'clean', name: 'Clean', note: 'White background, colour on the details' },
  { key: 'bold', name: 'Bold', note: 'Colour across the top of the shop' },
  { key: 'soft', name: 'Soft', note: 'A gentle tint behind everything' },
]

export const themeOf = (vendor) => {
  const t = vendor?.theme || {}
  const colour = THEMES.find((x) => x.key === t.colour) || THEMES[0]
  const style = STYLES.find((x) => x.key === t.style) || STYLES[0]
  return { colour, style }
}

// CSS variables the store page uses. Nothing else in the marketplace changes.
export function themeVars(vendor) {
  const { colour, style } = themeOf(vendor)
  return {
    '--brand': colour.brand,
    '--brand-soft': colour.soft,
    '--brand-deep': colour.deep,
    '--store-bg': style.key === 'soft' ? colour.soft : 'transparent',
  }
}
