import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

// ---------------------------------------------------------------- storefront
test('the store page keeps its data loading and hands it to the new layout', () => {
  const page = read('src/pages/public/Marketplace.jsx')
  const store = page.slice(page.indexOf('export function StorePage'))
  for (const kept of ["from('public_vendors')", "from('public_products')", "from('store_sections')", "from('public_offers')",
    'useSeoStore(store)', "rpc('track_hit'", 'setStoreRef(data.slug)', 'featured_in_store']) {
    assert.ok(store.includes(kept), `StorePage lost: ${kept}`)
  }
  assert.match(store, /<VendorStorefront\s/)
  // The existing card and share button do the buying and sharing.
  assert.match(store, /renderProduct=\{\(p\) => <OfferingCard p=\{p\} deal=\{dealFor\(offersBy, p\.id\)\} inStore=\{store\.slug\} \/>\}/)
  assert.match(store, /share=\{<ShareStore store=\{store\}/)
  assert.match(store, /<ListingCard key=\{p\.id\} p=\{p\} store=\{store\.slug\} \/>/)
})

test('the storefront claims nothing the data does not say', () => {
  const sf = read('src/components/storefront/VendorStorefront.jsx')
  // Verified only when the store page says so, which checks the real setting.
  assert.match(sf, /\{verified && \(/)
  assert.match(read('src/pages/public/Marketplace.jsx'), /const verified = settings\?\.verification_on === 'on' && store\.trust_level === 'verified'/)
  for (const claim of [/best seller/i, /easy returns/i, /trusted seller/i, /we deliver it to you/i, /quality products/i, /great value/i]) {
    assert.doesNotMatch(sf, claim)
  }
  // Rating appears only when there is one.
  assert.match(sf, /Number\(store\.rating\) > 0 &&/)
  // Collections only when there are at least two to choose between.
  assert.match(sf, /if \(filled\.length < 2\) return null/)
})

test('a seller who chose their own colours keeps them', async () => {
  const { storefrontVars } = await import('../src/components/storefront/VendorStorefront.jsx').catch(() => ({}))
  const sf = read('src/components/storefront/VendorStorefront.jsx')
  assert.match(sf, /const chosen = store\?\.theme\?\.colour && THEMES\.some/)
  assert.match(sf, /style=\{storefrontVars\(store\)\}/)
  if (storefrontVars) assert.deepEqual(storefrontVars({}), {})
})

test('storefront styles are scoped and phone-safe', () => {
  const css = read('src/components/storefront/VendorStorefront.css')
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/(^|})\s*([^{}@]+)\{/g) || []
  for (const raw of selectors) {
    const sel = raw.replace(/^}/, '').replace(/\{$/, '').trim()
    if (!sel || /^(from|to|\d+%)$/.test(sel)) continue
    for (const part of sel.split(',')) assert.match(part.trim(), /\.zsv|^body:has\(\.zsv\)/, `unscoped selector: ${part.trim()}`)
  }
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /min-height: 44px/)
})

// ---------------------------------------------------------------- delivery fund
test('the fund is added after the percentages, and the seller still gets exactly their amount', () => {
  const sql = read('supabase/migrations/20261111_delivery_fund_REVIEW.sql')
  assert.match(sql, /\(p_take \/ nullif\(1 - kept, 0\)\) \+ delivery_fund_for\(p_take\)/)
  // Settlement, payouts and commissions are not touched by this section.
  assert.doesNotMatch(sql, /function public\.(set_order_status|place_order|request_payout)/)
  assert.doesNotMatch(sql, /update public\.(settlements|commissions|payouts)/)
  // Free delivery is switched on once, never forced back on afterwards.
  assert.match(sql, /if not exists \(select 1 from public\.settings where key = 'delivery_fund_pct'\) then/)
  // Only founders adjust it by hand; only staff read it.
  assert.match(sql, /function public\.delivery_fund_adjust[\s\S]*?if not is_founder\(\)/)
  assert.match(sql, /function public\.delivery_fund_summary[\s\S]*?if not is_staff\(\)/)
})

test('the fund has its settings, its page and an honest price preview', () => {
  const setup = read('src/pages/admin/Setup.jsx')
  for (const key of ['delivery_fund_pct', 'delivery_fund_min', 'delivery_fund_max', 'delivery_fund_takes_unclaimed']) {
    assert.ok(setup.includes(`key: '${key}'`), `no setting for ${key}`)
  }
  assert.match(read('src/App.jsx'), /<Route path="delivery-fund" element=\{<DeliveryFund \/>\} \/>/)
  assert.match(read('src/components/Shell.jsx'), /'\/admin\/delivery-fund'/)
  const pm = read('src/components/PriceMaths.jsx')
  assert.match(pm, /Set aside for delivery/)
  assert.match(pm, /delivered free/)
  const page = read('src/pages/admin/DeliveryFund.jsx')
  assert.match(page, /rpc\('delivery_fund_summary'/)
  // A missing trip cost is counted, never ignored.
  assert.match(page, /unrecorded_estimate/)
})
