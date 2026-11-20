// "My videos": every video you make is kept on this phone, finished or not.
// Making a video does not depend on the video maker page being open: you can
// go to another page and it carries on. If the phone stops the work (screen
// locked, app closed), it starts again by itself when you come back.
// Kept light: the drawing and encoding code loads only when a video is made.

const DB = 'zm-videos'
const STORE = 'videos'
const KEEP = 15

let jobs = []
let loaded = null
let running = false
const subs = new Set()
const urls = new Map()

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
const save = (job) => tx('readwrite', (s) => s.put(strip(job)))
const strip = ({ progress, ...rest }) => rest

let last = 0
function emit(force) {
  const now = Date.now()
  if (!force && now - last < 250) return
  last = now
  const snapshot = jobs.map((j) => ({ ...j, url: j.blob ? urlFor(j) : null }))
  subs.forEach((fn) => fn(snapshot))
}
function urlFor(j) {
  if (!urls.has(j.id)) urls.set(j.id, URL.createObjectURL(j.blob))
  return urls.get(j.id)
}

export function subscribeVideos(fn) {
  subs.add(fn)
  loadVideos().then(() => emit(true))
  return () => subs.delete(fn)
}

export function loadVideos() {
  if (!loaded) {
    loaded = (async () => {
      const all = (await tx('readonly', (s) => s.getAll())) || []
      jobs = all.sort((a, b) => b.createdAt - a.createdAt).map((j) => (j.status === 'making' ? { ...j, status: 'waiting' } : j))
      emit(true)
      pump()
    })()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) pump() })
  }
  return loaded
}

export async function startVideo(spec) {
  await loadVideos()
  const job = { id: `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: spec.title, caption: spec.script.caption || '', slug: spec.slug, kind: spec.kind, createdAt: Date.now(), status: 'waiting', progress: 0, seen: false, spec }
  jobs = [job, ...jobs]
  await save(job)
  // Old finished videos beyond the last few are let go, to keep the phone tidy.
  const old = jobs.filter((j) => j.status === 'ready').slice(KEEP)
  for (const j of old) await removeVideo(j.id)
  emit(true)
  pump()
  return job.id
}

// A video made the old way (real-time recording) on a phone that cannot
// build videos frame by frame: kept in the same list.
export async function keepVideo({ title, slug, kind, caption, blob, seconds }) {
  await loadVideos()
  const job = { id: `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title, slug, kind, caption, createdAt: Date.now(), status: 'ready', progress: 1, seen: false, blob, size: blob.size, seconds, ext: 'mp4' }
  jobs = [job, ...jobs]
  await save(job)
  emit(true)
}

export async function removeVideo(id) {
  jobs = jobs.filter((j) => j.id !== id)
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id) }
  await tx('readwrite', (s) => s.delete(id))
  emit(true)
}

// Stop a video you no longer want: a waiting one is simply dropped; one being
// made stops at the next frame and is dropped too.
const cancelled = new Set()
export async function cancelVideo(id) {
  const j = jobs.find((x) => x.id === id)
  if (!j) return
  if (j.status === 'making') { cancelled.add(id); j.status = 'stopping'; emit(true); return }
  await removeVideo(id)
}

export async function retryVideo(id) {
  const j = jobs.find((x) => x.id === id)
  if (!j || !j.spec) return
  j.status = 'waiting'; j.error = ''
  await save(j); emit(true); pump()
}

export function markSeen() {
  let changed = false
  for (const j of jobs) if (j.status === 'ready' && !j.seen) { j.seen = true; save(j); changed = true }
  if (changed) emit(true)
}

// One video at a time, oldest waiting first.
async function pump() {
  if (running) return
  const job = [...jobs].reverse().find((j) => j.status === 'waiting')
  if (!job) return
  running = true
  job.status = 'making'; job.progress = 0; emit(true)
  let lock = null
  try { lock = await navigator.wakeLock?.request('screen') } catch { /* not allowed */ }
  try {
    const { renderJob } = await import('./videoRender')
    const r = await renderJob(job.spec, (p) => { job.progress = p; emit() }, () => cancelled.has(job.id))
    Object.assign(job, { status: 'ready', blob: r.blob, seconds: r.seconds, size: r.blob.size, ext: 'mp4', progress: 1, finishedAt: Date.now() })
    delete job.spec.audio // the voice (or the sound) is inside the video now
    delete job.spec.music
    await save(job)
  } catch (e) {
    console.warn('[video] making stopped', e)
    // You cancelled it: it is dropped below.
    if (cancelled.has(job.id)) { /* nothing to keep */ }
    // Stopped because the phone put the page away: carry on when back.
    else if (typeof document !== 'undefined' && document.hidden) job.status = 'waiting'
    else {
      job.status = 'failed'
      job.error = /NO_FAST|encod|codec/i.test(String(e?.message || e))
        ? 'This phone cannot build it quickly. Open the listing and tap Make video again; it will record it the slower way.'
        : String(e?.message || e)
      job.slow = /NO_FAST|encod|codec/i.test(String(e?.message || e))
    }
    if (!cancelled.has(job.id)) await save(job)
  } finally {
    try { await lock?.release() } catch { /* ignore */ }
    running = false
    if (cancelled.has(job.id)) { cancelled.delete(job.id); await removeVideo(job.id) }
    emit(true)
  }
  if (typeof document === 'undefined' || !document.hidden) pump()
}
