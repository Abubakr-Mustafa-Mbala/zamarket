import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const sql = read('../supabase/migrations/20261105_promo_referrals_REVIEW.sql')
const page = read('../src/pages/public/Giveaway.jsx')
const admin = read('../src/pages/marketing/Giveaways.jsx')

// The rules below are all proven against a real database as well. These tests
// stop them being quietly edited out of the source later.

test('one order can only ever pay one person', () => {
  // An affiliate on the order means the giveaway referrer gets nothing.
  assert.match(sql, /if o\.reseller_id is not null then return 0; end if;/)
  // And the database refuses a second reward row for the same pair outright.
  assert.match(sql, /create unique index if not exists commissions_promo_once/)
  // The ledger accepts exactly one kind of earner per row.
  assert.match(sql, /constraint commissions_one_earner check/)
  assert.match(sql, /\(reseller_id is not null and promo_referrer_id is null\)/)
})

test("an approved affiliate's work is never interrupted by a campaign", () => {
  // The giveaway code is only consulted when no affiliate code was supplied.
  assert.match(sql, /if rs\.id is null and coalesce\(payload->>'referral_code',''\) <> '' then\s*\n\s*select \* into pr from promo_referrers/)
  // Percentage commissions are untouched: the affiliate branch is unchanged.
  assert.match(sql, /select \* into rs from resellers where code = lower\(payload->>'referral_code'\) and status = 'approved'/)
})

test('a used giveaway link beats a previous affiliate who owned the customer', () => {
  assert.match(sql, /if rs\.id is null and pr\.id is null and not v_manual and cust\.owner_reseller_id is not null then/)
})

test('a reward the sale cannot pay for is refused', () => {
  assert.match(sql, /create or replace function public\.promo_reward_affordable/)
  // The guard is inside the function staff must go through, not just advisory.
  assert.match(sql, /verdict := promo_reward_affordable\(p_product, p_reward, c\.referral_funded_by\)/)
  assert.match(sql, /raise exception '%', verdict->>'reason'/)
  // It tells the founder the price that would work rather than just refusing.
  assert.match(sql, /break_even_price/)
})

test('only a new customer earns a reward, and never a self-referral', () => {
  assert.match(sql, /note := 'Not a new customer'/)
  assert.match(sql, /note := 'Self-referral'/)
  // Both numbers are normalised; comparing raw strings let every
  // self-referral through when the two were formatted differently.
  assert.match(sql, /norm_phone\(pf\.phone\) = norm_phone\(cust\.phone\)/)
})

test('the campaign budget and the per-person cap are hard limits', () => {
  assert.match(sql, /note := 'Campaign reward budget is spent'/)
  assert.match(sql, /reward := least\(reward, c\.referral_budget - spent\)/)
  assert.match(sql, /note := 'This person has reached their cap'/)
  assert.match(sql, /reward := least\(reward, c\.referral_max_per_person - mine\)/)
  // The campaign row is locked so two orders completing at once cannot both
  // read the same remaining budget.
  assert.match(sql, /select \* into c from giveaway_campaigns where id = r\.campaign_id for update/)
})

test('only products the founder approved can earn', () => {
  assert.match(sql, /join giveaway_reward_products rp on rp\.product_id = oi\.product_id/)
  assert.match(sql, /note := 'No approved product in this order'/)
})

test('a refund takes the reward back', () => {
  // Promo rewards live in the same table, so the existing reversal applies.
  const schema = read('../supabase/schema.sql')
  assert.match(schema, /update commissions set status = 'reversed'[\s\S]{0,120}where order_id = p_order and status <> 'paid'/)
})

test('winners are excluded and nobody is invited twice', () => {
  assert.match(sql, /and not exists \(\s*\n\s*select 1 from jsonb_array_elements\(coalesce\(d\.winners/)
  assert.match(sql, /on conflict \(campaign_id, user_id\) do nothing/)
  // Re-running must not extend the window somebody was already given.
  assert.match(sql, /if c\.referral_opens_at is null then/)
})

test('the earning window is fixed and cannot be back-dated', () => {
  assert.match(sql, /if o\.created_at > r\.expires_at or o\.created_at < r\.opens_at then/)
  assert.match(sql, /note := 'Order placed outside the referral window'/)
})

test('the public panel uses the referral link the site actually reads', () => {
  // "?ref=" is read by nothing; /r/<code>/<slug> is what ReferralCapture handles.
  assert.match(page, /\/r\/\$\{encodeURIComponent\(data\.code\.toLowerCase\(\)\)\}\/\$\{encodeURIComponent\(p\.slug\)\}/)
  assert.doesNotMatch(page, /\?ref=\$\{/)
  const market = read('../src/pages/public/Marketplace.jsx')
  assert.match(market, /export function ReferralCapture/)
  const app = read('../src/App.jsx')
  assert.match(app, /path="\/r\/:code\/:product"/)
})

test('the public panel separates confirmed money from money still clearing', () => {
  assert.match(page, /still clearing/)
  assert.match(page, /const confirmed = Number\(data\.earned \|\| 0\)/)
  assert.match(page, /const pending = Number\(data\.pending \|\| 0\)/)
  // Only settled statuses count as earned.
  assert.match(sql, /filter \(where status in \('verified','approved','paid'\)\)/)
})

test('the panel never tells someone they have won the prize', () => {
  const block = page.slice(page.indexOf('function DidntWin'))
  assert.doesNotMatch(block, /you(?:'ve| have) won/i)
  assert.doesNotMatch(block, /claim your prize/i)
  assert.match(block, /new customer/)
})

test('the admin can only open the window once it can be paid for', () => {
  assert.match(sql, /raise exception 'Set the referral reward first'/)
  assert.match(sql, /raise exception 'Choose at least one product people may promote'/)
  assert.match(sql, /raise exception 'Draw the winners first'/)
  // The admin screen shows the money, not just the activity.
  assert.match(admin, /budget left/)
  assert.match(admin, /your commission/)
  assert.match(admin, /rewards owed/)
})

test('rewards are staff-controlled and participants only see their own', () => {
  assert.match(sql, /revoke all on function public\.open_giveaway_referrals\(text\) from public, anon/)
  assert.match(sql, /revoke all on function public\.award_promo_referral\(uuid\) from public, anon, authenticated/)
  assert.match(sql, /using \(user_id = auth\.uid\(\) or is_staff\(\) or can_market\(\)\)/)
  assert.match(sql, /if not \(is_staff\(\) or can_market\(\)\) then/)
})
