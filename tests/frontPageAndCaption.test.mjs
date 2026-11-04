import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { frontPageOrder, justAdded } from '../src/lib/frontPage.js'

const P = (id, vendor, daysOld = 0, photo = true) => ({
  id, vendor_id: vendor, images: photo ? ['x'] : [],
  created_at: new Date(Date.now() - daysOld * 864e5).toISOString(),
  description: 'a real description of the product', name: id,
})

// One seller uploading a lot used to own the entire first screen.
test('the front page gives every seller a turn before anyone gets a second', () => {
  const products = [
    ...Array.from({ length: 12 }, (_, i) => P(`a${i}`, 'A')),
    ...Array.from({ length: 3 }, (_, i) => P(`b${i}`, 'B', 7)),
    ...Array.from({ length: 2 }, (_, i) => P(`c${i}`, 'C', 40)),
  ]
  const first = frontPageOrder(products, { day: '2026-11-04' }).slice(0, 3)
  assert.equal(new Set(first.map((p) => p.vendor_id)).size, 3, 'first three must be three different sellers')
  assert.equal(frontPageOrder(products).length, products.length, 'nothing may be dropped')
})

test('a product with no photograph stays off the front row', () => {
  const products = [...Array.from({ length: 10 }, (_, i) => P(`p${i}`, 'A')), P('bare', 'B', 0, false)]
  const front = frontPageOrder(products, { day: '2026-11-04' })
  assert.ok(!front.slice(0, 8).some((p) => p.id === 'bare'))
  assert.ok(front.some((p) => p.id === 'bare'), 'but it is still in the list, not deleted')
})

test('too few photographed products relaxes the rule rather than emptying the page', () => {
  const products = [P('a', 'A'), P('b', 'B', 0, false), P('c', 'C', 0, false)]
  assert.equal(frontPageOrder(products).length, 3)
})

test('the order is fixed for a day and changes the next', () => {
  const products = Array.from({ length: 9 }, (_, i) => P(`p${i}`, `v${i % 3}`))
  const ids = (day) => frontPageOrder(products, { day }).map((p) => p.id).join(',')
  assert.equal(ids('2026-11-04'), ids('2026-11-04'), 'stable within a day')
  assert.notEqual(ids('2026-11-04'), ids('2026-11-05'), 'moves overnight')
})

test('"Just added" is still newest first, which is where that belongs', () => {
  const products = [P('old', 'A', 30), P('new', 'A', 0), P('mid', 'A', 10)]
  assert.deepEqual(justAdded(products, 3).map((p) => p.id), ['new', 'mid', 'old'])
})

// The caption is what people actually read. It was cutting sentences at 64
// characters with an ellipsis, so a post ended halfway through a thought.
const src = readFileSync(new URL('../src/lib/productPoster.js', import.meta.url), 'utf8')
const pick = (name) => { const i = src.indexOf(name); return src.slice(i, src.indexOf('\n}\n', i) + 3) }

test('captions are complete sentences and always carry the link', async () => {
  const mod = `const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const money = (v) => 'K' + Number(v||0).toFixed(2)
${pick('function tidy')}
${pick('export function savingOf')}
${pick('export function fulfilmentOf')}
${pick('export function sellingPoints')}
${pick('export function productCaption')}`
  const f = join(mkdtempSync(join(tmpdir(), 'cap-')), 'm.mjs')
  writeFileSync(f, mod)
  const { productCaption, sellingPoints } = await import(`file://${f}`)

  const long = 'Mess free counters - all produce and processed produce and juices drop straight into the sealed catch tray below'
  const product = { name: 'Vegetable Chopper', price: 450, fulfilment: 'in_stock', benefits: ['• ' + long, '...Dishwasher safe'] }
  const caption = productCaption({ product, link: 'https://zamarket.shop/x' })

  assert.ok(!caption.includes('…'), 'nothing may be cut off in a caption')
  assert.ok(caption.includes(long), 'the full sentence must survive')
  assert.ok(caption.includes('Order here: https://zamarket.shop/x'), 'the link must be there')
  assert.ok(!/^[•·\-–—.\s]*[•·\-–—.]/m.test(caption.replace(/^• /gm, '')), 'no stray leading bullets or dashes')

  // The poster still has a physical limit, but skips long lines instead of
  // cutting them in half.
  const lines = sellingPoints(product, 4, 64)
  assert.ok(lines.every((l) => l.length <= 64))
  assert.ok(lines.includes('Dishwasher safe'))
})
