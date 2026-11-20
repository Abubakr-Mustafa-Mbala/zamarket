import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('AI voice: checked lines, only staff quota, realtime model (speech models shut down Jan 2027)', async () => {
  const fn = await import('../netlify/functions/ai-assist.js')
  assert.equal(fn.saidRatio('Chicken stew with rice.', 'Chicken stew with rice.'), 1)
  assert.ok(fn.saidRatio('Chicken stew with rice.', 'Sure! Here is a lovely description: chicken stew with rice.') < 0.85)
  assert.equal(fn.cleanLines(new Array(19).fill('a')), null)
  assert.equal(fn.cleanLines(['a'.repeat(300), 'b'.repeat(300)]).length, 2)
  const src = read('netlify/functions/ai-assist.js')
  assert.match(src, /gpt-realtime-2\.1-mini/)
  assert.doesNotMatch(src, /v1\/audio\/speech/)
  assert.match(src, /task === 'voice' \? 'lead'/)
})

test('AI voice is laid out scene by scene, each long enough to see', async () => {
  const { layVoice } = await import('../src/lib/aiVoiceLayout.js')
  const rate = 1000
  const { marks, duration } = layVoice([new Float32Array(3000), new Float32Array(500), new Float32Array(1000)], rate, 2)
  assert.deepEqual(marks.map((m) => m.i), [0, 1, 2])
  assert.ok(Math.abs(marks[1].at - 3.55) < 0.01)
  assert.ok(Math.abs(marks[2].at - 5.95) < 0.01)
  assert.ok(duration >= 5.95 + 4.5 - 0.01)
})
