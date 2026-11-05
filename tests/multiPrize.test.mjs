import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const sql = read('../supabase/migrations/20261105_multi_prize_REVIEW.sql')
const page = read('../src/pages/public/Giveaway.jsx')
const admin = read('../src/pages/marketing/Giveaways.jsx')

// These are all proven against a real database as well. The tests here stop
// them being quietly undone later.

test('a campaign can hand out several different prizes', () => {
  assert.match(sql, /create table if not exists public\.giveaway_prizes/)
  assert.match(sql, /rank int not null check \(rank between 1 and 50\)/)
  assert.match(sql, /winners int not null default 1/)
  assert.match(sql, /unique \(campaign_id, rank\)/)
  // A prize must actually be something.
  assert.match(sql, /product_id is not null or nullif\(btrim\(prize_text\), ''\) is not null/)
})

test('a campaign with no prize list behaves exactly as it did before', () => {
  assert.match(sql, /fallback as \(/)
  assert.match(sql, /not exists \(select 1 from giveaway_prizes where campaign_id = p_campaign\)/)
})

test('winners are matched to prizes in rank order', () => {
  assert.match(sql, /join giveaway_prize_slots\(c\.id\) sl on sl\.rn = ch\.rn/)
  assert.match(sql, /order by sl\.rank, ch\.rn/)
  assert.match(sql, /'prize_rank', sl\.rank/)
  // Still a cryptographic shuffle, so nobody can steer who wins what.
  assert.match(sql, /order by gen_random_uuid\(\)/)
})

test('the draw records who the winner is, not just which entry', () => {
  // Without user_id nothing downstream can tell a winner from a non-winner,
  // which is how the winner was also being offered referral rewards.
  assert.match(sql, /'user_id', ch\.user_id/)
})

test('a winner is never also invited to earn referral rewards', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.open_giveaway_referrals'))
  assert.match(fn, /\(w->>'user_id'\)::uuid = e\.user_id/)
  // Belt and braces: an older draw recorded without user_id still excludes
  // its winner, by entry.
  assert.match(fn, /\(w->>'entry_id'\)::uuid = e\.id/)
})

test('stock is held back for every prize, not just the first', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.reserve_giveaway_prize'))
  assert.match(fn, /from giveaway_prize_slots\(c\.id\) sl/)
  assert.match(fn, /group by sl\.product_id/)
  // And a shortfall is reported per product rather than swallowed.
  assert.match(fn, /'why', 'not enough in stock'/)
  // Releasing gives back what this campaign took, product by product.
  assert.match(fn, /group by m\.product_id/)
})

test('prizes cannot be changed after the draw', () => {
  const matches = sql.match(/already been drawn — the prizes cannot change now/g) || []
  assert.equal(matches.length, 2, 'both adding and removing must be locked')
})

test('the public page lists every prize and who won what', () => {
  assert.match(sql, /'prizes', coalesce\(\(/)
  assert.match(page, /data\.prizes\.map\(\(pz\)/)
  assert.match(page, /gw-prize-rank/)
  assert.match(page, /\{w\.prize && <span className="gw-winner-prize">/)
  assert.match(page, /ordinal\(w\.prize_rank\)/)
})

test('the admin can build the prize list before the draw only', () => {
  assert.match(admin, /set_giveaway_prize/)
  assert.match(admin, /remove_giveaway_prize/)
  // Hidden once a draw exists.
  assert.match(admin, /\{!d && <PrizeList/)
})

test('the wheel shows real entries and says so when it cannot show them all', () => {
  assert.match(page, /const NAME_CAP = 20000/)
  assert.match(page, /The wheel shows \{slots\.length\} of \{total\} entries\. All \{total\} were in the draw\./)
  // The winner's slice is where they really are, never moved to the end.
  assert.doesNotMatch(page, /list\[list\.length - 1\] = firstName/)
})

test('the reveal screen is a sequence that ends with the draw', () => {
  assert.match(page, /function RevealStage/)
  assert.match(page, /\{ key: 'intro'/)
  assert.match(page, /\{ key: 'draw', label: 'The draw' \}/)
  // Products and offers only appear when there are some.
  assert.match(page, /\.\.\.\(products\.length \? \[\{ key: 'products'/)
  assert.match(page, /\.\.\.\(offers\.length \? \[\{ key: 'offers'/)
})
