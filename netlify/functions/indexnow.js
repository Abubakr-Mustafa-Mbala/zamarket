// Optional, authenticated publishing notification for Bing and other IndexNow
// participants. This is not used by Google; Google uses Search Console/sitemaps.
const SITE = 'https://zamarket.shop'
const fail = (status, message) => new Response(JSON.stringify({ message }), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
})

export default async function indexNow(request) {
  if (request.method !== 'POST') return fail(405, 'Method not allowed')
  const sb = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  const secret = process.env.INDEXNOW_KEY
  if (!sb || !anon || !secret || !/^[a-z0-9-]{8,128}$/i.test(secret)) return fail(503, 'IndexNow is not configured')

  // Never trust a client-provided hostname or submit pages on other domains.
  let path
  try { ({ path } = await request.json()) } catch { return fail(400, 'Invalid JSON') }
  const parts = typeof path === 'string' ? path.split('/').filter(Boolean) : []
  if (typeof path !== 'string' || !path.startsWith('/') || parts.length < 1 || parts.length > 2 ||
    !parts.every(p => /^[a-z0-9][a-z0-9_-]{0,140}$/i.test(p))) {
    return fail(400, 'Submit an internal article, product or store path')
  }
  let table, filter
  if (parts[0] === 'blog' && parts.length === 2) {
    table = 'public_posts'; filter = `slug=eq.${encodeURIComponent(parts[1])}`
  } else if (parts[0] === 'p' && parts.length === 2) {
    table = 'public_products'; filter = `slug=eq.${encodeURIComponent(parts[1])}`
  } else if (parts.length === 2 && parts[0] !== 'blog' && parts[0] !== 'p') {
    table = 'public_products'; filter = `slug=eq.${encodeURIComponent(parts[1])}&vendor_slug=eq.${encodeURIComponent(parts[0])}`
  } else if (parts.length === 1 && !['admin', 'checkout', 'cart', 'login', 'search', 'account'].includes(parts[0])) {
    table = 'public_vendors'; filter = `slug=eq.${encodeURIComponent(parts[0])}`
  } else return fail(400, 'A published article, product or store is required')

  const token = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return fail(401, 'Sign in to publish')
  try {
    // Validate the JWT with Supabase Auth, then the role with database policy.
    const auth = await fetch(`${sb}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!auth.ok) return fail(401, 'Sign-in expired')
    const role = await fetch(`${sb}/rest/v1/rpc/can_market`, {
      method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(5000),
    })
    if (!role.ok || await role.json() !== true) return fail(403, 'Marketing permission required')

    // Do not announce unpublished drafts, even when a user guesses their slug.
    const published = await fetch(`${sb}/rest/v1/${table}?select=slug&${filter}&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!published.ok || !(await published.json()).length) return fail(409, 'This URL is not publicly published')

    const params = new URLSearchParams({ url: SITE + path, key: secret, keyLocation: `${SITE}/indexnow-key.txt` })
    const result = await fetch(`https://api.indexnow.org/indexnow?${params}`, { signal: AbortSignal.timeout(7000) })
    if (result.status !== 200 && result.status !== 202) return fail(502, `Search engine rejected the submission (${result.status})`)
    return new Response(JSON.stringify({ accepted: true }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  } catch { return fail(503, 'Indexing service is temporarily unavailable') }
}
