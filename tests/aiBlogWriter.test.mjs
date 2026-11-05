import test from 'node:test'
import assert from 'node:assert/strict'
import aiBlog, { extractResponseText, normalizeDraft } from '../netlify/functions/ai-blog.js'

const endpoint = 'https://zamarket.shop/.netlify/functions/ai-blog'
const post = (payload, token) => new Request(endpoint, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(payload),
})
const env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-anon', OPENAI_API_KEY: 'only-for-test' }
const draft = {
  title: 'How to choose a commercial fryer in Lusaka', body: '## What to consider\n\nConsider capacity and available space.\n\n## Questions to ask\n\nCheck specifications.',
  excerpt: 'Practical fryer buying advice.', keyword: 'commercial fryer in Lusaka',
  meta_title: 'Commercial fryer guide for Lusaka buyers',
  meta_description: 'A short guide to fryer capacity, delivery and practical considerations.',
  category: 'Buying guides', fact_checks: ['Confirm product capacity with the vendor'],
}

test('AI writer has no public generation endpoint and rejects missing configuration', async () => {
  const prev = { ...process.env }
  try {
    delete process.env.OPENAI_API_KEY
    assert.equal((await aiBlog(post({ mode: 'draft', keyword: 'cake' }, 'fake'))).status, 503)
    Object.assign(process.env, env)
    assert.equal((await aiBlog(new Request(endpoint, { method: 'GET' }))).status, 405)
    assert.equal((await aiBlog(post({ mode: 'draft', keyword: 'cake' }))).status, 401)
    assert.equal((await aiBlog(post({ mode: 'draft' }, 'fake'))).status, 400)
    assert.equal((await aiBlog(post({ mode: 'improve', body: 'short' }, 'fake'))).status, 400)
  } finally { process.env = prev }
})

test('AI writer validates staff, quotas, and sends only checked product details to model', async () => {
  const prev = { ...process.env }
  const oldFetch = globalThis.fetch
  const seen = []
  try {
    Object.assign(process.env, env)
    let staff = false
    let quota = true
    globalThis.fetch = async (url, options = {}) => {
      seen.push({ url: String(url), options })
      if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'staff' })
      if (String(url).endsWith('/rpc/can_market')) return Response.json(staff)
      if (String(url).endsWith('/rpc/claim_ai_blog_generation')) return Response.json(quota)
      if (String(url).includes('/public_products?')) return Response.json([{ name: 'Commercial fryer', slug: 'fryer', vendor_slug: 'shop', price: 1000, description: 'Stainless steel fryer', category: 'Kitchen', benefits: ['two tanks'], fulfilment: 'delivery', stock_available: 2 }])
      if (String(url).includes('/v1/responses')) return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }] })
      throw Error(`unexpected request ${url}`)
    }
    const p = { mode: 'draft', keyword: 'fryers in Lusaka', product_ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }
    assert.equal((await aiBlog(post(p, 'valid'))).status, 403)
    staff = true
    quota = false
    assert.equal((await aiBlog(post(p, 'valid'))).status, 429)
    quota = true
    const result = await aiBlog(post(p, 'valid'))
    assert.equal(result.status, 200)
    assert.equal((await result.json()).draft.title, draft.title)
    const aiCall = seen.find(row => row.url.includes('/v1/responses'))
    assert.ok(aiCall)
    const data = JSON.parse(aiCall.options.body)
    assert.equal(data.store, false)
    // The default must be a model that is actually current; the name is
    // overridable from Netlify so a rename needs no code change.
    assert.equal(data.model, 'gpt-6-luna')
    assert.ok(data.instructions.includes('Do not invent'))
    assert.match(data.input, /Commercial fryer/)
    assert.equal(data.text.format.type, 'json_schema')
  } finally { process.env = prev; globalThis.fetch = oldFetch }
})

test('rejects malformed or unusable generated articles', () => {
  assert.equal(extractResponseText({ output_text: 'hello' }), 'hello')
  assert.throws(() => normalizeDraft({ title: 'a', body: '' }), /incomplete article|usable article/)
  assert.equal(normalizeDraft(draft).fact_checks.length, 1)
  assert.throws(() => normalizeDraft({ ...draft, body: 'x'.repeat(25000) }), /usable article/)
})
