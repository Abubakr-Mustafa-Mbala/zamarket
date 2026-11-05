// High-resolution, real-data Creative Studio posters. No image-generation API,
// made-up products, invented ratings, or decorative fake QR codes. Designed as
// branded social-media images at 1080 logical pixels, exported at 2x (2160 px).
import QRCode from 'qrcode'
import { money } from './format'
import { SHEET } from './priceList'
import { brandMark } from './posterKit'
import { studioPalette, premiumPagesFor, STUDIO_QUALITY } from './studioThemes'

const sans = (s, weight = 700) => `${weight} ${Math.round(s)}px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif`
const serif = (s, weight = 700) => `${weight} ${Math.round(s)}px "Fraunces", Georgia, serif`
const fmtPrice = (p) => money(p).replace(/\.00$/, '')
function round(ctx, x, y, w, h, r = 20) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
function rect(ctx, x, y, w, h, color, r = 0) { ctx.fillStyle = color; round(ctx, x, y, w, h, r); ctx.fill() }
function line(ctx, x, y, w, c = '#FFFFFF', a = 1) { ctx.globalAlpha = a; rect(ctx, x, y, w, 2, c); ctx.globalAlpha = 1 }
function text(ctx, str, x, y, size, color, weight = 700, family = 'sans') {
  ctx.fillStyle = color; ctx.font = family === 'serif' ? serif(size, weight) : sans(size, weight)
  ctx.fillText(String(str), x, y)
}
function clampLine(ctx, raw, maxW) {
  let str = String(raw ?? '')
  if (ctx.measureText(str).width <= maxW) return str
  while (str.length > 2 && ctx.measureText(str.trimEnd() + '…').width > maxW) str = str.slice(0, -1)
  return str.trimEnd() + '…'
}
// Wrapping must never lose a word out of the middle of a name.
//
// A seller's product name is a fact about what is for sale. Cutting the tail
// short with an ellipsis is honest — a reader can see something was trimmed.
// Dropping a word silently is not: "Vanilla Cupcakes (box of 12)" becoming
// "Vanilla Cupcakes / of 12)" names a different product, and on a price list
// going out to customers that is a misdescription of the seller's goods.
function wrap(ctx, raw, maxW, maxLines = 2) {
  const words = String(raw ?? '').split(/\s+/).filter(Boolean)
  const rows = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (!current || ctx.measureText(next).width <= maxW) { current = next; continue }
    if (rows.length === maxLines - 1) {
      // No line left to start, so the remainder stays on this one and gets
      // cut at the end rather than gutted in the middle.
      current = next
      continue
    }
    rows.push(current)
    current = word
  }
  if (current) rows.push(current)
  // Only the last row can overflow; earlier rows were measured as they grew.
  return rows.map((row, i) => (i === rows.length - 1 ? clampLine(ctx, row, maxW) : row))
}
function image(src) { return new Promise((resolve) => {
  if (!src) return resolve(null)
  const img = new Image(); img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src
}) }
function crop(ctx, img, x, y, w, h, radius = 0) {
  ctx.save(); round(ctx, x, y, w, h, radius); ctx.clip()
  if (img) { const k = Math.max(w / img.width, h / img.height), iw = img.width * k, ih = img.height * k
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
  } else { const grad = ctx.createLinearGradient(x, y, x+w, y+h)
    grad.addColorStop(0, '#E5D8C8'); grad.addColorStop(1, '#C9C1D3')
    ctx.fillStyle = grad; ctx.fillRect(x, y, w, h)
    text(ctx, 'ZaMarket', x + w * 0.1, y + h * 0.55, Math.min(32, w * .1), '#544B5D') }
  ctx.restore()
}
// Keep equipment and household products fully visible instead of cropping
// them to an unrecognisable close-up. Food photos can use a full-bleed crop.
function fitProductPhoto(ctx, item, img, x, y, w, h, radius = 14) {
  const food = /bakery|cake|food|pastr|cupcake|cookie|bread|dessert|meal/i
    .test(`${item.category || ''} ${item.name || ''}`)
  if (food) return crop(ctx, img, x, y, w, h, radius)
  ctx.save(); round(ctx, x, y, w, h, radius); ctx.clip()
  ctx.fillStyle = '#F5F3EF'; ctx.fillRect(x, y, w, h)
  if (img) {
    const k = Math.min((w - 15) / img.width, (h - 15) / img.height)
    const iw = img.width * k, ih = img.height * k
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
  } else {
    ctx.font = sans(28, 800)
    text(ctx, 'PHOTO UNAVAILABLE', x + 16, y + h / 2, 20, '#6F6870', 800)
  }
  ctx.restore()
}
async function qrImage(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null
  try { return await image(await QRCode.toDataURL(url, { errorCorrectionLevel: 'H', margin: 2, width: 450, color: { dark: '#111111', light: '#FFFFFF' } })) }
  catch { return null }
}
function header(ctx, F, P, {vendor, mode}) {
  // Colored header frames the brand on every preset; keep contrast automatic.
  const band = P.dark ? P.panel : '#291A25'
  const g = ctx.createLinearGradient(0, 0, F.w, 170)
  g.addColorStop(0, band); g.addColorStop(1, P.dark ? P.background : '#382337')
  rect(ctx, 0, 0, F.w, 142, g)
  brandMark(ctx, 64, 37, 62)
  text(ctx, 'ZaMarket', 145, 90, 58, '#FFFFFF', 800)
  text(ctx, 'ZAMARKET.SHOP  •  AN ONLINE MARKETPLACE', 148, 120, 17, '#E9DDEF', 700)
  if (mode === 'spotlight') {
    rect(ctx, F.w - 330, 65, 257, 53, P.accent, 27)
    text(ctx, 'FEATURED VENDOR', F.w - 304, 99, 21, P.onAccent, 800)
  }
  const brand = vendor?.business_name || 'ZaMarket'
  return brand
}
function bg(ctx, F, P) {
  rect(ctx, 0, 0, F.w, F.h, P.background)
  const grad = ctx.createRadialGradient(F.w * .9, 175, 10, F.w * .9, 175, F.w *.9)
  grad.addColorStop(0, `${P.accent}24`); grad.addColorStop(1, `${P.accent}00`)
  ctx.fillStyle = grad; ctx.fillRect(0, 0, F.w, F.h)
}
function titleBlock(ctx, F, P, title, vendor, subtitle) {
  text(ctx, (vendor || 'ZAMARKET').toUpperCase(), 65, 213, 23, P.accent, 800)
  ctx.font = sans(73, 800)
  const lines = wrap(ctx, title || 'The collection', F.w - 130, 2)
  const step = 77
  lines.forEach((t, i) => text(ctx, t, 62, 291 + i * step, 73, P.ink, 800))
  const next = 291 + lines.length * step
  ctx.font = sans(24, 600)
  text(ctx, clampLine(ctx, subtitle || 'Discover selected products and shop online', F.w - 130), 65, next, 24, P.muted, 600)
  return next + 45
}
function productCard(ctx, P, item, img, x, y, w, h, {compact = false, tag = false} = {}) {
  const photoW = compact ? Math.min(h - 18, w * .38) : w
  rect(ctx, x, y, w, h, P.dark ? '#FFFFFF' : '#FFFFFF', 22)
  ctx.save(); ctx.strokeStyle = P.dark ? '#FFFFFF25' : `${P.accent}30`; ctx.lineWidth = 2
  round(ctx, x, y, w, h, 22); ctx.stroke(); ctx.restore()
  if (compact) {
    fitProductPhoto(ctx, item, img, x + 9, y + 9, photoW, h - 18, 16)
    const sx = x + photoW + 25, sw = w - photoW - 39
    const short = h < 170
    const nameSize = short ? 20 : 23
    if (tag && !short) text(ctx, String(item.category || 'PICK').toUpperCase().slice(0, 18), sx, y + 37, 15, P.accent, 800)
    ctx.font = sans(nameSize, 800)
    const rows = wrap(ctx, item.name, sw, short ? 1 : 2)
    const start = short ? 53 : (tag ? 76 : 62)
    rows.forEach((t, i) => text(ctx, t, sx, y + start + i * 29, nameSize, '#231F24', 800))
    text(ctx, fmtPrice(item.price), sx, y + h - 25, short ? 29 : 35, P.accentText, 800)
  } else {
    const imageH = h * .56
    fitProductPhoto(ctx, item, img, x + 8, y + 8, w - 16, imageH - 8, 15)
    ctx.font = sans(23, 800)
    const lines = wrap(ctx, item.name, w - 36, 2)
    lines.forEach((name, i) => text(ctx, name, x + 18, y + imageH + 31 + i * 27, 23, '#261C20', 800))
    text(ctx, fmtPrice(item.price), x + 18, y + h - 25, 37, P.accentText, 800)
  }
}
function featuredProduct(ctx, P, item, img, x, y, w, h) {
  // One large product photo and ample type, not a squeezed price-table row.
  // Square/landscape crop is deliberate, but the actual photograph is untouched.
  rect(ctx, x, y, w, h, '#FFFFFF', 22)
  ctx.save(); ctx.strokeStyle = `${P.accent}38`; ctx.lineWidth = 2
  round(ctx, x, y, w, h, 22); ctx.stroke(); ctx.restore()
  const picW = w * .49
  fitProductPhoto(ctx, item, img, x + 10, y + 10, picW - 10, h - 20, 16)
  const tx = x + picW + 34, maxW = w - picW - 65
  text(ctx, 'FEATURED PICK', tx, y + 51, 19, P.accentText, 800)
  ctx.font = sans(36, 800)
  const lines = wrap(ctx, item.name, maxW, 3)
  lines.forEach((t, i) => text(ctx, t, tx, y + 106 + i * 45, 36, '#251D24', 800))
  const bottom = y + h - 55
  text(ctx, fmtPrice(item.price), tx, bottom, 50, P.accentText, 800)
}
function cta(ctx, F, P, y, label, link, qr) {
  const x = 65, w = F.w - 130
  const labelY = y + 27
  rect(ctx, x, y, w, 2, P.ink, 0)
  ctx.globalAlpha = .14; rect(ctx, x, y, w, 2, P.ink); ctx.globalAlpha = 1
  rect(ctx, x, y + 28, w - 210, 115, P.accent, 26)
  text(ctx, label, x + 27, labelY + 75, 33, P.onAccent, 800)
  text(ctx, '→', x + w - 279, labelY + 77, 40, P.onAccent, 700)
  if (qr) crop(ctx, qr, x + w - 182, y + 18, 164, 164, 13)
  else {
    rect(ctx, x + w - 182, y + 22, 164, 150, P.panel, 18)
    text(ctx, 'SCAN', x + w - 149, y + 102, 23, P.ink)
  }
  ctx.font = sans(22, 700)
  text(ctx, clampLine(ctx, String(link || 'zamarket.shop').replace(/^https?:\/\//, ''), w - 25), x + 3, y + 198, 22, P.muted, 700)
}
function footer(ctx, F, P) {
  const y = F.h - 43
  text(ctx, 'ZAMARKET.SHOP', 65, y, 20, P.ink, 800)
  ctx.font = sans(17, 600)
  const label = 'Browse • Discover • Order'
  text(ctx, label, F.w - 65 - ctx.measureText(label).width, y, 17, P.muted, 600)
}
function formatCanvas(F, resolution) {
  const canvas = document.createElement('canvas')
  const scale = Math.max(1, Math.min(2, resolution || STUDIO_QUALITY.export))
  canvas.width = F.w * scale; canvas.height = F.h * scale
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Canvas is unavailable')
  ctx.scale(scale, scale)
  return { canvas, ctx }
}
function exportBlob(canvas) { return new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Unable to export PNG')), 'image/png')) }
async function renderPricePage({vendor, products, title, note, palette, overrides, sheet, link, resolution, pageNumber, pageCount}) {
  const F = SHEET[sheet] || SHEET.post; const P = studioPalette(palette, overrides)
  const {canvas,ctx} = formatCanvas(F, resolution)
  bg(ctx, F, P); header(ctx, F, P, {vendor, mode:'priceList'})
  const sub = pageCount > 1 ? `PAGE ${pageNumber} / ${pageCount}   •   PRICES UPDATED AT EXPORT` : 'CURATED PICKS  •  CURRENT MARKETPLACE PRICES'
  let top = titleBlock(ctx, F, P, title || 'The Price List', vendor?.business_name || 'ZaMarket', sub)
  const qr = await qrImage(link)
  const imageItems = await Promise.all(products.map((p)=> image(p.images?.[0])))
  const bottom = F.h - 305
  top = Math.min(top, bottom - 210)
  // A portrait price list is an editorial selection: hero image first,
  // then at most two genuinely readable companion products on this page.
  if (sheet === 'post' && products.length > 0) {
    const gap = 18
    const heroH = products.length === 1 ? bottom - top : Math.min(370, (bottom-top) * .54)
    featuredProduct(ctx, P, products[0], imageItems[0], 65, top, F.w - 130, heroH)
    if (products.length > 1) {
      const others = products.slice(1)
      const rowTop = top + heroH + gap
      const cardWidth = (F.w - 130 - gap * (others.length - 1)) / others.length
      const cardHeight = bottom - rowTop
      others.forEach((item, i) => productCard(ctx, P, item, imageItems[i + 1],
        65 + i * (cardWidth + gap), rowTop, cardWidth, cardHeight,
        {compact: false}))
    }
  } else {
    const cols = products.length === 1 ? 1 : 2
    const rows = Math.ceil(products.length / cols)
    const gap = 18
    const width = (F.w - 130 - gap * (cols - 1)) / cols
    const height = Math.max(90, (bottom - top - gap * (rows - 1)) / rows)
    products.forEach((p, i) => {
      const x = 65 + (i % cols) * (width + gap)
      const y = top + Math.floor(i / cols) * (height + gap)
      productCard(ctx, P, p, imageItems[i], x, y, width, height,
        {compact: products.length > 3 && height < 230, tag: height > 170})
    })
  }
  cta(ctx, F, P, F.h - 290, note || 'SHOP ON ZAMARKET', link, qr)
  footer(ctx, F, P)
  return exportBlob(canvas)
}
async function renderCollectionPage({vendor, products, title, palette, overrides, sheet, link, resolution}) {
  const F = SHEET[sheet] || SHEET.post; const P = studioPalette(palette, overrides)
  const {canvas,ctx} = formatCanvas(F, resolution)
  bg(ctx, F, P); header(ctx, F, P, {vendor, mode:'collection'})
  const top = titleBlock(ctx, F, P, title || 'The Collection', vendor?.business_name, 'Handpicked from the live catalogue')
  const picks = products.slice(0, 4)
  const images = await Promise.all(picks.map((p)=>image(p.images?.[0])))
  const qr = await qrImage(link)
  const gap = 18, cols = picks.length === 1 ? 1 : 2
  const rows = Math.ceil(picks.length / cols), cw = (F.w - 130 - gap * (cols - 1)) / cols
  const bottom = F.h - 305
  const ch = Math.max(100, Math.floor((bottom - top - gap * (rows - 1)) / rows))
  picks.forEach((p, i) => productCard(ctx, P, p, images[i], 65 + (i % cols) * (cw+gap), top + Math.floor(i/cols)*(ch+gap), cw, ch, {compact: ch < 235}))
  cta(ctx, F, P, F.h - 290, 'SHOP THE COLLECTION', link, qr)
  footer(ctx, F, P)
  return exportBlob(canvas)
}
async function renderSpotlightPage({vendor, products, palette, overrides, sheet, link, resolution, note}) {
  const F = SHEET[sheet] || SHEET.post; const P = studioPalette(palette, overrides)
  const {canvas,ctx} = formatCanvas(F, resolution)
  bg(ctx, F, P); header(ctx, F, P, {vendor, mode:'spotlight'})
  const hero = await image(vendor?.cover_url || products[0]?.images?.[0])
  const qr = await qrImage(link)
  const x = 65, heroY = 185, heroH = Math.min(340, F.h * .27)
  rect(ctx, x, heroY, F.w - 130, heroH, P.panel, 26)
  crop(ctx, hero, x + (F.w - 130) * .54, heroY, (F.w - 130) * .46, heroH, 26)
  const mask = ctx.createLinearGradient(x + 365, 0, x + 690, 0)
  mask.addColorStop(0, P.panel); mask.addColorStop(1, `${P.panel}00`)
  ctx.fillStyle = mask; ctx.fillRect(x + 340, heroY, 360, heroH)
  text(ctx, 'VENDOR SPOTLIGHT', x + 30, heroY + 52, 22, P.accent, 800)
  ctx.font = serif(50, 700)
  const name = wrap(ctx, vendor?.business_name || 'Featured Store', 490, 3)
  name.forEach((t, i) => text(ctx, t, x + 29, heroY + 115 + i * 55, 49, P.ink, 700, 'serif'))
  ctx.font = sans(21, 600)
  wrap(ctx, note || vendor?.tagline || 'Discover something worth sharing', 455, 2)
    .forEach((message, i, items) => text(ctx, message, x + 30, heroY + heroH - 53 + (i - items.length + 2) * 24, 21, P.muted, 600))
  const picks = products.slice(0, 4)
  const images = await Promise.all(picks.map((p)=>image(p.images?.[0])))
  const cols = picks.length === 1 ? 1 : 2, rows = Math.ceil(picks.length/cols)
  const gap = 18, cw = (F.w-130-gap*(cols-1))/cols
  const top = heroY + heroH + 24, bottom = F.h - 305
  const ch = Math.max(100, (bottom-top-gap*(rows-1))/rows)
  picks.forEach((p, i)=> productCard(ctx, P, p, images[i], 65+(i%cols)*(cw+gap),top+Math.floor(i/cols)*(ch+gap),cw,ch,{compact:true}))
  cta(ctx, F, P, F.h - 290, 'VISIT THE SHOP', link, qr)
  footer(ctx, F, P)
  return exportBlob(canvas)
}

export async function renderPremiumStudio({kind, vendor, products, title, note, palette, overrides, sheet='post', link, resolution=2}) {
  if (!products?.length) throw new Error('Choose products to create a design')
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* fonts have browser fallbacks */ } }
  if (kind === 'priceList') {
    const pages = premiumPagesFor(products, sheet)
    const out = []
    for (let i = 0; i < pages.length; i++) out.push(await renderPricePage({vendor, products: pages[i], title, note, palette, overrides, sheet, link, resolution, pageNumber:i+1, pageCount:pages.length}))
    return out
  }
  if (kind === 'collection') return [await renderCollectionPage({vendor, products, title, palette, overrides, sheet, link, resolution})]
  if (kind === 'spotlight') return [await renderSpotlightPage({vendor, products, palette, overrides, sheet, link, resolution, note})]
  throw new Error('Unsupported premium poster')
}
