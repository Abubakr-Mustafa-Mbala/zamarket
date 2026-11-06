import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../src/pages/public/Marketplace.jsx', import.meta.url), 'utf8')
test('a missing product list still fails loudly rather than showing an empty shop', () => {
  // The original rule was that a partial failure must never render a shop
  // that looks empty. That still holds for products: if they cannot be
  // fetched there is no marketplace, so the error page is correct.
  assert.match(source, /fetchCataloguePages\(/)
  assert.match(source, /if \(productsResult\.status === 'rejected'\) throw productsResult\.reason/)
})

test('offers or vendors failing does not take the whole marketplace down', () => {
  // public_offers once returned a permission error for logged-out visitors.
  // Because all three queries were awaited with Promise.all, that single
  // failure blanked the entire shop for everyone who was not signed in.
  // Offers only add deal badges and vendors only add the sellers shelf, so
  // neither is worth losing the catalogue over.
  assert.match(source, /Promise\.allSettled\(\[/)
  assert.doesNotMatch(source, /await Promise\.all\(\[/)
  assert.match(source, /const offers = optional\(offersResult, 'offers'\)/)
  assert.match(source, /const vendors = optional\(vendorsResult, 'vendors'\)/)
  // Degrades to an empty list, and says so in the console for debugging.
  assert.match(source, /console\.error\(`Catalogue: \$\{label\} unavailable/)
  assert.match(source, /return \[\]/)
})
test('catalogue provides explicit retry and avoids caching failed responses', () => {
  assert.match(source, /catalogueRequest = \(async \(\) =>/)
  assert.match(source, /\.finally\(\(\) => \{ catalogueRequest = null \}\)/)
  assert.match(source, /retry: \(\) => setAttempt/)
  assert.match(source, /role="alert"/)
})
