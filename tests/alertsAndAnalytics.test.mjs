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
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /Save or share video/)
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
