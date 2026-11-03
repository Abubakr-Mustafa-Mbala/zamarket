import test from 'node:test'
import assert from 'node:assert/strict'
import endpoint from '../netlify/functions/indexnow.js'

test('IndexNow submission requires valid configuration and authenticated user', async () => {
  const previous = { ...process.env }
  try {
    delete process.env.INDEXNOW_KEY
    let response = await endpoint(new Request('https://zamarket.shop/.netlify/functions/indexnow', { method: 'POST', body: '{}' }))
    assert.equal(response.status, 503)
    process.env.INDEXNOW_KEY = 'Zm-Indexer-Example-Only-2026'
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
    process.env.VITE_SUPABASE_ANON_KEY = 'anon'
    response = await endpoint(new Request('https://zamarket.shop/.netlify/functions/indexnow', { method: 'POST', body: JSON.stringify({ path: '/blog/post' }) }))
    assert.equal(response.status, 401)
    response = await endpoint(new Request('https://zamarket.shop/.netlify/functions/indexnow', { method: 'POST', body: JSON.stringify({ path: 'https://another.example/article' }), headers: { authorization: 'Bearer test' } }))
    assert.equal(response.status, 400)
  } finally { process.env = previous }
})
