// The service worker exists for one job: show a notification when an order
// arrives and the browser is closed. It deliberately does nothing else.
//
// In particular it does NOT cache the site. A caching service worker on a
// marketplace is a good way to serve somebody yesterday's price, and it is
// very hard to get out of people's browsers once it is wrong. Every fetch
// goes to the network exactly as it would with no service worker installed.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }

  const title = data.title || 'ZaMarket'
  const options = {
    body: data.body || 'Something needs you.',
    tag: data.tag || 'zamarket-order',
    // A second order replaces the first notification rather than stacking,
    // but still buzzes, so a busy evening is one line instead of twenty.
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || '/admin/orders?status=pending' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/admin/orders?status=pending'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Reuse a tab that is already open rather than piling up windows.
    for (const client of all) {
      if ('focus' in client) {
        try { await client.navigate(new URL(target, self.location.origin).href) } catch { /* cross-origin */ }
        return client.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target)
  })())
})
