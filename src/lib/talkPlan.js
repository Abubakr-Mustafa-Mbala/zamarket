// The pure parts of Talk freely (no network, no audio), kept apart so they
// can be tested on their own.

// Words in on-screen bites of up to three words, broken at pauses and full stops.
export function captionBites(words, shift = 0) {
  const out = []
  let cur = null
  for (const w of words) {
    const s = Math.max(0, w.s - shift); const e = Math.max(s + 0.05, w.e - shift)
    const brk = cur && (cur.words.length >= 3 || s - cur.e > 0.35 || /[.!?,]$/.test(cur.words[cur.words.length - 1].w) || (cur.words.map((x) => x.w).join(' ') + w.w).length > 18)
    if (brk) { out.push(cur); cur = null }
    if (!cur) cur = { s, e, words: [] }
    cur.words.push({ w: w.w, s, e }); cur.e = e
  }
  if (cur) out.push(cur)
  // Each bite stays until the next begins (no flicker in short pauses).
  for (let i = 0; i < out.length - 1; i += 1) if (out[i + 1].s - out[i].e < 0.6) out[i].e = out[i + 1].s
  return out
}

// The cards keep their words; on photo scenes the captions say it instead.
const CARD = new Set(['specs', 'offer', 'howto', 'menu', 'route', 'mwall', 'mbig', 'mphone', 'mcats', 'msteps', 'clock', 'hookfood', 'hookbusy'])

// The video's slides in the order you talked, and when each starts.
export function planSlides(moments, slides, photos, { captions = true, shift = 0 } = {}) {
  const groups = []
  for (const m of moments) {
    const last = groups[groups.length - 1]
    if (last && last.show === m.show) { last.end = m.end; last.text += ` ${m.text}` } else groups.push({ show: m.show, start: m.start, end: m.end, text: m.text })
  }
  const out = []; const marks = []; let endAt = null
  groups.forEach((g, k) => {
    const at = k === 0 ? 0 : Math.max(0, g.start - shift - 0.12)
    if (g.show === 'end') { if (endAt == null) endAt = at; return }
    let s
    if (g.show.startsWith('s')) {
      const src = slides[Number(g.show.slice(1))]
      if (!src) return
      s = { ...src, id: `${src.id || 's'}-t${k}` }
      if (captions && !CARD.has(s.type)) s = { ...s, kicker: '', line: '', sub: '' }
    } else {
      const url = photos[Number(g.show.slice(1))]
      if (!url) return
      s = { id: `p-t${k}`, photo: url, kicker: '', line: '', sub: '', say: '' }
    }
    if (endAt != null) return // nothing after the end card
    marks.push({ i: out.length, at }); out.push(s)
  })
  return { slides: out, marks, endAt }
}

