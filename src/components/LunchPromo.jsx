import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// A banner for published lunch plans: on a seller's shop (their own plans)
// or on Today's deals (all of them). Shows nothing when there are none.
export default function LunchPromo({ vendorId = null }) {
  const [deals, setDeals] = useState([])
  useEffect(() => {
    let q = supabase.from('meal_deals').select('id,slug,title,tagline,cover_url,cutoff_hour').eq('status', 'published').order('created_at', { ascending: false }).limit(4)
    if (vendorId) q = q.eq('vendor_id', vendorId)
    q.then(({ data }) => setDeals(data || [])).catch(() => {})
  }, [vendorId])
  if (!deals.length) return null
  return (
    <div className="lunch-promo-list">
      {deals.map((d) => (
        <Link key={d.id} to={`/lunch/${d.slug}`} className="lunch-promo">
          {d.cover_url && <img src={d.cover_url} alt="" loading="lazy" />}
          <span className="lunch-promo-shade" />
          <span className="lunch-promo-copy">
            <small>Lunch at work</small>
            <strong>{d.title}</strong>
            {d.tagline && <span>{d.tagline}</span>}
            <em>See the menu and book →</em>
          </span>
        </Link>
      ))}
    </div>
  )
}
