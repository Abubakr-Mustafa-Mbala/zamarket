import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { departmentShelves, frontPageOrder } from '../src/lib/frontPage.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

let n = 0
const item = (category, vendor, extra = {}) => ({
  id: `p${++n}`, category, vendor_id: vendor, name: `${category} item ${n}`,
  images: ['https://example.test/a.jpg'], price: 100, status: 'published',
  created_at: '2026-10-01T00:00:00Z', ...extra,
})

// The shop Abubakr actually has: a bakery, a cleaning supplier, a hardware
// shop and an electronics shop, each with a few things.
function catalogue() {
  n = 0
  return [
    ...Array.from({ length: 4 }, () => item('Food & cakes', 'bakery')),
    ...Array.from({ length: 4 }, () => item('Home & kitchen', 'cleaners')),
    ...Array.from({ length: 4 }, () => item('Tools & hardware', 'hardware')),
    ...Array.from({ length: 4 }, () => item('Phones & electronics', 'phones')),
  ]
}

test('a shelf only ever contains one department', () => {
  for (const shelf of departmentShelves(catalogue())) {
    if (shelf.mixed) continue
    const kinds = new Set(shelf.items.map((p) => p.category))
    assert.equal(kinds.size, 1, `"${shelf.name}" mixed ${[...kinds].join(', ')}`)
    assert.equal([...kinds][0], shelf.name)
  }
})

test('a cake never lands next to a toilet cleaner or a bench saw', () => {
  const shelves = departmentShelves(catalogue())
  const cakeShelf = shelves.find((s) => s.name === 'Food & cakes')
  assert.ok(cakeShelf, 'food should get its own shelf')
  for (const p of cakeShelf.items) assert.equal(p.category, 'Food & cakes')
})

test('every product still reaches the page through some shelf', () => {
  const products = catalogue()
  const shown = new Set(departmentShelves(products).flatMap((s) => s.items.map((p) => p.id)))
  for (const p of products) assert.ok(shown.has(p.id), `${p.name} vanished`)
})

test('a department too thin to fill a shelf joins the mixed one instead of disappearing', () => {
  const products = [...catalogue(), item('Vehicles', 'motors')] // a single car
  const shelves = departmentShelves(products)
  assert.ok(!shelves.some((s) => s.name === 'Vehicles'), 'one car is not a department')
  const mixed = shelves.find((s) => s.mixed)
  assert.ok(mixed, 'there should be a mixed shelf for the leftovers')
  assert.ok(mixed.items.some((p) => p.category === 'Vehicles'), 'the car must still be shown')
})

test('sellers still take turns inside a department', () => {
  n = 0
  const products = [
    ...Array.from({ length: 6 }, () => item('Food & cakes', 'big-bakery')),
    ...Array.from({ length: 2 }, () => item('Food & cakes', 'small-bakery')),
  ]
  const shelf = departmentShelves(products, { minimum: 0 }).find((s) => s.name === 'Food & cakes')
  // The small bakery must appear within the first few, not be buried at the
  // end because the big one uploaded more.
  const firstSmall = shelf.items.findIndex((p) => p.vendor_id === 'small-bakery')
  assert.ok(firstSmall >= 0 && firstSmall <= 2, `small seller buried at position ${firstSmall}`)
})

test('a department stocked by several shops leads over a one-shop department', () => {
  n = 0
  const products = [
    ...Array.from({ length: 3 }, () => item('Food & cakes', 'bakery-a')),
    ...Array.from({ length: 3 }, () => item('Food & cakes', 'bakery-b')),
    ...Array.from({ length: 6 }, () => item('Tools & hardware', 'one-shop')),
  ]
  for (const day of ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) {
    const shelves = departmentShelves(products, { day })
    assert.equal(shelves[0].name, 'Food & cakes', `wrong lead shelf on ${day}`)
  }
})

test('the arrangement is fixed for a day and changes the next', () => {
  const products = catalogue()
  const a = departmentShelves(products, { day: '2026-11-05' }).map((s) => s.name)
  const again = departmentShelves(products, { day: '2026-11-05' }).map((s) => s.name)
  assert.deepEqual(a, again, 'the same day must give the same page')
  const week = new Set(
    ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']
      .map((day) => departmentShelves(products, { day }).map((s) => s.name).join('>')),
  )
  assert.ok(week.size > 1, 'the order should move over a week')
})

test('products without a photograph stay off the front page while there are enough with one', () => {
  n = 0
  const products = [
    ...Array.from({ length: 8 }, () => item('Food & cakes', 'bakery')),
    ...Array.from({ length: 3 }, () => item('Food & cakes', 'bakery', { images: [] })),
  ]
  const shelf = departmentShelves(products).find((s) => s.name === 'Food & cakes')
  for (const p of shelf.items) assert.ok(p.images?.[0], 'a photoless listing reached the front page')
})

test('a nearly empty marketplace is not broken into lonely shelves', () => {
  n = 0
  const products = [item('Food & cakes', 'bakery'), item('Fashion', 'tailor')]
  assert.ok(departmentShelves(products).length < 2, 'two products should not make two shelves')
  // The homepage falls back to the single mixed row in that case.
  assert.equal(frontPageOrder(products).length, 2)
})

test('the homepage renders shelves and falls back when there are too few', () => {
  const page = read('../src/pages/public/Marketplace.jsx')
  // The hand-picked window is held out of the shelves so nothing repeats.
  assert.match(page, /const shelves = departmentShelves\(products, \{ excludeIds: pickedIds \}\)/)
  assert.match(page, /const useShelves = shelves\.length >= 2/)
  assert.match(page, /className="home-dept"/)
  // Each shelf heading links into that department rather than to everything.
  assert.match(page, /\/search\?cat=\$\{encodeURIComponent\(s\.name\)\}/)
  // Nothing already shown should be repeated by the merchandised rows below.
  assert.match(page, /excludeIds=\{shownIds\}/)
})
