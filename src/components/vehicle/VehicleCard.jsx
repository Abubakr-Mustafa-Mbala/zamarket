import { Link } from 'react-router-dom'
import { money } from '../../lib/format'
import { vehicleOf, vehicleTitle, km } from '../../lib/vehicle'
import { VI } from './icons'

const photosOf = (p) => (Array.isArray(p?.images) ? p.images : []).filter((s) => typeof s === 'string' && /^https?:\/\//i.test(s))

// One car in the showroom: the photo, what it is, the price, and the four
// facts every buyer asks first. The whole card opens the vehicle.
export default function VehicleCard({ p, onAsk }) {
  const v = vehicleOf(p)
  const photos = photosOf(p)
  const title = vehicleTitle(v, p.name)
  const facts = [
    v.year && { icon: VI.year, text: v.year },
    v.mileage_km && { icon: VI.mileage, text: km(v.mileage_km) },
    v.transmission && { icon: VI.transmission, text: v.transmission },
    v.fuel && { icon: VI.fuel, text: v.fuel },
  ].filter(Boolean)
  return (
    <article className="vx-card">
      <Link to={`/p/${p.slug || p.id}`} className="vx-card-link" aria-label={`${title}, ${money(p.price, { whole: true })}`}>
        <span className="vx-card-photo">
          {photos[0]
            ? <img src={photos[0]} alt="" loading="lazy" />
            : <span className="vx-card-nophoto">{VI.camera}<em>Photos coming</em></span>}
          {photos.length > 1 && <span className="vx-card-count">{VI.camera}{photos.length}</span>}
          {v.body && <span className="vx-card-body">{v.body}</span>}
        </span>
        <span className="vx-card-main">
          <span className="vx-card-title">{title}</span>
          <span className="vx-card-price">{money(p.price, { whole: true })}{v.negotiable !== false && <em>Negotiable</em>}</span>
          {facts.length > 0 && <span className="vx-card-facts">{facts.map((f) => <span key={f.text}>{f.icon}{f.text}</span>)}</span>}
          <span className="vx-card-loc">{VI.pin}{v.location || 'Location on enquiry'}</span>
        </span>
      </Link>
      {onAsk && (
        <div className="vx-card-actions">
          <Link to={`/p/${p.slug || p.id}`} className="vx-btn ghost">See details</Link>
          <button type="button" className="vx-btn wa" onClick={() => onAsk(p)}>{VI.whatsapp}Ask</button>
        </div>
      )}
    </article>
  )
}
