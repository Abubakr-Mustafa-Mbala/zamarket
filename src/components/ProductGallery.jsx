import { useEffect, useState } from 'react'

// Keyboard-accessible product gallery; no new dependencies or database changes.
export default function ProductGallery({ images = [], name = 'Product', fallback }) {
  const valid = images.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url))
  const [selected, setSelected] = useState(0)
  const [zoom, setZoom] = useState(false)
  useEffect(() => { setSelected(0); setZoom(false) }, [images?.join('|')])
  useEffect(() => {
    if (!zoom) return
    const onKey = (e) => {
      if (e.key === 'Escape') setZoom(false)
      if (e.key === 'ArrowRight') setSelected((n) => (n + 1) % valid.length)
      if (e.key === 'ArrowLeft') setSelected((n) => (n + valid.length - 1) % valid.length)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [zoom, valid.length])
  if (!valid.length) return <div className="of-gallery-fallback">{fallback}</div>
  const current = valid[Math.min(selected, valid.length - 1)]
  return <div className="of-gallery">
    <button type="button" className="of-gallery-main" onClick={() => setZoom(true)} aria-label={`Enlarge image ${selected + 1} of ${valid.length} for ${name}`}>
      <img src={current} alt={`${name} — image ${selected + 1} of ${valid.length}`} fetchPriority="high" />
      <span className="of-gallery-hint">View larger · {selected + 1}/{valid.length}</span>
    </button>
    {valid.length > 1 && <div className="of-gallery-thumbs" aria-label="Product photos">
      {valid.map((url, i) => <button type="button" key={`${url}-${i}`} className={i === selected ? 'active' : ''} aria-label={`Show image ${i + 1}`} aria-pressed={i === selected} onClick={() => setSelected(i)}><img src={url} alt="" loading="lazy" /></button>)}
    </div>}
    {zoom && <div className="of-gallery-lightbox" role="dialog" aria-modal="true" aria-label={`${name} image viewer`} onClick={() => setZoom(false)}>
      <button type="button" className="of-gallery-close" onClick={() => setZoom(false)} aria-label="Close image viewer">×</button>
      {valid.length > 1 && <button type="button" className="of-gallery-prev" aria-label="Previous image" onClick={(e) => { e.stopPropagation(); setSelected((n) => (n + valid.length - 1) % valid.length) }}>‹</button>}
      <img src={current} alt={`${name} enlarged, image ${selected + 1} of ${valid.length}`} onClick={(e) => e.stopPropagation()} />
      {valid.length > 1 && <button type="button" className="of-gallery-next" aria-label="Next image" onClick={(e) => { e.stopPropagation(); setSelected((n) => (n + 1) % valid.length) }}>›</button>}
    </div>}
  </div>
}
