import test from 'node:test'
import assert from 'node:assert/strict'
import { studioExportPlan, isActualOffer, isRecentProduct } from '../src/lib/studioPlan.js'

const recent = { id: 1, name: 'Handmade cake', price: 120, normal_price: 140, slug: 'cake', images: ['cake.jpg'], created_at: new Date().toISOString() }
const old = { id: 2, name: 'Phone', price: 2200, normal_price: null, slug: 'phone', images: [], created_at: '2020-01-01T00:00:00Z' }

test('genuine offers and new arrivals are driven by actual product data', () => {
  assert.equal(isActualOffer(recent), true)
  assert.equal(isActualOffer(old), false)
  assert.equal(isActualOffer({price: 20, normal_price: ''}), false)
  assert.equal(isActualOffer({price: -2, normal_price: 15}), false)
  assert.equal(isRecentProduct(recent), true)
  assert.equal(isRecentProduct(old), false)
})
test('adverts use the JPEG renderer format and only one featured product', () => {
  const x = studioExportPlan('hero', [recent, old], 'story')
  assert.equal(x.mime, 'image/jpeg')
  assert.equal(x.extension, 'jpg')
  assert.equal(x.format, 'story')
  assert.equal(x.multi, false)
  assert.deepEqual(x.products.map(p => p.id), [recent.id])
})
test('price lists remain multi-page PNGs', () => {
  const x = studioExportPlan('priceList', [recent, old], 'a4')
  assert.equal(x.mime, 'image/png')
  assert.equal(x.extension, 'png')
  assert.equal(x.multi, true)
})
test('collections are capped to four products so content stays legible', () => {
  const x = studioExportPlan('collection', Array(10).fill(recent), 'post')
  assert.equal(x.products.length, 4)
  assert.equal(x.format, 'portrait')
})
test('new-arrival design rejects old listings rather than claiming they are new', () => {
  assert.throws(() => studioExportPlan('arrival', [old]), /last 21 days/)
  assert.doesNotThrow(() => studioExportPlan('arrival', [recent]))
})
test('offer ad requires a verified price comparison', () => {
  assert.throws(() => studioExportPlan('offer', [old]), /genuine saving/)
  assert.doesNotThrow(() => studioExportPlan('offer', [recent]))
})
test('photo-first premium template requires a real product photo', () => {
  assert.throws(() => studioExportPlan('dark', [old]), /photograph/)
})
test('unknown template and empty selection give actionable errors', () => {
  assert.throws(() => studioExportPlan('nope', [recent]), /Unknown/)
  assert.throws(() => studioExportPlan('hero', []), /Choose at least one/)
})
