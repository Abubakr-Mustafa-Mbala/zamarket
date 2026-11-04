import QRCode from 'qrcode'

// ---------------------------------------------------------------------------
// Poster kit — the shared drawing language.
//
// Store posters and product posters are different jobs: a shop post answers
// "what is this business and why would I look?", a product post argues one
// thing — this item, this price, buy it. But they are the same marketplace,
// and a seller who shares both should not look like two different businesses.
//
// So the art direction, the type pairings, the photographic treatment, the
// ornament and the QR code all live here, once, and both posters are built on
// top of them. Change a palette here and both follow.
//
// The rule that governs everything in this file: nothing is invented. These
// helpers draw what the seller actually entered. There is no helper that makes
// up a review, a discount, a stock count or a guarantee, because there must
// never be one.
// ---------------------------------------------------------------------------

// Every size a seller actually posts at. 1080 wide is what the phone apps
// want; anything larger is thrown away on upload.
export const FORMATS = {
  story:     { key: 'story',     label: 'WhatsApp status',  w: 1080, h: 1920 },
  portrait:  { key: 'portrait',  label: 'Instagram post',   w: 1080, h: 1350 },
  square:    { key: 'square',    label: 'Square post',      w: 1080, h: 1080 },
  landscape: { key: 'landscape', label: 'Link preview',     w: 1200, h: 630 },
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

export { DIRECTIONS }

// Pick the art direction from whatever words describe the thing. The caller
// decides what to feed in: a shop feeds its category and its products, a
// product feeds its own category, name and its shop's trade.
export function directionFrom(...parts) {
  const hay = parts.flat().filter(Boolean).join(' ')
  for (const [key, d] of Object.entries(DIRECTIONS)) {
    if (key !== 'default' && d.match.test(hay)) return { ...d, key }
  }
  return { ...DIRECTIONS.default, key: 'default' }
}

// --- canvas helpers ------------------------------------------------------

export const load = (src) => new Promise((res) => {
  if (!src) return res(null)
  const i = new Image()
  i.crossOrigin = 'anonymous'
  i.onload = () => res(i.naturalWidth > 0 ? i : null)
  i.onerror = () => res(null)
  i.src = src
})

export function rounded(ctx, x, y, w, h, r) {
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
export function cover(ctx, img, x, y, w, h, bias = 0.42) {
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

export function coverRounded(ctx, img, x, y, w, h, r, bias = 0.42) {
  ctx.save()
  rounded(ctx, x, y, w, h, r); ctx.clip()
  const ok = cover(ctx, img, x, y, w, h, bias)
  ctx.restore()
  return ok
}

// Shrink the text until it fits, rather than letting it run off the edge.
export function fit(ctx, text, maxW, start, min, weight, family) {
  let size = start
  for (;;) {
    ctx.font = `${weight} ${size}px ${family}`
    if (ctx.measureText(text).width <= maxW || size <= min) break
    size -= 2
  }
  return size
}

export function wrap(ctx, text, maxW, maxLines) {
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
export function tracked(ctx, text, x, y, spacing) {
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

export function trackedWidth(ctx, text, spacing) {
  let w = 0
  for (const ch of String(text)) w += ctx.measureText(ch).width + spacing
  return Math.max(0, w - spacing)
}

// A photograph taken on a phone indoors is usually a little dark and a little
// flat. A gentle lift helps; anything stronger starts lying about the product.
export function enhance(canvas) {
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

export function grain(ctx, w, h, amount = 0.028) {
  const n = Math.round((w * h) / 900)
  ctx.save()
  ctx.globalAlpha = amount
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < n; i++) {
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1)
  }
  ctx.restore()
}

export function vignette(ctx, w, h, strength) {
  const g = ctx.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.78)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,0,${strength})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

export function scrim(ctx, x, y, w, h, from, to, dir = 'down') {
  const g = dir === 'down'
    ? ctx.createLinearGradient(x, y, x, y + h)
    : ctx.createLinearGradient(x, y, x + w, y)
  g.addColorStop(0, from); g.addColorStop(1, to)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
}

export function divider(ctx, dir, cx, y, width) {
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

const CATEGORY_GLYPH = {
  food: '◍', cake: '◍', dessert: '❖', savour: '❂', meal: '⬙', drink: '◉',
  cloth: '✦', shirt: '✦', shoe: '◆', dress: '✦',
  phone: '▣', electronic: '▣', accessor: '◈',
  hair: '✺', beauty: '✺', nail: '✦',
  service: '◎', repair: '◎', course: '✎', class: '✎',
}
export const glyphFor = (label) => {
  const l = String(label || '').toLowerCase()
  for (const [k, g] of Object.entries(CATEGORY_GLYPH)) if (l.includes(k)) return g
  return '◆'
}

// A real, scannable QR code of the real link. Never decorative, never a
// placeholder pattern: someone will point a phone at it, and it has to open
// the page it claims to open.
export async function qrImage(link, dark, light) {
  try {
    // Rendered large so that scaling it down to the poster keeps the module
    // edges hard. A product URL is long, which makes a dense code, and a dense
    // code drawn small is a picture of a QR code rather than a QR code.
    const url = await QRCode.toDataURL(String(link || ''), {
      margin: 1, width: 960, errorCorrectionLevel: 'M', color: { dark, light },
    })
    return await load(url)
  } catch { return null }
}

// The smallest a code may be drawn and still read off a phone screen.
//
// This is not a style value. A long product link produces roughly a 45×45
// module code; below about three pixels per module the modules blur into each
// other, JPEG finishes the job, and the camera gets nothing. Tested by
// decoding the finished posters, not by eye — a QR code that looks right and
// does not scan is worse than no QR code, because nobody finds out until a
// customer is standing there with a phone.
export const qrMinSize = (posterW) => Math.round(posterW * 0.185)

// Draw the code on its white card.
//
// Smoothing stays ON, deliberately. The instinct is to turn it off to keep the
// modules crisp, and that is right when scaling a code UP — but here a large
// source is being scaled DOWN, and nearest-neighbour downsampling drops whole
// module rows on the floor. Averaging keeps every module represented. This was
// measured: smoothing off took the portrait posters from scanning to not
// scanning.
export function qrPanel(ctx, qr, x, y, size, radius = 10) {
  const bleed = Math.round(size * 0.07)
  ctx.save()
  ctx.fillStyle = '#FFFFFF'
  rounded(ctx, x - bleed, y - bleed, size + bleed * 2, size + bleed * 2, radius)
  ctx.fill()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(qr, x, y, size, size)
  ctx.restore()
}
