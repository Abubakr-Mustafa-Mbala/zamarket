import QRCode from 'qrcode'

// ---------------------------------------------------------------------------
// Store posters.
//
// Sharing a SHOP is not sharing a product, and the old card treated them the
// same: a name, one picture, a link. What a shop needs is an advertisement —
// something a baker would be glad to put on her own status, that tells a
// stranger what the business is and makes them curious enough to tap.
//
// Everything drawn here comes from what the seller actually entered: their
// name, logo, cover, description, their own highlights, their own sections and
// their real product photographs. Nothing is invented — no review that was
// never written, no "only 2 left", no discount nobody offered. A poster that
// lies is worth less than no poster, and in a city this size it is found out.
//
// What the poster cannot do is improve the photographs. A dark, blurry picture
// of a cake laid out beautifully is still a dark, blurry picture of a cake.
// The layouts below give a good photograph room to work and lean on type and
// colour when there is nothing good to show.
// ---------------------------------------------------------------------------

export const STORE_FORMATS = {
  story:     { key: 'story',     label: 'WhatsApp status',  w: 1080, h: 1920 },
  portrait:  { key: 'portrait',  label: 'Instagram post',   w: 1080, h: 1350 },
  square:    { key: 'square',    label: 'Square post',      w: 1080, h: 1080 },
  landscape: { key: 'landscape', label: 'Link preview',     w: 1200, h: 630 },
}

export const DESIGNS = {
  editorial: {
    key: 'editorial', label: 'Premium editorial',
    note: 'Large photography, elegant type, a brand block over the image.',
  },
  showcase: {
    key: 'showcase', label: 'Image-led showcase',
    note: 'One big photograph, the name low and large, very few words.',
  },
  commerce: {
    key: 'commerce', label: 'Modern commerce',
    note: 'A colour panel of words beside a grid of products.',
  },
  spotlight: {
    key: 'spotlight', label: 'Local business spotlight',
    note: 'Warm and welcoming, logo first, built around what they offer.',
  },
  luxury: {
    key: 'luxury', label: 'Luxury brand',
    note: 'Quiet, generous space, thin rules, understated.',
  },
}

// --- art direction -------------------------------------------------------
//
// A bakery and a phone shop should not come out looking the same. Each
// direction carries its own ground, accent, type pairing and ornament, chosen
// for how that trade actually presents itself.
const DIRECTIONS = {
  food: {
    match: /food|cake|baker|pastry|restaurant|kitchen|cater|meal|snack|drink|grocer/i,
    ground: '#120C08', panel: '#1B120C', ink: '#FFF8F0', ink2: '#D8C3A8',
    accent: '#D9A441', accentSoft: '#3A2A12', warm: true,
    display: '"Fraunces", Georgia, serif', body: '"Instrument Sans", system-ui, sans-serif',
    rule: 'flourish', vignette: 0.55,
  },
  fashion: {
    match: /fashion|cloth|wear|tailor|shoe|boutique|apparel|style|dress/i,
    ground: '#0E0E10', panel: '#17171A', ink: '#F7F5F2', ink2: '#B9B4AE',
    accent: '#E8E2D9', accentSoft: '#2A2A2E',
    display: '"Fraunces", Georgia, serif', body: '"Instrument Sans", system-ui, sans-serif',
    rule: 'hairline', vignette: 0.4,
  },
  tech: {
    match: /phone|electronic|computer|tech|gadget|laptop|device|accessor/i,
    ground: '#0A0E14', panel: '#121822', ink: '#EDF2F7', ink2: '#9FB0C4',
    accent: '#4FA8E8', accentSoft: '#10243A',
    display: '"Instrument Sans", system-ui, sans-serif', body: '"Instrument Sans", system-ui, sans-serif',
    rule: 'grid', vignette: 0.3,
  },
  beauty: {
    match: /beauty|salon|hair|nail|cosmetic|spa|skin|braid|barber/i,
    ground: '#140D14', panel: '#1E131E', ink: '#FBF4F7', ink2: '#D4B9C8',
    accent: '#D98CA8', accentSoft: '#3A1E2C',
    display: '"Fraunces", Georgia, serif', body: '"Instrument Sans", system-ui, sans-serif',
    rule: 'flourish', vignette: 0.45,
  },
  home: {
    match: /home|furniture|kitchen|decor|interior|garden|craft/i,
    ground: '#120F0B', panel: '#1C1813', ink: '#F7F2EA', ink2: '#C7B8A3',
    accent: '#C08E5A', accentSoft: '#33240F',
    display: '"Fraunces", Georgia, serif', body: '"Instrument Sans", system-ui, sans-serif',
    rule: 'hairline', vignette: 0.4,
  },
  services: {
    match: /service|repair|clean|driv|train|course|class|consult|build|print|photo/i,
    ground: '#0A1016', panel: '#121C26', ink: '#EDF3F8', ink2: '#A3B6C6',
    accent: '#5FBFA0', accentSoft: '#0F2B24',
    display: '"Instrument Sans", system-ui, sans-serif', body: '"Instrument Sans", system-ui, sans-serif',
    rule: 'grid', vignette: 0.3,
  },
  vehicles: {
    match: /vehicle|car|motor|truck|bike|auto/i,
    ground: '#0B0C0E', panel: '#15171A', ink: '#F2F4F6', ink2: '#A8AEB6',
    accent: '#E0A94A', accentSoft: '#2B2415',
    display: '"Instrument Sans", system-ui, sans-serif', body: '"Instrument Sans", system-ui, sans-serif',
    rule: 'grid', vignette: 0.35,
  },
  default: {
    match: /.^/,
    ground: '#0B0D10', panel: '#15181C', ink: '#EDEFF2', ink2: '#B9C0C9',
    accent: '#8A6CFF', accentSoft: '#241E45',
    display: '"Fraunces", Georgia, serif', body: '"Instrument Sans", system-ui, sans-serif',
    rule: 'hairline', vignette: 0.35,
  },
}

export function directionFor(store, products = []) {
  const hay = [store?.category, store?.description, store?.about, store?.tagline,
    ...(products || []).slice(0, 8).map((p) => `${p.category || ''} ${p.name || ''}`)]
    .filter(Boolean).join(' ')
  for (const [key, d] of Object.entries(DIRECTIONS)) {
    if (key !== 'default' && d.match.test(hay)) return { ...d, key }
  }
  return { ...DIRECTIONS.default, key: 'default' }
}

// --- canvas helpers ------------------------------------------------------

const load = (src) => new Promise((res) => {
  if (!src) return res(null)
  const i = new Image()
  i.crossOrigin = 'anonymous'
  i.onload = () => res(i.naturalWidth > 0 ? i : null)
  i.onerror = () => res(null)
  i.src = src
})

function rounded(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// Fill a box with an image, cropped rather than squashed. Faces and cakes sit
// slightly above centre in most photographs, so the crop favours the top.
function cover(ctx, img, x, y, w, h, bias = 0.42) {
  if (!img) return false
  const r = Math.max(w / img.width, h / img.height)
  const dw = img.width * r
  const dh = img.height * r
  ctx.save()
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  ctx.drawImage(img, x + (w - dw) / 2, y - (dh - h) * bias, dw, dh)
  ctx.restore()
  return true
}

function coverRounded(ctx, img, x, y, w, h, r, bias = 0.42) {
  ctx.save()
  rounded(ctx, x, y, w, h, r); ctx.clip()
  const ok = cover(ctx, img, x, y, w, h, bias)
  ctx.restore()
  return ok
}

// Shrink the text until it fits, rather than letting it run off the edge.
function fit(ctx, text, maxW, start, min, weight, family) {
  let size = start
  for (;;) {
    ctx.font = `${weight} ${size}px ${family}`
    if (ctx.measureText(text).width <= maxW || size <= min) break
    size -= 2
  }
  return size
}

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line); line = w
      if (lines.length === maxLines) break
    } else line = t
  }
  if (lines.length < maxLines && line) lines.push(line)
  if (lines.length === maxLines && words.length) {
    const last = lines[maxLines - 1]
    if (ctx.measureText(last).width > maxW - 10) {
      let t = last
      while (t.length > 4 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
      lines[maxLines - 1] = `${t}…`
    }
  }
  return lines
}

// Letter-spaced text, drawn a character at a time. The alignment is forced to
// left for the duration: with textAlign 'center' each character would be
// centred on its own pen position, which scatters the word.
function tracked(ctx, text, x, y, spacing) {
  const was = ctx.textAlign
  ctx.textAlign = 'left'
  let cx = x
  for (const ch of String(text)) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + spacing
  }
  ctx.textAlign = was
  return cx - x - spacing
}

function trackedWidth(ctx, text, spacing) {
  let w = 0
  for (const ch of String(text)) w += ctx.measureText(ch).width + spacing
  return Math.max(0, w - spacing)
}

// A photograph taken on a phone indoors is usually a little dark and a little
// flat. A gentle lift helps; anything stronger starts lying about the product.
function enhance(canvas) {
  const ctx = canvas.getContext('2d')
  try {
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const px = d.data
    for (let i = 0; i < px.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        let v = px[i + k] / 255
        v = (v - 0.5) * 1.06 + 0.5      // contrast
        v = Math.pow(Math.max(v, 0), 0.96) // brightness
        px[i + k] = Math.max(0, Math.min(255, v * 255))
      }
    }
    ctx.putImageData(d, 0, 0)
  } catch { /* a tainted canvas cannot be read; the poster is fine without this */ }
}

function grain(ctx, w, h, amount = 0.028) {
  const n = Math.round((w * h) / 900)
  ctx.save()
  ctx.globalAlpha = amount
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < n; i++) {
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1)
  }
  ctx.restore()
}

function vignette(ctx, w, h, strength) {
  const g = ctx.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.78)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,0,${strength})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function scrim(ctx, x, y, w, h, from, to, dir = 'down') {
  const g = dir === 'down'
    ? ctx.createLinearGradient(x, y, x, y + h)
    : ctx.createLinearGradient(x, y, x + w, y)
  g.addColorStop(0, from); g.addColorStop(1, to)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
}

function divider(ctx, dir, cx, y, width) {
  ctx.save()
  ctx.strokeStyle = dir.accent
  ctx.globalAlpha = 0.75
  ctx.lineWidth = 1.4
  if (dir.rule === 'flourish') {
    ctx.beginPath()
    ctx.moveTo(cx - width / 2, y); ctx.lineTo(cx - 16, y)
    ctx.moveTo(cx + 16, y); ctx.lineTo(cx + width / 2, y)
    ctx.stroke()
    ctx.beginPath(); ctx.arc(cx, y, 4.5, 0, Math.PI * 2); ctx.stroke()
  } else if (dir.rule === 'grid') {
    ctx.globalAlpha = 0.5
    ctx.beginPath(); ctx.moveTo(cx - width / 2, y); ctx.lineTo(cx + width / 2, y); ctx.stroke()
    ctx.globalAlpha = 1
    ctx.fillStyle = dir.accent
    ctx.fillRect(cx - width / 2, y - 2.5, 46, 5)
  } else {
    ctx.globalAlpha = 0.5
    ctx.beginPath(); ctx.moveTo(cx - width / 2, y); ctx.lineTo(cx + width / 2, y); ctx.stroke()
  }
  ctx.restore()
}

// --- the content the poster is allowed to say ----------------------------

const CATEGORY_GLYPH = {
  food: '◍', cake: '◍', dessert: '❖', savour: '❂', meal: '⬙', drink: '◉',
  cloth: '✦', shirt: '✦', shoe: '◆', dress: '✦',
  phone: '▣', electronic: '▣', accessor: '◈',
  hair: '✺', beauty: '✺', nail: '✦',
  service: '◎', repair: '◎', course: '✎', class: '✎',
}
const glyphFor = (label) => {
  const l = String(label || '').toLowerCase()
  for (const [k, g] of Object.entries(CATEGORY_GLYPH)) if (l.includes(k)) return g
  return '◆'
}

// What the shop offers, taken from their own sections first — those are the
// words the seller chose — and from the departments their products sit in only
// when they have not made sections of their own.
export function offersOf(store, products = [], sections = []) {
  const named = (sections || []).map((s) => s.name).filter(Boolean)
  if (named.length) return named.slice(0, 4)
  const cats = [...new Set((products || []).map((p) => p.category).filter(Boolean))]
  return cats.slice(0, 4)
}

// Reasons to visit. Only what the seller wrote, or what the marketplace can
// state as fact. Never a claim nobody made.
export function reasonsOf(store, products = [], settings = {}) {
  const out = []
  for (const h of (store?.highlights || [])) {
    if (h && String(h).trim()) out.push(String(h).trim())
  }
  if (out.length < 3) {
    const madeToOrder = (products || []).some((p) => p.fulfilment === 'made_to_order')
    if (madeToOrder && !out.some((t) => /order/i.test(t))) out.push('Made to order')
    if (String(settings?.delivery_included) === 'true') {
      if (!out.some((t) => /deliver/i.test(t))) out.push('Delivery included')
    } else if (!out.some((t) => /deliver/i.test(t))) out.push('Delivered to you')
    if (store?.town || store?.location) {
      const where = String(store.town || store.location).split(',')[0].trim()
      if (where && !out.some((t) => t.toLowerCase().includes(where.toLowerCase()))) out.push(`Based in ${where}`)
    }
  }
  return out.slice(0, 3)
}

// The photographs worth showing: real ones, best first, no duplicates.
export function photosOf(store, products = [], want = 4) {
  const seen = new Set()
  const pics = []
  const push = (src) => {
    if (!src || seen.has(src)) return
    seen.add(src); pics.push(src)
  }
  const ranked = [...(products || [])].sort((a, b) => {
    const fa = a.featured ? 1 : 0, fb = b.featured ? 1 : 0
    if (fa !== fb) return fb - fa
    const ra = Number(a.rating || 0), rb = Number(b.rating || 0)
    if (ra !== rb) return rb - ra
    return (b.images?.length || 0) - (a.images?.length || 0)
  })
  for (const p of ranked) push(p.images?.[0])
  return pics.slice(0, want)
}

async function qrImage(link, dark, light) {
  try {
    const url = await QRCode.toDataURL(String(link || ''), {
      margin: 1, width: 480, errorCorrectionLevel: 'M', color: { dark, light },
    })
    return await load(url)
  } catch { return null }
}

// --- the poster ----------------------------------------------------------

export async function renderStorePoster({
  store, products = [], sections = [], settings = {}, link,
  design = 'editorial', format = 'portrait',
}) {
  const fmt = STORE_FORMATS[format] || STORE_FORMATS.portrait
  const dir = directionFor(store, products)
  const { w, h } = fmt
  const wide = w > h
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* ignore */ } }

  const name = store?.business_name || 'This shop'
  const tagline = store?.tagline || ''
  const about = store?.about || store?.description || ''
  const offers = offersOf(store, products, sections)
  const reasons = reasonsOf(store, products, settings)
  const picks = photosOf(store, products, wide ? 3 : 4)

  const [logo, cover1, ...shots] = await Promise.all([
    load(store?.logo_url),
    load(store?.cover_url || picks[0]),
    ...picks.map((s) => load(s)),
  ])
  const gallery = shots.filter(Boolean)
  const hero = cover1 || gallery[0] || null
  const qr = await qrImage(link, dir.ground, '#FFFFFF')

  const pad = Math.round(w * (wide ? 0.045 : 0.065))
  ctx.fillStyle = dir.ground
  ctx.fillRect(0, 0, w, h)

  const api = { ctx, w, h, pad, dir, name, tagline, about, offers, reasons,
    gallery, hero, logo, qr, link, wide }

  const draw = {
    editorial: drawEditorial,
    showcase: drawShowcase,
    commerce: drawCommerce,
    spotlight: drawSpotlight,
    luxury: drawLuxury,
  }[design] || drawEditorial

  draw(api)

  grain(ctx, w, h)
  enhance(canvas)

  return await new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.93))
}

// Shared pieces ------------------------------------------------------------

function badge(ctx, dir, x, y, text) {
  ctx.font = `700 ${Math.round(dir._s * 15)}px ${dir.body}`
  const tw = trackedWidth(ctx, text, 2.2)
  const bw = tw + 38, bh = Math.round(dir._s * 40)
  ctx.save()
  ctx.strokeStyle = dir.accent; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.3
  rounded(ctx, x, y, bw, bh, bh / 2); ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = dir.accent
  ctx.textBaseline = 'middle'
  tracked(ctx, text, x + 19, y + bh / 2 + 1, 2.2)
  ctx.restore()
  return bh
}

function logoMark(ctx, dir, cx, cy, r, logo, name) {
  ctx.save()
  if (logo) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip()
    const s = Math.max((r * 2) / logo.width, (r * 2) / logo.height)
    ctx.drawImage(logo, cx - (logo.width * s) / 2, cy - (logo.height * s) / 2, logo.width * s, logo.height * s)
    ctx.restore(); ctx.save()
  } else {
    ctx.fillStyle = dir.accentSoft
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = dir.accent
    ctx.font = `700 ${Math.round(r * 0.95)}px ${dir.display}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(String(name || '?').trim().charAt(0).toUpperCase(), cx, cy + 1)
  }
  ctx.strokeStyle = dir.accent; ctx.globalAlpha = 0.9; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

// The shop's name, set as large as it will go without breaking the column.
function nameBlock(ctx, dir, x, y, maxW, text, align = 'left') {
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  const probe = Math.round(dir._s * 92)
  ctx.font = `700 ${probe}px ${dir.display}`
  for (const word of words) {
    const t = line ? `${line} ${word}` : word
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = word } else line = t
  }
  if (line) lines.push(line)
  const size = Math.min(probe, Math.round(probe * (lines.length > 2 ? 0.74 : 1)))
  ctx.font = `700 ${size}px ${dir.display}`
  let cy = y + size
  for (const l of lines.slice(0, 3)) {
    const s = fit(ctx, l, maxW, size, Math.round(size * 0.55), 700, dir.display)
    ctx.font = `700 ${s}px ${dir.display}`
    ctx.fillStyle = dir.ink
    ctx.fillText(l, x, cy)
    cy += Math.round(size * 1.03)
  }
  return cy - y
}

function offerStrip(ctx, dir, x, y, width, offers) {
  if (!offers.length) return 0
  const n = Math.min(offers.length, 4)
  const boxH = Math.round(dir._s * 108)
  ctx.save()
  ctx.fillStyle = dir.panel
  rounded(ctx, x, y, width, boxH, 16); ctx.fill()
  ctx.strokeStyle = dir.accent; ctx.globalAlpha = 0.22; ctx.lineWidth = 1
  rounded(ctx, x, y, width, boxH, 16); ctx.stroke()
  ctx.globalAlpha = 1
  const colW = width / n
  for (let i = 0; i < n; i++) {
    const cx = x + colW * i + colW / 2
    if (i > 0) {
      ctx.strokeStyle = dir.accent; ctx.globalAlpha = 0.18
      ctx.beginPath(); ctx.moveTo(x + colW * i, y + 22); ctx.lineTo(x + colW * i, y + boxH - 22); ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.textAlign = 'center'
    ctx.fillStyle = dir.accent
    ctx.font = `400 ${Math.round(dir._s * 30)}px ${dir.body}`
    ctx.fillText(glyphFor(offers[i]), cx, y + Math.round(boxH * 0.42))
    ctx.fillStyle = dir.ink
    const s = fit(ctx, offers[i], colW - 18, Math.round(dir._s * 22), 11, 700, dir.body)
    ctx.font = `700 ${s}px ${dir.body}`
    ctx.fillText(offers[i], cx, y + Math.round(boxH * 0.76))
  }
  ctx.restore()
  return boxH
}

function photoRow(ctx, dir, x, y, width, height, pics, gap = 12) {
  const n = pics.length
  if (!n) return 0
  const cw = (width - gap * (n - 1)) / n
  for (let i = 0; i < n; i++) {
    const px = x + (cw + gap) * i
    ctx.save()
    ctx.fillStyle = dir.panel
    rounded(ctx, px, y, cw, height, 12); ctx.fill()
    ctx.restore()
    coverRounded(ctx, pics[i], px, y, cw, height, 12)
    ctx.save()
    ctx.strokeStyle = dir.accent; ctx.globalAlpha = 0.25; ctx.lineWidth = 1
    rounded(ctx, px, y, cw, height, 12); ctx.stroke()
    ctx.restore()
  }
  return height
}

// ZaMarket sits at the foot, as the place you find the shop — never the headline.
function marketFooter(ctx, dir, x, y, width, height, qr, link) {
  ctx.save()
  const g = ctx.createLinearGradient(x, y, x + width, y + height)
  g.addColorStop(0, '#2A2060'); g.addColorStop(1, '#4B3AA8')
  ctx.fillStyle = g
  ctx.fillRect(x, y, width, height)

  const cy = y + height / 2
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
  ctx.fillStyle = '#FFFFFF'
  const mark = Math.round(dir._s * 34)
  ctx.font = `700 ${mark}px ${dir.body}`
  const lx = x + Math.round(width * 0.05)
  ctx.fillText('ZaMarket', lx, cy - (qr ? 0 : 1))
  const mw = ctx.measureText('ZaMarket').width
  ctx.fillStyle = '#A892FF'
  ctx.beginPath(); ctx.arc(lx + mw + 11, cy + mark * 0.22, mark * 0.13, 0, Math.PI * 2); ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  ctx.font = `500 ${Math.round(dir._s * 17)}px ${dir.body}`
  const sub = 'Discover local businesses'
  ctx.fillText(sub, lx, cy + mark * 0.95)

  if (qr) {
    const q = Math.round(height * 0.68)
    const qx = x + width - q - Math.round(width * 0.05)
    const qy = cy - q / 2
    ctx.fillStyle = '#FFFFFF'
    rounded(ctx, qx - 8, qy - 8, q + 16, q + 16, 10); ctx.fill()
    ctx.drawImage(qr, qx, qy, q, q)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.font = `600 ${Math.round(dir._s * 14)}px ${dir.body}`
    ctx.textAlign = 'right'
    ctx.fillText('Scan to visit', qx - 20, cy)
  } else if (link) {
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = `600 ${Math.round(dir._s * 18)}px ${dir.body}`
    ctx.fillText(String(link).replace(/^https?:\/\//, ''), x + width - Math.round(width * 0.05), cy)
  }
  ctx.restore()
}

function cta(ctx, dir, x, y, width, label) {
  const bh = Math.round(dir._s * 78)
  ctx.save()
  ctx.fillStyle = dir.accent
  rounded(ctx, x, y, width, bh, bh / 2); ctx.fill()
  ctx.fillStyle = dir.ground
  ctx.font = `700 ${Math.round(dir._s * 24)}px ${dir.body}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  tracked(ctx, label, x + width / 2 - trackedWidth(ctx, label, 2) / 2, y + bh / 2 + 1, 2)
  ctx.restore()
  return bh
}

// Layouts ------------------------------------------------------------------

function drawEditorial({ ctx, w, h, pad, dir, name, tagline, about, offers, reasons, gallery, hero, logo, qr, link, wide }) {
  dir._s = w / 1080
  const footH = Math.round(h * (wide ? 0.16 : 0.1))
  const heroH = Math.round(h * (wide ? 0.62 : 0.46))

  if (hero) {
    cover(ctx, hero, 0, 0, w, heroH, 0.4)
    // Dark enough to read the name over, clear enough that the food still
    // sells the shop — the photograph is the reason anyone looks twice.
    scrim(ctx, 0, 0, Math.round(w * 0.72), heroH, 'rgba(10,6,4,0.88)', 'rgba(10,6,4,0)', 'right')
    scrim(ctx, 0, heroH - Math.round(heroH * 0.38), w, Math.round(heroH * 0.38), 'rgba(0,0,0,0)', dir.ground)
  } else {
    ctx.fillStyle = dir.panel
    ctx.fillRect(0, 0, w, heroH)
  }

  let y = pad
  badge(ctx, dir, pad, y, 'NOW ON ZAMARKET')
  y += Math.round(dir._s * 40) + Math.round(dir._s * 34)

  const colW = Math.round(w * (wide ? 0.52 : 0.68))
  y += nameBlock(ctx, dir, pad, y, colW, name)

  if (tagline || about) {
    ctx.textAlign = 'left'
    ctx.fillStyle = dir.ink2
    ctx.font = `500 ${Math.round(dir._s * 27)}px ${dir.body}`
    const lines = wrap(ctx, tagline || about, colW, 2)
    y += Math.round(dir._s * 18)
    for (const l of lines) { ctx.fillText(l, pad, y + Math.round(dir._s * 27)); y += Math.round(dir._s * 38) }
  }

  if (reasons.length) {
    y += Math.round(dir._s * 20)
    ctx.font = `700 ${Math.round(dir._s * 18)}px ${dir.body}`
    ctx.fillStyle = dir.accent
    let rx = pad
    for (let i = 0; i < reasons.length; i++) {
      const t = reasons[i].toUpperCase()
      const tw = trackedWidth(ctx, t, 2)
      if (rx + tw > w - pad) break
      tracked(ctx, t, rx, y + Math.round(dir._s * 14), 2)
      rx += tw + Math.round(dir._s * 20)
      if (i < reasons.length - 1 && rx + 18 < w - pad) {
        ctx.beginPath(); ctx.arc(rx - Math.round(dir._s * 10), y + Math.round(dir._s * 9), 2.6, 0, Math.PI * 2)
        ctx.fillStyle = dir.accent; ctx.fill()
      }
    }
    y += Math.round(dir._s * 34)
  }

  if (logo) logoMark(ctx, dir, w - pad - Math.round(dir._s * 72), pad + Math.round(dir._s * 72), Math.round(dir._s * 72), logo, name)

  let by = Math.max(y + Math.round(dir._s * 30), heroH + Math.round(dir._s * 26))
  const inner = w - pad * 2

  if (offers.length) {
    ctx.textAlign = 'center'
    ctx.fillStyle = dir.ink2
    ctx.font = `700 ${Math.round(dir._s * 17)}px ${dir.body}`
    tracked(ctx, 'WHAT WE OFFER', w / 2 - trackedWidth(ctx, 'WHAT WE OFFER', 3) / 2, by, 3)
    by += Math.round(dir._s * 22)
    by += offerStrip(ctx, dir, pad, by, inner, offers) + Math.round(dir._s * 24)
  }

  const room = h - footH - by - pad - Math.round(dir._s * 110)
  if (gallery.length >= 2 && room > Math.round(dir._s * 120)) {
    const ph = Math.min(Math.round(dir._s * 230), room)
    by += photoRow(ctx, dir, pad, by, inner, ph, gallery.slice(0, wide ? 3 : 4)) + Math.round(dir._s * 28)
  }

  const ctaY = h - footH - Math.round(dir._s * 78) - Math.round(dir._s * 30)
  cta(ctx, dir, pad, ctaY, inner, 'EXPLORE OUR STORE')
  marketFooter(ctx, dir, 0, h - footH, w, footH, qr, link)
}

function drawShowcase({ ctx, w, h, pad, dir, name, tagline, about, gallery, hero, logo, qr, link, reasons }) {
  dir._s = w / 1080
  const footH = Math.round(h * 0.09)
  if (hero) {
    cover(ctx, hero, 0, 0, w, h - footH, 0.38)
    scrim(ctx, 0, Math.round(h * 0.28), w, h - footH - Math.round(h * 0.28), 'rgba(8,5,3,0)', 'rgba(8,5,3,0.94)')
    scrim(ctx, 0, 0, w, Math.round(h * 0.3), 'rgba(8,5,3,0.7)', 'rgba(8,5,3,0)')
  } else {
    ctx.fillStyle = dir.panel; ctx.fillRect(0, 0, w, h - footH)
  }
  vignette(ctx, w, h - footH, dir.vignette)

  badge(ctx, dir, pad, pad, 'DISCOVER ON ZAMARKET')
  if (logo) logoMark(ctx, dir, w - pad - Math.round(dir._s * 66), pad + Math.round(dir._s * 66), Math.round(dir._s * 66), logo, name)

  const blockW = w - pad * 2
  let y = h - footH - Math.round(dir._s * 150)
  if (reasons.length) {
    ctx.textAlign = 'center'
    ctx.font = `700 ${Math.round(dir._s * 18)}px ${dir.body}`
    ctx.fillStyle = dir.accent
    const t = reasons.join('  ·  ').toUpperCase()
    const tw = trackedWidth(ctx, t, 2.4)
    tracked(ctx, t, w / 2 - Math.min(tw, blockW) / 2, y, 2.4)
    y -= Math.round(dir._s * 26)
  }
  const nameH = (() => {
    ctx.textAlign = 'center'
    const probe = Math.round(dir._s * 108)
    ctx.font = `700 ${probe}px ${dir.display}`
    const lines = wrap(ctx, name, blockW, 2)
    const size = lines.length > 1 ? Math.round(probe * 0.78) : probe
    let cy = y - (lines.length - 1) * Math.round(size * 1.02)
    for (const l of lines) {
      const s = fit(ctx, l, blockW, size, Math.round(size * 0.5), 700, dir.display)
      ctx.font = `700 ${s}px ${dir.display}`
      ctx.fillStyle = dir.ink
      ctx.fillText(l, w / 2, cy)
      cy += Math.round(size * 1.02)
    }
    return lines.length * Math.round(size * 1.02)
  })()
  y -= nameH

  divider(ctx, dir, w / 2, y - Math.round(dir._s * 26), Math.round(blockW * 0.42))

  if (tagline || about) {
    ctx.textAlign = 'center'
    ctx.fillStyle = dir.ink2
    ctx.font = `500 ${Math.round(dir._s * 26)}px ${dir.body}`
    const lines = wrap(ctx, tagline || about, Math.round(blockW * 0.82), 2)
    let ty = y - Math.round(dir._s * 70)
    for (let i = lines.length - 1; i >= 0; i--) { ctx.fillText(lines[i], w / 2, ty); ty -= Math.round(dir._s * 36) }
  }

  cta(ctx, dir, pad + blockW * 0.18, h - footH - Math.round(dir._s * 96), blockW * 0.64, 'VISIT OUR STORE')
  marketFooter(ctx, dir, 0, h - footH, w, footH, qr, link)
}

function drawCommerce({ ctx, w, h, pad, dir, name, tagline, about, offers, reasons, gallery, hero, logo, qr, link, wide }) {
  dir._s = w / 1080
  const footH = Math.round(h * (wide ? 0.17 : 0.1))
  const body = h - footH
  const splitX = Math.round(w * (wide ? 0.46 : 0.54))

  ctx.fillStyle = dir.panel
  ctx.fillRect(0, 0, splitX, body)
  const g = ctx.createLinearGradient(0, 0, splitX, body)
  g.addColorStop(0, dir.accentSoft); g.addColorStop(1, dir.panel)
  ctx.fillStyle = g; ctx.fillRect(0, 0, splitX, body)

  // photo column, a stack rather than a strip
  const picks = (gallery.length ? gallery : [hero].filter(Boolean)).slice(0, 3)
  const colX = splitX, colW = w - splitX
  if (picks.length === 1) {
    cover(ctx, picks[0], colX, 0, colW, body, 0.4)
  } else if (picks.length) {
    const bigH = Math.round(body * 0.58)
    cover(ctx, picks[0], colX, 0, colW, bigH, 0.4)
    const rest = picks.slice(1)
    const rw = colW / rest.length
    rest.forEach((p, i) => cover(ctx, p, colX + rw * i, bigH, rw, body - bigH, 0.45))
  } else {
    ctx.fillStyle = dir.ground; ctx.fillRect(colX, 0, colW, body)
  }
  scrim(ctx, splitX - 60, 0, 60, body, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.28)', 'right')

  const inner = splitX - pad * 2
  let y = pad
  badge(ctx, dir, pad, y, 'NOW ON ZAMARKET')
  y += Math.round(dir._s * 40) + Math.round(dir._s * 28)
  if (logo) { logoMark(ctx, dir, pad + Math.round(dir._s * 52), y + Math.round(dir._s * 52), Math.round(dir._s * 52), logo, name); y += Math.round(dir._s * 128) }
  y += nameBlock(ctx, dir, pad, y, inner, name)

  if (tagline || about) {
    ctx.textAlign = 'left'; ctx.fillStyle = dir.ink2
    ctx.font = `500 ${Math.round(dir._s * 24)}px ${dir.body}`
    y += Math.round(dir._s * 16)
    for (const l of wrap(ctx, tagline || about, inner, 3)) { ctx.fillText(l, pad, y + Math.round(dir._s * 24)); y += Math.round(dir._s * 34) }
  }

  if (offers.length) {
    y += Math.round(dir._s * 26)
    ctx.font = `700 ${Math.round(dir._s * 21)}px ${dir.body}`
    for (const o of offers.slice(0, 4)) {
      ctx.fillStyle = dir.accent
      ctx.fillText(glyphFor(o), pad, y + Math.round(dir._s * 20))
      ctx.fillStyle = dir.ink
      ctx.fillText(o, pad + Math.round(dir._s * 34), y + Math.round(dir._s * 20))
      y += Math.round(dir._s * 38)
    }
  }
  if (reasons.length) {
    y += Math.round(dir._s * 12)
    ctx.font = `600 ${Math.round(dir._s * 17)}px ${dir.body}`
    ctx.fillStyle = dir.ink2
    for (const l of wrap(ctx, reasons.join(' · '), inner, 2)) { ctx.fillText(l, pad, y + Math.round(dir._s * 17)); y += Math.round(dir._s * 26) }
  }

  cta(ctx, dir, pad, body - Math.round(dir._s * 78) - pad, inner, 'SHOP THIS STORE')
  marketFooter(ctx, dir, 0, h - footH, w, footH, qr, link)
}

function drawSpotlight({ ctx, w, h, pad, dir, name, tagline, about, offers, reasons, gallery, hero, logo, qr, link, wide }) {
  dir._s = w / 1080
  const footH = Math.round(h * (wide ? 0.16 : 0.095))
  ctx.fillStyle = dir.ground; ctx.fillRect(0, 0, w, h)
  if (hero) {
    cover(ctx, hero, 0, 0, w, Math.round(h * 0.34), 0.4)
    scrim(ctx, 0, 0, w, Math.round(h * 0.34), 'rgba(0,0,0,0.25)', dir.ground)
  }

  const inner = w - pad * 2
  let y = Math.round(h * (hero ? 0.2 : 0.07))
  logoMark(ctx, dir, w / 2, y + Math.round(dir._s * 78), Math.round(dir._s * 78), logo, name)
  y += Math.round(dir._s * 178)

  ctx.textAlign = 'center'
  const probe = Math.round(dir._s * 72)
  ctx.font = `700 ${probe}px ${dir.display}`
  for (const l of wrap(ctx, name, inner, 2)) {
    const s = fit(ctx, l, inner, probe, Math.round(probe * 0.5), 700, dir.display)
    ctx.font = `700 ${s}px ${dir.display}`
    ctx.fillStyle = dir.ink
    ctx.fillText(l, w / 2, y)
    y += Math.round(probe * 0.98)
  }
  divider(ctx, dir, w / 2, y - Math.round(dir._s * 14), Math.round(inner * 0.4))
  y += Math.round(dir._s * 28)

  if (tagline || about) {
    ctx.fillStyle = dir.ink2
    ctx.font = `500 ${Math.round(dir._s * 25)}px ${dir.body}`
    for (const l of wrap(ctx, tagline || about, Math.round(inner * 0.88), 2)) {
      ctx.fillText(l, w / 2, y); y += Math.round(dir._s * 36)
    }
    y += Math.round(dir._s * 10)
  }

  if (offers.length) { y += offerStrip(ctx, dir, pad, y, inner, offers) + Math.round(dir._s * 26) }

  const ctaY = h - footH - Math.round(dir._s * 78) - Math.round(dir._s * 28)
  // Leave the reasons line its own band above the button, or the photographs
  // run straight into it.
  const reasonBand = reasons.length ? Math.round(dir._s * 46) : 0
  const room = ctaY - reasonBand - y - Math.round(dir._s * 20)
  if (gallery.length >= 2 && room > Math.round(dir._s * 140)) {
    const cols = wide ? 3 : 2
    const rows = Math.min(2, Math.ceil(Math.min(gallery.length, 4) / cols))
    const gap = 12
    const cw = (inner - gap * (cols - 1)) / cols
    const chh = Math.min(Math.round((room - gap * (rows - 1)) / rows), Math.round(dir._s * 240))
    gallery.slice(0, cols * rows).forEach((p, i) => {
      const cx = pad + (cw + gap) * (i % cols)
      const cy = y + (chh + gap) * Math.floor(i / cols)
      coverRounded(ctx, p, cx, cy, cw, chh, 14)
      ctx.save(); ctx.strokeStyle = dir.accent; ctx.globalAlpha = 0.22
      rounded(ctx, cx, cy, cw, chh, 14); ctx.stroke(); ctx.restore()
    })
  }

  if (reasons.length) {
    ctx.textAlign = 'center'
    ctx.font = `700 ${Math.round(dir._s * 17)}px ${dir.body}`
    ctx.fillStyle = dir.accent
    const t = reasons.join('  ·  ').toUpperCase()
    tracked(ctx, t, w / 2 - trackedWidth(ctx, t, 2.2) / 2, ctaY - Math.round(dir._s * 24), 2.2)
  }
  cta(ctx, dir, pad, ctaY, inner, 'DISCOVER WHAT WE OFFER')
  marketFooter(ctx, dir, 0, h - footH, w, footH, qr, link)
}

function drawLuxury({ ctx, w, h, pad, dir, name, tagline, about, offers, hero, gallery, logo, qr, link, wide }) {
  dir._s = w / 1080
  const footH = Math.round(h * (wide ? 0.15 : 0.085))
  ctx.fillStyle = dir.ground; ctx.fillRect(0, 0, w, h)

  const m = Math.round(w * 0.085)
  ctx.save()
  ctx.strokeStyle = dir.accent; ctx.globalAlpha = 0.38; ctx.lineWidth = 1
  ctx.strokeRect(m, m, w - m * 2, h - footH - m * 1.3)
  ctx.restore()

  const inner = w - m * 2 - Math.round(dir._s * 56)
  const x = m + Math.round(dir._s * 28)
  let y = m + Math.round(dir._s * 62)

  ctx.textAlign = 'center'
  ctx.font = `600 ${Math.round(dir._s * 15)}px ${dir.body}`
  ctx.fillStyle = dir.ink2
  tracked(ctx, 'NOW ON ZAMARKET', w / 2 - trackedWidth(ctx, 'NOW ON ZAMARKET', 4) / 2, y, 4)
  y += Math.round(dir._s * 74)

  if (logo) { logoMark(ctx, dir, w / 2, y + Math.round(dir._s * 56), Math.round(dir._s * 56), logo, name); y += Math.round(dir._s * 136) }

  const probe = Math.round(dir._s * 70)
  ctx.font = `700 ${probe}px ${dir.display}`
  for (const l of wrap(ctx, name, inner, 2)) {
    const s = fit(ctx, l, inner, probe, Math.round(probe * 0.5), 700, dir.display)
    ctx.font = `700 ${s}px ${dir.display}`
    ctx.fillStyle = dir.ink
    ctx.fillText(l, w / 2, y)
    y += Math.round(probe * 1.0)
  }

  if (tagline || about) {
    y += Math.round(dir._s * 8)
    ctx.fillStyle = dir.ink2
    ctx.font = `400 ${Math.round(dir._s * 24)}px ${dir.body}`
    for (const l of wrap(ctx, tagline || about, Math.round(inner * 0.8), 2)) {
      ctx.fillText(l, w / 2, y); y += Math.round(dir._s * 34)
    }
  }

  divider(ctx, dir, w / 2, y + Math.round(dir._s * 18), Math.round(inner * 0.3))
  y += Math.round(dir._s * 52)

  const ctaY = h - footH - Math.round(dir._s * 78) - Math.round(dir._s * 52)
  const room = ctaY - y - Math.round(dir._s * 56)
  const shot = hero || gallery[0]
  if (shot && room > Math.round(dir._s * 160)) {
    const ih = Math.min(room, Math.round(h * 0.46))
    coverRounded(ctx, shot, x, y, inner, ih, 4)
    ctx.save(); ctx.strokeStyle = dir.accent; ctx.globalAlpha = 0.3
    rounded(ctx, x, y, inner, ih, 4); ctx.stroke(); ctx.restore()
    y += ih + Math.round(dir._s * 30)
  }

  if (offers.length) {
    ctx.textAlign = 'center'
    ctx.font = `600 ${Math.round(dir._s * 18)}px ${dir.body}`
    ctx.fillStyle = dir.ink2
    const t = offers.join('   ·   ')
    tracked(ctx, t, w / 2 - trackedWidth(ctx, t, 2.6) / 2, Math.min(y + Math.round(dir._s * 10), ctaY - Math.round(dir._s * 28)), 2.6)
  }

  cta(ctx, dir, x + inner * 0.2, ctaY, inner * 0.6, 'EXPLORE OUR STORE')
  marketFooter(ctx, dir, 0, h - footH, w, footH, qr, link)
}

// A caption that is about this shop, not about the marketplace.
export function storeCaption({ store, products = [], sections = [], settings = {}, link }) {
  const name = store?.business_name || 'our shop'
  const offers = offersOf(store, products, sections)
  const reasons = reasonsOf(store, products, settings)
  const lines = [`${name} is now on ZaMarket.`]
  const what = store?.tagline || store?.about || store?.description
  if (what) lines.push(String(what).split('\n')[0].trim())
  if (offers.length) lines.push(`${offers.join(' · ')}`)
  if (reasons.length) lines.push(reasons.join(' · '))
  lines.push('Order online and we deliver it to you.')
  if (link) lines.push(link)
  return lines.join('\n')
}
