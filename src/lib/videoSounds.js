// Your own background sounds for videos without a voice: nasheeds or
// qasa'id (voices only) that you add from your phone once and pick each
// time. Kept on this phone only, like My videos.

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

export async function addSound(file) {
  if (!file?.type?.startsWith('audio/') && !/\.(mp3|m4a|aac|wav|ogg|opus|webm)$/i.test(file?.name || '')) throw new Error('Choose an audio file (MP3, M4A…)')
  if (file.size > 40 * 1048576) throw new Error('That file is too big (over 40 MB). Choose a shorter one.')
  const seconds = await lengthOf(file)
  if (!(seconds > 1)) throw new Error('This phone cannot play that file. Try an MP3 or M4A.')
  const sound = { id: `s${Date.now().toString(36)}`, name: (file.name || 'Sound').replace(/\.[a-z0-9]+$/i, '').slice(0, 60), blob: file, seconds, addedAt: Date.now() }
  await tx('readwrite', (s) => s.put(sound))
  return sound
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
