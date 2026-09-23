import { Link } from 'react-router-dom'
import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, date, n, title } from '../../lib/format'
import { commissionLabel } from '../../lib/economics'
import { Badge, Table, Loading, Modal, Stat, CopyLine, Empty } from '../../components/ui'
import PayoutRequest from '../../components/PayoutRequest'
import ShareThis from '../../components/ShareThis'
import PromoKit from '../../components/PromoKit'
import AffiliatePlan from '../../components/AffiliatePlan'
import { ManualSale } from '../admin/Orders'
import { offerCopy, DEAL_TYPES } from '../../lib/offers'

function useReseller() {
  const { profile } = useAuth()
  return profile?.partner || null
}

export function ResellerHome() {
  const r = useReseller()
  const { data, loading } = useData(async () => r ? {
    s: await q(supabase.rpc('reseller_summary', { p_reseller: r.id })),
    recent: await q(supabase.from('orders').select('id,order_number,subtotal,status,created_at').eq('reseller_id', r.id).order('created_at', { ascending: false }).limit(10)),
  } : null, [r?.id])
  if (!r) return <Empty title="No reseller profile">Your account isn't linked to an approved reseller application.</Empty>
  if (loading || !data) return <Loading />
  const { s } = data
  const target = n(r.monthly_target)
  const progress = target ? Math.min(100, (n(s.revenue_month) / target) * 100) : 0
  const link = `${window.location.origin}/r/${r.code}`
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Hi {r.full_name.split(' ')[0]}</h1><p>Your code is <span className="strong">{r.code}</span></p></div></div>
      <div className="grid-4">
        <Stat hero label="Paid to you" value={money(s.paid)} />
        <Stat label="Approved, being paid" value={money(s.approved)} tone="copper" />
        <Stat label="Pending" value={money(s.pending)} sub="waiting for delivery + 24h check" />
        <Stat label="Sales this month" value={s.sales_month} sub={`${s.sales_today} today · ${money(s.revenue_month)}`} />
      </div>
      {target > 0 && (
        <div className="card stack-sm">
          <div className="between"><h3>Monthly target</h3><span className="small">{money(s.revenue_month)} of {money(target)}</span></div>
          <div className="progress"><div style={{ width: `${progress}%` }} /></div>
        </div>
      )}
      <Link to="/sell/training" className="card between" style={{ color: 'inherit', borderColor: 'var(--charcoal)' }}><span><span className="strong">Start the training</span><br /><span className="small muted">Nine short lessons on finding customers and selling honestly</span></span><span aria-hidden>›</span></Link>
      <Link to="/sell/earnings" className="card between" style={{ color: 'inherit' }}><span><span className="strong">See your earnings chart</span><br /><span className="small muted">Day by day, pick any dates, all your records</span></span><span aria-hidden>›</span></Link>
      <div className="card stack-sm">
        <h3>Your link</h3>
        <p className="small muted">Anyone who orders through this link is credited to you.</p>
        <CopyLine text={link} />
      </div>
      <div className="card">
        <h3 className="mb">Recent sales</h3>
        <Table rows={data.recent} empty="No sales yet — share your link to get started" cols={[
          { key: 'order_number', label: '#', render: (o) => `#${o.order_number}` },
          { key: 'created_at', label: 'Date', render: (o) => date(o.created_at) },
          { key: 'status', label: 'Status', render: (o) => <Badge status={o.status} /> },
          { key: 'subtotal', label: 'Value', num: true, render: (o) => money(o.subtotal) },
        ]} />
      </div>
      <p className="tiny muted">Commissions are only earned on completed orders that aren't cancelled, refunded or returned. Any projected earnings are estimates, not guaranteed income.</p>
    </div>
  )
}

export function ResellerProducts() {
  const r = useReseller()
  const { settings } = useAuth()
  const [kit, setKit] = useState(null)
  const { data, loading } = useData(async () => ({
    products: await q(supabase.from('public_products').select('id,slug,name,description,benefits,faqs,images,price,normal_price,commission_type,commission_value,stock_available,owner_type,vendor_slug,offering_type,sales_model,page,package_count,fulfilment,category,featured_for_resellers,created_at,rating,review_count,vendor_name,boost_pct,boost_until').eq('status', 'published').order('name')),
    offers: await q(supabase.from('public_offers').select('*')),
  }), [])
  if (loading || !data) return <Loading />
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Products to sell</h1><p>Sorted by what you earn. Tap one for ready-made messages, photos and your link.</p></div></div>
      {data.products.length === 0 ? <Empty title="No products yet">Check back soon.</Empty> : (
        <div className="product-grid">
          {[...data.products].sort((a, b) => commissionLabel(b, settings).perUnit - commissionLabel(a, settings).perUnit).map((p) => {
            const c = commissionLabel(p, settings)
            const boosted = p.boost_pct && new Date(p.boost_until) > new Date()
            return (
              <div key={p.id} className={`pcard ${boosted ? 'boosted' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setKit(p)}>
                {boosted && <span className="boost-flag">Paying extra until {date(p.boost_until)}</span>}
                <div className="pimg">{p.images?.[0] ? <img src={p.images[0]} alt={p.name} /> : 'No photo'}</div>
                <div className="pbody">
                  <div className="strong truncate">{p.name}</div>
                  <div className="price">{money(p.price)}</div>
                  <div className="small">Commission {c.text}</div>
                  <div className="save">You earn {money(c.perUnit)} per sale</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {kit && <SellingKit p={kit} r={r} offers={data.offers.filter((o) => o.product_id === kit.id)} onClose={() => setKit(null)} />}
    </div>
  )
}

function SellingKit({ p, r, offers, onClose }) {
  const { settings } = useAuth()
  const deal = offers.find((o) => DEAL_TYPES.includes(o.type))
  const offerInfo = deal ? { copy: `${offerCopy(deal, p.name).get} for ${money(deal.deal_price)}`, end: deal.end_at } : null
  return <PromoKit product={p} offer={offerInfo} code={r?.code} settings={settings} onClose={onClose} />
}

export function ResellerNewSale() {
  const r = useReseller()
  const [open, setOpen] = useState(true)
  const [done, setDone] = useState(false)
  if (!r) return <Empty title="No reseller profile" />
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Record a sale</h1><p>Sold on WhatsApp, by phone or in person? Record it here so you get credit.</p></div></div>
      {done && <div className="card flat">Sale recorded. The team will call the customer to confirm payment and delivery.</div>}
      <button className="btn primary" onClick={() => { setDone(false); setOpen(true) }}>New sale</button>
      {open && <ManualSale resellerCode={r.code} onClose={() => setOpen(false)} onDone={() => { setOpen(false); setDone(true) }} />}
    </div>
  )
}

export function ResellerCommissions() {
  const r = useReseller()
  const { data: bonuses } = useData(() => r ? q(supabase.from('bonus_credits').select('*,order:orders(order_number)').eq('reseller_id', r.id).order('created_at', { ascending: false })) : Promise.resolve([]), [r?.id])
  const { data, loading } = useData(() => r ? q(supabase.from('commissions').select('*,order:orders(order_number,status)').eq('reseller_id', r.id).order('created_at', { ascending: false })) : Promise.resolve([]), [r?.id])
  if (loading) return <Loading />
  return (
    <div className="stack">
      <AffiliatePlan />
      <PayoutRequest who="reseller" />
      <div className="page-head"><div><h1>Commissions</h1><p>Pending → Verified → Approved → Paid.</p></div></div>
      <Table rows={data} empty="No commissions yet" cols={[
        { key: 'order', label: 'Order', render: (c) => `#${c.order?.order_number}` },
        { key: 'created_at', label: 'Date', render: (c) => date(c.created_at) },
        { key: 'status', label: 'Status', render: (c) => <Badge status={c.status} /> },
        { key: 'amount', label: 'Amount', num: true, render: (c) => money(c.amount) },
        { key: 'notes', label: 'Note', render: (c) => <span className="tiny muted">{['rejected', 'reversed'].includes(c.status) ? c.notes : c.status === 'paid' ? `Paid ${date(c.paid_at)}` : ''}</span> },
      ]} />
      <p className="tiny muted">Commissions are reversed if an order is cancelled, refunded, returned or flagged as a self-purchase.</p>
    </div>
  )
}
