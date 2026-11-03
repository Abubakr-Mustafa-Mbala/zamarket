/**
 * Fetch every row of a public catalogue view, rather than silently stopping
 * at Supabase/PostgREST's default maximum response size (often 1,000 rows).
 * The caller supplies a query factory so every page has identical filters.
 */
export async function fetchCataloguePages(queryForPage, { pageSize = 500, maxPages = 200 } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new RangeError('pageSize must be between 1 and 1000')
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new RangeError('maxPages must be a positive integer')
  }
  const rows = []
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize
    const { data, error } = await queryForPage(from, from + pageSize - 1)
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Invalid catalogue response')
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
  // Do not display an incomplete catalogue as though it were complete.
  throw new Error('Catalogue exceeded the maximum safe page count')
}
