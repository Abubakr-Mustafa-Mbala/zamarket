import { clockSwitch, sceneSeconds } from './listingVideo'

// The sound of the 12:30 opening: a clock ticking loud and clear while the
// hands run to lunchtime, then a soft whoosh as the photo rises in. Made
// right here (no recording, no music): short wooden clicks, tick and tock.

const RATE = 48000

const OPENINGS = ['clock', 'hookfood', 'hookbusy', 'mwall', 'mbig']
export const hasOpening = (slides) => OPENINGS.includes(slides?.[0]?.type) || slides?.some((x) => x.type === 'clock')

// The sounds each opening plays, at moments in the scene (seconds).
function cues(s) {
  const T = clockSwitch()
  if (s.type === 'hookfood') {
    // A whoosh as the photo punches in; a deep thump as the violet line lands.
    const n1 = String(s.line || '').split(' ').length
    return [{ at: 0.001, kind: 'whoosh' }, { at: 0.3 + n1 * 0.11 + 0.12, kind: 'thump' }]
  }
  if (s.type === 'hookbusy') {
    const p = (s.punch || []).slice(0, 3)
    const gap = Math.min(0.55, (T - 0.4) / Math.max(1, p.length))
    return [...p.map((_, j) => ({ at: 0.1 + j * gap + 0.02, kind: 'thump' })), { at: T - 0.15, kind: 'whoosh' }]
  }
  if (s.type === 'clock') return [{ at: T - 0.15, kind: 'whoosh' }]
  if (s.type === 'mwall') {
    // Whoosh in; a deep hit as the violet line lands.
    const first = String((s.lines || [])[0] || '').split(' ').length
    return [{ at: 0.001, kind: 'whoosh' }, { at: 0.35 + first * 0.11 + 0.14 + 0.05, kind: 'thump' }]
  }
  if (s.type === 'mbig') {
    // A hit on each line as it lands.
    let at = 0.25; const out = []
    for (const line of s.lines || []) { out.push({ at: at + 0.03, kind: 'thump' }); at += String(line).split(' ').length * 0.08 + 0.32 }
    return out
  }
  return []
}

// When the opening's sounds fall in the finished video. `timeAt` turns video
// time into story time (with your voice, the scenes follow your voice).
export function openingMoments(slides, timeAt, length) {
  const S = sceneSeconds(); const run = clockSwitch() * 0.75
  const out = []
  let lastTick = -1; let lastScene = -1; let lastLocal = -1
  for (let t = 0; t < length; t += 1 / 240) {
    const st = timeAt(t)
    const i = Math.floor(st / S)
    const s = slides[i]
    if (!s || !OPENINGS.includes(s.type)) { lastScene = i; continue }
    const local = st - i * S
    if (i !== lastScene) { lastTick = -1; lastLocal = -1 }
    if (s.type === 'clock') {
      const n = Math.floor(local * 5) // five ticks a second while the hands run
      if (local < run + 0.2 && n !== lastTick) { out.push({ t, kind: n % 2 ? 'tock' : 'tick' }); lastTick = n }
    }
    for (const c of cues(s)) if (lastLocal < c.at && local >= c.at) out.push({ t, kind: c.kind })
    lastScene = i; lastLocal = local
  }
  return out
}
export const clockMoments = openingMoments

function addTick(d, at, tock) {
  const start = Math.round(at * RATE)
  const len = Math.round(0.07 * RATE)
  const f = tock ? 1150 : 1650
  let prev = 0
  for (let n = 0; n < len && start + n < d.length; n += 1) {
    const x = n / RATE
    const click = Math.exp(-x / 0.006)
    const body = Math.exp(-x / 0.02)
    const noise = Math.random() * 2 - 1; const hp = noise - prev; prev = noise
    d[start + n] += 0.46 * click * Math.sin(2 * Math.PI * f * x) + 0.24 * click * hp + 0.26 * body * Math.sin(2 * Math.PI * 190 * x)
  }
}

// A deep, short hit: the "boom" a headline lands with in adverts.
function addThump(d, at) {
  const start = Math.round(at * RATE)
  const len = Math.round(0.4 * RATE)
  let phase = 0
  for (let n = 0; n < len && start + n < d.length; n += 1) {
    const x = n / RATE
    const f = 48 + 70 * Math.exp(-x / 0.05) // pitch falls fast, like a drum
    phase += 2 * Math.PI * f / RATE
    const click = x < 0.004 ? (Math.random() * 2 - 1) * (1 - x / 0.004) * 0.35 : 0
    d[start + n] += 0.85 * Math.exp(-x / 0.12) * Math.sin(phase) + click
  }
}

function addWhoosh(d, at) {
  const start = Math.round(at * RATE)
  const len = Math.round(0.65 * RATE)
  let lp = 0
  for (let n = 0; n < len && start + n < d.length; n += 1) {
    const k = n / len
    const cut = 0.02 + 0.25 * k // the air opens up as the photo rises
    lp += cut * ((Math.random() * 2 - 1) - lp)
    d[start + n] += 0.5 * Math.sin(Math.PI * k) ** 2 * lp
  }
}

// The opening's sounds as a track of the video's length (null if none).
export function openingTrack(slides, timeAt, length) {
  const moments = openingMoments(slides, timeAt, length)
  if (!moments.length) return null
  const buf = new AudioBuffer({ length: Math.ceil(length * RATE), numberOfChannels: 1, sampleRate: RATE })
  const d = buf.getChannelData(0)
  for (const m of moments) {
    if (m.kind === 'tick' || m.kind === 'tock') addTick(d, m.t, m.kind === 'tock')
    else if (m.kind === 'thump') addThump(d, m.t)
    else addWhoosh(d, m.t)
  }
  return buf
}
export const clockTrack = openingTrack

// Voice (with any nasheed under it) and the ticking together, never clipping.
export async function mixTracks(tracks, length) {
  const list = tracks.filter(Boolean)
  if (list.length < 2) return list[0] || null
  const ctx = new OfflineAudioContext(2, Math.ceil(length * RATE), RATE)
  const limit = ctx.createDynamicsCompressor()
  limit.threshold.value = -2; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.06
  limit.connect(ctx.destination)
  for (const b of list) { const s = ctx.createBufferSource(); s.buffer = b; s.connect(limit); s.start(0) }
  const out = await ctx.startRendering()
  let peak = 0
  for (let c = 0; c < out.numberOfChannels; c += 1) for (const x of out.getChannelData(c)) peak = Math.max(peak, Math.abs(x))
  if (peak > 0.95) for (let c = 0; c < out.numberOfChannels; c += 1) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i += 1) d[i] *= 0.95 / peak }
  return out
}

// "Listen": the opening's sound on its own, once.
export async function playOpening(scene = { type: 'clock' }) {
  const S = sceneSeconds()
  const buf = openingTrack([scene], (t) => t, Math.min(S, clockSwitch() + 0.9))
  const A = window.AudioContext || window.webkitAudioContext
  if (!buf || !A) return
  const ctx = new A()
  const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start()
  s.onended = () => ctx.close().catch(() => {})
}
export const playClock = () => playOpening()
