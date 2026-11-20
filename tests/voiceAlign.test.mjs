import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineStarts } from '../src/lib/voiceAlign.js'

// A pretend recording: "speech" bursts with pauses, at 8 kHz.
function speak(parts, rate = 8000) {
  const len = parts.reduce((n, [, d]) => n + d, 0)
  const s = new Float32Array(Math.round(len * rate))
  let o = 0
  for (const [on, d] of parts) {
    const n = Math.round(d * rate)
    for (let i = 0; i < n; i += 1) s[o + i] = on ? 0.3 * Math.sin(i / 3) * (0.6 + 0.4 * Math.sin(i / 400)) : (Math.random() - 0.5) * 0.004
    o += n
  }
  return s
}

test('finds the breath between lines, not the commas inside a line', () => {
  const lines = ['Twelve thirty. What is for lunch today? Already sorted.', 'Golden chicken stew with rice.', 'Cooked fresh every morning, in our kitchen, for you.', 'Order on ZaMarket.']
  // line 1 has a short comma pause; line 3 has two
  const rec = speak([[0, 0.8], [1, 1.5], [0, 0.3], [1, 1.4], [0, 1.0], [1, 1.8], [0, 0.9], [1, 1.2], [0, 0.32], [1, 0.9], [0, 0.3], [1, 1.0], [0, 1.1], [1, 1.3], [0, 1.0]])
  const r = lineStarts(rec, 8000, lines)
  assert.equal(r.confident, true)
  const want = [0.55, 4.8, 7.5, 12.32]
  r.at.forEach((t, i) => assert.ok(Math.abs(t - want[i]) < 0.12, `line ${i}: ${t} vs ${want[i]}`))
})

test('empty lines sit just before the next line; no pauses still gives an answer', () => {
  const rec = speak([[0, 0.5], [1, 3], [0, 0.5]])
  const r = lineStarts(rec, 8000, ['one two three', '', 'four five six'])
  assert.equal(r.at.length, 3)
  assert.equal(r.at[1], r.at[2])
  assert.ok(r.at[2] > r.at[0])
})
