import { clockSwitch, sceneSeconds } from './listingVideo'

// The sound of the 12:30 opening: a clock ticking loud and clear while the
// hands run to lunchtime, then a soft whoosh as the photo rises in. Made
// right here (no recording, no music): short wooden clicks, tick and tock.

const RATE = 48000

// When the ticks fall in the finished video. `timeAt` turns video time into
// story time (with your voice, the scenes follow the moments you tapped Next).
export function clockMoments(slides, timeAt, length) {
  const S = sceneSeconds(); const T = clockSwitch(); const run = T * 0.75
  const ticks = []; const whooshes = []
  let lastTick = -1; let lastScene = -1; let lastLocal = 0
  for (let t = 0; t < length; t += 1 / 240) {
    const st = timeAt(t)
    const i = Math.floor(st / S)
    if (i >= slides.length || slides[i]?.type !== 'clock') { lastScene = i; continue }
    const local = st - i * S
    if (i !== lastScene) { lastTick = -1; lastLocal = 0 }
    const n = Math.floor(local * 5) // five ticks a second while the hands run
    if (local < run + 0.2 && n !== lastTick) { ticks.push({ t, tock: n % 2 === 1 }); lastTick = n }
    if (lastLocal < T - 0.15 && local >= T - 0.15) whooshes.push(t)
    lastScene = i; lastLocal = local
  }
  return { ticks, whooshes }
}

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

// The ticking as a sound track of the video's length (null if no clock).
export function clockTrack(slides, timeAt, length) {
  const { ticks, whooshes } = clockMoments(slides, timeAt, length)
  if (!ticks.length) return null
  const buf = new AudioBuffer({ length: Math.ceil(length * RATE), numberOfChannels: 1, sampleRate: RATE })
  const d = buf.getChannelData(0)
  ticks.forEach((x) => addTick(d, x.t, x.tock))
  whooshes.forEach((t) => addWhoosh(d, t))
  return buf
}

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
export async function playClock() {
  const S = sceneSeconds()
  const slides = [{ type: 'clock' }]
  const buf = clockTrack(slides, (t) => t, Math.min(S, clockSwitch() + 0.8))
  const A = window.AudioContext || window.webkitAudioContext
  if (!buf || !A) return
  const ctx = new A()
  const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start()
  s.onended = () => ctx.close().catch(() => {})
}
