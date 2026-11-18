// What a phone's browser records is not a finished video file: Chrome writes
// MP4 in pieces with no length at the front (the gallery shows 00:00) and
// often Opus sound, and other phones write WebM. WhatsApp, Status and some
// apps refuse those. This rewrites the recording as an ordinary MP4: H.264
// picture, AAC sound, the length written at the start of the file.
// Loaded only when a video is finished, so pages stay light.
let aacReady = null

export async function tools() {
  const mb = await import('mediabunny')
  if (!aacReady) {
    aacReady = (async () => {
      if (await mb.canEncodeAudio('aac').catch(() => false)) return
      const { registerAacEncoder } = await import('@mediabunny/aac-encoder')
      registerAacEncoder()
    })()
  }
  await aacReady
  return mb
}

export async function finishVideo(blob, { onProgress } = {}) {
  const mb = await tools()
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS })
  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const conversion = await mb.Conversion.init({
    input, output, showWarnings: false,
    video: { codec: 'avc' },
    audio: { codec: 'aac', bitrate: 128000 },
  })
  if (!conversion.isValid) throw new Error('This phone cannot finish the video as MP4')
  if (onProgress) conversion.onProgress = onProgress
  await conversion.execute()
  return new Blob([target.buffer], { type: 'video/mp4' })
}

// Length in seconds as a video element reads it (0 when it cannot tell).
export function videoSeconds(blob, timeout = 6000) {
  return new Promise((res) => {
    const v = document.createElement('video')
    const url = URL.createObjectURL(blob)
    const done = (n) => { URL.revokeObjectURL(url); res(Number.isFinite(n) ? n : 0) }
    const t = setTimeout(() => done(0), timeout)
    v.preload = 'metadata'; v.muted = true
    v.onloadedmetadata = () => { clearTimeout(t); done(v.duration) }
    v.onerror = () => { clearTimeout(t); done(0) }
    v.src = url
  })
}
