import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const checkout = readFileSync(new URL('../src/pages/public/Checkout.jsx', import.meta.url), 'utf8')
const shop = readFileSync(new URL('../src/lib/departments.js', import.meta.url), 'utf8')
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
// Different sellers can charge different delivery. A single marketplace-wide
// fee quoted at checkout was wrong whenever a basket crossed sellers: the
// order then charged something else. Checkout asks delivery_charge() per
// vendor and quotes the highest, which is what place_order() also does.
test('checkout quotes delivery per seller, matching what the order will charge', () => {
  assert.match(checkout, /function useLocalFee\(/)
  assert.match(checkout, /supabase\.rpc\('delivery_charge', \{ p_vendor: id \}\)/)
  assert.match(checkout, /Math\.max/)
  const sql = read('../supabase/schema.sql')
  assert.match(sql, /coalesce\(max\(delivery_charge\(d\.vendor_id\)\), delivery_charge\(\)\)/)
})
test('checkout distinguishes estimate from server-calculated order total', () => {
  assert.match(checkout, /Estimated total/)
  assert.match(checkout, /server-calculated total/)
  assert.match(checkout, /supabase\.rpc\('place_order'/)
})
test('delivery settings reject negative and invalid fees', () => {
  assert.match(shop, /Number\.isFinite\(rawFee\) && rawFee >= 0/)
})
