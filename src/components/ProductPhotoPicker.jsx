/** Shared, accessible selector for any seller-uploaded photograph. */
export default function ProductPhotoPicker({ images = [], selected, onSelect }) {
  const photos = [...new Set((Array.isArray(images) ? images : []).filter((x) => typeof x === 'string' && x.trim()))]
  if (photos.length < 2) return null
  return (
    <fieldset className="za-photo-selector">
      <legend>Choose the photograph to feature</legend>
      <div className="za-photo-selector-rail" aria-label="Product photo choices">
        {photos.map((src, index) => (
          <button key={src} type="button" className={`za-photo-choice ${selected === src || (!selected && index === 0) ? 'is-selected' : ''}`}
            aria-label={`Use product photo ${index + 1} of ${photos.length}`} aria-pressed={selected === src || (!selected && index === 0)}
            onClick={() => onSelect(src)}>
            <img src={src} loading="lazy" alt={`Product photo ${index + 1}`} />
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
      <p className="tiny muted">The chosen photograph leads the poster. Several Angles keeps the other photos too.</p>
    </fieldset>
  )
}
