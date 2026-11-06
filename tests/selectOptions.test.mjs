import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const read = (p) => readFileSync(at(p), 'utf8')

function walk(dir, out = []) {
  for (const name of readdirSync(at(dir))) {
    const rel = `${dir}/${name}`
    if (statSync(at(rel)).isDirectory()) walk(rel, out)
    else if (name.endsWith('.jsx')) out.push(rel)
  }
  return out
}

test('a Select with no options renders empty instead of killing the screen', () => {
  // Three Selects in the giveaway admin were written with <option> children
  // instead of an options prop. options was undefined, options.map threw, and
  // React unmounted the whole page: "Cannot read properties of undefined
  // (reading 'map')" on the giveaway screen.
  const ui = read('src/components/ui.jsx')
  assert.match(ui, /export function Select\(\{ value, onChange, options = \[\], placeholder, children, \.\.\.rest \}\)/)
})

test('a Select written with option children still shows its choices', () => {
  // Defaulting options to [] stops the crash but would silently render an
  // empty dropdown, which is its own bug. The children are rendered too.
  const ui = read('src/components/ui.jsx')
  const body = ui.slice(ui.indexOf('export function Select'))
  assert.match(body, /\{children\}/)
})

test('every Select in the app supplies its choices one way or the other', () => {
  const broken = []
  for (const file of walk('src')) {
    const text = read(file)
    for (const m of text.matchAll(/<Select\b/g)) {
      const rest = text.slice(m.index)
      let depth = 0, end = null
      for (let i = 0; i < rest.length; i++) {
        const ch = rest[i]
        if (ch === '{') depth++
        else if (ch === '}') depth--
        else if (ch === '>' && depth === 0) { end = i; break }
      }
      const tag = rest.slice(0, end + 1)
      const selfClosing = tag.trimEnd().endsWith('/>')
      // Self-closing with no options prop means no choices at all.
      if (selfClosing && !tag.includes('options=')) {
        broken.push(`${file}:${text.slice(0, m.index).split('\n').length}`)
      }
    }
  }
  assert.deepEqual(broken, [], `Select with no choices:\n${broken.join('\n')}`)
})

test('the giveaway form asks who funds the rewards, with real choices', () => {
  const g = read('src/pages/marketing/Giveaways.jsx')
  assert.match(g, /options=\{\[\['zamarket', 'ZaMarket'\], \['vendor', 'The seller'\], \['shared', 'Shared'\]\]\}/)
})
