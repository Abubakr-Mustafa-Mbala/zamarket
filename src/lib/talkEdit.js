// "Talk freely": record yourself explaining the item however you like, then
// the video is cut to your voice. The AI writes down every word with its
// time and picks, for each moment, the scene or photo that shows what you are
// talking about. Your words can also appear on screen as captions.
import { supabase } from './supabase'

async function call(step, meta, audio) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Please sign in again to use this helper.')
  const form = new FormData()
  form.append('step', step)
  form.append('meta', JSON.stringify(meta))
  if (audio) form.append('audio', audio, audio.name || `voice.${/mp4|m4a|aac/.test(audio.type) ? 'm4a' : /ogg/.test(audio.type) ? 'ogg' : /wav/.test(audio.type) ? 'wav' : /mpeg|mp3/.test(audio.type) ? 'mp3' : 'webm'}`)
  let res
  try { res = await fetch('/api/voice-listen', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }) } catch { throw new Error('Could not reach the helper. Check your connection and try again.') }
  const answer = await res.json().catch(() => null)
  if (!res.ok) throw new Error(answer?.message || (res.status === 413 ? 'The recording is too long. Keep it under about 3 minutes.' : 'The helper could not answer just now.'))
  return answer
}

// A scene, in plain words, for the AI editor.
export function describeScene(s) {
  const bits = []
  const kind = { specs: 'Specifications card', offer: 'Price and offer card', howto: 'How to order', menu: 'Menu', route: 'Delivery route', collage: 'Several photos', mwall: 'Wall of products', mbig: 'Big words', mphone: 'The shop on a phone', mcats: 'Categories', msteps: 'Steps', clock: 'Clock', hookfood: 'Food close-up', hookbusy: 'Busy workday words' }[s.type] || (s.feature ? 'Feature with photo' : s.photo ? 'Photo' : 'Words')
  bits.push(kind)
  if (s.kicker) bits.push(s.kicker)
  if (s.line) bits.push(s.line)
  if (s.sub) bits.push(s.sub)
  if (Array.isArray(s.rows)) bits.push(s.rows.map((r) => (Array.isArray(r) ? r.join(' ') : r)).join(', '))
  if (s.say) bits.push(`(said: ${s.say})`)
  return bits.join(' — ').slice(0, 220)
}

// Hear the recording: words with their times, cut into moments.
export function hearTalk(audio, { title, words = [] }) { return call('hear', { title, words }, audio) }

// What shows for each moment.
export function editTalk(moments, { title, slides, photos }) {
  return call('edit', { title, moments: moments.map((m) => ({ start: m.start, end: m.end, text: m.text })), scenes: slides.map(describeScene), photos })
}

export { captionBites, planSlides } from './talkPlan.js'

// The recording made ready: silence before you start trimmed, room for the
// end card after you finish. Returns the audio and the times to use.
export async function shapeTalk(file, firstWord, lastWord, { endMin = 4 } = {}) {
  const { wav } = await import('./aiVoiceLayout')
  const rate = 48000
  const buf = await new OfflineAudioContext(1, rate, rate).decodeAudioData(await file.arrayBuffer())
  const mono = new Float32Array(buf.length)
  for (let c = 0; c < buf.numberOfChannels; c += 1) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 1) mono[i] += d[i] / buf.numberOfChannels }
  const shift = Math.max(0, firstWord - 0.35)
  const speechEnd = Math.min(buf.duration, lastWord + 0.4) - shift
  const length = speechEnd + endMin
  const out = new Float32Array(Math.round(length * rate))
  const from = Math.round(shift * rate)
  out.set(mono.subarray(from, Math.min(mono.length, from + out.length)))
  return { audio: wav(out, rate), shift, speechEnd, length }
}
