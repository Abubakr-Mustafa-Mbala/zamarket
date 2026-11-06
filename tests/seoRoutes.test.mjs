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
    else if (/\.jsx?$/.test(name)) out.push(rel)
  }
  return out
}

// Every top-level path segment the router serves publicly.
function routeSegments() {
  const seen = new Set()
  for (const file of walk('src')) {
    for (const m of read(file).matchAll(/<Route\s+path="(\/[^"]*)"/g)) {
      const first = m[1].replace(/^\//, '').split('/')[0]
      if (first && !first.startsWith(':') && first !== '*') seen.add(first)
    }
  }
  return seen
}

function reservedSet() {
  const src = read('netlify/edge-functions/seo.js')
  const block = src.match(/const RESERVED = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(block, 'could not find the RESERVED list in seo.js')
  return new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
}

test('every public route is reserved, so no real page is mistaken for a vendor', () => {
  // seo.js treats a single unknown segment as a vendor slug and a two-part
  // path as a product slug. When the lookup finds nothing it sets
  // robots=noindex, so a genuine page left out of RESERVED quietly tells
  // Google to ignore it. /giveaways was missing and went noindex.
  const missing = [...routeSegments()].filter((s) => !reservedSet().has(s)).sort()
  assert.deepEqual(missing, [], `public routes missing from RESERVED in seo.js: ${missing.join(', ')}`)
})

test('the giveaway pages are indexable and carry their own description', () => {
  const src = read('netlify/edge-functions/seo.js')
  assert.ok(reservedSet().has('giveaways'), 'giveaways is not in RESERVED, so it will be marked noindex')
  assert.match(src, /parts\[0\] === 'giveaways'/, 'no title/description branch for giveaways')
  // Entry is free; the public copy must never suggest buying helps.
  const branch = src.slice(src.indexOf("parts[0] === 'giveaways'"))
  const desc = branch.match(/description = '([^']+)'/)
  assert.ok(desc, 'the giveaways branch sets no description')
  assert.match(desc[1], /No purchase necessary/i)
  assert.doesNotMatch(desc[1], /buy|purchase to|spend|order to enter/i)
})

test('a Supabase outage must not mark the whole catalogue noindex', () => {
  // getOne returns ok:false when the lookup itself failed. noindex is only
  // correct when the lookup succeeded and genuinely found nothing.
  const src = read('netlify/edge-functions/seo.js')
  for (const m of src.matchAll(/robots = 'noindex,follow'/g)) {
    const line = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index + 30)
    assert.match(line, /ok && !/, `noindex set without checking the lookup succeeded: ${line.trim()}`)
  }
})
