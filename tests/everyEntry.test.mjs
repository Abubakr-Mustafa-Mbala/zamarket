import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const page = read('../src/pages/public/Giveaway.jsx')
const css = read('../src/giveaway-premium.css')
const sql = read('../supabase/migrations/20261105_all_entries_on_wheel_REVIEW.sql')

test('everybody who entered reaches the wheel, not a sample of 300', () => {
  assert.match(sql, /limit 20000/)
  assert.doesNotMatch(sql, /order by created_at limit 300/)
  assert.match(page, /const NAME_CAP = 20000/)
})

test('the winner marker is its own layer, so it cannot be clamped away', () => {
  // Appended to the ring's gradient it sat after larger angles, and a
  // conic-gradient collapses an out-of-order stop to nothing.
  assert.match(page, /const wedge = useMemo/)
  assert.match(page, /className="gw-winner-wedge"/)
  assert.match(css, /\.gw-winner-wedge \{ position: absolute; inset: 0;/)
  const ring = page.slice(page.indexOf('const ring = useMemo'), page.indexOf('const wedge = useMemo'))
  assert.doesNotMatch(ring, /f3cb83/, 'the gold must not be inside the ring gradient')
})

test('the marker is wide enough to see however many entered', () => {
  assert.match(page, /Math\.max\(per, 1\.6\)/)
})

test('the spin builds instead of one flat slowdown', () => {
  assert.match(page, /const SPIN_MS = 11000/)
  assert.match(page, /Math\.cos\(2 \* Math\.PI \* 2\.1 \* t\)/)   // the surges
  assert.match(page, /requestAnimationFrame\(run\)/)
  // Position must only ever increase, or the wheel appears to turn back.
  assert.match(page, /Math\.max\(0, speed/)
})

test('the name shown while spinning is the one actually under the pointer', () => {
  assert.match(page, /const under = useMemo/)
  assert.match(page, /slots\[Math\.floor\(at \/ per\) % slots\.length\]/)
  assert.match(page, /<strong>\{under\}<\/strong>/)
})

test('anyone can find their own name in the full entry list', () => {
  assert.match(page, /function EntryList/)
  assert.match(page, /placeholder="Find your name"/)
  assert.match(page, /<EntryList names=\{names\}/)
  // Rows need a fixed height: inside a max-height the grid squeezed 600
  // names down to six pixels each and the overflow clip hid them.
  assert.match(css, /grid-auto-rows: 22px/)
  assert.match(css, /\.gw-entries-grid li \{[^}]*line-height: 22px/)
})
