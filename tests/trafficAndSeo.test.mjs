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
