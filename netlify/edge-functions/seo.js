// Crawlable metadata and initial, truthful page content for JS and non-JS clients.
// Never publish privileged data or replace search output with unrelated keywords.
const SITE = 'https://zamarket.shop'
const SHOP = 'ZA Market'

const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\s+/g, ' ').trim()
const clip = (s, n = 155) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}
const money = v => `K${Number(v).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Include every public route here so informational pages don't get mistaken for
// unknown vendors (and incorrectly tagged noindex).
const RESERVED = new Set([
  'p', 'search', 'sellers', 'store', 'cart', 'checkout', 'order', 'rate', 'review',
  'login', 'account', 'apply', 'affiliates', 'blog', 'admin', 'sell', 'vendor', 'go', 'r', 'v',
  'free', 'invite', 'saved', 'categories', 'about', 'how-it-works', 'protection',
  'assets', 'favicon.ico', 'robots.txt', 'sitemap.xml',
])
const PRIVATE = new Set(['admin', 'sell', 'vendor', 'cart', 'checkout', 'account', 'login', 'order', 'rate', 'invite', 'go', 'r', 'v', 'review', 'saved'])

async function getOne(path, base, key) {
  try {
    const response = await fetch(`${base}/rest/v1/${path}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return { ok: false, item: null }
    const data = await response.json()
    return { ok: true, item: Array.isArray(data) ? data[0] || null : data }
  } catch { return { ok: false, item: null } }
}

// Schema.org has named types for the trades most of our sellers are in, and a
// named type gives Google more to work with than a generic shop when someone
// searches for "someone who bakes in Lusaka". Only mapped where the category
// makes the trade unambiguous; anything else stays a Store, because claiming
// a business is a bakery when it is not is worse than saying nothing.
const BUSINESS_TYPES = [
  [/bakery|cake|pastry|bread|confection/i, 'Bakery'],
  [/restaurant|takeaway|kitchen|caterer|catering|food/i, 'FoodEstablishment'],
  [/salon|hair|nail|beauty|spa|barber|braid/i, 'HealthAndBeautyBusiness'],
  [/cloth|fashion|tailor|boutique|apparel|wear/i, 'ClothingStore'],
  [/shoe|footwear/i, 'ShoeStore'],
  [/phone|electronic|computer|laptop|gadget/i, 'ElectronicsStore'],
  [/furniture/i, 'FurnitureStore'],
  [/home|decor|interior|household/i, 'HomeGoodsStore'],
  [/garden|nursery|plant/i, 'GardenStore'],
  [/car|motor|vehicle|auto.?repair|mechanic/i, 'AutoRepair'],
  [/florist|flower/i, 'Florist'],
  [/jewel/i, 'JewelryStore'],
  [/driving school|driving lesson/i, 'DrivingSchool'],
  [/school|tuition|college|training|course/i, 'EducationalOrganization'],
  [/photograph|photo studio/i, 'PhotographAction'],
]
const businessType = category => {
  const c = String(category || '')
  for (const [match, type] of BUSINESS_TYPES) if (match.test(c)) return type
  return 'Store'
}

// Sellers type their hours as free text — "Mon-Fri: 8am - 6pm" — which cannot
// be turned into schema.org's strict format without guessing, and a guessed
// opening time sends a customer to a closed door. So the hours are not put in
// the structured data at all; they go into the page text below instead, where
// they are just as findable and cannot be misread as a machine-readable fact.
const hoursText = value => (Array.isArray(value) ? value : [])
  .filter(x => x && x.label && x.hours)
  .map(x => `${String(x.label).trim()}: ${String(x.hours).trim()}`)
  .slice(0, 7)

const paragraph = t => `<p>${esc(clip(t, 4500))}</p>`
const fallback = (heading, description, link = '') => `<main class="seo-fallback"><h1>${esc(heading)}</h1>${paragraph(description)}${link ? `<p><a href="${esc(link)}">View the full page</a></p>` : ''}</main>`

export default async function handler(request, context) {
  const response = await context.next()
  if (!(response.headers.get('content-type') || '').includes('text/html')) return response

  const current = new URL(request.url)
  const parts = current.pathname.split('/').filter(Boolean)
  const base = Deno.env.get('VITE_SUPABASE_URL')
  const key = Deno.env.get('VITE_SUPABASE_ANON_KEY')
  let canonical = SITE + (current.pathname === '/' ? '/' : current.pathname.replace(/\/$/, ''))
  let title = `${SHOP} — Shop online in Lusaka, Zambia`
  let description = 'Browse products from local sellers in Lusaka, Zambia. Compare prices and order phones, fashion, home essentials, food and more on ZA Market.'
  let image = `${SITE}/social.png`
  let robots = parts.length && (PRIVATE.has(parts[0]) || parts[0] === 'search') ? 'noindex,follow' : 'index,follow'
  let schema = null
  let initialContent = ''

  if (!parts.length) {
    schema = {
      '@context': 'https://schema.org', '@type': 'OnlineStore', name: SHOP,
      url: `${SITE}/`, description, areaServed: { '@type': 'City', name: 'Lusaka' },
    }
    initialContent = fallback('Shop products from local sellers in Lusaka', description, `${SITE}/sellers`)
  } else if (parts[0] === 'blog') {
    if (parts.length === 1) {
      title = `Buying guides and local shopping advice in Lusaka | ${SHOP}`
      description = 'Practical ZA Market guides to products, prices and shopping with local sellers in Lusaka, Zambia.'
      canonical = `${SITE}/blog`
      initialContent = fallback('Shopping guides for Lusaka', description, `${SITE}/blog`)
    } else if (parts.length === 2 && base && key) {
      const result = await getOne(`public_posts?slug=eq.${encodeURIComponent(parts[1])}&select=slug,title,excerpt,body,cover_url,meta_title,meta_description,author,published_at`, base, key)
      if (result.ok && !result.item) robots = 'noindex,follow'
      if (result.item) {
        const post = result.item
        canonical = `${SITE}/blog/${encodeURIComponent(post.slug)}`
        title = post.meta_title || `${post.title} | ${SHOP}`
        description = clip(post.meta_description || post.excerpt || post.body, 155)
        if (typeof post.cover_url === 'string' && /^https:\/\//i.test(post.cover_url)) image = post.cover_url
        schema = {
          '@context': 'https://schema.org', '@type': 'Article', headline: post.title,
          description, mainEntityOfPage: canonical,
          author: { '@type': 'Organization', name: post.author || SHOP },
          publisher: { '@type': 'Organization', name: SHOP },
          datePublished: post.published_at || undefined,
          image: image !== `${SITE}/social.png` ? image : undefined,
        }
        // Initial HTML is visible to all visitors, not just crawlers. React
        // replaces this fallback when JS starts; content stays consistent.
        const plainBody = String(post.body || '').replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
          .replace(/\[video\]\([^)]+\)/gi, 'Video included in the article.')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/[#*`>]/g, '').replace(/\n+/g, ' ')
        initialContent = fallback(post.title, plainBody || post.excerpt || '', canonical)
      }
    }
  } else if (parts[0] === 'search') {
    canonical = `${SITE}/search`
  } else if (parts[0] === 'sellers') {
    title = `Local sellers and shops in Lusaka | ${SHOP}`
    description = 'Find and compare local shops and sellers on ZA Market in Lusaka, Zambia.'
    initialContent = fallback('Explore local sellers in Lusaka', description, `${SITE}/sellers`)
  } else if (parts[0] === 'affiliates') {
    title = 'Become a ZA Market Affiliate in Zambia | Apply & Learn'
    description = 'Join the ZA Market affiliate programme in Zambia. Learn to promote products and earn commission on qualifying completed sales. No salary or guaranteed earnings.'
    canonical = `${SITE}/affiliates`
    initialContent = fallback('Become a ZA Market Affiliate in Zambia', description, `${SITE}/affiliates`)
  } else if (parts[0] === 'apply' && parts[1] === 'vendor') {
    title = `Sell your products on ZA Market | Join as a vendor`
    description = 'Apply to sell through ZA Market, a local online marketplace connecting businesses and shoppers in Zambia.'
    initialContent = fallback('Become a ZA Market vendor', description, `${SITE}/apply/vendor`)
  } else if (parts[0] === 'apply' && parts[1] === 'reseller') {
    title = `Earn by promoting ZA Market products | Become a reseller`
    description = 'Learn how to apply as a ZA Market reseller and promote local products to potential customers in Zambia.'
    initialContent = fallback('Apply as a ZA Market reseller', description, `${SITE}/apply/reseller`)
  } else if (parts[0] === 'how-it-works') {
    title = `How buying on ZA Market works | ${SHOP}`
    description = 'Learn how to find products, order and arrange delivery through ZA Market in Lusaka.'
  } else if (parts[0] === 'about') {
    title = `About ZA Market — Local marketplace in Zambia`
    description = 'Learn more about ZA Market, the marketplace connecting customers with local sellers in Zambia.'
  } else if (parts[0] === 'categories') {
    title = `Shop product categories in Lusaka | ${SHOP}`
  } else if (parts[0] === 'protection') {
    title = `Customer protection and buying safely | ${SHOP}`
  }

  if (base && key && parts[0] !== 'blog' && parts[0] !== 'search') {
    const productSlug = parts[0] === 'p' && parts.length === 2 ? parts[1]
      : parts.length === 2 && !RESERVED.has(parts[0]) ? parts[1] : null
    const vendorSlug = parts[0] === 'store' && parts.length === 2 ? parts[1]
      : parts.length === 1 && !RESERVED.has(parts[0]) ? parts[0] : null

    if (productSlug) {
      const { ok, item: p } = await getOne(`public_products?slug=eq.${encodeURIComponent(productSlug)}&select=name,description,price,images,category,vendor_name,rating,review_count,fulfilment,offering_type,page,slug,vendor_slug`, base, key)
      // A temporary Supabase failure MUST NOT mark all catalogue pages noindex.
      if (ok && !p) robots = 'noindex,follow'
      if (p) {
        canonical = p.vendor_slug ? `${SITE}/${p.vendor_slug}/${p.slug}` : `${SITE}/p/${p.slug}`
        title = p.page?.seo?.title || `${p.name}${Number.isFinite(Number(p.price)) ? ` — ${money(p.price)}` : ''} | ${SHOP}`
        description = clip(p.page?.seo?.description || p.description || `${p.name} on ZA Market, Lusaka, Zambia.`)
        if (typeof p.images?.[0] === 'string' && /^https:\/\//i.test(p.images[0])) image = p.images[0]
        schema = {
          '@context': 'https://schema.org', '@type': 'Product', name: p.name,
          description: clip(p.description || p.name, 300),
          image: (p.images || []).filter(x => typeof x === 'string' && /^https:\/\//i.test(x)),
          category: p.category || undefined,
          brand: p.vendor_name ? { '@type': 'Brand', name: p.vendor_name } : undefined,
          offers: Number.isFinite(Number(p.price)) && Number(p.price) >= 0
            ? { '@type': 'Offer', url: canonical, price: Number(p.price), priceCurrency: 'ZMW' }
            : undefined,
          aggregateRating: Number(p.rating) > 0 && Number(p.review_count) > 0
            ? { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.review_count }
            : undefined,
        }
        initialContent = fallback(p.name, p.description || `${p.name} available from ${p.vendor_name || 'a local seller'} on ZA Market.`, canonical)
      }
    } else if (vendorSlug) {
      const { ok, item: v } = await getOne(`public_vendors?slug=eq.${encodeURIComponent(vendorSlug)}&select=business_name,description,about,tagline,category,town,rating,review_count,slug,logo_url,cover_url,opening_hours`, base, key)
      if (ok && !v) robots = 'noindex,follow'
      if (v) {
        canonical = `${SITE}/${v.slug}`
        title = `${v.business_name}${v.town ? ` — ${v.town}` : ''} | ${SHOP}`
        description = clip(v.description || v.tagline || v.about || `Order from ${v.business_name} on ZA Market.`)
        // The seller's own picture, so sharing a shop link shows THEIR shop
        // and not our logo. Their cover first, then their mark; the generic
        // ZA Market image only when they have uploaded neither.
        const vendorPic = [v.cover_url, v.logo_url].find(x => typeof x === 'string' && /^https:\/\//i.test(x))
        if (vendorPic) image = vendorPic
        // A more specific business type than "Store", so a search for someone
        // who bakes can match a bakery rather than a generic shop. Falls back
        // to Store when the trade is not one we can name confidently — a
        // wrong type is worse than a general one.
        schema = {
          '@context': 'https://schema.org', '@type': businessType(v.category),
          name: v.business_name, url: canonical, description,
          image: vendorPic || undefined,
          address: { '@type': 'PostalAddress', addressLocality: v.town || 'Lusaka', addressCountry: 'ZM' },
          areaServed: { '@type': 'City', name: v.town || 'Lusaka' },
          aggregateRating: Number(v.rating) > 0 && Number(v.review_count) > 0
            ? { '@type': 'AggregateRating', ratingValue: v.rating, reviewCount: v.review_count } : undefined,
        }
        // What a crawler sees before any JavaScript runs. The trade, the
        // area and the hours in plain words, because that is what someone
        // searching "who bakes cakes in Kabwata" is actually matching.
        const hrs = hoursText(v.opening_hours)
        initialContent = fallback(v.business_name, description, canonical)
          .replace('</main>', `${v.category ? paragraph(`${v.business_name} is a ${String(v.category).toLowerCase()} business${v.town ? ` in ${v.town}` : ''}, Zambia, selling on ZA Market.`) : ''}${hrs.length ? `<p>Opening hours — ${esc(hrs.join('; '))}</p>` : ''}</main>`)
      }
    }
  }

  const ogType = schema?.['@type'] === 'Article' ? 'article' : schema?.['@type'] === 'Product' ? 'product' : 'website'
  const head = `
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${esc(canonical)}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:site_name" content="${SHOP}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:locale" content="en_ZM" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(image)}" />
    ${schema ? `<script type="application/ld+json" data-zm-edge-jsonld="true" data-zm-edge-path="${esc(current.pathname)}">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>` : ''}`

  let html = await response.text()
  html = html
    .replace(/<title>[^<]*<\/title>/gi, '')
    .replace(/<meta\s+name=["'](?:description|robots)["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace('</head>', `${head}</head>`)
  if (initialContent) html = html.replace('<div id="root"></div>', `<div id="root">${initialContent}</div>`)
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('content-encoding')
  headers.set('content-type', 'text/html; charset=utf-8')
  headers.set('cache-control', 'public, max-age=120')
  return new Response(html, { status: response.status, headers })
}

export const config = { path: '/*', excludedPath: ['/assets/*', '/*.png', '/*.jpg', '/*.svg', '/*.ico', '/*.xml', '/*.txt'] }
