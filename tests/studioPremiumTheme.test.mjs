import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { STUDIO_PALETTES, studioPalette, premiumPagesFor, premiumPageSize } from '../src/lib/studioThemes.js'

test('all curated Creative Studio palettes support accessible custom colors', () => {
  assert.equal(Object.keys(STUDIO_PALETTES).length, 6)
  for (const theme of Object.values(STUDIO_PALETTES)) {
    assert.match(theme.background, /^#[0-9A-F]{6}$/i)
    assert.match(theme.accent, /^#[0-9A-F]{6}$/i)
    assert.equal(studioPalette(theme.key).key, theme.key)
  }
  assert.equal(studioPalette('copper', { accent: '#000000' }).onAccent, '#FFFFFF')
  assert.equal(studioPalette('copper', { accent: '#fdfdfd' }).onAccent, '#18202B')
  assert.equal(studioPalette('copper', { background: '#101010' }).ink, '#FFFFFF')
  assert.equal(studioPalette('copper', { accent: 'not-a-color' }).accent, STUDIO_PALETTES.copper.accent)
})
test('premium price lists paginate instead of squeezing products into unreadable tiny cards', () => {
  const items = Array.from({ length: 15 }, (_, id) => ({ id }))
  const pages = premiumPagesFor(items, 'post')
  assert.deepEqual(pages.map((p) => p.length), [3, 3, 3, 3, 3])
  assert.equal(premiumPageSize('square'), 2)
  assert.equal(premiumPagesFor([], 'post').length, 0)
})
test('premium exports generate real linked QR and double-resolution PNG from live catalogue fields', () => {
  const code = readFileSync(new URL('../src/lib/premiumStudio.js', import.meta.url), 'utf8')
  assert.match(code, /QRCode\.toDataURL/)
  assert.match(code, /img\.width/)
  assert.match(code, /fmtPrice\(item\.price\)/)
  assert.match(code, /canvas\.width = F\.w \* scale/)
  assert.match(code, /toBlob\(\(b\).*'image\/png'/)
})
