import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('voice is recorded without phone-call processing and shaped for the video', () => {
  const v = read('src/lib/studioVoice.js')
  assert.match(v, /echoCancellation: false, autoGainControl: false, noiseSuppression: true/)
  assert.match(v, /f\('highpass', 85/)
  assert.match(v, /db\(-16\)/)
  const r = read('src/lib/videoRender.js')
  assert.match(r, /spec\.studio !== false/)
  assert.match(r, /mixUnder\(voice, bed\)/)
  const m = read('src/pages/admin/VideoMaker.jsx')
  assert.match(m, /Studio voice/)
  assert.match(m, /mic = await openMic\(\)/)
  assert.ok(!/getUserMedia\(\{ audio: \{ echoCancellation: true/.test(read('src/lib/listingVideo.js')))
})

test('the clock opening ticks by default, and it can be turned off', () => {
  const fx = read('src/lib/videoFx.js')
  assert.match(fx, /Math\.floor\(local \* 5\)/)
  assert.match(fx, /export function openingTrack/)
  const r = read('src/lib/videoRender.js')
  assert.match(r, /spec\.ticks !== false/)
  const m = read('src/pages/admin/VideoMaker.jsx')
  assert.match(m, /localStorage\.getItem\('zm-video-ticks'\) !== '0'/)
  assert.match(m, /motion, studio, ticks,/)
})
