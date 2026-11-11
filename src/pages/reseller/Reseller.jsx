import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import DashboardTrend from '../../components/DashboardTrend'
import AffiliateMonthlyGoal from '../../components/AffiliateMonthlyGoal'
import Icon from '../../lib/icons'
import { useAuth } from '../../lib/auth'
import { money, date } from '../../lib/format'
import { commissionLabel } from '../../lib/economics'
import { Badge, Table, Loading, CopyLine, Empty, Field, Input } from '../../components/ui'
import PayoutRequest from '../../components/PayoutRequest'
import PromoKit from '../../components/PromoKit'
import AffiliatePlan from '../../components/AffiliatePlan'
import Statement from '../../components/Statement'
import { ManualSale } from '../admin/Orders'
import { offerCopy, DEAL_TYPES } from '../../lib/offers'

// The affiliate's own link, one tap from the top of the dashboard. Academy
// used to hold this slot while also sitting in the bottom bar, and the link
// itself was folded away near the foot of the page.
function CopyMyLink({ link }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setDone(true); setTimeout(() => setDone(false), 1800) }
    catch { window.prompt('Copy your link', link) }
  }
  return <button type="button" onClick={copy}><Icon.coins /> {done ? 'Copied' : 'Copy my link'}</button>
}

function useReseller() {
  const { profile } = useAuth()
  return profile?.partner || null
}

export function ResellerHome() {
  const r = useReseller()
  const { data, loading, error } = useData(async () => {
    if (!r) return null
    const [s, recent] = await Promise.all([
      q(supabase.rpc('reseller_summary', { p_reseller: r.id })),
      q(supabase.from('orders').select('id,order_number,subtotal,status,created_at').eq('reseller_id', r.id).order('created_at', { ascending: false }).limit(6)),
    ])
    // A temporary catalogue error should never hide an affiliate's earnings dashboard.
    const { data: products } = await supabase.from('public_products')
      .select('id,name,price,images,vendor_name,offering_type')
      .eq('status', 'published').order('created_at', { ascending: false }).limit(4)
    return { s: s || {}, recent: recent || [], products: products || [] }
  }, [r?.id])
  if (!r) return <Empty title="No affiliate profile">Your account isn't linked to an approved affiliate application.</Empty>
  if (error) return <div className="card" role="alert">We couldn't load your affiliate dashboard: {error}</div>
  if (loading || !data) return <Loading />
  const { s, recent, products } = data
  const link = `${window.location.origin}/r/${r.code}`
  return <main className="aff-dash">
    <div className="aff-dash-welcome">
      <span className="aff-home-eyebrow">ZAMARKET · AFFILIATE HUB</span>
      <h1>Welcome back, {r.full_name?.split(' ')[0] || 'affiliate'}.</h1>
      <p>Find your next customer. Promote products you believe in. Track every earned commission.</p>
    </div>

    <div className="aff-dash-numbers" aria-label="Affiliate performance">
      <div className="aff-dash-number is-primary"><span>Paid to you</span><strong>{money(s.paid)}</strong><small>Received commission</small></div>
      <div className="aff-dash-number"><span>Approved</span><strong>{money(s.approved)}</strong><small>Awaiting payout</small></div>
      <div className="aff-dash-number"><span>Pending</span><strong>{money(s.pending)}</strong><small>Subject to checks</small></div>
      <div className="aff-dash-number"><span>Orders this month</span><strong>{s.sales_month ?? 0}</strong><small>Placed, not necessarily paid</small></div>
    </div>

    <div className="aff-dash-action-block">
      <Link className="aff-dash-main-action" to="/sell/products"><Icon.camera /> <span>Promote a product</span><Icon.arrow /></Link>
      <div className="aff-dash-shortcuts">
        <Link to="/sell/find-customers"><Icon.sparkles /> Create a promotion</Link>
        <Link to="/sell/earnings"><Icon.coins /> My earnings</Link>
        <CopyMyLink link={link} />
      </div>
    </div>

    <AffiliateMonthlyGoal resellerId={r.id} />

    <section className="aff-dash-products">
      <div className="aff-dash-section-head"><div><span className="aff-home-eyebrow">YOUR NEXT OPPORTUNITY</span><h2>Find something worth sharing</h2></div><Link to="/sell/products">View all <Icon.arrow /></Link></div>
      {products.length > 0 ? <div className="aff-dash-product-grid">{products.map(p =>
        <Link to={`/sell/products?product=${encodeURIComponent(p.id)}`} key={p.id} className="aff-dash-product">
          {p.images?.[0] ? <img src={p.images[0]} alt={p.name} loading="lazy" /> : <div className="aff-dash-no-photo"><Icon.camera /><span>Photo coming soon</span></div>}
          <div><strong>{p.name}</strong><small>{p.vendor_name || 'ZaMarket seller'}</small><div className="aff-dash-product-bottom"><b>{money(p.price)}</b><span aria-hidden="true"><Icon.arrow /></span></div></div>
        </Link>
      )}</div> : <div className="aff-dash-empty">Published products will appear here when available. <Link to="/sell/products">Browse products</Link></div>}
    </section>

    <details className="aff-dash-secondary"><summary><Icon.coins /> My referral link <span>Copy or share</span></summary><div className="aff-dash-secondary-body"><p className="small muted">Use a product-specific link when possible. Shares from the marketplace should credit your approved affiliate account.</p><CopyLine text={link} /></div></details>

    <DashboardTrend scope="reseller" id={r.id} href="/sell/earnings" />
    <details className="aff-dash-secondary"><summary><Icon.clock /> Recent orders <span>{recent.length} shown</span></summary><div className="aff-dash-secondary-body"><Table rows={recent} empty="No orders yet. Explore products and start sharing." cols={[
      { key: 'order_number', label: 'Order', render: o => `#${o.order_number}` },
      { key: 'created_at', label: 'Date', render: o => date(o.created_at) },
      { key: 'status', label: 'Status', render: o => <Badge status={o.status} /> },
      { key: 'subtotal', label: 'Order value', num: true, render: o => money(o.subtotal) },
    ]} /></div></details>
    <p className="aff-dash-disclaimer">Commissions depend on completed, valid transactions and may be reversed for refunds or fraud. Earnings targets are personal estimates, not guaranteed payments.</p>
  </main>
}

export function ResellerProducts() {
  const r = useReseller()
  const { settings } = useAuth()
  const [kit, setKit] = useState(null)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const chosenProduct = searchParams.get('product')
  const { data, loading } = useData(async () => ({
    products: await q(supabase.from('public_products').select('id,slug,name,description,benefits,faqs,images,price,normal_price,commission_type,commission_value,stock_available,owner_type,vendor_slug,offering_type,sales_model,page,package_count,fulfilment,category,featured_for_resellers,created_at,rating,review_count,vendor_name,boost_pct,boost_until').eq('status', 'published').order('name')),
    offers: await q(supabase.from('public_offers').select('*')),
    vehicleRewards: (await supabase.rpc('affiliate_vehicle_reward_estimates')).data || [],
  }), [])
  if (loading || !data) return <Loading />
  const selected = kit || data.products.find(p => p.id === chosenProduct) || null
  const vehicleReward = (p) => Number(data.vehicleRewards.find(x => x.product_id === p.id)?.estimated_reward || 0)
  const earned = (p) => p.offering_type === 'vehicle' ? vehicleReward(p) : commissionLabel(p, settings).perUnit
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Products to sell</h1><p>Sorted by what you earn. Tap one for ready-made messages, photos and your link.</p></div></div>
      {data.products.length === 0 ? <Empty title="No products yet">Check back soon.</Empty> : (
        <div className="product-grid">
          {[...data.products].sort((a, b) => earned(b) - earned(a)).map((p) => {
            const c = commissionLabel(p, settings)
            const boosted = p.boost_pct && new Date(p.boost_until) > new Date()
            return (
              <div key={p.id} className={`pcard ${boosted ? 'boosted' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setKit(p)}>
                {boosted && <span className="boost-flag">Paying extra until {date(p.boost_until)}</span>}
                <div className="pimg">{p.images?.[0] ? <img src={p.images[0]} alt={p.name} loading="lazy" /> : 'No photo'}</div>
                <div className="pbody">
                  <div className="strong truncate">{p.name}</div>
                  <div className="price">{money(p.price)}</div>
                  {p.offering_type === 'vehicle' ? <div className="small">Seller-funded vehicle success fee</div> : <div className="small">Commission {c.text}</div>}
                  <div className="save">{p.offering_type === 'vehicle' ? (vehicleReward(p) > 0 ? `Estimated reward ${money(vehicleReward(p))} if sale closes at asking price` : 'Reward not yet confirmed') : `You earn ${money(c.perUnit)} per sale`}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {selected && <SellingKit p={selected} r={r} offers={data.offers.filter((o) => o.product_id === selected.id)} vehicleReward={vehicleReward(selected)} onClose={() => { setKit(null); if (chosenProduct) navigate('/sell/products', { replace: true }) }} />}
    </div>
  )
}

function SellingKit({ p, r, offers, vehicleReward = 0, onClose }) {
  const { settings } = useAuth()
  const deal = offers.find((o) => DEAL_TYPES.includes(o.type))
  const offerInfo = deal ? { copy: `${offerCopy(deal, p.name).get} for ${money(deal.deal_price)}`, end: deal.end_at } : null
  return <PromoKit product={p} offer={offerInfo} code={r?.code} settings={settings} vehicleReward={vehicleReward} onClose={onClose} />
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
  const [statement, setStatement] = useState(false)
  const { data: bonuses } = useData(() => r ? q(supabase.from('bonus_credits').select('*,order:orders(order_number)').eq('reseller_id', r.id).order('created_at', { ascending: false })) : Promise.resolve([]), [r?.id])
  const { data, loading } = useData(() => r ? q(supabase.from('commissions').select('*,order:orders(order_number,status)').eq('reseller_id', r.id).order('created_at', { ascending: false })) : Promise.resolve([]), [r?.id])
  if (loading) return <Loading />
  return (
    <div className="stack">
      <AffiliatePlan />
      <PayoutRequest who="reseller" />
      <div className="page-head">
        <div><h1>Commissions</h1><p>Pending → Verified → Approved → Paid.</p></div>
        <button className="btn" onClick={() => setStatement(!statement)}>{statement ? 'Back to the list' : 'Statement for a period'}</button>
      </div>
      {statement && <AffiliateStatement who={r} rows={data} bonuses={bonuses || []} />}
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


// What an affiliate can show anyone who asks what they earned, and when.
function AffiliateStatement({ who, rows, bonuses }) {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const within = (r) => { const d = (r.created_at || '').slice(0, 10); return d >= from && d <= to }
  const list = (rows || []).filter(within)
  const extra = (bonuses || []).filter(within)
  const by = (st) => list.filter((c) => c.status === st).reduce((t, c) => t + Number(c.amount || 0), 0)
  const bonusTotal = extra.reduce((t, b) => t + Number(b.amount || 0), 0)

  return (
    <div className="stack">
      <div className="card form-grid no-print">
        <Field label="From"><Input type="date" value={from} onChange={setFrom} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={setTo} /></Field>
      </div>
      <Statement
        kind="affiliate"
        id={`COM-${from.replace(/-/g, '')}`}
        who={who?.full_name || 'Affiliate'}
        period={{ from, to }}
        status={`${list.filter((c) => c.status === 'paid').length} of ${list.length} paid`}
        lines={[
          { label: 'Qualifying sales', sub: `${list.length} completed orders`, amount: by('pending') + by('verified') + by('approved') + by('paid') },
          ...(bonusTotal > 0 ? [{ label: 'Bonuses', sub: extra.map((b) => b.kind.replace(/_/g, ' ')).join(', '), amount: bonusTotal }] : []),
        ]}
        totals={[
          { label: 'Still being checked', amount: by('pending') },
          { label: 'Ready to be paid', amount: by('verified') + by('approved') },
          { label: 'Already paid', amount: by('paid') },
          { label: 'Earned in this period', amount: by('pending') + by('verified') + by('approved') + by('paid') + bonusTotal, strong: true },
        ]}
        note="Commission is earned when an order is completed, and checked before it is paid. Cancelled or returned orders are removed."
      />
    </div>
  )
}
