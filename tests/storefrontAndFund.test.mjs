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
  assert.match(sf, /\{verified && <span className="zsv-verified"/)
  assert.match(read('src/pages/public/Marketplace.jsx'), /const verified = settings\?\.verification_on === 'on' && store\.trust_level === 'verified'/)
  for (const claim of [/best seller/i, /easy returns/i, /trusted seller/i, /we deliver it to you/i, /quality products/i, /great value/i]) {
    assert.doesNotMatch(sf, claim)
  }
  // Rating appears only when there is one.
  assert.match(sf, /Number\(store\.rating\) > 0 &&/)
  // A single category system replaces duplicate chip + collection navigation.
  assert.match(sf, /function ShopCategories\(/)
  assert.doesNotMatch(sf, /Shop by collection/)
  assert.doesNotMatch(sf, /zsv-chips/)
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

// ---------------------------------------------------------------- storefront refinement
test('the hero is one banner: identity, real product photos and the buttons together', () => {
  const sf = read('src/components/storefront/VendorStorefront.jsx')
  const hero = sf.slice(sf.indexOf('function Hero('), sf.indexOf('function About('))
  for (const part of ['zsv-hero-id', 'zsv-hero-art', 'zsv-hero-copy', 'Shop this store']) assert.ok(hero.includes(part), part)
  // The seller's cover is the banner; without one, their real product photos are.
  assert.match(hero, /products\.map\(firstImage\)/)
  assert.match(hero, /const art = cover \? \[\] : photos/)
  assert.match(hero, /<img className="zsv-hero-cover" src=\{cover\}/)
  // Product photos are shown whole.
  assert.match(read('src/components/storefront/VendorStorefront.css'), /\.zsv-shot img \{[^}]*object-fit: contain/)
})

test('without a logo the shop gets initials in a ring, not a fake logo', async () => {
  const sf = read('src/components/storefront/VendorStorefront.jsx')
  assert.match(sf, /<span className="zsv-monogram" aria-hidden>\{initialsOf\(store\.business_name\)\}<\/span>/)
  // Same rule as the component, checked here without importing JSX.
  const body = sf.slice(sf.indexOf('export function initialsOf'), sf.indexOf('function Hero('))
  const initialsOf = new Function(`${body.replace('export function', 'function')}; return initialsOf`)()
  assert.equal(initialsOf('God is Faithful Enterprises'), 'GF')
  assert.equal(initialsOf('Sweet Things'), 'ST')
  assert.equal(initialsOf('Zambezi'), 'ZA')
  assert.equal(initialsOf(''), 'S')
})

test('one usable category selector filters one product grid', () => {
  const page = read('src/pages/public/Marketplace.jsx')
  const sf = read('src/components/storefront/VendorStorefront.jsx')
  assert.doesNotMatch(page, /'More from this shop'/)
  assert.match(page, /sectionName\(p\) \|\| p\.category \|\|/)
  assert.match(sf, /Shop by category/)
  assert.doesNotMatch(sf, /Shop by collection/)
  assert.doesNotMatch(sf, /zsv-chips/)
  assert.match(sf, /const shown = selectedCategory/)
  assert.match(sf, /allProducts = \[\.\.\.productList\]\.sort/)
  assert.match(sf, /renderProduct\(p\)/)
  const css = read('src/components/storefront/VendorStorefront.css')
  assert.match(css, /\.zsv-category-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 9px; \}/)
})

test('seller can edit optional store delivery wording without changing checkout', () => {
  const vendor = read('src/pages/vendor/Vendor.jsx')
  const sf = read('src/components/storefront/VendorStorefront.jsx')
  const migration = read('supabase/migrations/20261112_storefront_delivery_message_REVIEW.sql')
  assert.match(vendor, /label="Store delivery message"/)
  assert.match(vendor, /store_delivery_message: f\.store_delivery_message\.trim\(\) \|\| null/)
  assert.match(sf, /text\(store\.store_delivery_message\) &&/)
  assert.doesNotMatch(sf, /Member since|member since/)
  assert.match(migration, /add column if not exists store_delivery_message text/)
  assert.match(migration, /alter view public\.public_vendors set \(security_invoker = on\)/)
  assert.doesNotMatch(migration, /update (public\.)?(orders|products|settlements)/)
})

test('the site header folds while scrolling a store on a phone, and only there', () => {
  const sf = read('src/components/storefront/VendorStorefront.jsx')
  assert.match(sf, /document\.body\.classList\.add\('zsv-compact'\)/)
  // Undone on leaving, and it slides the header rather than removing rows,
  // because removing rows moved the page and made the header flicker.
  assert.match(sf, /document\.body\.classList\.remove\('zsv-compact'\)\n      document\.body\.style\.removeProperty\('--zsv-fold'\)/)
  assert.match(read('src/components/storefront/VendorStorefront.css'), /body\.zsv-compact \.shop-header \{ transform: translateY\(calc\(-1 \* var\(--zsv-fold, 0px\)\)\); \}/)
  const css = read('src/components/storefront/VendorStorefront.css')
  const mobile = css.slice(css.indexOf('@media (max-width: 600px)'))
  // The search box and the cart stay.
  assert.doesNotMatch(mobile, /body\.zsv-compact \.shop-header \.(shop-search|header-cart)[^{]*\{[^}]*display: none/)
})

test('V45 phone storefront uses one photo-led category selector and a unified banner', () => {
  const sf = read('src/components/storefront/VendorStorefront.jsx')
  const css = read('src/components/storefront/VendorStorefront.css')
  assert.match(sf, /const art = cover \? \[\] : photos/)
  assert.match(sf, /<img className="zsv-hero-cover" src=\{cover\}/)
  assert.match(sf, /Shop by category/)
  assert.match(sf, /zsv-view-all/)
  assert.doesNotMatch(sf, /Member since|Shop by collection/)
  assert.match(css, /V45: approved phone storefront treatment/)
  assert.match(css, /\.zsv-shot \{ background: transparent; box-shadow:none/)
  assert.match(css, /@media \(max-width:600px\)/)
})


// ---------------------------------------------------------------- V46
test('the seller\'s own colours reach every part of the storefront', () => {
  const css = read('src/components/storefront/VendorStorefront.css')
  const v46 = css.slice(css.indexOf('V46: the seller'))
  assert.ok(v46.length > 100, 'no V46 block')
  // In the final block every colour is a variable, so a theme can change it.
  // (#fff behind product photos is deliberate: photos usually have white backgrounds.)
  const literals = (v46.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter((c) => !/^#fff(fff)?$/i.test(c))
  assert.deepEqual(literals, [])
  for (const sel of ['.zsv-hero {', '.zsv-actions .zsv-btn.primary', '.zsv-grid .oc-action-btn', '.zsv-category-tile.active', '.zsv-about {', '.zsv-verified']) {
    assert.ok(v46.includes(sel), `V46 does not restyle ${sel}`)
  }
  const sf = read('src/components/storefront/VendorStorefront.jsx')
  // Bold and tinted shops colour the page, as before the redesign.
  assert.match(sf, /store\.theme\.style !== 'clean' \? \{ '--zsv-page': v\['--store-bg'\] \}/)
})

test('the cover photo is the banner, and categories are a slim row', () => {
  const css = read('src/components/storefront/VendorStorefront.css')
  const v46 = css.slice(css.indexOf('V46: the seller'))
  assert.match(v46, /\.zsv-hero-cover \{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover/)
  assert.match(v46, /height: 54px/)
  const phone = v46.slice(v46.indexOf('@media (max-width: 600px)'))
  assert.match(phone, /\.zsv-category-grid \{ flex-wrap: nowrap; overflow-x: auto/)
})

// ---------------------------------------------------------------- update 44
test('affiliates see their Al-Halaqa code; only staff can set it', () => {
  const sql = read('supabase/migrations/20261112_academy_code_REVIEW.sql')
  assert.match(sql, /add column if not exists academy_code text/)
  assert.match(sql, /if not is_staff\(\) then/)
  assert.match(sql, /new\.academy_code := null/)
  const page = read('src/pages/reseller/Training.jsx')
  assert.match(page, /profile\?\.partner\?\.academy_code/)
  assert.match(page, /Your academy code/)
  assert.match(read('src/pages/admin/Partners.jsx'), /update\(\{ academy_code: code \|\| null \}\)/)
})

test('a damaged saved cart cannot show NaN', () => {
  const cart = read('src/lib/cart.jsx')
  assert.match(cart, /qty: Math\.max\(1, Math\.round\(Number\(i\.qty\)\) \|\| 1\)/)
})

test('product grids are two across on a phone', () => {
  assert.match(read('src/refinements.css'), /@media \(max-width: 560px\) \{\n  \.grid-products \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
})

test('the two newer poster designs give the photo the space the words leave', () => {
  const pp = read('src/lib/productPoster.js')
  const cat = pp.slice(pp.indexOf('function drawCatalogue('), pp.indexOf('function drawSplit('))
  assert.match(cat, /photoPanel\(ctx, dir, hero, pad, photoY, w - pad \* 2, priceY - gap - photoY\)/)
  const split = pp.slice(pp.indexOf('function drawSplit('), pp.indexOf('// --- the emporium sheet'))
  // The price never sits under the QR card on a square or wide poster.
  assert.match(split, /const copyBottom = Math\.min\(bottom, qrTopOf\(dir, w, bodyH, footerH\)\)/)
  // Photos are contained, never cropped.
  assert.match(pp, /function photoPanel[\s\S]*?Math\.min\(\(width - inset \* 2\) \/ hero\.width, \(height - inset \* 2\) \/ hero\.height\)/)
})
