import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { STUDIO_TOOLS, studioExportPlan } from '../src/lib/studioPlan.js'
const read = p => readFileSync(new URL('../'+p, import.meta.url), 'utf8')
const data = { name: 'Blender', price: 250, images: ['first.jpg','fourth.jpg','fifth.jpg'] }
test('only four approved poster choices are offered', () => {
  for (const key of ['hero','gallery','catalogue','split']) assert.ok(STUDIO_TOOLS[key])
  assert.equal(STUDIO_TOOLS.sheet, undefined)
})
test('new catalogue and split designs accept genuine product photos', () => {
  assert.equal(studioExportPlan('catalogue',[data]).tool,'catalogue')
  assert.equal(studioExportPlan('split',[data]).tool,'split')
})
test('the selected product photo is passed into the shared poster engine', () => {
  const renderer=read('src/lib/productPoster.js')
  const share=read('src/components/ShareProduct.jsx')
  const affiliate=read('src/components/PromoKit.jsx')
  assert.match(renderer,/selectedPhoto = null/)
  assert.match(renderer,/allPicks\.includes\(selectedPhoto\)/)
  assert.match(share,/selectedPhoto, product\?\.id/)
  assert.match(affiliate,/design: composition\?\.key, selectedPhoto/)
})
test('product pages scroll to their gallery and modal stays inside phone width', () => {
  assert.match(read('src/pages/public/Marketplace.jsx'), /window\.scrollTo\(\{ top: 0, left: 0/)
  assert.match(read('src/refinements.css'), /\.modal \{ border-radius: 0; width: 100vw/)
})
