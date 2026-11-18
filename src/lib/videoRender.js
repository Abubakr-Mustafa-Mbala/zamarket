import { drawFrame, videoLength, heldTime, setPace, setMotion, loadPhotos, endCard, W, H } from './listingVideo'
import { tools } from './videoFinish'
import { fastEncoder, fastFailed } from './fastEncoder'
import { soundBed } from './videoSounds'

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

  // A nasheed under a video without a voice: from where you chose, looped
  // to the video's length, faded in and out.
  let bed = null
  if (!voice && spec.music?.blob) {
    try { bed = await soundBed(spec.music.blob, spec.music.start || 0, length) } catch (e) { console.warn('[video] sound skipped', e) }
  }

  // Full HD when the phone can encode it; on phones whose encoder only takes
  // landscape, the frames are stored sideways with a "rotate 90°" mark.
  const shape = await fastEncoder()
  if (!shape) throw new Error('NO_FAST')
  const { w, h, rot, codec } = shape
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  const portraitW = rot ? h : w
  const scale = portraitW / W
  const place = rot
    ? () => ctx.setTransform(0, -scale, scale, 0, 0, portraitW) // portrait (x, y) → stored (y, width − x)
    : () => ctx.setTransform(scale, 0, 0, scale, 0, 0)

  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const video = new mb.CanvasSource(canvas, { codec: 'avc', fullCodecString: codec, bitrate: Math.max(w, h) > 1280 ? 8_000_000 : 5_000_000, keyFrameInterval: 2 })
  output.addVideoTrack(video, { frameRate: FPS, ...(rot ? { rotation: rot } : {}) })
  let sound = null
  const audio = voice || bed
  if (audio) { sound = new mb.AudioBufferSource({ codec: 'aac', bitrate: 128000 }); output.addAudioTrack(sound) }
  await output.start()
  if (sound) { await sound.add(audio); sound.close() }

  const frames = Math.ceil(length * FPS)
  try {
  for (let i = 0; i < frames; i += 1) {
    apply()
    place()
    drawFrame(ctx, timeAt(i / FPS), slides, imgs, end)
    await video.add(i / FPS, 1 / FPS)
    if (i % 6 === 0) { onProgress?.(i / frames); await breathe() }
  }
  video.close()
  await output.finalize()
  } catch (e) {
    // The encoder broke while the page was on screen: this phone records the
    // slower way from now on.
    if (typeof document !== 'undefined' && !document.hidden) fastFailed()
    throw e
  }
  onProgress?.(1)
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), width: w, height: h, seconds: length }
}
