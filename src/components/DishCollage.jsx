// The lunch cover, arranged from the seller's own dish photos: up to three
// plates laid out like a menu photo shoot, over the cover photo (softened)
// or a warm background. Nothing is generated: every image is a real photo of
// a real dish on the plan. With fewer than two dish photos the cover photo
// is shown as it is.
export function collagePhotos(dishes = [], max = 4) {
  const seen = new Set()
  const out = []
  for (const d of dishes) {
    const src = (d.images || []).find((x) => typeof x === 'string' && x)
    if (src && !seen.has(src)) { seen.add(src); out.push({ src, name: d.name }) }
    if (out.length >= max) break
  }
  return out
}

export default function DishCollage({ cover, dishes = [], className = '' }) {
  const shots = collagePhotos(dishes, 4)
  if (shots.length < 2) {
    return cover ? <div className={`dc dc-plain ${className}`}><img src={cover} alt="" /></div> : <div className={`dc dc-empty ${className}`} />
  }
  return (
    <div className={`dc dc-n${Math.min(shots.length, 4)} ${className}`} aria-hidden="true">
      {cover ? <img className="dc-bg" src={cover} alt="" /> : <span className="dc-bg dc-warm" />}
      <span className="dc-glow" />
      {shots.slice(0, 3).map((s, i) => (
        <figure key={s.src} className={`dc-plate dc-p${i + 1}`}><img src={s.src} alt="" loading={i ? 'lazy' : 'eager'} /></figure>
      ))}
      {shots[3] && <figure className="dc-plate dc-p4"><img src={shots[3].src} alt="" loading="lazy" /></figure>}
    </div>
  )
}
