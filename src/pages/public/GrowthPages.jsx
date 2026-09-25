import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../lib/cart'
import { useToast, Loading } from '../../components/ui'
import { useSaved } from '../../lib/saved'
import { useDepartments } from '../../lib/departments'
import { useSeo } from '../../lib/seo'
import OfferingCard from '../../components/OfferingCard'
import PhotoUpload from '../../components/PhotoUpload'
import Icon from '../../lib/icons'

const FORMAT_WORD = { guide: 'Free guide', checklist: 'Free checklist', voucher: 'Voucher', quiz: 'Quick quiz', sample: 'Free sample', calculator: 'Free calculator', video: 'Free video', other: 'Free' }

// /free/:slug — a lead magnet. Name and phone in, the guide or voucher out.
export function MagnetPage() {
  const { slug } = useParams()
  const { touch } = useCart()
  const toast = useToast()
  const [m, setM] = useState(null)
  const [f, setF] = useState({ name: '', phone: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    supabase.from('public_magnets').select('*').eq('slug', slug).maybeSingle().then(({ data }) => setM(data || false))
    supabase.rpc('view_magnet', { p_slug: slug })
  }, [slug])

  if (m === null) return <Loading />
  if (!m) return <div className="empty-shop"><h2>This offer has ended</h2><p>Have a look at what's on ZaMarket today.</p><Link to="/" className="btn primary">Go to ZaMarket</Link></div>

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc('claim_magnet', {
      p_slug: slug, p_name: f.name.trim(), p_phone: f.phone, p_email: f.email || null,
      p_campaign_code: touch?.type === 'campaign' ? touch.code : null,
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    setResult(data)
  }
  const shopLink = m.vendor_slug ? (m.product_slug ? `/${m.vendor_slug}/${m.product_slug}` : `/${m.vendor_slug}`) : m.product_slug ? `/p/${m.product_slug}` : '/'

  return (
    <div className="magnet">
      <div className="magnet-copy">
        <span className="magnet-kind">{FORMAT_WORD[m.format] || 'Free'}{m.vendor_name ? ` from ${m.vendor_name}` : ''}</span>
        <h1>{m.headline}</h1>
        {m.description && <p className="magnet-desc">{m.description}</p>}
        {m.bullets?.length > 0 && <ul className="magnet-list">{m.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
      </div>

      <div className="magnet-form">
        {!result ? (
          <form onSubmit={submit} className="stack">
            <h2>{m.name}</h2>
            <label className="field"><span>Your name</span><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
            <label className="field"><span>Phone (WhatsApp)</span><input className="input" type="tel" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" placeholder="0977 123 456" /></label>
            <label className="field"><span>Email <span className="muted">(optional)</span></span><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
            <button className="btn buy block" disabled={busy}>{busy ? 'One moment…' : m.cta_text}</button>
            <p className="tiny muted">We may call or WhatsApp you about this. No spam.</p>
          </form>
        ) : (
          <div className="stack magnet-done">
            <h2>It's yours, {f.name.split(' ')[0]}</h2>
            {result.type === 'link' && result.value && <a className="btn buy block" href={result.value} target="_blank" rel="noreferrer">Open {result.name}</a>}
            {result.type === 'voucher' && <><p>Your voucher code:</p><div className="voucher">{result.value}</div><p className="small muted">Mention this code when we call to confirm your order.</p></>}
            {result.type === 'message' && <p>{result.value}</p>}
            <Link to={shopLink} className="btn block">{m.vendor_name ? `Shop ${m.vendor_name}` : 'Browse ZaMarket'}</Link>
          </div>
        )}
      </div>
    </div>
  )
}

// /invite/:code — a customer invited a friend. Remember it and welcome them.
export function InvitePage() {
  const { code } = useParams()
  const { setInvite } = useCart()
  const nav = useNavigate()
  const [info, setInfo] = useState(null)
  useEffect(() => {
    supabase.rpc('invite_info', { p_code: code }).then(({ data }) => {
      if (data?.found) { setInvite(code.toLowerCase()); setInfo(data) } else nav('/', { replace: true })
    })
  }, [code])
  if (!info) return <Loading />
  return (
    <div className="invite-welcome">
      <h1>{info.name} thinks you'll like ZaMarket</h1>
      <p>Phones, home goods, cakes made to order and local services, delivered in Lusaka. You only pay once we've confirmed your order by phone.</p>
      <div className="hero-actions" style={{ justifyContent: 'center' }}>
        <Link to="/" className="btn primary">Start shopping</Link>
        <Link to="/search?deals=1" className="btn">See today's deals</Link>
      </div>
    </div>
  )
}


// /rate/1042-abcd — one tap from a WhatsApp message. Nothing to type.
export function RatePage() {
  const { link } = useParams()
  const toast = useToast()
  const [info, setInfo] = useState(null)
  const [r, setR] = useState({ product: 5, vendor: 5, delivery: 5, marketplace: 5, as_described: null, may_share: false, photo: '' })
  const [comment, setComment] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { supabase.rpc('review_open', { p_link: link }).then(({ data }) => setInfo(data || false)) }, [link])

  if (info === null) return <Loading />
  if (!info) return <div className="empty-shop"><h2>This rating link isn't valid</h2><p>It may have been mistyped.</p><Link to="/" className="btn primary">Go to ZaMarket</Link></div>
  if (done || info.already) return (
    <div className="rate-done">
      <div className="rate-tick" aria-hidden>★</div>
      <h1>Thank you{info.first_name ? `, ${info.first_name}` : ''}</h1>
      <p>{info.already && !done ? 'You have already rated this order.' : 'Your rating helps other shoppers and the sellers on ZaMarket.'}</p>
      <Link to="/" className="btn primary">Shop again</Link>
    </div>
  )

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.rpc('review_submit', { p_link: link, p_ratings: r, p_comment: comment })
    setBusy(false)
    if (error) return toast(error.message, true)
    setDone(true)
  }
  const vendor = info.items?.find((i) => i.vendor)?.vendor

  return (
    <form onSubmit={submit} className="rate">
      <h1>How did we do{info.first_name ? `, ${info.first_name}` : ''}?</h1>
      <p className="muted">Order #{info.order_number} · {info.items?.map((i) => i.name).join(', ')}</p>
      <Stars5 label={info.items?.length === 1 ? info.items[0].name : 'The products'} value={r.product} onChange={(v) => setR({ ...r, product: v })} />
      <Stars5 label={vendor ? `${vendor} as a seller` : 'ZaMarket as a seller'} value={r.vendor} onChange={(v) => setR({ ...r, vendor: v })} />
      <div className="rate-row stack-sm">
        <span className="rate-label">Was it what the page described?</span>
        <div className="pick-two">
          <button type="button" className={r.as_described === true ? 'on yes' : ''} onClick={() => setR({ ...r, as_described: true })}>Yes</button>
          <button type="button" className={r.as_described === false ? 'on no' : ''} onClick={() => setR({ ...r, as_described: false })}>No</button>
        </div>
      </div>

      <div className="rate-row stack-sm">
        <span className="rate-label">How was the delivery?</span>
        <div className="pick-three">
          {[[5, 'Good'], [3, 'Okay'], [1, 'Poor']].map(([v, l]) => (
            <button type="button" key={l} className={r.delivery === v ? 'on' : ''} onClick={() => setR({ ...r, delivery: v })}>{l}</button>
          ))}
        </div>
      </div>

      <Stars5 label="Ordering with us overall" value={r.marketplace} onChange={(v) => setR({ ...r, marketplace: v })} />

      <label className="field"><span>Anything you'd like to say? <span className="muted">(optional)</span></span>
        <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What you liked, or what we should do better" /></label>

      <div className="rate-photo">
        <span className="rate-label">Add a photo of what you received <span className="muted">(optional)</span></span>
        <div className="row">
          {r.photo && <img src={r.photo} alt="" className="rate-shot" />}
          <PhotoUpload label={r.photo ? 'Change photo' : '📷 Add a photo'} onDone={(url) => setR({ ...r, photo: url })} />
        </div>
      </div>

      {(comment.trim() || r.photo) && (
        <label className="check consent">
          <input type="checkbox" checked={r.may_share} onChange={(e) => setR({ ...r, may_share: e.target.checked })} />
          <span>ZaMarket may show what I wrote{r.photo ? ' and my photo' : ''} to other shoppers, with my first name only.</span>
        </label>
      )}

      <button className="btn buy block" disabled={busy || r.as_described === null}>{busy ? 'Sending…' : 'Send my rating'}</button>
      {r.as_described === null && <p className="tiny muted center">Tell us whether it matched the page, then send.</p>}
      <p className="tiny muted">Only your first name is ever shown. Your rating is marked as a verified purchase because it is attached to a real order.</p>
    </form>
  )
}

function Stars5({ label, value, onChange }) {
  return (
    <div className="rate-row">
      <span className="rate-label">{label}</span>
      <div className="rate-stars" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((k) => (
          <button type="button" key={k} role="radio" aria-checked={value === k} aria-label={`${k} star${k > 1 ? 's' : ''}`}
            className={k <= value ? 'on' : ''} onClick={() => onChange(k)}>★</button>
        ))}
      </div>
    </div>
  )
}


// /v/<name> — a vendor sent this shopper to ZaMarket. They earn on whatever is bought.
export function VendorRefCapture() {
  const { code } = useParams()
  const { setVendorRef } = useCart()
  const nav = useNavigate()
  useEffect(() => { if (code) setVendorRef(code.toLowerCase()); nav('/', { replace: true }) }, [code])
  return null
}

// /saved — things the customer tapped the heart on, kept on their own phone.
export function SavedPage() {
  const saved = useSaved()
  const [items, setItems] = useState(null)
  useSeo({ title: 'My list | ZaMarket', noIndex: true })
  useEffect(() => {
    if (!saved.ids.length) return setItems([])
    supabase.from('public_products').select('*').in('id', saved.ids).then(({ data }) => setItems(data || []))
  }, [saved.ids.join(',')])

  if (!items) return <Loading />
  if (!items.length) return (
    <div className="empty-shop">
      <h2>Your list is empty</h2>
      <p>Tap the heart on anything you want to come back to. It stays on this phone.</p>
      <Link to="/" className="btn primary">Start looking</Link>
    </div>
  )
  return (
    <div className="stack">
      <div className="page-head"><div><h1>My list</h1><p>{items.length} saved</p></div>
        <button className="btn ghost sm" onClick={saved.clear}>Clear the list</button></div>
      <div className="grid-products">{items.map((p) => <OfferingCard key={p.id} p={p} />)}</div>
    </div>
  )
}

// /categories — the full directory, grouped the way people think.
export function CategoriesPage() {
  const departments = useDepartments()
  const [counts, setCounts] = useState({})
  useSeo({ title: 'All categories | ZaMarket Lusaka', description: 'Browse everything on ZaMarket: products, services, courses, vehicles and events in Lusaka.' })
  useEffect(() => {
    supabase.from('public_products').select('category,offering_type,fulfilment').then(({ data }) => {
      const m = { _service: 0, _course: 0, _vehicle: 0, _event: 0 }
      for (const p of data || []) {
        m[p.category] = (m[p.category] || 0) + 1
        if (p.offering_type === 'vehicle') m._vehicle++
        else if (['course', 'class'].includes(p.offering_type)) m._course++
        else if (p.offering_type === 'event') m._event++
        else if (p.fulfilment === 'service') m._service++
      }
      setCounts(m)
    })
  }, [])

  const kinds = [
    { to: '/search?type=service', label: 'Services', icon: <Icon.wrench />, n: counts._service },
    { to: '/search?type=course', label: 'Courses and training', icon: <Icon.graduation />, n: counts._course },
    { to: '/search?type=vehicle', label: 'Vehicles', icon: <Icon.car />, n: counts._vehicle },
    { to: '/search?type=event', label: 'Events', icon: <Icon.ticket />, n: counts._event },
  ].filter((k) => k.n > 0)

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Explore ZaMarket</h1><p>Everything on the marketplace, by kind.</p></div></div>
      <section className="stack-sm">
        <h2>Shop</h2>
        <div className="cat-grid">
          {departments.map((d) => (
            <Link key={d.name} to={`/search?cat=${encodeURIComponent(d.name)}`} className={`cat-tile ${counts[d.name] ? '' : 'empty'}`}>
              <span className="cat-tile-icon">{d.icon}</span>
              <span>{d.name}</span>
              <em>{counts[d.name] ? `${counts[d.name]} item${counts[d.name] > 1 ? 's' : ''}` : 'Coming soon'}</em>
            </Link>
          ))}
        </div>
      </section>
      {kinds.length > 0 && (
        <section className="stack-sm">
          <h2>Book and learn</h2>
          <div className="cat-grid">
            {kinds.map((k) => (
              <Link key={k.label} to={k.to} className="cat-tile">
                <span className="cat-tile-icon">{k.icon}</span>
                <span>{k.label}</span>
                <em>{k.n} listed</em>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="stack-sm">
        <h2>More</h2>
        <div className="cat-grid">
          <Link to="/sellers" className="cat-tile"><span className="cat-tile-icon"><Icon.briefcase /></span><span>Local businesses</span><em>Browse sellers</em></Link>
          <Link to="/search?deals=1" className="cat-tile"><span className="cat-tile-icon"><Icon.tag /></span><span>Today's deals</span><em>What's on offer</em></Link>
          <Link to="/about" className="cat-tile"><span className="cat-tile-icon"><Icon.info /></span><span>About ZaMarket</span><em>Who we are</em></Link>
        </div>
      </section>
    </div>
  )
}
