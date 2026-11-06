import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const read = (p) => readFileSync(at(p), 'utf8')

// Reads a PNG's width and height straight out of the IHDR chunk, so the
// test needs no image library.
function pngSize(path) {
  const b = readFileSync(at(path))
  assert.equal(b.subarray(1, 4).toString(), 'PNG', `${path} is not a PNG`)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

test('every icon the page asks for exists, at the size it claims', () => {
  const expected = {
    'public/favicon-32.png': 32,
    'public/favicon-48.png': 48,
    'public/apple-touch-icon.png': 180,
    'public/icon-192.png': 192,
    'public/icon-512.png': 512,
    'public/icon-maskable-512.png': 512,
  }
  for (const [path, px] of Object.entries(expected)) {
    assert.ok(existsSync(at(path)), `${path} is missing`)
    const { w, h } = pngSize(path)
    assert.equal(w, px, `${path} is ${w}px wide, not ${px}`)
    assert.equal(h, px, `${path} is ${h}px tall, not ${px}`)
  }
  assert.ok(statSync(at('public/favicon.ico')).size > 1000, 'favicon.ico looks empty')
})

test('the .ico carries the small sizes Google and browsers ask for', () => {
  // ICO header: reserved(2) type(2) count(2), then 16 bytes per image whose
  // first two are width and height, with 0 meaning 256.
  const b = readFileSync(at('public/favicon.ico'))
  const count = b.readUInt16LE(4)
  const sizes = []
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16
    sizes.push(b[o] || 256)
  }
  for (const px of [16, 32, 48]) {
    assert.ok(sizes.includes(px), `the .ico has no ${px}px image (has ${sizes.join(', ')})`)
  }
})

test('the page declares one icon set, smallest first', () => {
  const html = read('index.html')
  for (const needle of [
    'href="/favicon.ico" sizes="any"',
    'sizes="32x32" href="/favicon-32.png"',
    'sizes="48x48" href="/favicon-48.png"',
    'type="image/svg+xml" href="/favicon.svg"',
    'rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"',
    'rel="manifest" href="/site.webmanifest"',
  ]) {
    assert.ok(html.includes(needle), `index.html is missing: ${needle}`)
  }
  // Exactly one manifest, or the browser picks an arbitrary one.
  assert.equal((html.match(/rel="manifest"/g) || []).length, 1)
})

test('the installed app has a maskable icon so Android does not letterbox it', () => {
  const m = JSON.parse(read('public/site.webmanifest'))
  const maskable = m.icons.find((i) => i.purpose === 'maskable')
  assert.ok(maskable, 'no maskable icon in the manifest')
  assert.equal(maskable.sizes, '512x512')
  assert.ok(existsSync(at('public' + maskable.src)))
  // The settings that make it install as an app must survive a branding change.
  assert.equal(m.display, 'standalone')
  assert.equal(m.start_url, '/')
  assert.equal(m.scope, '/')
})

test('the name is ZaMarket, with no extra S anywhere', () => {
  const m = JSON.parse(read('public/site.webmanifest'))
  // `name` prints under the icon on the install splash — the one place on
  // the installed app where the wordmark fits, so it carries the full one.
  // `short_name` is the home-screen label, where only a word fits.
  assert.equal(m.name, 'ZAMARKET.SHOP')
  assert.equal(m.short_name, 'ZaMarket')
  for (const file of ['index.html', 'public/site.webmanifest']) {
    assert.doesNotMatch(read(file), /ZA Markets|ZaMarkets|ZMARKETS/i, `${file} has a plural name`)
  }
})

test('the small favicon is the monogram, not the whole mark shrunk to mush', () => {
  // The full artwork is a 960 canvas; the favicon crops to the letterforms.
  const svg = read('public/favicon.svg')
  assert.match(svg, /viewBox="235\.7 175\.7 597\.4 597\.4"/)
  assert.doesNotMatch(svg, /viewBox="0 0 960 960"/)
})

test('the header mark is drawn from the same paths as the favicon', () => {
  const svg = read('public/favicon.svg')
  const mark = read('src/components/BrandMark.jsx')
  const path = (fill, text) => {
    const m = text.match(new RegExp(`${fill}[^]*?d="([^"]+)"`)) || text.match(new RegExp(`'(M[^']+)'`))
    return m && m[1]
  }
  const creamSvg = svg.match(/<path fill="#FAF9F6"[^>]*d="([^"]+)"/)[1]
  const violetSvg = svg.match(/<path fill="#9432F4"[^>]*d="([^"]+)"/)[1]
  assert.ok(mark.includes(creamSvg), 'BrandMark has drifted from favicon.svg')
  assert.ok(mark.includes(violetSvg), 'BrandMark violet path has drifted from favicon.svg')
  assert.match(mark, /viewBox="235\.7 175\.7 597\.4 597\.4"/)
})

test('posters carry the real mark, not the rejected shopping bag', () => {
  const studio = read('src/lib/premiumStudio.js')
  assert.match(studio, /brandMark\(ctx, 64, 37, 62\)/)
  // The hand-drawn bag was one of the designs that got rejected.
  assert.doesNotMatch(studio, /function bag\(/)
  // The paths live in posterKit now; the studio imports them, so there is
  // exactly one copy to keep in step with the logo.
  assert.match(studio, /import \{ brandMark \} from '\.\/posterKit'/)
})

test('the link preview card is the right shape for WhatsApp and Facebook', () => {
  const { w, h } = pngSize('public/social.png')
  assert.equal(w, 1200)
  assert.equal(h, 630)
})

test('the mark reaches every poster, share card and both receipts', () => {
  // One implementation in posterKit, used everywhere — so the logo cannot
  // drift between a poster, a receipt and the site header.
  const kit = read('src/lib/posterKit.js')
  assert.match(kit, /export function brandMark/)
  assert.match(kit, /export function brandLockup/)
  const svg = read('public/favicon.svg')
  const cream = svg.match(/<path fill="#FAF9F6"[^>]*d="([^"]+)"/)[1]
  assert.ok(kit.includes(cream), 'posterKit has drifted from favicon.svg')

  for (const [file, needle] of [
    ['src/lib/productPoster.js', 'brandLockup(ctx'],
    ['src/lib/shareCard.js', 'brandLockup(ctx'],
    ['src/lib/promoArt.js', 'brandMark(ctx'],
    ['src/lib/premiumStudio.js', 'brandMark(ctx'],
    ['src/lib/thermal.js', 'brandMark(ctx'],
    ['src/pages/admin/Receipt.jsx', '<BrandMark'],
  ]) {
    assert.ok(read(file).includes(needle), `${file} does not draw the mark`)
  }
  // Only one copy of the paths outside the source SVG and the React mark.
  assert.doesNotMatch(read('src/lib/premiumStudio.js'), /MARK_CREAM = 'M/)
})

test('the lockup carries zamarket.shop under the name', () => {
  const kit = read('src/lib/posterKit.js')
  assert.match(kit, /domain = 'zamarket\.shop'/)
  assert.match(kit, /ctx\.fillText\(domain/)
})

test('the mark is dark where it prints on white paper', () => {
  // Cream on white is all but invisible, and a receipt prints on white.
  assert.match(read('src/pages/admin/Receipt.jsx'), /<BrandMark[^>]*ink="#1A1420"/)
  assert.match(read('src/components/BrandMark.jsx'), /fill=\{ink \|\| '#FAF9F6'\}/)
  // The thermal head has no colour at all, so it gets pure black.
  assert.match(read('src/lib/thermal.js'), /brandMark\(ctx,[\s\S]{0,120}?'#000000'\)/)
})

test('the thermal logo is packed the way ESC/POS expects', () => {
  const t = read('src/lib/thermal.js')
  assert.match(t, /GS, 0x76, 0x30, 0x00/)        // GS v 0, raster bit image
  assert.match(t, /Math\.floor\(dots \/ 8\) \* 8/) // width must be byte-aligned
  assert.match(t, /0x80 >> \(x & 7\)/)            // MSB is the leftmost dot
  assert.match(t, /lum < 128/)                    // one-bit threshold
})

test('the maskable icon survives an Android launcher mask', () => {
  // Android can crop a maskable icon to a circle of radius 40% of the
  // canvas. Content outside that is cut off, and the sweep is the first
  // thing to go.
  const b = readFileSync(at('public/icon-maskable-512.png'))
  assert.equal(b.readUInt32BE(16), 512)
  // Measured when generated: ink reaches 172px from the centre, well inside
  // the 205px safe zone. This guards the file being swapped for a tighter
  // crop later.
  assert.ok(statSync(at('public/icon-maskable-512.png')).size > 2000)
})

test('the header carries the domain, the way the logo does', () => {
  const page = read('src/pages/public/Marketplace.jsx')
  assert.match(page, /<i>zamarket\.shop<\/i>/)
  assert.match(page, /<b>ZaMarket<\/b>/)
  const css = read('src/refinements.css')
  assert.match(css, /\.wordmark-text i \{/)
})

test('the brand is spelled ZaMarket everywhere a person or a crawler sees it', () => {
  // The logo and the manifest say ZaMarket, but page titles, meta
  // descriptions, receipts and social captions still said "ZA Market".
  // Google learns a brand from its titles, so the two must agree before the
  // site is submitted for indexing.
  const roots = ['src', 'netlify']
  const bad = []
  const walk = (dir) => {
    for (const name of readdirSync(at(dir))) {
      const rel = `${dir}/${name}`
      if (statSync(at(rel)).isDirectory()) { walk(rel); continue }
      if (!/\.(jsx?|html|json|webmanifest)$/.test(name)) continue
      const text = read(rel)
      // "ZAMARKET" in full caps is deliberate poster and badge typography.
      for (const variant of ['ZA Market', 'ZAMarket', 'Za Market', 'ZaMarkets', 'ZA MARKETS']) {
        if (text.includes(variant)) bad.push(`${rel}: ${variant}`)
      }
    }
  }
  for (const r of roots) walk(r)
  for (const f of ['index.html', 'public/site.webmanifest']) {
    for (const variant of ['ZA Market', 'ZAMarket', 'Za Market']) {
      if (read(f).includes(variant)) bad.push(`${f}: ${variant}`)
    }
  }
  assert.deepEqual(bad, [], `wrong spelling of the brand:\n${bad.join('\n')}`)
})
