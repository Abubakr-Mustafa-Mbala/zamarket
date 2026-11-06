import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pickedForFront, departmentShelves } from '../src/lib/frontPage.js'

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const read = (p) => readFileSync(at(p), 'utf8')
const sql = read('supabase/migrations/20261106_front_page_and_delete_REVIEW.sql')
const page = read('src/pages/public/Marketplace.jsx')
const picker = read('src/pages/marketing/FrontPage.jsx')

let n = 0
const item = (over = {}) => ({
  id: `p${++n}`, name: `Item ${n}`, category: 'Food & cakes',
  vendor_id: 'v1', images: ['https://example.test/a.jpg'], ...over,
})

test('picked products come back in the order chosen, not any other', () => {
  const products = [
    item({ id: 'a', front_rank: 3 }),
    item({ id: 'b' }),                 // not picked
    item({ id: 'c', front_rank: 1 }),
    item({ id: 'd', front_rank: 2 }),
  ]
  assert.deepEqual(pickedForFront(products).map((p) => p.id), ['c', 'd', 'a'])
})

test('nothing picked means nothing changes', () => {
  assert.deepEqual(pickedForFront([item(), item()]), [])
})

test('rank 0 is a real position, not "unpicked"', () => {
  // A falsy-but-valid rank must not be treated as absent.
  const products = [item({ id: 'z', front_rank: 0 }), item({ id: 'y', front_rank: 1 })]
  assert.deepEqual(pickedForFront(products).map((p) => p.id), ['z', 'y'])
})

test('a picked product is not shown twice on the page', () => {
  const products = Array.from({ length: 12 }, (_, i) => item({ id: `x${i}`, vendor_id: `v${i % 3}` }))
  products[0].front_rank = 1
  products[1].front_rank = 2
  const picked = pickedForFront(products)
  const shelves = departmentShelves(products, { excludeIds: new Set(picked.map((p) => p.id)) })
  const onShelves = shelves.flatMap((s) => s.items.map((p) => p.id))
  for (const p of picked) {
    assert.ok(!onShelves.includes(p.id), `${p.id} appears in the window and again below`)
  }
})

test('everything not picked still reaches the page', () => {
  const products = Array.from({ length: 12 }, (_, i) => item({ id: `y${i}`, vendor_id: `v${i % 3}` }))
  products[0].front_rank = 1
  const shelves = departmentShelves(products, { excludeIds: new Set(['y0']) })
  const shown = new Set(shelves.flatMap((s) => s.items.map((p) => p.id)))
  for (const p of products.slice(1)) assert.ok(shown.has(p.id), `${p.id} vanished`)
})

test('the homepage puts the pick above everything else', () => {
  assert.match(page, /const picked = pickedForFront\(products\)/)
  assert.match(page, /aria-label="Picked for the front page"/)
  // and holds it out of the automatic rows below
  assert.match(page, /departmentShelves\(products, \{ excludeIds: pickedIds \}\)/)
  assert.match(page, /frontPageOrder\(products\.filter\(\(p\) => !pickedIds\.has\(p\.id\)\)\)/)
})

test('only something a shopper can open may be featured', () => {
  assert.match(sql, /Only published products from approved sellers can go on the front page/)
  assert.match(sql, /p\.status in \('published', 'out_of_stock'\)/)
  assert.match(sql, /\(p\.vendor_id is null or v\.status = 'approved'\)/)
})

test('setting the front page replaces it rather than adding to it', () => {
  assert.match(sql, /update products set front_rank = null where front_rank is not null;/)
  assert.match(sql, /with ordinality/)
})

test('only staff may change the front page', () => {
  assert.match(sql, /if not is_staff\(\) then raise exception 'Not allowed'; end if;/)
})

test('a product with history is archived, never deleted', () => {
  // Orders, settlements and stock counts already refer to it. Deleting the
  // row would tear a hole in records that have been counted.
  for (const table of ['order_items', 'inventory_movements', 'purchase_items', 'reviews', 'giveaway_prizes']) {
    assert.match(sql, new RegExp(`from ${table} where product_id = p_id`), `${table} is not checked`)
  }
  assert.match(sql, /set status = 'suspended', front_rank = null, featured_in_store = false/)
  assert.match(sql, /'removed', false, 'archived', true/)
})

test('a product with no history really is deleted', () => {
  assert.match(sql, /delete from products where id = p_id;/)
  assert.match(sql, /'removed', true, 'archived', false/)
})

test('both outcomes are written to the audit log', () => {
  assert.match(sql, /log_audit\('product\.archived'/)
  assert.match(sql, /log_audit\('product\.deleted'/)
})

test('the screen asks before removing and reports what actually happened', () => {
  const products = read('src/pages/admin/Products.jsx')
  assert.match(products, /window\.confirm\(/)
  assert.match(products, /rpc\('delete_product', \{ p_id: p\.id \}\)/)
  // The database decides delete vs archive, so the toast must use its answer
  // rather than claiming a delete that did not happen.
  assert.match(products, /toast\(data\?\.message \|\| 'Done'\)/)
})

test('the picker saves the order and can clear it', () => {
  assert.match(picker, /rpc\('set_front_page', \{ p_ids: picked \}\)/)
  assert.match(picker, /Clear all/)
  // Save is only offered when something actually changed.
  assert.match(picker, /disabled=\{busy \|\| !dirty\}/)
})

test('products with no department are surfaced and fixable in one choice', () => {
  // A blank department means the product counts toward no category tile and
  // belongs to no shelf: it exists, it is for sale, and nobody browsing can
  // reach it. Nothing in the app flagged that before.
  assert.match(picker, /function NeedsADepartment/)
  assert.match(picker, /!String\(p\.category \|\| ''\)\.trim\(\)/)
  assert.match(picker, /from\('products'\)\.update\(\{ category \}\)\.eq\('id', id\)/)
  // Choices come from the shop's own department list, not a hardcoded one.
  assert.match(picker, /useDepartments/)
  assert.match(picker, /options=\{departments\.map\(\(d\) => d\.name\)\}/)
})

test('the warning disappears when there is nothing to fix', () => {
  assert.match(picker, /if \(!stray\.length\) return null/)
})

test('the homepage still gets the chosen order onto the products', () => {
  // The rank now arrives from its own view, so it has to be merged back on
  // before anything downstream reads p.front_rank.
  assert.match(page, /from\('front_page_picks'\)\.select\('id,front_rank'\)/)
  assert.match(page, /if \(ranks\.size\) for \(const p of products\) if \(ranks\.has\(p\.id\)\) p\.front_rank = ranks\.get\(p\.id\)/)
})

test('a failed picks fetch does not take the shop down', () => {
  // Same rule as offers and vendors: only products are essential.
  assert.match(page, /optional\(picksResult, 'front page picks'\)/)
})
