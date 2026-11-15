import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  vehicleOf, vehicleTitle, vehicleFacts, specsFrom, factLine, listingChecks, normaliseVehicle, bodyGroup,
  whatsappNumber, whatsappText, whatsappLink, filterVehicles, sortVehicles, km,
} from '../src/lib/vehicle.js'

const read = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

const hilux = {
  id: 'a', slug: 'hilux', name: 'old name', price: 185000, created_at: '2026-11-10',
  page: { vehicle: { make: 'Toyota', model: 'Hilux', variant: '2.8 GD-6', year: '2016', body: 'Pickup (double cab)', mileage_km: '98000', transmission: 'Manual', fuel: 'Diesel', drive: '4x4', location: 'Lusaka', features: ['Tow bar'] } },
}
const vitz = {
  id: 'b', slug: 'vitz', name: 'Toyota Vitz 2014', price: 85000, created_at: '2026-11-12',
  page: { location_text: 'Ndola', specs: [{ label: 'Make', value: 'Toyota' }, { label: 'Model', value: 'Vitz' }, { label: 'Year', value: '2014' }, { label: 'Mileage (km)', value: '120,500' }, { label: 'Transmission', value: 'Automatic' }, { label: 'Fuel type', value: 'Petrol' }, { label: 'Body type', value: 'Hatchback' }] },
}

test('a vehicle reads the same from the new fields and from older hand-typed specs', () => {
  assert.equal(vehicleTitle(vehicleOf(hilux)), '2016 Toyota Hilux 2.8 GD-6')
  const old = vehicleOf(vitz)
  assert.equal(vehicleTitle(old), '2014 Toyota Vitz')
  assert.equal(old.mileage_km, '120500')
  assert.equal(old.location, 'Ndola')
  assert.equal(km(old.mileage_km), '120,500 km')
})

test('facts come out in the order buyers ask, and empty fields are never shown', () => {
  const facts = vehicleFacts(vehicleOf(hilux))
  assert.deepEqual(facts.slice(0, 4).map((f) => f.value), ['2016', '98,000 km', 'Manual', 'Diesel'])
  assert.ok(!facts.some((f) => f.key === 'colour'))
  assert.equal(factLine(vehicleOf(hilux)), '2016 · 98,000 km · Manual · Diesel')
  assert.deepEqual(specsFrom(vehicleOf(hilux))[0], { label: 'Year', value: '2016' })
})

test('a listing needs photos, make, model, year, price, mileage, gearbox, fuel and town', () => {
  const v = vehicleOf(hilux)
  assert.ok(listingChecks(v, { price: 185000, images: ['x'] }).every((c) => c.done))
  const missing = listingChecks({ make: 'Toyota' }, { price: 0, images: [] }).filter((c) => !c.done).map((c) => c.key)
  assert.deepEqual(missing, ['photos', 'make', 'year', 'price', 'mileage', 'transmission', 'fuel', 'location'])
})

test('saving keeps only filled fields and strips mileage to digits', () => {
  const out = normaliseVehicle({ make: ' Toyota ', model: '', mileage_km: '98,000 km', features: ['A', 'A', ' '], negotiable: false })
  assert.deepEqual(out, { make: 'Toyota', mileage_km: '98000', features: ['A'], negotiable: false })
})

test('body types fall into the showroom groups', () => {
  assert.equal(bodyGroup('Pickup (double cab)'), 'Pickups')
  assert.equal(bodyGroup('SUV'), 'SUVs')
  assert.equal(bodyGroup('Van / minibus'), 'Vans & buses')
  assert.equal(bodyGroup('Truck'), 'Trucks')
  assert.equal(bodyGroup('Hatchback'), 'Cars')
})

test('WhatsApp goes to the Zambian number with the vehicle, the question and the link', () => {
  assert.equal(whatsappNumber('0977 123 456'), '260977123456')
  assert.equal(whatsappNumber('+260 97 7123456'), '260977123456')
  assert.equal(whatsappNumber(''), '')
  const text = whatsappText({ title: '2016 Toyota Hilux', price: 'K185,000', link: 'https://zamarket.shop/r/amy/hilux', question: 'Is it still available?' })
  assert.match(text, /2016 Toyota Hilux \(K185,000\)/)
  assert.match(text, /\/r\/amy\/hilux/)
  assert.match(whatsappLink('0977123456', text), /^https:\/\/wa\.me\/260977123456\?text=/)
  assert.equal(whatsappLink('', text), '')
})

test('showroom filters and sorting', () => {
  const list = [hilux, vitz]
  assert.deepEqual(filterVehicles(list, { group: 'Pickups' }).map((p) => p.id), ['a'])
  assert.deepEqual(filterVehicles(list, { maxPrice: 100000 }).map((p) => p.id), ['b'])
  assert.deepEqual(filterVehicles(list, { transmission: 'Automatic' }).map((p) => p.id), ['b'])
  assert.deepEqual(filterVehicles(list, { minYear: 2015 }).map((p) => p.id), ['a'])
  assert.deepEqual(filterVehicles(list, { q: 'ndola' }).map((p) => p.id), ['b'])
  assert.deepEqual(sortVehicles(list, 'price_asc').map((p) => p.id), ['b', 'a'])
  assert.deepEqual(sortVehicles(list, 'year_desc').map((p) => p.id), ['a', 'b'])
  assert.deepEqual(sortVehicles(list, 'mileage_asc').map((p) => p.id), ['a', 'b'])
  assert.deepEqual(sortVehicles(list).map((p) => p.id), ['b', 'a'])
})

test('vehicle enquiries are recorded as deals so affiliates are credited, and the fee is never added to the price', () => {
  const ed = read('src/pages/shared/VehicleEditor.jsx')
  assert.match(ed, /sales_model: 'negotiate'/)
  assert.doesNotMatch(ed, /vendor_price/)
  const page = read('src/components/vehicle/VehiclePage.jsx')
  assert.match(page, /rpc\('submit_enquiry'/)
  assert.match(page, /referral_code: register \? affiliateCode : a\.referral_code/)
  // The private seller agreement is staff-only.
  assert.match(ed, /\{isStaff && \(\s*<Step n=\{7\} title="Seller agreement · private"/)
})

test('vehicle pages and listing form are wired in', () => {
  const app = read('src/App.jsx')
  assert.equal((app.match(/path="vehicles\/:id" element=\{<VehicleEditor \/>\}/g) || []).length, 2)
  assert.match(read('src/pages/public/Offering.jsx'), /offering_type === 'vehicle' \? <VehiclePage p=\{props\.p\} \/>/)
  assert.match(read('src/pages/admin/OfferingBuilder.jsx'), /vehicles\/\$\{p\.id\}/)
})

test('the showroom shows only what ZaMarket lists: no public "send us your car" section', () => {
  const m = read('src/pages/public/Motors.jsx')
  assert.doesNotMatch(m, /Selling a vehicle\?|Send us your car|Tell us what you want/)
  assert.match(m, /No vehicles listed right now/)
  assert.match(m, /const showTools = \(cars \|\| \[\]\)\.length >= 6/)
})

test('affiliates see their own vehicle buyers, register buyers, and staff can credit an affiliate', () => {
  const sql = read('supabase/migrations/20261114_vehicle_affiliate_deals_REVIEW.sql')
  assert.match(sql, /where r\.user_id = auth\.uid\(\) and r\.status = 'approved'/)
  assert.match(sql, /right\(regexp_replace\(d\.customer_phone/)
  assert.doesNotMatch(sql.slice(0, sql.indexOf('set_deal_affiliate')), /fee_pct/)
  assert.match(sql, /if not is_staff\(\) then raise exception/)
  assert.match(sql, /if d\.status = 'closed' then raise exception/)
  assert.match(sql, /cannot be credited for buying themselves/)
  assert.match(read('supabase/run-in-supabase.sql'), /SECTION 24 of 25 — 20261114_vehicle_affiliate_deals_REVIEW\.sql/)
  assert.match(read('src/pages/reseller/Vehicles.jsx'), /rpc\('my_vehicle_deals'\)/)
  assert.match(read('src/components/vehicle/VehiclePage.jsx'), /referral_code: register \? affiliateCode : a\.referral_code/)
  assert.match(read('src/pages/admin/Deals.jsx'), /rpc\('set_deal_affiliate'/)
})

test('a vehicle post uses only the listing facts and the link', async () => {
  const { vehiclePostText } = await import('../src/lib/vehicle.js')
  const t = vehiclePostText(hilux, vehicleOf(hilux), 'https://zamarket.shop/r/ann/hilux')
  assert.match(t, /2016 Toyota Hilux 2\.8 GD-6 for sale/)
  assert.match(t, /K185,000 \(negotiable\)/)
  assert.match(t, /2016 · 98,000 km · Manual · Diesel/)
  assert.match(t, /📍 Lusaka/)
  assert.match(t, /\/r\/ann\/hilux$/)
})

test('the founder can see photos large, put a live product on hold, or send it back with a note', () => {
  const r = read('src/components/ProductReview.jsx')
  assert.match(r, /<PhotoViewer images=\{images\}/)
  assert.match(r, /setAsking\('suspended'\)/)
  assert.match(r, /setAsking\('rejected'\)/)
  assert.match(r, /'Put back live'/)
  const ed = read('src/pages/admin/Products.jsx')
  assert.match(ed, /<ProductReview p=\{p\}/)
  assert.match(ed, /save\(status, \{ rejection_reason: reason \}\)/)
  assert.match(ed, /<ProductPreview draft=\{p\}/)
  const v = read('src/pages/vendor/Vendor.jsx')
  assert.match(v, /'On hold: '/)
  assert.match(read('src/pages/shared/VehicleEditor.jsx'), /holdOrReturn\(live \? 'suspended' : 'rejected'\)/)
})

test('a product preview reads the form without saving', async () => {
  const src = read('src/components/ProductPreview.jsx')
  assert.doesNotMatch(src, /from\('products'\)/)
  assert.match(src, /rpc\('price_preview'/)
})

test('lunch plans: dates, cut-off, totals and affiliate earnings', async () => {
  const L = await import('../src/lib/lunch.js')
  // 17:00 in Lusaka on Sun 22 Nov 2026 (15:00 UTC): tomorrow is still open at an 18:00 cut-off
  const before = new Date('2026-11-22T15:00:00Z')
  const after = new Date('2026-11-22T17:30:00Z') // 19:30 in Lusaka
  assert.equal(L.firstBookable(18, before), '2026-11-23')
  assert.equal(L.firstBookable(18, after), '2026-11-24')
  const deal = { cutoff_hour: 18, dishes: [{ product_id: 'a' }, { product_id: 'b', kind: 'tray', serves: '5' }] }
  const products = [
    { id: 'a', name: 'Chicken stew', price: 133, order_days: [1, 2], daily_limit: 3, lead_time_days: 1 },
    { id: 'b', name: 'Beef tray', price: 600, order_days: [1], daily_limit: 2, lead_time_days: 1 },
  ]
  const availability = [{ product_id: 'a', day: '2026-11-23', day_limit: 3, booked: 3 }, { product_id: 'b', day: '2026-11-23', day_limit: 2, booked: 1 }]
  const menu = L.upcomingMenu({ deal, products, availability, days: 3, now: before })
  assert.deepEqual(menu.map((d) => d.date), ['2026-11-23', '2026-11-24'])
  const mon = menu[0].dishes
  assert.equal(mon.find((x) => x.id === 'a').soldOut, true)
  assert.equal(mon.find((x) => x.id === 'b').remaining, 1)
  assert.equal(mon.find((x) => x.id === 'b').kind, 'tray')
  const picks = { '2026-11-23': { b: 1 }, '2026-11-24': { a: 2 } }
  assert.deepEqual(L.planTotals(picks, menu), { lunches: 3, total: 866, days: 2 })
  assert.deepEqual(L.planPayloadDays(picks), [{ date: '2026-11-23', items: [{ product_id: 'b', quantity: 1 }] }, { date: '2026-11-24', items: [{ product_id: 'a', quantity: 2 }] }])
  assert.equal(L.fromPrice(products, deal), 133)
  const earn = L.affiliateEarnings(10, [{ dishes: [{ price: 130 }, { price: 150 }] }])
  assert.deepEqual(earn, { perLunch: 14, week: 70, month: 308 })
  assert.equal(L.affiliateEarnings(0, menu), null)
})

test('lunch plans: one order per day, staff-only payment and rates, and shoppers never see the rate', () => {
  const sql = read('supabase/migrations/20261115_lunch_plans_REVIEW.sql')
  assert.match(sql, /r := place_order\(jsonb_build_object\(/)
  assert.match(sql, /update orders set meal_plan_id = plan\.id/)
  assert.match(sql, /v_date = v_today \+ 1 and v_hour >= d\.cutoff_hour/)
  assert.match(sql, /if v_pct > v_cap then raise exception/)
  assert.match(sql, /revoke select on public\.meal_deals from anon;/)
  assert.doesNotMatch(sql.match(/grant select \(([^)]*)\)\s+on public\.meal_deals to anon/)[1], /affiliate_pct/)
  assert.match(sql, /create policy meal_plans_read on public\.meal_plans for select using \(is_staff\(\)\);/)
  assert.match(read('supabase/run-in-supabase.sql'), /SECTION 25 of 25 — 20261115_lunch_plans_REVIEW\.sql/)
  const page = read('src/pages/public/Lunch.jsx')
  assert.match(page, /rpc\('place_meal_plan'/)
  assert.match(page, /referral_code: a\.referral_code/)
  assert.doesNotMatch(page, /affiliate_pct/)
  assert.match(read('netlify/edge-functions/seo.js'), /parts\[0\] === 'r' && parts\.length === 4 && parts\[2\] === 'lunch'/)
})
