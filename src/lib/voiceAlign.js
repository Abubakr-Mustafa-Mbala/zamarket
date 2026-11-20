// Puts a voice-over you recorded in one go (in the app, or with any recorder
// app) exactly in place: it finds the short pauses between your lines and
// starts each scene just before you begin its line. Nothing is sent anywhere;
// it only listens for where you breathe between lines.
//
// It looks for as many pauses as there are line changes, preferring the
// longest pauses close to where each line should begin (judged by how many
// words come before it). A one-second breath between lines makes it exact.

const FRAME = 0.02 // seconds per loudness step
const MIN_GAP = 0.28 // a pause at least this long can separate two lines

const wordCount = (t) => String(t || '').split(/\s+/).filter(Boolean).length

function loudness(samples, rate) {
  const step = Math.max(1, Math.round(rate * FRAME))
  const n = Math.floor(samples.length / step)
  const lv = new Float32Array(n)
  for (let f = 0; f < n; f += 1) {
    let s = 0
    for (let i = f * step; i < (f + 1) * step; i += 1) s += samples[i] * samples[i]
    lv[f] = Math.sqrt(s / step)
  }
  return lv
}

// Where speech is, frame by frame, and the pauses between.
export function pausesIn(samples, rate) {
  const lv = loudness(samples, rate)
  const sorted = Array.from(lv).sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.1)] || 0
  const loud = sorted[Math.floor(sorted.length * 0.95)] || 0
  const on = Math.max(floor * 3, loud * 0.12, 0.004)
  const speech = Array.from(lv, (x) => x > on)
  // Ignore clicks: speech must last 3 frames to count.
  for (let f = 0; f < speech.length; f += 1) if (speech[f] && !(speech[f + 1] && speech[f + 2]) && !(speech[f - 1] && speech[f - 2])) speech[f] = false
  const first = speech.indexOf(true)
  const last = speech.lastIndexOf(true)
  if (first < 0) return { start: 0, end: 0, gaps: [] }
  const gaps = []
  let g = -1
  for (let f = first; f <= last; f += 1) {
    if (!speech[f] && g < 0) g = f
    if (speech[f] && g >= 0) { if ((f - g) * FRAME >= MIN_GAP) gaps.push({ from: g * FRAME, to: f * FRAME }); g = -1 }
  }
  return { start: first * FRAME, end: (last + 1) * FRAME, gaps }
}

// When each line starts, in seconds. `lines` are the texts in order (empty
// ones get no time of their own).
export function lineStarts(samples, rate, lines) {
  const { start, end, gaps } = pausesIn(samples, rate)
  const spoken = lines.map((t, i) => [i, wordCount(t)]).filter(([, w]) => w > 0)
  const K = spoken.length - 1 // line changes to find
  const span = Math.max(0.1, end - start)
  const totalWords = spoken.reduce((n, [, w]) => n + w, 0) || 1
  // Where each change "should" be if you spoke at an even speed.
  let acc = 0
  const expect = spoken.slice(0, -1).map(([, w]) => { acc += w; return start + (acc / totalWords) * span })
  // Best ordered choice of K pauses: long pauses near where expected.
  const G = gaps.length
  const score = (g, k) => Math.min(1.5, gaps[g].to - gaps[g].from) - 2.2 * Math.abs((gaps[g].from + gaps[g].to) / 2 - expect[k]) / span
  let chosen = []
  if (K > 0 && G >= K) {
    const NEG = -1e9
    const best = Array.from({ length: K }, () => new Float64Array(G).fill(NEG))
    const from = Array.from({ length: K }, () => new Int32Array(G).fill(-1))
    for (let g = 0; g < G; g += 1) best[0][g] = score(g, 0)
    for (let k = 1; k < K; k += 1) {
      let run = NEG; let runAt = -1
      for (let g = k; g < G; g += 1) {
        if (best[k - 1][g - 1] > run) { run = best[k - 1][g - 1]; runAt = g - 1 }
        if (runAt >= 0) { best[k][g] = run + score(g, k); from[k][g] = runAt }
      }
    }
    let g = 0
    for (let x = 1; x < G; x += 1) if (best[K - 1][x] > best[K - 1][g]) g = x
    for (let k = K - 1; k >= 0; k -= 1) { chosen[k] = gaps[g]; g = from[k][g] }
  } else if (K > 0) {
    // Fewer pauses than lines: use the pauses there are, the rest by words.
    chosen = expect.map((t) => gaps.find((x) => Math.abs((x.from + x.to) / 2 - t) < span * 0.06) || { from: t, to: t })
    for (let k = 1; k < chosen.length; k += 1) if (chosen[k].to <= chosen[k - 1].to) chosen[k] = { from: expect[k], to: expect[k] }
  }
  const found = chosen.filter((x) => x.to > x.from).length
  // Each line starts a moment before your first word of it.
  const at = new Array(lines.length).fill(null)
  spoken.forEach(([i], k) => { at[i] = k === 0 ? Math.max(0, start - 0.25) : Math.max(chosen[k - 1].from, chosen[k - 1].to - 0.2) })
  // Lines with nothing to say sit just before the next spoken line.
  for (let i = lines.length - 1; i >= 0; i -= 1) if (at[i] == null) at[i] = i + 1 < lines.length ? at[i + 1] : end
  return { at, start, end, found, needed: Math.max(0, K), confident: K <= 0 || found >= K }
}

// In the browser: a recording (any audio or video file) → the voice-over for
// the video, with the moment each scene starts. Silence before you start is
// trimmed, and the end card gets time to stay on screen.
export async function placeVoice(file, lines, { endMin = 4.5 } = {}) {
  const { wav } = await import('./aiVoiceLayout')
  const rate = 48000
  const raw = await file.arrayBuffer()
  const buf = await new OfflineAudioContext(1, rate, rate).decodeAudioData(raw)
  const mono = new Float32Array(buf.length)
  for (let c = 0; c < buf.numberOfChannels; c += 1) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 1) mono[i] += d[i] / buf.numberOfChannels }
  const r = lineStarts(mono, rate, lines)
  if (r.end <= r.start) throw new Error('No voice was heard in this recording. Record again, closer to the phone.')
  const cut = Math.max(0, r.start - 0.3)
  const last = lines.length - 1
  const endAt = r.at[last] - cut
  const length = Math.max(r.end - cut + 0.4, endAt + endMin)
  const out = new Float32Array(Math.round(length * rate))
  out.set(mono.subarray(Math.round(cut * rate), Math.round(cut * rate) + out.length).subarray(0, out.length))
  return {
    audio: wav(out, rate),
    marks: r.at.map((t, i) => ({ i, at: Math.max(0, t - cut) })),
    duration: length, found: r.found, needed: r.needed, confident: r.confident,
  }
}
