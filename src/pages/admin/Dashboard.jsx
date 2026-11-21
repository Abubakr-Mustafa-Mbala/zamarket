import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, num, pct, n } from '../../lib/format'
import { Stat, Loading, Segmented, Table } from '../../components/ui'
import Icon from '../../lib/icons'
import { profitParts } from './Split'

const RANGES = { 7: 'This week', 30: '30 days', 90: '90 days', 365: 'This year' }

export default function Dashboard() {
  const { advanced, profile, settings } = useAuth()
  const [days, setDays] = useState(30)
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
  const { data, loading, error, reload } = useData(async () => {
    const today = new Date(Date.now() + 2 * 36e5).toISOString().slice(0, 10)
    const [s, quotes, pending, top, parts] = await Promise.all([
      q(supabase.rpc('dashboard_summary', { p_from: from })),
      q(supabase.from('quotes').select('text,author')),
      q(supabase.from('orders').select('id,order_number,total,status,created_at,customer:customers(full_name,phone),district:districts(name)').eq('status', 'pending').order('created_at').limit(8)),
      q(supabase.from('order_items').select('quantity,line_total,product:products(name),orders!inner(status,created_at)').gte('orders.created_at', from).not('orders.status', 'in', '(cancelled,fraud_review)').limit(1000)),
      // The same sums as Finance → Our split, so both pages agree to the ngwee.
      profitParts(from, today, settings).catch(() => null),
    ])
    const byProduct = {}
    for (const it of top) { const k = it.product?.name || '?'; byProduct[k] = byProduct[k] || { name: k, units: 0, revenue: 0 }; byProduct[k].units += it.quantity; byProduct[k].revenue += Number(it.line_total) }
    return { s, parts, quote: quotes.length ? quotes[Math.floor(Math.random() * quotes.length)] : null, pending, top: Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 5) }
  }, [from])

  if (loading) return <Loading />
  if (error || !data) return (
    <div className="card stack-sm" role="alert">
      <h2>Dashboard could not load</h2>
      <p className="muted">The latest marketplace figures are temporarily unavailable. No values have been estimated.</p>
      <button className="btn primary" onClick={reload}>Try again</button>
    </div>
  )
  const s = data.s
  // Profit uses the same rules as the books: vendors' money is theirs, and
  // only completed orders count. Never shown below zero; a shortfall is said.
  const p = data.parts
  const rawProfit = p ? p.profit : n(s.orders_profit) - n(s.ad_spend) - n(s.expenses)
  const netProfit = Math.max(0, rawProfit)
  const short = rawProfit < 0 ? -rawProfit : 0
  const ours = p ? p.sales - p.vendors : n(s.revenue_completed)
  const marginPct = ours > 0 ? (netProfit / ours) * 100 : 0
  const aov = s.orders > 0 ? s.revenue / s.orders : 0
  // There used to be a second "action queue" list here, built from the same
  // counts as "Needs attention" below. Two lists of the same numbers is what
  // made this page read as a wall of text, so there is now one — as tiles.

  return (
    <div className="stack">
      <div className="page-head workspace-page-head">
        <div><span className="eyebrow"><span className="status-dot" /> OPERATIONS OVERVIEW</span>
          <h1>Good to see you, {profile?.full_name?.split(' ')[0] || 'there'}.</h1>
          <p>One clear view of orders, stock and marketplace performance.</p>
        </div>
        <Segmented options={Object.entries(RANGES)} value={String(days)} onChange={(v) => setDays(Number(v))} />
      </div>

      <div className="grid-4">
        {/* The chart link used to live inside the label, which wrapped it onto
            three lines and left the profit figure itself clipped at the edge of
            the card — the one number on this page that must always be readable.
            It sits under the figure now, and in the theme's accent rather than
            a leftover green from the old palette. */}
        <Stat hero
          label={`Net profit · ${RANGES[days].toLowerCase()}`}
          value={money(netProfit)}
          sub={<>{short > 0 ? <span className="bad">No profit yet: costs {money(short)} more than earned</span> : <>{pct(marginPct)} of what we kept from sales</>} · <Link to="/admin/finance?tab=split">see why ›</Link></>} />
        <Stat label="Sales (completed orders)" value={money(p ? p.sales : s.revenue_completed)} sub={p && p.vendors > 0 ? `${money(p.sales - p.vendors)} ours · ${money(p.vendors)} vendors' money` : `${num(s.completed)} of ${num(s.orders)} orders completed`} />
        <Stat label="Orders" value={num(s.orders)} sub={`Average order ${money(aov)}`} />
        <Stat label="Stock on hand" value={money(s.inventory_value)} sub={`${num(s.low_stock)} low · ${num(s.waiting_demand)} waiting requests`} />
      </div>

      <div className="quick premium-quick">
        <Link to="/admin/orders?status=pending" className="main"><span className="qi"><Icon.cart /></span><span>Review new orders</span>{s.pending_orders > 0 && <span className="count">{s.pending_orders}</span>}<Icon.arrow /></Link>
        <Link to="/admin/add-stock"><span className="qi"><Icon.box /></span>Record stock purchase <Icon.arrow /></Link>
        <Link to="/admin/studio"><span className="qi"><Icon.sparkles /></span>Make a promotion <Icon.arrow /></Link>
      </div>


      <div className="grid-2 tight">
        <div className="card">
          <div className="card-title"><h3>Needs attention</h3></div>
          <div className="admin-priority-grid">
            <Row to="/admin/orders?status=pending" label="New orders to confirm" value={num(s.pending_orders)} tone={s.pending_orders ? 'warn' : ''} />
            <Row to="/admin/deliveries" label="Deliveries to make" value={num(s.pending_deliveries)} tone={s.pending_deliveries ? 'warn' : ''} />
            <Row to="/admin/finance?tab=settlements" label="Money owed to sellers" value={money(s.vendor_payables)} tone={s.vendor_payables ? 'copper' : ''} />
            <Row to="/admin/finance?tab=commissions" label="Money owed to affiliates" value={money(s.commissions_owed)} tone={s.commissions_owed ? 'copper' : ''} />
            <Row to="/admin/orders" label="Awaiting payment" value={money(s.pending_payments)} />
            <Row to="/admin/inventory" label="Products low on stock" value={num(s.low_stock)} tone={s.low_stock ? 'warn' : ''} />
          </div>
        </div>
        <div className="card">
          <div className="card-title"><h3>New orders</h3><Link to="/admin/orders" className="small">All orders</Link></div>
          {data.pending.length === 0 ? <p className="muted small">Nothing waiting. Nice.</p> : (
            <div className="stack-sm">
              {data.pending.map((o) => (
                <Link key={o.id} to={`/admin/orders/${o.id}`} className="admin-order-item" >
                  <div><span className="strong">#{o.order_number}</span> <span className="muted small">{o.customer?.full_name} · {o.district?.name || 'No district'}</span></div>
                  <span className="money strong">{money(o.total)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2 tight">
        <div className="card">
          <div className="card-title"><h3>Where the money went</h3><span className="small muted">{RANGES[days]}</span></div>
          <div className="finance-visual" aria-label="Income and costs breakdown">
            {[
              ['Sales (completed)', p ? p.sales : s.revenue_completed],
              ['Vendors\' share (their money)', -(p ? p.vendors : n(s.done_vendor_payouts))],
              ['Delivery fees charged', p ? p.deliveryCharged : s.delivery_income],
              ['Product cost', -(p ? p.stock : s.cogs)],
              ['Affiliate commissions', -(p ? p.affiliates : s.commissions)],
              ['Delivery & fuel', -(p ? p.delivery : s.delivery_costs)],
              ['Advertising', -(p ? p.ads : s.ad_spend)],
              ['Other expenses', -(p ? p.expenses : s.expenses)],
            ].map(([label, raw]) => {
              const amount = Number(raw) || 0
              const scale = Math.max(1, Number(s.revenue_completed) || 0,
                Number(s.cogs) || 0, Number(s.delivery_costs) || 0)
              return <div key={label} className={`finance-visual-line ${amount < 0 ? 'expense' : 'income'}`}>
                <div className="finance-visual-label"><span>{label}</span><strong>{money(amount)}</strong></div>
                <div className="finance-visual-track"><span style={{ width: `${Math.min(100, Math.abs(amount) / scale * 100)}%` }} /></div>
              </div>
            })}
            <div className="finance-visual-total"><span>{short > 0 ? 'Short by (no profit yet)' : 'Net profit'}</span><strong className={short > 0 ? 'bad' : ''}>{money(short > 0 ? short : netProfit)}</strong></div>
          </div>
        </div>
        <div className="card">
          <div className="card-title"><h3>Top products</h3></div>
          <Table cols={[{ key: 'name', label: 'Product' }, { key: 'units', label: 'Units', num: true }, { key: 'revenue', label: 'Revenue', num: true, render: (r) => money(r.revenue) }]} rows={data.top} empty="No sales yet" />
        </div>
      </div>

      {advanced && (
        <div className="grid-4">
          <Stat label="Refunds / returns" value={num(s.refund_count)} sub="in period" />
          <Stat label="Failed deliveries / unreachable" value={num(s.cod_failed)} sub="in period" />
          <Stat label="Founder contributions" value={money(s.contributions)} sub={`Withdrawn ${money(s.withdrawals)}`} />
          <Stat label="Ad spend" value={money(s.ad_spend)} sub={s.completed ? `${money(s.ad_spend / s.completed)} per completed order` : 'No completed orders'} />
        </div>
      )}
    </div>
  )
}

function Row({ to, label, value, tone }) {
  return (
    <Link to={to} className="admin-priority-tile">
      <span className="admin-priority-name">{label}</span>
      <span className={`admin-priority-value money ${tone || ''}`}>{value}</span>
    </Link>
  )
}
