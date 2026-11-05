import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const get = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const sql = get('supabase/migrations/20261104_giveaways_REVIEW.sql')

// Under the Zambian Lotteries Act a lottery is a scheme where chances are
// "acquired by prior payment". Free entry is the whole legal basis for this
// feature existing, so it is enforced by the database, not by a screen.
test('entry is free and cannot be made otherwise', () => {
  assert.match(sql, /entry_cost numeric not null default 0 check \(entry_cost = 0\)/)
  // No price, fee or payment path anywhere in the admin screen.
  const admin = get('src/pages/marketing/Giveaways.jsx')
  assert.doesNotMatch(admin, /entry_cost|entry_fee|price_to_enter|paid_spin/)
  const page = get('src/pages/public/Giveaway.jsx')
  assert.doesNotMatch(page, /checkout|add_to_cart|pay to enter/i)
})

// If the browser decided the winner, anyone could decide the winner.
test('the winner is chosen by the database, never by the wheel', () => {
  assert.match(sql, /order by gen_random_uuid\(\)/)
  assert.match(sql, /if not \(is_staff\(\) or can_market\(\)\) then raise exception/)
  const page = get('src/pages/public/Giveaway.jsx')
  // The wheel only works out which angle shows an already-known name.
  assert.match(page, /slots\.indexOf\(firstName\)/)
  assert.doesNotMatch(page, /Math\.random/)
})

test('drawing twice cannot change the result', () => {
  // The existing draw short-circuits before any new selection happens.
  const fn = sql.slice(sql.indexOf('function public.draw_giveaway'))
  const guard = fn.indexOf("'repeat', true")
  const pick = fn.indexOf('order by gen_random_uuid()')
  assert.ok(guard > 0 && guard < pick, 'the repeat check must come before the selection')
  assert.match(fn, /for update/)
  assert.match(fn, /if now\(\) <= c\.closes_at then raise exception/)
})

test('one entry per person, enforced by the database', () => {
  assert.match(sql, /unique \(campaign_id, user_id\)/)
  // Direct inserts are blocked; everything goes through the function.
  assert.match(sql, /create policy giveaway_entry_insert[\s\S]{0,120}with check \(false\)/)
})

test('no entrant contact detail is ever public', () => {
  const pub = sql.slice(sql.indexOf('function public.giveaway_public'))
  for (const field of ['phone', 'email', 'address']) {
    assert.ok(!pub.includes(field), `${field} must not appear in the public view`)
  }
  // The wheel shows a first name and an initial, not a full identity.
  assert.match(sql, /display_name/)
})

test('social actions are encouraged, never required', () => {
  const page = get('src/pages/public/Giveaway.jsx')
  // Meta forbids requiring a share or a tag as a condition of entry.
  assert.match(page, /optional/i)
  assert.match(page, /not sponsored, endorsed,? (or |administered by)/i)
  assert.match(page, /Sharing (is entirely optional|does not increase)/i)
  assert.doesNotMatch(page, /must share|required to share|must tag|tag three/i)
})

test('the SEO coach no longer claims a minimum word count', () => {
  // Strip comments: the file names the old wording to explain why it went.
  const score = get('src/lib/seoScore.js')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(score, /Too short to rank/)
  assert.match(score, /no minimum length for ranking/)
})

// Entering a giveaway must never subscribe anyone to anything. Zambia's data
// protection rules need a lawful basis and a real way out, and a marketplace
// that mails people who only entered a draw burns the trust the draw bought.
test('marketing consent is separate, unticked and withdrawable', () => {
  const conv = get('supabase/migrations/20261104_giveaway_conversion_REVIEW.sql')
  assert.match(conv, /create table if not exists public\.marketing_consent/)
  assert.match(conv, /granted boolean not null default false/)
  assert.match(conv, /withdrawn_at/)
  // The record survives withdrawal — it is the proof the withdrawal happened.
  assert.doesNotMatch(conv, /delete from marketing_consent/)

  const page = get('src/pages/public/Giveaway.jsx')
  assert.match(page, /const \[optIn, setOptIn\] = useState\(false\)/) // starts unticked
  assert.match(page, /if \(optIn\)[\s\S]{0,120}set_marketing_consent/)
  // The entry itself never carries consent: it is recorded first, on its own,
  // so a refused consent call can never cost somebody their entry.
  const enterFn = page.slice(page.indexOf('const enter ='), page.indexOf('const copyLink ='))
  assert.ok(enterFn.includes("rpc('enter_giveaway'"), 'enter() must call enter_giveaway')
  assert.ok(enterFn.indexOf("rpc('enter_giveaway'") < enterFn.indexOf('set_marketing_consent'))
})

// Some people need the thing now. A birthday is not going to wait for a draw.
test('the prize can be bought during the giveaway — but only if it exists', () => {
  const page = get('src/pages/public/Giveaway.jsx')
  assert.match(page, /Need this before the draw/)
  assert.match(page, /Buying does not affect your entry/)

  // A prize is often the only unit there is. Selling a second one you do not
  // have is taking money for something nobody can deliver.
  // One rule, in one place, applied to the prize and to every product the
  // page recommends — so nothing on this page can offer what is not there.
  assert.match(page, /const available = \(p\) =>/)
  assert.match(page, /p\?\.status === 'published'/)
  assert.match(page, /Number\(p\.stock_available\) > 0/)
  // Made to order and services can always be sold; another gets made.
  assert.match(page, /\['made_to_order','service'\]\.includes\(p\.fulfilment\)/)
  assert.match(page, /const buyable = available\(product\)/)
  // Every recommended product and every offer passes the same gate.
  assert.match(page, /const canBuy = available\(p\)/)
  assert.match(page, /filter\(\(\{ product \}\) => product && available\(product\)\)/)
  // When it cannot be sold, the page sends people to the seller instead of
  // showing a dead button or nothing at all.
  assert.match(page, /This one is the last/)
  assert.match(page, /Visit \{vendorName \|\| 'the shop'\}/)

  // The page can only make that judgement if the server tells it the stock.
  const sql = get('supabase/migrations/20261104_giveaways_REVIEW.sql')
  assert.match(sql, /'stock_available', p\.stock_available/)
  assert.match(sql, /'fulfilment', p\.fulfilment/)
  assert.match(sql, /'status', p\.status/)
})

// Entries are not a result. The campaign is judged on money.
test('a campaign reports what it cost against what it earned', () => {
  const conv = get('supabase/migrations/20261104_giveaway_conversion_REVIEW.sql')
  assert.match(conv, /cost_prize|cost_delivery|cost_promotion/)
  // Commission comes from the real settlement records, not an assumed rate.
  assert.match(conv, /sum\(st\.marketplace_fee\)/)
  assert.doesNotMatch(conv, /\* 0\.1|\/ 100 \* total/)
  // Orders are matched by the attribution the marketplace already uses.
  assert.match(conv, /tag := 'campaign:' \|\| c\.slug/)
  const page = get('src/pages/public/Giveaway.jsx')
  assert.match(page, /setCampaign\(slug\)/)
})

// A vendor could never say HOW MANY of something they had — only flip a
// manual "sold out" switch. So nothing stopped the same last item being sold
// twice, and nothing could hold a giveaway prize back from ordinary checkout.
const stock = get('supabase/migrations/20261104_vendor_stock_REVIEW.sql')

test('a vendor can count stock, and counting is optional', () => {
  assert.match(stock, /tracks_stock boolean not null default false/)
  // A baker working to order has no shelf to count and must not be forced.
  assert.match(stock, /vendor_set_stock/)
  assert.match(stock, /if not \(p\.vendor_id = my_vendor_id\(\) or is_staff\(\)\) then raise exception/)
  // The count changes through the ledger, never written over silently.
  assert.match(stock, /apply_movement\(p\.id, 'adjustment', diff/)
  assert.match(stock, /if p_count < 0 then raise exception/)
})

test('a counted listing takes itself off sale at zero', () => {
  assert.match(stock, /set status = 'out_of_stock'[\s\S]{0,200}\(owner_type = 'founder' or tracks_stock\)/)
  assert.match(stock, /set status = 'published' where id = p_product and stock_available > 0/)
})

test('an order holds counted stock whoever owns the product', () => {
  assert.match(stock, /\(prod\.owner_type = 'founder' or prod\.tracks_stock\) and prod\.fulfilment = 'in_stock'/)
})

test('a live giveaway holds its prize out of sale', () => {
  assert.match(stock, /reserve_giveaway_prize/)
  assert.match(stock, /apply_movement\(p\.id, 'reserve', got/)
  // Made to order has nothing on a shelf to hold; holding would block real orders.
  assert.match(stock, /if p\.fulfilment <> 'in_stock' then return/)
  // Releasing gives back only what this campaign actually took.
  assert.match(stock, /reference_type = 'giveaway' and m\.reference_id = c\.id/)
  // Opening and ending a campaign drive it.
  const admin = get('src/pages/marketing/Giveaways.jsx')
  assert.match(admin, /p_hold: true/)
  assert.match(admin, /p_hold: false/)
  assert.match(admin, /only \$\{held\.held\} of \$\{held\.wanted\} could be held back/)
})

test('the giveaway page uses its own traffic', () => {
  const page = get('src/pages/public/Giveaway.jsx')
  assert.match(page, /while you are here/i)
  for (const route of ['/search', '/affiliates', '/apply/vendor']) {
    assert.ok(page.includes(`to="${route}"`), `${route} door should be there`)
  }
  // None of it is a condition of entry.
  assert.match(page, /Nothing here is a condition of entry/)
})
