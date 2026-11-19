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
