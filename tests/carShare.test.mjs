import test from 'node:test'
import assert from 'node:assert/strict'
import { carMeta, carPage } from '../netlify/functions/car-share.js'
import fs from 'node:fs'

const car = { name: '2021 Toyota Fortuner 2.8 GD-6', slug: 'fortuner-x', price: 799000, images: ['https://cdn/x.jpg'], page: { vehicle: { make: 'Toyota', model: 'Fortuner', year: 2021, mileage_km: 93000, transmission: 'Automatic', fuel: 'Diesel', engine: '2.8L Turbo Diesel', location: 'Lusaka' } } }

test('car share page carries the car preview and opens the car page', () => {
  const html = carPage({ slug: 'fortuner-x', search: '?src=status', meta: carMeta(car) })
  assert.match(html, /og:title" content="2021 Toyota Fortuner[^"]*K799,000 \| ZaMarket Motors"/)
  assert.match(html, /og:image" content="https:\/\/cdn\/x.jpg"/)
  assert.match(html, /location.replace\("\/p\/fortuner-x\?src=status"\)/)
})

test('an affiliate car link opens through /r/ so the affiliate gets the credit', () => {
  const html = carPage({ slug: 'fortuner-x', search: '?r=ann7&src=status', meta: carMeta(car) })
  assert.match(html, /location.replace\("\/r\/ann7\/fortuner-x\?src=status"\)/)
})

test('the site-wide preview code leaves /car/ alone', () => {
  assert.match(fs.readFileSync('netlify/edge-functions/seo.js', 'utf8'), /excludedPath: \['\/car\/\*'/)
})
