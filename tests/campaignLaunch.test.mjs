import test from 'node:test'
import assert from 'node:assert/strict'
import { makeLaunchPack, matchingCampaigns, storefrontPath } from '../src/lib/campaignLaunch.js'

const product = { id: 'p1', slug: 'blue-shoes', vendor_slug: 'lusaka-store', name: 'Blue running shoes', price: 200, description: 'Lightweight running shoes.' }
const blog = { slug: 'shoe-size-guide', title: 'How to choose your shoe size', excerpt: 'Sizing tips for Zambian shoppers.' }

test('makes truthful multi-platform marketing content from published listing', () => {
  const pack = makeLaunchPack(product)
  assert.equal(pack.path, '/lusaka-store/blue-shoes')
  assert.equal(pack.link, 'https://zamarket.shop/lusaka-store/blue-shoes')
  assert.match(pack.whatsapp, /K200\.00/)
  assert.match(pack.tiktok, /Fil[m]? original footage|Film original footage/)
  assert.equal(pack.tracked, false)
  assert.ok(pack.sms.endsWith(pack.link), 'SMS must contain complete working URL')
  assert.ok(pack.sms.length <= 160, 'SMS should fit in one standard 160-char message')
})

test('matches only active campaign links that land on selected page', () => {
  const campaigns = [
    { id: '1', code: 'shoes', status: 'active', destination: '/lusaka-store/blue-shoes' },
    { id: '2', code: 'wrong', status: 'active', destination: '/p/another-product' },
    { id: '3', code: 'ended', status: 'ended', destination: '/lusaka-store/blue-shoes' },
  ]
  const relevant = matchingCampaigns(campaigns, storefrontPath(product, 'product'))
  assert.equal(relevant.length, 1)
  assert.equal(makeLaunchPack(product, 'product', relevant[0]).link, 'https://zamarket.shop/go/shoes')
  assert.throws(() => makeLaunchPack(product, 'product', campaigns[1]), /different page/)
})

test('creates article marketing copy without inventing price or stock', () => {
  const pack = makeLaunchPack(blog, 'article')
  assert.equal(pack.path, '/blog/shoe-size-guide')
  assert.doesNotMatch(pack.whatsapp, /Price:|limited stock|50% off/i)
  assert.match(pack.whatsapp, /Read the guide/)
})
