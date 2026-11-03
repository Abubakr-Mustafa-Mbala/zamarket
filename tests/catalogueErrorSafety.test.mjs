import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../src/pages/public/Marketplace.jsx', import.meta.url), 'utf8')
test('catalogue errors do not expose backend error messages to customers', () => {
  assert.match(source, /setError\('We could not connect to the marketplace\. Please try again\.'\)/)
  assert.doesNotMatch(source, /setError\(e\.message/)
  assert.doesNotMatch(source, /<p>\{error\} Your connection/)
})
