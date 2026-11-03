import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalHref, PUBLIC_SITE } from '../src/lib/canonical.js'

test('all pages use the primary ZA Market domain, not Netlify or localhost', () => {
  assert.equal(canonicalHref('/p/phone'), `${PUBLIC_SITE}/p/phone`)
  assert.equal(canonicalHref('https://netlify-preview.example/p/phone?utm_source=facebook'), `${PUBLIC_SITE}/p/phone`)
  assert.equal(canonicalHref('http://localhost:5173/blog/guide'), `${PUBLIC_SITE}/blog/guide`)
})
test('campaign tracking and fragments never enter canonical links', () => {
  assert.equal(canonicalHref('/p/phone?utm_campaign=november#reviews'), `${PUBLIC_SITE}/p/phone`)
  assert.equal(canonicalHref('/'), `${PUBLIC_SITE}/`)
  assert.equal(canonicalHref('/blog/help/'), `${PUBLIC_SITE}/blog/help`)
})
test('absolute external input cannot make canonical URL point off-site', () => {
  assert.equal(canonicalHref('https://unrelated.example/phishing'), `${PUBLIC_SITE}/phishing`)
})
