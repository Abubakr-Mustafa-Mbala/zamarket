// A sitemap Google can read, built fresh from what is published right now.
const SB = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY

const get = async (path) => {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } })
  return res.ok ? res.json() : []
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

export default async (request) => {
  const site = new URL(request.url).origin
  const urls = [
    { loc: `${site}/`, pri: '1.0', freq: 'daily' },
    { loc: `${site}/search`, pri: '0.6', freq: 'daily' },
    { loc: `${site}/sellers`, pri: '0.5', freq: 'weekly' },
    { loc: `${site}/apply/vendor`, pri: '0.4', freq: 'monthly' },
    { loc: `${site}/apply/reseller`, pri: '0.4', freq: 'monthly' },
  ]
  if (SB && KEY) {
    const [products, vendors, departments] = await Promise.all([
      get('public_products?select=slug,vendor_slug,created_at&order=created_at.desc&limit=2000'),
      get('public_vendors?select=slug&limit=500'),
      get('settings?key=eq.departments&select=value'),
    ])
    for (const p of products) {
      if (!p.slug) continue
      urls.push({ loc: p.vendor_slug ? `${site}/${p.vendor_slug}/${p.slug}` : `${site}/p/${p.slug}`, pri: '0.8', freq: 'weekly', lastmod: p.created_at })
    }
    for (const v of vendors) if (v.slug) urls.push({ loc: `${site}/${v.slug}`, pri: '0.7', freq: 'weekly' })
    for (const d of (departments?.[0]?.value || [])) if (d?.name) urls.push({ loc: `${site}/search?cat=${encodeURIComponent(d.name)}`, pri: '0.6', freq: 'weekly' })
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>`
  return new Response(xml, { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' } })
}

export const config = { path: '/sitemap.xml' }
