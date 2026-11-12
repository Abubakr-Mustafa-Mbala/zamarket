import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')
const css = read('src/styles.css')
const page = read('src/pages/public/Marketplace.jsx')

const num = (re) => Number((css.match(re) || [])[1])

test('the buy bar is drawn above the bottom navigation, not behind it', () => {
  // Both bars were fixed to bottom: 0 and the navigation had the higher
  // z-index, so on a phone the price and the buy buttons were rendered and
  // then completely covered. A shopper who tapped a product had no visible
  // way to buy it.
  const bar = css.slice(css.indexOf('.mobile-buybar { display: flex'))
  assert.match(bar, /bottom: calc\(var\(--shop-nav-h, 62px\) \+ env\(safe-area-inset-bottom, 0px\)\)/)
  assert.doesNotMatch(bar.slice(0, 400), /bottom: 0;/)
})

test('the buy bar stays under the navigation in the stack, so menus still open over it', () => {
  const navZ = num(/\.bottom-bar \{ position: fixed;[^}]*z-index: (\d+)/)
  const barZ = num(/\.mobile-buybar \{ display: flex;[^}]*z-index: (\d+)/)
  assert.ok(navZ > 0 && barZ > 0, 'could not read the z-indexes')
  assert.ok(barZ < navZ, `buy bar (${barZ}) should stack under the nav (${navZ})`)
})

test('the page leaves room so the last content is not hidden under two bars', () => {
  assert.match(css, /\.pdp \{ padding-bottom: 150px; \}/)
})

test('only the homepage displays the category rail', () => {
  // It pushed the price off the first screen of a phone.
  assert.match(page, /pathname === '\/' && <CategoryRail \/>/)
})

test('the product photograph is shown at its own shape on a phone', () => {
  // A square frame around a wide photo left a dead band above and below.
  assert.match(css, /\.pdp \.main-img, \.shop \.product-page \.gallery \{ aspect-ratio: auto; \}/)
  assert.match(css, /max-height: 58vh/)
})

test('product cards fill their frame instead of letterboxing', () => {
  // contain left bars down the sides of any photo that was not square.
  assert.match(css, /\.shop \.pcard \.pimg img \{ object-fit: cover; object-position: center; \}/)
  assert.doesNotMatch(css, /\.shop \.pcard \.pimg img \{ object-fit: contain; \}/)
})

test('the buy bar still carries the price and both ways to buy', () => {
  const bar = page.slice(page.indexOf('className="mobile-buybar"'), page.indexOf('className="mobile-buybar"') + 400)
  assert.match(bar, /<Price value=\{p\.price\} \/>/)
  assert.match(bar, /onClick=\{addToCart\}/)
  assert.match(bar, /onClick=\{buyNow\}/)
})
