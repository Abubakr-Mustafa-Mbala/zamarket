import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { money, date } from '../../lib/format'
import { Loading, Empty } from '../../components/ui'
import VehicleCard from '../../components/vehicle/VehicleCard'
import '../../motors.css'

const STAGE = {
  enquiry: ['New', 'ZaMarket is contacting the buyer'],
  negotiating: ['Talking', 'Buyer and seller are discussing'],
  agreed: ['Price agreed', 'Waiting for payment and handover'],
  closed: ['Sold', ''],
  lost: ['Did not buy', ''],
}
const REWARD = {
  pending: 'Waiting for the seller to pay ZaMarket',
  verified: 'Approved, to be paid',
  approved: 'Approved, to be paid',
  paid: 'Paid to you',
  rejected: 'Not payable',
}

// An affiliate's vehicles: the buyers credited to them, where each deal stands
// and what they earned, then the vehicles they can promote right now.
export default function ResellerVehicles() {
  const [deals, setDeals] = useState(null)
  const [cars, setCars] = useState(null)
  const [rewards, setRewards] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('my_vehicle_deals').then(({ data, error: e }) => {
      if (e) { setDeals([]); setError(/function|does not exist|schema cache/i.test(e.message) ? 'Your buyers list will appear here shortly.' : e.message) } else setDeals(data || [])
    })
    supabase.from('public_products').select('*').eq('offering_type', 'vehicle').eq('status', 'published').order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => setCars(data || []))
    supabase.rpc('affiliate_vehicle_reward_estimates').then(({ data }) => {
      setRewards(Object.fromEntries((data || []).map((r) => [r.product_id, Number(r.estimated_reward)])))
    })
  }, [])

  const earned = (deals || []).filter((d) => d.status === 'closed').reduce((t, d) => t + Number(d.reward || 0), 0)
  const open = (deals || []).filter((d) => ['enquiry', 'negotiating', 'agreed'].includes(d.status)).length

  return (
    <div className="vx vx-form">
      <div className="vx-form-head">
        <div>
          <h1>Vehicles</h1>
          <p>Promote vehicles with your link. Every buyer who comes through you, or that you register, is credited to you here.</p>
        </div>
        <Link className="vx-btn ghost" to="/motors">Open the showroom</Link>
      </div>

      <div className="vx-aff-stats">
        <div><span>Buyers credited to you</span><strong>{deals ? deals.length : '…'}</strong></div>
        <div><span>Still in progress</span><strong>{deals ? open : '…'}</strong></div>
        <div><span>Earned from vehicles</span><strong>{deals ? money(earned, { whole: true }) : '…'}</strong></div>
      </div>

      <section className="vx-step">
        <div className="vx-step-head"><div><h2>My buyers</h2><p>Buyers who asked through your link, or that you registered. Only ZaMarket sees their full number.</p></div></div>
        {deals === null ? <Loading /> : error ? <p className="vx-muted">{error}</p> : deals.length === 0 ? (
          <p className="vx-muted">No buyers yet. Share a vehicle with your link, or open a vehicle and tap <b>Register a buyer</b> when someone contacts you directly.</p>
        ) : (
          <div className="vx-buyers">
            {deals.map((d) => {
              const [word, note] = STAGE[d.status] || [d.status, '']
              return (
                <div key={d.deal_number} className={`vx-buyer is-${d.status}`}>
                  <div className="vx-buyer-top">
                    <strong>{d.buyer} <span className="vx-muted">···{d.phone_end}</span></strong>
                    <span className={`vx-stage is-${d.status}`}>{word}</span>
                  </div>
                  <Link to={`/p/${d.vehicle_slug}`} className="vx-buyer-car">{d.vehicle}</Link>
                  <div className="vx-buyer-meta">
                    <span>D{d.deal_number} · {date(d.created_at)}</span>
                    {note && <span>{note}</span>}
                  </div>
                  {d.status === 'closed' && (
                    <div className="vx-buyer-reward">
                      <span>Sold for {money(d.final_price, { whole: true })}</span>
                      <strong>You earned {money(d.reward || 0, { whole: true })}</strong>
                      <em>{REWARD[d.reward_status] || 'Being recorded'}</em>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="vx-step">
        <div className="vx-step-head"><div><h2>Vehicles to promote</h2><p>Open one to get its photos, a ready post and your link.</p></div></div>
        {cars === null ? <Loading /> : cars.length === 0 ? <Empty title="No vehicles listed right now">New vehicles appear here as soon as ZaMarket lists them.</Empty> : (
          <div className="vx-grid">
            {cars.map((p) => (
              <div key={p.id} className="vx-promo">
                {rewards[p.id] > 0 && <span className="vx-promo-reward">Earn about {money(rewards[p.id], { whole: true })}</span>}
                <VehicleCard p={p} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
