import { load, qrImage } from './posterKit'
import { money } from './format'
import { vehicleOf, vehicleTitle, priceNote, standoutFeatures, km } from './vehicle'

// Short vertical videos made from what is already on the site: a listing's
// own photos, its name, price and real details, ending on the link and a QR
// code. Made for TikTok, Reels, Facebook and WhatsApp status, faceless.
// Every word on screen comes from the listing; nothing is invented.

export const W = 1080
export const H = 1920

// The story of a listing, as slides: [{ photo, kicker, line, sub }].
export function videoScript(item, kind = 'product', link = '') {
  if (!item) return { slides: [], voice: '', caption: '' }
  const photos = (item.images || []).filter(Boolean)
  const slides = []
  if (kind === 'vehicle') {
    const v = vehicleOf(item)
    const title = vehicleTitle(v, item.name)
    const note = priceNote(v)
    const price = Number(item.price) > 0 ? money(item.price, { whole: true }) : ''
    const facts = [v.year, v.mileage_km && km(v.mileage_km), v.transmission, v.fuel].filter(Boolean)
    const feats = standoutFeatures(v, 4)
    slides.push({ kicker: 'For sale on ZaMarket Motors', line: title, sub: [price, note].filter(Boolean).join(' · ') })
    if (facts.length) slides.push({ kicker: 'The basics', line: facts.join(' · '), sub: v.location ? `In ${v.location}` : '' })
    feats.forEach((f, i) => slides.push({ kicker: i === 0 ? 'Highlights' : '', line: f, sub: '' }))
    const voice = [
      `${title}${v.location ? `, in ${v.location}` : ''}.`,
      price ? `Asking ${price}${note ? `, ${note.toLowerCase()}` : ''}.` : '',
      facts.length ? `${facts.join(', ')}.` : '',
      feats.length ? `It comes with ${feats.slice(0, 3).join(', ')}.` : '',
      'Photos, details and enquiries on zamarket dot shop. Link in the description.',
    ].filter(Boolean).join(' ')
    return finish(slides, photos, voice, captionFor(title, price, note, feats, link, ['#ZaMarketMotors', '#CarsForSaleZambia', '#Lusaka']))
  }
  if (kind === 'lunch') {
    const dishes = item.dishList || []
    slides.push({ kicker: item.vendor_name || 'Weekly lunch', line: item.title || item.name, sub: item.from ? `From ${money(item.from, { whole: true })} a lunch` : '' })
    dishes.slice(0, 4).forEach((d, i) => slides.push({ kicker: i === 0 ? 'On the menu' : '', line: d.name, sub: d.price ? money(d.price, { whole: true }) : '', photo: d.images?.[0] }))
    slides.push({ kicker: 'How it works', line: 'Choose your days once', sub: `Order by ${item.cutoff_hour || 18}:00 the day before` })
    const voice = `Homemade lunch, delivered to your office or your door. ${dishes.slice(0, 3).map((d) => d.name).join(', ')}. Choose the full week or just the days you want, and order by ${item.cutoff_hour || 18} hundred hours the day before. Order on zamarket dot shop.`
    return finish(slides, [item.cover_url, ...dishes.map((d) => d.images?.[0])].filter(Boolean), voice,
      captionFor(item.title || item.name, item.from ? `From ${money(item.from, { whole: true })}` : '', '', dishes.slice(0, 4).map((d) => d.name), link, ['#LusakaLunch', '#OfficeLunch', '#ZaMarket']))
  }
  const price = Number(item.price) > 0 ? money(item.price, { whole: true }) : ''
  const points = (item.benefits || []).filter(Boolean).slice(0, 3)
  slides.push({ kicker: item.vendor_name || 'On ZaMarket', line: item.name, sub: price })
  points.forEach((p, i) => slides.push({ kicker: i === 0 ? 'Why people love it' : '', line: p, sub: '' }))
  const voice = `${item.name}${item.vendor_name ? ` from ${item.vendor_name}` : ''}. ${price ? `${price}. ` : ''}${points.join('. ')}${points.length ? '. ' : ''}Order on zamarket dot shop, delivered in Lusaka.`
  return finish(slides, photos, voice, captionFor(item.name, price, '', points, link, ['#ZaMarket', '#Lusaka', '#ShopLocal']))
}

function finish(slides, photos, voice, caption) {
  const pics = photos.length ? photos : [null]
  const out = slides.map((s, i) => ({ ...s, photo: s.photo || pics[i % pics.length] }))
  // Show every photo at least once: extra photos get a slide of their own.
  for (let i = out.length; i < Math.min(pics.length, 8); i++) out.push({ kicker: '', line: '', sub: '', photo: pics[i] })
  return { slides: out.slice(0, 9), voice, caption }
}

function captionFor(title, price, note, points, link, tags) {
  return [
    `${title}${price ? ` · ${price}` : ''}${note ? ` (${note.toLowerCase()})` : ''}`,
    ...points.slice(0, 4).map((p) => `✓ ${p}`),
    link ? `See it and ask: ${link}` : '',
    tags.join(' '),
  ].filter(Boolean).join('\n')
}

const SLIDE = 2.8
const END = 3.4

export const videoLength = (slides) => slides.length * SLIDE + END

// Draws the video at time t (seconds).
export function drawFrame(ctx, t, slides, imgs, end) {
  const total = slides.length * SLIDE
  ctx.fillStyle = '#120b1e'; ctx.fillRect(0, 0, W, H)
  if (t >= total) return drawEnd(ctx, t - total, end)
  const i = Math.min(slides.length - 1, Math.floor(t / SLIDE))
  const local = t - i * SLIDE
  const s = slides[i]
  const img = imgs[i]
  if (img) {
    // Slow push in, alternating direction, so a still photo feels alive.
    const z = 1.04 + 0.08 * (local / SLIDE)
    const r = Math.max(W / img.width, H / img.height) * z
    const dw = img.width * r; const dh = img.height * r
    const dx = (W - dw) / 2 + (i % 2 ? 1 : -1) * 30 * (local / SLIDE)
    ctx.drawImage(img, dx, (H - dh) / 2, dw, dh)
  }
  // Fade between slides.
  if (local < 0.25 && i > 0) { ctx.fillStyle = `rgba(18,11,30,${1 - local / 0.25})`; ctx.fillRect(0, 0, W, H) }
  // Brand mark, top.
  ctx.font = '800 44px Inter, Arial, sans-serif'; ctx.textBaseline = 'middle'
  const za = ctx.measureText('Za').width; const bw = ctx.measureText('ZaMarket').width
  ctx.fillStyle = 'rgba(18,11,30,.6)'; roundRect(ctx, 48, 70, bw + 88, 84, 42); ctx.fill()
  ctx.fillStyle = '#c9a6ff'; ctx.fillText('Za', 92, 113)
  ctx.fillStyle = '#fff'; ctx.fillText('Market', 92 + za, 113)
  // Words, bottom, rising in.
  if (s.line || s.kicker) {
    const g = ctx.createLinearGradient(0, H * 0.5, 0, H)
    g.addColorStop(0, 'rgba(18,11,30,0)'); g.addColorStop(0.45, 'rgba(18,11,30,.72)'); g.addColorStop(1, 'rgba(18,11,30,.95)')
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.5, W, H * 0.5)
    const rise = Math.min(1, local / 0.5)
    ctx.save(); ctx.globalAlpha = rise; ctx.translate(0, (1 - rise) * 40)
    let y = H - 420
    if (s.kicker) { ctx.fillStyle = '#c9a6ff'; ctx.font = '800 40px Inter, Arial, sans-serif'; ctx.fillText(s.kicker.toUpperCase(), 72, y); y += 78 }
    ctx.fillStyle = '#fff'; ctx.font = '900 82px Inter, Arial, sans-serif'
    for (const l of wrapText(ctx, s.line, W - 144).slice(0, 3)) { ctx.fillText(l, 72, y); y += 96 }
    if (s.sub) { ctx.fillStyle = '#ffd36b'; ctx.font = '800 58px Inter, Arial, sans-serif'; ctx.fillText(s.sub, 72, y + 10) }
    ctx.restore()
  }
  // Progress bar.
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(72, H - 90, W - 144, 8)
  ctx.fillStyle = '#b98cff'; ctx.fillRect(72, H - 90, (W - 144) * (t / (total + END)), 8)
}

function drawEnd(ctx, t, end) {
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#2a1650'); g.addColorStop(1, '#120b1e')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const a = Math.min(1, t / 0.4)
  ctx.save(); ctx.globalAlpha = a
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'; ctx.font = '900 96px Inter, Arial, sans-serif'; ctx.fillText('ZaMarket', W / 2, 420)
  ctx.fillStyle = '#c9a6ff'; ctx.font = '700 50px Inter, Arial, sans-serif'; ctx.fillText(end.cta || 'See it and order', W / 2, 540)
  if (end.qr) { ctx.fillStyle = '#fff'; roundRect(ctx, W / 2 - 290, 660, 580, 580, 40); ctx.fill(); ctx.drawImage(end.qr, W / 2 - 250, 700, 500, 500) }
  ctx.fillStyle = '#ffd36b'; ctx.font = '800 54px Inter, Arial, sans-serif'
  wrapText(ctx, end.link || 'zamarket.shop', W - 140).slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, 1360 + i * 66))
  ctx.fillStyle = '#fff'; ctx.font = '600 44px Inter, Arial, sans-serif'; ctx.fillText('Delivered in Lusaka', W / 2, 1530)
  ctx.restore(); ctx.textAlign = 'left'
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

function wrapText(ctx, text, max) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []; let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w } else cur = t
  }
  if (cur) lines.push(cur)
  return lines
}

export async function prepare(script, link) {
  const imgs = await Promise.all(script.slides.map((s) => (s.photo ? load(s.photo) : Promise.resolve(null))))
  const qr = link ? await qrImage(link, '#120b1e', '#ffffff') : null
  return { imgs, end: { qr, link: String(link || '').replace(/^https?:\/\//, ''), cta: 'See it and order on ZaMarket' } }
}

export function bestMime() {
  const opts = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
  return opts.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) || ''
}

// Records the video in real time (the length of the video). With voice on,
// the microphone is recorded at the same time, so you can talk over it.
export async function recordVideo(canvas, script, assets, { voice = false, onProgress } = {}) {
  const ctx = canvas.getContext('2d')
  const mime = bestMime()
  if (!mime || !canvas.captureStream) throw new Error('This browser cannot record video. Try Chrome on Android or a computer.')
  const stream = canvas.captureStream(30)
  let mic = null
  if (voice) {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    mic.getAudioTracks().forEach((t) => stream.addTrack(t))
  }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 })
  const chunks = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const length = videoLength(script.slides)
  const done = new Promise((res) => { rec.onstop = res })
  rec.start(250)
  const start = performance.now()
  await new Promise((resolve) => {
    const step = () => {
      const t = (performance.now() - start) / 1000
      drawFrame(ctx, Math.min(t, length), script.slides, assets.imgs, assets.end)
      onProgress?.(Math.min(1, t / length))
      if (t < length) requestAnimationFrame(step); else resolve()
    }
    requestAnimationFrame(step)
  })
  rec.stop()
  await done
  mic?.getTracks().forEach((t) => t.stop())
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: mime.includes('mp4') ? 'mp4' : 'webm' }
}
