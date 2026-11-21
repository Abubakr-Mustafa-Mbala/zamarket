// "Talk freely": you speak naturally over a video, and every moment shows
// what you are talking about. This function hears the recording (every word
// with its time) and looks at the listing's photos, then says which scene or
// photo goes with each part of what you said. The browser builds the video.
import { callModel } from './ai-assist.js'

const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const fail = (status, message) => respond(status, { message })
const MAX_AUDIO = 5_500_000
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

// Words with times, from whichever transcription model this account has.
// whisper-1 gives every word's time; the newer diarize model gives sentence
// times, and words are spread evenly inside each sentence.
async function hear(apiKey, audio, prompt) {
  const ask = async (model, extra) => {
    const form = new FormData()
    form.append('file', audio, audio.name || 'voice.webm')
    form.append('model', model)
    for (const [k, v] of extra) form.append(k, v)
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(22000) })
    return { res, body: await res.json().catch(() => ({})) }
  }
  const first = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1'
  let { res, body } = await ask(first, [['response_format', 'verbose_json'], ['timestamp_granularities[]', 'word'], ['timestamp_granularities[]', 'segment'], ['prompt', prompt]])
  if (res.ok && Array.isArray(body.words)) {
    return { text: body.text || '', words: body.words.map((w) => ({ w: String(w.word || '').trim(), s: Number(w.start) || 0, e: Number(w.end) || 0 })).filter((w) => w.w) }
  }
  if (res.status === 401) throw Object.assign(new Error('OPENAI_API_KEY is invalid or expired'), { status: 503 })
  if (res.status === 429) throw Object.assign(new Error('The AI provider is busy or your OpenAI limit has been reached'), { status: 429 })
  // whisper-1 retired or refused: sentence times from the diarize model.
  ;({ res, body } = await ask(process.env.OPENAI_TRANSCRIBE_SEGMENTS_MODEL || 'gpt-4o-transcribe-diarize', [['response_format', 'diarized_json'], ['chunking_strategy', 'auto']]))
  if (!res.ok || !Array.isArray(body.segments)) throw Object.assign(new Error(`The AI could not hear the recording (${body?.error?.message || res.status})`), { status: 502 })
  const words = []
  for (const seg of body.segments) {
    const list = String(seg.text || '').split(/\s+/).filter(Boolean)
    const s = Number(seg.start) || 0; const e = Math.max(s + 0.2, Number(seg.end) || s)
    list.forEach((w, i) => words.push({ w, s: s + ((e - s) * i) / list.length, e: s + ((e - s) * (i + 1)) / list.length }))
  }
  return { text: body.text || words.map((w) => w.w).join(' '), words }
}

// What you said, cut into moments of about 1.5–6 seconds at your pauses and
// full stops, so the picture can change as often as a good editor would.
export function moments(words) {
  const out = []
  let cur = null
  const close = () => { if (cur) { out.push({ n: out.length, start: cur.s, end: cur.e, text: cur.t.join(' ') }); cur = null } }
  words.forEach((w, i) => {
    const gap = cur ? w.s - cur.e : 0
    const long = cur ? w.e - cur.s : 0
    if (cur && ((gap > 0.45 && long > 1.0) || long > 6 || (/[.!?]$/.test(cur.t[cur.t.length - 1]) && long > 0.9))) close()
    if (!cur) cur = { s: w.s, e: w.e, t: [] }
    cur.t.push(w.w); cur.e = w.e
    if (i === words.length - 1) close()
  })
  // A very short last moment joins the one before.
  if (out.length > 1 && out[out.length - 1].end - out[out.length - 1].start < 1) {
    const last = out.pop(); const prev = out[out.length - 1]
    prev.end = last.end; prev.text = `${prev.text} ${last.text}`
  }
  return out
}

// Keep only picks that name a real visual; fill gaps; keep the end card last.
export function cleanPicks(picks, list, ids) {
  const valid = new Set(ids)
  const byN = new Map((Array.isArray(picks) ? picks : []).filter((p) => Number.isInteger(p?.n) && valid.has(p.show)).map((p) => [p.n, p.show]))
  const firstPhoto = ids.find((x) => x.startsWith('p')) || ids.find((x) => x.startsWith('s')) || ids[0]
  let prev = firstPhoto
  const out = list.map((m, i) => {
    let show = byN.get(m.n) || prev
    if (show === 'end' && i < list.length - 2) show = prev === 'end' ? firstPhoto : prev
    prev = show
    return { ...m, show }
  })
  return out
}

export default async function listen(request) {
  if (request.method !== 'POST') return fail(405, 'Method not allowed')
  if (Number(request.headers.get('content-length') || 0) > MAX_AUDIO + 200_000) return fail(413, 'The recording is too long. Keep it under about 3 minutes.')
  const sb = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  const apiKey = process.env.OPENAI_API_KEY
  if (!sb || !anon || !apiKey) return fail(503, 'The AI helper is not set up. Add OPENAI_API_KEY on Netlify.')
  const token = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return fail(401, 'Please sign in first')

  // Two short steps, each well inside the time a site function may run:
  // "hear" (words and their times) then "edit" (what shows when).
  let form
  try { form = await request.formData() } catch { return fail(400, 'Invalid request') }
  const step = String(form.get('step') || 'hear')
  const audio = form.get('audio')
  let meta = {}
  try { meta = JSON.parse(String(form.get('meta') || '{}')) } catch { return fail(400, 'Invalid request') }
  if (step === 'hear') {
    if (!audio || typeof audio === 'string' || !audio.size) return fail(400, 'No recording was sent')
    if (audio.size > MAX_AUDIO) return fail(413, 'The recording is too long. Keep it under about 3 minutes.')
  } else if (step !== 'edit') return fail(400, 'Unknown step')

  // Same permission and hourly limit as the other video helpers.
  const authHeaders = { apikey: anon, Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  try {
    const quota = await fetch(`${sb}/rest/v1/rpc/claim_ai_assist`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ p_task: 'lead' }), signal: AbortSignal.timeout(6500) })
    if (quota.status === 401) return fail(401, 'Your sign-in has expired')
    if (!quota.ok) return fail(403, 'You do not have permission to use this helper')
    if (await quota.json() !== true) return fail(429, 'You have used this helper a lot in the last hour. Please try again later.')
  } catch { return fail(503, 'Could not check your permission. Please try again.') }

  const title = clip(meta.title, 120)
  // Scenes the video already has, described by the browser in plain words.
  const scenes = (Array.isArray(meta.scenes) ? meta.scenes : []).slice(0, 30).map((s, i) => ({ id: `s${i}`, what: clip(s, 220) }))
  // Photos: only https links on this site's own storage or site.
  const host = new URL(sb).host
  const photos = (Array.isArray(meta.photos) ? meta.photos : []).filter((u) => { try { const x = new URL(u); return x.protocol === 'https:' && (x.host === host || x.host.endsWith('zamarket.shop')) } catch { return false } }).slice(0, 16)

  if (step === 'hear') {
    let heard
    try {
      const vocab = [title, 'ZaMarket', 'zamarket.shop', 'Lusaka', 'kwacha', 'nshima', ...(Array.isArray(meta.words) ? meta.words.slice(0, 30).map((x) => clip(x, 40)) : [])].filter(Boolean).join(', ')
      heard = await hear(apiKey, audio, clip(`${vocab}.`, 800))
    } catch (e) { return fail(e.status || 502, e.message) }
    if (!heard.words.length) return fail(422, 'No words were heard in this recording. Record again, closer to the phone.')
    return respond(200, { text: heard.text, words: heard.words, moments: moments(heard.words) })
  }

  // edit: the moments come back from the browser, checked and capped here.
  const list = (Array.isArray(meta.moments) ? meta.moments : []).slice(0, 80).map((m, n) => ({ n, start: Math.max(0, Number(m.start) || 0), end: Math.max(0, Number(m.end) || 0), text: clip(m.text, 300) }))
  if (!list.length) return fail(400, 'Nothing to place')
  const ids = [...scenes.map((s) => s.id), ...photos.map((_, i) => `p${i}`), 'end']

  const { data, error } = await callModel(apiKey, {
    name: 'zamarket_talk_edit', maxTokens: 2600, images: photos.length ? photos : null,
    schema: {
      type: 'object', additionalProperties: false, required: ['picks'],
      properties: { picks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'show'], properties: { n: { type: 'integer' }, show: { type: 'string', enum: ids } } } } },
    },
    instructions: [
      'You are a professional video editor cutting a short vertical video (TikTok/Reels) for ZaMarket, an online marketplace in Lusaka, Zambia.',
      `The video is about: ${title || 'a listing'}.`,
      'The presenter talked freely over it. You get what they said, cut into numbered moments with times, the scenes the video already has (s0, s1, …, described in words), and the listing photos in order (p0, p1, … are the attached images, in the order attached).',
      'For EVERY moment, choose what is on screen while it is said: one scene id, one photo id, or "end".',
      'Show exactly what is being talked about at that moment: if they mention the leather seats, show the photo or scene where seats are visible; the engine → the engine photo; the price or cost → the scene with the price; specifications such as year, mileage, gearbox or fuel → the specifications scene; the menu or a dish → that dish; how to order → the how-to scene.',
      'When the talk is general (greetings, opinions, stories), keep the picture moving: use the best outside photos and vary them, starting with the strongest first picture. Avoid showing the same thing for more than about 8 seconds in a row; never repeat a picture just shown unless the talk is still about it.',
      'Use "end" only for the last one or two moments, when they invite people to visit the website, message, call or follow.',
      'Only choose a photo for something you can actually SEE in it. Answer with one pick per moment.',
    ],
    input: { moments: list.map((m) => ({ n: m.n, from: Number(m.start.toFixed(1)), to: Number(m.end.toFixed(1)), said: m.text })), scenes, photos: photos.map((_, i) => `p${i}`) },
  })
  if (error) return error
  return respond(200, { moments: cleanPicks(data?.picks, list, ids) })
}

export const config = { path: '/api/voice-listen' }
