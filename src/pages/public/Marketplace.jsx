import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../lib/cart'
import { useAuth } from '../../lib/auth'
import { money } from '../../lib/format'
import { Stars, Modal, Field, Input, useToast, Loading } from '../../components/ui'
import { offerCopy, useCountdown, DEAL_TYPES, CONDITION_TYPES } from '../../lib/offers'

export function PublicShell() {
  const { count, subtotal } = useCart()
  const { user, role } = useAuth()
  const { pathname } = useLocation()
  const showBar = count > 0 && !['/cart', '/checkout'].includes(pathname)
  const home = role === 'reseller' ? '/sell' : role === 'vendor' ? '/vendor' : ['founder', 'ops', 'finance', 'delivery'].includes(role) ? '/admin' : null
  return (
    <div className="public" style={showBar ? { paddingBottom: 96 } : undefined}>
      <header className="public-top">
        <Link to="/" className="brand">Za<span>Market</span></Link>
        <div className="row">
          {user ? (home ? <Link className="btn sm" to={home}>My dashboard</Link> : <Link className="btn sm" to="/apply/reseller">Become a reseller</Link>)
                : <Link className="btn sm ghost" to="/login">Sign in</Link>}
          <Link className="btn sm primary" to="/cart">Cart{count ? ` (${count})` : ''}</Link>
        </div>
      </header>
      <Outlet />
      {showBar && (
        <div className="cart-bar">
          <span>{count} item{count > 1 ? 's' : ''} · {money(subtotal)}</span>
          <Link to="/cart">Checkout</Link>
        </div>
      )}
    </div>
  )
}

// /r/:code — reseller link. Remember the code, go to the store.
export function ReferralCapture() {
  const { code } = useParams()
  const { setRef } = useCart()
  const nav = useNavigate()
  useEffect(() => { if (code) setRef(code.toLowerCase()); nav('/', { replace: true }) }, [code])
  return null
}

export function Storefront() {
  const [products, setProducts] = useState(null)
  const [offerMap, setOfferMap] = useState({})
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('')
  const { ref } = useCart()
  useEffect(() => {
    supabase.from('public_products').select('*').order('name').then(({ data }) => setProducts(data || []))
    supabase.from('public_offers').select('id,product_id,type,name,deal_price,normal_value,units').then(({ data }) => {
      const m = {}
      for (const o of data || []) if (DEAL_TYPES.includes(o.type) || o.type === 'free_delivery') (m[o.product_id] = m[o.product_id] || []).push(o)
      setOfferMap(m)
    })
  }, [])
  const cats = useMemo(() => [...new Set((products || []).map((p) => p.category).filter(Boolean))], [products])
  const list = (products || []).filter((p) => (!cat || p.category === cat) && (!search || p.name.toLowerCase().includes(search.toLowerCase())))
  return (
    <>
      <div className="hero-strip">
        <div>
          <h1>Good products, delivered in Lusaka.</h1>
          <p>Order online, we confirm by phone, then deliver to your door. Outside Lusaka? We'll arrange it.</p>
        </div>
        <input className="input search" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {ref && <p className="small muted mb">Shopping via a reseller link — your reseller gets credit for this order.</p>}
      {cats.length > 1 && (
        <div className="chips mb">
          <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>All</button>
          {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      )}
      {products === null ? <Loading /> : list.length === 0 ? (
        <div className="card empty"><h3>No products yet</h3>Check back soon.</div>
      ) : (
        <div className="product-grid">
          {list.map((p) => <ProductCard key={p.id} p={p} offers={offerMap[p.id] || []} />)}
        </div>
      )}
    </>
  )
}

function ProductCard({ p, offers }) {
  const deal = offers.find((o) => DEAL_TYPES.includes(o.type))
  const save = p.normal_price && Number(p.normal_price) > Number(p.price) ? Number(p.normal_price) - Number(p.price) : 0
  return (
    <Link to={`/p/${p.id}`} className="pcard">
      <div className="pimg">{p.images?.[0] ? <img src={p.images[0]} alt={p.name} loading="lazy" /> : 'No photo'}</div>
      <div className="pbody">
        <div className="strong truncate">{p.name}</div>
        <div className="price">{money(p.price)}{save > 0 && <span className="was">{money(p.normal_price)}</span>}</div>
        {deal ? <div className="offer-tag">{deal.name}</div> : offers[0] ? <div className="offer-tag">{offers[0].name}</div> : save > 0 && <div className="save">Save {money(save)}</div>}
        {p.stock_available <= 0 && p.owner_type === 'founder' && <span className="badge warn">Out of stock</span>}
        {p.rating && <div className="small"><Stars n={p.rating} /> <span className="muted">({p.review_count})</span></div>}
      </div>
    </Link>
  )
}

export function ProductPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { add } = useCart()
  const toast = useToast()
  const [p, setP] = useState(null)
  const [offers, setOffers] = useState([])
  const [reviews, setReviews] = useState([])
  const [img, setImg] = useState(0)
  const [notify, setNotify] = useState(false)

  useEffect(() => {
    supabase.from('public_products').select('*').eq('id', id).maybeSingle().then(({ data }) => setP(data))
    supabase.from('public_offers').select('*').eq('product_id', id).then(({ data }) => setOffers((data || []).filter((o) => DEAL_TYPES.includes(o.type) || CONDITION_TYPES.includes(o.type))))
    supabase.from('reviews').select('*').eq('product_id', id).eq('approved', true).order('created_at', { ascending: false }).limit(10).then(({ data }) => setReviews(data || []))
  }, [id])

  if (p === null) return <Loading />
  if (!p) return <div className="card empty"><h3>Product not found</h3><Link to="/">Back to the store</Link></div>
  const out = p.stock_available <= 0 && p.owner_type === 'founder'
  const condition = offers.find((o) => o.type === 'payment_plan') || null
  const save = p.normal_price && Number(p.normal_price) > Number(p.price) ? Number(p.normal_price) - Number(p.price) : 0

  return (
    <div className="product-page">
      <div className="stack">
        <div className="gallery">{p.images?.[img] ? <img src={p.images[img]} alt={p.name} /> : <div className="pimg" style={{ height: '100%' }}>No photo</div>}</div>
        {p.images?.length > 1 && (
          <div className="row">
            {p.images.map((src, i) => <img key={i} src={src} alt="" onClick={() => setImg(i)} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', outline: i === img ? '2px solid var(--green)' : 'none' }} />)}
          </div>
        )}
      </div>
      <div className="stack">
        <div>
          {p.vendor_name && <div className="small muted">Sold by {p.vendor_name}</div>}
          <h1>{p.name}</h1>
          {p.rating && <div><Stars n={p.rating} /> <span className="small muted">{p.rating} · {p.review_count} review{p.review_count === 1 ? '' : 's'}</span></div>}
        </div>
        <div>
          <div className="price" style={{ fontSize: '1.6rem' }}>{money(p.price)}{save > 0 && <span className="was">{money(p.normal_price)}</span>}</div>
          {save > 0 && <div className="save">You save {money(save)}</div>}
          <div className="small muted">{out ? 'Out of stock right now' : 'In stock · Delivery in Lusaka from K30 · Other areas confirmed by phone'}</div>
        </div>
        {!out && offers.filter((o) => DEAL_TYPES.includes(o.type)).map((o) => (
          <OfferCard key={o.id} offer={o} product={p} onTake={() => { add(p, 1, o); nav('/cart') }} />
        ))}
        {offers.filter((o) => CONDITION_TYPES.includes(o.type)).map((o) => (
          <div key={o.id} className="offer-note small">
            <span className="strong">{offerCopy(o, p.name).get}</span>{o.terms ? <span className="muted"> · {o.terms}</span> : ''}
          </div>
        ))}
        <div className="btn-row">
          {out ? (
            <button className="btn primary" onClick={() => setNotify(true)}>Notify me when it's back</button>
          ) : (
            <>
              <button className={`btn ${offers.some((o) => DEAL_TYPES.includes(o.type)) ? '' : 'primary'}`} onClick={() => { add(p, 1, condition); toast('Added to cart') }}>Add to cart</button>
              {!offers.some((o) => DEAL_TYPES.includes(o.type)) && <button className="btn copper" onClick={() => { add(p, 1, condition); nav('/cart') }}>Buy now</button>}
            </>
          )}
        </div>
        {p.description && <div className="card"><h3 className="mb">About this product</h3><p style={{ whiteSpace: 'pre-wrap' }}>{p.description}</p></div>}
        {p.benefits?.length > 0 && (
          <div className="card"><h3 className="mb">Why people buy it</h3><ul style={{ margin: 0, paddingLeft: 18 }}>{p.benefits.map((b, i) => <li key={i}>{b}</li>)}</ul></div>
        )}
        {p.faqs?.length > 0 && (
          <div className="card stack-sm"><h3>Questions</h3>{p.faqs.map((f, i) => <div key={i}><div className="strong">{f.q}</div><div className="small muted">{f.a}</div></div>)}</div>
        )}
        {reviews.length > 0 && (
          <div className="card stack-sm">
            <h3>Reviews</h3>
            {reviews.map((r) => (
              <div key={r.id}>
                <div className="row"><Stars n={r.product_rating} /><span className="strong small">{r.customer_name}</span>{r.verified && <span className="badge ok">Verified purchase</span>}</div>
                {r.comment && <div className="small">{r.comment}</div>}
              </div>
            ))}
          </div>
        )}
        <p className="small muted">Want to earn by selling this product? <Link to="/apply/reseller">Become a reseller</Link>.</p>
      </div>
      {notify && <NotifyModal product={p} onClose={() => setNotify(false)} />}
    </div>
  )
}

function OfferCard({ offer: o, product, onTake }) {
  const copy = offerCopy(o, product.name)
  const ends = useCountdown(o.end_at)
  const save = Number(o.normal_value) - Number(o.deal_price)
  const perUnit = o.units > 1 ? Number(o.deal_price) / o.units : null
  return (
    <div className="offer-card">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="offer-name">{o.name}</div>
        {ends && <span className="offer-ends">{ends}</span>}
      </div>
      <div className="small">{copy.get}</div>
      {copy.bonus && <div className="offer-bonus">+ {copy.bonus}</div>}
      <div className="offer-price">
        <span className="price" style={{ fontSize: '1.5rem' }}>{money(o.deal_price)}</span>
        {save > 0 && <span className="was">{money(o.normal_value)}</span>}
      </div>
      <div className="row small">
        {save > 0 && <span className="save">You save {money(save)}</span>}
        {perUnit && <span className="muted">{money(perUnit)} each</span>}
      </div>
      {o.remaining != null && <div className="tiny warn strong">Only {o.remaining} left at this price</div>}
      {o.terms && <div className="tiny muted">{o.terms}</div>}
      <button className="btn copper block" onClick={onTake}>Take this offer</button>
    </div>
  )
}

function NotifyModal({ product, onClose }) {
  const toast = useToast()
  const [f, setF] = useState({ customer_name: '', phone: '', quantity: 1, location: '' })
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('stock_requests').insert({ ...f, product_id: product.id, quantity: Number(f.quantity) || 1 })
    if (error) return toast(error.message, true)
    toast("We'll let you know when it's back")
    onClose()
  }
  return (
    <Modal title="Tell me when it's back" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Field label="Your name"><Input value={f.customer_name} onChange={(v) => setF({ ...f, customer_name: v })} required /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(v) => setF({ ...f, phone: v })} type="tel" required /></Field>
        <div className="grid-2">
          <Field label="How many"><Input value={f.quantity} onChange={(v) => setF({ ...f, quantity: v })} type="number" min="1" /></Field>
          <Field label="Area"><Input value={f.location} onChange={(v) => setF({ ...f, location: v })} /></Field>
        </div>
        <button className="btn primary block">Send request</button>
      </form>
    </Modal>
  )
}
