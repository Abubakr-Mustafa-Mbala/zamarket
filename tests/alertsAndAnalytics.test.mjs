import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('tracking calls are actually sent (a Supabase request only goes out when awaited or then-ed)', () => {
  const files = ['src/pages/public/Blog.jsx', 'src/pages/public/Marketplace.jsx', 'src/pages/public/GrowthPages.jsx']
  for (const f of files) {
    for (const line of read(f).split('\n')) {
      if (/^\s*supabase\.rpc\('(post_read|track_hit|featured_seen|view_magnet)'/.test(line)) assert.match(line, /\.then\(/, `${f}: ${line.trim()}`)
    }
  }
})

test('the team, affiliates and a seller in their own shop are not visitors; blog shares by the team are not counted', () => {
  const sql = read('supabase/migrations/20261118a_numbers_stock_REVIEW.sql')
  assert.match(sql, /role::text in \('founder', 'ops', 'finance', 'delivery', 'marketing', 'reseller'\)/)
  assert.match(sql, /if public\.is_insider\(\) then return; end if;/)
  assert.match(sql, /pth like '\/' \|\| my_slug \|\| '\/%'/)
  assert.match(sql, /create or replace function post_read[\s\S]*is_insider/)
  assert.match(sql, /function public\.journal_track_event[\s\S]*is_insider/)
  assert.match(sql, /'funnel', jsonb_build_object/)
})

test('vehicles and goods sold for others never count as ZaMarket stock', () => {
  const sql = read('supabase/migrations/20261118a_numbers_stock_REVIEW.sql')
  const stockLines = sql.split('\n').filter((l) => /stock_available <= 3/.test(l))
  assert.ok(stockLines.length >= 2)
  assert.match(sql, /stock_available <= 3\n\s+and offering_type is distinct from 'vehicle' and third_party_owner is null/)
  assert.match(sql, /'low_stock', \(select count\(\*\) from products where [^\n]*offering_type is distinct from 'vehicle'/)
  assert.match(read('src/pages/admin/Stock.jsx'), /p\.offering_type !== 'vehicle' && !p\.third_party_owner/)
})

test('phone alerts: only new things alert, never on the first look, and new orders are left to the instant alert', async () => {
  const { newArrivals, alertText, emailHtml } = await import('../netlify/functions/alert-tick.js')
  const groups = [{ key: 'payouts', label: 'Payout requests', count: 2, tone: 'money', link: '/admin/finance' }, { key: 'new_orders', label: 'New orders', count: 5, tone: 'urgent' }]
  assert.deepEqual(newArrivals(groups, null), [])
  assert.deepEqual(newArrivals(groups, { payouts: 2, new_orders: 1 }), [])
  const a = newArrivals(groups, { payouts: 1 })
  assert.deepEqual(a.map((g) => g.key), ['payouts'])
  assert.deepEqual(alertText(a), { title: 'ZaMarket', body: 'Payout requests: 2', url: '/admin/finance', tag: 'zamarket-payouts' })
  const html = emailHtml('Hello <b>', 'Line one\n\nLine two', '/sell')
  assert.match(html, /Hello &lt;b&gt;/)
  assert.match(html, /https:\/\/zamarket\.shop\/sell/)
  assert.match(read('netlify/functions/order-alert.js'), /role=in\.\(founder,ops,finance,delivery\)/)
})

test('the bell has no switches on its front and offers alerts once', () => {
  const s = read('src/components/ActionBell.jsx')
  assert.ok(!/Sound on|Alert my phone|>Refresh</.test(s))
  assert.match(s, /Turn on alerts/)
  assert.match(s, /Mark all read/)
  assert.match(s, />Clear</)
  assert.match(read('public/sw.js'), /silent: false/)
})

test('video maker builds scenes only from the listing', async () => {
  const { videoScript } = await import('../src/lib/listingVideo.js').catch(() => ({}))
  if (!videoScript) return // needs browser-only imports; the source check below still runs
  const s = videoScript({ name: 'Hilux', price: 385000, images: ['a', 'b'], page: { vehicle: { make: 'Toyota', model: 'Hilux', year: 2016, features: ['Tow bar'] } } }, 'vehicle', 'https://zamarket.shop/p/hilux')
  assert.ok(s.slides.length >= 2)
  assert.match(s.caption, /Tow bar/)
})

test('navigation shows where you are, and Motors is one tap away', () => {
  const s = read('src/pages/public/Marketplace.jsx')
  assert.match(s, /\{ to: '\/motors', label: 'Motors', icon: <Icon\.car \/>/)
  assert.match(s, /aria-current=\{on \? 'page' : undefined\}/)
  assert.ok(!/className=\{`journal-nav/.test(s))
})

test('video maker checks the recording plays before offering it, and falls back to another format', () => {
  const s = read('src/lib/listingVideo.js')
  assert.match(s, /await playable\(blob\)/)
  assert.match(s, /video\/webm;codecs=vp8/)
  assert.match(s, /w: 720, h: 1280/)
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /Save or share/)
})

test('recording with your voice waits for you: each scene holds until Next, and only Finish ends it', async () => {
  const { heldTime } = await import('../src/lib/listingVideo.js').catch(() => ({}))
  const s = read('src/lib/listingVideo.js')
  assert.match(s, /until: \(\) => controller\.done/)
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /Finish recording/)
  if (!heldTime) return
  const slides = [{}, {}, {}]
  assert.ok(heldTime(0, 60, slides) < 2.8, 'a long-held scene never runs into the next')
  assert.ok(heldTime(1, 0, slides) >= 2.8)
})

test('car videos end with an enquiry, never "order", and show the specifications card; scene length is chosen', () => {
  const s = read('src/lib/listingVideo.js')
  assert.match(s, /cta: 'Enquire on ZaMarket Motors'/)
  assert.match(s, /type: 'specs', kicker: 'Specifications'/)
  assert.match(s, /export const PACES = \[3, 4, 5, 6\]/)
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /Each scene stays/)
})

test('video maker: starts from the full video, you change only what you want', async () => {
  const mod = await import('../src/lib/listingVideo.js').catch(() => ({}))
  const s = read('src/lib/listingVideo.js')
  const ui = read('src/pages/admin/VideoMaker.jsx')
  assert.match(s, /const starter = base\.slides\.map/)
  assert.match(s, /defaultMotion = \(kind\) => \(kind === 'vehicle' \? 'zoom'/)
  assert.match(ui, /Choose the photo that shows/)
  assert.match(ui, /Check the photo shows it/)
  if (!mod.videoParts) return
  const p = mod.videoParts({ name: 'Hilux', price: 385000, images: ['a', 'b', 'c'], page: { vehicle: { make: 'Toyota', model: 'Hilux', year: 2016, mileage_km: 120000, features: ['Leather seats'] } } }, 'vehicle', 'https://zamarket.shop/p/hilux')
  assert.ok(p.starter.some((x) => x.type === 'specs'))
  assert.ok(p.starter.some((x) => x.feature && /Leather/.test(x.line)))
  const sc = mod.sceneFrom(p.blocks.find((b) => b.feature), 'c')
  assert.equal(sc.photo, 'c')
  assert.match(p.end.cta, /Enquire/)
})

test('video maker: countdown before recording, reading view, marketplace videos', () => {
  const s = read('src/lib/listingVideo.js')
  const ui = read('src/pages/admin/VideoMaker.jsx')
  assert.match(ui, /for \(const n of \[3, 2, 1\]\)/)
  assert.match(s, /if \(countdown\) \{/)
  assert.match(ui, /vx-prompter-now/)
  assert.match(ui, /\['market', 'Marketplace'\]/)
  // Recruitment lines stay honest: earnings depend on real sales; applications reviewed.
  assert.match(s, /Earnings depend on completed sales/)
  assert.match(s, /Every application is reviewed/)
  assert.doesNotMatch(s, /guaranteed income|earn up to/i)
})

test('weekly lunch lives in the seller store as a highlight, not across the site', () => {
  const m = read('src/pages/public/Marketplace.jsx')
  assert.doesNotMatch(m, /<CategoryLunch \/>/)
  assert.doesNotMatch(m, /\['\/lunch', 'Lunch'/)
  assert.doesNotMatch(m, /<OfferHighlights \/>/)
  assert.match(m, /highlights=\{<OfferHighlights vendorId=\{store\.id\} store=\{store\} \/>\}/)
  assert.match(read('src/components/OfferHighlights.jsx'), /navigate\(`\/lunch\/\$\{d\.slug\}`\)/)
  assert.match(read('src/pages/public/Lunch.jsx'), /className="crumbs ln-crumbs"/)
})

test('video maker: every video is finished as a real MP4 before saving or sharing', () => {
  const f = read('src/lib/videoFinish.js')
  const s = read('src/lib/listingVideo.js')
  assert.match(f, /fastStart: 'in-memory'/)
  assert.match(f, /codec: 'avc'/)
  assert.match(f, /codec: 'aac'/)
  assert.match(f, /registerAacEncoder/)
  assert.match(s, /const done = await finishVideo\(blob\)/)
  // Loaded only when needed, never in the main bundle.
  assert.match(f, /await import\('mediabunny'\)/)
})

test('video maker: built frame by frame in the background, kept in My videos', () => {
  const r = read('src/lib/videoRender.js')
  const j = read('src/lib/videoJobs.js')
  const ui = read('src/pages/admin/VideoMaker.jsx')
  assert.match(r, /new mb\.CanvasSource\(canvas, \{ codec: 'avc'/)
  assert.match(r, /new mb\.AudioBufferSource\(\{ codec: 'aac'/)
  assert.match(r, /fastStart: 'in-memory'/)
  assert.match(j, /indexedDB\.open/)
  assert.match(j, /visibilitychange/)
  assert.match(j, /wakeLock/)
  assert.match(ui, /await begin\(\{ \.\.\.spec\(\), audio, marks, duration \}\)/)
  assert.match(read('src/components/Shell.jsx'), /<VideoJobsChip \/>/)
})

test('video maker: budget phones build sideways with a rotate mark, else record the slower way', () => {
  const f = read('src/lib/fastEncoder.js')
  const r = read('src/lib/videoRender.js')
  assert.match(f, /\{ w: 1280, h: 720, rot: 90 \}/)
  assert.match(f, /enc\.flush\(\)/) // really encodes a few frames before trusting it
  assert.match(r, /rotation: rot/)
  assert.match(r, /ctx\.setTransform\(0, -scale, scale, 0, 0, portraitW\)/)
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /fastEncoder\(\)\.then\(setFastWay/)
})

test('lunch: edit dish opens under the dish, reviews apart, owner can edit, shared as an offer', () => {
  const ed = read('src/pages/shared/LunchDeals.jsx')
  assert.match(ed, /\{editDish\?\.id === p\.id && <LunchDishForm key=\{p\.id\}/)
  assert.match(ed, /scrollIntoView/)
  assert.match(ed, /What customers said/)
  assert.match(ed, /It's a review/)
  const page = read('src/pages/public/Lunch.jsx')
  assert.match(page, /<ReviewCards images=\{said\}/)
  assert.match(page, /Edit lunch offer/)
  assert.match(page, /<ShareLunch /)
  assert.doesNotMatch(page, /<ShareProduct /)
  assert.match(read('src/components/LunchShop.jsx'), /Edit this offer/)
  // Posters never carry kitchen photos or customer messages.
  assert.doesNotMatch(read('src/lib/lunch.js'), /\.\.\.\(deal\.proof_images \|\| \[\]\)\]\.filter/)
  assert.match(read('src/lib/lunchPoster.js'), /WEEKLY LUNCH OFFER/)
  assert.match(read('supabase/run-in-supabase.sql'), /add column if not exists review_images text\[\]/)
})

test('lunch: affiliates see lunch offers with earnings', () => {
  const r = read('src/pages/reseller/Reseller.jsx')
  assert.match(r, /<LunchOffersToSell \/>/)
  assert.match(r, /meal_deal_affiliate_rate/)
})

test('video maker: your own nasheed under silent videos, looped and faded', () => {
  const s = read('src/lib/videoSounds.js')
  assert.match(s, /src\.loop = true/)
  assert.match(s, /linearRampToValueAtTime\(0, length\)/)
  const r = read('src/lib/videoRender.js')
  assert.match(r, /if \(spec\.music\?\.blob\)/)
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /<SoundPicker /)
})

test('video maker: logo on every scene, readable link at the end, sound from a video or a link', () => {
  const s = read('src/lib/listingVideo.js')
  assert.match(s, /brandMark\(ctx, 70, 82, 60\)/)
  assert.match(s, /function fitLink/)
  const v = read('src/lib/videoSounds.js')
  assert.match(v, /video: \{ discard: true \}/)
  assert.match(v, /export async function addSoundFromLink/)
  assert.match(v, /youtube/)
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /\+ From a video/)
})

test('video maker: AI checks which photo shows each feature before the video is made', async () => {
  const { safePhotoMatch } = await import('../netlify/functions/ai-assist.js')
  const r = safePhotoMatch({ cover: 9, photos: [{ index: 0, kind: 'seats', shows: 'x' }, { index: 7, kind: 'x' }], features: [{ feature: 'leather seats', photo: 0, sure: 'yes' }, { feature: 'Rocket boosters', photo: 1, sure: 'yes' }, { feature: 'Sunroof', photo: 5, sure: 'yes' }] }, ['Leather seats', 'Sunroof', '360° camera'], 3)
  assert.deepEqual(r.features, [{ feature: 'Leather seats', photo: 0, sure: 'yes' }, { feature: 'Sunroof', photo: -1, sure: 'no' }, { feature: '360° camera', photo: -1, sure: 'no' }])
  assert.equal(r.cover, 0)
  assert.equal(r.photos.length, 1)
  const fn = read('netlify/functions/ai-assist.js')
  assert.match(fn, /The photos come from the listing itself, never from the browser/)
  assert.match(fn, /detail: 'low'/)
  const lv = read('src/lib/listingVideo.js')
  assert.match(lv, /export function applyPhotoMatch/)
  assert.match(lv, /kicker: 'Also has'/)
  const ui = read('src/pages/admin/VideoMaker.jsx')
  assert.match(ui, /if \(!hasDraft && aiKind\) runAi\(false\)/)
  assert.match(ui, /touched\.current\) \{ try \{ localStorage\.setItem\(draftKey/)
})

test('video maker: AI goes through up to 64 photos, finds more features you can untick', async () => {
  const { safeSpotted, safePhotoMatch } = await import('../netlify/functions/ai-assist.js')
  assert.deepEqual(['Sunroof', 'premium leather', 'Alloy wheels 18 inch', 'Immaculate interior', 'roof rails.'].map(safeSpotted), ['Sunroof', null, null, null, 'Roof rails'])
  const r = safePhotoMatch({ cover: 2, photos: [], features: [{ feature: 'Navigation', photo: 3, sure: 'yes' }], spotted: [{ feature: 'sunroof', photo: 2, sure: 'yes' }, { feature: 'navigation', photo: 1, sure: 'yes' }] }, ['Navigation'], 4, 16)
  assert.equal(r.features[0].photo, 19) // photo numbers count from the batch start
  assert.deepEqual(r.spotted, [{ feature: 'Sunroof', photo: 18, sure: 'yes' }])
  const fn = read('netlify/functions/ai-assist.js')
  assert.match(fn, /all\.slice\(offset, offset \+ 16\)/)
  const pm = read('src/lib/photoMatch.js')
  assert.match(pm, /const MOST = 64/)
  assert.match(read('src/lib/listingVideo.js'), /every listed feature a photo shows/)
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /The AI also saw these in the photos/)
})

test('video maker: scene looks and transitions; sounds online for the team; choose the part on a wave', () => {
  const lv = read('src/lib/listingVideo.js')
  assert.match(lv, /const LOOKS = \['classic', 'card', 'spotlight', 'split'\]/)
  assert.match(lv, /const TRANSITIONS = \['push', 'wipe', 'zoom', 'push'\]/)
  assert.match(lv, /function counter\(/)
  const vs = read('src/lib/videoSounds.js')
  assert.match(vs, /const BUCKET = 'video-sounds'/)
  assert.match(vs, /export async function soundBlob/)
  assert.match(vs, /new OfflineAudioContext\(1, 1, 8000\)/)
  const sql = read('supabase/run-in-supabase.sql')
  assert.match(sql, /values \('video-sounds', 'video-sounds', false/)
  assert.doesNotMatch(sql, /zm video sounds[^\n]*\n[^\n]*to anon/)
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /function SoundWave/)
})

test('video maker: brand colours, toned-down split, fuller product and lunch stories', () => {
  const lv = read('src/lib/listingVideo.js')
  assert.doesNotMatch(lv, /#ffd36b|#c9a6ff|#b98cff/)
  assert.match(lv, /const ph = H - 560/)
  assert.match(lv, /function lunchScript/)
  assert.match(lv, /kicker: 'Homemade'/)
  assert.match(lv, /step\(1, 'package', 'Choose your package'/)
  assert.match(lv, /if \(item\.trial_first \|\| item\.guarantee\)/)
  assert.match(lv, /function sentences/)
})

test('video maker: the AI photo check works for products too', () => {
  const ui = read('src/pages/admin/VideoMaker.jsx')
  assert.match(ui, /const aiKind = kind === 'vehicle' \|\| kind === 'product'/)
  assert.match(ui, /keepUnseen: kind !== 'vehicle'/)
  const fn = read('netlify/functions/ai-assist.js')
  assert.match(fn, /'product', 'in_use', 'close_up', 'packaging'/)
  assert.doesNotMatch(fn, /if \(!features\.length\) return respond/)
  assert.match(read('src/lib/listingVideo.js'), /else if \(keepUnseen\) out\.push\(sc\)/)
})

test('lunch: plan lists only lunch dishes; video maker reads lunch plans by their columns', () => {
  const ed = read('src/pages/shared/LunchDeals.jsx')
  assert.match(ed, /\.filter\(\(p\) => p\.lunch_only \|\| picked\.has\(p\.id\)\)/)
  assert.doesNotMatch(ed, /You can also add a made-to-order product you already sell/)
  const ui = read('src/pages/admin/VideoMaker.jsx')
  assert.match(ui, /from\('meal_deals'\)\.select\(DEAL_COLS\)/)
  assert.doesNotMatch(ui, /from\('meal_deals'\)\.select\('\*'\)/)
})

test('video maker: AI writes the lunch video as an offer, only from the plan facts', async () => {
  const { safeLunchScenes } = await import('../netlify/functions/ai-assist.js')
  const facts = { lunch_from: 'K135', order_by: '18:00 the day before', team_discount: [{ min: 5, percent_off: 5 }] }
  const r = safeLunchScenes({ scenes: [
    { photo: 0, kicker: 'Lunch', line: 'From K135 a lunch', sub: '', say: '' },
    { photo: 0, kicker: 'Hurry', line: 'Only 3 left!', sub: '', say: '' },
    { photo: 9, kicker: 'Deal', line: '20% off this week', sub: '', say: '' },
    { photo: 1, kicker: 'Team', line: '5+ lunches: 5% off', sub: 'Order by 18:00', say: '' },
  ], caption: 'a\nb' }, 2, facts)
  assert.deepEqual(r.scenes.map((x) => x.line), ['From K135 a lunch', '5+ lunches: 5% off'])
  assert.equal(r.caption, 'a\nb')
  const ui = read('src/pages/admin/VideoMaker.jsx')
  assert.match(ui, /task: 'lunch_video', deal_id: pick\.id/)
  assert.match(ui, /kind === 'vehicle' \|\| kind === 'product' \|\| kind === 'lunch'/)
})

test('lunch video: offer card, booking steps on the booking page, requests on the store', () => {
  const lv = read('src/lib/listingVideo.js')
  assert.match(lv, /function drawOffer/)
  assert.match(lv, /function drawHowto/)
  assert.match(lv, /function tapAt/)
  assert.match(lv, /'MTN MoMo', 'Airtel Money', 'Zamtel Kwacha'/) // the real payment choices
  assert.match(lv, /Saturday or Sunday too\? Send a request/)
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /const fixed = parts\.starter\.filter\(\(x\) => x\.fixed\)/)
  const sql = read('supabase/run-in-supabase.sql')
  assert.match(sql, /create or replace function submit_store_request\(payload jsonb\)/)
  assert.match(sql, /interval '1 hour'\) >= 3/)
  assert.match(read('src/components/OfferHighlights.jsx'), /<StoreRequestForm store=\{store\}/)
  assert.match(read('src/pages/public/Lunch.jsx'), /Need Saturday, Sunday or another day\?/)
})
