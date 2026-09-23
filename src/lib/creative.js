// The creative engine. It lays out a designed advertisement — brand bar, product
// stage, hook ribbon, name, value line, benefits with icons, a price block, trust
// row, call to action, link — and reflows it for portrait, story and square.
//
// It renders only what exists. A missing benefit removes that row; it is never
// filled with invented words.

import { money } from './format'
import { approvedFacts, valueLine, trustPoints, ctaFor } from './hooks'

const INK = '#12212E'
const GREEN = '#0B6B50'
const GREEN_DEEP = '#075139'
const GOLD = '#F5C518'
const MINT = '#E8F5F0'
const GREY = '#5B6B76'

export const FORMATS = {
  portrait: { key: 'portrait', label: 'Post (portrait)', w: 1080, h: 1350 },
  story: { key: 'story', label: 'Status or story', w: 1080, h: 1920 },
  square: { key: 'square', label: 'Square', w: 1080, h: 1080 },
}

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

const font = (weight, size) => `${weight} ${size}px "Instrument Sans", "Segoe UI", system-ui, sans-serif`

function lines(ctx, text, maxWidth, maxLines) {
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
  // a sentence must never end mid-word: trim the last row and mark it
  if (cut && rows.length) {
    let last = rows[rows.length - 1]
    while (ctx.measureText(`${last}…`).width > maxWidth && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '))
    rows[rows.length - 1] = `${last}…`
  }
  return rows
}

// Shrink the type until the text fits the space it has.
function fitLines(ctx, text, maxWidth, maxLines, startSize, weight, minSize = 26) {
  let size = startSize
  for (;;) {
    ctx.font = font(weight, size)
    const rows = lines(ctx, text, maxWidth, maxLines + 1)
    if (rows.length <= maxLines || size <= minSize) return { size, rows: rows.slice(0, maxLines) }
    size -= 3
  }
}

// Small line icons, drawn rather than imported, so nothing external is needed.
function icon(ctx, kind, x, y, size, colour) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.strokeStyle = colour
  ctx.fillStyle = colour
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (kind === 'truck') {
    ctx.roundRect?.(1, 6, 13, 10, 2) ?? ctx.rect(1, 6, 13, 10)
    ctx.moveTo(14, 9); ctx.lineTo(19, 9); ctx.lineTo(23, 13); ctx.lineTo(23, 16); ctx.lineTo(14, 16)
    ctx.stroke()
    ctx.beginPath(); ctx.arc(6, 18, 2.4, 0, 7); ctx.arc(18, 18, 2.4, 0, 7); ctx.stroke()
  } else if (kind === 'phone') {
    ctx.moveTo(5, 3); ctx.lineTo(9, 3); ctx.lineTo(11, 8); ctx.lineTo(8.5, 10.5)
    ctx.quadraticCurveTo(12, 17, 13.5, 15.5); ctx.lineTo(16, 13); ctx.lineTo(21, 15); ctx.lineTo(21, 19)
    ctx.quadraticCurveTo(21, 21, 18, 21); ctx.quadraticCurveTo(3, 19, 3, 6); ctx.quadraticCurveTo(3, 3, 5, 3)
    ctx.stroke()
  } else if (kind === 'shield') {
    ctx.moveTo(12, 2); ctx.lineTo(21, 6); ctx.lineTo(21, 12); ctx.quadraticCurveTo(21, 19, 12, 22)
    ctx.quadraticCurveTo(3, 19, 3, 12); ctx.lineTo(3, 6); ctx.closePath(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(8, 12); ctx.lineTo(11, 15); ctx.lineTo(16, 9); ctx.stroke()
  } else if (kind === 'check') {
    ctx.moveTo(5, 12.5); ctx.lineTo(10, 17.5); ctx.lineTo(19, 7); ctx.stroke()
  } else if (kind === 'cart') {
    ctx.moveTo(2, 3); ctx.lineTo(5, 3); ctx.lineTo(8, 15); ctx.lineTo(19, 15); ctx.lineTo(21.5, 7); ctx.lineTo(6, 7)
    ctx.stroke()
    ctx.beginPath(); ctx.arc(9, 19.5, 1.8, 0, 7); ctx.arc(18, 19.5, 1.8, 0, 7); ctx.fill()
  } else if (kind === 'link') {
    ctx.moveTo(9.5, 14.5); ctx.lineTo(14.5, 9.5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(12.5, 6.5); ctx.quadraticCurveTo(16, 3, 19, 6); ctx.quadraticCurveTo(22, 9, 18.5, 12.5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(11.5, 17.5); ctx.quadraticCurveTo(8, 21, 5, 18); ctx.quadraticCurveTo(2, 15, 5.5, 11.5); ctx.stroke()
  } else if (kind === 'star') {
    ctx.moveTo(12, 2.5); ctx.lineTo(15, 9); ctx.lineTo(22, 9.8); ctx.lineTo(16.8, 14.4); ctx.lineTo(18.3, 21.3)
    ctx.lineTo(12, 17.7); ctx.lineTo(5.7, 21.3); ctx.lineTo(7.2, 14.4); ctx.lineTo(2, 9.8); ctx.lineTo(9, 9); ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

// The ZaMarket mark: bag glyph plus wordmark.
function brandMark(ctx, x, y, scale = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.fillStyle = GREEN
  rounded(ctx, 0, 14, 54, 48, 12)
  ctx.fill()
  ctx.strokeStyle = GREEN
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(27, 16, 13, Math.PI, 0)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = font(800, 26)
  ctx.fillText('Za', 10, 48)
  ctx.fillStyle = INK
  ctx.font = font(800, 46)
  ctx.fillText('ZaMarket', 68, 50)
  ctx.fillStyle = GREY
  ctx.font = font(600, 19)
  ctx.fillText('Shop · Discover · Support Local', 70, 74)
  ctx.restore()
}

// A highlighter stroke behind the hook, like a marker pen.
function highlight(ctx, x, y, w, h) {
  ctx.save()
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.moveTo(x, y + h * 0.18)
  ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.08, x + w, y + h * 0.12)
  ctx.lineTo(x + w, y + h * 0.92)
  ctx.quadraticCurveTo(x + w * 0.5, y + h * 1.12, x, y + h * 0.88)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// The product, lifted onto a soft stage with a shadow.
function productStage(ctx, img, x, y, w, h) {
  ctx.save()
  const grad = ctx.createLinearGradient(x, y, x + w, y + h)
  grad.addColorStop(0, '#F3F8F6')
  grad.addColorStop(1, MINT)
  ctx.fillStyle = grad
  rounded(ctx, x, y, w, h, 28)
  ctx.fill()
  if (img) {
    const pad = Math.round(Math.min(w, h) * 0.1)
    const bw = w - pad * 2
    const bh = h - pad * 2
    const s = Math.min(bw / img.width, bh / img.height)
    const dw = Math.round(img.width * s)
    const dh = Math.round(img.height * s)
    const dx = Math.round(x + (w - dw) / 2)
    const dy = Math.round(y + (h - dh) / 2)
    ctx.save()
    ctx.filter = 'blur(16px)'
    ctx.globalAlpha = 0.28
    ctx.fillStyle = '#0B2B22'
    ctx.beginPath()
    ctx.ellipse(x + w / 2, dy + dh - 6, dw * 0.34, Math.max(9, dh * 0.045), 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.drawImage(img, dx, dy, dw, dh)
  } else {
    ctx.fillStyle = '#B9D3C9'
    ctx.font = font(800, Math.round(h * 0.12))
    const t = 'ZaMarket'
    ctx.fillText(t, x + (w - ctx.measureText(t).width) / 2, y + h / 2)
  }
  ctx.restore()
}

export async function renderCreative({ product, offer, reviews = [], settings, hook, link, format = 'portrait', vendorLogo }) {
  const F = FORMATS[format] || FORMATS.portrait
  const facts = approvedFacts({ product, offer, reviews, settings })
  const c = document.createElement('canvas')
  c.width = F.w
  c.height = F.h
  const ctx = c.getContext('2d')
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* ignore */ } }

  const M = 64
  const inner = F.w - M * 2
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, F.w, F.h)

  // ---------- measure everything before drawing anything ----------
  const headH = 150
  const footH = format === 'story' ? 140 : 116
  const priceH = 168
  const ctaH = format === 'square' ? 92 : 108
  const linkH = 76
  const bottomStack = priceH + 30 + ctaH + 20 + linkH + 26 + footH
  const available = F.h - headH - bottomStack

  const hookFit = hook ? fitLines(ctx, hook.toUpperCase(), inner - 60, 2, format === 'story' ? 62 : 52, 800, 32) : null
  const hookH = hookFit ? hookFit.rows.length * hookFit.size * 1.2 + 24 : 0

  const nameFit = fitLines(ctx, facts.name, inner, 2, format === 'story' ? 70 : 60, 800, 36)
  const nameH = nameFit.rows.length * nameFit.size * 1.16 + 10

  const vendorH = facts.vendor ? 44 : 0

  const valueText = valueLine(facts, product, hook)
  // never repeat the hook as the line underneath it
  const showValue = valueText && (!hook || valueText.toLowerCase() !== String(hook).toLowerCase())
  const valueFit = showValue ? fitLines(ctx, valueText, inner, 2, 32, 500, 25) : null
  const valueH = valueFit ? valueFit.rows.length * valueFit.size * 1.3 + 22 : 0

  // benefits: skip any that is already the hook, and only as many as fit
  const allBenefits = facts.benefits.filter((b) => !hook || b.toLowerCase() !== String(hook).toLowerCase())
  const benefitRow = 62
  const maxByFormat = format === 'story' ? 3 : format === 'square' ? 2 : 3
  const textH = () => hookH + nameH + vendorH + valueH
  let benefitCount = Math.min(maxByFormat, allBenefits.length)
  // benefits earn their place before the photo does: shrink the stage first
  const minStage = format === 'square' ? 240 : 250
  while (benefitCount > 0 && available - textH() - benefitCount * benefitRow < minStage) benefitCount -= 1
  const benefits = allBenefits.slice(0, benefitCount)
  const stageH = Math.max(minStage, Math.min(format === 'story' ? 720 : 560, available - textH() - benefits.length * benefitRow - 20))

  // ---------- draw ----------
  brandMark(ctx, M, 40, 1)
  let y = headH

  const photo = await load(product?.images?.[0])
  productStage(ctx, photo, M, y, inner, stageH)
  if (facts.offer || facts.save) {
    const tag = (facts.offer || `SAVE ${money(facts.save)}`).toUpperCase()
    ctx.font = font(800, 28)
    const tw = ctx.measureText(tag).width
    ctx.fillStyle = GOLD
    rounded(ctx, M + 22, y + 22, tw + 40, 58, 16)
    ctx.fill()
    ctx.fillStyle = INK
    ctx.fillText(tag, M + 42, y + 60)
  }
  y += stageH + 40

  if (hookFit) {
    ctx.font = font(800, hookFit.size)
    const rowH = hookFit.size * 1.2
    hookFit.rows.forEach((row, i) => {
      const w = ctx.measureText(row).width
      highlight(ctx, M, y + i * rowH - hookFit.size * 0.84, Math.min(w + 32, inner), hookFit.size * 1.12)
      ctx.fillStyle = INK
      ctx.fillText(row, M + 14, y + i * rowH)
    })
    y += hookFit.rows.length * rowH + 20
  }

  ctx.font = font(800, nameFit.size)
  ctx.fillStyle = INK
  nameFit.rows.forEach((row, i) => ctx.fillText(row, M, y + i * nameFit.size * 1.16))
  y += nameFit.rows.length * nameFit.size * 1.16 + 8

  if (facts.vendor) {
    ctx.font = font(600, 28)
    ctx.fillStyle = GREY
    ctx.fillText(`by ${facts.vendor}`, M, y + 16)
    y += vendorH
  }

  if (valueFit) {
    ctx.font = font(500, valueFit.size)
    ctx.fillStyle = GREY
    valueFit.rows.forEach((row, i) => ctx.fillText(row, M, y + 10 + i * valueFit.size * 1.3))
    y += valueH
  }

  for (const b of benefits) {
    ctx.fillStyle = MINT
    ctx.beginPath()
    ctx.arc(M + 24, y + 8, 24, 0, Math.PI * 2)
    ctx.fill()
    icon(ctx, 'check', M + 11, y - 5, 26, GREEN)
    const bFit = fitLines(ctx, b, inner - 80, 1, 29, 600, 22)
    ctx.font = font(600, bFit.size)
    ctx.fillStyle = INK
    ctx.fillText(bFit.rows[0], M + 66, y + 17)
    y += benefitRow
  }

  // ---------- the fixed bottom stack ----------
  y = F.h - bottomStack + 4
  const priceW = Math.round(inner * 0.44)
  ctx.fillStyle = GREEN
  rounded(ctx, M, y, priceW, priceH, 24)
  ctx.fill()
  const pFit = fitLines(ctx, money(facts.price).replace('.00', ''), priceW - 44, 1, 88, 800, 42)
  ctx.font = font(800, pFit.size)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(pFit.rows[0], M + 26, y + 96)
  ctx.font = font(600, 25)
  ctx.fillStyle = '#BFE3D6'
  ctx.fillText(
    facts.model === 'negotiate' ? 'Asking price'
      : facts.model === 'book' ? 'Per booking'
        : facts.normal ? `Was ${money(facts.normal).replace('.00', '')}`
          : 'Get yours today',
    M + 28, y + 134)

  const points = trustPoints(facts, product, settings)
  const colW = (inner - priceW - 26) / points.length
  points.forEach((p, i) => {
    const cx = M + priceW + 26 + colW * i + colW / 2
    ctx.fillStyle = i === 0 ? '#FEF3D0' : MINT
    ctx.beginPath()
    ctx.arc(cx, y + 42, 32, 0, Math.PI * 2)
    ctx.fill()
    icon(ctx, p.icon, cx - 16, y + 26, 32, i === 0 ? '#9A7413' : GREEN)
    ctx.font = font(600, 22)
    ctx.fillStyle = INK
    p.label.split('\n').forEach((row, k) => {
      const w = ctx.measureText(row).width
      ctx.fillText(row, cx - w / 2, y + 100 + k * 26)
    })
  })
  y += priceH + 30

  ctx.fillStyle = GOLD
  rounded(ctx, M, y, inner, ctaH, ctaH / 2)
  ctx.fill()
  const cta = ctaFor(facts)
  const cFit = fitLines(ctx, cta, inner - 190, 1, 38, 800, 26)
  ctx.font = font(800, cFit.size)
  const ctaW = ctx.measureText(cFit.rows[0]).width
  const startX = M + (inner - ctaW - 60) / 2
  icon(ctx, 'cart', startX - 6, y + ctaH / 2 - 19, 38, INK)
  ctx.fillStyle = INK
  ctx.fillText(cFit.rows[0], startX + 52, y + ctaH / 2 + 13)
  ctx.font = font(800, 36)
  ctx.fillText('→', M + inner - 66, y + ctaH / 2 + 12)
  y += ctaH + 20

  ctx.fillStyle = INK
  rounded(ctx, M, y, inner, linkH, linkH / 2)
  ctx.fill()
  icon(ctx, 'link', M + 28, y + 22, 30, GOLD)
  const shown = String(link || '').replace(/^https?:\/\//, '')
  const lFit = fitLines(ctx, shown, inner - 120, 1, 29, 600, 19)
  ctx.font = font(600, lFit.size)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(lFit.rows[0] || shown, M + 72, y + linkH / 2 + 10)

  const fy = F.h - footH
  ctx.fillStyle = GREEN_DEEP
  ctx.fillRect(0, fy, F.w, footH)
  ctx.fillStyle = 'rgba(255,255,255,0.09)'
  ctx.beginPath()
  ctx.moveTo(0, fy)
  ctx.quadraticCurveTo(F.w * 0.4, fy - 34, F.w, fy + 18)
  ctx.lineTo(F.w, fy)
  ctx.closePath()
  ctx.fill()
  const foot = ['Support Zambian sellers', 'Confirmed before you pay', 'Delivered in Lusaka']
  const colF = F.w / foot.length
  foot.forEach((t, i) => {
    const f2 = fitLines(ctx, t, colF - 28, 1, 22, 600, 16)
    ctx.font = font(600, f2.size)
    const w = ctx.measureText(f2.rows[0]).width
    ctx.fillStyle = '#CFE7DD'
    ctx.fillText(f2.rows[0], colF * i + (colF - w) / 2, fy + footH / 2 + 8)
  })

  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92))
}
