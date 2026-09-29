// What we can honestly tell a vendor about a photo, measured rather than guessed.
// No AI, no cloud call — arithmetic on the pixels, in their browser.

const GRID = 460  // big enough that blur still shows, small enough to be instant

function toCanvas(img) {
  const s = Math.min(GRID / img.width, GRID / img.height)
  const c = document.createElement('canvas')
  c.width = Math.max(8, Math.round(img.width * s))
  c.height = Math.max(8, Math.round(img.height * s))
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return { c, ctx }
}

// Sharpness: how much neighbouring pixels differ. A blurred photo has little.
function sharpness(grey, w, h) {
  let sum = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = 4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - w] - grey[i + w]
      sum += lap * lap
      n++
    }
  }
  return n ? Math.sqrt(sum / n) : 0
}

// How much of the frame the product takes up, and how busy the edges are.
function framing(grey, w, h) {
  const edge = []
  for (let x = 0; x < w; x++) { edge.push(grey[x], grey[(h - 1) * w + x]) }
  for (let y = 0; y < h; y++) { edge.push(grey[y * w], grey[y * w + w - 1]) }
  const mean = edge.reduce((a, b) => a + b, 0) / edge.length
  const spread = Math.sqrt(edge.reduce((a, b) => a + (b - mean) ** 2, 0) / edge.length)

  let subject = 0
  for (let i = 0; i < grey.length; i++) if (Math.abs(grey[i] - mean) > 26) subject++
  return { backgroundBusy: spread, subjectShare: subject / grey.length, backgroundMean: mean }
}

export async function analysePhoto(file) {
  const url = typeof file === 'string' ? file : URL.createObjectURL(file)
  const img = await new Promise((res, rej) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('Could not read that photo'))
    i.src = url
  })
  if (typeof file !== 'string') URL.revokeObjectURL(url)

  const { c, ctx } = toCanvas(img)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  const grey = new Float32Array(c.width * c.height)
  let bright = 0
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    grey[p] = g
    bright += g
  }
  bright /= grey.length

  const sharp = sharpness(grey, c.width, c.height)
  const frame = framing(grey, c.width, c.height)
  const pixels = img.width * img.height
  const portrait = img.height > img.width * 1.4
  const landscape = img.width > img.height * 1.4

  // ---- notes the vendor can act on, worst first
  const notes = []
  if (pixels < 500 * 500) notes.push({ level: 'bad', text: 'The photo is small and will look soft when enlarged. Take it again without zooming in.' })
  else if (pixels < 900 * 900) notes.push({ level: 'warn', text: 'The photo is a little small. A closer, full-size photo would look sharper.' })
  if (sharp < 3) notes.push({ level: 'bad', text: 'The photo looks blurry. Hold the phone still, tap the screen on the product, and take it again.' })
  else if (sharp < 6.5) notes.push({ level: 'warn', text: 'It is slightly soft. Tapping the screen on the product before shooting helps.' })
  if (bright < 70) notes.push({ level: 'bad', text: 'The photo is dark. Take it near a window in daylight, with the light in front of the product, not behind it.' })
  else if (bright < 100) notes.push({ level: 'warn', text: 'It is a bit dark. Daylight near a window would make it look better.' })
  else if (bright > 225) notes.push({ level: 'warn', text: 'It is very bright and detail is being lost. Move out of direct sun.' })
  if (frame.subjectShare < 0.16) notes.push({ level: 'warn', text: `The product fills only about ${Math.round(frame.subjectShare * 100)}% of the picture. Move closer.` })
  if (frame.backgroundBusy > 22) notes.push({ level: 'warn', text: 'The background is busy. A plain wall, a bedsheet or a clean table makes the product stand out.' })
  if (landscape) notes.push({ level: 'info', text: 'This is a wide photo. It will be cropped square for the shop, so keep the product centred.' })
  if (portrait) notes.push({ level: 'info', text: 'This is a tall photo. It will be cropped square for the shop.' })

  // ---- one score, from the things that actually matter
  let score = 100
  if (pixels < 500 * 500) score -= 30; else if (pixels < 900 * 900) score -= 12
  if (sharp < 3) score -= 42; else if (sharp < 6.5) score -= 20
  if (bright < 70) score -= 25; else if (bright < 100) score -= 10; else if (bright > 225) score -= 10
  if (frame.subjectShare < 0.16) score -= 16
  if (frame.backgroundBusy > 22) score -= 18
  score = Math.max(0, Math.min(100, Math.round(score)))

  const level = score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red'
  return {
    score,
    level,
    notes,
    measured: {
      width: img.width, height: img.height, brightness: Math.round(bright),
      sharpness: Math.round(sharp * 10) / 10,
      subject_share: Math.round(frame.subjectShare * 100),
      background_busy: Math.round(frame.backgroundBusy),
      plain_background: frame.backgroundBusy < 26,
    },
  }
}

export const LEVEL_WORDS = {
  green: { label: 'Ready to publish', note: 'This will look good in the shop and in promotions.' },
  yellow: { label: 'Usable — could be better', note: 'You can publish it, but a better photo will sell more.' },
  red: { label: 'Take it again', note: 'This is not good enough for the shop. It takes two minutes to redo.' },
}
