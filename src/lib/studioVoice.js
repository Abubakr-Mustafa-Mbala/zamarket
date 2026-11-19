// Makes a voice recorded on a phone sound like a voice-over: close, warm and
// even, instead of thin and roomy.
//
// Why a phone recording sounds like a phone: the browser treats the mic as a
// phone call (echo cancelling and automatic volume pumping, which make the
// voice thin and wobbly), the room echo and hiss sit between the words, and
// the level goes up and down. So:
//   1. record without the call processing (MIC below), keeping only the
//      background-noise reduction;
//   2. afterwards, quiet the room between phrases (a soft gate), take out the
//      rumble and the "boxy" room sound, add warmth and clarity, even the
//      level out (compressor), and bring it to a steady, loud-enough volume.
// The timing is never changed, so the scenes stay where you tapped Next.

export const MIC = { echoCancellation: false, autoGainControl: false, noiseSuppression: true, channelCount: 1, sampleRate: 48000 }

// Asks for the clean mic; falls back to whatever the phone gives.
export async function openMic() {
  try { return await navigator.mediaDevices.getUserMedia({ audio: MIC }) } catch (e) {
    if (/NotAllowed|Permission|Security/i.test(e.name || e.message)) throw e
    return navigator.mediaDevices.getUserMedia({ audio: true })
  }
}

const db = (x) => 10 ** (x / 20)

// The sound shaping, the same in the finished video and while recording live.
function chain(ctx, input) {
  const f = (type, freq, gain = 0, Q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = freq; b.gain.value = gain; b.Q.value = Q; return b }
  const steps = [
    f('highpass', 85, 0, 0.7), // handling noise and rumble
    f('lowshelf', 180, 2.5), // warmth, as if closer to the mic
    f('peaking', 380, -3, 1.1), // the boxy room sound
    f('peaking', 3200, 3, 0.9), // clear, easy to understand
    f('peaking', 6800, -1.5, 3), // softer "s" sounds
    f('highshelf', 10000, 1.5), // a little air
  ]
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -24; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.16
  const makeup = ctx.createGain(); makeup.gain.value = db(6)
  const limit = ctx.createDynamicsCompressor()
  limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.08
  let node = input
  for (const s of [...steps, comp, makeup, limit]) { node.connect(s); node = s }
  return node
}

// Quiets the room between phrases: windows clearly below the speech level are
// turned down smoothly (never to silence, which sounds unnatural).
function gate(data, rate) {
  const win = Math.round(rate * 0.01)
  const n = Math.ceil(data.length / win)
  const lv = new Float32Array(n)
  for (let w = 0; w < n; w += 1) {
    let s = 0; const a = w * win; const b = Math.min(data.length, a + win)
    for (let i = a; i < b; i += 1) s += data[i] * data[i]
    lv[w] = Math.sqrt(s / Math.max(1, b - a))
  }
  const sorted = Array.from(lv).sort((x, y) => x - y)
  const floor = sorted[Math.floor(n * 0.1)] || 0
  const speech = sorted[Math.floor(n * 0.9)] || 0
  if (!speech || speech < floor * 3) return // no clear gap between room and voice: leave it
  const open = Math.max(floor * 2.5, speech * 0.08)
  const target = new Float32Array(n)
  // Open a little before and after each word so nothing is clipped.
  for (let w = 0; w < n; w += 1) if (lv[w] > open) for (let k = Math.max(0, w - 4); k <= Math.min(n - 1, w + 18); k += 1) target[k] = 1
  let g = 1
  for (let w = 0; w < n; w += 1) {
    const want = target[w] ? 1 : 0.3
    g += (want - g) * (want > g ? 0.6 : 0.08)
    const a = w * win; const b = Math.min(data.length, a + win)
    for (let i = a; i < b; i += 1) data[i] *= g
  }
}

const rms = (d) => { let s = 0; let c = 0; for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i]) > 0.003) { s += d[i] * d[i]; c += 1 } } return c ? Math.sqrt(s / c) : 0 }

// The finished voice, for the video.
export async function studioVoice(buffer) {
  const rate = buffer.sampleRate
  const mono = new Float32Array(buffer.length)
  for (let c = 0; c < buffer.numberOfChannels; c += 1) { const d = buffer.getChannelData(c); for (let i = 0; i < d.length; i += 1) mono[i] += d[i] / buffer.numberOfChannels }
  // A steady starting level, so quiet and loud recordings come out the same.
  const level = rms(mono)
  if (level) { const k = Math.min(12, db(-20) / level); for (let i = 0; i < mono.length; i += 1) mono[i] *= k }
  gate(mono, rate)
  const ctx = new OfflineAudioContext(1, mono.length, rate)
  const src = ctx.createBufferSource()
  const inBuf = ctx.createBuffer(1, mono.length, rate); inBuf.copyToChannel(mono, 0)
  src.buffer = inBuf
  chain(ctx, src).connect(ctx.destination)
  src.start(0)
  const out = await ctx.startRendering()
  // Loud and clear like other videos (about −16 dB), never clipping.
  const d = out.getChannelData(0)
  let peak = 0; for (let i = 0; i < d.length; i += 1) peak = Math.max(peak, Math.abs(d[i]))
  const r = rms(d)
  if (r && peak) { const k = Math.min(db(-16) / r, db(-1) / peak); for (let i = 0; i < d.length; i += 1) d[i] *= k }
  return out
}

// A nasheed played softly under the voice: the voice stays in front.
export function mixUnder(voice, bed, level = 0.14) {
  const rate = voice.sampleRate
  const ctx = new OfflineAudioContext(2, voice.length, rate)
  const v = ctx.createBufferSource(); v.buffer = voice
  const b = ctx.createBufferSource(); b.buffer = bed
  const g = ctx.createGain(); g.gain.value = level
  v.connect(ctx.destination); b.connect(g).connect(ctx.destination)
  v.start(0); b.start(0)
  return ctx.startRendering()
}

// While recording the slower way (the screen is recorded live): the same
// shaping on the live mic. Returns the stream to record and a stop function.
export function liveStudio(stream) {
  try {
    const ctx = new AudioContext()
    const out = ctx.createMediaStreamDestination()
    chain(ctx, ctx.createMediaStreamSource(stream)).connect(out)
    return { stream: out.stream, stop: () => ctx.close().catch(() => {}) }
  } catch { return { stream, stop: () => {} } }
}
