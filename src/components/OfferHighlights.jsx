import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { DEAL_COLS } from '../pages/public/Lunch'
import { StoreRequestForm } from './StoreRequest'

// A seller's special offers as round highlights on their store, like on an
// Instagram page: a ring with the food photo, taking almost no space. Tap it
// and the whole offer page opens, with everything about how to order.
// Only real, published offers appear. Beside them, a "Request" bubble: ask the
// shop for something not on it (an extra lunch day, an event, a special order).

const SEEN = 'zm-offers-seen'
const seenSet = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN) || '[]')) } catch { return new Set() } }

export default function OfferHighlights({ vendorId, store = null }) {
  const [deals, setDeals] = useState([])
  const [asking, setAsking] = useState(false)
  const [seen, setSeen] = useState(seenSet)
  const navigate = useNavigate()
  useEffect(() => {
    if (!vendorId) return
    supabase.from('meal_deals').select(DEAL_COLS).eq('status', 'published').eq('vendor_id', vendorId).order('created_at', { ascending: false })
      .then(({ data }) => setDeals(data || []), () => {})
  }, [vendorId])
  if (!deals.length && !store?.slug) return null
  const open = (d) => {
    const s = new Set(seen); s.add(d.id); setSeen(s)
    try { localStorage.setItem(SEEN, JSON.stringify([...s])) } catch { /* ignore */ }
    navigate(`/lunch/${d.slug}`)
  }
  return (
    <section className="hl" aria-label="Special offers">
      <div className="hl-row">
        {deals.map((d) => (
          <button key={d.id} type="button" className={`hl-item ${seen.has(d.id) ? 'seen' : ''}`} onClick={() => open(d)}>
            <span className="hl-ring"><span className="hl-photo">{d.cover_url ? <img src={d.cover_url} alt="" loading="lazy" /> : null}</span></span>
            <b>Weekly lunch</b>
            <small>Offer</small>
          </button>
        ))}
        {store?.slug && (
          <button type="button" className="hl-item hl-ask" onClick={() => setAsking(true)}>
            <span className="hl-ring"><span className="hl-photo hl-plus" aria-hidden="true">+</span></span>
            <b>Request</b>
            <small>Extra day, event…</small>
          </button>
        )}
      </div>
      {asking && <StoreRequestForm store={store} onClose={() => setAsking(false)} />}
    </section>
  )
}
