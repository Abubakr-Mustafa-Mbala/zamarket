import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ?next= decides where somebody lands immediately after typing their
// password. An open redirect there is not a theoretical bug: the victim
// arrives on a stranger's page at the one moment they are expecting to be
// asked for credentials. The old check was `next.startsWith('/')`, which
// "//evil.com" passes and the browser reads as another domain entirely.
const src = readFileSync(new URL('../src/pages/public/Auth.jsx', import.meta.url), 'utf8')

test('the sign-in redirect cannot leave the site', async () => {
  const start = src.indexOf('export function safeNext')
  assert.ok(start >= 0, 'safeNext must exist')
  const body = src.slice(start, src.indexOf('\n}\n', start) + 3)
  const file = join(mkdtempSync(join(tmpdir(), 'zm-')), 'safenext.mjs')
  writeFileSync(file, body)
  globalThis.window = { location: { origin: 'https://zamarket.shop' } }
  const { safeNext } = await import(`file://${file}`)

  for (const good of ['/admin/orders', '/checkout?step=2#pay', '/sell']) {
    assert.equal(safeNext(good), good, `${good} should be allowed`)
  }
  for (const bad of ['//evil.com', '/\\evil.com', '\\\\evil.com', 'https://evil.com',
    'javascript:alert(1)', '/\tevil', '//evil.com/path', '', null, 'a'.repeat(600)]) {
    assert.equal(safeNext(bad), '', `${JSON.stringify(bad)} must be blocked`)
  }
})

test('the old startsWith check is gone for good', () => {
  assert.doesNotMatch(src, /next\.startsWith\('\/'\) \? next/)
  assert.match(src, /nav\(safeNext\(next\) \|\| homeFor\(role\)/)
})
