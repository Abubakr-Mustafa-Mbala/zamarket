import { supabase } from './supabase'

// Phone photos are uneven: dark rooms, busy backgrounds, different shapes.
// Every photo is squared onto a clean background and levelled, so a page of
// products looks like a shop instead of a pile.

const SIZE = 1200

function loadImage(file) {
  const url = URL.createObjectURL(file)
  return new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => { URL.revokeObjectURL(url); res(i) }
    i.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that photo')) }
    i.src = url
  })
}

// The usual colour around the edges — normally the wall or table behind the item.
function edgeColour(ctx, w, h) {
  const strip = 6
  const pick = [ctx.getImageData(0, 0, w, strip), ctx.getImageData(0, h - strip, w, strip)]
  let r = 0, g = 0, b = 0, n = 0
  for (const d of pick) {
    for (let i = 0; i < d.data.length; i += 4 * 9) { r += d.data[i]; g += d.data[i + 1]; b += d.data[i + 2]; n++ }
  }
  return n ? { r: r / n, g: g / n, b: b / n } : { r: 245, g: 245, b: 245 }
}

// Lift dark phone photos a little, keeping the colours true.
// One gentle curve applied to all channels — no colour shifts, and never darkens.
function levels(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  let total = 0, sum = 0
  for (let i = 0; i < d.length; i += 4 * 5) {
    sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
    total++
  }
  if (!total) return
  const mean = sum / total
  const target = 132
  if (mean >= target - 6) return                       // bright enough already
  let gamma = Math.log(target / 255) / Math.log(Math.max(8, mean) / 255)
  gamma = Math.min(1, Math.max(0.6, gamma))            // cap how far it goes
  const map = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) map[v] = Math.round(255 * Math.pow(v / 255, gamma))
  for (let i = 0; i < d.length; i += 4) { d[i] = map[d[i]]; d[i + 1] = map[d[i + 1]]; d[i + 2] = map[d[i + 2]] }
  ctx.putImageData(img, 0, 0)
}

export async function tidyPhoto(file, { size = SIZE, quality = 0.85 } = {}) {
  if (!file.type?.startsWith('image/')) throw new Error('Please choose a photo')
  const img = await loadImage(file)

  const probe = document.createElement('canvas')
  const pw = Math.min(240, img.width)
  const ph = Math.max(1, Math.round(img.height * (pw / img.width)))
  probe.width = pw; probe.height = ph
  const pctx = probe.getContext('2d', { willReadFrequently: true })
  pctx.drawImage(img, 0, 0, pw, ph)
  const edge = edgeColour(pctx, pw, ph)
  const lightBackground = (edge.r + edge.g + edge.b) / 3 > 190
  const bg = lightBackground ? `rgb(${Math.round(edge.r)},${Math.round(edge.g)},${Math.round(edge.b)})` : '#F7F8F7'

  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)
  const margin = Math.round(size * 0.04)
  const box = size - margin * 2
  const scale = Math.min(box / img.width, box / img.height)
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h)
  // correct only the photo itself, leaving the clean border alone
  const px = Math.round((size - w) / 2), py = Math.round((size - h) / 2)
  const patch = document.createElement('canvas')
  patch.width = w; patch.height = h
  const pctx2 = patch.getContext('2d', { willReadFrequently: true })
  pctx2.drawImage(c, px, py, w, h, 0, 0, w, h)
  levels(pctx2, w, h)
  ctx.drawImage(patch, px, py)

  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality))
  return { blob, preview: URL.createObjectURL(blob), small: Math.min(img.width, img.height) < 500, replacedBackground: !lightBackground }
}

export async function uploadBlob(blob) {
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('product-images').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}

export async function uploadPhoto(file) {
  const { blob } = await tidyPhoto(file)
  return uploadBlob(blob)
}

export const PHOTO_TIPS = [
  'Shoot in daylight: near a window, or outside in shade. Never use the flash.',
  'Put the item on something plain — a white wall, a clean table, a bedsheet.',
  'Fill the frame and hold still. Take five, keep the sharpest.',
  'Wipe the lens first. That alone fixes most blurry photos.',
  'Show the front, the back, the label, and anything a buyer would ask about.',
]
