import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../lib/cart'
import { useAuth } from '../../lib/auth'
import { money } from '../../lib/format'
import { Stars, Modal, Field, Input, useToast, Loading } from '../../components/ui'
import { offerCopy, useCountdown, DEAL_TYPES, CONDITION_TYPES } from '../../lib/offers'
import { howText } from '../../lib/madeToOrder'
import { DEPARTMENTS, iconFor } from '../../lib/categories'

// ---------- shared catalogue loader (small catalogue: one fetch, cached for the session) ----------
let cache = null
function useCatalogue() {
  const [data, setData] = useState(cache)
  useEffect(() => {
    if (cache) return
    Promise.all([
      supabase.from('public_products').select('*').order('created_at', { ascending: false }),
      supabase.from('public_offers').select('id,product_id,type,name,deal_price,normal_value,units,end_at,remaining'),
      supabase.from('public_vendors').select('*').order('business_name'),
    ]).then(([p, o, v]) => {
      const offersBy = {}
      for (const x of o.data || []) (offersBy[x.product_id] = offersBy[x.product_id] || []).push(x)
      cache = { products: p.data || [], offersBy, vendors: v.data || [] }
      setData(cache)
    })
  }, [])
  return data
}

const isOut = (p) => p.fulfilment === 'in_stock' && (p.status === 'out_of_stock' || (p.owner_type === 'founder' && p.stock_available <= 0))
const dealFor = (offersBy, id) => (offersBy[id] || []).find((o) => DEAL_TYPES.includes(o.type))

function Price({ value, size }) {
  const v = Number(value || 0)
  const [whole, dec] = v.toFixed(2).split('.')
  return (
    <span className={`price-tag ${size || ''}`} aria-label={money(v)}>
      <span className="pt-cur">K</span><span className="pt-whole">{Number(whole).toLocaleString('en-ZM')}</span><span className="pt-dec">{dec}</span>
    </span>
  )
}

// ---------- shell ----------
export function PublicShell() {
  const { count, subtotal } = useCart()
  const { user, role, profile } = useAuth()
  const { pathname } = useLocation()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') || '')
  const [cat, setCat] = useState(sp.get('cat') || '')
  useEffect(() => { setQ(sp.get('q') || ''); setCat(sp.get('cat') || '') }, [sp])
  const showBar = count > 0 && !['/cart', '/checkout'].includes(pathname)
  const home = role === 'reseller' ? '/sell' : role === 'vendor' ? '/vendor' : ['founder', 'ops', 'finance', 'delivery'].includes(role) ? '/admin' : '/account'
  const go = (e) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (cat) params.set('cat', cat)
    nav(`/search?${params}`)
  }

  return (
    <div className="shop" style={showBar ? { paddingBottom: 88 } : undefined}>
      <header className="shop-header">
        <div className="shop-bar">
          <Link to="/" className="wordmark" aria-label="ZaMarket home">ZaMarket</Link>
          <div className="deliver-to hide-mobile">
            <span className="dt-small">Delivering in</span>
            <span className="dt-big">Lusaka &amp; beyond</span>
          </div>
          <form className="shop-search" onSubmit={go} role="search">
            <select aria-label="Department" value={cat} onChange={(e) => setCat(e.target.value)} className="hide-mobile">
              <option value="">All</option>
              {DEPARTMENTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
            <input aria-label="Search ZaMarket" placeholder="Search products, cakes, services…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" aria-label="Search">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </button>
          </form>
          <Link to={user ? home : '/login'} className="header-link">
            <span className="dt-small">{user ? `Hello, ${(profile?.full_name || 'there').split(' ')[0]}` : 'Hello, sign in'}</span>
            <span className="dt-big">{user && home !== '/account' ? 'Dashboard' : 'Account'}</span>
          </Link>
          <Link to="/cart" className="header-cart" aria-label={`Cart, ${count} items`}>
            <svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h4l3.2 15.2a2 2 0 0 0 2 1.6h10.6a2 2 0 0 0 2-1.5L27 11H8.3" /><circle cx="13" cy="27" r="1.8" /><circle cx="23" cy="27" r="1.8" /></svg>
            <span className="cart-count">{count}</span>
            <span className="dt-big hide-mobile">Cart</span>
          </Link>
        </div>
        <nav className="dept-strip" aria-label="Departments">
          <Link to="/search?deals=1">Today's deals</Link>
          {DEPARTMENTS.map((d) => <Link key={d.name} to={`/search?cat=${encodeURIComponent(d.name)}`}>{d.name}</Link>)}
          <Link to="/sellers">Sellers</Link>
        </nav>
      </header>

      <main className="shop-main"><Outlet /></main>

      <footer className="shop-footer">
        <div className="sf-cols">
          <div>
            <div className="wordmark on-mint">ZaMarket</div>
            <p>Lusaka's marketplace for products, made-to-order goods and local services. Order online, we confirm by phone, you pay and receive.</p>
          </div>
          <div>
            <h4>Shop</h4>
            <Link to="/search">All products</Link>
            <Link to="/search?deals=1">Today's deals</Link>
            <Link to="/sellers">Sellers</Link>
            <Link to="/review">Rate an order</Link>
          </div>
          <div>
            <h4>Earn with us</h4>
            <Link to="/apply/vendor">Sell on ZaMarket</Link>
            <Link to="/apply/reseller">Become a reseller</Link>
          </div>
          <div>
            <h4>Your account</h4>
            <Link to={user ? home : '/login'}>{user ? 'Your account' : 'Sign in'}</Link>
            <Link to="/cart">Cart</Link>
          </div>
        </div>
        <div className="sf-base">© {new Date().getFullYear()} ZaMarket, Lusaka</div>
      </footer>

      {showBar && (
        <div className="cart-bar">
          <span>{count} item{count > 1 ? 's' : ''} · {money(subtotal)}</span>
          <Link to="/cart">View cart</Link>
        </div>
      )}
    </div>
  )
}

// /r/:code — reseller link. Remember the code, go to the store.
export function ReferralCapture() {
  const { code, product } = useParams()
  const { setRef } = useCart()
  const nav = useNavigate()
  useEffect(() => { if (code) setRef(code.toLowerCase()); nav(product ? `/p/${product}` : '/', { replace: true }) }, [code, product])
  return null
}

// /go/:code — campaign link. Count the visit, remember the campaign, go to its page.
export function GoLink() {
  const { code } = useParams()
  const { setCampaign } = useCart()
  const nav = useNavigate()
  useEffect(() => {
    supabase.rpc('go_link', { p_code: code }).then(({ data }) => {
      const path = data?.path || '/'
      if (data?.found) setCampaign(data.code, path.split('/')[1] || null)
      nav(path, { replace: true })
    })
  }, [code])
  return <Loading />
}

// Credit a store only when the customer ARRIVED on its link (not when browsing in from the marketplace).
const isEntryPage = () => (window.history.state?.idx ?? 0) === 0

// ---------- product card ----------
function ProductCard({ p, deal, inStore }) {
  const out = isOut(p)
  const save = p.normal_price && Number(p.normal_price) > Number(p.price) ? Number(p.normal_price) - Number(p.price) : 0
  return (
    <Link to={inStore && p.vendor_slug ? `/${p.vendor_slug}/${p.slug}` : `/p/${p.slug || p.id}`} className="pc">
      <div className="pc-img">
        {p.images?.[0] ? <img src={p.images[0]} alt="" loading="lazy" /> : <span className="pc-ph" aria-hidden>{iconFor(p.category)}</span>}
        {deal && <span className="pc-deal">{deal.name}</span>}
      </div>
      <div className="pc-body">
        <div className="pc-name">{p.name}</div>
        {p.rating ? <div className="pc-rating"><Stars n={p.rating} /><span>{p.review_count}</span></div> : null}
        <div className="pc-price"><Price value={p.price} />{save > 0 && <s>{money(p.normal_price)}</s>}</div>
        <div className={`pc-avail ${out ? 'out' : ''}`}>
          {out ? 'Out of stock' : p.fulfilment === 'service' ? `Booking${p.duration_text ? `, ${p.duration_text.toLowerCase()}` : ''}` : p.fulfilment === 'made_to_order' ? `Made to order${p.lead_time_days ? `, ${p.lead_time_days} day${p.lead_time_days > 1 ? 's' : ''} ahead` : ''}` : 'In stock'}
        </div>
        {p.vendor_name && <div className="pc-seller">by {p.vendor_name}</div>}
      </div>
    </Link>
  )
}

function Row({ title, link, children }) {
  return (
    <section className="shelf">
      <div className="shelf-head"><h2>{title}</h2>{link && <Link to={link}>See all</Link>}</div>
      <div className="shelf-scroll">{children}</div>
    </section>
  )
}

// ---------- home ----------
export function Storefront() {
  const data = useCatalogue()
  const { ref } = useCart()
  const counts = useMemo(() => {
    const m = {}
    for (const p of data?.products || []) m[p.category] = (m[p.category] || 0) + 1
    return m
  }, [data])
  if (!data) return <Loading />
  const { products, offersBy, vendors } = data
  const deals = products.filter((p) => dealFor(offersBy, p.id) || (p.normal_price && Number(p.normal_price) > Number(p.price)))
  const scheduled = products.filter((p) => p.fulfilment !== 'in_stock')
  const rated = products.filter((p) => p.rating).sort((a, b) => b.rating - a.rating || b.review_count - a.review_count)
  const card = (p) => <ProductCard key={p.id} p={p} deal={dealFor(offersBy, p.id)} />

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <h1>Lusaka's marketplace, delivered to your door.</h1>
          <p>Phones, home goods, cakes baked to order and services from local sellers — all in one place, with nothing to pay until we've confirmed your order.</p>
          <div className="hero-actions">
            <Link to="/search" className="btn primary">Start shopping</Link>
            <Link to="/apply/vendor" className="btn ghost-dark">Sell on ZaMarket</Link>
          </div>
          {ref && <p className="tiny hero-ref">You're shopping through a reseller's link. They'll get credit for your order.</p>}
        </div>
        <ol className="how" aria-label="How ordering works">
          <li><span className="how-n">1</span><div><strong>Order online</strong><span>Add to cart and check out in a minute.</span></div></li>
          <li><span className="how-n">2</span><div><strong>We call to confirm</strong><span>Delivery cost and payment are agreed with you first.</span></div></li>
          <li><span className="how-n">3</span><div><strong>Pay and receive</strong><span>Delivered in Lusaka District; other areas arranged.</span></div></li>
        </ol>
      </section>

      <section className="depts" aria-label="Shop by department">
        {DEPARTMENTS.map((d) => (
          <Link key={d.name} to={`/search?cat=${encodeURIComponent(d.name)}`} className="dept">
            <span className="dept-icon">{d.icon}</span>
            <span className="dept-name">{d.name}</span>
            <span className="dept-count">{counts[d.name] ? `${counts[d.name]} item${counts[d.name] > 1 ? 's' : ''}` : 'Coming soon'}</span>
          </Link>
        ))}
      </section>

      {products.length === 0 && (
        <div className="empty-shop">
          <h2>The shelves are being stocked</h2>
          <p>Products from ZaMarket and local sellers will appear here soon. Have something to sell?</p>
          <div className="hero-actions"><Link to="/apply/vendor" className="btn primary">Sell on ZaMarket</Link><Link to="/apply/reseller" className="btn">Become a reseller</Link></div>
        </div>
      )}
      {deals.length > 0 && <Row title="Today's deals" link="/search?deals=1">{deals.slice(0, 12).map(card)}</Row>}
      {scheduled.length > 0 && <Row title="Made to order and bookings" link="/search?type=scheduled">{scheduled.slice(0, 12).map(card)}</Row>}
      {products.length > 0 && <Row title="New on ZaMarket" link="/search?sort=new">{products.slice(0, 12).map(card)}</Row>}
      {rated.length > 0 && <Row title="Top rated" link="/search?sort=rating">{rated.slice(0, 12).map(card)}</Row>}

      {vendors.length > 0 && (
        <section className="shelf">
          <div className="shelf-head"><h2>Shop local sellers</h2><Link to="/sellers">All sellers</Link></div>
          <div className="seller-grid">{vendors.slice(0, 6).map((v) => <SellerCard key={v.id} v={v} />)}</div>
        </section>
      )}

      <section className="earn-band">
        <div>
          <h2>Grow with ZaMarket</h2>
          <p>Sell your products or services to our customers, or earn commission sharing products you believe in.</p>
        </div>
        <div className="hero-actions">
          <Link to="/apply/vendor" className="btn on-dark">Sell on ZaMarket</Link>
          <Link to="/apply/reseller" className="btn ghost-light">Become a reseller</Link>
        </div>
      </section>
    </div>
  )
}

function SellerCard({ v }) {
  return (
    <Link to={`/${v.slug}`} className="seller">
      <span className="seller-mark" aria-hidden>{v.business_name.slice(0, 1)}</span>
      <span className="seller-info">
        <span className="seller-name">{v.business_name}</span>
        <span className="seller-meta">{[v.category, v.town].filter(Boolean).join(', ')}</span>
        <span className="seller-meta">{v.rating ? <><Stars n={v.rating} /> {v.rating}</> : `${v.product_count} product${v.product_count === 1 ? '' : 's'}`}</span>
      </span>
    </Link>
  )
}

export function SellersPage() {
  const data = useCatalogue()
  if (!data) return <Loading />
  return (
    <div className="stack">
      <div className="crumbs"><Link to="/">Home</Link><span>Sellers</span></div>
      <h1>Sellers on ZaMarket</h1>
      {data.vendors.length === 0 ? <div className="empty-shop"><h2>No sellers yet</h2><p>Be one of the first.</p><Link to="/apply/vendor" className="btn primary">Sell on ZaMarket</Link></div>
        : <div className="seller-grid">{data.vendors.map((v) => <SellerCard key={v.id} v={v} />)}</div>}
    </div>
  )
}

// ---------- search & departments ----------
const SORTS = [['featured', 'Featured'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['new', 'Newest'], ['rating', 'Top rated']]

export function SearchPage() {
  const data = useCatalogue()
  const [sp, setSp] = useSearchParams()
  const [sheet, setSheet] = useState(false)
  const q = (sp.get('q') || '').trim().toLowerCase()
  const cat = sp.get('cat') || ''
  const type = sp.get('type') || ''
  const sort = sp.get('sort') || 'featured'
  const deals = sp.get('deals') === '1'
  const minR = sp.get('rating') === '4'
  const pmin = sp.get('min') || ''
  const pmax = sp.get('max') || ''
  const setParam = (k, v) => { const n = new URLSearchParams(sp); if (v === '' || v == null || v === false) n.delete(k); else n.set(k, v); setSp(n, { replace: true }) }

  const results = useMemo(() => {
    if (!data) return []
    let list = data.products.filter((p) => {
      if (q && !`${p.name} ${p.description || ''} ${p.category || ''} ${p.vendor_name || ''}`.toLowerCase().includes(q)) return false
      if (cat && p.category !== cat) return false
      if (type === 'in_stock' && p.fulfilment !== 'in_stock') return false
      if (type === 'made_to_order' && p.fulfilment !== 'made_to_order') return false
      if (type === 'service' && p.fulfilment !== 'service') return false
      if (type === 'scheduled' && p.fulfilment === 'in_stock') return false
      if (deals && !(dealFor(data.offersBy, p.id) || (p.normal_price && Number(p.normal_price) > Number(p.price)))) return false
      if (minR && !(p.rating >= 4)) return false
      if (pmin && Number(p.price) < Number(pmin)) return false
      if (pmax && Number(p.price) > Number(pmax)) return false
      return true
    })
    const by = {
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
      new: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0),
      featured: (a, b) => Number(isOut(a)) - Number(isOut(b)) || Number(!!dealFor(data.offersBy, b.id)) - Number(!!dealFor(data.offersBy, a.id)),
    }[sort]
    return [...list].sort(by)
  }, [data, q, cat, type, sort, deals, minR, pmin, pmax])

  if (!data) return <Loading />
  const heading = deals ? "Today's deals" : cat || (q ? `Results for “${sp.get('q')}”` : 'All products')
  const active = [cat, type, deals, minR, pmin, pmax].filter(Boolean).length

  const filters = (
    <div className="filters">
      <div className="f-group">
        <h4>Department</h4>
        <button type="button" className={!cat ? 'on' : ''} onClick={() => setParam('cat', '')}>All departments</button>
        {DEPARTMENTS.map((d) => <button type="button" key={d.name} className={cat === d.name ? 'on' : ''} onClick={() => setParam('cat', d.name)}>{d.name}</button>)}
      </div>
      <div className="f-group">
        <h4>How it's sold</h4>
        {[['', 'Everything'], ['in_stock', 'Ready to deliver'], ['made_to_order', 'Made to order'], ['service', 'Services and bookings']].map(([v, l]) => (
          <button type="button" key={v || 'all'} className={type === v ? 'on' : ''} onClick={() => setParam('type', v)}>{l}</button>
        ))}
      </div>
      <div className="f-group">
        <h4>Price</h4>
        <div className="f-price">
          <input inputMode="decimal" placeholder="Min K" value={pmin} onChange={(e) => setParam('min', e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Minimum price" />
          <input inputMode="decimal" placeholder="Max K" value={pmax} onChange={(e) => setParam('max', e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Maximum price" />
        </div>
      </div>
      <div className="f-group">
        <label className="f-check"><input type="checkbox" checked={deals} onChange={(e) => setParam('deals', e.target.checked ? '1' : '')} /> Deals and savings</label>
        <label className="f-check"><input type="checkbox" checked={minR} onChange={(e) => setParam('rating', e.target.checked ? '4' : '')} /> 4 stars and up</label>
      </div>
      {active > 0 && <button type="button" className="btn sm" onClick={() => setSp(q ? { q: sp.get('q') } : {}, { replace: true })}>Clear filters</button>}
    </div>
  )

  return (
    <div className="search-page">
      <aside className="search-side hide-mobile">{filters}</aside>
      <div className="search-results">
        <div className="crumbs"><Link to="/">Home</Link><span>{heading}</span></div>
        <div className="results-head">
          <div>
            <h1>{heading}</h1>
            <p className="muted small">{results.length} result{results.length === 1 ? '' : 's'}</p>
          </div>
          <div className="row">
            <button type="button" className="btn sm show-mobile" onClick={() => setSheet(true)}>Filters{active ? ` (${active})` : ''}</button>
            <select className="sort" value={sort} onChange={(e) => setParam('sort', e.target.value === 'featured' ? '' : e.target.value)} aria-label="Sort">
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        {results.length === 0 ? (
          <div className="empty-shop">
            <h2>Nothing matches yet</h2>
            <p>Try a different word or remove a filter.</p>
            <Link to="/search" className="btn">See all products</Link>
          </div>
        ) : (
          <div className="grid-products">{results.map((p) => <ProductCard key={p.id} p={p} deal={dealFor(data.offersBy, p.id)} />)}</div>
        )}
      </div>
      {sheet && (
        <>
          <div className="sheet-backdrop" onClick={() => setSheet(false)} />
          <div className="sheet" role="dialog" aria-label="Filters">
            <div className="between mb"><h3>Filters</h3><button className="btn sm primary" onClick={() => setSheet(false)}>Show {results.length} result{results.length === 1 ? '' : 's'}</button></div>
            {filters}
          </div>
        </>
      )}
    </div>
  )
}

// ---------- product page ----------
export function ProductPage() {
  const { id: idParam, store: storeParam, product: productParam } = useParams()
  const id = productParam || idParam
  const { setStoreRef } = useCart()
  const nav = useNavigate()
  const { add } = useCart()
  const toast = useToast()
  const catalogue = useCatalogue()
  const [p, setP] = useState(null)
  const [offers, setOffers] = useState([])
  const [reviews, setReviews] = useState([])
  const [img, setImg] = useState(0)
  const [qty, setQty] = useState(1)
  const [notify, setNotify] = useState(false)
  const [choices, setChoices] = useState({})
  const [note, setNote] = useState('')

  useEffect(() => {
    setP(null); setImg(0); setQty(1); setChoices({}); setNote('')
    const isUuid = /^[0-9a-f-]{36}$/i.test(id)
    let query = supabase.from('public_products').select('*')
    query = isUuid ? query.eq('id', id) : query.eq('slug', id)
    if (storeParam) query = query.eq('vendor_slug', storeParam)
    query.maybeSingle().then(({ data }) => {
      setP(data || false)
      if (!data) return
      if (storeParam && isEntryPage()) setStoreRef(storeParam)
      supabase.from('public_offers').select('*').eq('product_id', data.id).then(({ data: o }) => setOffers((o || []).filter((x) => DEAL_TYPES.includes(x.type) || CONDITION_TYPES.includes(x.type))))
      supabase.from('reviews').select('id,product_rating,comment,customer_name,verified,created_at').eq('product_id', data.id).eq('approved', true).order('created_at', { ascending: false }).limit(10).then(({ data: r }) => setReviews(r || []))
    })
  }, [id, storeParam])

  if (p === null) return <Loading />
  if (!p) return <div className="empty-shop"><h2>This product isn't available</h2><p>It may have been removed or sold out.</p><Link to="/search" className="btn">Browse products</Link></div>

  const scheduled = p.fulfilment !== 'in_stock'
  const out = isOut(p)
  const opts = Array.isArray(p.options) ? p.options.filter((o) => o?.name && o?.choices?.length) : []
  const missing = opts.find((o) => !choices[o.name])
  const guard = (fn) => () => { if (missing) return toast(`Choose ${missing.name.toLowerCase()}`, true); fn() }
  const condition = offers.find((o) => o.type === 'payment_plan') || null
  const deals = offers.filter((o) => DEAL_TYPES.includes(o.type))
  const conditions = offers.filter((o) => CONDITION_TYPES.includes(o.type))
  const save = p.normal_price && Number(p.normal_price) > Number(p.price) ? Number(p.normal_price) - Number(p.price) : 0
  const cta = p.fulfilment === 'service' ? 'Book now' : p.fulfilment === 'made_to_order' ? 'Order now' : 'Buy now'
  const addToCart = guard(() => { add(p, qty, condition, { choices, note }); toast('Added to cart') })
  const buyNow = guard(() => { add(p, qty, condition, { choices, note }); nav('/cart') })
  const more = (catalogue?.products || []).filter((x) => x.id !== p.id && (p.vendor_id ? x.vendor_id === p.vendor_id : x.category === p.category)).slice(0, 10)
  const availability = out ? 'Out of stock' : scheduled ? howText(p) : p.owner_type === 'founder' && p.stock_available <= 5 ? `Only ${p.stock_available} left in stock` : 'In stock'

  const buyBox = (
    <div className="buybox">
      <Price value={p.price} size="lg" />
      {save > 0 && <div className="bb-save">Was <s>{money(p.normal_price)}</s>. You save {money(save)}</div>}
      <div className={`bb-avail ${out ? 'out' : ''}`}>{availability}</div>
      {!scheduled && !out && <div className="bb-line">Delivery in Lusaka District from K30. Other areas confirmed by phone.</div>}
      {p.fulfilment === 'service' && <div className="bb-line">Pick your date{p.time_slots?.length ? ' and time' : ''} at checkout.</div>}
      {p.fulfilment === 'made_to_order' && <div className="bb-line">Choose the date you need it at checkout.</div>}
      {out ? (
        <button className="btn primary block" onClick={() => setNotify(true)}>Tell me when it's back</button>
      ) : (
        <>
          {p.fulfilment !== 'service' && (
            <div className="qty">
              <span>Quantity</span>
              <div className="qty-ctl">
                <button type="button" aria-label="Fewer" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                <span>{qty}</span>
                <button type="button" aria-label="More" onClick={() => setQty(Math.min(p.owner_type === 'founder' && !scheduled ? Math.max(1, p.stock_available) : 99, qty + 1))}>+</button>
              </div>
            </div>
          )}
          <button className="btn primary block" onClick={addToCart}>Add to cart</button>
          <button className="btn buy block" onClick={buyNow}>{cta}</button>
        </>
      )}
      <div className="bb-meta">
        <div><span>Payment</span><span>After we confirm by phone</span></div>
        <div><span>Sold by</span><span>{p.vendor_name ? <Link to={`/${p.vendor_slug}`}>{p.vendor_name}</Link> : 'ZaMarket'}</span></div>
      </div>
    </div>
  )

  return (
    <div className="pdp">
      <div className="crumbs">
        <Link to="/">Home</Link>
        {storeParam && p.vendor_name ? <Link to={`/${storeParam}`}>{p.vendor_name}</Link> : p.category && <Link to={`/search?cat=${encodeURIComponent(p.category)}`}>{p.category}</Link>}
        <span>{p.name}</span>
      </div>

      <div className="pdp-grid">
        <div className="pdp-gallery">
          {p.images?.length > 1 && (
            <div className="thumbs">
              {p.images.map((src, i) => <button key={i} type="button" className={i === img ? 'on' : ''} onClick={() => setImg(i)} aria-label={`Photo ${i + 1}`}><img src={src} alt="" /></button>)}
            </div>
          )}
          <div className="main-img">{p.images?.[img] ? <img src={p.images[img]} alt={p.name} /> : <span className="pc-ph big" aria-hidden>{iconFor(p.category)}</span>}</div>
        </div>

        <div className="pdp-info">
          <h1>{p.name}</h1>
          {p.vendor_name && <Link to={`/${p.vendor_slug}`} className="pdp-store">Visit {p.vendor_name}</Link>}
          {p.rating ? <div className="pdp-rating"><Stars n={p.rating} /><a href="#reviews">{p.review_count} rating{p.review_count === 1 ? '' : 's'}</a></div> : null}
          <hr />
          <div className="pdp-price-inline"><Price value={p.price} size="lg" />{save > 0 && <span className="bb-save">Save {money(save)}</span>}</div>

          {!out && deals.map((o) => <OfferCard key={o.id} offer={o} product={p} onTake={guard(() => { add(p, 1, o, { choices, note }); nav('/cart') })} />)}
          {conditions.map((o) => <div key={o.id} className="offer-note small"><strong>{offerCopy(o, p.name).get}</strong>{o.terms ? <span className="muted">. {o.terms}</span> : ''}</div>)}

          {!out && (opts.length > 0 || p.note_label) && (
            <div className="pdp-options">
              {opts.map((o) => (
                <div key={o.name} className="field">
                  <label>{o.name}{choices[o.name] ? <span className="muted">: {choices[o.name]}</span> : ''}</label>
                  <div className="chips wrap">{o.choices.map((c) => <button key={c} type="button" className={`chip ${choices[o.name] === c ? 'on' : ''}`} onClick={() => setChoices({ ...choices, [o.name]: c })}>{c}</button>)}</div>
                </div>
              ))}
              {p.note_label && (
                <div className="field">
                  <label>{p.note_label} <span className="muted">(optional)</span></label>
                  <input className="input" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {p.benefits?.length > 0 && (
            <div className="pdp-section">
              <h3>About this item</h3>
              <ul className="pdp-bullets">{p.benefits.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          )}
          <div className="pdp-buy-mobile">{buyBox}</div>
        </div>

        <aside className="pdp-side">{buyBox}</aside>
      </div>

      {p.description && <section className="pdp-section wide"><h2>Description</h2><p className="pdp-desc">{p.description}</p></section>}
      {p.faqs?.length > 0 && (
        <section className="pdp-section wide">
          <h2>Questions and answers</h2>
          {p.faqs.map((f, i) => <div key={i} className="faq"><strong>{f.q}</strong><p>{f.a}</p></div>)}
        </section>
      )}
      <section className="pdp-section wide" id="reviews">
        <h2>Customer reviews</h2>
        {reviews.length === 0 ? <p className="muted">No reviews yet. Bought this? <Link to="/review">Rate your order</Link>.</p> : reviews.map((r) => (
          <div key={r.id} className="review">
            <div className="row"><Stars n={r.product_rating} /><strong>{(r.customer_name || 'Customer').split(' ')[0]}</strong>{r.verified && <span className="badge ok">Verified purchase</span>}</div>
            {r.comment && <p>{r.comment}</p>}
          </div>
        ))}
      </section>
      {more.length > 0 && <Row title={p.vendor_id ? `More from ${p.vendor_name}` : 'You may also like'}>{more.map((x) => <ProductCard key={x.id} p={x} inStore={!!storeParam} deal={dealFor(catalogue.offersBy, x.id)} />)}</Row>}
      <p className="small muted pdp-earn">Want to earn by selling this? <Link to="/apply/reseller">Become a reseller</Link>.</p>

      {!out && (
        <div className="mobile-buybar">
          <Price value={p.price} />
          <button className="btn primary" onClick={addToCart}>Add to cart</button>
          <button className="btn buy" onClick={buyNow}>{cta}</button>
        </div>
      )}
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
      <div className="offer-price"><Price value={o.deal_price} />{save > 0 && <s className="muted small">{money(o.normal_value)}</s>}</div>
      <div className="row small">
        {save > 0 && <span className="save">You save {money(save)}</span>}
        {perUnit && <span className="muted">{money(perUnit)} each</span>}
      </div>
      {o.remaining != null && <div className="tiny warn strong">Only {o.remaining} left at this price</div>}
      {o.terms && <div className="tiny muted">{o.terms}</div>}
      <button className="btn buy block" onClick={onTake}>Take this offer</button>
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

// ---------- seller store ----------
export function StorePage() {
  const { store: slug, id: legacyId } = useParams()
  const { setStoreRef } = useCart()
  const nav = useNavigate()
  const [store, setStore] = useState(null)
  const [products, setProducts] = useState(null)
  const [offersBy, setOffersBy] = useState({})
  useEffect(() => {
    const q1 = supabase.from('public_vendors').select('*')
    ;(slug ? q1.eq('slug', slug) : q1.eq('id', legacyId)).maybeSingle().then(({ data }) => {
      setStore(data || false)
      if (!data) return setProducts([])
      if (legacyId) return nav(`/${data.slug}`, { replace: true })
      if (isEntryPage()) setStoreRef(data.slug)
      supabase.from('public_products').select('*').eq('vendor_id', data.id).order('category').order('name').then(({ data: rows }) => setProducts(rows || []))
    })
    supabase.from('public_offers').select('id,product_id,type,name').then(({ data }) => {
      const m = {}; for (const x of data || []) (m[x.product_id] = m[x.product_id] || []).push(x); setOffersBy(m)
    })
  }, [slug, legacyId])
  if (store === null || products === null) return <Loading />
  if (!store) return <div className="empty-shop"><h2>We couldn't find that page</h2><p>Check the link, or browse the marketplace.</p><div className="hero-actions"><Link to="/" className="btn primary">Go to ZaMarket</Link><Link to="/sellers" className="btn">See all sellers</Link></div></div>
  const groups = products.reduce((m, p) => { const k = p.category || 'Products'; (m[k] = m[k] || []).push(p); return m }, {})
  const kinds = new Set(products.map((p) => p.fulfilment))
  const note = kinds.has('service') && kinds.size === 1 ? 'Book online. We confirm your booking by phone.' : kinds.has('made_to_order') ? 'Freshly made to order. Order and pay through ZaMarket and we deliver it to you.' : 'Order through ZaMarket and we deliver it to you.'
  return (
    <div className="stack">
      <div className="crumbs"><Link to="/">Home</Link><Link to="/sellers">Sellers</Link><span>{store.business_name}</span></div>
      <div className="store-banner">
        <span className="seller-mark lg" aria-hidden>{store.business_name.slice(0, 1)}</span>
        <div>
          <h1>{store.business_name}</h1>
          <div className="small">{[store.category, store.town].filter(Boolean).join(', ')}{store.rating ? <> <Stars n={store.rating} /> {store.rating} ({store.review_count})</> : ''}</div>
          {store.description && <p>{store.description}</p>}
          <p className="small muted">{note}</p>
          <Link to="/" className="small">Browse everything on ZaMarket</Link>
        </div>
      </div>
      {products.length === 0 ? <div className="empty-shop"><h2>No products yet</h2><p>Check back soon.</p></div> : Object.entries(groups).map(([cat, list]) => (
        <section key={cat} className="stack-sm">
          <h2>{cat}</h2>
          <div className="grid-products">{list.map((p) => <ProductCard key={p.id} p={p} inStore deal={dealFor(offersBy, p.id)} />)}</div>
        </section>
      ))}
    </div>
  )
}
