import { Link, useNavigate } from 'react-router-dom'
import { money } from '../../lib/format'
import { useSaved } from '../../lib/saved'
import { vehicleOf, vehicleTitle, km, priceNote } from '../../lib/vehicle'
import { useVehicleContact, askOnWhatsApp, vehicleLink } from './contact'
import { VI } from './icons'
import '../../motors.css'

const photosOf = (p) => (Array.isArray(p?.images) ? p.images : []).filter((s) => typeof s === 'string' && /^https?:\/\//i.test(s))
const HEART = <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 20.3 10.6 19C5.4 14.4 2 11.3 2 7.6 2 4.6 4.4 2.3 7.4 2.3c1.7 0 3.3.8 4.6 2 1.3-1.2 2.9-2 4.6-2 3 0 5.4 2.3 5.4 5.3 0 3.7-3.4 6.8-8.6 11.4L12 20.3Z" /></svg>
const HEART_LINE = <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2" d="M12 19 10.9 18C6 13.7 3 11 3 7.7 3 5.1 5 3.3 7.4 3.3c1.6 0 3.2.8 4.6 2.2 1.4-1.4 3-2.2 4.6-2.2C19 3.3 21 5.1 21 7.7c0 3.3-3 6-7.9 10.3L12 19Z" /></svg>

// One vehicle, the same everywhere: the photo with a heart and the photo
// count, what it is, the price, the four facts every buyer asks first with
// their icons, where it is and who lists it, then View details and Ask on
// WhatsApp. compact = a smaller card for mixed product grids (no buttons).
export default function VehicleCard({ p, onAsk, compact = false }) {
  const nav = useNavigate()
  const saved = useSaved()
  const contact = useVehicleContact(null)
  const v = vehicleOf(p)
  const photos = photosOf(p)
  const title = vehicleTitle(v, p.name)
  const to = `/p/${p.slug || p.id}`
  const facts = [
    v.year && { key: 'year', icon: VI.year, text: v.year },
    v.mileage_km && { key: 'km', icon: VI.mileage, text: km(v.mileage_km) },
    v.transmission && { key: 'gear', icon: VI.transmission, text: v.transmission },
    v.fuel && { key: 'fuel', icon: VI.fuel, text: v.fuel },
  ].filter(Boolean)
  const seller = p.vendor_name || 'ZaMarket'
  const on = saved.has(p.id)
  const sold = p.status === 'out_of_stock'

  const ask = (e) => {
    e.preventDefault()
    if (onAsk) return onAsk(p)
    const url = contact.whatsapp ? askOnWhatsApp(p, { ...contact, link: vehicleLink(p, contact.ref) }, '') : ''
    if (url) window.open(url, '_blank', 'noopener')
    else nav(`${to}?ask=1`)
  }

  return (
    <article className={`vx-card ${compact ? 'is-compact' : ''}`}>
      <Link to={to} className="vx-card-link" aria-label={`${title}, ${money(p.price, { whole: true })}`}>
        <span className="vx-card-photo">
          {photos[0]
            ? <img src={photos[0]} alt="" loading="lazy" />
            : <span className="vx-card-nophoto">{VI.camera}<em>Photos coming</em></span>}
          {photos.length > 0 && <span className="vx-card-count">{VI.camera}1/{photos.length}</span>}
          {sold && <span className="vx-card-sold">Sold</span>}
        </span>
        <span className="vx-card-main">
          <span className="vx-card-title">{title}</span>
          <span className="vx-card-price"><b>{money(p.price, { whole: true })}</b>{priceNote(v) && <em>{priceNote(v)}</em>}</span>
          {facts.length > 0 && <span className="vx-card-facts">{facts.map((f) => <span key={f.key}>{f.icon}<i>{f.text}</i></span>)}</span>}
          <span className="vx-card-loc">{VI.pin}<span>{v.location || 'Location on enquiry'}</span><span className="dot" aria-hidden>•</span><span className="who">{seller}</span></span>
        </span>
      </Link>
      <button type="button" className={`vx-card-heart ${on ? 'on' : ''}`} aria-label={on ? 'Remove from my list' : 'Save to my list'} aria-pressed={on}
        onClick={(e) => { e.preventDefault(); saved.toggle(p.id) }}>{on ? HEART : HEART_LINE}</button>
      {!compact && !sold && (
        <div className="vx-card-actions">
          <Link to={to} className="vx-btn outline">View details</Link>
          <a href={`${to}?ask=1`} className="vx-btn wa" onClick={ask}>{VI.whatsapp}{contact.whatsapp ? 'Ask on WhatsApp' : 'Ask about it'}</a>
        </div>
      )}
    </article>
  )
}
