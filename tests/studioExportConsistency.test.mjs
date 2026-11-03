import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const share = readFileSync(new URL('../src/lib/shareCard.js', import.meta.url), 'utf8')
const creative = readFileSync(new URL('../src/lib/creative.js', import.meta.url), 'utf8')
const studio = readFileSync(new URL('../src/pages/shared/CreativeStudio.jsx', import.meta.url), 'utf8')
test('shared image file uses the actual blob MIME type', () => {
  assert.match(share, /const mime = blob\?\.type/)
  assert.match(share, /new File\(\[blob\], safeName, \{ type: mime \}\)/)
})
test('share fallback uses the format-aligned filename', () => {
  assert.match(share, /a\.download = safeName/)
})
test('legacy creative renderer uses the loaded font', () => {
  assert.match(creative, /Plus Jakarta Sans/)
  assert.doesNotMatch(creative, /Instrument Sans/)
})
test('studio gallery updates when products or vendor identity change', () => {
  assert.match(studio, /\[products, vendor, hero\?\.id, arrivalItem\?\.id\]/)
})
