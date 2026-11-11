import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'

// Shows a vendor exactly what happens to the number they just typed: what the
// shopper will pay, what ZaMarket takes, and what lands in their pocket.
//
// The maths is done by the database, not here, so what is shown is what will
// actually be saved — a second implementation in the browser would eventually
// disagree with the first, and it would disagree about money.
export default function PriceMaths({ take }) {
  const [p, setP] = useState(null)
  const amount = Number(take || 0)

  useEffect(() => {
    if (!(amount > 0)) { setP(null); return }
    let alive = true
    const t = setTimeout(() => {
      supabase.rpc('price_preview', { p_take: amount })
        .then(({ data, error }) => { if (alive && !error) setP(data) })
        .catch(() => {})
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [amount])

  if (!(amount > 0)) {
    return <p className="tiny muted pm-hint">Type what you want to receive and we will show you the rest.</p>
  }
  if (!p) return <p className="tiny muted pm-hint">Working it out…</p>

  const fund = Number(p.delivery_fund || 0)
  const share = p.marketplace_share != null ? Number(p.marketplace_share) : Number(p.margin_total)
  return (
    <div className="price-maths">
      <div className="pm-row lead">
        <span>The customer pays{p.free_delivery ? ', delivered free' : ''}</span>
        <strong>{money(p.shelf)}</strong>
      </div>
      {/* The share is everything above the seller's amount except the delivery
          fund. It carries the room kept for an affiliate's commission, so a
          single percentage would understate it. */}
      <div className="pm-row">
        <span>ZaMarket's share</span>
        <span>− {money(share)}</span>
      </div>
      {fund > 0 && (
        <div className="pm-row">
          <span>Set aside for delivery</span>
          <span>− {money(fund)}</span>
        </div>
      )}
      <div className="pm-row total">
        <span>You receive</span>
        <strong>{money(p.vendor_receives)}</strong>
      </div>
      {Number(p.allowance_pct) > 0 && (
        <p className="tiny muted">
          ZaMarket's share includes the {p.allowance_pct}% kept for an affiliate who brings the sale.
          Either way, what you receive does not change.
        </p>
      )}
      {p.below_minimum && (
        <p className="tiny" style={{ color: 'var(--warn)' }}>
          ZaMarket earns very little on this one. That is fine for a cheap item, but it still has to
          be confirmed, delivered and covered if it goes wrong.
        </p>
      )}
      <p className="tiny muted">
        {p.free_delivery
          ? 'Delivery is free to the customer. The amount set aside pays for it, so you never pay for a trip.'
          : 'Delivery is charged once per order, separately, so it is not in this figure.'}
        {' '}A lower amount here means a lower price for the customer, and shoppers compare.
      </p>
    </div>
  )
}
