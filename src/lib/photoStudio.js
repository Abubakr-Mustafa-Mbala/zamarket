// Turning a phone photo into a catalogue photo.
// If the item was shot on a plain surface, the background can be cut away and
// replaced with clean white and a soft shadow — the look Amazon uses.
// Nothing here guesses: if the background is busy, it says so and leaves it alone.

const OUT = 1200

function loadImage(file) {
  const url = typeof file === 'string' ? file : URL.createObjectURL(file)
  return new Promise((res, rej) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => { if (typeof file !== 'string') URL.revokeObjectURL(url); res(i) }
    i.onerror = () => rej(new Error('Could not read that photo'))
    i.src = url
  })
}

function draw(img, size = OUT) {
  const c = document.createElement('canvas')
  const scale = Math.min(size / img.width, size / img.height)
  c.width = Math.round(img.width * scale)
  c.height = Math.round(img.height * scale)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return { c, ctx }
}

// How even is the border of the photo? Even border = a plain backdrop we can cut.
export function backgroundScore(ctx, w, h) {
  const band = Math.max(4, Math.round(Math.min(w, h) * 0.04))
  const samples = []
  const push = (x, y) => {
    const d = ctx.getImageData(x, y, 1, 1).data
    samples.push([d[0], d[1], d[2]])
  }
  for (let x = 0; x < w; x += Math.max(2, Math.round(w / 60))) { push(x, 2); push(x, h - 3) }
  for (let y = 0; y < h; y += Math.max(2, Math.round(h / 60))) { push(2, y); push(w - 3, y) }
  const mean = samples.reduce((a, s) => [a[0] + s[0], a[1] + s[1], a[2] + s[2]], [0, 0, 0]).map((v) => v / samples.length)
  const spread = Math.sqrt(samples.reduce((a, s) => a + ((s[0] - mean[0]) ** 2 + (s[1] - mean[1]) ** 2 + (s[2] - mean[2]) ** 2) / 3, 0) / samples.length)
  return { mean, spread, plain: spread < 26, band }
}

// Flood in from the edges, clearing anything close to the background colour.
function cutBackground(ctx, w, h, tolerance = 42) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const { mean } = backgroundScore(ctx, w, h)
  const seen = new Uint8Array(w * h)
  const stack = []
  for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1) }
  for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y) }
  const close = (i) => {
    const dr = d[i] - mean[0], dg = d[i + 1] - mean[1], db = d[i + 2] - mean[2]
    return Math.sqrt((dr * dr + dg * dg + db * db) / 3) < tolerance
  }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop()
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const p = y * w + x
    if (seen[p]) continue
    const i = p * 4
    if (!close(i)) continue
    seen[p] = 1
    d[i + 3] = 0
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }
  // soften the cut edge so it does not look like scissors
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) continue
    const x = p % w, y = (p / w) | 0
    let clearNeighbours = 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = (y + dy) * w + (x + dx)
      if (x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= h || seen[q]) clearNeighbours++
    }
    if (clearNeighbours) d[p * 4 + 3] = Math.max(60, 255 - clearNeighbours * 70)
  }
  ctx.putImageData(img, 0, 0)
  return seen
}

function subjectBounds(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data
  let minX = w, minY = h, maxX = 0, maxY = 0, found = false
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) {
        found = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return found ? { minX, minY, maxX, maxY } : null
}

// The finished catalogue shot: white, centred, soft shadow underneath.
export async function studioShot(file, { removeBackground = true, shadow = true, size = OUT, tolerance = 42 } = {}) {
  const img = await loadImage(file)
  const { c, ctx } = draw(img, size)
  const info = backgroundScore(ctx, c.width, c.height)

  const out = document.createElement('canvas')
  out.width = size; out.height = size
  const octx = out.getContext('2d', { willReadFrequently: true })
  octx.fillStyle = '#FFFFFF'
  octx.fillRect(0, 0, size, size)

  if (!removeBackground || !info.plain) {
    // keep the photo as it is, just square and centre it
    const margin = Math.round(size * 0.05)
    const box = size - margin * 2
    const s = Math.min(box / c.width, box / c.height)
    const w = Math.round(c.width * s), h = Math.round(c.height * s)
    octx.drawImage(c, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h)
    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.9))
    return { blob, plain: info.plain, cut: false }
  }

  cutBackground(ctx, c.width, c.height, tolerance)
  const b = subjectBounds(ctx, c.width, c.height)
  if (!b) {
    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.9))
    return { blob, plain: info.plain, cut: false }
  }

  const sw = b.maxX - b.minX + 1
  const sh = b.maxY - b.minY + 1
  const margin = Math.round(size * 0.09)
  const box = size - margin * 2
  const s = Math.min(box / sw, box / sh)
  const dw = Math.round(sw * s), dh = Math.round(sh * s)
  const dx = Math.round((size - dw) / 2), dy = Math.round((size - dh) / 2)

  if (shadow) {
    octx.save()
    octx.filter = 'blur(18px)'
    octx.globalAlpha = 0.22
    octx.fillStyle = '#1F2933'
    octx.beginPath()
    octx.ellipse(size / 2, dy + dh + Math.round(size * 0.02), dw * 0.36, Math.max(10, dh * 0.05), 0, 0, Math.PI * 2)
    octx.fill()
    octx.restore()
  }

  octx.drawImage(c, b.minX, b.minY, sw, sh, dx, dy, dw, dh)
  const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.92))
  return { blob, plain: info.plain, cut: true }
}

export async function previewBoth(file) {
  const [plainShot, cutShot] = await Promise.all([
    studioShot(file, { removeBackground: false }),
    studioShot(file, { removeBackground: true }),
  ])
  return { original: plainShot, studio: cutShot }
}
