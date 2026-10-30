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

  return (
    <div className="price-maths">
      <div className="pm-row lead">
        <span>The customer pays</span>
        <strong>{money(p.shelf)}</strong>
      </div>
      {/* price_preview returns margin_total — the whole amount above the vendor's
          take-home. It is not fee_pct of the shelf price, because it also carries
          the room reserved for an affiliate's commission. Showing a single
          percentage here would understate it and read as a mistake. */}
      <div className="pm-row">
        <span>ZaMarket's share</span>
        <span>− {money(p.margin_total)}</span>
      </div>
      <div className="pm-row total">
        <span>You receive</span>
        <strong>{money(p.vendor_receives)}</strong>
      </div>
      {Number(p.allowance_pct) > 0 && (
        <p className="tiny muted">
          That share includes the {p.allowance_pct}% set aside for commission if an affiliate
          brings the sale. Either way, what you receive does not change.
        </p>
      )}
      {p.below_minimum && (
        <p className="tiny" style={{ color: 'var(--warn)' }}>
          ZaMarket earns very little on this one. That is fine for a cheap item, but it still has to
          be confirmed, delivered and covered if it goes wrong.
        </p>
      )}
      <p className="tiny muted">
        Delivery is charged once per order, separately, so it is not in this figure.
      </p>
    </div>
  )
}
