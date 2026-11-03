import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../src/pages/public/Marketplace.jsx', import.meta.url), 'utf8')
test('catalogue rejects partial Supabase failures instead of showing an empty shop', () => {
  assert.match(source, /fetchCataloguePages\(/)
  assert.match(source, /Promise\.all\(\[/)
})
test('catalogue provides explicit retry and avoids caching failed responses', () => {
  assert.match(source, /catalogueRequest = \(async \(\) =>/)
  assert.match(source, /\.finally\(\(\) => \{ catalogueRequest = null \}\)/)
  assert.match(source, /retry: \(\) => setAttempt/)
  assert.match(source, /role="alert"/)
})
