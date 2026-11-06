// Recovering from a stale build.
//
// The site is split into one small JavaScript file per page, and each file's
// name contains a hash of its contents. Deploying changes those names.
//
// So a browser still holding the previous index.html — a phone that kept the
// tab open for a week, an installed app that was never closed, a mobile
// network that cached the page on its way through — will ask the server for a
// file name that no longer exists. The request comes back as the site's HTML
// instead of JavaScript, and the page never opens.
//
// Two things then make it permanent rather than momentary:
//
//   1. React's lazy() remembers the failure. Re-rendering the same page does
//      not retry; it hands back the same rejected promise. That is why the
//      "Try again" button did nothing at all.
//   2. Refreshing re-fetches the same cached page from the same cache, which
//      asks for the same dead file. That is why refreshing did not help
//      either, however good the connection was.
//
// The cure is to throw away everything the browser is holding for this site
// and fetch it again from the server. Once per minute at most, so that a real
// outage cannot put a phone into a reload loop.

const GUARD = 'zm:recovered-at'
const QUIET_MS = 60000

// Every message a browser uses when a page's JavaScript file could not be
// loaded. They differ per engine, so this matches on substrings rather than
// trying to be exact. Errors from ordinary data requests are deliberately not
// in this list — those should surface as themselves, not trigger a reload.
const STALE_BUILD = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'failed to load module script',
  'unable to preload css',
  'chunkloaderror',
]

export function isStaleBuild(error) {
  const text = `${error?.name || ''} ${error?.message || error || ''}`.toLowerCase()
  return STALE_BUILD.some((phrase) => text.includes(phrase))
}

// Our own worker shows order notifications and nothing else — it has no fetch
// handler, so it cannot be serving anybody a stale page. Any OTHER worker on
// this domain is left over from an older version of the site and is a prime
// suspect, so it goes.
export function isOurWorker(scriptURL) {
  try {
    return new URL(String(scriptURL || ''), 'https://zamarket.shop').pathname === '/sw.js'
  } catch {
    return false
  }
}

// We never use the Cache Storage API for anything. Every entry in it is
// therefore left over from an older build and safe to delete.
export async function dropCaches(scope = globalThis) {
  const store = scope?.caches
  if (!store?.keys) return 0
  try {
    const keys = await store.keys()
    const results = await Promise.all(keys.map((key) => store.delete(key).catch(() => false)))
    return results.filter(Boolean).length
  } catch {
    return 0
  }
}

export async function dropForeignWorkers(scope = globalThis) {
  const sw = scope?.navigator?.serviceWorker
  if (!sw?.getRegistrations) return 0
  let registrations = []
  try {
    registrations = await sw.getRegistrations()
  } catch {
    return 0
  }
  let dropped = 0
  for (const reg of registrations) {
    const url = reg?.active?.scriptURL || reg?.waiting?.scriptURL || reg?.installing?.scriptURL || ''
    if (isOurWorker(url)) continue
    try {
      if (await reg.unregister()) dropped += 1
    } catch {
      // Nothing useful to do; the reload below is still worth attempting.
    }
  }
  return dropped
}

export function recoveredRecently(scope = globalThis, now = Date.now()) {
  try {
    const at = Number(scope?.sessionStorage?.getItem(GUARD) || 0)
    return Number.isFinite(at) && at > 0 && now - at < QUIET_MS && now >= at
  } catch {
    // Private browsing can refuse storage entirely. Without a guard we must
    // assume we have already tried, or we risk an endless reload.
    return true
  }
}

// Returns true when a reload was started, false when we have just done this
// and should show the person the error instead of spinning.
export async function recoverFromStaleBuild(scope = globalThis, now = Date.now()) {
  if (recoveredRecently(scope, now)) return false
  try {
    scope?.sessionStorage?.setItem(GUARD, String(now))
  } catch {
    return false
  }
  await dropCaches(scope)
  await dropForeignWorkers(scope)
  try {
    scope?.location?.reload()
  } catch {
    // A reload we cannot perform is still better reported as attempted; the
    // boundary shows its own button in that case.
  }
  return true
}

// Run once at start-up, in the background. It costs nothing on a healthy
// phone and clears out the wreckage on one that has been stuck for weeks.
export function sweepOnBoot(scope = globalThis) {
  const idle = scope?.requestIdleCallback || ((fn) => scope?.setTimeout?.(fn, 2000))
  try {
    idle(() => {
      dropCaches(scope).catch(() => {})
      dropForeignWorkers(scope).catch(() => {})
    })
  } catch {
    // Start-up must never be the thing that breaks.
  }
}

// The innermost components React was rendering when it threw, which is the
// part that actually identifies the screen. A full stack is dozens of frames
// of routers and providers; the first three are the ones that mean anything.
//
// Minified builds rename components, so a name is only worth printing when it
// still looks like one. Anything shorter than three characters is a mangled
// identifier and is dropped rather than printed as noise.
export function topFrames(componentStack, howMany = 3) {
  if (!componentStack) return ''
  const names = String(componentStack)
    .split('\n')
    .map((line) => (line.match(/^\s*(?:at|in)\s+([A-Z][\w.]*)/) || [])[1])
    .filter((name) => name && name.length > 2 && !/^(Suspense|Fragment|Provider|Consumer|Router|Routes|Outlet|ErrorBoundary)$/.test(name))
  // The same component repeated adds nothing.
  const seen = []
  for (const name of names) {
    if (!seen.includes(name)) seen.push(name)
    if (seen.length >= howMany) break
  }
  return seen.join(' ‹ ')
}
