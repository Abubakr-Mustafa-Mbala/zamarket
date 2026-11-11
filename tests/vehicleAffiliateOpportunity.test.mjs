import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('seller private percentage never enters the public vehicle cards', () => {
  const page = read('src/pages/public/Motors.jsx')
  assert.doesNotMatch(page, /deal_fee_pct|vehicle_affiliate_share_pct/)
})
test('only an approved affiliate may see read-only vehicle estimates', () => {
  const sql = read('supabase/migrations/20261109_affiliate_vehicle_rewards_REVIEW.sql')
  assert.match(sql, /where r.user_id = auth.uid\(\) and r.status = 'approved'/)
  assert.match(sql, /revoke all on function/)
  assert.match(sql, /grant execute .*authenticated/)
  assert.doesNotMatch(sql, /update\s+public\.products/i)
})
test('affiliate presentations use a recorded estimate, not ordinary item commission on cars', () => {
  const reseller = read('src/pages/reseller/Reseller.jsx')
  assert.match(reseller, /affiliate_vehicle_reward_estimates/)
  assert.match(reseller, /p.offering_type === 'vehicle'/)
})
