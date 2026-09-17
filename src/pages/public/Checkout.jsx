import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../lib/cart'
import { money } from '../../lib/format'
import { Field, Input, Select, Textarea, useToast } from '../../components/ui'
import { offerCopy, CHECKOUT_TYPES } from '../../lib/offers'

export function useLocations() {
  const [provinces, setProvinces] = useState([])
  const [districts, setDistricts] = useState([])
  useEffect(() => {
    supabase.from('provinces').select('*').order('name').then(({ data }) => setProvinces(data || []))
    supabase.from('districts').select('*').order('name').then(({ data }) => setDistricts(data || []))
  }, [])
  return { provinces, districts }
}

function useLocalFee() {
  const [fee, setFee] = useState(30)
  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'local_delivery_fee').maybeSingle().then(({ data }) => { if (data) setFee(Number(data.value)) })
  }, [])
  return fee
}

function CartLine({ it, setQty, onRemove }) {
  const saving = (it.normalValue || it.price) - it.price
  return (
    <div className="card stack-sm">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="strong">{it.name}</div>
          {it.offer_name && <div className="offer-tag" style={{ marginTop: 2 }}>{it.offer_name}</div>}
          <div className="small muted">
            {it.units > 1 ? `${it.units} units per deal · ${money(it.price)} per deal` : `${money(it.price)} each`}
            {saving > 0 && <span className="save"> · save {money(saving * it.qty)}</span>}
          </div>
        </div>
        <span className="money strong">{money(it.qty * it.price)}</span>
      </div>
      <div className="between">
        <div className="row">
          <button className="btn sm" aria-label="Fewer" onClick={() => (it.qty <= 1 ? onRemove(it) : setQty(it.key, it.qty - 1))}>−</button>
          <span className="strong">{it.qty}{it.units > 1 ? ` deal${it.qty > 1 ? 's' : ''}` : ''}</span>
          <button className="btn sm" aria-label="More" onClick={() => setQty(it.key, it.qty + 1)}>+</button>
        </div>
        <button className="btn sm ghost" onClick={() => onRemove(it)}>Remove</button>
      </div>
    </div>
  )
}

export function Cart() {
  const { items, setQty, subtotal, savings, add } = useCart()
  const [downsell, setDownsell] = useState(null)
  const onRemove = async (it) => {
    setQty(it.key, 0)
    if (it.offer_type === 'downsell') return
    const { data } = await supabase.from('public_offers').select('*').eq('product_id', it.id).eq('type', 'downsell').limit(1)
    if (data?.[0]) {
      const { data: prod } = await supabase.from('public_products').select('*').eq('id', it.id).maybeSingle()
      if (prod) setDownsell({ offer: data[0], product: prod })
    }
  }
  const takeDownsell = () => { add(downsell.product, 1, downsell.offer); setDownsell(null) }

  const downsellCard = downsell && (
    <div className="offer-card">
      <div className="offer-name">Wait — {downsell.offer.name}</div>
      <div className="small">{offerCopy(downsell.offer, downsell.product.name).get}</div>
      <div className="offer-price"><span className="price">{money(downsell.offer.deal_price)}</span><span className="was">{money(downsell.offer.normal_value)}</span></div>
      <div className="btn-row"><button className="btn copper" onClick={takeDownsell}>Add it back at this price</button><button className="btn ghost" onClick={() => setDownsell(null)}>No thanks</button></div>
    </div>
  )

  if (!items.length) return (
    <div className="stack" style={{ maxWidth: 640 }}>
      {downsellCard}
      <div className="card empty"><h3>Your cart is empty</h3><Link to="/">Browse products</Link></div>
    </div>
  )
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Your cart</h1>
      {items.map((it) => <CartLine key={it.key} it={it} setQty={setQty} onRemove={onRemove} />)}
      {downsellCard}
      <div className="card">
        {savings > 0 && <div className="between small"><span>You're saving</span><span className="save money">{money(savings)}</span></div>}
        <div className="between"><span className="strong">Subtotal</span><span className="strong money">{money(subtotal)}</span></div>
      </div>
      <p className="small muted">Delivery in Lusaka District is added at checkout. For other areas we confirm the delivery cost with you by phone before anything is charged.</p>
      <Link className="btn primary block" to="/checkout">Continue to checkout</Link>
    </div>
  )
}

function Bumps() {
  const { items, add } = useCart()
  const [bumps, setBumps] = useState([])
  const inCart = items.map((i) => i.offer_id).filter(Boolean).join(',')
  useEffect(() => {
    (async () => {
      const { data: offers } = await supabase.from('public_offers').select('*').in('type', CHECKOUT_TYPES).limit(6)
      const list = (offers || []).filter((o) => !items.some((i) => i.offer_id === o.id))
      if (!list.length) return setBumps([])
      const { data: prods } = await supabase.from('public_products').select('*').in('id', list.map((o) => o.product_id))
      setBumps(list.map((o) => ({ offer: o, product: (prods || []).find((p) => p.id === o.product_id) })).filter((b) => b.product && !(b.product.owner_type === 'founder' && b.product.stock_available <= 0)).slice(0, 2))
    })()
  }, [inCart])
  if (!bumps.length) return null
  return (
    <div className="stack-sm">
      {bumps.map(({ offer: o, product: p }) => {
        const save = Number(o.normal_value) - Number(o.deal_price)
        return (
          <div key={o.id} className="bump">
            {p.images?.[0] ? <img src={p.images[0]} alt="" /> : <div className="ph" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="strong small">{o.type === 'upsell' ? 'Upgrade: ' : 'Add '}{p.name} for {money(o.deal_price)}</div>
              <div className="tiny muted">{o.name}{save > 0 ? ` · save ${money(save)}` : ''}</div>
            </div>
            <button type="button" className="btn sm copper" onClick={() => add(p, 1, o)}>Add</button>
          </div>
        )
      })}
    </div>
  )
}

export function Checkout() {
  const { items, subtotal, savings, payload, clear, ref } = useCart()
  const [fdOffers, setFdOffers] = useState([])
  const productIds = [...new Set(items.map((i) => i.id))].join(',')
  useEffect(() => {
    if (!productIds) return
    supabase.from('public_offers').select('product_id,config').eq('type', 'free_delivery').in('product_id', productIds.split(',')).then(({ data }) => setFdOffers(data || []))
  }, [productIds])
  const freeDelivery = fdOffers.some((o) => subtotal >= Number(o.config?.minSpend || 0))
  const fdNext = !freeDelivery && fdOffers.length ? Math.min(...fdOffers.map((o) => Number(o.config?.minSpend || 0))) : null
  const { provinces, districts } = useLocations()
  const localFee = useLocalFee()
  const nav = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ full_name: '', phone: '', email: '', province_id: '', district_id: '', area: '', address: '', instructions: '' })
  const set = (k) => (v) => setF((c) => ({ ...c, [k]: v, ...(k === 'province_id' ? { district_id: '' } : {}) }))
  const dlist = districts.filter((d) => String(d.province_id) === String(f.province_id))
  const district = districts.find((d) => String(d.id) === String(f.district_id))
  const local = district?.is_local_zone
  const fee = local ? (freeDelivery ? 0 : localFee) : 0
  const deposit = items.find((i) => i.offer_type === 'payment_plan')

  if (!items.length) return <div className="card empty"><h3>Your cart is empty</h3><Link to="/">Browse products</Link></div>

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc('place_order', {
      payload: {
        customer: { ...f, province_id: f.province_id || null, district_id: f.district_id || null },
        items: payload(),
        referral_code: ref || null,
        source: ref ? `reseller:${ref}` : 'organic',
        channel: 'marketplace',
      },
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    clear()
    nav(`/order/${data.order_number}?local=${data.is_local ? 1 : 0}&total=${data.total}`)
  }

  return (
    <form onSubmit={submit} className="stack" style={{ maxWidth: 640 }}>
      <h1>Checkout</h1>
      <div className="card form-grid">
        <Field label="Full name" span><Input value={f.full_name} onChange={set('full_name')} required autoComplete="name" /></Field>
        <Field label="Phone number" hint="We'll call or WhatsApp this number to confirm"><Input value={f.phone} onChange={set('phone')} type="tel" required autoComplete="tel" /></Field>
        <Field label="Email (optional)"><Input value={f.email} onChange={set('email')} type="email" autoComplete="email" /></Field>
        <Field label="Province"><Select value={f.province_id} onChange={set('province_id')} options={provinces.map((p) => [p.id, p.name])} placeholder="Choose province" required /></Field>
        <Field label="District"><Select value={f.district_id} onChange={set('district_id')} options={dlist.map((d) => [d.id, d.name])} placeholder={f.province_id ? 'Choose district' : 'Choose province first'} required /></Field>
        <Field label="Area / township"><Input value={f.area} onChange={set('area')} placeholder="e.g. Kabulonga" /></Field>
        <Field label="Delivery address" span><Input value={f.address} onChange={set('address')} placeholder="Street, plot or house number, landmark" required /></Field>
        <Field label="Delivery instructions (optional)" span><Textarea value={f.instructions} onChange={set('instructions')} rows={2} /></Field>
      </div>

      <Bumps />

      <div className="card">
        {items.map((i) => (
          <div key={i.key} className="between small">
            <span>{i.qty} × {i.name}{i.offer_name ? <span className="muted"> · {i.offer_name}</span> : ''}</span>
            <span className="money">{money(i.qty * i.price)}</span>
          </div>
        ))}
        {savings > 0 && <div className="between small mt"><span>Offer savings</span><span className="save money">−{money(savings)}</span></div>}
        <div className="between small mt">
          <span>Delivery</span>
          <span>{!f.district_id ? '—' : local ? (freeDelivery ? <span className="save">Free</span> : money(localFee)) : 'Confirmed by phone'}</span>
        </div>
        {fdNext != null && (!f.district_id || local) && <div className="tiny save">Add {money(fdNext - subtotal)} more for free delivery in Lusaka</div>}
        <div className="between strong mt"><span>Total</span><span className="money">{money(subtotal + fee)}{f.district_id && !local ? ' + delivery' : ''}</span></div>
        {deposit && <div className="tiny muted mt">Deposit plan: you'll pay a deposit when we confirm, the rest on delivery.</div>}
      </div>
      {f.district_id && !local && (
        <div className="card flat small">You're outside our standard Lusaka delivery area. Place the order anyway — we'll call to confirm whether we can deliver and what it will cost before you pay anything.</div>
      )}
      <p className="small muted">No payment is taken now. We'll contact you to confirm the order and arrange payment and delivery. Offer prices are confirmed when you place the order.</p>
      <button className="btn primary block" disabled={busy}>{busy ? 'Placing order…' : 'Place order'}</button>
    </form>
  )
}

export function OrderConfirmed() {
  const { number } = useParams()
  const [sp] = useSearchParams()
  const local = sp.get('local') === '1'
  const total = sp.get('total')
  return (
    <div className="card stack" style={{ maxWidth: 560, margin: '24px auto', textAlign: 'center', padding: 28 }}>
      <div style={{ fontSize: 40 }}>✓</div>
      <h1>Order #{number} received</h1>
      {total && <div className="strong">Order total {money(total)}{local ? '' : ' + delivery'}</div>}
      <p>We'll contact you shortly to confirm your order and payment. {local ? "Once everything is confirmed, we'll arrange delivery to you." : "Since you're outside Lusaka District, we'll also confirm the delivery cost with you first."}</p>
      <p className="small muted">Keep your phone nearby — we usually call within a few hours.</p>
      <Link className="btn primary" to="/">Back to the store</Link>
    </div>
  )
}

export function ReviewPage() {
  const toast = useToast()
  const nav = useNavigate()
  const [f, setF] = useState({ order: '', phone: '', product: 5, vendor: 5, delivery: 5, marketplace: 5, comment: '' })
  const set = (k) => (v) => setF((c) => ({ ...c, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.rpc('submit_review', {
      p_order_number: Number(f.order), p_phone: f.phone, p_comment: f.comment,
      p_ratings: { product: Number(f.product), vendor: Number(f.vendor), delivery: Number(f.delivery), marketplace: Number(f.marketplace) },
    })
    if (error) return toast(error.message, true)
    toast('Thank you for your review')
    nav('/')
  }
  const stars = [5, 4, 3, 2, 1].map((s) => [s, `${s} star${s > 1 ? 's' : ''}`])
  return (
    <form onSubmit={submit} className="stack" style={{ maxWidth: 520 }}>
      <h1>Rate your order</h1>
      <div className="card form-grid">
        <Field label="Order number"><Input value={f.order} onChange={set('order')} type="number" required /></Field>
        <Field label="Phone used on the order"><Input value={f.phone} onChange={set('phone')} type="tel" required /></Field>
        <Field label="Product"><Select value={f.product} onChange={set('product')} options={stars} /></Field>
        <Field label="Seller"><Select value={f.vendor} onChange={set('vendor')} options={stars} /></Field>
        <Field label="Delivery"><Select value={f.delivery} onChange={set('delivery')} options={stars} /></Field>
        <Field label="Overall experience"><Select value={f.marketplace} onChange={set('marketplace')} options={stars} /></Field>
        <Field label="Comment (optional)" span><Textarea value={f.comment} onChange={set('comment')} /></Field>
      </div>
      <button className="btn primary block">Send review</button>
    </form>
  )
}
