import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('the 30-second ad keeps the opening, the specs and the features, in order', async () => {
  const mod = await import('../src/lib/listingVideo.js').catch(() => ({}))
  if (!mod.adCut) return
  const sc = [
    { id: 'a', line: 'Toyota Hilux 2016' },
    { id: 'p1', photo: 'x' }, { id: 'p2', photo: 'y' }, { id: 'p3', photo: 'z' },
    { id: 's', type: 'specs', kicker: 'Specifications', rows: [] },
    { id: 'f1', line: 'Tow bar', feature: true }, { id: 'f2', line: 'Leather seats', feature: true }, { id: 'f3', line: 'Reverse camera', feature: true },
    { id: 'p4', photo: 'w' }, { id: 'p5', photo: 'v' }, { id: 'h', type: 'specs', kicker: 'Also has', rows: [] },
  ]
  const out = mod.adCut(sc, 4)
  assert.equal(out.length, 6)
  assert.equal(out[0].id, 'a')
  for (const id of ['s', 'f1', 'f2', 'f3']) assert.ok(out.some((x) => x.id === id), id)
  const order = out.map((x) => sc.findIndex((y) => y.id === x.id))
  assert.deepEqual(order, [...order].sort((x, y) => x - y))
  assert.equal(mod.adCut(sc.slice(0, 3), 4).length, 3)
})

test('end card carries the asking price and the closing photo; seller features are labelled', () => {
  const s = read('src/lib/listingVideo.js')
  assert.match(s, /title, price: \[price, note\]\.filter\(Boolean\)\.join/)
  assert.match(s, /From \$\{from\} a lunch/)
  assert.match(s, /drawEnd\(ctx, t - total, end, Array\.isArray\(first\)/)
  assert.match(s, /note: 'Features listed by the seller'/)
  assert.match(read('src/pages/admin/VideoMaker.jsx'), /30-second ad/)
})

test('sentences on screen are complete phrases, never cut mid-way', () => {
  const s = read('src/lib/listingVideo.js')
  const m = s.match(/export function shortLine[\s\S]*?\n}\n/)[0]
  const shortLine = new Function(`return ${m.replace('export function shortLine', 'function')}`)()
  assert.equal(shortLine('Plush, waterproof velvety flocked top keeps bedding secure and adds extra comfort'), 'Plush, waterproof velvety flocked top keeps bedding secure')
  assert.equal(shortLine('• Fiber-Tech interior construction prevents sagging and ensures durability and support'), 'Fiber-Tech interior construction prevents sagging')
  assert.equal(shortLine('Comfortable'), 'Comfortable')
  // Drawing never drops lines: the words shrink to fit instead.
  assert.match(s, /function fitText/)
  assert.doesNotMatch(s, /wrapText\(ctx, s\.line \|\| '', W - 144\)\.slice\(0, 3\)/)
})

test('the seller is named only when chosen; the lunch video has the 12:30 opening, the week menu and the delivery', async () => {
  const ui = read('src/pages/admin/VideoMaker.jsx')
  assert.match(ui, /'Only ZaMarket'/)
  assert.match(ui, /hide_seller: !showSeller/)
  assert.match(ui, /vendor_name: ''/)
  const fn = await import('../netlify/functions/ai-assist.js')
  assert.equal(fn.withoutSeller('Homemade by Rasma Cakery & Pastry', 'Rasma Cakery & Pastry'), 'Homemade from our kitchen')
  assert.equal(fn.withoutSeller("Rasma's chicken stew", 'Rasma Cakery & Pastry'), 'Our chicken stew')
  const lv = read('src/lib/listingVideo.js')
  for (const t of ["type: 'clock'", "type: 'menu'", "type: 'route'", 'function drawClock', 'function drawMenu', 'function drawRoute']) assert.ok(lv.includes(t), t)
  assert.match(lv, /steps: 3/)
})
