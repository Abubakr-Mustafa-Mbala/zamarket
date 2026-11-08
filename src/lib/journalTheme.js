// Editorial palettes stay separate from the marketplace's dark storefront.
// Automatic picks are intentionally calm: warm food, neutral equipment, sage home.
export const JOURNAL_THEMES = [
  ['auto', 'Automatic · match the topic'],
  ['ivory', 'Warm ivory'],
  ['stone', 'Soft stone'],
  ['sage', 'Quiet sage'],
  ['cocoa', 'Warm cocoa'],
  ['night', 'Midnight violet'],
]
export const VALID_JOURNAL_THEMES = JOURNAL_THEMES.map(([key]) => key)
export function resolveJournalTheme(category, chosen = 'auto') {
  if (VALID_JOURNAL_THEMES.includes(chosen) && chosen !== 'auto') return chosen
  const value = String(category || '').toLowerCase()
  if (/cake|food|baker|pastr|recipe|lunch|drink|grocery|restaurant/.test(value)) return 'ivory'
  if (/bed|home|living|furnish|sleep|decor|wellness|garden/.test(value)) return 'sage'
  if (/equipment|kitchen|appliance|electronic|tech|tool|industrial|business/.test(value)) return 'stone'
  return 'ivory'
}
export function publishedJournalCategories(posts) {
  const counts = new Map()
  for (const post of posts || []) {
    const name = String(post?.category || '').trim()
    if (post?.slug && post?.title && name) counts.set(name, (counts.get(name) || 0) + 1)
  }
  return [...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
