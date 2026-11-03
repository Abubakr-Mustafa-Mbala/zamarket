import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const seo = readFileSync(new URL('../src/lib/seo.js', import.meta.url), 'utf8')

test('client-side SEO uses canonical site helper, not current preview origin', () => {
  assert.match(seo, /canonicalHref\(canonical \|\| window\.location\.pathname\)/)
  assert.doesNotMatch(seo, /window\.location\.origin \+ window\.location\.pathname/)
})
test('navigating away from a product resets old open-graph image and metadata', () => {
  assert.match(seo, /image \|\| `\$\{PUBLIC_SITE\}\/social\.png`/)
  assert.match(seo, /const activeTitle = title \|\|/)
  assert.match(seo, /const activeDescription = description \|\|/)
})
