import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Motors hero handles the first render when vehicle data is not available yet', () => {
  const src = read('src/pages/public/Motors.jsx')
  // The page calls photoOf(cars?.[0]) on the first render, while cars is null.
  assert.match(src, /photoOf\(cars\?\.\[0\]\)/)
  assert.match(src, /Array\.isArray\(p\?\.images\)/)
  assert.match(src, /Array\.isArray\(specs\)/)
  assert.match(src, /p\?\.page\?\.location_text/)
  // Also preserve a meaningful empty-list and unavailable-data experience.
  assert.match(src, /No matching vehicles yet/)
  assert.match(src, /Vehicles are temporarily unavailable/)
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
