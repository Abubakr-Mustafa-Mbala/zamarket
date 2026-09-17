import { useMemo, useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, pct, date, n, title } from '../../lib/format'
import { OFFER_TYPES, OFFER_CATEGORIES, FIELD_LABELS, TEXT_FIELDS, offerEconomics } from '../../lib/economics'
import { effectiveCost } from './Products'
import { offerCopy } from '../../lib/offers'
import { Badge, Table, Loading, Modal, Field, Input, Select, Textarea, Breakdown, Light, useToast } from '../../components/ui'

export default function Offers() {
  const { settings, isFounder } = useAuth()
  const [edit, setEdit] = useState(null)
  const { data, loading, reload } = useData(async () => ({
    offers: await q(supabase.from('offers').select('*,product:products(name)').order('created_at', { ascending: false })),
    products: await q(supabase.from('products').select('*').in('status', ['published', 'out_of_stock', 'approved']).order('name')),
  }), [])

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Offers</h1><p>Attraction, upsell, downsell and continuity offers — each one checked for profit before it goes live.</p></div>
        <button className="btn primary" onClick={() => setEdit({ category: 'attraction', type: 'buy_x_get_y', config: {}, status: 'draft' })}>Build an offer</button>
      </div>
      {loading ? <Loading /> : (
        <Table rows={data.offers} onRow={setEdit} empty="No offers yet — build your first one" cols={[
          { key: 'name', label: 'Offer', render: (o) => <div><div className="strong">{o.name}</div><div className="tiny muted">{o.product?.name} · {OFFER_TYPES.find((t) => t.key === o.type)?.name}</div></div> },
          { key: 'category', label: 'Kind', render: (o) => <Badge>{title(o.category)}</Badge> },
          { key: 'status', label: 'Status', render: (o) => <Badge status={liveState(o)} /> },
          { key: 'used', label: 'Used', num: true, render: (o) => o.inventory_limit ? `${o.units_used} / ${o.inventory_limit}` : o.units_used },
          { key: 'customer_price', label: 'Customer pays', num: true, render: (o) => money(o.customer_price) },
          { key: 'profit', label: 'Profit / deal', num: true, render: (o) => <span className={n(o.economics?.netProfit) > 0 ? 'ok' : 'bad'}>{money(o.economics?.netProfit)}</span> },
          { key: 'end_at', label: 'Ends', render: (o) => o.end_at ? date(o.end_at) : '—' },
        ]} />
      )}
      {edit && <OfferBuilder offer={edit} products={data?.products || []} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function liveState(o) {
  if (o.status !== 'active') return o.status
  if (o.end_at && new Date(o.end_at) < new Date()) return 'expired'
  if (o.start_at && new Date(o.start_at) > new Date()) return 'scheduled'
  if (o.inventory_limit != null && o.units_used >= o.inventory_limit) return 'sold_out'
  return 'active'
}

// Zambia is UTC+2 all year. A start date begins at 00:00 and an end date runs to 23:59 that day.
const toStart = (d) => (d ? `${d.slice(0, 10)}T00:00:00+02:00` : null)
const toEnd = (d) => (d ? `${d.slice(0, 10)}T23:59:59+02:00` : null)
const dateOnly = (ts) => (ts ? new Date(new Date(ts).getTime() + 2 * 36e5).toISOString().slice(0, 10) : '')

function OfferBuilder({ offer, products, onClose, onDone }) {
  const toast = useToast()
  const { settings, isFounder, user } = useAuth()
  const [o, setO] = useState({ ...offer, config: { ...(offer.config || {}) }, start_at: dateOnly(offer.start_at), end_at: dateOnly(offer.end_at) })
  const [overrideReason, setOverrideReason] = useState(offer.override_reason || '')
  const set = (k) => (v) => setO((c) => ({ ...c, [k]: v }))
  const setCfg = (k) => (v) => setO((c) => ({ ...c, config: { ...c.config, [k]: v } }))
  const type = OFFER_TYPES.find((t) => t.key === o.type) || OFFER_TYPES[0]
  const product = products.find((p) => p.id === o.product_id)
  const econ = useMemo(() => product ? offerEconomics(o.type, o.config, { ...product, effective_cost: effectiveCost(product) }, settings) : null, [o.type, o.config, product, settings])

  const save = async (status) => {
    if (!product) return toast('Choose a product', true)
    const goingLive = status === 'active' || status === 'pending_approval'
    if (goingLive && o.type === 'flash' && !o.end_at) return toast('A limited-time offer needs an end date.', true)
    if (goingLive && econ.belowFloor && !isFounder) return toast('This offer is below the price floor. A founder must approve it.', true)
    if (goingLive && econ.belowFloor && !overrideReason) return toast('Give a reason for going below the price floor — it is recorded.', true)
    const row = {
      name: o.name, category: type.category, type: o.type, product_id: o.product_id, config: o.config,
      customer_price: econ.price, normal_value: econ.normalValue,
      start_at: toStart(o.start_at), end_at: toEnd(o.end_at), inventory_limit: o.inventory_limit ? Number(o.inventory_limit) : null,
      terms: o.terms || null, status: status || o.status, economics: econ,
      floor_override: goingLive && econ.belowFloor, override_reason: econ.belowFloor ? overrideReason : null,
    }
    const res = o.id ? await supabase.from('offers').update(row).eq('id', o.id) : await supabase.from('offers').insert({ ...row, created_by: user.id })
    if (res.error) return toast(res.error.message, true)
    toast(status === 'active' ? 'Offer is live' : 'Saved'); onDone()
  }

  return (
    <Modal title={o.id ? o.name : 'Build an offer'} onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); save() }} className="stack">
        <div className="form-grid">
          <Field label="Offer name (what the customer sees)" span><Input value={o.name} onChange={set('name')} placeholder="e.g. Buy 2 solar lamps, get 1 free" required /></Field>
          <Field label="Product"><Select value={o.product_id} onChange={set('product_id')} options={products.map((p) => [p.id, `${p.name} — ${money(p.price)}`])} placeholder="Choose product" required /></Field>
          <Field label="Offer model">
            <select className="input" value={o.type} onChange={(e) => setO({ ...o, type: e.target.value, config: {} })}>
              {Object.entries(OFFER_CATEGORIES).map(([cat, label]) => (
                <optgroup key={cat} label={label}>{OFFER_TYPES.filter((t) => t.category === cat).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</optgroup>
              ))}
            </select>
          </Field>
          <div className="span tiny muted">{type.help}</div>
          {type.fields.map((f) => (
            <Field key={f} label={FIELD_LABELS[f]}>
              {TEXT_FIELDS.includes(f)
                ? <Input value={o.config[f]} onChange={setCfg(f)} required />
                : <Input money={/\(K\)/.test(FIELD_LABELS[f])} type="number" value={o.config[f]} onChange={setCfg(f)} required />}
            </Field>
          ))}
          <Field label="Starts (optional)"><Input type="date" value={o.start_at} onChange={set('start_at')} /></Field>
          <Field label={o.type === 'flash' ? 'Ends' : 'Ends (optional)'} hint="Runs to the end of this day"><Input type="date" value={o.end_at} onChange={set('end_at')} /></Field>
          <Field label="Limit (units, optional)" hint={o.id ? `${o.units_used || 0} used so far` : 'Customers see how many are left'}><Input type="number" value={o.inventory_limit} onChange={set('inventory_limit')} /></Field>
          <Field label="Terms shown to customer" span><Textarea value={o.terms} onChange={set('terms')} rows={2} placeholder="e.g. While stocks last. Lusaka delivery only." /></Field>
        </div>

        {econ && (
          <div className="card flat">
            <div className="between mb"><h3>Economics per deal</h3><Light tone={econ.light.tone} label={econ.light.label} /></div>
            <div className="grid-2 tight">
              <Breakdown
                items={[
                  ['Customer pays', econ.price],
                  ['Product cost', -econ.productCost, 'bad'],
                  ['Packaging', -econ.packaging, 'bad'],
                  econ.delivery ? ['Delivery we absorb', -econ.delivery, 'bad'] : null,
                  econ.commission ? ['Reseller commission', -econ.commission, 'bad'] : null,
                  econ.marketplaceFee ? ['Marketplace fee', -econ.marketplaceFee, 'bad'] : null,
                  econ.paymentFee ? ['Payment fee', -econ.paymentFee, 'bad'] : null,
                ]}
                total={['Profit per deal', econ.netProfit, econ.netProfit > 0 ? 'ok' : 'bad']}
              />
              <div className="stack-sm small">
                <div className="between"><span className="muted">Normal value</span><span className="money">{money(econ.normalValue)}</span></div>
                <div className="between"><span className="muted">Customer saves</span><span className="money copper strong">{money(econ.savings)}</span></div>
                <div className="between"><span className="muted">Net margin</span><span className={econ.netMargin >= n(settings.target_margin_pct) ? 'ok' : 'warn'}>{pct(econ.netMargin)}</span></div>
                <div className="between"><span className="muted">Price floor</span><span>{pct(econ.floor)} margin</span></div>
                {econ.belowFloor && (
                  <div className="card" style={{ borderColor: 'var(--bad)', padding: 10 }}>
                    <div className="bad strong small">Below the price floor</div>
                    <p className="tiny">Only a founder can publish this, and the reason is recorded.</p>
                    <Input value={overrideReason} onChange={setOverrideReason} placeholder="Why is this worth it?" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {econ && product && (
          <div className="stack-sm">
            <h3>What customers see</h3>
            <div className="offer-card" style={{ maxWidth: 360 }}>
              <div className="offer-name">{o.name || 'Offer name'}</div>
              <div className="small">{offerCopy({ type: o.type, config: o.config, units: econ.units }, product.name).get}</div>
              {offerCopy({ type: o.type, config: o.config, units: econ.units }, product.name).bonus && <div className="offer-bonus">+ {offerCopy({ type: o.type, config: o.config, units: econ.units }, product.name).bonus}</div>}
              <div className="offer-price"><span className="price" style={{ fontSize: '1.4rem' }}>{money(econ.price)}</span>{econ.savings > 0 && <span className="was">{money(econ.normalValue)}</span>}</div>
              {econ.savings > 0 && <span className="save small">You save {money(econ.savings)}</span>}
              <div className="tiny muted">{o.type === 'order_bump' || o.type === 'upsell' ? 'Shown at checkout' : o.type === 'downsell' ? 'Shown when someone removes this product from their cart' : o.type === 'free_delivery' || o.type === 'payment_plan' ? 'Shown as a note on the product page' : 'Shown on the product page'}</div>
            </div>
          </div>
        )}

        <div className="btn-row">
          <button className="btn">Save draft</button>
          {o.status !== 'active' && <button type="button" className="btn primary" onClick={() => save('active')} disabled={!econ}>Publish</button>}
          {o.status === 'active' && <button type="button" className="btn" onClick={() => save('paused')}>Pause</button>}
          {o.id && o.status !== 'archived' && <button type="button" className="btn ghost" onClick={() => save('archived')}>Archive</button>}
        </div>
      </form>
    </Modal>
  )
}
