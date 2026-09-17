import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, datetime, title, n } from '../../lib/format'
import { ORDER_NEXT, SOURCES, CHANNELS, PAYMENT_METHODS } from '../../lib/statuses'
import { Badge, Table, Loading, Modal, Field, Input, Select, Textarea, useToast, Breakdown, Tabs } from '../../components/ui'
import { useLocations } from '../public/Checkout'
import { niceDate } from '../../lib/madeToOrder'

const FILTERS = [['', 'All'], ['pending', 'New'], ['active', 'In progress'], ['completed', 'Completed'], ['problem', 'Problems']]
const ACTIVE = ['confirmed', 'payment_pending', 'paid', 'processing', 'ready_for_dispatch', 'out_for_delivery', 'delivered']
const PROBLEM = ['cancelled', 'refunded', 'returned', 'failed_delivery', 'fraud_review', 'customer_unreachable']

export function OrdersList() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const filter = sp.get('status') || ''
  const [manual, setManual] = useState(sp.get('new') === '1')
  const { data, loading, reload } = useData(async () => {
    let qry = supabase.from('orders').select('*,customer:customers(full_name,phone),district:districts(name),reseller:resellers(code,full_name)').order('created_at', { ascending: false }).limit(200)
    if (filter === 'pending') qry = qry.eq('status', 'pending')
    else if (filter === 'active') qry = qry.in('status', ACTIVE)
    else if (filter === 'completed') qry = qry.eq('status', 'completed')
    else if (filter === 'problem') qry = qry.in('status', PROBLEM)
    return q(qry)
  }, [filter])

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Orders</h1><p>Every sale, wherever it happened.</p></div>
        <button className="btn primary" onClick={() => setManual(true)}>Record a sale</button>
      </div>
      <Tabs tabs={FILTERS} value={filter} onChange={(v) => setSp(v ? { status: v } : {})} />
      {loading ? <Loading /> : (
        <Table
          rows={data}
          onRow={(r) => nav(`/admin/orders/${r.id}`)}
          empty="No orders in this view"
          cols={[
            { key: 'order_number', label: '#', render: (r) => <span className="strong">#{r.order_number}</span> },
            { key: 'customer', label: 'Customer', render: (r) => <div><div>{r.customer?.full_name}</div><div className="tiny muted">{r.customer?.phone}</div></div> },
            { key: 'needed_by', label: 'Needed', render: (r) => r.needed_by ? <span className="strong copper">{niceDate(r.needed_by)}</span> : <span className="muted">—</span> },
            { key: 'where', label: 'Where', render: (r) => <span>{r.district?.name || '—'}{!r.is_local && r.district && <span className="badge warn" style={{ marginLeft: 6 }}>Outside zone</span>}</span> },
            { key: 'status', label: 'Status', render: (r) => <span className="row"><Badge status={r.status} />{r.risk_flags?.length > 0 && <span className="badge bad" title={r.risk_flags.join(', ')}>!</span>}</span> },
            { key: 'payment_status', label: 'Payment', render: (r) => <Badge status={r.payment_status === 'paid' ? 'paid' : 'pending'}>{title(r.payment_status)}</Badge> },
            { key: 'seller', label: 'Seller', render: (r) => r.reseller ? r.reseller.full_name : 'Founder' },
            { key: 'total', label: 'Total', num: true, render: (r) => money(r.total) },
            { key: 'created_at', label: 'Placed', render: (r) => <span className="tiny muted">{datetime(r.created_at)}</span> },
          ]}
        />
      )}
      {manual && <ManualSale onClose={() => setManual(false)} onDone={() => { setManual(false); reload() }} />}
    </div>
  )
}

export function OrderDetail() {
  const { id } = useParams()
  const { advanced, settings } = useAuth()
  const toast = useToast()
  const [pay, setPay] = useState(false)
  const [fee, setFee] = useState(null)
  const [reason, setReason] = useState('')
  const { data: o, loading, reload } = useData(() => q(
    supabase.from('orders').select('*,customer:customers(*),province:provinces(name),district:districts(name),reseller:resellers(code,full_name,phone),items:order_items(*,product:products(name,owner_type),offer:offers(name)),payments(*),delivery:deliveries(*),commissions(*),settlements(*,vendor:vendors(business_name))').eq('id', id).single()
  ), [id])
  const { data: log } = useData(() => advanced ? q(supabase.from('audit_logs').select('*').eq('entity_id', id).order('created_at')) : Promise.resolve([]), [id, advanced])

  if (loading || !o) return <Loading />
  const next = ORDER_NEXT[o.status] || []
  const move = async (status) => {
    const needsReason = ['cancelled', 'refunded', 'returned', 'failed_delivery', 'fraud_review'].includes(status)
    const r = needsReason ? (reason || window.prompt(`Reason for marking as ${title(status).toLowerCase()}?`)) : reason || null
    if (needsReason && !r) return
    const { error } = await supabase.rpc('set_order_status', { p_order: id, p_status: status, p_reason: r })
    if (error) return toast(error.message, true)
    toast(`Order marked ${title(status).toLowerCase()}`)
    setReason('')
    reload()
  }
  const markCollected = async (item) => {
    const { error } = await supabase.rpc('vendor_set_item_status', { p_item: item, p_status: 'collected' })
    if (error) return toast(error.message, true)
    toast('Marked collected from vendor'); reload()
  }
  const saveFee = async () => {
    const f = n(fee)
    const { error } = await supabase.from('orders').update({ delivery_fee: f, delivery_fee_status: 'confirmed', total: n(o.subtotal) + f }).eq('id', id)
    if (error) return toast(error.message, true)
    await supabase.from('deliveries').update({ status: 'fee_confirmed' }).eq('order_id', id)
    toast('Delivery fee confirmed'); setFee(null); reload()
  }
  const cost = o.items.reduce((s, i) => s + (i.product?.owner_type === 'founder' ? n(i.unit_cost_snapshot) * i.quantity : 0), 0)
  const comm = o.commissions.filter((c) => !['rejected', 'reversed'].includes(c.status)).reduce((s, c) => s + n(c.amount), 0)
  const fees = o.settlements.filter((s) => s.status !== 'cancelled').reduce((s, x) => s + n(x.marketplace_fee), 0)
  const vendorPay = o.settlements.filter((s) => s.status !== 'cancelled').reduce((s, x) => s + n(x.net_payable), 0)
  const delivCost = n(o.delivery?.delivery_cost) + n(o.delivery?.fuel_cost)
  const profit = n(o.subtotal) - cost - vendorPay - comm + n(o.delivery_fee) - delivCost

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="row"><h1>Order #{o.order_number}</h1><Badge status={o.status} /><Badge status={o.payment_status === 'paid' ? 'paid' : 'pending'}>{title(o.payment_status)}</Badge></div>
          <p>{datetime(o.created_at)} · {title(o.channel)} · {o.is_manual ? 'Recorded manually' : 'Online checkout'}</p>
          {o.needed_by && <p className="strong copper">Needed by {niceDate(o.needed_by)}</p>}
        </div>
        <div className="btn-row">
          <Link to={`/admin/orders/${id}/receipt`} className="btn">Print receipt</Link>
          <Link to="/admin/orders" className="btn ghost">All orders</Link>
        </div>
      </div>

      <div className="grid-2 tight">
        <div className="card stack-sm">
          <h3>Customer</h3>
          <div className="strong">{o.customer?.full_name}</div>
          <div><a href={`tel:${o.customer?.phone}`}>{o.customer?.phone}</a> · <a href={`https://wa.me/${String(o.customer?.phone || '').replace(/\D/g, '').replace(/^0/, '260')}`} target="_blank" rel="noreferrer">WhatsApp</a></div>
          <div className="small">{[o.address, o.area, o.district?.name, o.province?.name].filter(Boolean).join(', ')}</div>
          {o.instructions && <div className="small muted">Note: {o.instructions}</div>}
          {!o.is_local && <span className="badge warn">Outside Lusaka District — confirm delivery by phone</span>}
          {o.risk_flags?.includes('self_purchase') && <span className="badge bad">Possible self-purchase: the customer's phone matches the reseller. No commission will be paid.</span>}
          {o.risk_flags?.includes('not_enough_stock') && <span className="badge warn">Ordered more than was in stock. Check stock before confirming.</span>}
        </div>
        <div className="card stack-sm">
          <h3>Attribution</h3>
          <Breakdown items={[['Source', title(o.source)], ['Channel', title(o.channel)], ['Seller', o.reseller ? `${o.reseller.full_name} (${o.reseller.code})` : 'Founder']]} />
        </div>
      </div>

      <div className="card">
        <h3 className="mb">Items</h3>
        {o.items.map((i) => (
          <div key={i.id} className="stack-sm" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="between small">
              <span>{i.quantity} × {i.product?.name}{i.offer && <span className="offer-tag" style={{ marginLeft: 6, display: 'inline-block', verticalAlign: 'middle' }}>{i.offer.name}</span>}{advanced && i.product?.owner_type === 'founder' && <span className="muted"> · cost {money(i.unit_cost_snapshot)}/unit</span>}</span>
              <span className="money">{money(i.line_total)}</span>
            </div>
            {i.choices && Object.keys(i.choices).length > 0 && <div className="tiny">{Object.entries(i.choices).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>}
            {i.note && <div className="tiny">Message: <span className="strong">“{i.note}”</span></div>}
            {i.vendor_id && (
              <div className="between tiny">
                <span className="muted">Vendor: <Badge tone={{ new: 'warn', preparing: 'info', ready: 'ok', collected: 'ok' }[i.vendor_status]}>{{ new: 'Not started', preparing: 'Preparing', ready: 'Ready for collection', collected: 'Collected' }[i.vendor_status]}</Badge></span>
                {i.vendor_status === 'ready' && <button className="btn sm" onClick={() => markCollected(i.id)}>Mark collected</button>}
              </div>
            )}
          </div>
        ))}
        <div className="between small mt"><span>Subtotal</span><span className="money">{money(o.subtotal)}</span></div>
        <div className="between small">
          <span>Delivery fee {o.delivery_fee_status !== 'confirmed' && <span className="badge warn">Not confirmed</span>}</span>
          {fee === null ? (
            <span className="row"><span className="money">{money(o.delivery_fee)}</span>{!['completed', 'cancelled', 'refunded'].includes(o.status) && <button className="btn sm ghost" onClick={() => setFee(o.delivery_fee)}>Change</button>}</span>
          ) : (
            <span className="row"><Input money value={fee} onChange={setFee} style={{ width: 110 }} /><button className="btn sm primary" onClick={saveFee}>Save</button><button className="btn sm ghost" onClick={() => setFee(null)}>Cancel</button></span>
          )}
        </div>
        <div className="between strong mt"><span>Total</span><span className="money">{money(o.total)}</span></div>
      </div>

      <div className="card">
        <h3 className="mb">Move this order forward</h3>
        {next.length === 0 ? <p className="muted small">This order is closed.</p> : (
          <div className="stack-sm">
            <div className="btn-row">
              {next.map((s) => <button key={s} className={`btn ${['completed', 'delivered', 'confirmed', 'paid'].includes(s) ? 'primary' : PROBLEM.includes(s) ? 'danger' : ''}`} onClick={() => move(s)}>{title(s)}</button>)}
              {o.payment_status !== 'paid' && !['cancelled', 'refunded'].includes(o.status) && <button className="btn copper" onClick={() => setPay(true)}>Record payment</button>}
            </div>
            <Input value={reason} onChange={setReason} placeholder="Optional note for the audit log" />
            {o.status === 'delivered' && <p className="tiny muted">Marking completed releases stock as sold and creates commissions and vendor payouts. Commissions become payable {settings.commission_grace_hours ?? 24} hours later if there are no issues.</p>}
          </div>
        )}
      </div>

      <div className="grid-2 tight">
        <div className="card">
          <h3 className="mb">Money on this order</h3>
          <Breakdown
            items={[
              ['Customer paid for goods', n(o.subtotal)],
              ['Delivery fee charged', n(o.delivery_fee)],
              cost ? ['Our product cost', -cost, 'bad'] : null,
              vendorPay ? ['Owed to vendor', -vendorPay, 'bad'] : null,
              comm ? ['Reseller commission', -comm, 'bad'] : null,
              delivCost ? ['Delivery & fuel cost', -delivCost, 'bad'] : null,
            ]}
            total={[o.status === 'completed' ? 'Profit' : 'Projected profit', profit, profit >= 0 ? 'ok' : 'bad']}
          />
          {fees > 0 && <p className="tiny muted mt">Includes {money(fees)} marketplace fee kept from vendor sales.</p>}
        </div>
        <div className="card stack-sm">
          <h3>Payments</h3>
          {o.payments.length === 0 ? <p className="muted small">No payment recorded yet.</p> : o.payments.map((p) => (
            <div key={p.id} className="between small"><span>{title(p.method)} {p.reference && <span className="muted">· {p.reference}</span>}</span><span className="money">{money(p.amount)}</span></div>
          ))}
          {o.commissions.length > 0 && <><h3 className="mt">Commission</h3>{o.commissions.map((c) => <div key={c.id} className="between small"><span>{o.reseller?.full_name}</span><span className="row"><Badge status={c.status} /><span className="money">{money(c.amount)}</span></span></div>)}</>}
          {o.settlements.length > 0 && <><h3 className="mt">Vendor payout</h3>{o.settlements.map((s) => <div key={s.id} className="between small"><span>{s.vendor?.business_name}</span><span className="row"><Badge status={s.status} /><span className="money">{money(s.net_payable)}</span></span></div>)}</>}
        </div>
      </div>

      {advanced && log?.length > 0 && (
        <div className="card">
          <h3 className="mb">History</h3>
          <div className="timeline">
            {log.map((l) => <div key={l.id} className="t"><span className="muted">{datetime(l.created_at)}</span><span>{title(l.action)}{l.new_value?.status ? ` → ${title(l.new_value.status)}` : ''}{l.reason ? ` — ${l.reason}` : ''}</span></div>)}
          </div>
        </div>
      )}

      {pay && <PayModal order={o} onClose={() => setPay(false)} onDone={() => { setPay(false); reload() }} />}
    </div>
  )
}

function PayModal({ order, onClose, onDone }) {
  const toast = useToast()
  const [f, setF] = useState({ method: 'cash', amount: order.total, reference: '' })
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.rpc('record_payment', { p_order: order.id, p_method: f.method, p_amount: n(f.amount), p_reference: f.reference || null })
    if (error) return toast(error.message, true)
    toast('Payment recorded'); onDone()
  }
  return (
    <Modal title={`Record payment for #${order.order_number}`} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Field label="Method"><Select value={f.method} onChange={(v) => setF({ ...f, method: v })} options={PAYMENT_METHODS} /></Field>
        <Field label="Amount"><Input money value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required /></Field>
        <Field label="Reference (transaction ID, optional)"><Input value={f.reference} onChange={(v) => setF({ ...f, reference: v })} /></Field>
        <button className="btn primary block">Save payment</button>
      </form>
    </Modal>
  )
}

// Manual sale: WhatsApp, phone, in person. Same order pipeline as online checkout.
export function ManualSale({ onClose, onDone, resellerCode }) {
  const toast = useToast()
  const { provinces, districts } = useLocations()
  const { data: products } = useData(() => q(supabase.from('products').select('id,name,price,stock_available,owner_type,fulfilment,lead_time_days').in('status', ['published', 'out_of_stock']).order('name')), [])
  const { data: offers } = useData(() => q(supabase.from('public_offers').select('id,name,type,product_id,units,deal_price').not('type', 'in', '(downsell)')), [])
  const [f, setF] = useState({ full_name: '', phone: '', province_id: '', district_id: '', area: '', address: '', channel: 'whatsapp', source: resellerCode ? `reseller:${resellerCode}` : 'whatsapp', notes: '' })
  const [items, setItems] = useState([{ product_id: '', offer_id: '', quantity: 1 }])
  const [neededBy, setNeededBy] = useState('')
  const hasMto = items.some((it) => (products || []).find((p) => p.id === it.product_id)?.fulfilment === 'made_to_order')
  const set = (k) => (v) => setF((c) => ({ ...c, [k]: v, ...(k === 'province_id' ? { district_id: '' } : {}) }))
  const dlist = districts.filter((d) => String(d.province_id) === String(f.province_id))

  const submit = async (e) => {
    e.preventDefault()
    const clean = items.filter((i) => i.product_id)
    if (!clean.length) return toast('Add at least one product', true)
    const { error } = await supabase.rpc('place_order', {
      payload: {
        customer: { full_name: f.full_name, phone: f.phone, province_id: f.province_id || null, district_id: f.district_id || null, area: f.area, address: f.address },
        items: clean.map((i) => (i.offer_id ? { product_id: i.product_id, offer_id: i.offer_id, deals: Number(i.quantity) || 1 } : { product_id: i.product_id, quantity: Number(i.quantity) || 1 })),
        needed_by: hasMto ? neededBy || null : null,
        referral_code: resellerCode || null, source: f.source, channel: f.channel, is_manual: true, notes: f.notes,
      },
    })
    if (error) return toast(error.message, true)
    toast('Sale recorded'); onDone()
  }

  return (
    <Modal title="Record a sale" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <p className="small muted">For sales made on WhatsApp, by phone or in person. It enters the same order flow as online orders.</p>
        <div className="form-grid">
          <Field label="Customer name"><Input value={f.full_name} onChange={set('full_name')} required /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set('phone')} type="tel" required /></Field>
          <Field label="Province"><Select value={f.province_id} onChange={set('province_id')} options={provinces.map((p) => [p.id, p.name])} placeholder="Choose" /></Field>
          <Field label="District"><Select value={f.district_id} onChange={set('district_id')} options={dlist.map((d) => [d.id, d.name])} placeholder="Choose" /></Field>
          <Field label="Area"><Input value={f.area} onChange={set('area')} /></Field>
          <Field label="Address"><Input value={f.address} onChange={set('address')} /></Field>
          <Field label="Where did the sale happen?"><Select value={f.channel} onChange={set('channel')} options={CHANNELS} /></Field>
          {!resellerCode && <Field label="Where did the customer come from?"><Select value={f.source} onChange={set('source')} options={SOURCES} /></Field>}
        </div>
        <div className="stack-sm">
          <label className="strong small">Products</label>
          {items.map((it, i) => {
            const upd = (patch) => setItems(items.map((x, k) => (k === i ? { ...x, ...patch } : x)))
            const avail = (offers || []).filter((o) => o.product_id === it.product_id)
            const chosen = avail.find((o) => o.id === it.offer_id)
            return (
              <div key={i} className="card flat stack-sm" style={{ padding: 10 }}>
                <div className="row">
                  <select className="input" style={{ flex: 1 }} value={it.product_id} onChange={(e) => upd({ product_id: e.target.value, offer_id: '' })} required>
                    <option value="">Choose product</option>
                    {(products || []).map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}{p.owner_type === 'founder' ? ` (${p.stock_available} in stock)` : ''}</option>)}
                  </select>
                  {items.length > 1 && <button type="button" className="btn sm ghost" onClick={() => setItems(items.filter((_, k) => k !== i))}>✕</button>}
                </div>
                <div className="row">
                  {avail.length > 0 && (
                    <select className="input" style={{ flex: 1 }} value={it.offer_id} onChange={(e) => upd({ offer_id: e.target.value })}>
                      <option value="">No offer</option>
                      {avail.map((o) => <option key={o.id} value={o.id}>{o.name} — {money(o.deal_price)}{o.units > 1 ? ` for ${o.units}` : ''}</option>)}
                    </select>
                  )}
                  <Input type="number" min="1" value={it.quantity} onChange={(v) => upd({ quantity: v })} style={{ width: 70 }} />
                  <span className="tiny muted">{chosen ? (chosen.units > 1 ? `deals (${chosen.units * (Number(it.quantity) || 1)} units)` : 'deals') : 'units'}</span>
                </div>
              </div>
            )
          })}
          <button type="button" className="btn sm" onClick={() => setItems([...items, { product_id: '', offer_id: '', quantity: 1 }])}>Add another product</button>
        </div>
        {hasMto && <Field label="Needed by" hint="Made-to-order items need a date"><Input type="date" value={neededBy} onChange={setNeededBy} required /></Field>}
        <Field label="Notes" hint="Flavours, messages or other details for made-to-order items"><Textarea value={f.notes} onChange={set('notes')} rows={2} /></Field>
        <button className="btn primary block">Record sale</button>
      </form>
    </Modal>
  )
}
