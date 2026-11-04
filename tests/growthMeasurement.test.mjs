import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const get = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

// The channel chain is only worth anything end to end: tagged on the poster,
// read on arrival, kept with the touch, sent with the order, grouped in the
// report. Any one link missing and the whole measurement is silently wrong,
// which is worse than not measuring at all.
test('the channel survives from the shared link to the order record', () => {
  const channel = get('src/lib/channel.js')
  assert.match(channel, /export function tagLink/)
  assert.match(channel, /export function detectChannel/)
  // Unknown values never reach the database.
  assert.match(channel, /CHANNELS\.includes\(v\) \? v : ''/)

  // Tagged where the poster is made.
  for (const f of ['src/components/ShareProduct.jsx', 'src/components/ShareStore.jsx']) {
    const s = get(f)
    assert.match(s, /tagLink\(link, postTo\)/, `${f} must tag the shared link`)
    assert.match(s, /link: shareLink/, `${f} must put the tagged link in the QR`)
  }

  // Read on arrival and remembered.
  const market = get('src/pages/public/Marketplace.jsx')
  assert.match(market, /detectChannel\(window\.location\.search, document\.referrer\)/)
  assert.match(market, /rememberChannel\(found\)/)

  // Carried on the cart's attribution.
  assert.match(get('src/lib/cart.jsx'), /channel: storedChannel\(\) \|\| 'marketplace'/)

  // And NOT overwritten at checkout, which is exactly what used to happen.
  const checkout = get('src/pages/public/Checkout.jsx')
  assert.match(checkout, /\.\.\.attribution\(\),/)
  assert.doesNotMatch(checkout, /channel: 'marketplace',/)

  // Grouped in the report.
  const sql = get('supabase/migrations/20261104_growth_analytics_REVIEW.sql')
  assert.match(sql, /'by_channel'/)
  assert.match(sql, /coalesce\(o\.channel, 'marketplace'\)/)
  // Cancelled and fraud orders never count as business won.
  assert.match(sql, /status not in \('cancelled','fraud_review'\)/)
})

test('analytics loads nothing until a measurement ID is saved', () => {
  const a = get('src/lib/analytics.js')
  // No ID, no script, no cookie, no request.
  assert.match(a, /if \(!id \|\| loaded === id\) return loaded/)
  assert.match(a, /\^G-\[A-Z0-9\]\{6,\}\$/)
  // A single-page app must send its own page views or only count the first.
  assert.match(a, /send_page_view: false/)
  // Nothing identifying is ever sent to Google. Comments are stripped first:
  // the file names these fields precisely because they must never be sent.
  const live = a.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(live, /phone|full_name|address|email/i)
  // The setting exists so it is switched on without touching code.
  assert.match(get('supabase/migrations/20261104_growth_analytics_REVIEW.sql'), /'analytics_id'/)
  assert.match(get('src/pages/admin/Setup.jsx'), /key: 'analytics_id'/)
})

test('the growth report is money-safe and staff-only', () => {
  const sql = get('supabase/migrations/20261104_growth_analytics_REVIEW.sql')
  assert.match(sql, /if not \(is_staff\(\) or can_market\(\)\) then raise exception/)
  assert.match(sql, /security definer set search_path = public/)
  assert.doesNotMatch(sql, /grant execute on function public\.growth_report\(date, date\) to anon/)
  // The page must not invent figures when a source is not connected.
  const page = get('src/pages/marketing/GrowthDesk.jsx')
  assert.match(page, /Not connected/)
  assert.doesNotMatch(page, /Math\.random/)
})

// A link pasted into WhatsApp is read by a crawler that does not run
// JavaScript. Everything a preview needs has to be in the HTML before the app
// boots, which is what the edge function is for. These assert the two cases
// that matter: a product someone shares, and a shop someone shares.
test('a shared product link previews with its own photo, name and price', () => {
  const edge = get('netlify/edge-functions/seo.js')
  assert.match(edge, /og:image/)
  assert.match(edge, /'@type': 'Product'/)
  assert.match(edge, /priceCurrency: 'ZMW'/)
  // The preview image is the product's first photo, and only over https.
  assert.match(edge, /p\.images\?\.\[0\][\s\S]{0,80}\/\^https:/)
  // A Supabase outage must not mark the whole catalogue noindex.
  assert.match(edge, /A temporary Supabase failure MUST NOT mark all catalogue pages noindex/)
})

test("a shared shop link previews with the seller's own picture, not ours", () => {
  const edge = get('netlify/edge-functions/seo.js')
  // Their cover, then their logo. The ZA Market image is the last resort.
  assert.match(edge, /\[v\.cover_url, v\.logo_url\]\.find/)
  assert.match(edge, /if \(vendorPic\) image = vendorPic/)
  // A named trade beats a generic shop when somebody searches for a baker.
  assert.match(edge, /\[\/bakery\|cake\|pastry\|bread\|confection\/i, 'Bakery'\]/)
  assert.match(edge, /'@type': businessType\(v\.category\)/)
  assert.match(edge, /return 'Store'/)
  // Opening hours are never guessed into machine-readable form.
  assert.doesNotMatch(edge, /openingHours:/)
  assert.match(edge, /const hoursText/)
  // Shops are in the sitemap, so Google can find them without a link.
  assert.match(get('netlify/functions/sitemap.js'), /public_vendors\?select=slug/)
})
