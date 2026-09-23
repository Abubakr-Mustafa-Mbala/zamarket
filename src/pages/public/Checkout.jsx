import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../lib/cart'
import { money, date } from '../../lib/format'
import { Field, Input, Select, Textarea, useToast, Loading } from '../../components/ui'
import { offerCopy, CHECKOUT_TYPES } from '../../lib/offers'
import { dateRules, checkDate, daysText, niceDate, LOCATION_TEXT } from '../../lib/madeToOrder'
import { useShopInfo } from '../../lib/departments'

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
          {it.choices && Object.entries(it.choices).map(([k, v]) => <div key={k} className="small">{k}: <span className="strong">{v}</span></div>)}
          {it.note && <div className="small">“{it.note}”</div>}
          {it.fulfilment === 'made_to_order' && <div className="tiny muted">Made to order{it.vendor_name ? ` by ${it.vendor_name}` : ''}</div>}
          {it.fulfilment === 'service' && <div className="tiny muted">Booking{it.duration_text ? `, ${it.duration_text}` : ''}{it.service_location ? `, ${LOCATION_TEXT[it.service_location].toLowerCase()}` : ''}</div>}
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
  const { items, subtotal, savings, payload, clear, attribution, madeToOrder, needsAddress, needsDelivery, setChoice, touch } = useCart()
  const [booked, setBooked] = useState({})
  const rules = madeToOrder.length ? dateRules(madeToOrder) : null
  const [neededBy, setNeededBy] = useState('')
  const slotItems = items.filter((i) => i.fulfilment === 'service' && i.time_slots?.length)
  const missingTime = slotItems.find((i) => !i.choices?.Time)
  const dateError = rules ? checkDate(neededBy, rules) || (missingTime ? `Choose a time for ${missingTime.name}` : null) : null
  useEffect(() => {
    if (!neededBy || !slotItems.length) return
    Promise.all(slotItems.map((i) => supabase.rpc('booked_slots', { p_product: i.id, p_date: neededBy }).then(({ data }) => [i.id, data])))
      .then((rows) => setBooked(Object.fromEntries(rows)))
  }, [neededBy, slotItems.map((i) => i.id).join(',')])
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
  // If they stop before placing the order, the team can follow up.
  useEffect(() => {
    const digits = (f.phone || '').replace(/\D/g, '')
    if (!f.full_name.trim() || digits.length < 9) return
    const t = setTimeout(() => {
      supabase.rpc('capture_checkout_lead', {
        p_name: f.full_name.trim(), p_phone: f.phone,
        p_items: items.map((i) => `${i.qty} × ${i.name}`).join(', ').slice(0, 180),
        p_campaign_code: touch?.type === 'campaign' ? touch.code : null,
        p_store: touch?.type === 'store' ? touch.code : touch?.store || null,
      })
    }, 1500)
    return () => clearTimeout(t)
  }, [f.full_name, f.phone])
  const set = (k) => (v) => setF((c) => ({ ...c, [k]: v, ...(k === 'province_id' ? { district_id: '' } : {}) }))
  const dlist = districts.filter((d) => String(d.province_id) === String(f.province_id))
  const district = districts.find((d) => String(d.id) === String(f.district_id))
  const local = district?.is_local_zone
  const shop = useShopInfo()
  const fee = needsDelivery && local && !shop.deliveryIncluded ? (freeDelivery ? 0 : localFee) : 0
  const deposit = items.find((i) => i.offer_type === 'payment_plan')

  if (!items.length) return <div className="card empty"><h3>Your cart is empty</h3><Link to="/">Browse products</Link></div>

  const submit = async (e) => {
    e.preventDefault()
    if (dateError) return toast(dateError, true)
    setBusy(true)
    const { data, error } = await supabase.rpc('place_order', {
      payload: {
        needed_by: rules ? neededBy : null,
        customer: { ...f, province_id: f.province_id || null, district_id: f.district_id || null },
        items: payload(),
        ...attribution(),
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
        <Field label={needsDelivery ? 'Delivery address' : 'Address for the service'} span><Input value={f.address} onChange={set('address')} placeholder="Street, plot or house number, landmark" required={needsAddress} /></Field>
        <Field label="Delivery instructions (optional)" span><Textarea value={f.instructions} onChange={set('instructions')} rows={2} /></Field>
      </div>

      {rules && (
        <div className="card stack-sm">
          <h3>{madeToOrder.every((l) => l.fulfilment === 'service') ? 'When would you like to book?' : 'When do you need it?'}</h3>
          <p className="small muted">{madeToOrder.map((l) => l.name).join(', ')} {madeToOrder.length > 1 ? 'need' : 'needs'} a date. {rules.lead > 0 ? `Order at least ${rules.lead} day${rules.lead > 1 ? 's' : ''} ahead. ` : ''}Available {daysText(rules.allowed)}.</p>
          {rules.allowed.length === 0 ? (
            <p className="small bad">These items are made on different days, so they can't be delivered together. Please order them separately.</p>
          ) : (
            <>
              <input className="input" type="date" required min={rules.min} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
              {neededBy && checkDate(neededBy, rules) && <div className="small bad">{checkDate(neededBy, rules)}</div>}
              {!neededBy && rules.first && <button type="button" className="btn sm" onClick={() => setNeededBy(rules.first)}>Earliest: {niceDate(rules.first)}</button>}
              {neededBy && !checkDate(neededBy, rules) && slotItems.map((i) => {
                const b = booked[i.id]
                return (
                  <div key={i.key} className="field">
                    <label>Time for {i.name}</label>
                    <div className="chips wrap">
                      {i.time_slots.map((t) => {
                        const full = b && (Number(b.slots?.[t] || 0) >= Number(b.capacity || 1))
                        return <button key={t} type="button" disabled={full} className={`chip ${i.choices?.Time === t ? 'on' : ''}`} onClick={() => setChoice(i.key, 'Time', t)} title={full ? 'Already booked' : ''}>{t}{full ? ' · booked' : ''}</button>
                      })}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

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
          <span>{!needsDelivery ? 'Not needed' : shop.deliveryIncluded ? <span className="save">Free</span> : !f.district_id ? '—' : local ? (freeDelivery ? <span className="save">Free</span> : money(localFee)) : 'Confirmed by phone'}</span>
        </div>
        {fdNext != null && (!f.district_id || local) && <div className="tiny save">Add {money(fdNext - subtotal)} more for free delivery in Lusaka</div>}
        <div className="between strong mt"><span>Total</span><span className="money">{money(subtotal + fee)}{f.district_id && !local ? ' + delivery' : ''}</span></div>
        {deposit && <div className="tiny muted mt">Deposit plan: you'll pay a deposit when we confirm, the rest on delivery.</div>}
      </div>
      {needsDelivery && !shop.deliveryIncluded && f.district_id && !local && (
        <div className="card flat small">You're outside our standard Lusaka delivery area. Place the order anyway — we'll call to confirm whether we can deliver and what it will cost before you pay anything.</div>
      )}
      <p className="small muted">No payment is taken now. We'll contact you to confirm the order and arrange payment and delivery. Offer prices are confirmed when you place the order.</p>
      <button className="btn primary block" disabled={busy || (rules && rules.allowed.length === 0)}>{busy ? 'Placing order…' : 'Place order'}</button>
    </form>
  )
}

export function OrderConfirmed() {
  const { number } = useParams()
  const [sp] = useSearchParams()
  const local = sp.get('local') === '1'
  const total = sp.get('total')
  const code = sp.get('v')

  // Scanned from a receipt: show what was bought, not "we'll call you shortly".
  if (code) return <OrderVerify number={number} code={code} />

  return (
    <div className="card stack" style={{ maxWidth: 560, margin: '24px auto', textAlign: 'center', padding: 28 }}>
      <div style={{ fontSize: 40 }}>✓</div>
      <h1>Order #{number} received</h1>
      {total && <div className="strong">Order total {money(total)}{local ? '' : ' + delivery'}</div>}
      <p>We'll contact you shortly to confirm your order and payment. {local ? "Once everything is confirmed, we'll arrange delivery to you." : "Since you're outside Lusaka District, we'll also confirm the delivery cost with you first."}</p>
      <p className="small muted">Keep your phone nearby — we usually call within a few hours.</p>
      <Link className="btn primary" to="/">Back to the store</Link>
      <InviteCard orderNumber={number} />
    </div>
  )
}

const STATUS_WORDS = {
  pending: 'Waiting for us to confirm it with you',
  confirmed: 'Confirmed with you',
  payment_pending: 'Waiting for payment',
  paid: 'Paid',
  processing: 'Being prepared',
  ready_for_dispatch: 'Ready to go out',
  out_for_delivery: 'On the way to you',
  delivered: 'Delivered',
  completed: 'Finished',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

function OrderVerify({ number, code }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    supabase.rpc('order_verify', { p_number: Number(number), p_code: code }).then(({ data: d }) => setData(d || { found: false }))
  }, [number, code])

  if (!data) return <Loading />
  if (!data.found) return (
    <div className="card stack" style={{ maxWidth: 520, margin: '24px auto', textAlign: 'center', padding: 28 }}>
      <h1>We can't find that order</h1>
      <p className="muted">The code on this receipt doesn't match an order. Check the link, or call us and read out the order number.</p>
      <Link className="btn primary" to="/">Go to ZaMarket</Link>
    </div>
  )

  return (
    <div className="card stack" style={{ maxWidth: 520, margin: '24px auto', padding: 26 }}>
      <div className="between">
        <div>
          <h1 style={{ fontSize: '1.4rem' }}>Order ZM-{String(data.order_number).padStart(6, '0')}</h1>
          <p className="small muted">Placed {date(data.placed_on)} · sold by {data.seller}</p>
        </div>
        <span className="verified-badge">✓ Genuine ZaMarket order</span>
      </div>

      <div className="mini-table">
        {(data.items || []).map((i, k) => (
          <div key={k} className="mini-row"><span className="grow">{i.qty} × {i.name}</span><span className="strong">{money(i.line)}</span></div>
        ))}
      </div>
      <div className="between"><span className="muted">Delivery</span><span>{Number(data.delivery_fee) > 0 ? money(data.delivery_fee) : 'Included'}</span></div>
      <div className="between strong" style={{ fontSize: '1.15rem' }}><span>Total</span><span>{money(data.total)}</span></div>

      <div className="card flat stack-sm">
        <div className="between"><span className="muted small">Where it is</span><strong>{STATUS_WORDS[data.status] || data.status}</strong></div>
        <div className="between"><span className="muted small">Payment</span><strong>{data.payment_status === 'paid' ? 'Paid in full' : data.payment_status === 'part_paid' ? 'Part paid' : 'Not yet paid'}</strong></div>
      </div>

      <p className="tiny muted">This page shows only what was bought and what it cost. Nothing about you is shown here. If something is wrong, call us with this order number.</p>
      <Link className="btn primary" to="/">Shop on ZaMarket</Link>
    </div>
  )
}

function InviteCard({ orderNumber }) {
  const toast = useToast()
  const [phone, setPhone] = useState('')
  const [invite, setInvite] = useState(null)
  const [busy, setBusy] = useState(false)
  const get = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc('get_invite', { p_phone: phone, p_order_number: Number(orderNumber) })
    setBusy(false)
    if (error) return toast(error.message, true)
    setInvite(data)
  }
  const link = invite ? `${window.location.host}/invite/${invite.code}` : ''
  const message = invite ? `I just ordered from ZaMarket in Lusaka. Have a look: https://${link}` : ''
  const copy = async () => { try { await navigator.clipboard.writeText(`https://${link}`); toast('Link copied') } catch { toast('Could not copy', true) } }
  return (
    <div className="invite-card">
      <h2>Invite a friend</h2>
      {!invite ? (
        <>
          <p>When a friend places their first order through your link and it's delivered, you get a reward.</p>
          <form onSubmit={get} className="invite-form">
            <input className="input" type="tel" required placeholder="Phone number you ordered with" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button className="btn buy" disabled={busy}>{busy ? 'Getting link…' : 'Get my link'}</button>
          </form>
        </>
      ) : (
        <>
          <p>Your link. Earn {money(invite.reward)} for every friend's first completed order.</p>
          <div className="invite-link">{link}</div>
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            <a className="btn buy" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
            <button type="button" className="btn" onClick={copy}>Copy link</button>
          </div>
        </>
      )}
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
