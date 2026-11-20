import { askAssist } from './aiAssist'
import { layVoice, pcmToFloat, wav } from './aiVoiceLayout'

// An AI voice reads the video's script: one clip per scene, then the video is
// built around it exactly like a voice you recorded yourself (each scene shows
// while its line is read, as if you had tapped Next at the end of each line).

export const AI_VOICES = [
  ['marin', 'Female · warm'],
  ['cedar', 'Male · deep'],
  ['coral', 'Female · bright'],
  ['ash', 'Male · clear'],
]
export const AI_TONES = [['warm', 'Warm'], ['energetic', 'Energetic'], ['calm', 'Calm']]

const cache = new Map()

// The finished voice-over for a script: { audio (a WAV file), marks,
// duration, unsure (lines the voice may not have read exactly) }.
export async function aiVoiceOver(script, voice, tone) {
  const lines = [...script.slides.map((x) => x.say || ''), script.endSay || '']
  const key = JSON.stringify([voice, tone, lines])
  if (cache.has(key)) return cache.get(key)
  const r = await askAssist({ task: 'voice', voice, tone, lines })
  const clips = r.clips.map((c) => pcmToFloat(c.pcm))
  const { samples, marks, duration } = layVoice(clips, r.rate, script.slides.length)
  const out = { audio: wav(samples, r.rate), marks, duration, unsure: r.clips.map((c, i) => (c.ok ? -1 : i)).filter((i) => i >= 0) }
  cache.set(key, out)
  return out
}
