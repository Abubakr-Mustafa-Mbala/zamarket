import { useEffect, useRef, useState } from 'react'

// Full-screen photo viewer for the product page. Tap a photo to open it,
// tap Zoom (or double-tap the photo) to see it twice as large and drag
// around it, swipe or use the arrows to move between photos.
export default function PhotoViewer({ images = [], start = 0, alt = '', onClose }) {
  const [i, setI] = useState(start)
  const [zoom, setZoom] = useState(false)
  const box = useRef(null)
  const touch = useRef(null)
  const lastTap = useRef(0)
  const count = images.length
  const go = (d) => { setZoom(false); setI((n) => (n + d + count) % count) }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && count > 1) go(1)
      else if (e.key === 'ArrowLeft' && count > 1) go(-1)
    }
    window.addEventListener('keydown', key)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', key) }
  }, [count]) // eslint-disable-line react-hooks/exhaustive-deps

  // When zooming in, start at the middle of the photo rather than its corner.
  useEffect(() => {
    const el = box.current
    if (!el) return
    if (zoom) { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; el.scrollTop = (el.scrollHeight - el.clientHeight) / 2 }
    else { el.scrollLeft = 0; el.scrollTop = 0 }
  }, [zoom, i])

  const onTouchStart = (e) => {
    if (e.touches.length !== 1) { touch.current = null; return }
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e) => {
    const t = touch.current
    touch.current = null
    if (!t || zoom || count < 2) return
    const p = e.changedTouches[0]
    const dx = p.clientX - t.x, dy = p.clientY - t.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
  }
  const onPhotoClick = () => {
    const now = Date.now()
    if (now - lastTap.current < 320) { setZoom((z) => !z); lastTap.current = 0 }
    else lastTap.current = now
  }

  if (!count) return null
  return (
    <div className="pv" role="dialog" aria-modal="true" aria-label="Product photos">
      <div className="pv-bar">
        <span className="pv-count">{count > 1 ? `${i + 1} of ${count}` : ''}</span>
        <button type="button" className="pv-btn" onClick={() => setZoom((z) => !z)}>{zoom ? 'Fit to screen' : 'Zoom'}</button>
        <button type="button" className="pv-btn pv-close" onClick={onClose} aria-label="Close photos">✕</button>
      </div>
      <div ref={box} className={`pv-stage${zoom ? ' zoomed' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img src={images[i]} alt={alt} onClick={onPhotoClick} draggable={false} />
      </div>
      {count > 1 && !zoom && (
        <>
          <button type="button" className="pv-nav prev" onClick={() => go(-1)} aria-label="Previous photo">‹</button>
          <button type="button" className="pv-nav next" onClick={() => go(1)} aria-label="Next photo">›</button>
        </>
      )}
    </div>
  )
}
