import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  isStaleBuild,
  isOurWorker,
  dropCaches,
  dropForeignWorkers,
  recoveredRecently,
  recoverFromStaleBuild,
} from '../src/lib/recover.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

// A browser that cannot fetch a page file reports it differently in every
// engine. All of these mean the same thing: this browser is out of date.
test('the messages browsers use for a missing page file are all recognised', () => {
  const real = [
    "Failed to fetch dynamically imported module: https://zamarket.shop/assets/Giveaway-B2x9.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
    "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\".",
    "Unable to preload CSS for /assets/Studio-91ac.css",
  ]
  for (const message of real) {
    assert.equal(isStaleBuild(new Error(message)), true, message)
  }
  assert.equal(isStaleBuild({ name: 'ChunkLoadError', message: 'Loading chunk 7 failed.' }), true)
})

// An ordinary failure must surface as itself. Reloading the whole site
// because one price lookup failed would be worse than the fault.
test('ordinary failures do not trigger a reload', () => {
  const ordinary = [
    'Cannot read properties of undefined (reading map)',
    'Failed to fetch',
    'JWT expired',
    'new row violates row-level security policy for table "orders"',
    'Unexpected token < in JSON at position 0',
  ]
  for (const message of ordinary) {
    assert.equal(isStaleBuild(new Error(message)), false, message)
  }
  assert.equal(isStaleBuild(null), false)
  assert.equal(isStaleBuild(undefined), false)
})

test('only our own notification worker is spared', () => {
  assert.equal(isOurWorker('https://zamarket.shop/sw.js'), true)
  assert.equal(isOurWorker('/sw.js'), true)
  assert.equal(isOurWorker('https://zamarket.shop/service-worker.js'), false)
  assert.equal(isOurWorker('https://zamarket.shop/workbox-sw.js'), false)
  assert.equal(isOurWorker(''), false)
  assert.equal(isOurWorker(null), false)
})

function fakeScope(options = {}) {
  const cacheNames = options.caches ?? ['old-shell-v1', 'runtime']
  const deleted = []
  const unregistered = []
  const store = new Map()
  return {
    deleted,
    unregistered,
    reloads: { count: 0 },
    scope: {
      caches: {
        keys: async () => cacheNames.slice(),
        delete: async (key) => { deleted.push(key); return true },
      },
      navigator: {
        serviceWorker: {
          getRegistrations: async () => (options.workers ?? [
            { active: { scriptURL: 'https://zamarket.shop/sw.js' } },
            { active: { scriptURL: 'https://zamarket.shop/service-worker.js' } },
          ]).map((reg) => ({
            ...reg,
            unregister: async () => {
              unregistered.push(reg.active?.scriptURL)
              return true
            },
          })),
        },
      },
      sessionStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, v),
      },
      location: { reload() { } },
    },
  }
}

test('every cache is cleared, because the site stores nothing in them', async () => {
  const f = fakeScope()
  assert.equal(await dropCaches(f.scope), 2)
  assert.deepEqual(f.deleted, ['old-shell-v1', 'runtime'])
})

test('a leftover worker from an older site is removed and ours is kept', async () => {
  const f = fakeScope()
  assert.equal(await dropForeignWorkers(f.scope), 1)
  assert.deepEqual(f.unregistered, ['https://zamarket.shop/service-worker.js'])
})

test('a browser with no cache or worker support is handled quietly', async () => {
  assert.equal(await dropCaches({}), 0)
  assert.equal(await dropForeignWorkers({}), 0)
  assert.equal(await dropCaches({ caches: { keys: async () => { throw new Error('denied') } } }), 0)
})

test('recovery runs once and then refuses, so a phone cannot loop', async () => {
  const f = fakeScope()
  let reloads = 0
  f.scope.location = { reload: () => { reloads += 1 } }

  assert.equal(await recoverFromStaleBuild(f.scope, 1_000_000), true)
  assert.equal(reloads, 1)
  assert.equal(recoveredRecently(f.scope, 1_000_000), true)

  // Same minute: refuse, so the boundary shows the person the real error.
  assert.equal(await recoverFromStaleBuild(f.scope, 1_030_000), false)
  assert.equal(reloads, 1)

  // A minute later it is a fresh problem and worth one more attempt.
  assert.equal(await recoverFromStaleBuild(f.scope, 1_070_000), true)
  assert.equal(reloads, 2)
})

test('without session storage we never reload, rather than reload forever', async () => {
  const blind = {
    sessionStorage: {
      getItem() { throw new Error('denied') },
      setItem() { throw new Error('denied') },
    },
    location: { reload() { throw new Error('should not be called') } },
  }
  assert.equal(recoveredRecently(blind), true)
  assert.equal(await recoverFromStaleBuild(blind), false)
})

test('the boundary clears the browser instead of re-rendering a failed page', () => {
  const src = read('../src/components/ErrorBoundary.jsx')
  // React caches a rejected lazy import, so setState can never recover one.
  assert.match(src, /isStaleBuild/)
  assert.match(src, /recoverFromStaleBuild/)
  assert.match(src, /Clear and load again/)
})

test('the marketplace is inside a boundary so it cannot go black', () => {
  const src = read('../src/pages/public/Marketplace.jsx')
  assert.match(src, /import ErrorBoundary from '\.\.\/\.\.\/components\/ErrorBoundary'/)
  assert.match(src, /<ErrorBoundary home="\/">\s*\n\s*<Suspense/)
})

test('the page itself is never cached and a missing page file returns 404', () => {
  const toml = read('../netlify.toml')
  assert.match(toml, /for = "\/index\.html"/)
  assert.match(toml, /no-cache/)
  assert.match(toml, /for = "\/sw\.js"/)
  // The 404 rule must come before the catch-all, or the catch-all wins.
  const missing = toml.indexOf('asset-missing')
  const catchAll = toml.indexOf('to = "/index.html"\n  status = 200')
  assert.ok(missing > -1 && catchAll > -1 && missing < catchAll, 'asset 404 must precede the catch-all')
})

test('the site still caches nothing in the service worker', () => {
  const sw = read('../public/sw.js')
  assert.ok(!/addEventListener\(\s*['"]fetch['"]/.test(sw), 'a fetch handler would re-create this whole problem')
})
