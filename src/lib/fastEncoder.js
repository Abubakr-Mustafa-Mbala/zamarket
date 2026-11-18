// Which way this phone can build a video quickly, found by really encoding a
// couple of frames (some phones say yes to a size and then fail).
//
// Budget phones (Samsung A04 and similar) have a video encoder that only
// takes landscape sizes such as 1280×720. Phone cameras deal with that by
// recording sideways and marking the file "rotate 90°", which every player,
// gallery and WhatsApp respects. We do the same when portrait is refused.
// The answer is remembered on the phone; `null` means use the slower
// real-time recorder.

const KEY = 'zm-fast-encoder-v1'
const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42e01f']
const SHAPES = [
  { w: 1080, h: 1920, rot: 0 },
  { w: 720, h: 1280, rot: 0 },
  { w: 1920, h: 1080, rot: 90 },
  { w: 1280, h: 720, rot: 90 },
  { w: 960, h: 540, rot: 90 },
]

let found

async function works(shape, codec) {
  const config = { codec, width: shape.w, height: shape.h, bitrate: 4_000_000, framerate: 30 }
  try { if (!(await VideoEncoder.isConfigSupported(config)).supported) return false } catch { return false }
  return new Promise((resolve) => {
    let chunks = 0; let failed = false
    let enc
    const finish = (ok) => { try { enc?.close() } catch { /* closed */ } resolve(ok) }
    const timer = setTimeout(() => finish(false), 4000)
    try {
      enc = new VideoEncoder({ output: () => { chunks += 1 }, error: () => { failed = true } })
      enc.configure(config)
      const c = document.createElement('canvas'); c.width = shape.w; c.height = shape.h
      const x = c.getContext('2d'); x.fillStyle = '#7c3aed'; x.fillRect(0, 0, shape.w, shape.h)
      for (let i = 0; i < 3; i += 1) {
        const f = new VideoFrame(c, { timestamp: i * 33333, duration: 33333 })
        enc.encode(f, { keyFrame: i === 0 }); f.close()
      }
      enc.flush().then(() => { clearTimeout(timer); finish(!failed && chunks > 0) }, () => { clearTimeout(timer); finish(false) })
    } catch { clearTimeout(timer); finish(false) }
  })
}

export async function fastEncoder() {
  if (found !== undefined) return found
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return (found = null)
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'undefined')
    if (saved !== undefined) return (found = saved)
  } catch { /* nothing saved */ }
  found = null
  outer: for (const shape of SHAPES) {
    for (const codec of CODECS) {
      if (await works(shape, codec)) { found = { ...shape, codec }; break outer }
    }
  }
  try { localStorage.setItem(KEY, JSON.stringify(found)) } catch { /* ignore */ }
  return found
}

// After a real failure: use the real-time recorder on this phone from now on.
export function fastFailed() {
  found = null
  try { localStorage.setItem(KEY, 'null') } catch { /* ignore */ }
}
