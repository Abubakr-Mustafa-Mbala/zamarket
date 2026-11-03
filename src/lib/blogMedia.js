// A deliberately small, safe media vocabulary for the public blog.
// Writers insert Markdown; public readers never execute arbitrary HTML.
export const ARTICLE_MEDIA_BUCKET = 'blog-media'
export const ARTICLE_MEDIA_MAX_BYTES = 25 * 1024 * 1024
export const ARTICLE_MEDIA_TYPES = Object.freeze({
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm',
})

export function safeArticleUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const value = raw.trim()
  if (value.startsWith('/') && !value.startsWith('//') && !/[\s\\]/.test(value)) return value
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function describeVideo(raw) {
  const safe = safeArticleUrl(raw)
  if (!safe || safe.startsWith('/')) return null
  const url = new URL(safe)
  const host = url.hostname.toLowerCase()
  let youtubeId = null
  if (host === 'youtu.be') youtubeId = url.pathname.split('/')[1]
  if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com' || host === 'www.youtube-nocookie.com') {
    if (url.pathname === '/watch') youtubeId = url.searchParams.get('v')
    else if (/^\/(?:shorts|embed)\//.test(url.pathname)) youtubeId = url.pathname.split('/')[2]
  }
  if (youtubeId && /^[a-zA-Z0-9_-]{11}$/.test(youtubeId))
    return { kind: 'embed', src: `https://www.youtube-nocookie.com/embed/${youtubeId}`, provider: 'YouTube' }
  if (host === 'vimeo.com' || host === 'www.vimeo.com' || host === 'player.vimeo.com') {
    const match = url.pathname.match(/^\/(?:video\/)?(\d+)(?:\/|$)/)
    if (match) return { kind: 'embed', src: `https://player.vimeo.com/video/${match[1]}`, provider: 'Vimeo' }
  }
  if (/\.(?:mp4|webm)$/i.test(url.pathname)) return { kind: 'file', src: safe, provider: 'Video' }
  return null
}

export function mediaMarkdown(kind, url, alt = '') {
  const safe = safeArticleUrl(url)
  if (!safe) throw new Error('Use a valid HTTPS media URL.')
  if (kind === 'video') {
    if (!describeVideo(safe)) throw new Error('Use a YouTube, Vimeo, HTTPS MP4 or HTTPS WebM video URL.')
    return `[video](${safe})`
  }
  if (kind !== 'image') throw new Error('Unsupported media type.')
  const label = String(alt || 'Product photo').replace(/[\[\]\r\n]/g, ' ').trim().slice(0, 140)
  return `![${label}](${safe})`
}

export function validateArticleFile(file) {
  if (!file || !ARTICLE_MEDIA_TYPES[file.type]) throw new Error('Choose a JPG, PNG, WebP, GIF, MP4 or WebM file.')
  if (file.size <= 0 || file.size > ARTICLE_MEDIA_MAX_BYTES) throw new Error('The file must be smaller than 25 MB.')
  return ARTICLE_MEDIA_TYPES[file.type]
}
