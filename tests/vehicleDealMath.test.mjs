import test from 'node:test'
import assert from 'node:assert/strict'
import { vehicleDealBreakdown } from '../src/lib/vehicleDealMath.js'

test('5 percent seller fee with no affiliate: ZaMarket retains all of it', () => {
  assert.deepEqual(vehicleDealBreakdown(100000, 5, 50, false), {
    salePrice: 100000, grossFee: 5000, affiliateEarns: 0, marketplaceKeeps: 5000, sellerReceives: 95000,
  })
})

test('10 percent seller fee split equally with attributed affiliate', () => {
  assert.deepEqual(vehicleDealBreakdown(100000, 10, 50, true), {
    salePrice: 100000, grossFee: 10000, affiliateEarns: 5000, marketplaceKeeps: 5000, sellerReceives: 90000,
  })
})

test('deal uses negotiated closing price, not original advertised price', () => {
  const x = vehicleDealBreakdown(85000, 10, 40, true)
  assert.equal(x.grossFee, 8500)
  assert.equal(x.affiliateEarns, 3400)
  assert.equal(x.marketplaceKeeps, 5100)
})

test('the affiliate cannot receive more than seller agreed fee', () => {
  const x = vehicleDealBreakdown(100000, 5, 100, true)
  assert.equal(x.affiliateEarns, x.grossFee)
  assert.equal(x.marketplaceKeeps, 0)
  assert.throws(() => vehicleDealBreakdown(100000, 5, 125, true))
})
