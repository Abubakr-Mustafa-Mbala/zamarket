// Your own background sounds for videos without a voice: nasheeds or
// qasa'id (voices only) that you add once and pick each time. Each one is
// kept on this phone AND in a private online folder for the team, so it shows
// on every phone you sign in on; the sound itself is fetched the first time
// it is used on a phone, then kept there.

import { tools } from './videoFinish'
import { supabase } from './supabase'

const BUCKET = 'video-sounds'
// The online file name carries what the list needs: id, length, name.
const cloudName = (s) => `${s.id}__${Math.round(s.seconds)}__${s.name.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'sound'}.${/mpeg|mp3/.test(s.blob?.type || '') ? 'mp3' : 'm4a'}`
const fromCloudName = (n) => {
  const m = /^(s[a-z0-9]+)__(\d+)__(.+)\.(mp3|m4a)$/.exec(n)
  return m ? { id: m[1], seconds: Number(m[2]), name: m[3].replace(/-/g, ' '), path: n } : null
}

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

const localSounds = async () => (await tx('readonly', (s) => s.getAll())) || []

// This phone's sounds, plus the team's online ones not on this phone yet
// (those come without the sound itself; soundBlob fetches it when chosen).
// A sound added on this phone before it could go online is sent now.
export async function listSounds() {
  const mine = await localSounds()
  let online = []
  let listed = false
  try {
    const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } })
    if (!error) listed = true
    if (!error) online = (data || []).map((o) => ({ ...fromCloudName(o.name), addedAt: Date.parse(o.created_at) || 0 })).filter((x) => x.id)
  } catch { /* offline: this phone's sounds only */ }
  const here = new Set(mine.map((x) => x.id))
  const there = new Set(online.map((x) => x.id))
  if (listed) for (const x of mine) if (!there.has(x.id) && x.blob) pushOnline(x)
  return [...mine.map((x) => ({ ...x, online: there.has(x.id) || !!x.online })), ...online.filter((x) => !here.has(x.id)).map((x) => ({ ...x, blob: null, online: true }))]
    .sort((a, b) => b.addedAt - a.addedAt)
}

async function pushOnline(sound) {
  if (!sound.blob) return false
  try {
    const { error } = await supabase.storage.from(BUCKET).upload(cloudName(sound), sound.blob, { contentType: sound.blob.type || 'audio/mp4', upsert: true })
    if (error) return false
    await tx('readwrite', (st) => st.put({ ...sound, online: true }))
    return true
  } catch { return false }
}

// The sound itself: from this phone, or fetched from the online folder once.
export async function soundBlob(sound) {
  if (sound?.blob) return sound.blob
  const { data, error } = await supabase.storage.from(BUCKET).download(sound.path)
  if (error || !data) throw new Error('Could not fetch that sound. Check your internet and try again.')
  const blob = data.type ? data : new Blob([data], { type: sound.path.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4' })
  const { path, ...rest } = sound
  await tx('readwrite', (st) => st.put({ ...rest, blob, online: true, cloudPath: path }))
  return blob
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
  sound.online = await pushOnline(sound)
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

// Removed from this phone and from the online folder (so from every phone).
export async function removeSound(sound) {
  const mine = (await localSounds()).find((x) => x.id === sound.id)
  const path = sound.path || mine?.cloudPath || (mine?.blob ? cloudName(mine) : null)
  if (path) { try { await supabase.storage.from(BUCKET).remove([path]) } catch { /* offline */ } }
  return tx('readwrite', (s) => s.delete(sound.id))
}

// The wave of a sound, for choosing the part to play: loudness in 160 bars.
// Read at a low sample rate so even a long nasheed is quick and light.
const waves = new Map()
export async function soundWave(sound, blob, bars = 160) {
  if (waves.has(sound.id)) return waves.get(sound.id)
  const raw = await blob.arrayBuffer()
  const buf = await new OfflineAudioContext(1, 1, 8000).decodeAudioData(raw)
  const data = buf.getChannelData(0)
  const step = Math.max(1, Math.floor(data.length / bars))
  const peaks = []
  for (let b = 0; b < bars; b += 1) {
    let m = 0
    for (let k = b * step; k < Math.min(data.length, (b + 1) * step); k += 4) m = Math.max(m, Math.abs(data[k]))
    peaks.push(m)
  }
  const top = Math.max(...peaks, 0.01)
  const wave = peaks.map((x) => x / top)
  waves.set(sound.id, wave)
  return wave
}

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
