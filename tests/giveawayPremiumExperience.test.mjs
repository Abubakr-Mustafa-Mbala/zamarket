import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('giveaway navigation is advertised only when an actual campaign is open', () => {
  const shell = read('src/pages/public/Marketplace.jsx')
  assert.match(shell, /\.eq\('status', 'live'\)\.gt\('closes_at'/)
  assert.match(shell, /\{activeGiveaway && <Link/)
  assert.match(shell, /Live giveaway/)
})

test('giveaway page uses real public product photos and contains the entry journey', () => {
  const page = read('src/pages/public/Giveaway.jsx')
  assert.match(page, /gw-prize-art/)
  assert.match(page, /product\?\.images\?\.\[0\]/)
  assert.match(page, /How to enter|How it works/)
  // The first step: an account, however the button is worded.
  assert.match(page, /Create an account/)
  assert.match(page, /Sign in to enter/)
  assert.match(page, /Return for the result/)
  assert.match(page, /No purchase or social sharing is necessary/)
  assert.match(page, /public_products/)
  assert.match(page, /More to discover on ZaMarket/)
  assert.match(page, /offers\.map/)
  assert.match(page, /normal_price/)
})

test('studio price lists lead with a real image and keep fewer items per page', async () => {
  const studio = read('src/lib/premiumStudio.js')
  assert.match(studio, /function featuredProduct/)
  assert.match(studio, /fitProductPhoto/)
  assert.match(studio, /QRCode\.toDataURL/)
  assert.match(studio, /premiumPagesFor/)
  const { premiumPageSize, studioPalette } = await import('../src/lib/studioThemes.js')
  assert.equal(premiumPageSize('post'), 3)
  assert.equal(premiumPageSize('square'), 2)
  assert.equal(studioPalette('violet', {accent: '#FAEEFF'}).accentText, '#20202B')
})
