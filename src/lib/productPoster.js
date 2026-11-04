import {
  FORMATS, directionFrom, load, rounded, cover, coverRounded, fit, wrap,
  tracked, trackedWidth, enhance, grain, vignette, scrim, divider, qrImage,
  qrMinSize, qrPanel,
} from './posterKit'
import { money } from './format'

// ---------------------------------------------------------------------------
// Product posters.
//
// A shop post and a product post are arguing different things. A shop post
// asks "what is this business, and why would I look?" A product post argues
// one thing only: this item, this price, from this seller, tap here. So the
// product is the hero and the shop is the signature — the exact inverse of
// the store poster, which is why they are two files and not one switch.
//
// Everything on the poster is read off the product row and the shop row. The
// name, the price, the photographs, the seller's own benefit lines, how it is
// fulfilled. There is no code path in this file that can produce:
//
//   · a review, a star rating or a testimonial that was not left
//   · "only 2 left", "selling fast", "limited" or any other scarcity
//   · a discount, a "was" price or a saving that is not in normal_price
//   · a guarantee, a warranty, a delivery promise or a date
//   · a photograph of anything other than this product
//
// That is not caution, it is the whole value of the thing. A seller posts
// these to their own status, under their own name, to people who know them.
// One invented claim and it is their reputation that pays, not ours.
//
// A real saving is different from an invented one: if the seller entered a
// normal_price above the price, that is a fact in the data and the poster may
// show it, struck through, without hype.
// ---------------------------------------------------------------------------

export const PRODUCT_FORMATS = FORMATS

export const PRODUCT_DESIGNS = {
  hero: {
    key: 'hero', label: 'Full-bleed hero',
    note: 'The photograph fills the poster, the name and price sit over it. The strongest one when the picture is good.',
  },
  editorial: {
    key: 'editorial', label: 'Premium editorial',
    note: 'Photograph above, a typeset block below. Reads like a catalogue page.',
  },
  detail: {
    key: 'detail', label: 'What you get',
    note: 'The photograph beside your own benefit lines. Best when you have written what makes it good.',
  },
  gallery: {
    key: 'gallery', label: 'Several angles',
    note: 'One large photograph and the others beside it. Needs more than one picture of the same item.',
  },
  statement: {
    key: 'statement', label: 'Quiet and expensive',
    note: 'Space around the product, small type, nothing shouting. Suits higher prices.',
  },
}

// --- what the poster is allowed to say -----------------------------------

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

// A saving only exists if the seller entered one. No percentages are invented
// and nothing is rounded in our favour.
export function savingOf(product) {
  const was = n(product?.normal_price)
  const now = n(product?.price)
  if (!was || !now || was <= now) return null
  return { was, now, off: was - now }
}

// How this item actually reaches the customer, in the seller's terms. Every
// branch here is a fact from the row; none of them promise a date.
export function fulfilmentOf(product) {
  const days = n(product?.lead_time_days)
  if (product?.fulfilment === 'service') return 'A service · booked online, confirmed by phone'
  if (product?.fulfilment === 'made_to_order') {
    return days > 0 ? `Made to order · about ${days} day${days === 1 ? '' : 's'} to prepare` : 'Made to order'
  }
  return 'In stock'
}

// Tidy up a line a seller typed. Sellers paste from everywhere, so a line
// arrives with a leading bullet, a dash, stray dots or doubled spaces, and
// those were going straight onto the poster and into the caption — which is
// where "·· mess free counters — — —" came from.
function tidy(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    // leading bullets, dashes, dots, arrows, stars
    .replace(/^[\s•·‣▪◦*\-–—>»→.]+/, '')
    // trailing dashes and dots, including an ellipsis the seller typed
    .replace(/[\s\-–—·•.]+$/, '')
    .trim()
}

// The seller's own words about why it is worth having. Their benefit lines
// first — they wrote those — then their description, split into whole
// sentences. Nothing is generated: if they wrote nothing, nothing is said.
//
// `limit` is for the POSTER, where a line has to physically fit. A line that
// is too long is SKIPPED rather than cut, because half a sentence ending in
// "…" tells the reader nothing and looks broken. Only if nothing at all fits
// is a line shortened, and then at a word boundary.
//
// The caption passes no limit and gets the lines whole — a caption has all
// the room in the world, and that is what people actually read.
export function sellingPoints(product, want = 4, limit = 0) {
  const seen = new Set()
  const out = []
  const add = (raw) => {
    const t = tidy(raw)
    if (t.length < 6) return
    const key = t.toLowerCase()
    if (seen.has(key)) return
    if (limit && t.length > limit) return
    seen.add(key)
    out.push(t)
  }

  for (const b of (product?.benefits || [])) {
    add(b)
    if (out.length === want) return out
  }

  // Whole sentences: split on terminators but keep them out of the result,
  // and never break on a decimal point or an abbreviation.
  const desc = tidy(product?.description).replace(/\s*\n\s*/g, '. ')
  for (const part of desc.split(/(?<![0-9])[.;!?]+(?=\s|$)/)) {
    add(part)
    if (out.length === want) break
  }

  // Everything was too long for the poster. Rather than show nothing, take
  // the shortest one and cut it at a word, not mid-word.
  if (!out.length && limit) {
    const all = [...(product?.benefits || []), ...tidy(product?.description).split(/(?<![0-9])[.;!?]+(?=\s|$)/)]
      .map(tidy).filter((t) => t.length >= 6).sort((a, b) => a.length - b.length)
    if (all.length) {
      const t = all[0]
      out.push(t.length <= limit ? t : `${t.slice(0, t.lastIndexOf(' ', limit) > 20 ? t.lastIndexOf(' ', limit) : limit).trimEnd()}…`)
    }
  }
  return out
}

// Pictures of THIS product, in the order the seller arranged them. No stock
// photography, no picture borrowed from another listing.
export function shotsOf(product, want = 4) {
  const seen = new Set()
  const out = []
  for (const src of (product?.images || [])) {
    if (!src || seen.has(src)) continue
    seen.add(src); out.push(src)
    if (out.length === want) break
  }
  return out
}

// The art direction comes from the product first and the shop second, so a
// cake from a general store still gets the food treatment.
export function directionForProduct(product, store) {
  return directionFrom(
    product?.category, product?.name, product?.description,
    store?.category, store?.business_name,
  )
}

// Which design suits what the seller actually has. Offered as a star in the
// studio, never forced: the seller always picks.
export function recommendedDesign(product, store) {
  const shots = shotsOf(product, 4)
  const points = sellingPoints(product, 4)
  const dir = directionForProduct(product, store)
  if (shots.length >= 3) return 'gallery'
  if (n(product?.price) >= 2000 && shots.length) return 'statement'
  if (points.length >= 3) return 'detail'
  if (shots.length && (dir.key === 'food' || dir.key === 'beauty' || dir.key === 'fashion')) return 'hero'
  return shots.length ? 'hero' : 'editorial'
}

// --- the poster ----------------------------------------------------------

export async function renderProductPoster({
  product, store = null, settings = {}, link,
  design = 'hero', format = 'portrait',
}) {
  const fmt = PRODUCT_FORMATS[format] || PRODUCT_FORMATS.portrait
  const dir = directionForProduct(product, store)
  const { w, h } = fmt
  const wide = w > h
  dir._s = w / 1080

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* fonts are optional */ } }

  const name = String(product?.name || 'This item').trim()
  const price = n(product?.price)
  const saving = savingOf(product)
  // 64 characters is what fits a poster line at this size. Anything longer
  // is skipped rather than cut; the caption carries the full text.
  const points = sellingPoints(product, wide ? 3 : 4, 64)
  const picks = shotsOf(product, wide ? 3 : 4)
  const shopName = store?.business_name || ''
  const place = String(store?.town || store?.location || '').split(',')[0].trim()

  // Delivery is only ever stated from the marketplace setting, never guessed.
  const deliveryLine = String(settings?.delivery_included) === 'true'
    ? 'Delivery included'
    : ''

  const [logo, ...loaded] = await Promise.all([
    load(store?.logo_url),
    ...picks.map((s) => load(s)),
  ])
  const shots = loaded.filter(Boolean)
  const hero = shots[0] || null
  const qr = await qrImage(link, dir.ground, '#FFFFFF')

  const pad = Math.round(w * (wide ? 0.045 : 0.065))
  ctx.fillStyle = dir.ground
  ctx.fillRect(0, 0, w, h)

  const api = {
    ctx, w, h, pad, dir, wide, name, price, saving, points, shots, hero,
    logo, qr, link, shopName, place, deliveryLine,
    fulfilment: fulfilmentOf(product),
    category: String(product?.category || '').trim(),
  }

  // A design that needs something the seller does not have falls back rather
  // than drawing an empty frame.
  let chosen = design
  if ((chosen === 'gallery' && shots.length < 2) || (chosen === 'detail' && !points.length)) {
    chosen = hero ? 'hero' : 'editorial'
  }
  if (!hero && chosen !== 'editorial') chosen = 'editorial'

  const draw = {
    hero: drawHero,
    editorial: drawEditorial,
    detail: drawDetail,
    gallery: drawGallery,
    statement: drawStatement,
  }[chosen] || drawHero

  draw(api)

  grain(ctx, w, h)
  enhance(canvas)

  return await new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.93))
}

// --- shared pieces --------------------------------------------------------

// Everything below positions from the TOP of a block, never from a text
// baseline. Mixing the two is what makes canvas layouts collide: fillText
// takes a baseline, so a 60px heading drawn "at y" actually occupies the 60
// pixels above y, straight through whatever was drawn there first. Each
// helper here takes a top edge and returns the height it used, so a layout
// is just a running total.

const TOP = 0.80   // baseline sits this far down a line box

// How tall the price block will be, before anything is drawn. Needed because
// the hero layout stacks upwards from the bottom and has to know first.
function priceHeight(ctx, dir, saving, price, maxW) {
  const now = money(price)
  const size = fit(ctx, now, maxW * (saving ? 0.66 : 1), Math.round(dir._s * 104), Math.round(dir._s * 44), 800, dir.body)
  return { size, h: Math.round(size * 1.02) }
}

// The price, with a real "was" beside it when there is one. This is the single
// most important thing on the poster, drawn to be read across a room.
//
// `x` is the left edge, the centre, or the right edge depending on `align`,
// and the whole group — price plus struck-through was-price — is aligned as
// one unit, so a centred price with a saving stays centred.
function priceBlock(ctx, dir, x, topY, saving, price, maxW, align = 'left') {
  const now = money(price)
  const { size, h } = priceHeight(ctx, dir, saving, price, maxW)
  const base = topY + size * TOP

  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `800 ${size}px ${dir.body}`
  const nowW = ctx.measureText(now).width

  const wasSize = Math.round(size * 0.40)
  const gapW = Math.round(dir._s * 20)
  let wasW = 0
  if (saving) {
    ctx.font = `400 ${wasSize}px ${dir.body}`
    wasW = ctx.measureText(money(saving.was)).width
  }
  const groupW = nowW + (saving ? gapW + wasW : 0)
  const left = align === 'center' ? x - groupW / 2 : align === 'right' ? x - groupW : x

  // Right-aligned, the old price reads better before the new one — otherwise
  // the small struck-through figure ends up jammed against the margin and the
  // price people are meant to read is not the one at the edge.
  const wasFirst = align === 'right'
  const nowX = wasFirst && saving ? left + wasW + gapW : left

  ctx.font = `800 ${size}px ${dir.body}`
  ctx.fillStyle = dir.accent
  ctx.fillText(now, nowX, base)

  if (saving) {
    const wx = wasFirst ? left : left + nowW + gapW
    const wy = base - size * 0.08
    ctx.font = `400 ${wasSize}px ${dir.body}`
    ctx.fillStyle = dir.ink2
    ctx.fillText(money(saving.was), wx, wy)
    ctx.strokeStyle = dir.ink2
    ctx.globalAlpha = 0.85
    ctx.lineWidth = Math.max(1.6, dir._s * 2.2)
    ctx.beginPath()
    ctx.moveTo(wx, wy - wasSize * 0.3)
    ctx.lineTo(wx + wasW, wy - wasSize * 0.3)
    ctx.stroke()
  }
  ctx.restore()
  return h
}

// The small uppercase line above a name. Takes a top edge like everything else.
function eyebrow(ctx, dir, x, topY, text, align = 'left', colour = null) {
  if (!text) return 0
  const size = Math.round(dir._s * 16)
  const t = String(text).toUpperCase()
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 ${size}px ${dir.body}`
  const tw = trackedWidth(ctx, t, 2.8)
  const left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x
  ctx.fillStyle = colour || dir.accent
  tracked(ctx, t, left, topY + size * TOP, 2.8)
  ctx.restore()
  return Math.round(size * 1.45)
}

// The product name. Returns the height it used so the next block can follow.
function nameBlock(ctx, dir, x, topY, maxW, text, size, maxLines = 2, align = 'left', colour = null, weight = 700) {
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${weight} ${size}px ${dir.display}`
  const lines = wrap(ctx, text, maxW, maxLines)
  ctx.fillStyle = colour || dir.ink
  const lh = size * 1.12
  lines.forEach((line, i) => {
    const lw = ctx.measureText(line).width
    const left = align === 'center' ? x - lw / 2 : align === 'right' ? x - lw : x
    ctx.fillText(line, left, topY + size * TOP + i * lh)
  })
  ctx.restore()
  return Math.round(lines.length * lh)
}

// The seller's signature. Small on purpose: the product is the hero here, and
// the shop is who it comes from.
function sellerLine(ctx, dir, x, y, logo, shopName, place, maxW) {
  if (!shopName) return 0
  const r = Math.round(dir._s * 21)
  let cx = x
  ctx.save()
  ctx.textBaseline = 'middle'
  if (logo) {
    ctx.save()
    ctx.beginPath(); ctx.arc(cx + r, y, r, 0, Math.PI * 2); ctx.clip()
    const s = Math.max((r * 2) / logo.width, (r * 2) / logo.height)
    ctx.drawImage(logo, cx + r - (logo.width * s) / 2, y - (logo.height * s) / 2, logo.width * s, logo.height * s)
    ctx.restore()
    ctx.strokeStyle = dir.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.arc(cx + r, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.globalAlpha = 1
    cx += r * 2 + Math.round(dir._s * 14)
  }
  const label = place ? `${shopName} · ${place}` : shopName
  const size = fit(ctx, label, maxW - (cx - x), Math.round(dir._s * 26), Math.round(dir._s * 15), 600, dir.body)
  ctx.font = `600 ${size}px ${dir.body}`
  ctx.fillStyle = dir.ink
  ctx.fillText(label, cx, y)
  ctx.restore()
  return r * 2
}

// Facts, as small pills. Each one is a statement the data supports.
function factRow(ctx, dir, x, y, maxW, facts) {
  const h = Math.round(dir._s * 38)
  let cx = x
  ctx.save()
  ctx.textBaseline = 'middle'
  for (const f of facts) {
    if (!f) continue
    ctx.font = `600 ${Math.round(dir._s * 17)}px ${dir.body}`
    const tw = ctx.measureText(f).width
    const bw = tw + Math.round(dir._s * 32)
    if (cx + bw > x + maxW) break
    ctx.fillStyle = dir.accentSoft
    rounded(ctx, cx, y, bw, h, h / 2); ctx.fill()
    ctx.fillStyle = dir.ink
    ctx.fillText(f, cx + Math.round(dir._s * 16), y + h / 2 + 1)
    cx += bw + Math.round(dir._s * 10)
  }
  ctx.restore()
  return h
}

// The seller's own lines, ticked. The tick is ornament; the words are theirs.
function pointList(ctx, dir, x, y, maxW, points, gap) {
  let cy = y
  ctx.save()
  ctx.textBaseline = 'middle'
  for (const p of points) {
    const size = Math.round(dir._s * 25)
    ctx.font = `500 ${size}px ${dir.body}`
    const lines = wrap(ctx, p, maxW - Math.round(dir._s * 42), 2)
    ctx.strokeStyle = dir.accent
    ctx.lineWidth = Math.max(1.8, dir._s * 2.6)
    ctx.lineCap = 'round'
    const ty = cy + size * 0.52
    ctx.beginPath()
    ctx.moveTo(x + dir._s * 3, ty)
    ctx.lineTo(x + dir._s * 11, ty + dir._s * 8)
    ctx.lineTo(x + dir._s * 25, ty - dir._s * 10)
    ctx.stroke()
    ctx.fillStyle = dir.ink2
    lines.forEach((line, i) => ctx.fillText(line, x + Math.round(dir._s * 42), cy + size * 0.55 + i * size * 1.32))
    cy += lines.length * size * 1.32 + gap
  }
  ctx.restore()
  return cy - y
}

// Where it comes from and how to get it. The QR is a real code of the real
// product link — point a phone at the poster and that page opens.
function buyFooter(ctx, dir, x, y, width, height, qr, link) {
  ctx.save()
  const g = ctx.createLinearGradient(x, y, x + width, y + height)
  g.addColorStop(0, '#2A2060'); g.addColorStop(1, '#4B3AA8')
  ctx.fillStyle = g
  ctx.fillRect(x, y, width, height)

  const cy = y + height / 2
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
  const lx = x + Math.round(width * 0.05)
  const mark = Math.round(dir._s * 32)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `700 ${mark}px ${dir.body}`
  ctx.fillText('ZaMarket', lx, cy - mark * 0.45)
  const mw = ctx.measureText('ZaMarket').width
  ctx.fillStyle = '#A892FF'
  ctx.beginPath(); ctx.arc(lx + mw + 11, cy - mark * 0.23, mark * 0.13, 0, Math.PI * 2); ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.80)'
  ctx.font = `500 ${Math.round(dir._s * 18)}px ${dir.body}`
  ctx.fillText('Order online · we call to confirm before any money moves', lx, cy + mark * 0.62)

  if (qr) {
    // Never smaller than the size a phone can actually read. On a short
    // format that means the card stands proud of the band, which reads as
    // deliberate and keeps the code usable.
    const q = Math.max(Math.round(height * 0.66), qrMinSize(width))
    const qx = x + width - q - Math.round(width * 0.05)
    // Centred on the band where it fits, but never past the edge of the
    // poster: a code with its bottom row cropped off does not scan, and the
    // crop is only a few pixels, so it looks perfectly fine while being
    // useless. On a short format the card simply rides up over the band.
    const bleed = Math.round(q * 0.07) + 4
    const qy = Math.min(cy - q / 2, y + height - q - bleed)
    qrPanel(ctx, qr, qx, qy, q)
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    ctx.font = `600 ${Math.round(dir._s * 15)}px ${dir.body}`
    ctx.textAlign = 'right'
    ctx.fillText('Scan to order', qx - Math.round(dir._s * 22), cy)
  } else if (link) {
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = `600 ${Math.round(dir._s * 18)}px ${dir.body}`
    ctx.fillText(String(link).replace(/^https?:\/\//, ''), x + width - Math.round(width * 0.05), cy)
  }
  ctx.restore()
}

// A product with no photograph still has to look deliberate rather than
// broken: its own initial, set large on the brand colour.
function placeholder(ctx, dir, x, y, w, h, label) {
  ctx.save()
  rounded(ctx, x, y, w, h, Math.round(dir._s * 20)); ctx.clip()
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  g.addColorStop(0, dir.accentSoft); g.addColorStop(1, dir.panel)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = dir.accent
  ctx.globalAlpha = 0.5
  const letter = String(label || '?').trim().charAt(0).toUpperCase() || '?'
  ctx.font = `800 ${Math.round(Math.min(w, h) * 0.46)}px ${dir.display}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(letter, x + w / 2, y + h / 2)
  ctx.restore()
}

// --- layouts --------------------------------------------------------------
// 1. Full-bleed hero. The photograph is the poster, the words sit over it.
//
// This one stacks UPWARDS from the bottom edge, because the price must not be
// pushed off by a long name. Every block is measured before it is placed.
function drawHero({ ctx, w, h, pad, dir, name, price, saving, hero, logo, qr,
  link, shopName, place, fulfilment, deliveryLine, category, wide }) {
  const footerH = Math.round(h * (wide ? 0.19 : 0.13))
  const imgH = h - footerH
  const maxW = w - pad * 2

  if (hero) cover(ctx, hero, 0, 0, w, imgH, 0.38)
  else placeholder(ctx, dir, 0, 0, w, imgH, name)

  vignette(ctx, w, imgH, dir.vignette)
  scrim(ctx, 0, imgH * 0.30, w, imgH * 0.70, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.90)')

  // Category first, top-left, so there is context before the eye finds the price.
  if (category) {
    ctx.save()
    ctx.font = `700 ${Math.round(dir._s * 17)}px ${dir.body}`
    const t = category.toUpperCase()
    const tw = trackedWidth(ctx, t, 2.6)
    const bh = Math.round(dir._s * 42)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    rounded(ctx, pad, pad, tw + Math.round(dir._s * 36), bh, bh / 2); ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.textBaseline = 'middle'
    tracked(ctx, t, pad + Math.round(dir._s * 18), pad + bh / 2 + 1, 2.6)
    ctx.restore()
  }

  // Everything over the photograph is white, whatever the direction's ink is.
  const over = { ...dir, ink: '#FFFFFF', ink2: 'rgba(255,255,255,0.78)', accent: '#FFFFFF' }
  let bottom = imgH - pad

  const facts = [fulfilment, deliveryLine].filter(Boolean)
  if (facts.length) {
    const fh = Math.round(dir._s * 38)
    bottom -= fh
    ctx.save()
    ctx.textBaseline = 'middle'
    let cx = pad
    for (const f of facts) {
      ctx.font = `600 ${Math.round(dir._s * 17)}px ${dir.body}`
      const bw = ctx.measureText(f).width + Math.round(dir._s * 32)
      if (cx + bw > w - pad) break
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      rounded(ctx, cx, bottom, bw, fh, fh / 2); ctx.fill()
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(f, cx + Math.round(dir._s * 16), bottom + fh / 2 + 1)
      cx += bw + Math.round(dir._s * 10)
    }
    ctx.restore()
    bottom -= Math.round(dir._s * 24)
  }

  const { h: priceH } = priceHeight(ctx, dir, saving, price, maxW)
  bottom -= priceH
  priceBlock(ctx, over, pad, bottom, saving, price, maxW)
  bottom -= Math.round(dir._s * 16)

  const nSize = Math.round(dir._s * (wide ? 46 : 58))
  ctx.font = `700 ${nSize}px ${dir.display}`
  const nLines = wrap(ctx, name, maxW, 2).length
  const nameH = Math.round(nLines * nSize * 1.12)
  bottom -= nameH
  nameBlock(ctx, over, pad, bottom, maxW, name, nSize, 2, 'left', '#FFFFFF')
  bottom -= Math.round(dir._s * 24)

  if (shopName) {
    const sh = Math.round(dir._s * 42)
    bottom -= sh
    sellerLine(ctx, over, pad, bottom + sh / 2, logo, shopName, place, maxW)
  }

  buyFooter(ctx, dir, 0, imgH, w, footerH, qr, link)
}

// 2. Editorial. Photograph above, typeset block below. The one design that
//    still works with no photograph at all, so it is the fallback.
function drawEditorial({ ctx, w, h, pad, dir, name, price, saving, points, hero,
  logo, qr, link, shopName, place, fulfilment, deliveryLine, category, wide }) {
  const footerH = Math.round(h * (wide ? 0.2 : 0.125))
  const body = h - footerH
  const maxW = w - pad * 2
  const imgH = Math.round((body - pad) * (wide ? 0.5 : 0.46))

  if (hero) coverRounded(ctx, hero, pad, pad, maxW, imgH, Math.round(dir._s * 20), 0.42)
  else placeholder(ctx, dir, pad, pad, maxW, imgH, name)

  let y = pad + imgH + Math.round(dir._s * 40)
  y += eyebrow(ctx, dir, pad, y, category)
  y += Math.round(dir._s * 6)

  const nSize = Math.round(dir._s * (wide ? 40 : 50))
  y += nameBlock(ctx, dir, pad, y, maxW, name, nSize, 2)
  y += Math.round(dir._s * 24)

  divider(ctx, dir, pad + maxW / 2, y, maxW)
  y += Math.round(dir._s * 32)

  y += priceBlock(ctx, dir, pad, y, saving, price, maxW)
  y += Math.round(dir._s * 26)

  // Only as many of the seller's lines as actually fit above the footer.
  const reserved = Math.round(dir._s * (wide ? 96 : 116))
  if (points.length) {
    const room = body - reserved - y
    const perLine = Math.round(dir._s * 25 * 1.32 + dir._s * 14)
    const fits = Math.max(0, Math.min(points.length, Math.floor(room / perLine)))
    if (fits > 0) y += pointList(ctx, dir, pad, y, maxW, points.slice(0, fits), Math.round(dir._s * 12))
  }

  const facts = [fulfilment, deliveryLine].filter(Boolean)
  if (facts.length && y + dir._s * 44 < body - reserved + dir._s * 30) {
    factRow(ctx, dir, pad, y, maxW, facts)
  }

  sellerLine(ctx, dir, pad, body - Math.round(dir._s * 34), logo, shopName, place, maxW)
  buyFooter(ctx, dir, 0, body, w, footerH, qr, link)
}

// 3. What you get. The photograph with the seller's own benefit lines given
//    real room — this is the design for a seller who has written something.
function drawDetail({ ctx, w, h, pad, dir, name, price, saving, points, hero,
  logo, qr, link, shopName, place, fulfilment, deliveryLine, category, wide }) {
  const footerH = Math.round(h * (wide ? 0.2 : 0.125))
  const body = h - footerH

  if (wide) {
    const colW = Math.round(w * 0.44)
    if (hero) cover(ctx, hero, 0, 0, colW, body, 0.42)
    else placeholder(ctx, dir, 0, 0, colW, body, name)
    scrim(ctx, colW - Math.round(dir._s * 70), 0, Math.round(dir._s * 70), body, 'rgba(0,0,0,0)', dir.ground, 'across')

    const x = colW + Math.round(dir._s * 46)
    const maxW = w - x - pad
    let y = pad
    y += eyebrow(ctx, dir, x, y, category)
    y += Math.round(dir._s * 4)
    y += nameBlock(ctx, dir, x, y, maxW, name, Math.round(dir._s * 38), 2)
    y += Math.round(dir._s * 18)
    y += priceBlock(ctx, dir, x, y, saving, price, maxW)
    y += Math.round(dir._s * 22)

    // A landscape poster is short. Only draw the benefit lines that actually
    // fit above the bottom band, rather than running them under it.
    const facts = [fulfilment, deliveryLine].filter(Boolean)
    const band = Math.round(dir._s * (facts.length ? 124 : 70))
    if (points.length) {
      const perLine = Math.round(dir._s * 25 * 1.32 + dir._s * 10)
      const fits = Math.max(0, Math.min(points.length, Math.floor((body - band - y) / perLine)))
      if (fits > 0) pointList(ctx, dir, x, y, maxW, points.slice(0, fits), Math.round(dir._s * 10))
    }

    if (facts.length) factRow(ctx, dir, x, body - band + Math.round(dir._s * 14), maxW, facts)
    sellerLine(ctx, dir, x, body - Math.round(dir._s * 36), logo, shopName, place, maxW)
    buyFooter(ctx, dir, 0, body, w, footerH, qr, link)
    return
  }

  const maxW = w - pad * 2
  const imgH = Math.round(body * 0.36)
  if (hero) cover(ctx, hero, 0, 0, w, imgH, 0.38)
  else placeholder(ctx, dir, 0, 0, w, imgH, name)
  scrim(ctx, 0, imgH - Math.round(dir._s * 190), w, Math.round(dir._s * 190), 'rgba(0,0,0,0)', dir.ground)

  let y = imgH + Math.round(dir._s * 10)
  y += eyebrow(ctx, dir, pad, y, category)
  y += Math.round(dir._s * 6)
  y += nameBlock(ctx, dir, pad, y, maxW, name, Math.round(dir._s * 48), 2)
  y += Math.round(dir._s * 20)
  y += priceBlock(ctx, dir, pad, y, saving, price, maxW)
  y += Math.round(dir._s * 30)

  // The panel takes whatever is left between the price and the footer.
  const bottomStuff = Math.round(dir._s * 120)
  const panelTop = y
  const panelH = body - bottomStuff - panelTop
  if (panelH > dir._s * 120) {
    ctx.save()
    ctx.fillStyle = dir.panel
    rounded(ctx, pad, panelTop, maxW, panelH, Math.round(dir._s * 18)); ctx.fill()
    ctx.restore()

    const inset = Math.round(dir._s * 28)
    let py = panelTop + inset
    py += eyebrow(ctx, dir, pad + inset, py, 'What you get')
    py += Math.round(dir._s * 10)
    pointList(ctx, dir, pad + inset, py, maxW - inset * 2, points.slice(0, 4), Math.round(dir._s * 14))
  }

  const facts = [fulfilment, deliveryLine].filter(Boolean)
  if (facts.length) factRow(ctx, dir, pad, body - Math.round(dir._s * 110), maxW, facts)
  sellerLine(ctx, dir, pad, body - Math.round(dir._s * 32), logo, shopName, place, maxW)
  buyFooter(ctx, dir, 0, body, w, footerH, qr, link)
}

// 4. Several angles. One large photograph of the item and the rest beside it.
//    Only offered when the seller has photographed the thing more than once.
function drawGallery({ ctx, w, h, pad, dir, name, price, saving, shots, logo, qr,
  link, shopName, place, fulfilment, deliveryLine, category, wide }) {
  const footerH = Math.round(h * (wide ? 0.2 : 0.125))
  const body = h - footerH
  const maxW = w - pad * 2
  const r = Math.round(dir._s * 16)
  const gap = Math.round(dir._s * 12)

  const textH = Math.round(dir._s * (wide ? 230 : 300))
  const gridH = body - textH - pad

  const extras = shots.slice(1, wide ? 3 : 4)
  if (extras.length) {
    const sideW = Math.round(maxW * (wide ? 0.26 : 0.3))
    const bigW = maxW - sideW - gap
    coverRounded(ctx, shots[0], pad, pad, bigW, gridH, r, 0.42)
    const cellH = Math.round((gridH - gap * (extras.length - 1)) / extras.length)
    extras.forEach((img, i) => {
      coverRounded(ctx, img, pad + bigW + gap, pad + i * (cellH + gap), sideW, cellH, r, 0.42)
    })
  } else {
    coverRounded(ctx, shots[0], pad, pad, maxW, gridH, r, 0.42)
  }

  let y = pad + gridH + Math.round(dir._s * 36)

  // The price sits on the right of the name block, so the two read as one line.
  const priceW = Math.round(maxW * 0.40)
  const nameW = maxW - priceW - Math.round(dir._s * 20)
  y += eyebrow(ctx, dir, pad, y, category)
  y += Math.round(dir._s * 4)

  const nSize = Math.round(dir._s * (wide ? 36 : 44))
  const nameH = nameBlock(ctx, dir, pad, y, nameW, name, nSize, 2)
  priceBlock(ctx, dir, w - pad, y, saving, price, priceW, 'right')
  y += Math.max(nameH, Math.round(dir._s * 54)) + Math.round(dir._s * 22)

  const facts = [fulfilment, deliveryLine].filter(Boolean)
  if (facts.length) factRow(ctx, dir, pad, y, maxW, facts)

  sellerLine(ctx, dir, pad, body - Math.round(dir._s * 30), logo, shopName, place, maxW)
  buyFooter(ctx, dir, 0, body, w, footerH, qr, link)
}

// 5. Quiet and expensive. Space is the whole idea; resist filling it.
function drawStatement({ ctx, w, h, pad, dir, name, price, saving, hero, logo, qr,
  link, shopName, place, fulfilment, category, wide }) {
  const footerH = Math.round(h * (wide ? 0.19 : 0.11))
  const body = h - footerH
  const margin = Math.round(w * (wide ? 0.09 : 0.13))

  ctx.fillStyle = dir.ground
  ctx.fillRect(0, 0, w, body)

  // A hairline frame well inside the edge. Nothing else here is decorative.
  ctx.save()
  ctx.strokeStyle = dir.accent
  ctx.globalAlpha = 0.26
  ctx.lineWidth = 1
  ctx.strokeRect(margin * 0.45, margin * 0.45, w - margin * 0.9, body - margin * 0.9)
  ctx.restore()

  const imgW = w - margin * 2
  const imgH = Math.round(body * (wide ? 0.46 : 0.42))
  const imgY = Math.round(body * (wide ? 0.10 : 0.12))
  if (hero) coverRounded(ctx, hero, margin, imgY, imgW, imgH, Math.round(dir._s * 4), 0.42)
  else placeholder(ctx, dir, margin, imgY, imgW, imgH, name)

  const cx = w / 2
  let y = imgY + imgH + Math.round(dir._s * 44)

  y += eyebrow(ctx, dir, cx, y, category, 'center', dir.ink2)
  y += Math.round(dir._s * 8)

  // Lighter weight than the other layouts: the point is restraint.
  y += nameBlock(ctx, dir, cx, y, imgW, name, Math.round(dir._s * (wide ? 34 : 42)), 2, 'center', dir.ink, 400)
  y += Math.round(dir._s * 26)

  divider(ctx, dir, cx, y, Math.round(dir._s * 150))
  y += Math.round(dir._s * 30)

  y += priceBlock(ctx, dir, cx, y, saving, price, imgW, 'center')
  y += Math.round(dir._s * 18)

  if (fulfilment && y + dir._s * 30 < body - dir._s * 70) {
    ctx.save()
    ctx.font = `500 ${Math.round(dir._s * 19)}px ${dir.body}`
    ctx.fillStyle = dir.ink2
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(fulfilment, cx, y)
    ctx.restore()
  }

  // Centre the signature by measuring it first.
  if (shopName) {
    ctx.save()
    ctx.font = `600 ${Math.round(dir._s * 20)}px ${dir.body}`
    const label = place ? `${shopName} · ${place}` : shopName
    const lw = ctx.measureText(label).width + (logo ? dir._s * 56 : 0)
    ctx.restore()
    sellerLine(ctx, dir, Math.max(margin, cx - lw / 2), body - Math.round(dir._s * 44), logo, shopName, place, imgW)
  }

  buyFooter(ctx, dir, 0, body, w, footerH, qr, link)
}

// --- the caption that goes with it ---------------------------------------
//
// Same rule as the poster: only what is true. The caption is what most people
// actually read, so an invented line here does more damage than one on the
// picture.
export function productCaption({ product, store = null, settings = {}, link }) {
  const name = tidy(product?.name) || 'This item'
  const saving = savingOf(product)
  // No length limit here. A caption is read, not laid out, so the seller's
  // sentences go in whole — cutting them with "…" was leaving people halfway
  // through a thought with nothing to act on.
  const points = sellingPoints(product, 4)
  const shop = tidy(store?.business_name)
  const place = tidy(String(store?.town || store?.location || '').split(',')[0])

  const out = []
  out.push(`${name} — ${money(n(product?.price))}`)
  if (saving) out.push(`Was ${money(saving.was)}. You save ${money(saving.off)}.`)

  if (points.length) {
    out.push('')
    // Each line is a complete statement and gets a full stop, so the caption
    // reads as sentences rather than as fragments trailing off.
    for (const p of points) out.push(`• ${/[.!?]$/.test(p) ? p : `${p}.`}`)
  }

  const facts = [fulfilmentOf(product)]
  if (String(settings?.delivery_included) === 'true') facts.push('Delivery included')
  if (shop) facts.push(place ? `From ${shop}, ${place}` : `From ${shop}`)
  out.push('')
  out.push(`${facts.join(' · ')}.`)
  out.push('We call to confirm before any money moves.')

  // The link goes last and always, on its own line, with a plain instruction
  // in front of it. Most people here will never scan the QR code on the
  // poster — they tap a link. A caption without one wastes the post.
  if (link) {
    out.push('')
    out.push(`Order here: ${link}`)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
