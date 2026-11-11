import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { productShareUrl } from '../src/lib/affiliateLinks.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('vehicle showroom is part of public ZaMarket routing and vehicle pages remain enquiries', () => {
  assert.match(read('../src/App.jsx'), /path="\/motors"/)
  assert.match(read('../src/pages/public/Offering.jsx'), /VehicleShowroom/)
  assert.match(read('../src/pages/public/Offering.jsx'), /Enquire about this vehicle/)
})

test('normal public product sharing preserves approved affiliate attribution', () => {
  assert.equal(productShareUrl('https://zamarket.shop', { slug: 'carrot-cake' }, 'reseller', 'ABU1'), 'https://zamarket.shop/r/abu1/carrot-cake')
  assert.equal(productShareUrl('https://zamarket.shop', { slug: 'carrot-cake' }, 'customer', 'ABU1'), 'https://zamarket.shop/p/carrot-cake')
  assert.match(read('../src/pages/public/Marketplace.jsx'), /productShareUrl\(window.location.origin, p, role, code\)/)
})

test('new product poster styles avoid dark empty panels and clipping extra angles', () => {
  const art = read('../src/lib/productPoster.js')
  assert.match(art, /function editorialPalette/)
  assert.match(art, /function containRounded/)
  // The benefits panel is sized to its contents, and the photograph takes
  // the room left over, so a product with one benefit no longer prints a
  // tall empty band above the footer.
  assert.match(art, /const panelH = shown\.length \? Math\.round/)
  assert.match(art, /const imgH = Math\.max\(Math\.round\(body \* 0\.36\)/)
  assert.match(art, /product\?\.offering_type !== 'vehicle'/)
})

test('affiliate marketing copy does not promise unconditional delivery in Lusaka', () => {
  const kit = read('../src/lib/promoKit.js')
  assert.doesNotMatch(kit, /`Delivered in Lusaka/)
  assert.match(kit, /Confirm delivery or collection options/)
  assert.match(kit, /View details and arrange an enquiry through ZaMarket/)
})

test('account recovery and Google linking preserve existing identities', () => {
  const auth = read('../src/pages/public/Auth.jsx')
  assert.match(auth, /resetPasswordForEmail/)
  assert.match(auth, /linkIdentity/)
  assert.match(auth, /updateUser\(\{ password \}\)/)
})
