import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const get = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
test('premium design layer loads after existing CSS and retains financial logic untouched', () => {
  const main = get('main.jsx')
  assert.ok(main.indexOf("import './premium.css'") > main.indexOf("import './styles.css'"))
  assert.match(get('premium.css'), /@media\(max-width:760px\)/)
})
test('homepage has a single deliberate storefront h1 and explicit discovery actions', () => {
  const source = get('pages/public/Marketplace.jsx')
  assert.match(source, /Discover more\. Shop/)
  assert.match(source, /<h2>\{f\.headline\}<\/h2>/)
  assert.match(source, /Skip to products/)
})
test('creative editor connects each tile to actual renderer instead of making nine catalogues', () => {
  const source = get('pages/shared/CreativeStudio.jsx')
  for (const renderer of ['renderCatalogue','renderCollection','renderSpotlight','renderArrival','renderPromo']) {
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
