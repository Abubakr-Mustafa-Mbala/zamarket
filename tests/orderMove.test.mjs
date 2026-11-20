import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { orderPath } from '../src/lib/orderMove.js'
import { ORDER_NEXT } from '../src/lib/statuses.js'

test('paid order can go out for delivery (via processing)', () => {
  assert.deepEqual(orderPath('paid', 'out_for_delivery'), ['processing', 'out_for_delivery'])
})
test('cash-on-delivery order can go out for delivery', () => {
  assert.deepEqual(orderPath('confirmed', 'out_for_delivery'), ['processing', 'out_for_delivery'])
  assert.deepEqual(orderPath('payment_pending', 'out_for_delivery'), ['processing', 'out_for_delivery'])
})
test('every order the button shows can reach delivered and completed', () => {
  for (const s of ['confirmed', 'payment_pending', 'paid', 'processing', 'ready_for_dispatch', 'out_for_delivery', 'failed_delivery']) {
    const p = orderPath(s, 'completed')
    assert.ok(p && p.at(-2) === 'delivered', s)
    assert.ok(!p.some((x) => ['cancelled', 'refunded', 'returned', 'failed_delivery'].includes(x)), `${s} detours: ${p}`)
  }
})
test('closed orders stay closed', () => {
  for (const s of ['cancelled', 'refunded', 'returned']) assert.equal(orderPath(s, 'completed'), null)
})
test('the app rules match the database rules', () => {
  const sql = fs.readFileSync('supabase/schema.sql', 'utf8')
  const fn = sql.match(/function order_transition_allowed[\s\S]*?\$\$;/)[0]
  for (const m of fn.matchAll(/when f = '(\w+)' then t in \(([^)]*)\)/g)) {
    const allowed = [...m[2].matchAll(/'(\w+)'/g)].map((x) => x[1])
    for (const t of allowed) assert.ok(ORDER_NEXT[m[1]].includes(t), `${m[1]} → ${t} missing in app`)
    for (const t of ORDER_NEXT[m[1]]) if (!['cancelled', 'fraud_review'].includes(t)) assert.ok(allowed.includes(t), `${m[1]} → ${t} not allowed in DB`)
  }
})
