import { brandLockup } from './posterKit'
// One tap turns a product — or a whole shop — into a picture ready for WhatsApp,
// Facebook or TikTok: the photo, the price, and the link to buy.

const W = 1080
const H = 1350
const INK = '#1F2933'
const MINT = '#E8F5F0'
const GOLD = '#E3A72F'
const PINE = '#0B6B50'

const money = (v) => `K${Number(v || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function loadImage(src) {
  return new Promise((res) => {
    if (!src) return res(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)      // a missing photo must never break the share
    img.src = src
  })
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Fit text to a width, wrapping onto at most `lines` rows.
function wrap(ctx, text, maxWidth, lines = 2) {
  const words = String(text || '').split(/\s+/)
  const rows = []
  let row = ''
  for (const word of words) {
    const test = row ? `${row} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && row) { rows.push(row); row = word } else row = test
    if (rows.length === lines) break
  }
  if (row && rows.length < lines) rows.push(row)
  if (rows.length === lines) {
    let last = rows[lines - 1]
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 4) last = last.slice(0, -1)
    if (words.join(' ') !== rows.join(' ')) rows[lines - 1] = `${last}…`
  }
  return rows
}

function cover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.save()
  roundRect(ctx, x, y, w, h, 28)
  ctx.clip()
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

function footer(ctx, link, note) {
  ctx.fillStyle = INK
  ctx.fillRect(0, H - 190, W, 190)
  // The mark, small, at the right of the band — the card belongs to a
  // marketplace and should say so without crowding the link.
  brandLockup(ctx, W - 250, H - 170, 34)
  ctx.fillStyle = GOLD
  ctx.font = '700 40px Instrument Sans, system-ui, sans-serif'
  ctx.fillText('Buy here', 64, H - 118)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = '600 38px Instrument Sans, system-ui, sans-serif'
  const rows = wrap(ctx, link, W - 128, 1)
  ctx.fillText(rows[0] || link, 64, H - 62)
  if (note) {
    ctx.fillStyle = '#9FB0BC'
    ctx.font = '400 28px Instrument Sans, system-ui, sans-serif'
    ctx.fillText(note, 64, H - 152)
  }
}

async function toBlob(canvas) {
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9))
}

// One product
export async function offerCard({ product, link, offerText }) {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)

  const photo = await loadImage(product.images?.[0])
  if (photo) cover(ctx, photo, 64, 300, W - 128, 560)

  ctx.fillStyle = GOLD
  ctx.font = '800 64px Instrument Sans, system-ui, sans-serif'
  const head = offerText || (product.normal_price && Number(product.normal_price) > Number(product.price)
    ? `SAVE ${money(Number(product.normal_price) - Number(product.price))}`
    : 'AVAILABLE NOW')
  wrap(ctx, head.toUpperCase(), W - 128, 2).forEach((row, i) => ctx.fillText(row, 64, 150 + i * 72))

  ctx.fillStyle = '#FFFFFF'
  ctx.font = '700 52px Instrument Sans, system-ui, sans-serif'
  const nameRows = wrap(ctx, product.name, W - 128, 2)
  nameRows.forEach((row, i) => ctx.fillText(row, 64, 940 + i * 60))

  const after = 940 + nameRows.length * 60
  ctx.fillStyle = GOLD
  ctx.font = '800 76px Instrument Sans, system-ui, sans-serif'
  ctx.fillText(money(product.price), 64, after + 62)
  if (product.normal_price && Number(product.normal_price) > Number(product.price)) {
    const pw = ctx.measureText(money(product.price)).width
    ctx.fillStyle = '#9FB0BC'
    ctx.font = '400 38px Instrument Sans, system-ui, sans-serif'
    ctx.fillText(money(product.normal_price), 64 + pw + 22, after + 62)
  }

  footer(ctx, link, 'On ZaMarket · confirmed by phone before you pay')
  return toBlob(c)
}

export async function productCard({ product, link, sellerName }) {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  const photo = await loadImage(product.images?.[0])
  if (photo) cover(ctx, photo, 64, 64, W - 128, 700)
  else {
    ctx.fillStyle = MINT
    roundRect(ctx, 64, 64, W - 128, 700, 28)
    ctx.fill()
    ctx.fillStyle = '#9BB3A8'
    ctx.font = '700 48px Instrument Sans, system-ui, sans-serif'
    ctx.fillText('ZaMarket', 110, 440)
  }

  const save = product.normal_price && Number(product.normal_price) > Number(product.price)
  if (save) {
    ctx.fillStyle = GOLD
    roundRect(ctx, 96, 96, 300, 76, 18)
    ctx.fill()
    ctx.fillStyle = INK
    ctx.font = '800 36px Instrument Sans, system-ui, sans-serif'
    ctx.fillText(`SAVE ${money(Number(product.normal_price) - Number(product.price))}`, 118, 147)
  }

  ctx.fillStyle = INK
  ctx.font = '700 58px Instrument Sans, system-ui, sans-serif'
  const nameRows = wrap(ctx, product.name, W - 128, 2)
  nameRows.forEach((row, i) => ctx.fillText(row, 64, 850 + i * 66))

  const afterName = 850 + nameRows.length * 66
  ctx.fillStyle = PINE
  ctx.font = '800 84px Instrument Sans, system-ui, sans-serif'
  ctx.fillText(money(product.price), 64, afterName + 78)
  if (save) {
    const priceWidth = ctx.measureText(money(product.price)).width
    ctx.fillStyle = '#6B7883'
    ctx.font = '400 40px Instrument Sans, system-ui, sans-serif'
    const was = money(product.normal_price)
    ctx.fillText(was, 64 + priceWidth + 24, afterName + 78)
    const wasWidth = ctx.measureText(was).width
    ctx.strokeStyle = '#6B7883'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(64 + priceWidth + 24, afterName + 64)
    ctx.lineTo(64 + priceWidth + 24 + wasWidth, afterName + 64)
    ctx.stroke()
  }

  ctx.fillStyle = '#4B5A66'
  ctx.font = '400 34px Instrument Sans, system-ui, sans-serif'
  const line = product.fulfilment === 'service'
    ? 'Book online · confirmed by phone first'
    : product.fulfilment === 'made_to_order'
      ? 'Made to order · delivered in Lusaka'
      : 'Delivered in Lusaka · confirmed by phone first'
  ctx.fillText(line, 64, afterName + 140)

  footer(ctx, link, sellerName ? `Sold by ${sellerName} on ZaMarket` : 'On ZaMarket')
  return toBlob(c)
}

// A whole shop: four products in a grid
export async function storeCard({ store, products, link }) {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = MINT
  ctx.fillRect(0, 0, W, 240)
  const logo = await loadImage(store.logo_url)
  if (logo) cover(ctx, logo, 64, 52, 136, 136)
  else {
    ctx.fillStyle = INK
    roundRect(ctx, 64, 52, 136, 136, 28)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '800 72px Instrument Sans, system-ui, sans-serif'
    ctx.fillText((store.business_name || 'Z').slice(0, 1), 100, 148)
  }
  ctx.fillStyle = INK
  ctx.font = '800 54px Instrument Sans, system-ui, sans-serif'
  ctx.fillText(wrap(ctx, store.business_name, W - 300, 1)[0], 232, 118)
  ctx.fillStyle = '#4B5A66'
  ctx.font = '400 32px Instrument Sans, system-ui, sans-serif'
  ctx.fillText(wrap(ctx, store.tagline || [store.category, store.town].filter(Boolean).join(' · '), W - 300, 1)[0], 232, 166)

  const picks = (products || []).slice(0, 4)
  const gap = 28
  const cellW = (W - 128 - gap) / 2
  const cellH = 300
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i]
    const x = 64 + (i % 2) * (cellW + gap)
    const y = 296 + Math.floor(i / 2) * (cellH + 100)
    const img = await loadImage(p.images?.[0])
    if (img) cover(ctx, img, x, y, cellW, cellH)
    else {
      ctx.fillStyle = MINT
      roundRect(ctx, x, y, cellW, cellH, 28)
      ctx.fill()
    }
    ctx.fillStyle = INK
    ctx.font = '600 32px Instrument Sans, system-ui, sans-serif'
    ctx.fillText(wrap(ctx, p.name, cellW, 1)[0], x, y + cellH + 42)
    ctx.fillStyle = PINE
    ctx.font = '800 40px Instrument Sans, system-ui, sans-serif'
    ctx.fillText(money(p.price), x, y + cellH + 88)
  }

  if (picks.length === 0) {
    ctx.fillStyle = '#4B5A66'
    ctx.font = '400 36px Instrument Sans, system-ui, sans-serif'
    ctx.fillText('New shop on ZaMarket', 64, 420)
  }

  footer(ctx, link, `${store.product_count || picks.length} items · Lusaka`)
  return toBlob(c)
}

// Share the picture, with the caption, straight to WhatsApp or anywhere else.
export async function sharePicture(blob, { caption, filename = 'zamarket.jpg' }) {
  // Preserve the actual encoder format (price lists are PNG; other cards may be JPEG).
  const mime = blob?.type || (filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')
  const extension = mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : ''
  const safeName = extension && !filename.toLowerCase().endsWith(extension)
    ? filename.replace(/\.(png|jpe?g)$/i, '') + extension : filename
  const file = new File([blob], safeName, { type: mime })
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({ files: [file], text: caption })
    return 'shared'
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}

// A published article, as a picture.
//
// A blog link pasted into WhatsApp is a grey rectangle nobody opens. This is
// the article as something worth looking at: the cover photo, the headline
// big enough to read on a phone at arm's length, and the address underneath.
//
// Three shapes, because the places people post to are not the same shape:
//   'story' 1080x1920 — WhatsApp status, Instagram story, Facebook story
//   'post'  1080x1350 — Instagram and Facebook feed
//   'wide'  1200x630  — the preview card when the link itself is pasted
export async function articleCard({ post, link, shape = 'post' }) {
  const size = { story: [1080, 1920], post: [1080, 1350], wide: [1200, 630] }[shape] || [1080, 1350]
  const [w, h] = size
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  const wide = shape === 'wide'
  const pad = Math.round(w * (wide ? 0.045 : 0.065))

  // The journal's own page: a warm paper ground with dark ink, the same as
  // the article reads on the site. The first version of this card set the
  // words on a dark slab under the photograph, which looked nothing like the
  // journal and read as heavy on a status.
  const PAPER = '#F8F2E9', INKJ = '#302922', SOFT = '#645B53', RULE = '#D9C7A8', ACTION = '#704D83'
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, w, h)

  const photo = await loadImage(post?.cover_url)
  const footH = Math.round(h * (wide ? 0.17 : 0.085))
  const footTop = h - footH - Math.round(pad * 0.5)

  // Wide cards put the photograph beside the words; tall ones put it above.
  let textX = pad, textW = w - pad * 2, y
  const radius = Math.round(w * 0.026)
  const frame = (x, fy, fw, fh) => {
    ctx.save()
    roundRect(ctx, x, fy, fw, fh, radius); ctx.clip()
    if (photo) {
      const scale = Math.max(fw / photo.width, fh / photo.height)
      const dw = photo.width * scale, dh = photo.height * scale
      ctx.drawImage(photo, x + (fw - dw) / 2, fy + (fh - dh) / 2, dw, dh)
    } else {
      ctx.fillStyle = '#EEE4D8'; ctx.fillRect(x, fy, fw, fh)
    }
    ctx.restore()
    ctx.strokeStyle = RULE; ctx.lineWidth = Math.max(1, w * 0.0018)
    roundRect(ctx, x, fy, fw, fh, radius); ctx.stroke()
  }

  if (wide) {
    const fw = Math.round(w * 0.42)
    frame(pad, pad, fw, footTop - pad - Math.round(pad * 0.4))
    textX = pad + fw + Math.round(pad * 0.9)
    textW = w - textX - pad
    y = pad + Math.round(h * 0.02)
  } else {
    const picH = Math.round(h * (shape === 'story' ? 0.50 : 0.46))
    frame(pad, pad, w - pad * 2, picH)
    y = pad + picH + Math.round(pad * 0.75)
  }

  ctx.textBaseline = 'top'
  const eyebrow = [post?.category, 'ZaMarket Journal'].filter(Boolean)[0]
  const eyeSize = Math.round(w * (wide ? 0.019 : 0.027))
  ctx.fillStyle = ACTION
  ctx.font = `700 ${eyeSize}px Instrument Sans, system-ui, sans-serif`
  ctx.fillText(String(eyebrow).toUpperCase(), textX, y)
  y += Math.round(eyeSize * 2.0)

  // Headline in a serif, as the journal sets its own headings.
  const titleSize = Math.round(w * (wide ? 0.040 : 0.064))
  const titleLead = Math.round(titleSize * 1.16)
  ctx.fillStyle = INKJ
  ctx.font = `700 ${titleSize}px Playfair Display, Georgia, 'Times New Roman', serif`
  const titleRoom = Math.max(1, Math.floor((footTop - y) / titleLead))
  for (const row of wrap(ctx, post?.title || 'Read this on ZaMarket', textW, Math.min(wide ? 4 : 3, titleRoom))) {
    ctx.fillText(row, textX, y); y += titleLead
  }

  if (post?.excerpt) {
    const exSize = Math.round(w * (wide ? 0.021 : 0.031))
    const exLead = Math.round(exSize * 1.45)
    y += Math.round(pad * 0.3)
    const lines = Math.floor((footTop - y - Math.round(pad * 0.3)) / exLead)
    if (lines >= 1) {
      ctx.fillStyle = SOFT
      ctx.font = `400 ${exSize}px Instrument Sans, system-ui, sans-serif`
      const most = shape === 'story' ? 7 : wide ? 3 : 4
      for (const row of wrap(ctx, post.excerpt, textW, Math.min(most, lines))) {
        ctx.fillText(row, textX, y); y += exLead
      }
    }
  }

  // Foot: a hairline, the mark in ink, and what to do next. The lockup
  // already reads zamarket.shop, so the address is not printed twice.
  ctx.strokeStyle = RULE
  ctx.lineWidth = Math.max(1, w * 0.0018)
  ctx.beginPath(); ctx.moveTo(pad, footTop); ctx.lineTo(w - pad, footTop); ctx.stroke()
  const markSize = Math.round(footH * (wide ? 0.42 : 0.50))
  const footMid = footTop + Math.round((h - footTop) / 2)
  brandLockup(ctx, pad, footMid - Math.round(markSize * 0.82), markSize, INKJ)

  const ctaSize = Math.round(w * (wide ? 0.019 : 0.028))
  ctx.font = `700 ${ctaSize}px Instrument Sans, system-ui, sans-serif`
  const label = 'Read the full story'
  const tw = ctx.measureText(label).width
  const bw = tw + ctaSize * 2.2, bh = ctaSize * 2.5
  ctx.fillStyle = ACTION
  roundRect(ctx, w - pad - bw, footMid - bh / 2, bw, bh, bh / 2); ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label, w - pad - bw / 2, footMid + 1)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'

  return toBlob(c)
}
