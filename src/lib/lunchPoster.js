import { load, rounded, coverRounded, wrap, qrImage, qrPanel, qrMinSize, brandLockup } from './posterKit'
import { money } from './format'
import { packagePrice, workingWeeks, dayLabel } from './lunch'

// The weekly lunch, shared as what it is: an OFFER, not a single product.
// One poster says: homemade lunch for the week, these are the dishes, pick
// the package or your own days, this is the price, order here.
//
// Nothing is invented. A price is shown only when the menu gives one; a
// saving only when the plan has a real package discount; the week's menu is
// the real upcoming menu.

export const LUNCH_FORMATS = {
  story: { key: 'story', label: 'WhatsApp status', w: 1080, h: 1920 },
  portrait: { key: 'portrait', label: 'Facebook / Instagram post', w: 1080, h: 1350 },
}

const C = {
  bg1: '#1d1036', bg2: '#2f1763', panel: 'rgba(255,255,255,0.07)', line: 'rgba(255,255,255,0.14)',
  ink: '#FFFFFF', ink2: 'rgba(255,255,255,0.74)', accent: '#B98CFF', gold: '#FFD166',
}
const SANS = '"Plus Jakarta Sans", system-ui, sans-serif'
const SERIF = '"Fraunces", Georgia, serif'

// What the poster says, worked out from the plan and its real menu.
export function lunchOfferFacts({ deal, menu, from }) {
  const weeks = workingWeeks(menu, 3)
  // The first full week that can still be booked (late in the week, next week).
  const wi = Math.max(0, weeks.findIndex((w) => w.open === 5))
  const first = weeks[wi]
  const week = first ? first.days.filter((d) => d.open && d.day).map((d) => ({ label: dayLabel(d.date).split(' ')[0], dish: d.day.dishes.find((x) => !x.soldOut) || d.day.dishes[0] })) : []
  const pkgs = []
  if (weeks.length) {
    for (const [id, title] of [['week', 'Full week'], ['monthu', 'Mon – Thu'], ['two', 'Two weeks']]) {
      const p = packagePrice(weeks, wi, id, menu, deal)
      if (p.dates.length && p.total > 0) pkgs.push({ id, title, total: p.total, saving: p.discount > 0 ? p.discount : 0, days: p.dates.length })
    }
  }
  const photos = [...new Set([...(menu || []).flatMap((d) => d.dishes.map((x) => x.images?.[0])), deal.cover_url].filter(Boolean))]
  const windows = deal.delivery_windows || []
  return {
    week, pkgs, photos, from,
    next: !!first && first.start > new Date().toISOString().slice(0, 10),
    cutoff: deal.cutoff_hour || 18,
    window: windows.length ? `${windows[0].split('–')[0]}–${windows[windows.length - 1].split('–')[1]}` : '',
  }
}

function pill(ctx, text, x, y, size, fill, ink) {
  ctx.font = `800 ${size}px ${SANS}`
  const w = ctx.measureText(text).width + size * 1.3
  const h = size * 1.9
  ctx.fillStyle = fill; rounded(ctx, x, y, w, h, h / 2); ctx.fill()
  ctx.fillStyle = ink; ctx.textBaseline = 'middle'; ctx.fillText(text, x + size * 0.65, y + h / 2 + 1)
  ctx.textBaseline = 'alphabetic'
  return w
}

export async function renderLunchPoster({ deal, vendorName, menu, from, link, format = 'portrait' }) {
  const fmt = LUNCH_FORMATS[format] || LUNCH_FORMATS.portrait
  const { w, h } = fmt
  const f = lunchOfferFacts({ deal, menu, from })
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* fonts are optional */ } }
  const imgs = (await Promise.all(f.photos.slice(0, 4).map(load))).filter(Boolean)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  const tall = h / w > 1.5
  const pad = 64

  // Ground
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h)
  g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg2)
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  const glow = ctx.createRadialGradient(w * 0.85, h * 0.08, 10, w * 0.85, h * 0.08, w * 0.7)
  glow.addColorStop(0, 'rgba(185,140,255,0.35)'); glow.addColorStop(1, 'rgba(185,140,255,0)')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h)

  // Measure first, so everything fits: the photos take what is left, and
  // menu rows are dropped before the photos get too small.
  const lh = tall ? 88 : 72
  ctx.font = `700 ${tall ? 78 : 64}px ${SERIF}`
  const lines = wrap(ctx, 'Your lunch, sorted for the week.', w - pad * 2, 2)
  const topY = tall ? 90 : 50
  const topH = (tall ? 110 : 80)
  const headH = lh * lines.length + 10
  ctx.font = `600 ${tall ? 32 : 28}px ${SANS}`
  const by = `Homemade${vendorName ? ` by ${vendorName}` : ''} · delivered to your office or door`
  const byLines = wrap(ctx, by, w - pad * 2, 2)
  const byH = 34 + byLines.length * 40 + (tall ? 40 : 22)
  const pk = f.pkgs.slice(0, 3)
  const chH = tall ? 150 : 140
  const pkgH = pk.length ? chH + 22 + 48 : (f.from > 0 ? 80 : 0)
  const qrS = Math.max(qrMinSize(w), tall ? 230 : 190)
  const bandH = qrS + 60
  const bottom = tall ? 70 : 36
  const rh = tall ? 74 : 60
  const menuH = (n) => (n ? n * rh + 74 + (tall ? 36 : 22) : 0)
  const minPh = tall ? 420 : 300
  let rowsN = Math.min(f.week.length, tall ? 5 : 3)
  const fixed = topY + topH + headH + byH + pkgH + bandH + bottom + (tall ? 50 : 26)
  let ph = h - fixed - menuH(rowsN)
  while (ph < minPh && rowsN > 0) { rowsN -= 1; ph = h - fixed - menuH(rowsN) }
  // One lonely menu line looks thin: give the space to the photos instead.
  if (rowsN === 1 && f.week.length > 1) { rowsN = 0; ph = h - fixed }
  ph = Math.min(ph, tall ? 760 : 520)

  // Top bar
  let y = topY
  brandLockup(ctx, pad, y, tall ? 54 : 48, '#FFFFFF', 'ZaMarket', '')
  ctx.font = `800 26px ${SANS}`
  const tag = 'WEEKLY LUNCH OFFER'
  const tw = ctx.measureText(tag).width + 34
  pill(ctx, tag, w - pad - tw, y + 2, 26, C.gold, '#2a1500')
  y += topH

  // Dish photos
  if (imgs.length && ph > 120) {
    const gap = 14
    const n = Math.min(imgs.length, 4)
    const W2 = w - pad * 2
    const cells = n === 1 ? [[0, 0, 1, 1]] : n === 2 ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] : n === 3 ? [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]] : [[0, 0, 0.6, 1], [0.6, 0, 0.4, 1 / 3], [0.6, 1 / 3, 0.4, 1 / 3], [0.6, 2 / 3, 0.4, 1 / 3]]
    cells.forEach(([cx, cy, cw, chh], i) => {
      const x = pad + cx * W2 + (cx ? gap / 2 : 0); const yy = y + cy * ph + (cy ? gap / 2 : 0)
      const ww = cw * W2 - (cw < 1 ? gap / 2 : 0); const hh = chh * ph - (chh < 1 ? gap / 2 : 0)
      coverRounded(ctx, imgs[i], x, yy, ww, hh, 26)
    })
    y += ph + (tall ? 50 : 26)
  }

  // Headline
  ctx.fillStyle = C.ink
  ctx.font = `700 ${tall ? 78 : 64}px ${SERIF}`
  lines.forEach((l, i) => ctx.fillText(l, pad, y + lh * (i + 0.8)))
  y += lh * lines.length + 10
  ctx.font = `600 ${tall ? 32 : 28}px ${SANS}`
  ctx.fillStyle = C.ink2
  byLines.forEach((l, i) => ctx.fillText(l, pad, y + 34 + i * 40))
  y += byH

  // This week's menu
  const rows = f.week.slice(0, rowsN)
  if (rows.length) {
    const boxH = rows.length * rh + 74
    ctx.fillStyle = C.panel; rounded(ctx, pad, y, w - pad * 2, boxH, 28); ctx.fill()
    ctx.font = `800 24px ${SANS}`; ctx.fillStyle = C.accent
    ctx.fillText(f.next ? 'NEXT WEEK’S MENU' : 'THIS WEEK’S MENU', pad + 30, y + 46)
    const dishImgs = await Promise.all(rows.map((r) => (r.dish?.images?.[0] ? load(r.dish.images[0]) : null)))
    rows.forEach((r, i) => {
      const ry = y + 66 + i * rh
      const s = rh - 18
      if (dishImgs[i]) { ctx.save(); ctx.beginPath(); ctx.arc(pad + 30 + s / 2, ry + s / 2 + 4, s / 2, 0, Math.PI * 2); ctx.clip(); coverRounded(ctx, dishImgs[i], pad + 30, ry + 4, s, s, 0); ctx.restore() }
      const tx = pad + 30 + s + 20
      ctx.font = `800 ${tall ? 30 : 26}px ${SANS}`; ctx.fillStyle = C.gold
      ctx.fillText(r.label, tx, ry + s / 2 + 14)
      ctx.font = `600 ${tall ? 30 : 26}px ${SANS}`; ctx.fillStyle = C.ink
      const name = wrap(ctx, r.dish?.name || '', w - pad * 2 - (tx - pad) - 110, 1)[0] || ''
      ctx.fillText(name, tx + 86, ry + s / 2 + 14)
    })
    y += boxH + (tall ? 36 : 22)
  }

  // Packages: pick a package or your own days
  if (pk.length) {
    const gap = 14
    const cw = (w - pad * 2 - gap * (pk.length - 1)) / pk.length
    pk.forEach((p, i) => {
      const x = pad + i * (cw + gap)
      ctx.fillStyle = i === 0 ? 'rgba(255,209,102,0.16)' : C.panel
      rounded(ctx, x, y, cw, chH, 24); ctx.fill()
      ctx.strokeStyle = i === 0 ? C.gold : C.line; ctx.lineWidth = 2; rounded(ctx, x, y, cw, chH, 24); ctx.stroke()
      ctx.font = `700 ${tall ? 26 : 23}px ${SANS}`; ctx.fillStyle = C.ink2
      ctx.fillText(p.title, x + 22, y + 44)
      ctx.font = `800 ${tall ? 44 : 38}px ${SANS}`; ctx.fillStyle = C.ink
      ctx.fillText(money(p.total, { whole: true }), x + 22, y + (tall ? 100 : 92))
      ctx.font = `700 ${tall ? 22 : 20}px ${SANS}`; ctx.fillStyle = p.saving ? C.gold : C.ink2
      ctx.fillText(p.saving ? `Save ${money(p.saving, { whole: true })}` : `${p.days} lunch${p.days === 1 ? '' : 'es'}`, x + 22, y + chH - 18)
    })
    y += chH + 22
    ctx.font = `600 ${tall ? 28 : 24}px ${SANS}`; ctx.fillStyle = C.ink2
    ctx.fillText('Or choose your own days.', pad, y + 24)
    y += 48
  } else if (f.from > 0) {
    ctx.font = `800 ${tall ? 54 : 46}px ${SANS}`; ctx.fillStyle = C.gold
    ctx.fillText(`From ${money(f.from, { whole: true })} a lunch`, pad, y + 50)
    y += 80
  }

  // Order band with QR
  const by2 = h - bandH - bottom
  ctx.fillStyle = '#FFFFFF'; rounded(ctx, pad, by2, w - pad * 2, bandH, 30); ctx.fill()
  const qr = await qrImage(link, '#1d1036', '#FFFFFF')
  if (qr) qrPanel(ctx, qr, w - pad - 30 - qrS, by2 + 30, qrS, 12)
  const tx = pad + 36; const tmax = w - pad * 2 - qrS - 100
  ctx.fillStyle = '#1d1036'
  ctx.font = `800 ${tall ? 46 : 40}px ${SANS}`
  wrap(ctx, 'Order your weekly lunch', tmax, 2).forEach((l, i) => ctx.fillText(l, tx, by2 + 70 + i * 50))
  ctx.font = `600 ${tall ? 26 : 23}px ${SANS}`; ctx.fillStyle = '#4b3a6b'
  const small = [`Order by ${f.cutoff}:00 the day before`, f.window ? `Delivered ${f.window}` : '', 'Scan or tap the link'].filter(Boolean)
  small.forEach((l, i) => ctx.fillText(l, tx, by2 + bandH - 30 - (small.length - 1 - i) * 34))

  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.92))
}
