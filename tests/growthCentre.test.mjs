import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { WORKSPACES, QUICK, GUIDE, ALL_TOOLS, toolByKey, searchTools } from '../src/lib/marketingTools.js'

const hub = fs.readFileSync('src/pages/marketing/MarketingHub.jsx', 'utf8')
const app = fs.readFileSync('src/App.jsx', 'utf8')
const traffic = fs.readFileSync('src/pages/admin/Traffic.jsx', 'utf8')
const css = fs.readFileSync('src/growth-centre.css', 'utf8')
const sections = [...hub.match(/const SECTIONS = \[([\s\S]*?)\n\]/)[1].matchAll(/\['([^']*)'/g)].map((m) => m[1])

test('six colour-coded workspaces in the agreed order', () => {
  assert.deepEqual(WORKSPACES.map((w) => w.name), ['Find Customers', 'Promote & Advertise', 'Get Discovered', 'Offers & Promotions', 'Grow Your Sales Team', 'Track Performance'])
  assert.deepEqual(WORKSPACES.map((w) => w.tone), ['purple', 'pink', 'blue', 'amber', 'green', 'violet'])
})

test('every marketing section is reachable from a workspace or the guide', () => {
  const linked = new Set([...ALL_TOOLS, GUIDE].map((t) => t.to.split('#')[0].replace(/^\/admin\/marketing\/?/, '')))
  for (const s of sections) assert.ok(linked.has(s), `section "${s}" has no tool link`)
})

test('every tool link points at a real route', () => {
  for (const t of ALL_TOOLS) {
    const path = t.to.split('#')[0]
    if (path.startsWith('/admin/marketing')) { assert.ok(sections.includes(path.replace(/^\/admin\/marketing\/?/, '')), t.to); continue }
    const leaf = path.replace('/admin/', '')
    assert.ok(app.includes(`path="${leaf}"`), `no route for ${t.to}`)
  }
})

test('quick access has the seven agreed shortcuts', () => {
  assert.deepEqual(QUICK, ['studio', 'videos', 'finder', 'launch', 'recruiting', 'traffic', 'start'])
  for (const k of QUICK) assert.ok(toolByKey(k), k)
})

test('search finds tools by name and by description', () => {
  assert.ok(searchTools('video').some((t) => t.key === 'videos'))
  assert.ok(searchTools('google').some((t) => t.key === 'seo'))
  assert.equal(searchTools('').length, 0)
})

test('Visitors dashboard uses only real traffic_summary fields, no invented % changes', () => {
  for (const f of ['visitors_today', 'page_views', 'sources', 'pages', 'vehicles', 'funnel', 'products', 'affiliates']) assert.ok(traffic.includes(f), f)
  assert.ok(!/vs last|% from last|previous period/i.test(traffic))
  for (const d of ['Today', '7 days', '30 days', '90 days']) assert.ok(traffic.includes(d), d)
})

test('mobile layout swaps the Motors table for cards', () => {
  assert.match(css, /\.gc-only-wide \{ display: none !important; \}/)
  assert.match(css, /\.gc-only-narrow \{ display: grid !important; \}/)
})
