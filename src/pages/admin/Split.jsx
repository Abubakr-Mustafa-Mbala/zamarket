import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, date, n } from '../../lib/format'
import { Loading, Field, Input, useToast, Empty, Problem } from '../../components/ui'
import { DateBar, useRange } from '../shared/Earnings'

// Two founders, one profit. This says what stays in the business and what each
// person can take, so nobody has to work it out at the end of the month.
export default function Split() {
  const toast = useToast()
  const { settings, refresh, isFounder } = useAuth()
  const [range, setRange] = useRange('month')
  const [editing, setEditing] = useState(false)
  const [reinvest, setReinvest] = useState(String(settings.reinvest_pct ?? 30))
  const [shares, setShares] = useState({})
  const { data, loading, error, reload } = useData(() => q(supabase.rpc('profit_split', { p_from: range.from, p_to: range.to })), [range.from, range.to])
  const { data: parts } = useData(() => profitParts(range.from, range.to, settings), [range.from, range.to])

  if (!isFounder) return <Empty title="Founders only">This page shows how the founders' profit is split.</Empty>
  if (error) return <Problem error={error} what="the split" onRetry={typeof reload === 'function' ? reload : undefined} />
  if (loading || !data) return <><div className="card"><DateBar range={range} setRange={setRange} /></div><Loading /></>

  // With one founder, everything to share is theirs, whatever the old split
  // still says. Nothing is shared out of a loss.
  const solo = (data.people || []).length === 1
  const s = soloSplit(data)
  const loss = n(s.profit) <= 0
  const mine = (s.people || []).find((p) => p.is_me)

  const saveShares = async () => {
    try {
      for (const p of s.people) {
        const pct = solo ? 100 : shares[p.user_id] != null ? n(shares[p.user_id]) : n(p.pct)
        const { error } = await supabase.rpc('set_profit_share', { p_user: p.user_id, p_pct: pct })
        if (error) throw new Error(error.message)
      }
      const { error } = await supabase.from('settings').upsert({ key: 'reinvest_pct', value: n(reinvest) })
      if (error) throw new Error(error.message)
      await refresh()
      toast('Split saved')
      setEditing(false)
      reload()
    } catch (e) { toast(e.message, true) }
  }

  const totalPct = (s.people || []).reduce((t, p) => t + n(shares[p.user_id] ?? p.pct), 0)

  return (
    <div className="stack">
      <div className="card"><DateBar range={range} setRange={setRange} /></div>

      <div className="split-top">
        <div className="split-profit">
          <span className="small">Profit in these dates</span>
          <strong>{money(Math.max(0, n(s.profit)))}</strong>
          {n(s.profit) < 0
            ? <span className="tiny bad">No profit yet: costs are {money(-n(s.profit))} more than what we earned. See how below.</span>
            : <span className="tiny muted">After product costs, commissions, vendor payouts, delivery, adverts and expenses</span>}
        </div>
        <div className="split-flow">
          <div>
            <span className="tiny muted">Stays in the business</span>
            <strong>{money(s.reinvested)}</strong>
            <span className="tiny muted">{n(s.reinvest_pct)}% for stock, adverts and a reserve</span>
          </div>
          <span className="split-arrow" aria-hidden>→</span>
          <div>
            <span className="tiny muted">{solo ? 'Yours to take' : 'To share between you'}</span>
            <strong className="ok">{money(s.to_share)}</strong>
            <span className="tiny muted">{solo ? 'all of it is yours' : 'what the founders can take'}</span>
          </div>
        </div>
      </div>

      {parts && <ProfitParts parts={parts} profit={n(data.profit)} />}

      {loss && <div className="card warn-line bad">{n(s.profit) < 0 ? 'Costs were more than what the business earned in these dates' : 'Nothing was earned in these dates yet'}, so there is nothing to take. Taking money out now takes it from the float.</div>}

      <section className="card stack-sm">
        <div className="between">
          <h3>{solo ? 'Your share' : "Each founder's share"}</h3>
          {!editing ? <button className="btn sm" onClick={() => setEditing(true)}>{solo ? 'Change what stays in' : 'Change the split'}</button> : <button className="btn sm ghost" onClick={() => { setEditing(false); setShares({}) }}>Cancel</button>}
        </div>

        {editing ? (
          <div className="stack-sm">
            <Field label="Keep in the business (%)" hint="Taken off the profit before anyone's share">
              <Input type="number" value={reinvest} onChange={setReinvest} />
            </Field>
            {!solo && s.people.map((p) => (
              <Field key={p.user_id} label={p.name}>
                <Input type="number" value={shares[p.user_id] ?? p.pct} onChange={(v) => setShares({ ...shares, [p.user_id]: v })} />
              </Field>
            ))}
            {!solo && <p className={`small ${Math.round(totalPct) === 100 ? 'muted' : 'bad'}`}>Shares add up to {Math.round(totalPct)}%. {Math.round(totalPct) === 100 ? '' : 'They should add up to 100.'}</p>}
            {solo && <p className="small muted">You are the only founder, so whatever is left after this is all yours. Affiliates are paid their commission on their own sales before any of this.</p>}
            <button className="btn primary" onClick={saveShares} disabled={!solo && Math.round(totalPct) !== 100}>Save</button>
          </div>
        ) : (
          <div className="split-people">
            {s.people.map((p) => (
              <div key={p.user_id} className={`split-person ${p.is_me ? 'me' : ''}`}>
                <span className="sp-name">{p.name}{p.is_me && <span className="tiny muted"> — you</span>}</span>
                <span className="sp-pct">{n(p.pct)}%</span>
                <span className="sp-amount">{money(p.amount)}</span>
              </div>
            ))}
            {!solo && n(s.shares_total) !== 100 && <p className="tiny bad">Shares add up to {n(s.shares_total)}%, not 100. Change the split so the money adds up properly.</p>}
          </div>
        )}
      </section>

      {mine && !loss && (
        <section className="card mine-card">
          <h3>What you can take</h3>
          <div className="mine-amount">{money(mine.amount)}</div>
          <p className="small muted">{solo ? 'All' : `Your ${n(mine.pct)}%`} of {money(s.to_share)}, for {date(range.from)} to {date(range.to)}. Record it under Founder money when you take it, so the books stay right.</p>
        </section>
      )}

      {(s.withdrawn || []).length > 0 && (
        <section className="card stack-sm">
          <h3>Already taken in these dates</h3>
          <div className="mini-table">
            {s.withdrawn.map((w) => <div key={w.name} className="mini-row"><span className="grow">{w.name}</span><span className="strong money">{money(w.amount)}</span></div>)}
          </div>
          <p className="tiny muted">Money taken out is not an expense. It comes from the share above.</p>
        </section>
      )}
    </div>
  )
}

// One founder takes 100% of what is left to share. A loss shares nothing.
export function soloSplit(d) {
  const people = d.people || []
  const profit = n(d.profit)
  const keep = profit > 0 ? n(d.reinvested) : 0
  const share = profit > 0 ? n(d.to_share) : 0
  if (people.length === 1) return { ...d, reinvested: keep, to_share: share, shares_total: 100, people: [{ ...people[0], pct: 100, amount: share }] }
  return { ...d, reinvested: keep, to_share: share, people: people.map((p) => ({ ...p, amount: profit > 0 ? p.amount : 0 })) }
}

// The same sums the database uses for profit, line by line, so the number
// above is never a mystery. Completed orders count on the day they completed.
export async function profitParts(from, to, settings) {
  const lo = `${from}T00:00:00+02:00`
  const hi = `${to}T23:59:59.999+02:00`
  const [orders, exp, ads] = await Promise.all([
    q(supabase.from('orders').select('id,subtotal,delivery_fee,collection,items:order_items(quantity,unit_cost_snapshot,vendor_id,line_total,product:products(owner_type)),settlements(net_payable,status),commissions(amount,status),deliveries(delivery_cost,fuel_cost)')
      .eq('status', 'completed').gte('completed_at', lo).lte('completed_at', hi)),
    q(supabase.from('expenses').select('amount').gte('spent_on', from).lte('spent_on', to)),
    q(supabase.from('marketing_spend').select('amount').gte('spent_on', from).lte('spent_on', to)).catch(() => []),
  ])
  return sumParts(orders || [], exp || [], ads || [], n(settings?.assumed_delivery_cost ?? 25))
}

export function sumParts(orders, exp, ads, assumed) {
  const t = { orders: orders.length, sales: 0, deliveryCharged: 0, stock: 0, vendors: 0, vendorSales: 0, affiliates: 0, delivery: 0, guessedDeliveries: 0, expenses: 0, ads: 0 }
  for (const o of orders) {
    t.sales += n(o.subtotal)
    t.deliveryCharged += n(o.delivery_fee)
    for (const i of o.items || []) {
      if (i.product?.owner_type === 'founder') t.stock += n(i.unit_cost_snapshot) * n(i.quantity)
      if (i.vendor_id) t.vendorSales += n(i.line_total)
    }
    t.vendors += (o.settlements || []).filter((x) => x.status !== 'cancelled').reduce((a, x) => a + n(x.net_payable), 0)
    t.affiliates += (o.commissions || []).filter((x) => !['rejected', 'reversed'].includes(x.status)).reduce((a, x) => a + n(x.amount), 0)
    for (const d of o.deliveries || []) {
      const real = n(d.delivery_cost) + n(d.fuel_cost)
      if (real > 0) t.delivery += real; else if (!o.collection) { t.delivery += assumed; t.guessedDeliveries += 1 }
    }
  }
  t.expenses = exp.reduce((a, x) => a + n(x.amount), 0)
  t.ads = ads.reduce((a, x) => a + n(x.amount), 0)
  t.profit = t.sales + t.deliveryCharged - t.stock - t.vendors - t.affiliates - t.delivery - t.expenses - t.ads
  t.assumed = assumed
  return t
}

function ProfitParts({ parts: p, profit }) {
  const Row = ({ label, value, note, minus, strong }) => (value || strong) ? (
    <div className="mini-row">
      <span className="grow">{strong ? <strong>{label}</strong> : label}{note && <span className="tiny muted">{note}</span>}</span>
      <span className={`money ${strong ? 'strong' : ''} ${minus ? 'bad' : ''}`}>{minus ? '−' : ''}{money(Math.abs(value))}</span>
    </div>
  ) : null
  const diff = Math.round((profit - p.profit) * 100) / 100
  return (
    <section className="card stack-sm">
      <h3>How we got this number</h3>
      <div className="mini-table">
        <Row label="Sales on completed orders" value={p.sales} note={`${p.orders} order${p.orders === 1 ? '' : 's'}`} strong />
        <Row label="Delivery charged to customers" value={p.deliveryCharged} />
        <Row label="Vendors' share of their products" value={p.vendors} minus note={p.vendorSales ? `Their money, not ours: ${money(p.vendorSales)} of vendor products sold, we keep ${money(p.vendorSales - p.vendors)}` : ''} />
        <Row label="What our own stock cost us" value={p.stock} minus />
        <Row label="Affiliate commissions" value={p.affiliates} minus />
        <Row label="Delivery costs" value={p.delivery} minus note={p.guessedDeliveries ? `${p.guessedDeliveries} with no real cost recorded, so ${money(p.assumed)} each was assumed. If there was no trip, open the order and tap "Customer collected, no trip".` : ''} />
        <Row label="Expenses" value={p.expenses} minus note="From the Expenses tab" />
        <Row label="Adverts" value={p.ads} minus note="From Ad spend in Marketing" />
        {Math.abs(diff) >= 0.01 && <Row label="Other adjustments" value={diff} minus={diff < 0} />}
        {profit < 0 ? <Row label="Short by (no profit yet)" value={profit} minus strong /> : <Row label="Profit" value={profit} strong />}
      </div>
    </section>
  )
}
