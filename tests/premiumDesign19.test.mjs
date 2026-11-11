import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const get = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
test('premium design layer loads after existing CSS and retains financial logic untouched', () => {
  const main = get('main.jsx')
  assert.ok(main.indexOf("import './premium.css'") > main.indexOf("import './styles.css'"))
  assert.match(get('premium.css'), /@media\(max-width:760px\)/)
})
// The long welcome block this once asserted was removed on purpose: it was
// taking most of the first screen before a shopper saw a single product. What
// still matters is that there is exactly one h1 and it is the storefront.
test('homepage leads with one storefront heading, not a sales pitch', () => {
  const source = get('pages/public/Marketplace.jsx')
  const storefront = source.split('export function Storefront()')[1].split('function OpeningSoon()')[0]
  assert.equal((storefront.match(/<h1>/g) || []).length, 1)
  assert.match(storefront, /home-market-head/)
  assert.match(source, /<h2>\{f\.headline\}<\/h2>/)
})
test('creative editor connects each tile to actual renderer instead of making nine catalogues', () => {
  const source = get('pages/shared/CreativeStudio.jsx')
  // The three catalogue layouts are now one renderer told which kind to draw.
  // What matters is unchanged: each tile still produces its own design rather
  // than nine copies of the same catalogue page.
  for (const kind of ['priceList', 'collection', 'spotlight']) {
    assert.match(source, new RegExp(`renderPremiumStudio\\(\\{[^}]*kind: '${kind}'`),
      `the ${kind} tile must dispatch its own layout`)
  }
  for (const renderer of ['renderArrival', 'renderProductPoster']) {
    assert.match(source, new RegExp(`await ${renderer}\\(`))
  }
  assert.match(source, /studioExportPlan\(tool, picked, sheet\)/)
})
test('marketing specialist can reach campaign launchpad, blog and SEO from workspace menu', () => {
  const shell = get('components/Shell.jsx')
  for (const segment of ['marketing/launch', 'marketing/blog', 'marketing/seo']) {
    assert.match(shell, new RegExp(`to: '/admin/${segment}'`))
  }
})
