// A price list a vendor would otherwise type into WhatsApp by hand, badly.
// Everything here is read from the live catalogue at the moment of generating:
// change a price tomorrow, generate again, and the new price is on the sheet.
// Nothing is typed twice and nothing is invented.

import { money } from './format'

export const SHEET = {
  post: { key: 'post', label: 'Post (portrait)', w: 1080, h: 1350 },
  story: { key: 'story', label: 'Status or story', w: 1080, h: 1920 },
  square: { key: 'square', label: 'Square', w: 1080, h: 1080 },
  a4: { key: 'a4', label: 'A4 to print', w: 1240, h: 1754 },
}

// Five design systems. They differ by composition, type and spacing — not by a
// change of background colour. Each one is a different way of presenting a shop.
export const STYLES = {
  editorial: {
    key: 'editorial', label: 'Editorial',
    note: 'Magazine layout, big type, generous space. Best for a few beautiful things.',
    bg: '#FBFAF7', ink: '#14110E', muted: '#8A8175', accent: '#14110E', rule: '#E4DFD6',
    display: 'serif', caps: true, tracking: 0.14, rules: true, stripes: false, frame: 'square',
  },
  commerce: {
    key: 'commerce', label: 'Bold commerce',
    note: 'Big prices, strong colour, made to stop the scroll on WhatsApp.',
    bg: '#0B6B50', ink: '#FFFFFF', muted: '#BFE3D6', accent: '#F5C518', rule: 'rgba(255,255,255,0.22)',
    display: 'sans', caps: true, tracking: 0.02, rules: false, stripes: true, frame: 'round',
  },
  luxury: {
    key: 'luxury', label: 'Luxury',
    note: 'Dark, quiet, very little decoration. Large product photography.',
    bg: '#10100F', ink: '#F4F1EA', muted: '#9A948A', accent: '#D8B26A', rule: '#2A2825',
    display: 'serif', caps: false, tracking: 0.18, rules: true, stripes: false, frame: 'square',
  },
  local: {
    key: 'local', label: 'Modern local',
    note: 'Warm, contemporary, Zambian in colour rather than in clip art.',
    bg: '#FFF8EE', ink: '#1C2A22', muted: '#7C7266', accent: '#C56B23', rule: '#EADFCB',
    display: 'sans', caps: true, tracking: 0.06, rules: false, stripes: true, frame: 'round',
  },
  catalogue: {
    key: 'catalogue', label: 'Clean catalogue',
    note: 'Product first, nothing wasted. Built for long lists.',
    bg: '#FFFFFF', ink: '#12212E', muted: '#78858E', accent: '#0B6B50', rule: '#E6ECEA',
    display: 'sans', caps: false, tracking: 0.01, rules: true, stripes: false, frame: 'round',
  },
}

// The layout follows the content: five things are shown, twenty-five are listed.
export function layoutFor(count, sheet) {
  const tall = sheet === 'story' || sheet === 'a4'
  if (count <= (tall ? 8 : 6)) return 'showcase'
  if (count <= (tall ? 18 : 14)) return 'rows'
  return 'columns'
}
const font = (weight, size, display) =>
  `${weight} ${size}px ${display ? '"Fraunces", Georgia, serif' : '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif'}`

const load = (src) => new Promise((res) => {
  if (!src) return res(null)
  const i = new Image()
  i.crossOrigin = 'anonymous'
  i.onload = () => res(i)
  i.onerror = () => res(null)
  i.src = src
})

function rounded(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function fit(ctx, text, maxWidth) {
  let t = String(text || '')
  if (ctx.measureText(t).width <= maxWidth) return t
  while (t.length > 3 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

function cover(ctx, img, x, y, w, h, r = 12) {
  ctx.save()
  rounded(ctx, x, y, w, h, r)
  ctx.clip()
  const s = Math.max(w / img.width, h / img.height)
  const dw = img.width * s
  const dh = img.height * s
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

// Group by category, keeping the catalogue's own order inside each group.
export function groupProducts(products) {
  const groups = new Map()
  for (const p of products) {
    const key = p.category || 'Everything else'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(p)
  }
  return [...groups.entries()]
}

function setType(ctx, S, { weight = 600, size = 30, display = false }) {
  ctx.font = font(weight, size, display && S.display === 'serif')
}

const upper = (S, t) => (S.caps ? String(t || '').toUpperCase() : String(t || ''))

// Letter-spaced small type, used for labels and category names.
function tracked(ctx, text, x, y, spacing) {
  let cx = x
  for (const ch of String(text)) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + spacing
  }
  return cx - x
}
const trackedWidth = (ctx, text, spacing) =>
  [...String(text)].reduce((w, ch) => w + ctx.measureText(ch).width + spacing, 0) - spacing

async function drawHeader(ctx, S, F, M, { vendor, title, logo }) {
  const inner = F.w - M * 2
  let y = Math.round(F.h * 0.085)

  const mark = await load(logo || vendor?.logo_url)
  if (mark) {
    const size = Math.round(F.w * 0.09)
    cover(ctx, mark, M, y - size + 6, size, size, S.frame === 'round' ? 16 : 2)
    y += Math.round(F.h * 0.018)
  }

  ctx.fillStyle = S.muted
  setType(ctx, S, { weight: 700, size: Math.round(F.w * 0.019) })
  tracked(ctx, upper(S, title || 'Price list'), M, y - Math.round(F.w * 0.052), S.tracking * F.w * 0.019)

  ctx.fillStyle = S.ink
  setType(ctx, S, { weight: S.display === 'serif' ? 600 : 800, size: Math.round(F.w * 0.062), display: true })
  ctx.fillText(fit(ctx, vendor?.business_name || 'ZaMarket', inner), M, y)

  y += Math.round(F.h * 0.012)
  if (S.rules) {
    ctx.strokeStyle = S.rule
    ctx.lineWidth = S.key === 'editorial' ? 3 : 1.5
    ctx.beginPath()
    ctx.moveTo(M, y + 14)
    ctx.lineTo(M + inner, y + 14)
    ctx.stroke()
  }
  return y + Math.round(F.h * 0.035)
}

function drawFooter(ctx, S, F, M, { vendor, note }) {
  const inner = F.w - M * 2
  const y = F.h - Math.round(F.h * 0.055)
  if (S.rules) {
    ctx.strokeStyle = S.rule
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(M, y - Math.round(F.h * 0.028))
    ctx.lineTo(M + inner, y - Math.round(F.h * 0.028))
    ctx.stroke()
  }
  ctx.fillStyle = S.accent
  setType(ctx, S, { weight: 800, size: Math.round(F.w * 0.026) })
  ctx.fillText(fit(ctx, note || 'Order on ZaMarket', inner * 0.62), M, y)

  ctx.fillStyle = S.muted
  setType(ctx, S, { weight: 600, size: Math.round(F.w * 0.018) })
  const host = typeof window !== 'undefined' ? window.location.host : 'zamarket'
  const link = vendor?.slug ? `${host}/${vendor.slug}` : host
  ctx.fillText(link, M, y + Math.round(F.h * 0.022))

  const stamp = `Prices as at ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  ctx.fillText(stamp, M + inner - ctx.measureText(stamp).width, y + Math.round(F.h * 0.022))
}

function priceInk(ctx, S, F, p, x, y, size, alignRight) {
  const price = money(p.price).replace('.00', '')
  const was = p.normal_price && Number(p.normal_price) > Number(p.price) ? money(p.normal_price).replace('.00', '') : null
  setType(ctx, S, { weight: 800, size })
  const pw = ctx.measureText(price).width
  let wx = alignRight ? x - pw : x
  if (was) {
    setType(ctx, S, { weight: 500, size: Math.round(size * 0.58) })
    const ww = ctx.measureText(was).width
    if (alignRight) wx = x - pw - ww - 14
    ctx.fillStyle = S.muted
    ctx.fillText(was, wx, y)
    ctx.strokeStyle = S.muted
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(wx, y - size * 0.18)
    ctx.lineTo(wx + ww, y - size * 0.18)
    ctx.stroke()
    wx += ww + 14
  }
  ctx.fillStyle = S.accent
  setType(ctx, S, { weight: 800, size })
  ctx.fillText(price, wx, y)
}

// Few products: show them. Big photographs, big prices, room to breathe.
async function layoutShowcase(ctx, S, F, M, products, top) {
  const inner = F.w - M * 2
  const cols = products.length <= 3 ? 1 : 2
  const gap = Math.round(F.w * 0.035)
  const cellW = Math.round((inner - gap * (cols - 1)) / cols)
  const bottom = F.h - Math.round(F.h * 0.11)
  const rows = Math.ceil(products.length / cols)
  const cellH = Math.min(Math.round((bottom - top - gap * (rows - 1)) / rows), Math.round(F.h * 0.34))
  const imgH = Math.round(cellH * (cols === 1 ? 0.62 : 0.66))

  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    const x = M + (i % cols) * (cellW + gap)
    const y = top + Math.floor(i / cols) * (cellH + gap)
    if (y + cellH > bottom + 4) break

    const img = await load(p.images?.[0])
    if (img) cover(ctx, img, x, y, cellW, imgH, S.frame === 'round' ? 18 : 0)
    else {
      ctx.fillStyle = S.rule
      rounded(ctx, x, y, cellW, imgH, S.frame === 'round' ? 18 : 0)
      ctx.fill()
    }

    ctx.fillStyle = S.ink
    setType(ctx, S, { weight: S.display === 'serif' ? 600 : 700, size: Math.round(cellW * 0.072), display: true })
    ctx.fillText(fit(ctx, p.name, cellW), x, y + imgH + Math.round(cellH * 0.13))

    priceInk(ctx, S, F, p, x, y + imgH + Math.round(cellH * 0.27), Math.round(cellW * 0.085), false)
  }
}

// A normal list: a small photo, the name, the price, aligned so the eye can scan.
async function layoutRows(ctx, S, F, M, products, top) {
  const inner = F.w - M * 2
  const bottom = F.h - Math.round(F.h * 0.11)
  const groups = groupProducts(products)
  const lines = products.length + groups.length
  const rowH = Math.max(54, Math.min(Math.round((bottom - top) / lines), Math.round(F.w * 0.105)))
  const photo = rowH >= 68
  let y = top

  for (const [cat, list] of groups) {
    if (groups.length > 1) {
      ctx.fillStyle = S.muted
      setType(ctx, S, { weight: 800, size: Math.round(rowH * 0.28) })
      tracked(ctx, upper(S, cat), M, y + rowH * 0.42, S.tracking * rowH * 0.28)
      y += Math.round(rowH * 0.72)
    }
    for (const p of list) {
      if (y + rowH > bottom) break
      if (S.stripes) {
        ctx.fillStyle = S.key === 'commerce' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.035)'
        rounded(ctx, M - 12, y, inner + 24, rowH * 0.9, 14)
        ctx.fill()
      }
      let x = M
      if (photo) {
        const img = await load(p.images?.[0])
        const ps = Math.round(rowH * 0.68)
        if (img) cover(ctx, img, x, y + rowH * 0.11, ps, ps, S.frame === 'round' ? 12 : 0)
        else { ctx.fillStyle = S.rule; rounded(ctx, x, y + rowH * 0.11, ps, ps, S.frame === 'round' ? 12 : 0); ctx.fill() }
        x += ps + 18
      }
      ctx.fillStyle = S.ink
      setType(ctx, S, { weight: 600, size: Math.round(rowH * 0.32) })
      ctx.fillText(fit(ctx, p.name, inner - (x - M) - Math.round(inner * 0.34)), x, y + rowH * 0.58)
      priceInk(ctx, S, F, p, M + inner, y + rowH * 0.58, Math.round(rowH * 0.36), true)

      if (S.rules && !S.stripes) {
        ctx.strokeStyle = S.rule
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(M, y + rowH * 0.86)
        ctx.lineTo(M + inner, y + rowH * 0.86)
        ctx.stroke()
      }
      y += rowH
    }
    y += Math.round(rowH * 0.2)
  }
}

// Many products: two tight columns, dotted leaders, like a proper price list.
function layoutColumns(ctx, S, F, M, products, top) {
  const inner = F.w - M * 2
  const gap = Math.round(F.w * 0.05)
  const colW = Math.round((inner - gap) / 2)
  const bottom = F.h - Math.round(F.h * 0.11)
  const groups = groupProducts(products)
  const lines = products.length + groups.length * 1.6
  const rowH = Math.max(34, Math.min(Math.round(((bottom - top) * 2) / lines), Math.round(F.w * 0.052)))

  let col = 0
  let y = top
  const heading = (text, yy, cc) => {
    ctx.fillStyle = S.accent
    setType(ctx, S, { weight: 800, size: Math.round(rowH * 0.5) })
    tracked(ctx, upper(S, text), M + cc * (colW + gap), yy + rowH * 0.6, S.tracking * rowH * 0.5)
  }
  let current = ''
  const nextColumn = () => {
    col += 1
    y = top
    // a list that runs into the next column says so, instead of starting mid-air
    if (current) { heading(`${current} (continued)`, y, col); y += Math.round(rowH * 1.25) }
  }

  for (const [cat, list] of groups) {
    current = cat
    if (y + rowH * 2.4 > bottom && col === 0) { current = ''; nextColumn(); current = cat }
    heading(cat, y, col)
    y += Math.round(rowH * 1.25)

    for (const p of list) {
      if (y + rowH > bottom) {
        if (col === 0) nextColumn()
        else break
      }
      const x = M + col * (colW + gap)
      const price = money(p.price).replace('.00', '')
      setType(ctx, S, { weight: 800, size: Math.round(rowH * 0.5) })
      const pw = ctx.measureText(price).width
      ctx.fillStyle = S.ink
      setType(ctx, S, { weight: 500, size: Math.round(rowH * 0.46) })
      const name = fit(ctx, p.name, colW - pw - 24)
      ctx.fillText(name, x, y + rowH * 0.62)

      // dotted leader between the name and the price
      const nameW = ctx.measureText(name).width
      ctx.fillStyle = S.rule
      for (let dx = x + nameW + 10; dx < x + colW - pw - 8; dx += 8) ctx.fillRect(dx, y + rowH * 0.56, 2, 2)

      ctx.fillStyle = S.accent
      setType(ctx, S, { weight: 800, size: Math.round(rowH * 0.5) })
      ctx.fillText(price, x + colW - pw, y + rowH * 0.62)
      y += rowH
    }
    y += Math.round(rowH * 0.45)
  }
}

export async function renderPriceList({
  vendor, products, style = 'catalogue', sheet = 'post', title, note, logo, layout,
}) {
  const S = STYLES[style] || STYLES.catalogue
  const F = SHEET[sheet] || SHEET.post
  const c = document.createElement('canvas')
  c.width = F.w
  c.height = F.h
  const ctx = c.getContext('2d')
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* ignore */ } }

  ctx.fillStyle = S.bg
  ctx.fillRect(0, 0, F.w, F.h)

  // a quiet shape behind everything, different per system — never a gradient blob
  if (S.key === 'commerce') {
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.beginPath()
    ctx.arc(F.w * 0.95, F.h * 0.12, F.w * 0.42, 0, Math.PI * 2)
    ctx.fill()
  } else if (S.key === 'local') {
    ctx.fillStyle = 'rgba(197,107,35,0.10)'
    for (let i = 0; i < 9; i++) ctx.fillRect(F.w - 120 + (i % 3) * 26, 40 + Math.floor(i / 3) * 26, 14, 14)
  } else if (S.key === 'luxury') {
    ctx.strokeStyle = S.rule
    ctx.lineWidth = 2
    ctx.strokeRect(Math.round(F.w * 0.035), Math.round(F.w * 0.035), F.w - Math.round(F.w * 0.07), F.h - Math.round(F.w * 0.07))
  }

  const M = Math.round(F.w * (S.key === 'editorial' || S.key === 'luxury' ? 0.085 : 0.07))
  const top = await drawHeader(ctx, S, F, M, { vendor, title, logo })
  const mode = layout || layoutFor(products.length, sheet)

  if (mode === 'showcase') await layoutShowcase(ctx, S, F, M, products, top)
  else if (mode === 'rows') await layoutRows(ctx, S, F, M, products, top)
  else layoutColumns(ctx, S, F, M, products, top)

  drawFooter(ctx, S, F, M, { vendor, note })
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.93))
}

// How many rows fit before the sheet starts to look crowded.
export const roomFor = (sheet) => (sheet === 'story' ? 30 : sheet === 'a4' ? 40 : sheet === 'square' ? 18 : 26)
