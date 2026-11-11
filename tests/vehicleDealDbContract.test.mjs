import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const migration = readFileSync(new URL('../supabase/migrations/20261109_vehicle_success_fee_REVIEW.sql', import.meta.url), 'utf8')
const builder = readFileSync(new URL('../src/pages/admin/OfferingBuilder.jsx', import.meta.url), 'utf8')

test('vehicle agreements use a private staff-editable seller success fee', () => {
  assert.match(migration, /vehicle_affiliate_share_pct/)
  assert.match(migration, /vehicle_seller_agreement_note/)
  assert.match(migration, /vehicle_agreement_staff_guard/)
  assert.match(builder, /Seller.s agreed success fee/)
})
test('vehicle deals snapshot the share from the seller fee, not full sale price', () => {
  assert.match(migration, /when prod.offering_type = 'vehicle' then 'fee_share'/)
  assert.match(migration, /round\(v_fee \* v_rate \/ 100, 2\)/)
  assert.match(migration, /case when d.commission_type = 'fee_share' then v_fee else p_amount end/)
})
test('vehicle enquiries produce tracked deal records', () => {
  assert.match(migration, /prod.offering_type = 'vehicle' and prod.sales_model = 'enquire'/)
  assert.match(migration, /reseller_id, invite_code, campaign_id, source, status/)
})
test('fee received can be recorded after closing and gates affiliate payout', () => {
  assert.match(migration, /p_action not in \('note', 'fee_received'\)/)
  assert.match(migration, /d.fee_status <> 'received'/)
  assert.match(migration, /update commissions set eligible_at/)
})
