import test from 'node:test'
import assert from 'node:assert/strict'

test('sitemap uses canonical domain, deduplicates and ignores invalid dates', async () => {
  const original = globalThis.fetch
  const oldUrl = process.env.VITE_SUPABASE_URL
  const oldKey = process.env.VITE_SUPABASE_ANON_KEY
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'test'
  const { default: sitemap } = await import(`../netlify/functions/sitemap.js?test=${Date.now()}`)
  globalThis.fetch = async (url) => {
    const rows = String(url).includes('public_products') ? [{slug:'blue-shoes',vendor_slug:'store-a',created_at:'invalid'}] : String(url).includes('public_vendors') ? [{slug:'store-a'}] : [{slug:'hello',published_at:'2026-10-01'}]
    return {ok:true,json:async()=>rows}
  }
  try {
    const res = await sitemap(new Request('https://preview.example.com/sitemap.xml'))
    const xml = await res.text()
    assert.match(xml, /https:\/\/zamarket\.shop\/store-a\/blue-shoes/)
    assert.doesNotMatch(xml, /preview\.example\.com|Invalid Date|<lastmod>NaN/)
    assert.doesNotMatch(xml, /search\?cat=/)
    assert.match(xml, /<lastmod>2026-10-01<\/lastmod>/)
  } finally {
    globalThis.fetch = original
    if (oldUrl === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = oldKey
  }
})
