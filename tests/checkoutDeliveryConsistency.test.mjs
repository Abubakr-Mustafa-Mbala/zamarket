import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const checkout = readFileSync(new URL('../src/pages/public/Checkout.jsx', import.meta.url), 'utf8')
const shop = readFileSync(new URL('../src/lib/departments.js', import.meta.url), 'utf8')
test('checkout uses shared settings-based local delivery fee instead of a second independent request', () => {
  assert.match(checkout, /const localFee = shop\.localFee/)
  assert.doesNotMatch(checkout, /function useLocalFee\(/)
})
test('checkout distinguishes estimate from server-calculated order total', () => {
  assert.match(checkout, /Estimated total/)
  assert.match(checkout, /server-calculated total/)
  assert.match(checkout, /supabase\.rpc\('place_order'/)
})
test('delivery settings reject negative and invalid fees', () => {
  assert.match(shop, /Number\.isFinite\(rawFee\) && rawFee >= 0/)
})
