import test from 'node:test'
import assert from 'node:assert/strict'
import { captionBites, planSlides } from '../src/lib/talkPlan.js'
import { moments, cleanPicks } from '../netlify/functions/voice-listen.js'

const words = 'This is a 2021 Toyota Fortuner. Look at the leather seats. Price is K799,000. Visit zamarket.shop today.'.split(' ').map((w, i) => ({ w, s: 1 + i * 0.4, e: 1 + i * 0.4 + 0.3 }))

test('speech is cut into moments at full stops', () => {
  const m = moments(words)
  assert.deepEqual(m.map((x) => x.text), ['This is a 2021 Toyota Fortuner.', 'Look at the leather seats.', 'Price is K799,000.', 'Visit zamarket.shop today.'])
})

test('the AI cannot put the end card in the middle or name a visual that does not exist', () => {
  const m = moments(words)
  const p = cleanPicks([{ n: 0, show: 'p0' }, { n: 1, show: 'end' }, { n: 2, show: 'x9' }, { n: 3, show: 'end' }], m, ['s0', 'p0', 'p1', 'end'])
  assert.deepEqual(p.map((x) => x.show), ['p0', 'p0', 'p0', 'end'])
})

test('the video follows the talk: scenes in spoken order, end card when they invite people', () => {
  const slides = [{ id: 'a', type: 'specs', rows: [['Year', '2021']] }, { id: 'b', line: 'Leather seats', photo: 'https://x/seat.jpg', feature: true }]
  const plan = planSlides([
    { start: 1, end: 3, text: 'This is', show: 'p0' },
    { start: 3.2, end: 5, text: 'leather seats', show: 's1' },
    { start: 5.2, end: 6, text: 'seats again', show: 's1' },
    { start: 6.2, end: 8, text: 'year', show: 's0' },
    { start: 8.2, end: 9, text: 'visit', show: 'end' },
  ], slides, ['https://x/front.jpg'], { captions: true, shift: 0.65 })
  assert.equal(plan.slides.length, 3)
  assert.equal(plan.slides[0].photo, 'https://x/front.jpg')
  assert.equal(plan.slides[1].line, '', 'photo scenes let the captions say it')
  assert.equal(plan.slides[2].type, 'specs')
  assert.deepEqual(plan.marks.map((x) => x.i), [0, 1, 2])
  assert.equal(plan.marks[0].at, 0)
  assert.ok(Math.abs(plan.marks[1].at - (3.2 - 0.65 - 0.12)) < 1e-9)
  assert.ok(Math.abs(plan.endAt - (8.2 - 0.65 - 0.12)) < 1e-9)
})

test('captions come in short bites, broken at full stops', () => {
  const b = captionBites(words, 0.65)
  assert.ok(b.every((x) => x.words.length <= 3))
  assert.equal(b[0].words[0].s, 1 - 0.65)
  assert.ok(b.every((x) => x.words.slice(0, -1).every((w) => !/[.!?]$/.test(w.w))), 'a full stop always ends a bite')
})
