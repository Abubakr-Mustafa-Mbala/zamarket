import test from 'node:test'
import assert from 'node:assert/strict'
import { safeArticleUrl, describeVideo, mediaMarkdown, validateArticleFile } from '../src/lib/blogMedia.js'

test('blocks unsafe links and allows HTTPS and internal routes', () => {
  assert.equal(safeArticleUrl('javascript:alert(1)'), null)
  assert.equal(safeArticleUrl('//evil.test'), null)
  assert.equal(safeArticleUrl('data:text/html,evil'), null)
  assert.equal(safeArticleUrl('http://example.com/pic.jpg'), null)
  assert.equal(safeArticleUrl('https://a.example/pic.jpg'), 'https://a.example/pic.jpg')
  assert.equal(safeArticleUrl('/p/blue-lamp'), '/p/blue-lamp')
})

test('supports canonical YouTube, shorts, Vimeo and hosted video without raw arbitrary embeds', () => {
  assert.deepEqual(describeVideo('https://youtu.be/aB123456_90'), { kind: 'embed', src: 'https://www.youtube-nocookie.com/embed/aB123456_90', provider: 'YouTube' })
  assert.equal(describeVideo('https://www.youtube.com/shorts/aB123456_90')?.provider, 'YouTube')
  assert.equal(describeVideo('https://vimeo.com/12345678')?.src, 'https://player.vimeo.com/video/12345678')
  assert.equal(describeVideo('https://storage.example/video.mp4')?.kind, 'file')
  assert.equal(describeVideo('https://unknown.example/watch?v=aB123456_90'), null)
})

test('creates safe markdown with alt description and rejects invalid videos', () => {
  assert.equal(mediaMarkdown('image', 'https://cdn.example/lamp.png', 'Blue [lamp]'), '![Blue  lamp](https://cdn.example/lamp.png)')
  assert.equal(mediaMarkdown('video', 'https://vimeo.com/1234'), '[video](https://vimeo.com/1234)')
  assert.throws(() => mediaMarkdown('video', 'https://random.example/iframe.html'))
})

test('allows only image and video upload types within 25MB', () => {
  assert.equal(validateArticleFile({ type: 'image/jpeg', size: 3000 }), 'jpg')
  assert.equal(validateArticleFile({ type: 'video/mp4', size: 1024 }), 'mp4')
  assert.throws(() => validateArticleFile({ type: 'text/html', size: 1000 }))
  assert.throws(() => validateArticleFile({ type: 'image/png', size: 26 * 1024 * 1024 }))
})
