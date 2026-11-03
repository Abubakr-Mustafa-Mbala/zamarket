import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../netlify/edge-functions/seo.js'

const originalDeno = globalThis.Deno
const originalFetch = globalThis.fetch
const context = { next: async () => new Response('<html><head><title>ZA Market</title><meta name="description" content="fallback" /><link rel="canonical" href="https://zamarket.shop/" /></head><body>App</body></html>', { headers: { 'content-type': 'text/html' } }) }

test('edge SEO uses production canonical, removes duplicate metadata, and hides unknown product', async () => {
  globalThis.Deno = { env: { get: k => ({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' })[k] } }
  globalThis.fetch = async () => new Response('[]', { status: 200 })
  try {
    const response = await handler(new Request('https://deploy-preview-1.netlify.app/p/nonexistent'), context)
    const html = await response.text()
    assert.match(html, /name="robots" content="noindex,follow"/)
    assert.match(html, /rel="canonical" href="https:\/\/zamarket.shop\/p\/nonexistent"/)
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1)
    assert.equal((html.match(/name="description"/g) || []).length, 1)
  } finally { globalThis.Deno = originalDeno; globalThis.fetch = originalFetch }
})

test('edge SEO leaves non-HTML responses untouched', async () => {
  const response = new Response('asset', { headers: { 'content-type': 'text/plain' } })
  const result = await handler(new Request('https://zamarket.shop/test'), { next: async () => response })
  assert.equal(result, response)
})
