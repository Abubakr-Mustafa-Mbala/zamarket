import { tools } from './videoFinish'
import { soundBed } from './videoSounds'
import { duckUnder } from './studioVoice'

// Adds a nasheed to a video that is already made, without making it again:
// the picture is copied as it is (seconds, not minutes), and only the sound
// is new. A voice in the video stays in front; the nasheed is soft under it
// and comes up when the voice is quiet. A video with no sound gets the
// nasheed on its own.
export async function withNasheed(videoBlob, nasheedBlob, start = 0, onProgress) {
  const mb = await tools()
  const input = new mb.Input({ source: new mb.BlobSource(videoBlob), formats: mb.ALL_FORMATS })
  const track = await input.getPrimaryVideoTrack()
  if (!track) throw new Error('That video could not be read')
  const seconds = await input.computeDuration()
  // The sound already in the video (your voice, the AI voice, the opening).
  let voice = null
  if (await input.getPrimaryAudioTrack()) {
    try { voice = await new OfflineAudioContext(2, 48000, 48000).decodeAudioData(await videoBlob.arrayBuffer()) } catch { voice = null }
  }
  onProgress?.(0.1)
  const bed = await soundBed(nasheedBlob, start, seconds)
  const sound = voice ? duckUnder(voice, bed) : bed
  onProgress?.(0.3)
  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const picture = new mb.EncodedVideoPacketSource(track.codec)
  output.addVideoTrack(picture, track.rotation ? { rotation: track.rotation } : {})
  const audio = new mb.AudioBufferSource({ codec: 'aac', bitrate: 128000 })
  output.addAudioTrack(audio)
  await output.start()
  await audio.add(sound); audio.close()
  const config = await track.getDecoderConfig()
  const sink = new mb.EncodedPacketSink(track)
  let first = true
  for await (const packet of sink.packets()) {
    await picture.add(packet, first ? { decoderConfig: config } : undefined)
    first = false
    onProgress?.(0.3 + 0.7 * Math.min(1, packet.timestamp / Math.max(0.1, seconds)))
  }
  picture.close()
  await output.finalize()
  onProgress?.(1)
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), seconds }
}
