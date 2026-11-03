import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { ARTICLE_MEDIA_BUCKET, mediaMarkdown, validateArticleFile } from '../lib/blogMedia'

/** Upload permissions are enforced by the storage bucket, not browser UI. */
export default function BlogMediaTools({ onInsert, onCover, notify, fallbackAlt = '' }) {
  const [kind, setKind] = useState('image')
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [busy, setBusy] = useState(false)

  function insert(nextKind, nextUrl) {
    try {
      const snippet = mediaMarkdown(nextKind, nextUrl, alt || (nextKind === 'image' ? fallbackAlt : ''))
      onInsert(snippet)
      setUrl('')
      notify?.('Media added to your article')
    } catch (e) { notify?.(e.message, true) }
  }

  async function upload(e, asCover = false) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const ext = validateArticleFile(file)
      if (asCover && !file.type.startsWith('image/')) throw new Error('Cover images must be pictures, not videos.')
      const pathname = `articles/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from(ARTICLE_MEDIA_BUCKET).upload(pathname, file, {
        upsert: false, cacheControl: '3600', contentType: file.type,
      })
      if (error) throw new Error(`${error.message}. Make sure the blog-media migration has been applied.`)
      const { data } = supabase.storage.from(ARTICLE_MEDIA_BUCKET).getPublicUrl(pathname)
      const publicUrl = data?.publicUrl
      if (!publicUrl) throw new Error('Could not obtain a public image URL.')
      if (asCover) onCover(publicUrl)
      else insert(file.type.startsWith('video/') ? 'video' : 'image', publicUrl)
      if (asCover) notify?.('Cover image uploaded')
    } catch (err) { notify?.(err.message, true) }
    finally { setBusy(false) }
  }

  return (
    <section className="card stack-sm blog-media-tools" aria-label="Article media">
      <div>
        <h3>Images and video</h3>
        <p className="small muted">Upload images or MP4/WebM videos, or insert a YouTube or Vimeo link. Media appears inside the article where you put the cursor.</p>
      </div>
      <div className="btn-row wrap">
        <label className="btn sm blog-upload-btn">
          {busy ? 'Uploading…' : 'Upload image or video'}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" disabled={busy} onChange={(e) => upload(e)} />
        </label>
        <label className="btn sm blog-upload-btn">
          Upload cover image
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={(e) => upload(e, true)} />
        </label>
      </div>
      <div className="blog-media-line">
        <label className="small strong" htmlFor="blog-media-kind">Insert a link</label>
        <select id="blog-media-kind" className="input" value={kind} onChange={e => setKind(e.target.value)}>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
        <input className="input" type="url" placeholder="Paste a HTTPS image, YouTube, Vimeo or video link" value={url} onChange={e => setUrl(e.target.value)} />
        <button className="btn sm primary" type="button" onClick={() => insert(kind, url)}>Insert</button>
      </div>
      <label className="small muted" htmlFor="blog-media-alt">Image description (helps screen readers and image search)</label>
      <input id="blog-media-alt" className="input" value={alt} onChange={e => setAlt(e.target.value)} placeholder="e.g. Brown leather handbag on a wooden table" maxLength={140} />
      <p className="tiny muted">File limit: 25 MB. Write your own original captions and use only media you have permission to publish. Video previews appear in the public article.</p>
    </section>
  )
}
