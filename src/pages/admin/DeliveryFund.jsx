import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money } from '../../lib/format'
import { Loading, Field, Input, useToast } from '../../components/ui'

// Is free delivery paying for itself? Money set aside on every seller sale
// against what the trips actually cost.
const today = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10)
const monthStart = () => today().slice(0, 8) + '01'

export default function DeliveryFund() {
  const { isFounder } = useAuth()
  const toast = useToast()
  const [range, setRange] = useState({ from: monthStart(), to: today() })
  const { data: s, loading, reload } = useData(
    () => q(supabase.rpc('delivery_fund_summary', { p_from: range.from, p_to: range.to })), [range.from, range.to])
  const [adj, setAdj] = useState({ amount: '', note: '' })
  const [busy, setBusy] = useState(false)

  if (loading && !s) return <Loading />
  if (!s) return <p className="small muted">The delivery fund is not set up yet. Run the latest SQL.</p>

  const income = Number(s.in_sales) + Number(s.in_unclaimed)
  const spent = Number(s.out_trips) + Number(s.unrecorded_estimate)
  const balance = Number(s.all_time?.balance || 0)
  const avgIn = s.avg_in_per_delivery != null ? Number(s.avg_in_per_delivery) : null
  const avgCost = s.avg_cost_per_trip != null ? Number(s.avg_cost_per_trip) : null
  const short = avgIn != null && avgCost != null && avgIn < avgCost

  const adjust = async (sign) => {
    const amount = Math.abs(Number(adj.amount)) * sign
    if (!amount) return toast('Enter an amount', true)
    setBusy(true)
    const { error } = await supabase.rpc('delivery_fund_adjust', { p_amount: amount, p_note: adj.note })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast('Recorded'); setAdj({ amount: '', note: '' }); reload()
  }

  return (
    <div className="stack">
      <div className="page-head"><div>
        <h1>Delivery fund</h1>
        <p>Money set aside on every seller sale to pay for free delivery, against what the trips cost.</p>
      </div></div>

      <div className={`card stack-sm ${balance < 0 ? 'fund-low' : ''}`}>
        <span className="small muted">In the fund now</span>
        <strong className="fund-balance">{money(balance)}</strong>
        {s.all_time?.unrecorded > 0 && (
          <span className="tiny muted">Includes {s.all_time.unrecorded} deliveries with no cost recorded, counted at {money(s.settings?.assumed_cost)} each.</span>
        )}
        {balance < 0 && <p className="small warn-text">The fund is short. Raise the percentage or the minimum per item in Settings, or group more deliveries into one trip.</p>}
      </div>

      <div className="card stack-sm">
        <div className="form-grid">
          <Field label="From"><Input type="date" value={range.from} onChange={(v) => setRange((r) => ({ ...r, from: v }))} /></Field>
          <Field label="To"><Input type="date" value={range.to} onChange={(v) => setRange((r) => ({ ...r, to: v }))} /></Field>
        </div>
        <dl className="kv">
          <dt>From sales</dt><dd>{money(s.in_sales)}</dd>
          <dt>Unused affiliate share</dt><dd>{money(s.in_unclaimed)}</dd>
          {Number(s.adjustments) !== 0 && <><dt>Added or taken by hand</dt><dd>{money(s.adjustments)}</dd></>}
          <dt>Trips paid ({s.trips_recorded})</dt><dd>− {money(s.out_trips)}</dd>
          {s.trips_unrecorded > 0 && <><dt>Trips not recorded yet ({s.trips_unrecorded})</dt><dd>− {money(s.unrecorded_estimate)}</dd></>}
          <dt><strong>Left over</strong></dt><dd><strong>{money(s.net)}</strong></dd>
        </dl>
        <p className="small">
          {s.orders_completed} completed orders, {s.orders_delivered} delivered and {s.orders_completed - s.orders_delivered} collected.
          {avgIn != null && <> Each delivery brought in about <strong>{money(avgIn)}</strong>.</>}
          {avgCost != null && <> A trip cost about <strong>{money(avgCost)}</strong>.</>}
        </p>
        {short && <p className="small warn-text">Deliveries are costing more than they bring in. Group orders into delivery rounds, or raise the minimum per item.</p>}
        {income === 0 && spent === 0 && <p className="small muted">Nothing in this period yet. Figures appear once orders are completed.</p>}
        <p className="tiny muted">
          Record what each trip really cost (rider and fuel) on each delivery, under <Link to="/admin/deliveries">Deliveries</Link>. Until then it is counted at the
          “what a delivery really costs you” setting.
        </p>
      </div>

      <div className="card small stack-sm">
        <strong>How it is set</strong>
        <p>
          {s.settings?.pct}% of what the seller asked, at least {money(s.settings?.min)} and
          {Number(s.settings?.max) > 0 ? <> at most {money(s.settings?.max)}</> : ' with no ceiling'} per item.
          {s.settings?.takes_unclaimed ? ' Unused affiliate share goes in too.' : ''}
          {' '}Delivery is {s.settings?.free_delivery ? 'free' : 'charged'} to customers.
        </p>
        {isFounder && <Link to="/admin/settings">Change in Settings →</Link>}
      </div>

      {isFounder && (
        <div className="card stack-sm">
          <strong>Add or take money by hand</strong>
          <p className="small muted">For example, starting the fund with cash, or moving a surplus out. Every entry is kept in the audit log.</p>
          <div className="form-grid">
            <Field label="Amount (K)"><Input type="number" value={adj.amount} onChange={(v) => setAdj((a) => ({ ...a, amount: v }))} /></Field>
            <Field label="Reason"><Input value={adj.note} onChange={(v) => setAdj((a) => ({ ...a, note: v }))} /></Field>
          </div>
          <div className="btn-row">
            <button className="btn primary" disabled={busy} onClick={() => adjust(1)}>Add to fund</button>
            <button className="btn ghost" disabled={busy} onClick={() => adjust(-1)}>Take from fund</button>
          </div>
        </div>
      )}
    </div>
  )
}
