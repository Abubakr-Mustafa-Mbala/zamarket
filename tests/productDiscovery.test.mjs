import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSearch, productRelevance, suggestProductSeo } from '../src/lib/productDiscovery.js'
test('normalizes punctuation and case', () => assert.equal(normalizeSearch('  SAMSUNG-Galaxy A15! '), 'samsung galaxy a15'))
test('matches words independently and ranks name above description', () => {
  const a = { name: 'Samsung Galaxy A15', description: '' }
  const b = { name: 'Phone', description: 'Samsung Galaxy A15' }
  assert.ok(productRelevance(a, 'galaxy samsung') > productRelevance(b, 'galaxy samsung'))
  assert.equal(productRelevance(a, 'iphone'), -1)
})
test('SEO suggestions avoid invented stock and delivery promises', () => {
  const seo = suggestProductSeo({ name: 'Solar Lamp', price: 250 })
  assert.match(seo.title, /Solar Lamp/)
  assert.match(seo.description, /K250/)
  assert.doesNotMatch(seo.description, /in stock|same.day|free delivery/i)
})
