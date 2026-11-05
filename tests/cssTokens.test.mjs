import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// A var() that points at a custom property nobody defined is not an error.
// The browser drops the declaration and carries on, so the page still loads
// and nothing appears in the console — the element is just silently wrong.
//
// That is how a button ended up rendered as dark text on no background at
// all: the rule said `background: var(--accent)` and this project has no
// --accent. It has --brass. Nothing anywhere said so.
//
// This test reads every custom property the stylesheets define, then checks
// that every var() reference resolves to one of them.

const dir = fileURLToPath(new URL('../src/', import.meta.url))
const files = readdirSync(dir).filter((f) => f.endsWith('.css'))
const sources = Object.fromEntries(files.map((f) => [f, readFileSync(join(dir, f), 'utf8')]))
const all = Object.values(sources).join('\n')

// Properties defined anywhere, at :root or scoped to a class.
const defined = new Set([...all.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]))

// Some properties are set from JavaScript at runtime — a store's theme
// colours, the wheel's slice geometry — so they never appear in a stylesheet.
function codeFiles(rel) {
  const base = fileURLToPath(new URL(rel, import.meta.url))
  const out = []
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const path = join(base, entry.name)
    if (entry.isDirectory()) out.push(...codeFiles(`${rel}${entry.name}/`))
    else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push(readFileSync(path, 'utf8'))
  }
  return out
}
const code = codeFiles('../src/').join('\n')
const setInCode = new Set([...code.matchAll(/['"`](--[a-zA-Z0-9-]+)['"`]\s*:/g)].map((m) => m[1]))

test('every CSS variable the stylesheets use is actually defined', () => {
  const missing = []
  for (const [file, css] of Object.entries(sources)) {
    // Comments explain these names; they are not uses of them. Blanked rather
    // than removed so the reported line numbers still match the file.
    const lines = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).split('\n')
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*([,)])/g)) {
        const [, name, next] = m
        if (next === ',') continue            // has a fallback, so it is safe
        if (defined.has(name) || setInCode.has(name)) continue
        missing.push(`${file}:${i + 1}  var(${name})`)
      }
    })
  }
  assert.deepEqual(missing, [], `undefined CSS variables:\n${missing.join('\n')}`)
})

test('the giveaway earning panel is visible, not dark on dark', () => {
  const css = sources['giveaway-premium.css']
  assert.match(css, /--gw-accent:/)
  // Every filled button on this page must set a background AND a foreground
  // from tokens this file defines. A background that resolves to nothing is
  // how the copy button became dark text on dark.
  for (const sel of ['.gw-share-row button', '.gw-mylink button', '.gw-primary-action']) {
    const at = css.indexOf(sel + ' {')
    assert.ok(at > -1, `${sel} should be styled`)
    const rule = css.slice(at, css.indexOf('}', at))
    assert.match(rule, /background:/, `${sel} needs a background`)
    assert.match(rule, /color:/, `${sel} needs a text colour`)
    const token = rule.match(/var\((--[a-z-]+)\)/)
    if (token) assert.ok(css.includes(token[1] + ':'), `${sel} uses undefined ${token[1]}`)
  }
})
