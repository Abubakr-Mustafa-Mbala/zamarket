import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, num, pct } from '../../lib/format'
import { Stat, Loading, Segmented, Breakdown, Table, Badge } from '../../components/ui'

const RANGES = { 7: 'This week', 30: '30 days', 90: '90 days', 365: 'This year' }

export default function Dashboard() {
  const { advanced, profile } = useAuth()
  const [days, setDays] = useState(30)
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
  const { data, loading } = useData(async () => {
    const [s, quotes, pending, top] = await Promise.all([
      q(supabase.rpc('dashboard_summary', { p_from: from })),
      q(supabase.from('quotes').select('text,author')),
      q(supabase.from('orders').select('id,order_number,total,status,created_at,customer:customers(full_name,phone),district:districts(name)').eq('status', 'pending').order('created_at').limit(8)),
      q(supabase.from('order_items').select('quantity,line_total,product:products(name),orders!inner(status,created_at)').gte('orders.created_at', from).not('orders.status', 'in', '(cancelled,fraud_review)').limit(1000)),
    ])
    const byProduct = {}
    for (const it of top) { const k = it.product?.name || '?'; byProduct[k] = byProduct[k] || { name: k, units: 0, revenue: 0 }; byProduct[k].units += it.quantity; byProduct[k].revenue += Number(it.line_total) }
    return { s, quote: quotes[Math.floor(Math.random() * quotes.length)], pending, top: Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 5) }
  }, [from])

  if (loading || !data) return <Loading />
  const s = data.s
  const grossProfit = s.revenue_completed - s.cogs - s.commissions + s.marketplace_fees
  const netProfit = grossProfit + s.delivery_income - s.delivery_costs - s.ad_spend - s.expenses
  const marginPct = s.revenue_completed > 0 ? (netProfit / s.revenue_completed) * 100 : 0
  const aov = s.orders > 0 ? s.revenue / s.orders : 0

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Hello, {profile?.full_name?.split(' ')[0] || 'founder'}</h1>
          {data.quote && <p className="quote">"{data.quote.text}"{data.quote.author ? ` — ${data.quote.author}` : ''}</p>}
        </div>
        <Segmented options={Object.entries(RANGES)} value={String(days)} onChange={(v) => setDays(Number(v))} />
      </div>

      <div className="quick">
        <Link to="/admin/add-stock" className="main"><span className="qi">📦</span>I bought goods</Link>
        <Link to="/admin/orders?new=1"><span className="qi">🧾</span>Record a sale</Link>
        <Link to="/admin/orders?status=pending"><span className="qi">🔔</span><span>New orders {s.pending_orders > 0 && <span className="count">{s.pending_orders}</span>}</span></Link>
      </div>

      <div className="grid-4">
        <Stat hero label={`Net profit · ${RANGES[days].toLowerCase()}`} value={money(netProfit)} sub={`${pct(marginPct)} of completed revenue`} />
        <Stat label="Revenue (completed orders)" value={money(s.revenue_completed)} sub={`${num(s.completed)} of ${num(s.orders)} orders completed`} />
        <Stat label="Orders" value={num(s.orders)} sub={`Average order ${money(aov)}`} />
        <Stat label="Stock on hand" value={money(s.inventory_value)} sub={`${num(s.low_stock)} low · ${num(s.waiting_demand)} waiting requests`} />
      </div>

      <div className="grid-2 tight">
        <div className="card">
          <div className="card-title"><h3>Needs attention</h3></div>
          <div className="stack-sm">
            <Row to="/admin/orders?status=pending" label="New orders to confirm" value={num(s.pending_orders)} tone={s.pending_orders ? 'warn' : ''} />
            <Row to="/admin/orders" label="Awaiting payment" value={money(s.pending_payments)} />
            <Row to="/admin/deliveries" label="Deliveries in progress" value={num(s.pending_deliveries)} />
            <Row to="/admin/finance?tab=commissions" label="Commissions owed to resellers" value={money(s.commissions_owed)} tone={s.commissions_owed ? 'copper' : ''} />
            <Row to="/admin/finance?tab=settlements" label="Payouts owed to vendors" value={money(s.vendor_payables)} tone={s.vendor_payables ? 'copper' : ''} />
            <Row to="/admin/inventory" label="Products low on stock" value={num(s.low_stock)} tone={s.low_stock ? 'warn' : ''} />
          </div>
        </div>
        <div className="card">
          <div className="card-title"><h3>Where the money went</h3><span className="small muted">{RANGES[days]}</span></div>
          <Breakdown
            items={[
              ['Revenue (completed)', s.revenue_completed],
              ['Delivery fees charged', s.delivery_income],
              ['Vendor fees earned', s.marketplace_fees],
              ['Product cost', -s.cogs, 'bad'],
              ['Reseller commissions', -s.commissions, 'bad'],
              ['Delivery & fuel', -s.delivery_costs, 'bad'],
              ['Advertising', -s.ad_spend, 'bad'],
              ['Other expenses', -s.expenses, 'bad'],
            ]}
            total={['Net profit', netProfit, netProfit >= 0 ? 'ok' : 'bad']}
          />
        </div>
      </div>

      <div className="grid-2 tight">
        <div className="card">
          <div className="card-title"><h3>New orders</h3><Link to="/admin/orders" className="small">All orders</Link></div>
          {data.pending.length === 0 ? <p className="muted small">Nothing waiting. Nice.</p> : (
            <div className="stack-sm">
              {data.pending.map((o) => (
                <Link key={o.id} to={`/admin/orders/${o.id}`} className="between" style={{ color: 'inherit' }}>
                  <div><span className="strong">#{o.order_number}</span> <span className="muted small">{o.customer?.full_name} · {o.district?.name || 'No district'}</span></div>
                  <span className="money strong">{money(o.total)}</span>
                </Link>
              ))}
            </div>
          )}
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
    <Link to={to} className="between" style={{ color: 'inherit' }}>
      <span className="muted">{label}</span>
      <span className={`strong money ${tone || ''}`}>{value}</span>
    </Link>
  )
}
