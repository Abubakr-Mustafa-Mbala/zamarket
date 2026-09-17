import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../lib/cart'
import { useToast, Loading } from '../../components/ui'

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
