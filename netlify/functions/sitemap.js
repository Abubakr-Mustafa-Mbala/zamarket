// Live XML sitemap with PostgREST pagination (which caps responses by default).
// Google/Bing discover pages here; search engines still decide what to index.
const SB = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
const SITE = 'https://zamarket.shop'
const PAGE_SIZE = 500

async function getAll(resource, max = 25000) {
  if (!SB || !KEY) return []
  const items = []
  for (let offset = 0; offset < max; offset += PAGE_SIZE) {
    const sep = resource.includes('?') ? '&' : '?'
    const url = `${SB}/rest/v1/${resource}${sep}limit=${PAGE_SIZE}&offset=${offset}`
    const res = await fetch(url, {
      headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`Sitemap data source returned HTTP ${res.status}`)
    const rows = await res.json()
    if (!Array.isArray(rows)) throw new Error('Sitemap data source returned unexpected JSON')
    items.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  return items
}
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const validDate = value => {
  const d = value ? new Date(value) : null
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null
}
const validSlug = slug => typeof slug === 'string' && /^[a-z0-9][a-z0-9_-]{0,140}$/i.test(slug)

export default async function sitemap() {
  const urls = [
    { loc: `${SITE}/`, pri: '1.0' },
    { loc: `${SITE}/sellers`, pri: '0.7' },
    { loc: `${SITE}/blog`, pri: '0.8' },
    { loc: `${SITE}/categories`, pri: '0.6' },
    { loc: `${SITE}/about`, pri: '0.4' },
    { loc: `${SITE}/apply/vendor`, pri: '0.6' },
    { loc: `${SITE}/apply/reseller`, pri: '0.6' },
    { loc: `${SITE}/affiliates`, pri: '0.8' },
    { loc: `${SITE}/how-it-works`, pri: '0.5' },
    { loc: `${SITE}/protection`, pri: '0.5' },
  ]

  if (SB && KEY) {
    try {
      const [products, vendors, articles] = await Promise.all([
        getAll('public_products?select=slug,vendor_slug,created_at&order=created_at.desc'),
        getAll('public_vendors?select=slug'),
        getAll('public_posts?select=slug,published_at&order=published_at.desc'),
      ])
      for (const a of articles) if (validSlug(a.slug)) urls.push({ loc: `${SITE}/blog/${a.slug}`, pri: '0.75', lastmod: a.published_at })
      for (const p of products) {
        if (!validSlug(p.slug)) continue
        const path = validSlug(p.vendor_slug) ? `/${p.vendor_slug}/${p.slug}` : `/p/${p.slug}`
        urls.push({ loc: SITE + path, pri: '0.8', lastmod: p.created_at })
      }
      for (const v of vendors) if (validSlug(v.slug)) urls.push({ loc: `${SITE}/${v.slug}`, pri: '0.7' })
    } catch (err) {
      // A partial / empty sitemap could cause expensive re-crawling churn.
      // Return 503 so search engines try again later rather than trusting it.
      console.error('Sitemap unavailable:', err.message)
      return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'cache-control': 'no-store' } })
    }
  }
  const unique = [...new Map(urls.map(row => [row.loc, row])).values()]
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map(row => `  <url><loc>${esc(row.loc)}</loc>${validDate(row.lastmod) ? `<lastmod>${validDate(row.lastmod)}</lastmod>` : ''}<priority>${row.pri}</priority></url>`).join('\n')}\n</urlset>`
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } })
}

export const config = { path: '/sitemap.xml' }
