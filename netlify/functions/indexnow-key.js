// IndexNow verifies this public key document at https://zamarket.shop/indexnow-key.txt.
// Set INDEXNOW_KEY as a Netlify environment variable before enabling submissions.
export default async function keyFile() {
  const key = process.env.INDEXNOW_KEY
  if (!key || !/^[a-z0-9-]{8,128}$/i.test(key)) return new Response('Not configured', { status: 503 })
  return new Response(key, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' } })
}
export const config = { path: '/indexnow-key.txt' }
