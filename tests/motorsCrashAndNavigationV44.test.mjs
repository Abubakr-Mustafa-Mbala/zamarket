import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Motors hero handles the first render when vehicle data is not available yet', () => {
  const src = read('src/pages/public/Motors.jsx')
  // cars is null on the first render: every use of it is guarded.
  assert.match(src, /\(cars \|\| \[\]\)/)
  assert.match(src, /cars === null \? <Loading/)
  const card = read('src/components/vehicle/VehicleCard.jsx')
  assert.match(card, /Array\.isArray\(p\?\.images\)/)
  const lib = read('src/lib/vehicle.js')
  assert.match(lib, /Array\.isArray\(page\.specs\)/)
  assert.match(lib, /page\.location_text/)
  // A meaningful empty list and a retry when data is unavailable.
  assert.match(src, /No vehicles match these filters/)
  assert.match(src, /Vehicles could not be loaded/)
})

test('top links are destinations, product departments appear only once on home', () => {
  const src = read('src/pages/public/Marketplace.jsx')
  const nav = src.split('<nav className="dept-strip"')[1]?.split('</nav>')[0] || ''
  assert.match(nav, /to="\/motors"/)
  assert.match(nav, /to="\/blog"/)
  assert.match(nav, /to="\/sellers"/)
  assert.match(nav, /to="\/search\?deals=1"/)
  assert.doesNotMatch(nav, /stocked\.map|search\?cat=/)
  assert.match(src, /\{pathname === '\/' && <CategoryRail \/>\}/)
})
