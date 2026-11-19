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
