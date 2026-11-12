import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PENDING, PENDING_MAX_AGE_MS, packPending, readPending, resumeTarget } from '../src/lib/pendingApplication.js'

const read = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

test('a waiting application never carries a password', () => {
  const raw = packPending({ kind: 'vendor', f: { business_name: 'Sweet Things', password: 'hunter2' }, attribution: {} }, 1000)
  assert.doesNotMatch(raw, /hunter2|password/)
  assert.equal(readPending(raw, 1000).f.business_name, 'Sweet Things')
})

test('a waiting application is sent only while it is fresh', () => {
  const raw = packPending({ kind: 'reseller', f: { full_name: 'Ann' } }, 0)
  assert.ok(readPending(raw, PENDING_MAX_AGE_MS - 1))
  // Abandoned on a shared phone: must not be sent under whoever signs in next.
  assert.equal(readPending(raw, PENDING_MAX_AGE_MS + 1), null)
})

test('rubbish in storage is ignored rather than crashing the app', () => {
  for (const raw of [null, '', 'not json', '{}', '{"kind":"admin","f":{}}', '{"kind":"vendor"}', '{"kind":"vendor","f":"x"}']) {
    assert.equal(readPending(raw), null)
    assert.equal(resumeTarget('/', raw), null)
  }
})

test('someone handed back to the front page is taken to their form', () => {
  const raw = packPending({ kind: 'vendor', f: { business_name: 'A' } }, 0)
  assert.equal(resumeTarget('/', raw, 1), '/apply/vendor')
  assert.equal(resumeTarget('/login', raw, 1), '/apply/vendor')
  // Already there: no redirect loop.
  assert.equal(resumeTarget('/apply/vendor', raw, 1), null)
  // Never pulled out of paying for an order.
  assert.equal(resumeTarget('/checkout', raw, 1), null)
})

test('the app resumes a waiting application wherever Google lands the person', () => {
  const app = read('src/App.jsx')
  assert.match(app, /function useResumeApplication\(\)/)
  assert.match(app, /export default function App\(\) \{\s*useResumeApplication\(\)/)
  // Only for a signed-in person; a visitor is never redirected.
  assert.match(app, /if \(loading \|\| !user\) return/)
  const auth = read('src/pages/public/Auth.jsx')
  assert.match(auth, /localStorage\.setItem\(PENDING, packPending\(/)
  assert.match(auth, /readPending\(localStorage\.getItem\(PENDING\)\)/)
  assert.equal(PENDING, 'zm-pending-apply')
})

test('the application page says what will happen before asking for anything', () => {
  const auth = read('src/pages/public/Auth.jsx')
  const apply = auth.slice(auth.indexOf('export function Apply'))
  assert.match(apply, /className="apply-steps"/)
  assert.match(apply, /Choose your Google account/)
  // The button names the next thing that happens, not a bare "Send".
  assert.match(apply, /'Continue with Google'/)
  assert.match(apply, /'Send my application'/)
  assert.doesNotMatch(apply, /: 'Send'\}/)
  // Still no password field and no account created with a password.
  assert.doesNotMatch(apply, /type="password"/)
  assert.doesNotMatch(auth, /auth\.signUp\(/)
})

test('the application page keeps its honest statements', () => {
  const apply = read('src/pages/public/Auth.jsx')
  assert.match(apply, /We never store your ID number/)
  assert.match(apply, /There is no salary and no guaranteed earnings/)
  assert.match(apply, /You must own what you sell/)
  // No invented promise about how fast an application is answered.
  assert.doesNotMatch(apply, /within \d+ (hours|days)|same day|instantly approved/i)
})

test('the category rail stays only on the homepage', () => {
  assert.match(read('src/pages/public/Marketplace.jsx'), /pathname === '\/' && <CategoryRail \/>/)
})

test('a new seller with no figures yet still gets a dashboard', () => {
  const v = read('src/pages/vendor/Vendor.jsx')
  // vendor_summary returns null for a shop with no history; reading .sales
  // off it took the whole page down.
  assert.match(v, /\.\.\.\(data\.sum \|\| \{\}\)/)
  assert.match(v, /if \(!Array\.isArray\(sum\.reviews\)\) sum\.reviews = \[\]/)
  assert.match(v, /data\.setts = Array\.isArray\(data\.setts\) \? data\.setts : \[\]/)
  // The referral sentence needs a real percentage to print.
  assert.match(v, /Number\(settings\.vendor_referral_pct\) > 0/)
  assert.doesNotMatch(v, /Your link appears once your account is fully set up/)
})

test('an affiliate can copy their link from the first screen', () => {
  const r = read('src/pages/reseller/Reseller.jsx')
  assert.match(r, /function CopyMyLink\(\{ link \}\)/)
  assert.match(r, /<CopyMyLink link=/)
  assert.match(r, /navigator\.clipboard/)
})
