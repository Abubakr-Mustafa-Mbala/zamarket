import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { vehicleSeo } from '../netlify/edge-functions/seo.js'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('vehicle pages get a search-friendly title, real facts and Car structured data', () => {
  const r = vehicleSeo({ name: 'x', price: 385000, status: 'published', images: [],
    page: { vehicle: { make: 'Toyota', model: 'Hilux', year: 2016, mileage_km: '148000', transmission: 'Manual', fuel: 'Diesel', location: 'Lusaka', price_note: '', features: ['Tow bar', 'Air conditioning'] } } }, 'https://zamarket.shop/p/hilux')
  assert.match(r.title, /^2016 Toyota Hilux for sale in Lusaka — K385,000 \| ZaMarket Motors$/)
  assert.ok(!/negotiable/i.test(r.description), 'no price wording when the seller gave none')
  assert.match(r.description, /148,000 km, manual, diesel/)
  assert.deepEqual(r.schema['@type'], ['Product', 'Car'])
  assert.equal(r.schema.mileageFromOdometer.value, 148000)
  assert.equal(r.schema.offers.availability, 'https://schema.org/InStock')
  const sold = vehicleSeo({ name: 'x', price: 1, status: 'out_of_stock', page: { vehicle: { make: 'Toyota' } } }, 'u')
  assert.equal(sold.schema.offers.availability, 'https://schema.org/SoldOut')
})

test('visit counting is anonymous, staff-only to read, and skips private pages', () => {
  const sql = read('supabase/migrations/20261116_traffic_tracking_REVIEW.sql')
  assert.match(sql, /revoke all on public\.traffic_events from anon, authenticated/)
  assert.match(sql, /using \(public\.is_staff\(\)\)/)
  assert.match(sql, /if not public\.is_staff\(\) then raise exception 'Staff only'/)
  assert.ok(!/ip_address|phone|email/i.test(sql.replace(/--.*$/gm, '')), 'no personal fields')
  const js = read('src/lib/traffic.js')
  assert.match(js, /PRIVATE_PATHS = \/\^\\\/\(admin\|vendor\|reseller/)
  assert.match(read('src/App.jsx'), /trackVisit\(pathname\)/)
  assert.match(read('src/components/vehicle/VehiclePage.jsx'), /track\('view'/)
})

test('the visitor counting is section 26 of the one-file SQL update', () => {
  assert.match(read('supabase/run-in-supabase.sql'), /SECTION 26 of \d+ — 20261116_traffic_tracking_REVIEW\.sql/)
})

test('the shop shows the weekly lunch board with real plan prices and one order button', () => {
  const s = read('src/components/LunchShop.jsx')
  assert.match(s, /Weekly <span>Office Lunches<\/span>/)
  assert.match(s, /packagePrice\(weeks, wi, 'week', menu, deal\)/)
  assert.match(s, /Order your weekly lunch today/)
  // On the store itself only the round highlight shows; it opens the lunch page.
  assert.match(read('src/pages/public/Marketplace.jsx'), /highlights=\{<OfferHighlights vendorId=\{store\.id\} store=\{store\} \/>\}/)
})

test('team discounts follow the best tier per delivery day and match what the database charges', async () => {
  const L = await import('../src/lib/lunch.js')
  const tiers = [{ min: 10, pct: 8 }, { min: 5, pct: 5 }, { min: 1, pct: 50 }, { min: 3, pct: 40 }]
  assert.deepEqual(L.cleanTiers(tiers).map((t) => [t.min, t.pct]), [[3, 10], [5, 5], [10, 8]].sort((a, b) => a[0] - b[0]))
  assert.equal(L.groupPct([{ min: 5, pct: 5 }, { min: 10, pct: 8 }], 4), 0)
  assert.equal(L.groupPct([{ min: 5, pct: 5 }, { min: 10, pct: 8 }], 6), 5)
  assert.equal(L.groupPct([{ min: 5, pct: 5 }, { min: 10, pct: 8 }], 12), 8)
  const menu = [{ date: 'a', dishes: [{ id: 'x', price: 133 }] }, { date: 'b', dishes: [{ id: 'x', price: 133 }] }]
  const t = L.planTotals({ a: { x: 10 }, b: { x: 1 } }, menu, [{ min: 5, pct: 5 }, { min: 10, pct: 8 }])
  assert.deepEqual({ ...t, byDate: undefined }, { lunches: 11, total: 1356.6, days: 2, subtotal: 1463, discount: 106.4, byDate: undefined })
  const sql = read('supabase/migrations/20261116_lunch_team_discounts_REVIEW.sql')
  assert.match(sql, /Only ZaMarket can set team discounts/)
  assert.match(sql, /> 10 then raise exception/)
  assert.match(sql, /request text check \(request is null or length\(request\) <= 300\)/)
})


test('weekly packages: full week, Monday to Thursday, two weeks, and removing a day lowers the price', async () => {
  const L = await import('../src/lib/lunch.js')
  const deal = { cutoff_hour: 18, dishes: [{ product_id: 'a' }, { product_id: 'b' }], day_discounts: [{ min: 5, pct: 5 }] }
  const products = [{ id: 'a', price: 83, order_days: [1, 3, 5] }, { id: 'b', price: 90, order_days: [2, 4] }]
  const menu = L.upcomingMenu({ deal, products, days: 21, now: new Date('2026-11-17T15:00:00Z') })
  const weeks = L.workingWeeks(menu)
  assert.equal(weeks[0].start, '2026-11-16')
  assert.deepEqual(weeks[0].days.map((d) => d.open), [false, false, true, true, true])
  const full = L.packagePrice(weeks, 1, 'week', menu, deal)
  assert.equal(full.dates.length, 5)
  assert.equal(full.before, 83 * 3 + 90 * 2)
  assert.equal(full.total, Math.round(full.before * 95) / 100)
  const four = L.packagePrice(weeks, 1, 'monthu', menu, deal)
  assert.equal(four.dates.length, 4)
  assert.equal(four.discount, 0, 'four days is below the 5-day package discount')
  assert.equal(L.packagePrice(weeks, 1, 'two', menu, deal).dates.length, 10)
  const less = L.planTotals(L.picksFromDates(full.dates.slice(0, 4), menu), menu, [], deal.day_discounts)
  assert.ok(less.total < full.total)
  assert.equal(L.matchPackage(weeks, 1, full.dates.slice(0, 4)), 'monthu')
  assert.equal(L.matchPackage(weeks, 1, [full.dates[0], full.dates[2]]), 'custom')
})

test('lunch-only dishes stay out of the shop, can only be ordered through a plan, and bookings are not duplicated', () => {
  const sql = read('supabase/migrations/20261117_weekly_lunch_REVIEW.sql')
  assert.match(sql, /and not coalesce\(p\.lunch_only, false\);/)
  assert.match(sql, /create or replace view public_lunch_dishes/)
  assert.match(sql, /This dish is ordered through the weekly lunch page/)
  assert.match(sql, /perform set_config\('zamarket\.meal_plan', 'on', true\)/)
  assert.match(sql, /select \* into old from meal_plans where client_ref = v_ref/)
  assert.match(sql, /Paying after the first lunch is for first orders/)
  assert.match(sql, /Only ZaMarket can set lunch discounts/)
  const page = read('src/pages/public/Lunch.jsx')
  assert.match(page, /client_ref: ref/)
  assert.match(page, /Nothing is charged on this page/)
  assert.match(read('src/lib/lunchData.js'), /public_lunch_dishes/)
})
