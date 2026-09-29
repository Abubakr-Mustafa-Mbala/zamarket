// Five compositions, not one template with five colour swaps. The same approved
// facts are arranged differently each time: what dominates, where the price sits,
// how the photograph is treated, what decoration supports it.
//
// Category decides the palette and the visual language. A cake is not a charger.

import { money } from './format'
import { approvedFacts, valueLine, trustPoints, ctaFor } from './hooks'

export const FORMATS = {
  portrait: { key: 'portrait', label: 'Post (portrait)', w: 1080, h: 1350 },
  story: { key: 'story', label: 'Status or story', w: 1080, h: 1920 },
  square: { key: 'square', label: 'Square', w: 1080, h: 1080 },
}

// Creative types beyond the plain advert. Each changes what the picture is about,
// not just how it looks: an arrival, a set of things, or a business.
export const KINDS = [
  { key: 'promotion', label: 'Advert', note: 'One product, one reason to buy' },
  { key: 'new_arrival', label: 'New arrival', note: 'Just landed — for something genuinely new' },
  { key: 'collection', label: 'Collection', note: 'Several products in one picture' },
  { key: 'vendor_spotlight', label: 'Business spotlight', note: 'The shop itself, not one item' },
]

export const COMPOSITIONS = [
  { key: 'hero', label: 'Product first', note: 'The photograph dominates. For things that look good.' },
  { key: 'offer', label: 'Offer first', note: 'The deal is the headline. For real savings.' },
  { key: 'editorial', label: 'Editorial', note: 'Split screen, magazine type. For considered purchases.' },
  { key: 'price', label: 'Price first', note: 'The number leads. For a price worth shouting.' },
  { key: 'dark', label: 'Premium', note: 'Dark, quiet, photograph-led. For higher-value items.' },
]

// The visual language per category. Backgrounds are never plain white by default.
const LOOKS = {
  food: { bg: '#FFF4E8', ink: '#2A1B12', soft: '#FFE6CC', accent: '#C2410C', deep: '#7C2D12', display: 'serif', crop: 'close' },
  electronics: { bg: '#0F172A', ink: '#F1F5F9', soft: '#1E293B', accent: '#38BDF8', deep: '#020617', display: 'sans', crop: 'product' },
  fashion: { bg: '#F6F1EC', ink: '#1C1917', soft: '#E7DED5', accent: '#1C1917', deep: '#44403C', display: 'serif', crop: 'full' },
  beauty: { bg: '#FDF2F6', ink: '#3B1F2B', soft: '#F8DDE8', accent: '#9D2C5B', deep: '#6B1C3E', display: 'serif', crop: 'close' },
  home: { bg: '#F2F5F3', ink: '#14231C', soft: '#DCE8E1', accent: '#0B6B50', deep: '#07422F', display: 'sans', crop: 'full' },
  vehicle: { bg: '#0B0F14', ink: '#F4F6F8', soft: '#161D26', accent: '#E3B341', deep: '#05080C', display: 'sans', crop: 'wide' },
  service: { bg: '#EFF6F3', ink: '#0F2B22', soft: '#D8EBE3', accent: '#0B6B50', deep: '#06301F', display: 'sans', crop: 'full' },
  course: { bg: '#F1F4FB', ink: '#111A33', soft: '#DCE4F7', accent: '#2547A8', deep: '#101E44', display: 'serif', crop: 'full' },
  event: { bg: '#15121F', ink: '#F5F2FF', soft: '#241E35', accent: '#C4A1FF', deep: '#0C0916', display: 'sans', crop: 'wide' },
  general: { bg: '#F5F7F6', ink: '#12212E', soft: '#E4EDE9', accent: '#0B6B50', deep: '#07422F', display: 'sans', crop: 'full' },
}

export function lookFor(product) {
  const t = (product?.offering_type || '').toLowerCase()
  const c = (product?.category || '').toLowerCase()
  if (t === 'vehicle') return LOOKS.vehicle
  if (t === 'event') return LOOKS.event
  if (t === 'course' || t === 'class') return LOOKS.course
  if (product?.fulfilment === 'service') return LOOKS.service
  if (/food|cake|bak|snack|drink|cater|meal/.test(c)) return LOOKS.food
  if (/phone|electronic|laptop|computer|tv|charger|audio/.test(c)) return LOOKS.electronics
  if (/fashion|cloth|wear|shoe|dress|bag/.test(c)) return LOOKS.fashion
  if (/beauty|cosmetic|hair|skin|nail|perfume/.test(c)) return LOOKS.beauty
  if (/home|kitchen|furnitur|decor|living/.test(c)) return LOOKS.home
  return LOOKS.general
}

// ---------- drawing helpers ----------
const font = (w, s, serif) => `${w} ${s}px ${serif ? '"Fraunces", Georgia, serif' : '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif'}`
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

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const rows = []
  let row = ''
  let cut = false
  for (let i = 0; i < words.length; i++) {
    const test = row ? `${row} ${words[i]}` : words[i]
    if (ctx.measureText(test).width > maxWidth && row) {
      rows.push(row)
      row = words[i]
      if (rows.length === maxLines) { cut = i < words.length - 1; break }
    } else row = test
  }
  if (row && rows.length < maxLines) rows.push(row)
  if (cut && rows.length) {
    let last = rows[rows.length - 1]
    while (ctx.measureText(`${last}…`).width > maxWidth && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '))
    rows[rows.length - 1] = `${last}…`
  }
  return rows
}

function fit(ctx, text, maxWidth) {
  let t = String(text || '')
  if (ctx.measureText(t).width <= maxWidth) return t
  while (t.length > 3 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

function fitText(ctx, text, maxWidth, maxLines, start, weight, serif, min = 24) {
  let size = start
  for (;;) {
    ctx.font = font(weight, size, serif)
    const rows = wrap(ctx, text, maxWidth, maxLines + 1)
    if (rows.length <= maxLines || size <= min) return { size, rows: rows.slice(0, maxLines) }
    size -= 3
  }
}

function cover(ctx, img, x, y, w, h, r = 0) {
  ctx.save()
  if (r) { rounded(ctx, x, y, w, h, r); ctx.clip() } else { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip() }
  const s = Math.max(w / img.width, h / img.height)
  const dw = img.width * s
  const dh = img.height * s
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

// A product floated on the background with a shadow, rather than boxed in.
function floatProduct(ctx, img, cx, cy, maxW, maxH, L) {
  if (!img) {
    ctx.fillStyle = L.soft
    ctx.beginPath()
    ctx.arc(cx, cy, Math.min(maxW, maxH) * 0.42, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  const s = Math.min(maxW / img.width, maxH / img.height)
  const w = img.width * s
  const h = img.height * s
  ctx.save()
  ctx.filter = 'blur(22px)'
  ctx.globalAlpha = 0.3
  ctx.fillStyle = L.deep
  ctx.beginPath()
  ctx.ellipse(cx, cy + h / 2 - 8, w * 0.36, Math.max(10, h * 0.05), 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
}

function vendorLine(ctx, L, F, x, y, facts, logo) {
  if (logo) cover(ctx, logo, x, y - 34, 44, 44, 12)
  ctx.fillStyle = L.ink
  ctx.font = font(700, 26)
  ctx.globalAlpha = 0.8
  ctx.fillText((facts.vendor || 'ZaMarket').toUpperCase(), x + (logo ? 58 : 0), y)
  ctx.globalAlpha = 1
}

function ctaPill(ctx, L, F, x, y, w, text, invert) {
  const h = Math.round(F.w * 0.098)
  ctx.fillStyle = invert ? L.ink : L.accent
  rounded(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = invert ? L.bg : '#FFFFFF'
  const f = fitText(ctx, text, w - 90, 1, 38, 800, false, 24)
  ctx.font = font(800, f.size, false)
  const tw = ctx.measureText(f.rows[0]).width
  ctx.fillText(f.rows[0], x + (w - tw) / 2 - 12, y + h / 2 + f.size * 0.34)
  ctx.font = font(800, f.size, false)
  ctx.fillText('→', x + w - 52, y + h / 2 + f.size * 0.34)
  return h
}

function linkLine(ctx, L, F, x, y, link) {
  ctx.fillStyle = L.ink
  ctx.globalAlpha = 0.6
  ctx.font = font(600, 26)
  ctx.fillText(String(link).replace(/^https?:\/\//, ''), x, y)
  ctx.globalAlpha = 1
}

function bigPrice(ctx, L, F, x, y, facts, size) {
  ctx.fillStyle = L.accent
  ctx.font = font(800, size)
  const price = money(facts.price).replace('.00', '')
  ctx.fillText(price, x, y)
  const w = ctx.measureText(price).width
  if (facts.normal) {
    ctx.font = font(500, Math.round(size * 0.32))
    ctx.fillStyle = L.ink
    ctx.globalAlpha = 0.55
    const was = money(facts.normal).replace('.00', '')
    ctx.fillText(was, x + w + 18, y)
    ctx.strokeStyle = L.ink
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x + w + 18, y - size * 0.1)
    ctx.lineTo(x + w + 18 + ctx.measureText(was).width, y - size * 0.1)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  return w
}

function trustRow(ctx, L, F, x, y, facts, product, settings) {
  const points = trustPoints(facts, product, settings).slice(0, 3)
  ctx.font = font(600, 24)
  let cx = x
  points.forEach((p) => {
    const label = p.label.replace('\n', ' ')
    const w = ctx.measureText(label).width + 44
    ctx.fillStyle = L.soft
    rounded(ctx, cx, y - 30, w, 46, 23)
    ctx.fill()
    ctx.fillStyle = L.accent
    ctx.beginPath()
    ctx.arc(cx + 22, y - 7, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = L.ink
    ctx.fillText(label, cx + 38, y + 1)
    cx += w + 10
  })
}

// Every composition reserves the same footer space before it draws anything.
function bottomStack(F) {
  const ctaH = Math.round(F.w * 0.098)
  const linkH = 74
  const ctaY = F.h - linkH - ctaH
  return { ctaH, linkH, ctaY, linkY: F.h - 26, free: ctaY - 30 }
}

// ---------- the five compositions ----------

// 1. Product first — the photograph fills the top two thirds, floating free.
async function compHero(ctx, L, F, facts, product, hook, link, photo, logo, settings) {
  const M = Math.round(F.w * 0.075)
  const inner = F.w - M * 2
  ctx.fillStyle = L.bg
  ctx.fillRect(0, 0, F.w, F.h)

  // ---- measure the bottom block first, so nothing can ever overlap
  const ctaH = Math.round(F.w * 0.098)
  const linkH = 78
  const priceSize = Math.round(F.w * 0.115)
  const hookFit = hook ? fitText(ctx, hook, inner, 2, Math.round(F.w * 0.062), 800, L.display === 'serif', 34) : null
  const hookH = hookFit ? hookFit.rows.length * hookFit.size * 1.12 + 14 : 0
  const nameFit = fitText(ctx, facts.name, inner, hookFit && hookFit.rows.length > 1 ? 1 : 2, Math.round(F.w * 0.042), 600, false, 26)
  const nameH = nameFit.rows.length * nameFit.size * 1.2 + 10
  const vendorH = 54
  const textBlock = vendorH + hookH + nameH + priceSize * 1.05 + 26
  const blockTop = F.h - linkH - ctaH - 34 - textBlock

  // ---- a colour field behind the photograph, sized to the room left above
  const stageH = blockTop - Math.round(F.h * 0.03)
  ctx.fillStyle = L.soft
  ctx.beginPath()
  ctx.arc(F.w * 0.52, stageH * 0.48, Math.max(F.w * 0.42, stageH * 0.62), 0, Math.PI * 2)
  ctx.fill()
  floatProduct(ctx, photo, F.w * 0.5, stageH * 0.5, inner * 1.02, stageH * 0.88, L)

  // ---- type
  let y = blockTop + 34
  vendorLine(ctx, L, F, M, y, facts, logo)
  y += 18

  if (hookFit) {
    ctx.font = font(800, hookFit.size, L.display === 'serif')
    ctx.fillStyle = L.ink
    hookFit.rows.forEach((r, i) => ctx.fillText(r, M, y + hookFit.size + i * hookFit.size * 1.12))
    y += hookH + hookFit.size * 0.2
  }

  ctx.font = font(600, nameFit.size)
  ctx.fillStyle = L.ink
  ctx.globalAlpha = 0.72
  nameFit.rows.forEach((r, i) => ctx.fillText(r, M, y + nameFit.size + i * nameFit.size * 1.2))
  ctx.globalAlpha = 1
  y += nameH + 10

  bigPrice(ctx, L, F, M, y + priceSize * 0.82, facts, priceSize)
  ctaPill(ctx, L, F, M, F.h - linkH - ctaH, inner, ctaFor(facts))
  linkLine(ctx, L, F, M, F.h - 26, link)
}

// 2. Offer first — the saving is the headline, on a band across the top.
async function compOffer(ctx, L, F, facts, product, hook, link, photo, logo, settings) {
  const M = Math.round(F.w * 0.075)
  const inner = F.w - M * 2
  const B = bottomStack(F)
  ctx.fillStyle = L.bg
  ctx.fillRect(0, 0, F.w, F.h)

  const bandH = Math.round(F.h * 0.25)
  ctx.fillStyle = L.accent
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(F.w, 0)
  ctx.lineTo(F.w, bandH)
  ctx.quadraticCurveTo(F.w * 0.5, bandH + 70, 0, bandH - 20)
  ctx.closePath()
  ctx.fill()

  const headline = facts.offer || (facts.save ? `Save ${money(facts.save)}` : hook || 'Available now')
  const hf = fitText(ctx, headline.toUpperCase(), inner, 2, Math.round(F.w * 0.082), 800, false, 38)
  ctx.font = font(800, hf.size)
  ctx.fillStyle = '#FFFFFF'
  hf.rows.forEach((r, i) => ctx.fillText(r, M, Math.round(F.h * 0.1) + i * hf.size * 1.08))

  const priceSize = Math.round(F.w * 0.125)
  const nameFit = fitText(ctx, facts.name, inner, 2, Math.round(F.w * 0.05), 700, L.display === 'serif', 30)
  const textH = nameFit.rows.length * nameFit.size * 1.14 + priceSize * 1.1 + 56
  const textTop = B.free - textH
  floatProduct(ctx, photo, F.w * 0.5, (bandH + textTop) / 2 + 10, inner, (textTop - bandH) * 0.86, L)

  ctx.fillStyle = L.ink
  ctx.font = font(700, nameFit.size, L.display === 'serif')
  nameFit.rows.forEach((r, i) => ctx.fillText(r, M, textTop + nameFit.size + i * nameFit.size * 1.14))
  let y = textTop + nameFit.rows.length * nameFit.size * 1.14 + 8
  bigPrice(ctx, L, F, M, y + priceSize * 0.82, facts, priceSize)
  vendorLine(ctx, L, F, M, y + priceSize * 1.18, facts, null)
  ctaPill(ctx, L, F, M, B.ctaY, inner, ctaFor(facts))
  linkLine(ctx, L, F, M, B.linkY, link)
}

// 3. Editorial — split screen, photograph on one side, type on the other.
async function compEditorial(ctx, L, F, facts, product, hook, link, photo, logo, settings) {
  const M = Math.round(F.w * 0.075)
  const pad = 34
  const inner = F.w - M * 2 - pad * 2
  const B = bottomStack(F)
  ctx.fillStyle = L.bg
  ctx.fillRect(0, 0, F.w, F.h)

  const priceSize = Math.round(F.w * 0.095)
  const hookFit = fitText(ctx, hook || facts.name, inner, 3, Math.round(F.w * 0.07), 600, true, 32)
  const value = valueLine(facts, product, hook)
  const valueFit = value ? fitText(ctx, value, inner, 2, 31, 400, false, 23) : null
  const textH = 40 + hookFit.rows.length * hookFit.size * 1.1
    + (valueFit ? 26 + valueFit.rows.length * valueFit.size * 1.3 : 0)
    + 44 + priceSize * 1.05
  const panelTop = B.free - textH - 40
  const imgH = panelTop + 70

  if (photo) cover(ctx, photo, 0, 0, F.w, imgH)
  else { ctx.fillStyle = L.soft; ctx.fillRect(0, 0, F.w, imgH) }

  ctx.fillStyle = L.bg
  ctx.fillRect(M, panelTop, F.w - M * 2, F.h - panelTop)

  let y = panelTop + 46
  ctx.fillStyle = L.accent
  ctx.font = font(800, 24)
  let ex = M + pad
  for (const ch of (facts.vendor || 'ZAMARKET').toUpperCase()) { ctx.fillText(ch, ex, y); ex += ctx.measureText(ch).width + 3 }

  ctx.font = font(600, hookFit.size, true)
  ctx.fillStyle = L.ink
  hookFit.rows.forEach((r, i) => ctx.fillText(r, M + pad, y + 52 + hookFit.size * 0.8 + i * hookFit.size * 1.1))
  y += 52 + hookFit.rows.length * hookFit.size * 1.1

  if (valueFit) {
    ctx.font = font(400, valueFit.size)
    ctx.globalAlpha = 0.7
    valueFit.rows.forEach((r, i) => ctx.fillText(r, M + pad, y + 30 + i * valueFit.size * 1.3))
    ctx.globalAlpha = 1
    y += 26 + valueFit.rows.length * valueFit.size * 1.3
  }

  ctx.strokeStyle = L.ink
  ctx.globalAlpha = 0.16
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(M + pad, y + 26)
  ctx.lineTo(F.w - M - pad, y + 26)
  ctx.stroke()
  ctx.globalAlpha = 1

  bigPrice(ctx, L, F, M + pad, y + 26 + priceSize * 0.92, facts, priceSize)
  ctaPill(ctx, L, F, M + pad, B.ctaY, inner, ctaFor(facts), true)
  linkLine(ctx, L, F, M + pad, B.linkY, link)
}

// 4. Price first — the number is the picture.
async function compPrice(ctx, L, F, facts, product, hook, link, photo, logo, settings) {
  const M = Math.round(F.w * 0.075)
  ctx.fillStyle = L.deep
  ctx.fillRect(0, 0, F.w, F.h)
  ctx.fillStyle = L.accent
  ctx.globalAlpha = 0.16
  ctx.beginPath()
  ctx.arc(F.w * 0.86, F.h * 0.14, F.w * 0.34, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  ctx.fillStyle = '#FFFFFF'
  ctx.globalAlpha = 0.75
  ctx.font = font(700, 26)
  ctx.fillText((facts.vendor || 'ZAMARKET').toUpperCase(), M, Math.round(F.h * 0.085))
  ctx.globalAlpha = 1

  const price = money(facts.price).replace('.00', '')
  const pf = fitText(ctx, price, F.w - M * 2, 1, Math.round(F.w * 0.26), 800, false, 80)
  ctx.font = font(800, pf.size)
  ctx.fillStyle = L.accent
  ctx.fillText(pf.rows[0], M, Math.round(F.h * 0.085) + pf.size * 0.92)

  if (facts.normal) {
    ctx.font = font(600, 40)
    ctx.fillStyle = '#FFFFFF'
    ctx.globalAlpha = 0.6
    const was = `was ${money(facts.normal).replace('.00', '')}`
    ctx.fillText(was, M, Math.round(F.h * 0.085) + pf.size * 1.28)
    ctx.globalAlpha = 1
  }

  ctx.fillStyle = '#FFFFFF'
  const nf = fitText(ctx, facts.name, F.w - M * 2, 2, Math.round(F.w * 0.06), 700, L.display === 'serif', 34)
  ctx.font = font(700, nf.size, L.display === 'serif')
  const nameTop = Math.round(F.h * 0.085) + pf.size * 1.7
  nf.rows.forEach((r, i) => ctx.fillText(r, M, nameTop + i * nf.size * 1.12))

  floatProduct(ctx, photo, F.w * 0.5, F.h * 0.68, F.w * 0.66, F.h * 0.3, { ...L, soft: 'rgba(255,255,255,0.08)', deep: '#000' })

  const B = bottomStack(F)
  ctaPill(ctx, L, F, M, B.ctaY, F.w - M * 2, ctaFor(facts))
  ctx.globalAlpha = 0.7
  linkLine(ctx, { ...L, ink: '#FFFFFF' }, F, M, B.linkY, link)
  ctx.globalAlpha = 1
}

// 5. Premium — dark, full-bleed photograph, type at the foot.
async function compDark(ctx, L, F, facts, product, hook, link, photo, logo, settings) {
  const M = Math.round(F.w * 0.08)
  const inner = F.w - M * 2
  const B = bottomStack(F)
  ctx.fillStyle = '#0B0B0C'
  ctx.fillRect(0, 0, F.w, F.h)
  if (photo) cover(ctx, photo, 0, 0, F.w, F.h)
  const g = ctx.createLinearGradient(0, F.h * 0.3, 0, F.h)
  g.addColorStop(0, 'rgba(6,8,10,0)')
  g.addColorStop(0.5, 'rgba(6,8,10,0.84)')
  g.addColorStop(1, 'rgba(6,8,10,0.97)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, F.w, F.h)
  ctx.strokeStyle = 'rgba(255,255,255,0.26)'
  ctx.lineWidth = 2
  ctx.strokeRect(M * 0.5, M * 0.5, F.w - M, F.h - M)

  const priceSize = Math.round(F.w * 0.095)
  const hookFit = fitText(ctx, hook || facts.name, inner, 3, Math.round(F.w * 0.07), 600, true, 32)
  const textH = 40 + hookFit.rows.length * hookFit.size * 1.1 + 48 + priceSize * 1.1
  let y = B.free - textH

  ctx.fillStyle = L.accent
  ctx.font = font(700, 24)
  let ex = M
  for (const ch of (facts.vendor || 'ZAMARKET').toUpperCase()) { ctx.fillText(ch, ex, y); ex += ctx.measureText(ch).width + 4 }

  ctx.font = font(600, hookFit.size, true)
  ctx.fillStyle = '#FFFFFF'
  hookFit.rows.forEach((r, i) => ctx.fillText(r, M, y + 52 + hookFit.size * 0.8 + i * hookFit.size * 1.1))
  y += 52 + hookFit.rows.length * hookFit.size * 1.1

  ctx.font = font(500, 29)
  ctx.globalAlpha = 0.75
  ctx.fillText(facts.name, M, y + 34)
  ctx.globalAlpha = 1

  bigPrice(ctx, { ...L, ink: '#FFFFFF' }, F, M, y + 48 + priceSize * 0.85, facts, priceSize)
  ctaPill(ctx, L, F, M, B.ctaY, inner, ctaFor(facts))
  ctx.globalAlpha = 0.72
  linkLine(ctx, { ...L, ink: '#FFFFFF' }, F, M, B.linkY, link)
  ctx.globalAlpha = 1
}

const DRAW = { hero: compHero, offer: compOffer, editorial: compEditorial, price: compPrice, dark: compDark }

// Some compositions only make sense when the facts support them.
export function compositionsFor(product, offer) {
  const facts = approvedFacts({ product, offer, reviews: [], settings: {} })
  return COMPOSITIONS.filter((c) => {
    if (c.key === 'offer') return !!(facts.offer || facts.save)
    if (c.key === 'dark') return !!product?.images?.[0]
    return true
  })
}

export async function renderPromo({ product, offer, reviews = [], settings, hook, link, format = 'portrait', composition = 'hero', logo }) {
  const F = FORMATS[format] || FORMATS.portrait
  const L = lookFor(product)
  const facts = approvedFacts({ product, offer, reviews, settings })
  const c = document.createElement('canvas')
  c.width = F.w
  c.height = F.h
  const ctx = c.getContext('2d')
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* ignore */ } }

  const [photo, mark] = await Promise.all([load(product?.images?.[0]), load(logo)])
  const draw = DRAW[composition] || compHero
  await draw(ctx, L, F, facts, product, hook, link, photo, mark, settings)

  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.93))
}


// ---------- creative types ----------

// NEW ARRIVAL — only honest for something published recently.
export async function renderArrival({ product, settings, link, format = 'portrait', logo }) {
  const F = FORMATS[format] || FORMATS.portrait
  const L = lookFor(product)
  const facts = approvedFacts({ product, offer: null, reviews: [], settings })
  const c = document.createElement('canvas')
  c.width = F.w; c.height = F.h
  const ctx = c.getContext('2d')
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* ignore */ } }
  const M = Math.round(F.w * 0.075)
  const inner = F.w - M * 2
  const B = bottomStack(F)

  ctx.fillStyle = L.bg
  ctx.fillRect(0, 0, F.w, F.h)
  // a diagonal ribbon across the corner, rather than a badge dropped on top
  ctx.save()
  ctx.translate(F.w, 0)
  ctx.rotate(Math.PI / 4)
  ctx.fillStyle = L.accent
  ctx.fillRect(-40, -F.w, F.w, 92)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = font(800, 38)
  ctx.fillText('JUST ARRIVED', -F.w * 0.42, -F.w + 62)
  ctx.restore()

  const [photo, mark] = await Promise.all([load(product?.images?.[0]), load(logo)])
  const priceSize = Math.round(F.w * 0.11)
  const nameFit = fitText(ctx, facts.name, inner, 2, Math.round(F.w * 0.065), 700, L.display === 'serif', 34)
  const textH = 64 + nameFit.rows.length * nameFit.size * 1.14 + priceSize * 1.1
  const top = B.free - textH
  floatProduct(ctx, photo, F.w * 0.5, top * 0.55, inner, top * 0.72, L)

  ctx.fillStyle = L.accent
  ctx.font = font(800, 26)
  let ex = M
  for (const ch of 'NEW ON ZAMARKET') { ctx.fillText(ch, ex, top + 10); ex += ctx.measureText(ch).width + 4 }

  ctx.fillStyle = L.ink
  ctx.font = font(700, nameFit.size, L.display === 'serif')
  nameFit.rows.forEach((r, i) => ctx.fillText(r, M, top + 64 + nameFit.size * 0.8 + i * nameFit.size * 1.14))
  let y = top + 64 + nameFit.rows.length * nameFit.size * 1.14
  bigPrice(ctx, L, F, M, y + priceSize * 0.85, facts, priceSize)
  vendorLine(ctx, L, F, M + inner * 0.62, y + priceSize * 0.85, facts, mark)
  ctaPill(ctx, L, F, M, B.ctaY, inner, ctaFor(facts))
  linkLine(ctx, L, F, M, B.linkY, link)
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.93))
}

// COLLECTION — several products as one picture, prices under each.
export async function renderCollection({ products, vendor, settings, link, title, format = 'portrait', logo }) {
  const F = FORMATS[format] || FORMATS.portrait
  const L = lookFor(products[0])
  const c = document.createElement('canvas')
  c.width = F.w; c.height = F.h
  const ctx = c.getContext('2d')
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* ignore */ } }
  const M = Math.round(F.w * 0.07)
  const inner = F.w - M * 2
  const B = bottomStack(F)

  ctx.fillStyle = L.bg
  ctx.fillRect(0, 0, F.w, F.h)
  ctx.fillStyle = L.soft
  ctx.beginPath()
  ctx.arc(F.w * 0.9, F.h * 0.08, F.w * 0.3, 0, Math.PI * 2)
  ctx.fill()

  const mark = await load(logo || vendor?.logo_url)
  let y = Math.round(F.h * 0.085)
  if (mark) { cover(ctx, mark, M, y - 52, 56, 56, 14); }
  ctx.fillStyle = L.ink
  ctx.font = font(700, Math.round(F.w * 0.05), L.display === 'serif')
  ctx.fillText(fit(ctx, vendor?.business_name || 'ZaMarket', inner - (mark ? 74 : 0)), M + (mark ? 74 : 0), y)
  ctx.fillStyle = L.accent
  ctx.font = font(800, 26)
  let ex = M
  for (const ch of String(title || 'THE COLLECTION').toUpperCase()) { ctx.fillText(ch, ex, y + 44); ex += ctx.measureText(ch).width + 4 }
  y += 84

  const picks = products.slice(0, 4)
  const cols = picks.length <= 2 ? 1 : 2
  const gap = Math.round(F.w * 0.035)
  const cellW = Math.round((inner - gap * (cols - 1)) / cols)
  const rows = Math.ceil(picks.length / cols)
  const cellH = Math.min(Math.round((B.free - y - gap * (rows - 1)) / rows), Math.round(F.h * 0.33))

  for (let i = 0; i < picks.length; i++) {
    const p = picks[i]
    const x = M + (i % cols) * (cellW + gap)
    const cy = y + Math.floor(i / cols) * (cellH + gap)
    const img = await load(p.images?.[0])
    const imgH = Math.round(cellH * 0.68)
    if (img) cover(ctx, img, x, cy, cellW, imgH, 16)
    else { ctx.fillStyle = L.soft; rounded(ctx, x, cy, cellW, imgH, 16); ctx.fill() }
    ctx.fillStyle = L.ink
    ctx.font = font(600, Math.round(cellW * 0.068))
    ctx.fillText(fit(ctx, p.name, cellW), x, cy + imgH + Math.round(cellH * 0.14))
    ctx.fillStyle = L.accent
    ctx.font = font(800, Math.round(cellW * 0.088))
    ctx.fillText(money(p.price).replace('.00', ''), x, cy + imgH + Math.round(cellH * 0.27))
  }

  ctaPill(ctx, L, F, M, B.ctaY, inner, 'SHOP THE COLLECTION')
  linkLine(ctx, L, F, M, B.linkY, link)
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.93))
}

// BUSINESS SPOTLIGHT — the shop is the subject, its products the evidence.
export async function renderSpotlight({ vendor, products, settings, link, format = 'portrait', logo, line }) {
  const F = FORMATS[format] || FORMATS.portrait
  const L = lookFor(products?.[0])
  const c = document.createElement('canvas')
  c.width = F.w; c.height = F.h
  const ctx = c.getContext('2d')
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* ignore */ } }
  const M = Math.round(F.w * 0.075)
  const inner = F.w - M * 2
  const B = bottomStack(F)

  const cover1 = await load(vendor?.cover_url || products?.[0]?.images?.[0])
  ctx.fillStyle = L.bg
  ctx.fillRect(0, 0, F.w, F.h)
  const bandH = Math.round(F.h * 0.42)
  if (cover1) cover(ctx, cover1, 0, 0, F.w, bandH)
  else { ctx.fillStyle = L.soft; ctx.fillRect(0, 0, F.w, bandH) }
  const g = ctx.createLinearGradient(0, bandH * 0.4, 0, bandH)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, F.w, bandH)

  const mark = await load(logo || vendor?.logo_url)
  const logoSize = Math.round(F.w * 0.19)
  if (mark) cover(ctx, mark, M, bandH - logoSize / 2, logoSize, logoSize, 22)
  else {
    ctx.fillStyle = L.accent
    rounded(ctx, M, bandH - logoSize / 2, logoSize, logoSize, 22)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = font(800, logoSize * 0.5)
    ctx.fillText((vendor?.business_name || 'Z').slice(0, 1), M + logoSize * 0.3, bandH + logoSize * 0.2)
  }

  let y = bandH + logoSize * 0.5 + 84
  ctx.fillStyle = L.ink
  const nf = fitText(ctx, vendor?.business_name || 'ZaMarket', inner, 2, Math.round(F.w * 0.07), 700, L.display === 'serif', 34)
  ctx.font = font(700, nf.size, L.display === 'serif')
  nf.rows.forEach((r, i) => ctx.fillText(r, M, y + i * nf.size * 1.1))
  y += nf.rows.length * nf.size * 1.1

  const sub = line || vendor?.tagline || [vendor?.category, vendor?.town].filter(Boolean).join(' · ')
  if (sub) {
    const sf = fitText(ctx, sub, inner, 2, 32, 400, false, 24)
    ctx.font = font(400, sf.size)
    ctx.globalAlpha = 0.72
    sf.rows.forEach((r, i) => ctx.fillText(r, M, y + 40 + i * sf.size * 1.3))
    ctx.globalAlpha = 1
    y += 40 + sf.rows.length * sf.size * 1.3
  }

  // three small products as proof there is something to buy
  const picks = (products || []).slice(0, 3)
  if (picks.length) {
    const size = Math.min(Math.round(inner / 3.4), Math.round(B.free - y - 40))
    for (let i = 0; i < picks.length; i++) {
      const img = await load(picks[i].images?.[0])
      const x = M + i * (size + 16)
      if (img) cover(ctx, img, x, y + 26, size, size, 14)
      else { ctx.fillStyle = L.soft; rounded(ctx, x, y + 26, size, size, 14); ctx.fill() }
    }
  }

  ctaPill(ctx, L, F, M, B.ctaY, inner, 'VISIT THE SHOP')
  linkLine(ctx, L, F, M, B.linkY, link)
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.93))
}
