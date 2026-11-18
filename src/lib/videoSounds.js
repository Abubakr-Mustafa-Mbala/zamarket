// Your own background sounds for videos without a voice: nasheeds or
// qasa'id (voices only) that you add from your phone once and pick each
// time. Kept on this phone only, like My videos.

import { tools } from './videoFinish'

const DB = 'zm-sounds'
const STORE = 'sounds'
const CHOICE = 'zm-video-sound'

function db() {
  return new Promise((ok, bad) => {
    if (typeof indexedDB === 'undefined') return bad(new Error('no storage'))
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => ok(r.result)
    r.onerror = () => bad(r.error)
  })
}
async function tx(mode, fn) {
  try {
    const d = await db()
    return await new Promise((ok, bad) => {
      const t = d.transaction(STORE, mode)
      const req = fn(t.objectStore(STORE))
      t.oncomplete = () => ok(req?.result)
      t.onerror = () => bad(t.error)
    })
  } catch { return null }
}

export async function listSounds() {
  const all = (await tx('readonly', (s) => s.getAll())) || []
  return all.sort((a, b) => b.addedAt - a.addedAt)
}

// Length in seconds, read by the browser (0 if it cannot tell).
function lengthOf(blob) {
  return new Promise((ok) => {
    const a = document.createElement('audio')
    const url = URL.createObjectURL(blob)
    const done = (n) => { URL.revokeObjectURL(url); ok(Number.isFinite(n) ? n : 0) }
    a.preload = 'metadata'
    a.onloadedmetadata = () => done(a.duration)
    a.onerror = () => done(0)
    a.src = url
  })
}

const VIDEO_EXT = /\.(mp4|mov|m4v|3gp|mkv|avi)$/i
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|opus|webm|flac|amr)$/i
const isVideo = (f) => f?.type?.startsWith('video/') || VIDEO_EXT.test(f?.name || '')
const isAudio = (f) => f?.type?.startsWith('audio/') || AUDIO_EXT.test(f?.name || '')

// Only the sound of a file, as a small AAC (.m4a): takes the sound out of a
// video, and shrinks a very large audio file. Done on the phone.
async function soundOnly(file, onProgress) {
  const mb = await tools()
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS })
  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const conversion = await mb.Conversion.init({ input, output, showWarnings: false, video: { discard: true }, audio: { codec: 'aac', bitrate: 128000 } })
  if (!conversion.isValid) throw new Error('No sound found in that file')
  if (onProgress) conversion.onProgress = onProgress
  await conversion.execute()
  return new Blob([target.buffer], { type: 'audio/mp4' })
}

export async function addSound(file, { onProgress, name } = {}) {
  const video = isVideo(file)
  if (!video && !isAudio(file)) throw new Error('Choose a sound (MP3, M4A…) or a video')
  if (file.size > (video ? 1024 : 300) * 1048576) throw new Error(video ? 'That video is over 1 GB. Choose a shorter one.' : 'That file is over 300 MB.')
  let blob = file
  // From a video, or a big audio file: keep only the sound, small.
  if (video || file.size > 20 * 1048576) {
    try { blob = await soundOnly(file, onProgress) } catch (e) {
      if (video) throw new Error('Could not take the sound out of that video. Try another one.')
      console.warn('[sound] kept as it is', e)
    }
  }
  const seconds = await lengthOf(blob)
  if (!(seconds > 1)) throw new Error('This phone cannot play that file. Try an MP3 or M4A.')
  const sound = { id: `s${Date.now().toString(36)}`, name: (name || file.name || 'Sound').replace(/\.[a-z0-9]+$/i, '').replace(/[_+]/g, ' ').slice(0, 60), blob, seconds, addedAt: Date.now(), from: video ? 'video' : 'audio' }
  await tx('readwrite', (s) => s.put(sound))
  return sound
}

// A sound (or video) from a link on the internet: the link of the file
// itself, such as an MP3 on the Internet Archive. Sites that do not let apps
// take their files (most social media) refuse, and we say so.
export async function addSoundFromLink(link, opts = {}) {
  let url
  try { url = new URL(String(link || '').trim()) } catch { throw new Error('That is not a link. Paste the whole link, starting with https://') }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Paste a link that starts with https://')
  if (/(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|spotify\.com)/i.test(url.hostname)) {
    throw new Error('Those sites do not let apps take their sounds. If the creator allows it, save it to your phone there, then use From a video.')
  }
  let res
  try { res = await fetch(url.href, { mode: 'cors', credentials: 'omit' }) } catch {
    throw new Error('That site does not let apps take its files. Open the link, download it to your phone, then use Add from phone.')
  }
  if (!res.ok) throw new Error(`The site answered ${res.status}. Check the link.`)
  const type = (res.headers.get('content-type') || '').split(';')[0]
  if (/text\/html/.test(type)) throw new Error('That is a web page, not the file. On the page, find the download link of the MP3 (or video) and paste that.')
  const size = Number(res.headers.get('content-length') || 0)
  if (size > 1024 * 1048576) throw new Error('That file is over 1 GB.')
  const blob = await res.blob()
  const base = decodeURIComponent(url.pathname.split('/').pop() || 'Sound')
  const file = new File([blob], base, { type: blob.type || type || '' })
  return addSound(file, opts)
}

export const removeSound = (id) => tx('readwrite', (s) => s.delete(id))

export function savedChoice() {
  try { return JSON.parse(localStorage.getItem(CHOICE) || 'null') } catch { return null }
}
export function saveChoice(c) {
  try { localStorage.setItem(CHOICE, JSON.stringify(c)) } catch { /* ignore */ }
}

// The sound laid under a video of `length` seconds: starting where you
// chose, looping if the video is longer, fading in and out.
export async function soundBed(blob, start, length, rate = 48000) {
  const raw = await blob.arrayBuffer()
  const decoded = await new OfflineAudioContext(2, rate, rate).decodeAudioData(raw)
  const ctx = new OfflineAudioContext(2, Math.ceil(length * rate), rate)
  const src = ctx.createBufferSource()
  src.buffer = decoded
  src.loop = true
  const gain = ctx.createGain()
  const fadeIn = Math.min(0.8, length / 4)
  const fadeOut = Math.min(2, length / 3)
  gain.gain.setValueAtTime(0, 0)
  gain.gain.linearRampToValueAtTime(1, fadeIn)
  gain.gain.setValueAtTime(1, Math.max(fadeIn, length - fadeOut))
  gain.gain.linearRampToValueAtTime(0, length)
  src.connect(gain).connect(ctx.destination)
  src.start(0, Math.max(0, Math.min(start || 0, decoded.duration - 0.5)))
  return ctx.startRendering()
}
