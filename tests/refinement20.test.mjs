import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const get = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('critical dark background renders before app CSS and JS', () => {
  const html = get('index.html')
  // The page must be dark before a single stylesheet has loaded, otherwise
  // every navigation flashes white on a slow phone.
  assert.ok(html.indexOf('background:#0E1013') < html.indexOf('/src/main.jsx'))
  // The loading skeleton is dark too. It is written in tokens rather than
  // hexes, so assert the tokens: a hard-coded colour here is how the palette
  // drifted away from the deployed one in the first place.
  const styles = get('src/styles.css')
  assert.match(styles, /\.sk \{[^}]*var\(--coal-2\)[^}]*var\(--coal-3\)/)
  assert.doesNotMatch(styles, /\.sk \{[^}]*#[EF]/i)
})
test('links no longer underline on tap, with keyboard focus preserved', () => {
  const css = get('src/refinements.css')
  // A phone fires :hover on tap and leaves it stuck. All four states are
  // covered. This layer loads last, so it wins on order without !important.
  for (const state of ['a:hover', 'a:active', 'a:focus', 'a:focus-visible']) {
    assert.ok(css.includes(state), `${state} should be de-underlined`)
  }
  assert.match(css, /text-decoration:\s*none/)
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*2px/)
})
test('homepage prioritizes real catalogue products ahead of featured hero', () => {
  const section = get('src/pages/public/Marketplace.jsx').split('export function Storefront()')[1].split('function OpeningSoon()')[0]
  assert.ok(section.indexOf('home-product-grid') < section.indexOf('<FounderHero />'))
  assert.ok(section.indexOf('products.slice(0, 8).map(card)') < section.indexOf('home-featured-lower'))
  assert.doesNotMatch(section, /home-value-bar|home-explore|<HelpStrip/)
})
test('affiliate recruitment is only in public footer, not shopping department strip', () => {
  const code = get('src/pages/public/Marketplace.jsx')
  const header = code.split('<nav className="dept-strip"')[1].split('</nav>')[0]
  assert.doesNotMatch(header, /affiliates|Journal/)
  assert.match(code, /<Link to="\/affiliates">Become an affiliate<\/Link>/)
})
test('vendor themes and cover wallpapers have precedence over general premium styling', () => {
  const css = get('src/refinements.css')
  assert.match(css, /\.shop \.store-themed \.oc/)
  assert.match(css, /\.shop \.store-themed \.store-cover/)
  assert.match(css, /background:\s*var\(--store-card\)/)
  // The seller's wallpaper is never dimmed or filtered.
  assert.match(css, /\.store-cover \{[^}]*filter:\s*none[^}]*opacity:\s*1/)
})

// Everything in the correction layer is written in tokens. A hard-coded hex
// here is a palette that quietly drifts away from the deployed theme — which
// is what "it's the same dark violet but it looks different" actually was.
test('the correction layer uses theme tokens, never raw hex colours', () => {
  const hexes = get('src/refinements.css').match(/#[0-9A-Fa-f]{3,8}\b/g) || []
  assert.deepEqual(hexes, [])
})
test('founder action numbers and cash flows have visible tile and bar components', () => {
  const dashboard = get('src/pages/admin/Dashboard.jsx')
  assert.match(dashboard, /admin-priority-grid/)
  assert.match(dashboard, /finance-visual-track/)
  assert.match(dashboard, /finance-visual-total/)
  assert.doesNotMatch(dashboard, /<Breakdown/)
})
test('mobile More navigation is grouped into work categories', () => {
  const shell = get('src/components/Shell.jsx')
  assert.match(shell, /moreGroups = nav\.reduce/)
  assert.match(shell, /sheet-section/)
})
test('the product poster draws only what the seller actually entered', () => {
  const code = get('src/lib/productPoster.js')
  assert.match(code, /export async function renderProductPoster/)
  // Five designs and four sizes, all sharing one art direction with the
  // store poster so a seller's posts look like the same business.
  assert.match(code, /from '\.\/posterKit'/)
  for (const d of ['hero', 'editorial', 'detail', 'gallery', 'statement']) {
    assert.ok(code.includes(`${d}:`), `${d} design should exist`)
  }
  // A saving is only ever a normal_price the seller typed, never computed
  // urgency. Nothing in this file may invent a claim.
  assert.match(code, /export function savingOf/)
  assert.match(code, /product\?\.normal_price/)
  // Strip comments first: the file's header lists these phrases precisely
  // because they are the ones that must never be drawn.
  const live = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(live, /only \d+ left|selling fast|limited time|guarantee/i)
})

// This one is not a style check. A QR code that is a few pixels too small, or
// clipped at the poster edge, looks perfect and does not scan — and nobody
// finds out until a customer is standing there with a phone. Both failures
// happened; these are the guards.
test('the QR code stays large enough and wholly inside the poster', () => {
  const kit = get('src/lib/posterKit.js')
  assert.match(kit, /export const qrMinSize/)
  assert.match(kit, /posterW \* 0\.185/)
  // Downscaling a QR with smoothing off drops whole module rows.
  assert.match(kit, /imageSmoothingEnabled = true/)
  for (const f of ['src/lib/productPoster.js', 'src/lib/storePoster.js']) {
    const code = get(f)
    assert.match(code, /Math\.max\(Math\.round\(height \* 0\.6\d\), qrMinSize\(width\)\)/, `${f} must enforce the minimum`)
    assert.match(code, /Math\.min\(cy - q \/ 2, y \+ height - q - bleed\)/, `${f} must keep the code inside the poster`)
  }
})

// Every dashboard gets the same chrome: bottom navigation on a phone, and a
// bell plus a real account menu at the top. The avatar used to be a dead
// <span> that looked like a button on all three.
test('vendor and affiliate dashboards get the same navigation as the founder', () => {
  const shell = get('src/components/Shell.jsx')
  for (const role of ['staff', 'reseller', 'vendor']) {
    assert.ok(shell.includes(`${role}: [`), `${role} needs its own bottom tabs`)
  }
  assert.match(shell, /<nav className="bottomnav">/)
  assert.match(shell, /<ActionBell \/><AccountMenu/)
  assert.match(shell, /button type="button" className="workspace-avatar"/)
  // The menu closes on a click away and on Escape, and removes both listeners.
  assert.match(shell, /document\.addEventListener\('mousedown', away\)/)
  assert.match(shell, /document\.removeEventListener\('keydown', esc\)/)
  // An affiliate has no settings page of their own, so they get fewer items
  // rather than a link to a page they cannot open.
  assert.match(shell, /reseller: \[\],/)
})
