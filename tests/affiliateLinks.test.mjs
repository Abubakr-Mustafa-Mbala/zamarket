import test from 'node:test'
import assert from 'node:assert/strict'
import { productShareUrl, storeShareUrl } from '../src/lib/affiliateLinks.js'

test('affiliate product share is attributed from any public product page', () => {
  assert.equal(productShareUrl('https://zamarket.shop', { slug: 'kettle' }, 'reseller', 'AbuBakr'), 'https://zamarket.shop/r/abubakr/kettle')
  assert.equal(productShareUrl('https://zamarket.shop', { slug: 'kettle' }, 'customer', null), 'https://zamarket.shop/p/kettle')
  assert.equal(productShareUrl('https://zamarket.shop', { slug: 'kettle' }, 'reseller', ''), 'https://zamarket.shop/p/kettle')
})
test('seller stores do not claim referral credit from other user roles', () => {
  assert.equal(storeShareUrl('https://zamarket.shop', 'rasma', 'reseller', 'ABU1'), 'https://zamarket.shop/r/abu1')
  assert.equal(storeShareUrl('https://zamarket.shop', 'rasma', 'customer', ''), 'https://zamarket.shop/rasma')
})
test('affiliate preview metadata is explicitly built server-side', async () => {
  const fs = await import('node:fs')
  const seo = fs.readFileSync('netlify/edge-functions/seo.js', 'utf8')
  assert.match(seo, /parts\[0\] === 'r' && parts\.length === 3/)
  assert.match(seo, /og:image/)
  assert.match(seo, /noindex,follow/)
})
