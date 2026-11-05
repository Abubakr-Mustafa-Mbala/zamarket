import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

// The wrapper lives inside a canvas module that needs a browser, so it is
// re-created here from the same source shape and exercised against a
// measurer with predictable widths. What is being protected is the rule:
// a product name may be shortened at the end, never gutted in the middle.
function makeWrap(src) {
  const body = src.match(/function wrap\(ctx, raw, maxW, maxLines = 2\) \{[\s\S]*?\n\}/)
  assert.ok(body, 'wrap() must exist in premiumStudio.js')
  const clamp = src.match(/function clampLine\(ctx, raw, maxW\) \{[\s\S]*?\n\}/)
  assert.ok(clamp, 'clampLine() must exist in premiumStudio.js')
  // eslint-disable-next-line no-new-func
  return new Function(`${clamp[0]}\n${body[0]}\nreturn wrap`)()
}

// Every character is one unit wide. Simple, and enough to force wrapping.
const ctx = { measureText: (s) => ({ width: String(s).length }) }

const wrap = makeWrap(read('../src/lib/premiumStudio.js'))

const strip = (rows) => rows.join(' ').replace(/…/g, '')

test('no word disappears out of the middle of a product name', () => {
  const names = [
    'Vanilla Cupcakes (box of 12)',
    'Chocolate Celebration Cake',
    'Commercial 12L Double Tank Deep Fryer',
    'Red Velvet Cake with Cream Cheese Frosting',
    'Stainless Steel Mixing Bowl Set',
  ]
  for (const name of names) {
    for (const width of [10, 14, 18, 22, 30]) {
      for (const lines of [1, 2, 3]) {
        const rows = wrap(ctx, name, width, lines)
        const shown = strip(rows)
        // Whatever is shown must be a prefix of the real name: the text may
        // stop early, but it may never skip ahead.
        assert.ok(
          name.startsWith(shown.trim()) || name.replace(/\s+/g, ' ').startsWith(shown.trim()),
          `"${name}" at width ${width}/${lines} line(s) became "${shown}" — words were dropped`,
        )
      }
    }
  }
})

test('the specific names that were being mangled now read correctly', () => {
  // Wide enough for two honest lines.
  assert.deepEqual(wrap(ctx, 'Vanilla Cupcakes (box of 12)', 17, 2), ['Vanilla Cupcakes', '(box of 12)'])
  assert.deepEqual(wrap(ctx, 'Chocolate Celebration Cake', 13, 2), ['Chocolate', 'Celebration…'])
  // The cut must not leave a gap before the ellipsis.
  for (const row of wrap(ctx, 'Red Velvet Cake with Cream Cheese Frosting', 11, 2)) {
    assert.ok(!/ …$/.test(row), `"${row}" has a space before the ellipsis`)
  }
})

test('a name that cannot fit is cut at the end and marked', () => {
  const rows = wrap(ctx, 'Commercial 12L Double Tank Deep Fryer', 12, 2)
  assert.equal(rows.length, 2)
  assert.ok(rows[rows.length - 1].endsWith('…'), 'the cut must be visible to the reader')
  assert.ok('Commercial 12L Double Tank Deep Fryer'.startsWith(strip(rows).trim()))
})

test('a short name is left exactly as the seller wrote it', () => {
  assert.deepEqual(wrap(ctx, 'Bowl Set', 40, 2), ['Bowl Set'])
  assert.deepEqual(wrap(ctx, '', 40, 2), [])
})

test('the number of lines asked for is never exceeded', () => {
  for (const lines of [1, 2, 3]) {
    const rows = wrap(ctx, 'One two three four five six seven eight nine ten', 9, lines)
    assert.ok(rows.length <= lines, `${rows.length} rows for a ${lines}-line box`)
  }
})
