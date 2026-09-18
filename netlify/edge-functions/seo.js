// Search engines and WhatsApp read the HTML before the app starts, so the page
// title, description and share image have to be in the HTML itself.
// This runs at the edge, fills them in per page, and leaves the app untouched.

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n+/g, ' ').trim()

const clip = (s, n = 155) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : `${t.slice(0, n - 1).replace(/[,.;:\s]\w*$/, '')}…`
}

const money = (v) => `K${Number(v || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const RESERVED = new Set(['p', 'search', 'sellers', 'store', 'cart', 'checkout', 'order', 'rate', 'review', 'login', 'account', 'apply', 'admin', 'sell', 'vendor', 'go', 'r', 'free', 'invite', 'assets', 'favicon.ico', 'robots.txt', 'sitemap.xml'])

async function api(path, url, key) {
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, authorization: `Bearer ${key}` } })
    if (!res.ok) return null
    const rows = await res.json()
    return Array.isArray(rows) ? rows[0] || null : rows
  } catch { return null }
}

export default async function handler(request, context) {
  const res = await context.next()
  const type = res.headers.get('content-type') || ''
  if (!type.includes('text/html')) return res

  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const SB = Deno.env.get('VITE_SUPABASE_URL')
  const KEY = Deno.env.get('VITE_SUPABASE_ANON_KEY')
  const site = url.origin
  const shop = Deno.env.get('SITE_NAME') || 'ZaMarket'

  let title = `${shop} — buy online in Lusaka, Zambia`
  let description = 'Shop phones, home goods, fashion, food made to order and local services in Lusaka. Order online, we confirm by phone, and you pay when you receive it.'
  let image = `${site}/social.png`
  let canonical = site + url.pathname
  let jsonld = null
  let robots = 'index,follow'

  const noIndex = ['admin', 'sell', 'vendor', 'cart', 'checkout', 'account', 'login', 'order', 'rate', 'invite', 'go', 'r']
  if (parts[0] && noIndex.includes(parts[0])) robots = 'noindex,follow'

  if (SB && KEY) {
    try {
      // A product: /p/<slug>  or  /<store>/<product>
      const productSlug = parts[0] === 'p' ? parts[1] : (parts.length === 2 && !RESERVED.has(parts[0]) ? parts[1] : null)
      const storeSlug = parts[0] === 'store' ? parts[1] : (parts.length >= 1 && !RESERVED.has(parts[0]) ? parts[0] : null)

      if (productSlug) {
        const p = await api(`public_products?slug=eq.${encodeURIComponent(productSlug)}&select=name,description,price,images,category,vendor_name,rating,review_count,fulfilment,offering_type,page,slug,vendor_slug`, SB, KEY)
        if (p) {
          const what = p.fulfilment === 'service' ? 'Book' : 'Buy'
          title = p.page?.seo?.title || `${p.name} — ${money(p.price)} | ${shop} Lusaka`
          description = clip(p.page?.seo?.description || p.page?.hero_headline || p.description || `${what} ${p.name} in Lusaka for ${money(p.price)}. ${p.vendor_name ? `Sold by ${p.vendor_name}. ` : ''}Delivery in Lusaka District, other areas arranged. Pay when you receive it.`)
          if (p.images?.[0]) image = p.images[0]
          canonical = p.vendor_slug ? `${site}/${p.vendor_slug}/${p.slug}` : `${site}/p/${p.slug}`
          jsonld = {
            '@context': 'https://schema.org', '@type': 'Product', name: p.name,
            description: clip(p.description || p.page?.hero_headline || p.name, 300),
            image: p.images?.length ? p.images : undefined, category: p.category || undefined,
            brand: p.vendor_name ? { '@type': 'Brand', name: p.vendor_name } : undefined,
            offers: { '@type': 'Offer', price: Number(p.price), priceCurrency: 'ZMW', availability: 'https://schema.org/InStock', url: canonical, areaServed: 'Lusaka, Zambia' },
            aggregateRating: p.rating ? { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.review_count } : undefined,
          }
        }
      } else if (storeSlug) {
        const v = await api(`public_vendors?slug=eq.${encodeURIComponent(storeSlug)}&select=business_name,description,category,town,rating,review_count,slug`, SB, KEY)
        if (v) {
          title = `${v.business_name} — ${v.category || 'Seller'} in ${v.town || 'Lusaka'} | ${shop}`
          description = clip(v.description || `Shop ${v.business_name} on ${shop}. ${v.category || ''} in ${v.town || 'Lusaka'}, Zambia. Order online and pay when you receive it.`)
          canonical = `${site}/${v.slug}`
          jsonld = {
            '@context': 'https://schema.org', '@type': 'Store', name: v.business_name,
            description: clip(v.description || v.business_name, 300), url: canonical,
            address: { '@type': 'PostalAddress', addressLocality: v.town || 'Lusaka', addressCountry: 'ZM' },
            aggregateRating: v.rating ? { '@type': 'AggregateRating', ratingValue: v.rating, reviewCount: v.review_count } : undefined,
          }
        }
      } else if (parts[0] === 'free' && parts[1]) {
        const m = await api(`public_magnets?slug=eq.${encodeURIComponent(parts[1])}&select=name,headline,description`, SB, KEY)
        if (m) {
          title = `${m.headline} | ${shop}`
          description = clip(m.description || m.name)
          robots = 'noindex,follow'
        }
      } else if (parts[0] === 'search') {
        const cat = url.searchParams.get('cat')
        const qq = url.searchParams.get('q')
        if (cat) { title = `${cat} in Lusaka | ${shop}`; description = clip(`Buy ${cat.toLowerCase()} online in Lusaka. Delivery in Lusaka District, other areas arranged. Pay when you receive it.`); canonical = `${site}/search?cat=${encodeURIComponent(cat)}` }
        else if (qq) { title = `${qq} in Lusaka | ${shop}`; robots = 'noindex,follow' }
      } else if (parts.length === 0) {
        jsonld = {
          '@context': 'https://schema.org', '@type': 'OnlineStore', name: shop, url: site,
          description, areaServed: { '@type': 'City', name: 'Lusaka' },
          potentialAction: { '@type': 'SearchAction', target: `${site}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
        }
      }
    } catch { /* fall back to the defaults */ }
  }

  const head = `
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${esc(canonical)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(shop)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:locale" content="en_ZM" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(image)}" />
    ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
  `

  const html = (await res.text())
    .replace(/<title>.*?<\/title>/i, '')
    .replace('</head>', `${head}</head>`)

  return new Response(html, { status: res.status, headers: { ...Object.fromEntries(res.headers), 'content-type': 'text/html; charset=utf-8' } })
}

export const config = { path: '/*', excludedPath: ['/assets/*', '/*.png', '/*.jpg', '/*.svg', '/*.ico', '/*.xml', '/*.txt'] }
