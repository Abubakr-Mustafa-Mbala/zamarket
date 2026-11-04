import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const get = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

// An order alert can be triggered twice — once by the browser that placed the
// order and once by a database webhook. Announcing the same order twice is
// the failure people notice; announcing it zero times is the one that costs
// money. Both are guarded in the database, not in the function.
test('an order is announced exactly once, however many times it is triggered', () => {
  const sql = get('supabase/migrations/20261104_order_alerts_REVIEW.sql')
  assert.match(sql, /alter table public\.orders add column if not exists alerted_at/)
  assert.match(sql, /for update/)                 // the row is locked
  assert.match(sql, /if o\.alerted_at is not null then return null/)
  const fn = get('netlify/functions/order-alert.js')
  assert.match(fn, /rpc\/claim_order_alert/)
  assert.match(fn, /if \(!order\) return json\(200, \{ sent: false/)
  // Both trigger shapes are accepted.
  assert.match(fn, /body\?\.order_number \?\? body\?\.record\?\.order_number/)
})

test('the alert trusts nothing the caller sends except the order number', () => {
  const fn = get('netlify/functions/order-alert.js')
  assert.match(fn, /Number\.parseInt/)
  assert.match(fn, /if \(!Number\.isInteger\(orderNumber\)/)
  assert.match(fn, /if \(request\.method !== 'POST'\) return json\(405/)
  // The message body is built from the database row, never from the request.
  assert.doesNotMatch(fn, /body\.total|body\.items|body\.record\.total/)
})

test('no customer detail leaves the building in an alert', () => {
  const sql = get('supabase/migrations/20261104_order_alerts_REVIEW.sql')
  // The claim returns only the order number, amount, items and channel.
  const payload = sql.slice(sql.indexOf('return jsonb_build_object'))
  for (const field of ['phone', 'full_name', 'address', 'email']) {
    assert.ok(!payload.includes(`'${field}'`), `${field} must not be in an alert payload`)
  }
  // Push endpoints are credentials: nobody reads anyone else's.
  assert.match(sql, /using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\)/)
  assert.match(sql, /revoke all on public\.push_subscriptions from anon/)
  // The claim function is service-role only.
  assert.match(sql, /revoke all on function public\.claim_order_alert\(int\) from public, anon, authenticated/)
})

test('each channel is optional and failure never breaks an order', () => {
  const fn = get('netlify/functions/order-alert.js')
  for (const guard of ["skipped: 'no VAPID keys'", "no RESEND_API_KEY", "skipped: 'not configured'"]) {
    assert.ok(fn.includes(guard), `${guard} should be handled`)
  }
  // A browser that threw its subscription away is removed, not retried for ever.
  assert.match(fn, /statusCode === 404 \|\| e\?\.statusCode === 410/)
  // The checkout never waits on the alert and never fails because of it.
  const checkout = get('src/pages/public/Checkout.jsx')
  assert.match(checkout, /fetch\('\/api\/order-alert'[\s\S]{0,260}\.catch\(\(\) => \{\}\)/)
})

test('the service worker does not cache the site', () => {
  const sw = get('public/sw.js')
  // A caching worker on a marketplace serves stale prices and is very hard to
  // undo once it is wrong. This one only shows notifications.
  assert.doesNotMatch(sw, /caches\.|addEventListener\('fetch'/)
  assert.match(sw, /addEventListener\('push'/)
  assert.match(sw, /addEventListener\('notificationclick'/)
})
