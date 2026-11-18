import { drawFrame, videoLength, heldTime, setPace, setMotion, loadPhotos, endCard, W, H } from './listingVideo'
import { tools } from './videoFinish'

// Builds the video frame by frame, as fast as the phone can encode, instead
// of recording the screen in real time. A 30-second video takes seconds, and
// nothing depends on the screen being drawn, so the result is the same
// whatever the phone was doing. With your voice, the recording of your voice
// and the moments you tapped Next decide when each scene shows.

export const canRenderFast = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'

const FPS = 30

// Hands control back to the page between frames. Not a timer: phones slow
// timers right down when the page is in the background.
const breathe = () => new Promise((ok) => { const c = new MessageChannel(); c.port1.onmessage = () => ok(); c.port2.postMessage(0) })

export async function renderJob(spec, onProgress) {
  const mb = await tools()
  const slides = spec.script.slides
  const cache = new Map()
  await loadPhotos(slides.flatMap((x) => [x.photo, ...(x.photos || [])]), cache)
  const imgs = slides.map((x) => (x.type === 'collage' ? (x.photos || []).map((u) => cache.get(u)).filter(Boolean) : cache.get(x.photo) || null))
  const end = await endCard(spec.script, spec.link)
  const apply = () => { setPace(spec.pace); setMotion(spec.motion) }
  apply()

  // Your voice, if you recorded it.
  let voice = null
  if (spec.audio) {
    const raw = await spec.audio.arrayBuffer()
    voice = await new OfflineAudioContext(1, 48000, 48000).decodeAudioData(raw)
  }

  // When each scene shows.
  let length; let timeAt
  if (spec.marks?.length) {
    const marks = [...spec.marks].sort((a, b) => a.at - b.at)
    length = Math.max(1, voice ? voice.duration : spec.duration || 1)
    timeAt = (t) => { let m = marks[0]; for (const x of marks) { if (x.at <= t) m = x; else break } return heldTime(m.i, Math.max(0, t - m.at), slides) }
  } else {
    length = videoLength(slides)
    timeAt = (t) => t
  }

  // Full HD when the phone can encode it, otherwise 720p.
  let w = 1080; let h = 1920
  if (!(await mb.canEncodeVideo('avc', { width: w, height: h }).catch(() => false))) { w = 720; h = 1280 }
  if (!(await mb.canEncodeVideo('avc', { width: w, height: h }).catch(() => false))) throw new Error('This phone cannot make MP4 videos here. Try Chrome.')

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  const scale = w / W

  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const video = new mb.CanvasSource(canvas, { codec: 'avc', bitrate: w > 720 ? 8_000_000 : 5_000_000, keyFrameInterval: 2 })
  output.addVideoTrack(video, { frameRate: FPS })
  let sound = null
  if (voice) { sound = new mb.AudioBufferSource({ codec: 'aac', bitrate: 128000 }); output.addAudioTrack(sound) }
  await output.start()
  if (sound) { await sound.add(voice); sound.close() }

  const frames = Math.ceil(length * FPS)
  for (let i = 0; i < frames; i += 1) {
    apply()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    drawFrame(ctx, timeAt(i / FPS), slides, imgs, end)
    await video.add(i / FPS, 1 / FPS)
    if (i % 6 === 0) { onProgress?.(i / frames); await breathe() }
  }
  video.close()
  await output.finalize()
  onProgress?.(1)
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), width: w, height: h, seconds: length }
}
