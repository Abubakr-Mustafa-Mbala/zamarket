import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../src/components/Shell.jsx', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
test('main font is loaded and not overwritten with missing Instrument Sans', () => {
  assert.match(css, /--font: 'Plus Jakarta Sans'/)
  assert.doesNotMatch(css, /--font: 'Instrument Sans'/)
  assert.match(html, /family=Plus\+Jakarta\+Sans/)
})
test('affiliate mobile navigation prioritizes Home, Promote, Earnings and Academy', () => {
  assert.match(shell, /to: '\/sell\/products', label: 'Promote'/)
  assert.match(shell, /to: '\/sell\/earnings', label: 'Earnings'/)
  assert.match(shell, /to: '\/sell\/training', label: 'Academy'/)
  assert.match(shell, /to: '\/sell\/find-customers', label: 'Promotion studio'/)
})
