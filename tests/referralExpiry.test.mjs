import test from 'node:test'
import assert from 'node:assert/strict'
import { validAttributionTouch, ATTRIBUTION_WINDOW_MS } from '../src/lib/referralExpiry.js'
const now = Date.UTC(2026, 10, 3)
test('accepts valid referrals inside 30 days', () => {
  assert.equal(validAttributionTouch({ type: 'reseller', code: 'ABC', at: now - 1000 }, now), true)
})
test('rejects expired referral at checkout boundary', () => {
  assert.equal(validAttributionTouch({ type: 'reseller', code: 'ABC', at: now - ATTRIBUTION_WINDOW_MS }, now), false)
})
test('rejects missing timestamps, future timestamps and invalid codes', () => {
  assert.equal(validAttributionTouch({ type: 'reseller', code: 'ABC' }, now), false)
  assert.equal(validAttributionTouch({ type: 'reseller', code: 'ABC', at: now + 1 }, now), false)
  assert.equal(validAttributionTouch({ type: 'reseller', code: ' ', at: now - 1000 }, now), false)
})
