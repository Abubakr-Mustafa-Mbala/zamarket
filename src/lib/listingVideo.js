import { load, qrImage } from './posterKit'
import { money } from './format'
import { vehicleOf, vehicleTitle, priceNote, standoutFeatures, km, vehicleFacts, rankFeatures } from './vehicle'

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
    slides.push({ kicker: 'For sale on ZaMarket Motors', line: title, sub: [price, note].filter(Boolean).join(' · '), say: `${title}${v.location ? `, in ${v.location}` : ''}. ${price ? `Asking ${price}${note ? `, ${note.toLowerCase()}` : ''}.` : ''}` })
    // The specifications as a clear card, row by row, over a darkened photo.
    const rows = vehicleFacts(v).filter((f) => f.key !== 'location').slice(0, 8).map((f) => [f.label, String(f.value)])
    if (rows.length) slides.push({ type: 'specs', kicker: 'Specifications', rows, line: '', sub: '', say: `${facts.join(', ')}${v.engine ? `, ${v.engine} engine` : ''}.` })
    feats.forEach((f, i) => slides.push({ kicker: i === 0 ? 'Highlights' : '', line: f, sub: '', say: i === 0 ? `It comes with ${f.toLowerCase()}.` : `${f}.` }))
    const voice = [
      `${title}${v.location ? `, in ${v.location}` : ''}.`,
      price ? `Asking ${price}${note ? `, ${note.toLowerCase()}` : ''}.` : '',
      facts.length ? `${facts.join(', ')}.` : '',
      feats.length ? `It comes with ${feats.slice(0, 3).join(', ')}.` : '',
      'Photos, details and enquiries on zamarket dot shop. Link in the description.',
    ].filter(Boolean).join(' ')
    return { ...finish(slides, photos, voice, captionFor(title, price, note, feats, link, ['#ZaMarketMotors', '#CarsForSaleZambia', '#Lusaka'])), end: { cta: 'Enquire on ZaMarket Motors', foot: 'Ask about it · viewings arranged' } }
  }
  if (kind === 'lunch') {
    const dishes = item.dishList || []
    slides.push({ kicker: item.vendor_name || 'Weekly lunch', line: item.title || item.name, sub: item.from ? `From ${money(item.from, { whole: true })} a lunch` : '', say: 'Homemade lunch, delivered to your office or your door.' })
    dishes.slice(0, 4).forEach((d, i) => slides.push({ kicker: i === 0 ? 'On the menu' : '', line: d.name, sub: d.price ? money(d.price, { whole: true }) : '', photo: d.images?.[0], say: `${i === 0 ? 'On the menu: ' : ''}${d.name}.` }))
    slides.push({ kicker: 'How it works', line: 'Choose your days once', sub: `Order by ${item.cutoff_hour || 18}:00 the day before`, say: `Choose the full week or just the days you want, and order by ${item.cutoff_hour || 18} hundred hours the day before.` })
    const voice = `Homemade lunch, delivered to your office or your door. ${dishes.slice(0, 3).map((d) => d.name).join(', ')}. Choose the full week or just the days you want, and order by ${item.cutoff_hour || 18} hundred hours the day before. Order on zamarket dot shop.`
    return withEnd({ cta: 'Order your weekly lunch', foot: 'Delivered to your office or door' }, finish(slides, [item.cover_url, ...dishes.map((d) => d.images?.[0])].filter(Boolean), voice,
      captionFor(item.title || item.name, item.from ? `From ${money(item.from, { whole: true })}` : '', '', dishes.slice(0, 4).map((d) => d.name), link, ['#LusakaLunch', '#OfficeLunch', '#ZaMarket'])))
  }
  const price = Number(item.price) > 0 ? money(item.price, { whole: true }) : ''
  const points = (item.benefits || []).filter(Boolean).slice(0, 3)
  slides.push({ kicker: item.vendor_name || 'On ZaMarket', line: item.name, sub: price, say: `${item.name}${item.vendor_name ? ` from ${item.vendor_name}` : ''}.${price ? ` ${price}.` : ''}` })
  points.forEach((p, i) => slides.push({ kicker: i === 0 ? 'Why people love it' : '', line: p, sub: '', say: `${p}.` }))
  const voice = `${item.name}${item.vendor_name ? ` from ${item.vendor_name}` : ''}. ${price ? `${price}. ` : ''}${points.join('. ')}${points.length ? '. ' : ''}Order on zamarket dot shop, delivered in Lusaka.`
  return withEnd({ cta: 'See it and order on ZaMarket', foot: 'Delivered in Lusaka' }, finish(slides, photos, voice, captionFor(item.name, price, '', points, link, ['#ZaMarket', '#Lusaka', '#ShopLocal'])))
}

const withEnd = (end, script) => ({ ...script, end })

function finish(slides, photos, voice, caption) {
  const pics = photos.length ? photos : [null]
  const out = slides.map((s, i) => ({ ...s, photo: s.photo || pics[i % pics.length] }))
  // Show every photo at least once: extra photos get a slide of their own.
  for (let i = out.length; i < Math.min(pics.length, 8); i++) out.push({ kicker: '', line: '', sub: '', photo: pics[i], say: '' })
  return { slides: out.slice(0, 9), voice, caption, endSay: 'See the photos, details and price on zamarket dot shop. The link is in the description.' }
}

function captionFor(title, price, note, points, link, tags) {
  return [
    `${title}${price ? ` · ${price}` : ''}${note ? ` (${note.toLowerCase()})` : ''}`,
    ...points.slice(0, 4).map((p) => `✓ ${p}`),
    link ? `See it and ask: ${link}` : '',
    tags.join(' '),
  ].filter(Boolean).join('\n')
}

// How long each scene stays on screen (seconds). Chosen in the video maker.
let SLIDE = 4
let END = 5
export const PACES = [3, 4, 5, 6]
export function setPace(seconds) { SLIDE = Math.min(8, Math.max(2.5, Number(seconds) || 4)); END = Math.max(4, SLIDE + 1) }
export const pace = () => SLIDE

// How the photos move. Cars look great zooming in; a product photo is shown
// whole and still, so nothing is cut off or swimming about.
let MOTION = 'zoom'
export const MOTIONS = [['zoom', 'Zoom in'], ['gentle', 'Gentle'], ['still', 'Still']]
export const defaultMotion = (kind) => (kind === 'vehicle' ? 'zoom' : kind === 'lunch' ? 'gentle' : 'still')
export function setMotion(m) { MOTION = MOTIONS.some(([k]) => k === m) ? m : 'zoom' }

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
  if (img && MOTION === 'still') drawWhole(ctx, img, s)
  else if (img) {
    // Slow push in, alternating direction, so a still photo feels alive.
    // Photo-only scenes zoom in further, to show the details.
    const p = local / SLIDE
    const words = s.line || s.kicker || s.type
    const z = MOTION === 'gentle' ? 1.02 + 0.05 * p : words ? 1.04 + 0.08 * p : 1.02 + 0.3 * p
    const r = Math.max(W / img.width, H / img.height) * z
    const dw = img.width * r; const dh = img.height * r
    const dx = (W - dw) / 2 + (MOTION === 'zoom' ? (i % 2 ? 1 : -1) * 30 * p : 0)
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
  if (s.type === 'specs') drawSpecs(ctx, s, local)
  // Words, bottom, rising in.
  else if (s.line || s.kicker) {
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

// The whole photo, uncropped and still, over a soft darkened copy of itself.
function drawWhole(ctx, img, s) {
  const r = Math.max(W / img.width, H / img.height) * 1.1
  ctx.save()
  try { ctx.filter = 'blur(36px)' } catch { /* no filters */ }
  ctx.drawImage(img, (W - img.width * r) / 2, (H - img.height * r) / 2, img.width * r, img.height * r)
  ctx.restore()
  ctx.fillStyle = 'rgba(18,11,30,.55)'; ctx.fillRect(0, 0, W, H)
  const words = s.line || s.kicker || s.type
  const top = 200; const bottom = words ? H - 600 : H - 200
  const k = Math.min((W - 96) / img.width, (bottom - top) / img.height)
  const dw = img.width * k; const dh = img.height * k
  const x = (W - dw) / 2; const y = top + (bottom - top - dh) / 2
  ctx.save(); roundRect(ctx, x, y, dw, dh, 28); ctx.clip(); ctx.drawImage(img, x, y, dw, dh); ctx.restore()
}

// A specifications card that grows into view, the rows arriving one by one.
function drawSpecs(ctx, s, local) {
  ctx.fillStyle = 'rgba(18,11,30,.62)'; ctx.fillRect(0, 0, W, H)
  const grow = Math.min(1, local / 0.6)
  const scale = 0.9 + 0.1 * (1 - Math.pow(1 - grow, 3))
  const rows = s.rows || []
  const rowH = 118
  const cardH = 190 + rows.length * rowH
  const top = Math.max(230, (H - cardH) / 2)
  ctx.save()
  ctx.translate(W / 2, top + cardH / 2); ctx.scale(scale, scale); ctx.translate(-W / 2, -(top + cardH / 2))
  ctx.globalAlpha = grow
  ctx.fillStyle = 'rgba(27,18,48,.94)'; roundRect(ctx, 56, top, W - 112, cardH, 40); ctx.fill()
  ctx.strokeStyle = 'rgba(185,140,255,.55)'; ctx.lineWidth = 3; roundRect(ctx, 56, top, W - 112, cardH, 40); ctx.stroke()
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#c9a6ff'; ctx.font = '800 44px Inter, Arial, sans-serif'; ctx.fillText((s.kicker || 'Specifications').toUpperCase(), 110, top + 90)
  rows.forEach(([label, value], i) => {
    const appear = Math.min(1, Math.max(0, (local - 0.35 - i * 0.22) / 0.3))
    if (!appear) return
    const y = top + 190 + i * rowH + rowH / 2 - 20
    ctx.globalAlpha = grow * appear
    if (i) { ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(110, y - rowH / 2, W - 220, 2) }
    ctx.fillStyle = '#c4b8dd'; ctx.font = '600 42px Inter, Arial, sans-serif'; ctx.fillText(label, 110, y)
    ctx.fillStyle = '#fff'; ctx.font = '800 50px Inter, Arial, sans-serif'
    ctx.textAlign = 'right'
    let v = value
    while (v.length > 3 && ctx.measureText(v).width > W - 220 - 320) v = v.slice(0, -2)
    ctx.fillText(v === value ? v : `${v.trim()}…`, W - 110, y)
    ctx.textAlign = 'left'
  })
  ctx.restore()
}

function drawEnd(ctx, t, end) {
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#2a1650'); g.addColorStop(1, '#120b1e')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const a = Math.min(1, t / 0.4)
  ctx.save(); ctx.globalAlpha = a
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'; ctx.font = '900 96px Inter, Arial, sans-serif'; ctx.fillText('ZaMarket', W / 2, 420)
  ctx.fillStyle = '#c9a6ff'; ctx.font = '700 50px Inter, Arial, sans-serif'; ctx.fillText(end.cta || 'See it on ZaMarket', W / 2, 540)
  if (end.qr) { ctx.fillStyle = '#fff'; roundRect(ctx, W / 2 - 290, 660, 580, 580, 40); ctx.fill(); ctx.drawImage(end.qr, W / 2 - 250, 700, 500, 500) }
  ctx.fillStyle = '#ffd36b'; ctx.font = '800 54px Inter, Arial, sans-serif'
  wrapText(ctx, end.link || 'zamarket.shop', W - 140).slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, 1360 + i * 66))
  ctx.fillStyle = '#fff'; ctx.font = '600 44px Inter, Arial, sans-serif'; ctx.fillText(end.foot || 'Delivered in Lusaka', W / 2, 1530)
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
  return { imgs, end: { qr, link: String(link || '').replace(/^https?:\/\//, ''), cta: script.end?.cta || 'See it on ZaMarket', foot: script.end?.foot || '' } }
}

// Which recorder this phone can really use. Some phones say they can record
// MP4 but hand back an empty or broken file, especially at full 1080×1920
// in portrait. So each option is tried for about a second and the result is
// checked (it must have data and play) before the real recording starts.
// The first one that works is remembered on this device.
const CANDIDATES = [
  { mime: 'video/mp4;codecs=avc1.42E01F', w: 720, h: 1280 },
  { mime: 'video/mp4;codecs=avc1', w: 720, h: 1280 },
  { mime: 'video/webm;codecs=vp8', w: 720, h: 1280 },
  { mime: 'video/webm;codecs=vp9', w: 720, h: 1280 },
  { mime: 'video/webm', w: 720, h: 1280 },
  { mime: 'video/mp4', w: 720, h: 1280 },
]
const REMEMBER = 'zm-video-recorder-v2'
const supported = (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)

export function bestMime() {
  try { const r = JSON.parse(localStorage.getItem(REMEMBER) || 'null'); if (r?.mime && supported(r.mime)) return r.mime } catch { /* ignore */ }
  return CANDIDATES.find((c) => supported(c.mime))?.mime || ''
}

// True when the file has data and a video element can open it.
export function playable(blob, timeout = 5000) {
  return new Promise((res) => {
    if (!blob || blob.size < 1500) return res(false)
    const v = document.createElement('video')
    const url = URL.createObjectURL(blob)
    const end = (ok) => { clearTimeout(t); v.removeAttribute('src'); v.load?.(); URL.revokeObjectURL(url); res(ok) }
    const t = setTimeout(() => end(false), timeout)
    v.muted = true; v.preload = 'metadata'
    v.onloadedmetadata = () => end(v.videoWidth > 0 || v.duration > 0)
    v.onerror = () => end(false)
    v.src = url
  })
}

// Records `seconds` of drawing into a canvas of the given size.
function capture(cfg, seconds, paint, { audio = null, onProgress, until = null } = {}) {
  return new Promise((resolve, reject) => {
    const c = document.createElement('canvas')
    c.width = cfg.w; c.height = cfg.h
    const ctx = c.getContext('2d')
    if (!c.captureStream) return reject(new Error('This browser cannot record video. Use Chrome.'))
    const stream = c.captureStream(30)
    audio?.getAudioTracks().forEach((tr) => stream.addTrack(tr))
    let rec
    try { rec = new MediaRecorder(stream, { mimeType: cfg.mime, videoBitsPerSecond: 4_000_000 }) } catch (e) { return reject(e) }
    const chunks = []
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
    rec.onerror = (e) => reject(e.error || new Error('The recorder stopped'))
    rec.onstop = () => { stream.getVideoTracks().forEach((tr) => tr.stop()); resolve(new Blob(chunks, { type: cfg.mime.split(';')[0] })) }
    const scale = cfg.w / W
    rec.start(500)
    const start = performance.now()
    const step = () => {
      const t = (performance.now() - start) / 1000
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      paint(ctx, until ? t : Math.min(t, seconds), c)
      if (!until) onProgress?.(Math.min(1, t / seconds))
      if (until ? !until() : t < seconds) requestAnimationFrame(step)
      else setTimeout(() => { try { rec.requestData?.() } catch { /* ignore */ } rec.stop() }, 150)
    }
    requestAnimationFrame(step)
  })
}

async function pickRecorder(probePaint) {
  try {
    const r = JSON.parse(localStorage.getItem(REMEMBER) || 'null')
    if (r?.mime && supported(r.mime)) return r
  } catch { /* ignore */ }
  for (const cfg of CANDIDATES.filter((c) => supported(c.mime))) {
    try {
      const blob = await capture(cfg, 1.2, probePaint)
      if (await playable(blob)) {
        try { localStorage.setItem(REMEMBER, JSON.stringify(cfg)) } catch { /* ignore */ }
        return cfg
      }
    } catch { /* try the next one */ }
  }
  return null
}

// Records the video in real time (the length of the video), showing it on
// the preview canvas as it goes. With voice on, the microphone is recorded
// at the same time, so you can talk over it.
// With voice, you set the pace: each scene stays on screen until you tap
// Next, and the recording ends only when you tap Finish. A scene keeps a
// slow, gentle zoom however long you talk over it.
export function voiceController(scenes, onScene) {
  const c = { i: 0, at: 0, done: false, scenes }
  c.next = () => { if (c.i < scenes) { c.i += 1; c.at = performance.now(); onScene?.(c.i) } }
  c.back = () => { if (c.i > 0) { c.i -= 1; c.at = performance.now(); onScene?.(c.i) } }
  c.finish = () => { c.done = true }
  return c
}

// Time on the video's timeline for a scene held open for `held` seconds:
// moves quickly through the entrance, then slows right down, never stopping
// dead and never running into the next scene.
export function heldTime(scene, held, slides) {
  const total = slides.length * SLIDE
  if (scene >= slides.length) return total + Math.min(held, END - 0.05)
  const local = (SLIDE - 0.05) * (1 - Math.exp(-held / (SLIDE * 1.2)))
  return scene * SLIDE + local
}

export async function recordVideo(preview, script, assets, { voice = false, onProgress, onStage, controller = null } = {}) {
  if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record video. Use Chrome on your phone or computer.')
  const pctx = preview.getContext('2d')
  const show = (c) => { pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.drawImage(c, 0, 0, preview.width, preview.height) }
  onStage?.('Getting ready…')
  const cfg = await pickRecorder((ctx, t, c) => { drawFrame(ctx, t, script.slides, assets.imgs, assets.end); show(c) })
  if (!cfg) throw new Error('This phone could not record a working video. Try Chrome, or make it on a computer.')
  let mic = null
  if (voice) mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const length = videoLength(script.slides)
  onStage?.('Recording')
  let blob
  try {
    if (controller) {
      controller.at = performance.now()
      blob = await capture(cfg, 0, (ctx, _t, c) => {
        const held = (performance.now() - controller.at) / 1000
        drawFrame(ctx, heldTime(controller.i, held, script.slides), script.slides, assets.imgs, assets.end)
        show(c)
      }, { audio: mic, until: () => controller.done })
    } else {
      blob = await capture(cfg, length, (ctx, t, c) => { drawFrame(ctx, t, script.slides, assets.imgs, assets.end); show(c) }, { audio: mic, onProgress })
    }
  } finally {
    mic?.getTracks().forEach((t) => t.stop())
  }
  onStage?.('Checking the video…')
  if (!(await playable(blob, 8000))) {
    try { localStorage.removeItem(REMEMBER) } catch { /* ignore */ }
    throw new Error('The video did not come out right. Tap Make video again; it will try another way.')
  }
  return { blob, ext: cfg.mime.includes('mp4') ? 'mp4' : 'webm', width: cfg.w, height: cfg.h }
}

// ---- A video you arrange yourself ------------------------------------------
// The pieces a listing offers: its photos, and blocks you can turn into a
// scene (title and price, the specifications card, each recorded feature,
// where it is, your own words). Nothing is placed for you except a plain
// starting point: the title over the first photo, then each photo on its
// own. You choose what goes on which photo.
let nextId = 1
export const sceneId = () => `s${Date.now().toString(36)}${(nextId++).toString(36)}`

export function videoParts(item, kind = 'product', link = '') {
  const base = videoScript(item, kind, link)
  const photos = [...new Set((kind === 'lunch'
    ? [item.cover_url, ...(item.dishList || []).flatMap((d) => d.images || [])]
    : item.images || []).filter(Boolean))].slice(0, 20)
  const blocks = []
  if (kind === 'vehicle') {
    const v = vehicleOf(item)
    const title = vehicleTitle(v, item.name)
    const note = priceNote(v)
    const price = Number(item.price) > 0 ? money(item.price, { whole: true }) : ''
    blocks.push({ id: 'title', label: 'Title and price', scene: { kicker: 'For sale on ZaMarket Motors', line: title, sub: [price, note].filter(Boolean).join(' · '), say: `${title}. ${price ? `Asking ${price}${note ? `, ${note.toLowerCase()}` : ''}.` : ''}` } })
    const rows = vehicleFacts(v).filter((f) => f.key !== 'location').map((f) => [f.label, String(f.value)])
    if (rows.length) blocks.push({ id: 'specs', label: 'Specifications card', allRows: rows, scene: { type: 'specs', kicker: 'Specifications', rows: rows.slice(0, 6), say: '' } })
    if (v.location) blocks.push({ id: 'where', label: `Where: ${v.location}`, scene: { kicker: 'Where', line: v.location, say: `It is in ${v.location}.` } })
    for (const f of rankFeatures(v.features || [])) blocks.push({ id: `f-${f.label}`, label: f.label, feature: true, scene: { kicker: '', line: f.label, say: `${f.label}.` } })
  } else if (kind === 'lunch') {
    blocks.push({ id: 'title', label: 'Title and price', scene: base.slides[0] })
    for (const d of item.dishList || []) blocks.push({ id: `d-${d.id}`, label: d.name, feature: true, scene: { kicker: 'On the menu', line: d.name, sub: d.price ? money(d.price, { whole: true }) : '', say: `${d.name}.` }, photo: d.images?.[0] })
    blocks.push({ id: 'how', label: 'How it works', scene: base.slides.find((x) => x.kicker === 'How it works') })
  } else {
    blocks.push({ id: 'title', label: 'Name and price', scene: base.slides[0] })
    for (const p of (item.benefits || []).filter(Boolean)) blocks.push({ id: `b-${p}`, label: p, feature: true, scene: { kicker: '', line: p, say: `${p}.` } })
  }
  blocks.push({ id: 'words', label: 'My own words', scene: { kicker: '', line: '', sub: '', say: '' } })
  // The starting point is the full automatic video. A feature scene is marked
  // so you can check its photo really shows it.
  const feats = new Set(blocks.filter((b) => b.feature).map((b) => b.scene.line))
  const starter = base.slides.map((sc) => ({ id: sceneId(), photo: sc.photo || null, ...clean(sc), ...(feats.has(sc.line) ? { feature: true } : {}) }))
  return { photos, blocks, starter, end: base.end, caption: base.caption, endSay: base.endSay }
}

const clean = (sc) => ({ type: sc.type || '', kicker: sc.kicker || '', line: sc.line || '', sub: sc.sub || '', say: sc.say || '', ...(sc.rows ? { rows: sc.rows } : {}) })

// A new scene from a block, on a chosen photo.
export const sceneFrom = (block, photo) => ({ id: sceneId(), photo: photo ?? block.photo ?? null, ...clean(block.scene) })

// What you will say, scene by scene, then the ending.
export const voiceFor = (scenes, endSay) => [...scenes.map((x) => x.say).filter(Boolean), endSay].filter(Boolean).join(' ')

// Photos loaded once and reused while you edit.
export async function loadPhotos(urls, cache) {
  await Promise.all([...new Set(urls.filter(Boolean))].filter((u) => !cache.has(u)).map(async (u) => { cache.set(u, await load(u)) }))
  return cache
}
export async function endCard(script, link) {
  const qr = link ? await qrImage(link, '#120b1e', '#ffffff') : null
  return { qr, link: String(link || '').replace(/^https?:\/\//, ''), cta: script.end?.cta || 'See it on ZaMarket', foot: script.end?.foot || '' }
}
