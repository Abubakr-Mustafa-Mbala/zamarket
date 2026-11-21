import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// Signed-out visitors read products through column-level grants. Any product
// column the shop's view uses (in its select list OR its filter) that is not
// granted takes the whole shop down for them, while staff see nothing wrong.
// That happened twice (front_rank, then lunch_only). Never again.
const schema = fs.readFileSync('supabase/schema.sql', 'utf8')
const run = fs.readFileSync('supabase/run-in-supabase.sql', 'utf8')
const all = schema + '\n' + run

test('every products column the public shop view uses is readable by visitors', () => {
  const defs = [...run.matchAll(/create or replace view public_products as([\s\S]*?);\n/g)]
  const view = defs[defs.length - 1][1]
  const used = new Set([...view.matchAll(/\bp\.([a-z_]+)/g)].map((m) => m[1]))
  const granted = new Set()
  for (const m of all.matchAll(/grant select \(([^)]*)\)\s*on (?:public\.)?products to anon/g)) for (const c of m[1].split(',')) granted.add(c.trim())
  const missing = [...used].filter((c) => !granted.has(c))
  assert.deepEqual(missing, [], `visitors cannot read: ${missing.join(', ')}`)
})
