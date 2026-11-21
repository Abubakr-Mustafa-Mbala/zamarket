import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('AI voice: checked lines, only staff quota, realtime model (speech models shut down Jan 2027)', async () => {
  const fn = await import('../netlify/functions/ai-assist.js')
  assert.equal(fn.saidRatio('Chicken stew with rice.', 'Chicken stew with rice.'), 1)
  assert.ok(fn.saidRatio('Chicken stew with rice.', 'Sure! Here is a lovely description: chicken stew with rice.') < 0.85)
  assert.equal(fn.cleanLines(new Array(19).fill('a')), null)
  assert.equal(fn.cleanLines(['a'.repeat(300), 'b'.repeat(300)]).length, 2)
  const src = read('netlify/functions/ai-assist.js')
  assert.match(src, /gpt-realtime-2\.1-mini/)
  assert.doesNotMatch(src, /v1\/audio\/speech/)
  assert.ok(src.includes("['photos', 'lunch_video', 'voice', 'explain'].includes(task) ? 'lead'"))
})

test('AI voice is laid out scene by scene, each long enough to see', async () => {
  const { layVoice } = await import('../src/lib/aiVoiceLayout.js')
  const rate = 1000
  const { marks, duration } = layVoice([new Float32Array(3000), new Float32Array(500), new Float32Array(1000)], rate, 2)
  assert.deepEqual(marks.map((m) => m.i), [0, 1, 2])
  assert.ok(Math.abs(marks[1].at - 3.55) < 0.01)
  assert.ok(Math.abs(marks[2].at - 5.95) < 0.01)
  assert.ok(duration >= 5.95 + 4.5 - 0.01)
})

test('the AI voice says kwacha, percent and times the way people say them', async () => {
  const fn = await import('../netlify/functions/ai-assist.js')
  assert.equal(fn.spoken('From K133 a lunch'), 'From one hundred and thirty-three kwacha a lunch')
  assert.equal(fn.spoken('K1,234.50'), 'one thousand two hundred and thirty-four kwacha and fifty ngwee')
  assert.equal(fn.spoken('5+ lunches: 10% off'), '5 or more lunches: 10 percent off')
  assert.equal(fn.spoken('Order by 18:00'), "Order by six o'clock")
  assert.equal(fn.saidRatio(fn.spoken('The week is K650.'), 'The week is 650 kwacha.'), 1)
  assert.match(read('netlify/functions/ai-assist.js'), /speakChecked\(apiKey, spoken\(t\)/)
})

test('a video being made can be cancelled', () => {
  const j = read('src/lib/videoJobs.js')
  assert.match(j, /export async function cancelVideo/)
  assert.match(read('src/lib/videoRender.js'), /if \(stopped\(\)\) throw new Error\('CANCELLED'\)/)
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /onClick=\{\(\) => cancelVideo\(v\.id\)\}>Cancel/)
})

test('lunch openings: food first by default, busy day, or the clock', () => {
  const lv = read('src/lib/listingVideo.js')
  assert.match(lv, /openings\[item\.opening\] \|\| \(item\.opening === 'clock' \? null : openings\.food\)/)
  for (const f of ['function drawHookFood', 'function drawHookBusy']) assert.ok(lv.includes(f), f)
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /localStorage\.getItem\('zm-video-opening'\) \|\| 'food'/)
})

test('cancelling never marks the phone as unable to make videos quickly', () => {
  const r = read('src/lib/videoRender.js')
  assert.ok(r.indexOf("e?.message === 'CANCELLED'") < r.indexOf('fastFailed()', r.indexOf('catch (e)')))
})

test('my videos fold into one bar; a nasheed can be added to a finished video without remaking it', () => {
  const m = read('src/pages/admin/VideoMaker.jsx')
  assert.match(m, /className=\{`vx-videos-bar/)
  assert.match(m, /Add it to this video/)
  const n = read('src/lib/videoNasheed.js')
  assert.match(n, /EncodedVideoPacketSource\(track\.codec\)/) // picture copied, not re-made
  assert.match(n, /duckUnder\(voice, bed\)/)
  assert.match(read('src/lib/videoRender.js'), /duckUnder\(voice, bed\)/)
})

test('marketplace videos are designed scenes, not random photos with words', () => {
  const lv = read('src/lib/listingVideo.js')
  for (const f of ['function drawWall', 'function drawBig', 'function drawShopPhone', 'function drawTiles', 'function drawSteps']) assert.ok(lv.includes(f), f)
  const m = lv.slice(lv.indexOf('function marketScript'), lv.indexOf('function marketScript') + 9000)
  assert.doesNotMatch(m, /type: 'collage'/)
  assert.match(m, /Earnings depend on completed sales/)
})

test('content tools: explain-it videos, photo slides, today’s post', async () => {
  const fn = await import('../netlify/functions/ai-assist.js')
  const r = fn.safeExplain({ question: 'Thinking of an Evoque? Watch this first.', scenes: [
    { kicker: 'Generation', line: 'First generation, built 2011 to 2018', say: 'This 2016 car is the first-generation Evoque, built from 2011 to 2018.', photo: 0 },
    { kicker: 'Known issue', line: 'Check the 9-speed gearbox for jerky shifts', say: 'Some owners report hesitant shifts on the 9-speed automatic. On the test drive, pull away gently and feel each change.', photo: 9 },
    { kicker: 'Condition', line: 'This car is accident-free and reliable', say: 'x', photo: 1 },
    { kicker: 'Price', line: 'Only K285,000', say: 'Great value at K285,000.', photo: 1 },
    { kicker: 'Wow', line: 'The best SUV ever made', say: 'Amazing.', photo: 1 },
  ], caption: 'c' }, 3)
  assert.deepEqual(r.scenes.map((x) => x.line), ['First generation, built 2011 to 2018', 'Check the 9-speed gearbox for jerky shifts'])
  assert.equal(r.scenes[1].photo, -1)
  const m = read('src/pages/admin/VideoMaker.jsx')
  assert.match(m, /\['explain', 'Explain it'\]/)
  assert.match(m, /function PhotoSlides/)
  assert.match(m, /const PLAN = \{/)
  assert.match(m, /markUsed\(pick\?\.id\)/)
  assert.match(read('src/lib/listingVideo.js'), /export function explainScenes/)
})

test('find customers: its own section, uses the leads list, seller reports by function', () => {
  const p = read('src/pages/marketing/CustomerFinder.jsx')
  for (const t of ["['today', 'Today']", "['offices', 'Offices']", "['people', 'People I know']", "['referrals', 'Referrals']", "['sellers', 'Seller reports']"]) assert.ok(p.includes(t), t)
  assert.match(p, /Never a blast/)
  assert.doesNotMatch(p, /free tasting/i) // no offer the business has not made
  assert.match(read('src/App.jsx'), /path="find-customers" element=\{<Guard roles=\{\['founder','ops','marketing'\]\}><CustomerFinder/)
  const sql = read('supabase/migrations/20261120a_find_customers_REVIEW.sql')
  assert.match(sql, /if not public\.is_staff\(\) then raise exception 'Staff only'/)
  assert.match(sql, /add column if not exists list text/)
})

test('real numbers: one staff-only function, visit to money, nothing estimated', () => {
  const sql = read('supabase/migrations/20261120b_growth_numbers_REVIEW.sql')
  assert.match(sql, /if not public\.is_staff\(\) then raise exception 'Staff only'/)
  for (const k of ["'visitors'", "'askers'", "'contacted'", "'paid_orders'", "'sales'", "'lunch_paid'", "'channels'", "'weeks'"]) assert.ok(sql.includes(k), k)
  assert.match(read('src/pages/marketing/CustomerFinder.jsx'), /\['results', 'Real numbers'\]/)
})

test('seller offer page and a plainer affiliate page, both honest', () => {
  const g = read('src/pages/public/GrowWithUs.jsx')
  assert.match(g, /We only earn when you sell/)
  assert.match(g, /Every seller is reviewed/)
  assert.doesNotMatch(g, /commission|our fee is|\bfee on top/i) // no marketplace economics shown to the public
  assert.match(read('src/App.jsx'), /path="\/grow" element=\{<GrowWithUs \/>\}/)
  const a = read('src/pages/public/AffiliateRecruitment.jsx')
  assert.match(a, /What is affiliate marketing\?/)
  assert.match(a, /These numbers are only an example/)
  assert.match(a, /Nobody can promise income/)
})

test('Meta Pixel: off until an ID is saved, events only, no personal details', async () => {
  const a = read('src/lib/analytics.js')
  assert.match(a, /const PIXEL = \/\^\\d\{10,20\}\$\//)
  for (const e of ["'PageView'", "'ViewContent'", "'AddToCart'", "'InitiateCheckout'", "'Purchase'", "'Contact'", "'Lead'"]) assert.ok(a.includes(e), e)
  assert.doesNotMatch(a, /fbq\('init', id, \{/) // no advanced matching (no email or phone sent)
  assert.match(read('src/pages/public/Marketplace.jsx'), /startTracking\(siteSettings\)/)
  const sql = read('supabase/migrations/20261120c_meta_pixel_REVIEW.sql')
  assert.match(sql, /'meta_pixel_id', '""'/)
  assert.match(sql, /key <> ''founder_emails''/)
})

test('vehicle units are written the way they are said', async () => {
  const { spoken } = await import('../netlify/functions/ai-assist.js')
  assert.equal(spoken('2.8L Turbo Diesel'), 'two point eight litre Turbo Diesel')
  assert.equal(spoken('93,000 km'), 'ninety-three thousand kilometres')
  assert.equal(spoken('4x4'), 'four by four')
})

test('prices are always read in kwacha, even before a comma', async () => {
  const { spoken } = await import('../netlify/functions/ai-assist.js')
  assert.equal(spoken('Asking K799,000, negotiable.'), 'Asking seven hundred and ninety-nine thousand kwacha, negotiable.')
  assert.equal(spoken('K1.2 million'), 'one million two hundred thousand kwacha')
  assert.equal(spoken('Price: K799 000.'), 'Price: seven hundred and ninety-nine thousand kwacha.')
  assert.equal(spoken('ZMW 385,000'), 'three hundred and eighty-five thousand kwacha')
  assert.equal(spoken('4K TV'), '4K TV')
})
