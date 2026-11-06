import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const read = (p) => readFileSync(at(p), 'utf8')
const checkout = read('src/pages/public/Checkout.jsx')
const sql = read('supabase/migrations/20261106_coupons_complete_REVIEW.sql')

test('a customer can actually enter a coupon', () => {
  // The whole coupon system existed in the database -- table, funding split,
  // settlement apportionment, admin screen -- but place_order read
  // payload->>'coupon' and nothing ever sent it, so no coupon could be used.
  assert.match(checkout, /rpc\('coupon_check'/)
  assert.match(checkout, /coupon: coupon\.applied\?\.code \|\| null/)
  assert.match(checkout, /placeholder="Coupon code"/)
})

test('the page sends the code, never the discount', () => {
  // The discount is money. If the page could send an amount, a customer could
  // send any amount they liked.
  const start = checkout.indexOf("rpc('place_order'")
  assert.ok(start > 0, 'place_order call not found')
  const payload = checkout.slice(start, checkout.indexOf('setBusy(false)', start))
  assert.ok(payload.length > 50, 'could not isolate the place_order payload')
  assert.doesNotMatch(payload, /discount:/)
  assert.match(payload, /coupon: coupon\.applied\?\.code/)
})

test('the total on screen has the discount taken off', () => {
  assert.match(checkout, /money\(Math\.max\(subtotal - discount, 0\) \+ fee\)/)
})

test('changing the basket drops a coupon checked against the old one', () => {
  // A coupon validated against a K500 basket must not stay applied when the
  // customer removes an item and the basket is worth K80.
  assert.match(checkout, /useEffect\(\(\) => \{ setApplied\(null\); setNote\(''\) \}, \[subtotal, vendorId\]\)/)
})

test("a seller's coupon is only offered when the whole basket is theirs", () => {
  assert.match(checkout, /basketVendors\.length === 1 \? basketVendors\[0\] : null/)
})

test('per-customer limit is enforced, not just stored', () => {
  // per_customer_limit was a column nobody read, so one person could use a
  // coupon until the overall usage_limit ran out.
  assert.match(sql, /used_by_them >= c\.per_customer_limit/)
  assert.match(sql, /from coupon_uses u\s*\n\s*join customers cu on cu\.id = u\.customer_id/)
  assert.match(sql, /norm_phone\(cu\.phone\) = norm_phone\(p_phone\)/)
})

test('a targeted coupon only works for the people it was given to', () => {
  assert.match(sql, /c\.audience = 'targeted'/)
  assert.match(sql, /from coupon_recipients r/)
  assert.match(sql, /norm_phone\(r\.phone\) = norm_phone\(p_phone\)/)
  // No phone means we cannot tell who is asking, so it must be refused.
  assert.match(sql, /coalesce\(trim\(p_phone\), ''\) = ''/)
})

test("a seller-funded coupon is dead until that seller agrees to it", () => {
  // The founder may write a coupon against a seller's money, but the seller
  // has to know and accept before any customer can use it.
  assert.match(sql, /c\.funded_by = 'vendor' and c\.vendor_ack_at is null/)
  assert.match(sql, /new_status := 'awaiting_vendor'/)
  assert.match(sql, /create or replace function public\.answer_coupon/)
  // A seller making their own coupon has agreed to it by making it.
  assert.match(sql, /acked := case when funder = 'vendor' then now\(\) else null end/)
})

test('a seller can never spend anyone else’s money', () => {
  assert.match(sql, /if not is_staff\(\) then[\s\S]{0,200}?funder := 'vendor';[\s\S]{0,40}?vend := v;/)
})

test('a coupon awaiting its funder cannot be switched on by editing it', () => {
  assert.match(sql, /status = case when coupons\.status = 'awaiting_vendor' then coupons\.status/)
})

test('place_order is told who is ordering, or targeting cannot work', () => {
  assert.match(sql, /coalesce\(v_basket_vendor, v_store\.id\), cust\.phone\)/)
  assert.match(sql, /update coupon_recipients set used_at = now\(\)/)
})

test('the total handed back to the browser has the discount off', () => {
  // The orders row was right but the returned JSON said sub + fee, and the
  // confirmation screen prints exactly that number.
  assert.match(sql, /'''total'', greatest\(sub - v_disc, 0\) \+ fee, ''discount'', v_disc'/)
})

test('both settlement paths charge the discount to whoever funded it', () => {
  // The percentage-fee branch ignored o.discount entirely, so ZaMarket paid
  // the vendor in full and absorbed every discount, funded or not.
  assert.match(sql, /Percentage-fee settlement/)
  assert.match(sql, /if coalesce\(coupon_funder, ''marketplace''\) = ''vendor'' then\s*\n\s*vend_net := greatest\(vend_net - line_disc, 0\);/)
})

test('a loss ZaMarket chose to take is visible in the books', () => {
  // Flooring marketplace_fee at zero hid the subsidy and made the row fail to
  // add up: gross 73, seller 90, ZaMarket 0.
  assert.match(sql, /'round\(greatest\(gross - vend_net - comm, 0\), 2\)',\s*\n\s*'round\(gross - vend_net - comm, 2\)'/)
})

test('every coupon function is re-runnable and guards what it patches', () => {
  // These patches rewrite live money functions. Each one checks the shape it
  // expects and refuses rather than corrupting the function.
  for (const guard of [
    /place_order does not contain the expected coupon_check call/,
    /place_order does not contain the expected coupon_uses insert/,
    /set_order_status percentage-fee branch is not in the expected shape/,
  ]) assert.match(sql, guard)
  // and each is a no-op the second time
  assert.match(sql, /-- already patched/)
})

const vendorPage = read('src/pages/vendor/VendorCoupons.jsx')
const adminPage = read('src/pages/marketing/Coupons.jsx')
const app = read('src/App.jsx')
const shell = read('src/components/Shell.jsx')
const vendorHome = read('src/pages/vendor/Vendor.jsx')

test('a seller can reach their own coupons', () => {
  assert.match(app, /<Route path="coupons" element=\{<VendorCoupons \/>\} \/>/)
  assert.match(shell, /\{ to: '\/vendor\/coupons', label: 'Coupons' \}/)
})

test('a seller is told when a discount is waiting on them', () => {
  // "They know about it" was the requirement. A screen they might never open
  // does not satisfy that, so it surfaces on their home page as well.
  assert.match(vendorHome, /coupons: await q\(supabase\.rpc\('my_coupons'\)\)/)
  assert.match(vendorHome, /couponsWaiting/)
  assert.match(vendorHome, /A discount needs your approval/)
})

test('the seller screen can accept or decline, and shows the real cost', () => {
  assert.match(vendorPage, /rpc\('answer_coupon', \{ p_coupon: id, p_accept: accept \}\)/)
  assert.match(vendorPage, /Accept and fund/)
  assert.match(vendorPage, /No thanks/)
  // Their own money, so the cost is shown in kwacha, not as a percentage.
  assert.match(vendorPage, /money\(c\.spent\)/)
})

test('the founder can give a coupon to named people', () => {
  assert.match(adminPage, /rpc\('set_coupon_recipients'/)
  assert.match(adminPage, /Give it to specific people only/)
  // One per line, name optional after a comma.
  assert.match(adminPage, /const parsePeople =/)
})

test('the founder is told a seller-funded coupon is not live yet', () => {
  assert.match(adminPage, /it does not go live when\s*\n\s*you save it/)
  assert.match(adminPage, /The seller must accept it before anyone can use it/)
})
