// Laying an AI voice-over out scene by scene (no imports, so it can be tested
// on its own).

const MIN_SCENE = 2.4 // seconds: even a short line leaves time to see the scene
const LEAD = 0.2 // a breath before each line
const TAIL = 0.35 // and after it
const END_MIN = 4.5 // the end card stays at least this long

export function pcmToFloat(b64) {
  const bin = atob(b64)
  const n = Math.floor(bin.length / 2)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    let v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)
    if (v >= 0x8000) v -= 0x10000
    out[i] = v / 32768
  }
  return out
}

export function wav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i += 1) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i += 1) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true)
  return new Blob([buf], { type: 'audio/wav' })
}

// Lays the clips one after another and notes when each scene starts.
export function layVoice(clips, rate, sceneCount) {
  const pieces = []; const marks = []; let at = 0
  clips.forEach((clip, i) => {
    const isEnd = i === sceneCount
    const lead = clip.length ? LEAD : 0
    const said = clip.length / rate
    const len = Math.max(isEnd ? END_MIN : MIN_SCENE, lead + said + TAIL)
    marks.push({ i, at })
    const block = new Float32Array(Math.round(len * rate))
    block.set(clip.subarray(0, block.length - Math.round(lead * rate)), Math.round(lead * rate))
    pieces.push(block); at += block.length / rate
  })
  const all = new Float32Array(pieces.reduce((n, p) => n + p.length, 0))
  let o = 0; for (const p of pieces) { all.set(p, o); o += p.length }
  return { samples: all, marks, duration: all.length / rate }
}
