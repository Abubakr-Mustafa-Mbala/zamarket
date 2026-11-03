import test from 'node:test'
import assert from 'node:assert/strict'

test('sitemap walks beyond first 500 published products', async () => {
  const old = globalThis.fetch
  const oldUrl = process.env.VITE_SUPABASE_URL
  const oldKey = process.env.VITE_SUPABASE_ANON_KEY
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'test'
  let pageTwo = false
  globalThis.fetch = async url => {
    const value = String(url)
    if (value.includes('public_products')) {
      if (value.includes('offset=500')) {
        pageTwo = true
        return new Response(JSON.stringify([{ slug: 'product-501', created_at: '2026-11-02' }]), { status: 200 })
      }
      return new Response(JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ slug: `product-${i+1}`, created_at: '2026-10-31' }))), { status: 200 })
    }
    return new Response('[]', { status: 200 })
  }
  try {
    const { default: handler } = await import(`../netlify/functions/sitemap.js?pagination=${Math.random()}`)
    const response = await handler()
    const xml = await response.text()
    assert.equal(response.status, 200)
    assert.equal(pageTwo, true)
    assert.match(xml, /https:\/\/zamarket\.shop\/p\/product-501/)
    assert.match(xml, /https:\/\/zamarket\.shop\/apply\/vendor/)
  } finally {
    globalThis.fetch = old
    if (oldUrl === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = oldKey
  }
})
