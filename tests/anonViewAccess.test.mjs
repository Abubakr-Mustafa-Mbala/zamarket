import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')
const sql = read('supabase/run-in-supabase.sql')

test('the front page pick never rewrites the public product view', () => {
  // Splicing a column into public_products meant reading its definition back
  // as text, which depends on formatting that differs between databases --
  // it failed outright on the live one. It also loses the view's reloptions,
  // silently turning a security invoker view into a definer one.
  assert.match(sql, /create or replace view public\.front_page_picks as/)
  assert.doesNotMatch(sql, /create or replace view public\.public_products as/)
  assert.doesNotMatch(sql, /pg_get_viewdef\('public\.public_products'/)
})

test('the picks view is readable by a logged-out visitor', () => {
  assert.match(sql, /grant select on public\.front_page_picks to anon, authenticated;/)
  // It reads products as its owner, so it needs no column grants on products.
  assert.match(sql, /alter view public\.front_page_picks set \(security_invoker = off\)/)
})

test('the picks view shows nothing a shopper could not already see', () => {
  const block = sql.slice(sql.indexOf('create or replace view public.front_page_picks'))
  assert.match(block, /select p\.id, p\.front_rank/)
  assert.match(block, /p\.status in \('published', 'out_of_stock'\)/)
  assert.match(block, /\(p\.vendor_id is null or v\.status = 'approved'\)/)
})

test('a database already carrying the old splice is repaired', () => {
  assert.match(sql, /grant select \(front_rank\) on public\.products to anon, authenticated/)
  assert.match(sql, /alter view public\.public_products set \(security_invoker = on\)/)
})

test('internal economics are still withheld from the public view', () => {
  // Whatever else changes, these must never be granted to anon.
  for (const col of ['vendor_price', 'economics', 'floor_override']) {
    assert.doesNotMatch(sql, new RegExp(`grant select \\([^)]*\\b${col}\\b`),
      `${col} must never be granted to anon`)
  }
})
