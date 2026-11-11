import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { nameAdvice, tidyName, safeSuggestion, NAME_MAX } from '../src/lib/productName.js'
import { usablePhone, prettyPhone, waNumber } from '../src/lib/phone.js'
import { safeSuggestion as serverSafe, safeLeadMessage } from '../netlify/functions/ai-assist.js'

const read = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

// ---------------------------------------------------------------- names
test('a plain name gets no complaints and is left alone', () => {
  for (const name of ['Chocolate birthday cake, 2 kg', 'Chitenge wrap dress', 'Wireless earbuds', 'Samsung Galaxy A15, 128GB']) {
    assert.deepEqual(nameAdvice(name), [], name)
    assert.equal(tidyName(name), name)
  }
})

test('a dressed-up name is explained in plain words', () => {
  const advice = nameAdvice('🔥 BEST QUALITY ORIGINAL SAMSUNG GALAXY A15 SM-A155F/DS 128GB SMARTPHONE K3500 HOT DEAL!!!').join(' ')
  for (const word of ['long', 'capital', 'symbols', 'selling words', 'price', 'code']) assert.match(advice, new RegExp(word), word)
  assert.match(nameAdvice('Premium Deluxe Artisanal Signature Belgian Chocolate Cake').join(' '), /dressing-up words/)
})

test('tidying only removes; it never adds a word or a number', () => {
  const cases = [
    '🔥 BEST QUALITY ORIGINAL SAMSUNG GALAXY A15 SM-A155F/DS 128GB SMARTPHONE K3500 HOT DEAL!!!',
    'Premium Deluxe Artisanal Handcrafted Luxurious Signature Gourmet Belgian Chocolate Celebration Cake Experience',
    'LED TV 43 INCH SMART', 'CAKE FOR THE BIRTHDAY 2KG', 'cheap cheap shoes shoes!!!',
  ]
  for (const raw of cases) {
    const tidy = tidyName(raw)
    const had = new Set(raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
    for (const word of tidy.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      assert.ok(had.has(word), `"${word}" was not in "${raw}"`)
    }
    assert.ok(tidy.length >= 3, raw)
  }
  assert.equal(tidyName(cases[0]), 'Samsung Galaxy A15 128GB Smartphone')
  assert.equal(tidyName(cases[1]), 'Belgian Chocolate Celebration Cake')
  // Initials stay in capitals; ordinary words do not.
  assert.equal(tidyName(cases[2]), 'LED TV 43 Inch Smart')
  assert.equal(tidyName(cases[3]), 'Cake for the Birthday 2KG')
  assert.equal(NAME_MAX, 60)
})

test('an AI name is refused if it invents a number, a price or a selling word', () => {
  const source = 'SAMSUNG GALAXY A15 128GB phones'
  for (const check of [safeSuggestion, serverSafe]) {
    assert.equal(check('Samsung Galaxy A15 phone, 128GB', source), 'Samsung Galaxy A15 phone, 128GB')
    assert.equal(check('"Samsung Galaxy A15 phone."', source), 'Samsung Galaxy A15 phone')
    assert.equal(check('Samsung Galaxy A15, 256GB', source), null)      // invented size
    assert.equal(check('Best Samsung Galaxy A15', source), null)        // selling word
    assert.equal(check('Samsung Galaxy A15 K3500', source), null)       // price
    assert.equal(check('Samsung Galaxy A15 🔥', source), null)
    assert.equal(check('x'.repeat(71), source), null)
    assert.equal(check('', source), null)
  }
})

test('the browser and the server judge a suggested name the same way', () => {
  const source = 'Fresh cream cake 2kg vanilla 12 slices'
  const samples = ['Vanilla cream cake, 2kg', 'Vanilla cream cake, 3kg', 'Quality vanilla cake', 'Vanilla cake K250',
    'Vanilla cake!!', 'Cake', 'Cream cake, 12 slices', 'Premium cake', 'HOT cake', 'Cake 2 kg ⭐']
  for (const s of samples) assert.equal(serverSafe(s, source), safeSuggestion(s, source), s)
})

test('the name helper changes nothing until the seller presses the button', () => {
  const help = read('src/components/NameHelp.jsx')
  assert.match(help, /onClick=\{\(\) => use\(tidy\)\}/)
  assert.match(help, /onClick=\{\(\) => use\(ai\)\}/)
  // onUse is only ever reached through a click.
  assert.equal((help.match(/onUse\(/g) || []).length, 1)
  assert.match(read('src/pages/admin/Products.jsx'), /<NameHelp name=\{p\.name\}/)
})

// ---------------------------------------------------------------- lead drafts
test('a drafted message may only quote a price the server looked up', () => {
  const catalogue = [{ name: 'Chocolate cake', price_zmw: 450 }]
  const ok = 'Hello Mary, thank you for asking about the chocolate cake. It is K450 and we deliver in Lusaka. Would you like it this week? Ann, ZaMarket'
  assert.equal(safeLeadMessage(ok, catalogue), ok)
  assert.equal(safeLeadMessage(ok.replace('K450', 'K399'), catalogue), null)
  assert.equal(safeLeadMessage(ok, []), null)
  assert.equal(safeLeadMessage(ok.replace('Would you like it this week?', 'Hurry, only 2 left!'), catalogue), null)
  assert.equal(safeLeadMessage(ok + ' We guarantee you will love it.', catalogue), null)
  assert.equal(safeLeadMessage(ok + ' See https://example.com/x', catalogue), null)
  assert.ok(safeLeadMessage(ok + ' https://zamarket.shop/sweet/cake', catalogue))
  assert.equal(safeLeadMessage('Hi', catalogue), null)
})

test('the AI helper never receives a phone number and never sends a message', () => {
  const fn = read('netlify/functions/ai-assist.js')
  // Who may use it, and how often, is decided by the database.
  assert.match(fn, /rpc\/claim_ai_assist/)
  assert.doesNotMatch(fn, /input\.phone|input\.email/)
  // It talks to OpenAI and Supabase and nothing else: no WhatsApp, SMS or mail API.
  const hosts = [...fn.matchAll(/fetch\(\s*[`'"]([^`'"]+)/g)].map((m) => m[1])
  for (const h of hosts) assert.match(h, /^(https:\/\/api\.openai\.com\/|\$\{sb\}\/)/, h)
  // Self-contained, so it deploys as one file.
  assert.doesNotMatch(fn, /^import /m)
  const drawer = read('src/pages/marketing/Leads.jsx')
  const draft = drawer.slice(drawer.indexOf('function LeadDraft'), drawer.indexOf('function AddLead'))
  assert.doesNotMatch(draft, /phone:|lead\.phone,/)
  assert.match(draft, /You send it, not the computer/)
})

// ---------------------------------------------------------------- phones
test('phone numbers are recognised however they are typed', () => {
  for (const p of ['0977 123 456', '+260 977 123 456', '260977123456', '977123456']) {
    assert.ok(usablePhone(p), p)
    assert.equal(waNumber(p), '260977123456')
    assert.equal(prettyPhone(p), '0977 123 456')
  }
  for (const p of ['', '12345', 'abc', null]) assert.equal(usablePhone(p), false)
})

// ---------------------------------------------------------------- giveaways
test('a giveaway asks for a number before entering, and keeps it private', () => {
  const page = read('src/pages/public/Giveaway.jsx')
  assert.match(page, /if \(!knownPhone && !usablePhone\(phone\)\) return toast\(/)
  assert.match(page, /rpc\('set_giveaway_contact'/)
  assert.match(page, /rpc\('my_giveaway_entry'/)
  assert.match(page, /never shown on the wheel/)
  // A winner is told privately, and told there is nothing to pay.
  assert.match(page, /data\.result && mine\?\.won/)
  assert.match(page, /never ask a winner to pay/)
})

test('staff can reach a winner; nobody else can read the list', () => {
  const sql = read('supabase/migrations/20261111_winners_recovery_proposals_REVIEW.sql')
  const fn = sql.slice(sql.indexOf('function public.giveaway_winner_contacts'), sql.indexOf('function public.set_giveaway_claim'))
  assert.match(fn, /if not \(is_staff\(\) or can_market\(\)\) then raise exception/)
  assert.doesNotMatch(fn, /my_vendor_id/)
  assert.match(sql, /revoke all on function public\.giveaway_winner_contacts\(text\) from public, anon/)
  const admin = read('src/pages/marketing/Giveaways.jsx')
  assert.match(admin, /<WinnerContacts slug=\{c\.slug\}/)
  assert.match(admin, /There is nothing to pay/)
})

test('a seller can only propose a giveaway, never open one', () => {
  const sql = read('supabase/migrations/20261111_winners_recovery_proposals_REVIEW.sql')
  const policy = sql.slice(sql.indexOf('create policy giveaway_staff_all'), sql.indexOf('drop policy if exists giveaway_vendor_read'))
  assert.doesNotMatch(policy, /my_vendor_id/)
  const fn = sql.slice(sql.indexOf('function public.propose_giveaway'), sql.indexOf('function public.withdraw_giveaway_proposal'))
  assert.match(fn, /'draft', 'vendor'/)
  assert.doesNotMatch(fn, /'live'/)
  assert.match(read('src/pages/vendor/Vendor.jsx'), /rpc\('propose_giveaway'/)
  assert.doesNotMatch(read('src/pages/vendor/Vendor.jsx'), /from\('giveaway_campaigns'\)\.(insert|update)/)
})

// ---------------------------------------------------------------- recovery
test('account recovery cannot be approved without ringing the number on record', () => {
  const sql = read('supabase/migrations/20261111_winners_recovery_proposals_REVIEW.sql')
  const decide = sql.slice(sql.indexOf('function public.decide_account_recovery'), sql.indexOf("insert into public.settings"))
  assert.match(decide, /if not is_founder\(\) then raise exception/)
  assert.match(decide, /if not coalesce\(p_called, false\) then/)
  assert.match(decide, /phone_key\(on_record\) is distinct from phone_key\(r\.claimed_phone\)/)
  assert.match(decide, /payout_hold_until = hold_until/)
  assert.match(decide, /log_audit\('account\.recovered'/)
  // Asking never reveals whether the number belongs to an account.
  const ask = sql.slice(sql.indexOf('function public.request_account_recovery'), sql.indexOf('function public.account_recovery_queue'))
  assert.doesNotMatch(ask, /from vendors where phone|from resellers where phone/)
  assert.match(sql, /create trigger trg_payout_hold before insert on public\.payouts/)
})

test('the recovery pages exist, are private, and say what will happen', () => {
  const app = read('src/App.jsx')
  assert.match(app, /<Route path="\/recover" element=\{<Recover \/>\} \/>/)
  assert.match(app, /<Route path="recovery" element=\{<Founder><Recovery \/><\/Founder>\} \/>/)
  const seo = read('netlify/edge-functions/seo.js')
  assert.match(seo.match(/const PRIVATE = new Set\(\[([^\]]*)\]/)[1], /'recover'/)
  const page = read('src/pages/public/Recover.jsx')
  assert.match(page, /We ring <strong>that number<\/strong>/)
  assert.match(page, /never say on this page whether a phone number belongs to an account/)
  assert.doesNotMatch(page, /type="password"/)
  assert.match(read('src/pages/admin/Recovery.jsx'), /Never a number the person gives you now/)
  assert.match(read('src/pages/public/Auth.jsx'), /<Link to="\/recover">/)
})

test('the one deploy file numbers its sections in order and carries the new ones', () => {
  const all = read('supabase/run-in-supabase.sql')
  const labels = [...all.matchAll(/-- SECTION (\d+) of (\d+) —/g)]
  const total = labels.length
  assert.ok(total >= 21)
  labels.forEach((m, i) => { assert.equal(Number(m[1]), i + 1); assert.equal(Number(m[2]), total) })
  for (const f of ['20261111_winners_recovery_proposals_REVIEW.sql', '20261111_delivery_fund_REVIEW.sql']) {
    assert.ok(all.includes(read(`supabase/migrations/${f}`)), `${f} differs from its copy in the deploy file`)
  }
  assert.ok(all.endsWith(read('supabase/migrations/20261111_delivery_fund_REVIEW.sql')))
})
