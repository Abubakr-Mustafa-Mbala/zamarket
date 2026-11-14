import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import OfferingCard from './OfferingCard'
import PhotoViewer from './PhotoViewer'

// Turns the product form into what the marketplace will show: the card
// shoppers see while browsing, and the top of the product page.
// Nothing here is saved; it only reads the form.
export function draftToProduct(p, { vendorName, shelf } = {}) {
  const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean)
  return {
    ...p,
    id: p.id || 'preview',
    slug: p.slug || 'preview',
    name: (p.name || '').trim() || 'Your product name',
    price: shelf != null ? Number(shelf) : Number(p.price) || 0,
    normal_price: p.normal_price ? Number(p.normal_price) : null,
    images: lines(p.images_text ?? (p.images || []).join('\n')),
    benefits: lines(p.benefits_text ?? (p.benefits || []).join('\n')),
    description: (p.description || '').trim(),
    vendor_name: vendorName || p.vendor?.business_name || p.vendor_name || null,
    stock_available: p.owner_type === 'founder' ? (p.stock_available ?? 1) || 1 : p.stock_available,
    package_count: 0,
    review_count: 0,
  }
}

// What the shopper pays when the vendor typed what they want to receive.
function useShelf(take, enabled) {
  const [shelf, setShelf] = useState(null)
  const amount = Number(take || 0)
  useEffect(() => {
    if (!enabled || !(amount > 0)) { setShelf(null); return }
    let alive = true
    const t = setTimeout(() => {
      supabase.rpc('price_preview', { p_take: amount }).then(({ data, error }) => { if (alive && !error) setShelf(data?.shelf ?? null) }).catch(() => {})
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [amount, enabled])
  return shelf
}

export default function ProductPreview({ draft, vendorName, takeHome = false }) {
  const shelf = useShelf(draft.vendor_price, takeHome)
  const p = draftToProduct(draft, { vendorName, shelf: takeHome ? shelf : null })
  const [img, setImg] = useState(0)
  const [viewer, setViewer] = useState(false)
  const save = p.normal_price && p.normal_price > p.price ? p.normal_price - p.price : 0
  const photo = p.images[Math.min(img, p.images.length - 1)]

  return (
    <div className="pp-wrap">
      <p className="small muted">This is how shoppers will see it. Nothing is saved until you press Save.</p>
      {takeHome && !(Number(draft.vendor_price) > 0) && <p className="small warn">Type what you want to receive to see the price shoppers pay.</p>}

      <div className="shop pp-stage">
        <div className="pp-label">In the marketplace</div>
        <div className="pp-card" inert="">
          <OfferingCard p={p} />
        </div>

        <div className="pp-label">On its own page</div>
        <div className="pdp pp-page">
          <div className="pdp-grid">
            <div className="pdp-gallery">
              <div className="main-img">
                {photo
                  ? <button type="button" className="main-img-open" onClick={() => setViewer(true)} aria-label="Open photo full screen"><img src={photo} alt={p.name} /><span className="main-img-hint" aria-hidden>Tap to zoom</span></button>
                  : <span className="pp-nophoto">Add photos to see them here</span>}
              </div>
              {p.images.length > 1 && (
                <div className="thumbs">
                  {p.images.map((src, i) => <button type="button" key={`${src}-${i}`} className={i === img ? 'on' : ''} onClick={() => setImg(i)}><img src={src} alt="" /></button>)}
                </div>
              )}
            </div>
            <div className="pdp-info">
              <h1>{p.name}</h1>
              {p.vendor_name && <span className="pdp-store">Visit {p.vendor_name}</span>}
              <hr />
              <div className="pdp-price-inline">
                <span className="pp-price">{p.price > 0 ? money(p.price) : 'K —'}</span>
                {save > 0 && <span className="bb-save">Save {money(save)}</span>}
              </div>
              {p.benefits.length > 0 && (
                <div className="pdp-section">
                  <h3>About this item</h3>
                  <ul className="pdp-bullets">{p.benefits.map((b, i) => <li key={i}>{b}</li>)}</ul>
                </div>
              )}
            </div>
          </div>
          {p.description
            ? <section className="pdp-section wide"><h2>Description</h2><p className="pdp-desc">{p.description}</p></section>
            : <p className="small muted">Add a description so shoppers know the size, condition and what is included.</p>}
        </div>
      </div>
      {viewer && <PhotoViewer images={p.images} start={img} alt={p.name} onClose={() => setViewer(false)} />}
    </div>
  )
}
