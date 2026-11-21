// The page WhatsApp, Facebook and others read when a car link is shared:
// zamarket.shop/car/<slug>. It carries the car's own title, price and first
// photo, then sends people straight on to the full car page (/p/<slug>),
// keeping ?src= and other tags so the visit is still counted to the right post.
import { vehicleOf, vehicleTitle, priceNote, km } from '../../src/lib/vehicle.js'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '../edge-env.js'

const SITE = 'https://zamarket.shop'
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const money = (v) => `K${Math.round(Number(v) || 0).toLocaleString('en-US')}`

async function lookup(slug) {
  const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || PUBLIC_SUPABASE_URL
  const keys = [process.env.VITE_SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean)
  if (!base || !keys.length) return { car: null, why: 'no-config' }
  let why = ''
  for (const key of keys) {
    try {
      // public_products only ever holds published listings, whichever key reads it.
      const res = await fetch(`${base}/rest/v1/public_products?slug=eq.${encodeURIComponent(slug)}&select=name,description,price,images,slug,offering_type,page,vendor_name&limit=1`, {
        headers: /^eyJ/.test(key) ? { apikey: key, authorization: `Bearer ${key}` } : { apikey: key },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) { why = `http-${res.status}`; continue }
      const rows = await res.json()
      return { car: Array.isArray(rows) ? rows[0] || null : null, why: 'ok' }
    } catch (e) { why = `error-${e?.name || 'fetch'}` }
  }
  return { car: null, why }
}

export function carMeta(p) {
  const v = vehicleOf(p)
  const name = vehicleTitle(v, p.name)
  const note = priceNote(v)
  const price = Number(p.price) > 0 ? money(p.price) : ''
  const title = `${name}${price ? ` — ${price}` : ''} | ZaMarket Motors`
  const facts = [v.mileage_km && km(v.mileage_km), v.transmission, v.fuel, v.engine, v.location].filter(Boolean)
  const description = `${price ? `${price}${note ? ` (${note})` : ''}. ` : ''}${facts.join(' · ')}${facts.length ? '. ' : ''}Photos, full details and enquiries on ZaMarket Motors.`.slice(0, 280)
  const image = (p.images || []).find((x) => typeof x === 'string' && /^https:\/\//i.test(x)) || `${SITE}/social.png`
  return { title, description, image }
}

export function carPage({ slug, search, meta }) {
  // ?r=CODE is an affiliate's link: open it through /r/ so they get the credit.
  const q = new URLSearchParams(search || '')
  const ref = (q.get('r') || '').replace(/[^\w-]/g, '').slice(0, 40)
  q.delete('r')
  const rest = q.toString() ? `?${q}` : ''
  const target = ref ? `/r/${ref}/${encodeURIComponent(slug)}${rest}` : `/p/${encodeURIComponent(slug)}${rest}`
  const m = meta || { title: 'ZaMarket Motors — cars for sale in Zambia', description: 'Photos, full details and enquiries on ZaMarket Motors.', image: `${SITE}/social.png` }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(m.title)}</title>
<meta name="description" content="${esc(m.description)}">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${SITE}/p/${esc(encodeURIComponent(slug))}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="ZaMarket">
<meta property="og:title" content="${esc(m.title)}">
<meta property="og:description" content="${esc(m.description)}">
<meta property="og:image" content="${esc(m.image)}">
<meta property="og:url" content="${SITE}/car/${esc(encodeURIComponent(slug))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(m.title)}">
<meta name="twitter:description" content="${esc(m.description)}">
<meta name="twitter:image" content="${esc(m.image)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)})</script>
</head><body style="background:#0E1013;color:#fff;font-family:system-ui;padding:24px"><p>Opening the car… <a style="color:#A892FF" href="${esc(target)}">Tap here if it does not open</a>.</p></body></html>`
}

export default async function carShare(request, context) {
  const url = new URL(request.url)
  const slug = (context?.params?.slug || url.pathname.split('/').filter(Boolean)[1] || '').slice(0, 200)
  if (!slug) return Response.redirect(`${SITE}/motors`, 302)
  const { car, why } = await lookup(slug)
  const meta = car ? carMeta(car) : null
  return new Response(carPage({ slug, search: url.search, meta }), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-zm-lookup': why },
  })
}

export const config = { path: '/car/:slug' }
