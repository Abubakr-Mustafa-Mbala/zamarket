import test from 'node:test'
import assert from 'node:assert/strict'
import edge from '../netlify/edge-functions/seo.js'
const saved = { fetch: globalThis.fetch, Deno: globalThis.Deno }
const mockHtml = '<!doctype html><html><head><title>Generic</title><meta name="description" content="default"></head><body><div id="root"></div></body></html>'
const context = { next: async () => new Response(mockHtml, { headers: { 'content-type': 'text/html' } }) }

test('published article gets canonical title, Article JSON-LD and visible fallback', async () => {
  globalThis.Deno = { env: { get: name => name === 'VITE_SUPABASE_URL' ? 'https://example.supabase.co' : 'anon' } }
  globalThis.fetch = async () => new Response(JSON.stringify([{ slug: 'buy-lamps', title: 'Where to buy lamps in Lusaka', body: 'Light choices and sizing.', excerpt: 'Choose the right lamp.', cover_url: 'https://cdn.example/lamp.jpg', published_at: '2026-11-01', author: 'ZA Market' }]), { status: 200 })
  try {
    const res = await edge(new Request('https://preview.netlify.app/blog/buy-lamps'), context)
    const html = await res.text()
    assert.match(html, /rel="canonical" href="https:\/\/zamarket\.shop\/blog\/buy-lamps"/)
    assert.match(html, /"@type":"Article"/)
    assert.match(html, /<h1>Where to buy lamps in Lusaka<\/h1>/)
    assert.match(html, /og:type" content="article"/)
    assert.equal((html.match(/name="description"/g) || []).length, 1)
  } finally { Object.assign(globalThis, saved) }
})

test('failed API request does not cause mass deindexing', async () => {
  globalThis.Deno = { env: { get: name => name === 'VITE_SUPABASE_URL' ? 'https://example.supabase.co' : 'anon' } }
  globalThis.fetch = async () => { throw new Error('Database down') }
  try {
    const html = await (await edge(new Request('https://zamarket.shop/p/blue-shoes'), context)).text()
    assert.match(html, /name="robots" content="index,follow"/)
    assert.match(html, /rel="canonical" href="https:\/\/zamarket\.shop\/p\/blue-shoes"/)
  } finally { Object.assign(globalThis, saved) }
})

test('public informational route is not mistaken for invalid vendor', async () => {
  globalThis.Deno = { env: { get: name => name === 'VITE_SUPABASE_URL' ? 'https://example.supabase.co' : 'anon' } }
  globalThis.fetch = async () => new Response('[]', { status: 200 })
  try {
    const html = await (await edge(new Request('https://zamarket.shop/about'), context)).text()
    assert.match(html, /name="robots" content="index,follow"/)
    assert.match(html, /About ZA Market/)
  } finally { Object.assign(globalThis, saved) }
})
