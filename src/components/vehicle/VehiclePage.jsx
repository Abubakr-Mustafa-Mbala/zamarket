import { useEffect, useMemo, useState } from 'react'
import { track } from '../../lib/traffic'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/format'
import { useAuth } from '../../lib/auth'
import { useCart } from '../../lib/cart'
import { Modal, useToast } from '../ui'
import ShareProduct from '../ShareProduct'
import PhotoViewer from '../PhotoViewer'
import VehicleCard from './VehicleCard'
import { useVehicleContact, askOnWhatsApp } from './contact'
import AffiliateTools, { PhotoSaver } from './AffiliateTools'
import { VI, FACT_ICON } from './icons'
import { vehicleOf, vehicleTitle, vehicleFacts, bodyGroup, QUICK_QUESTIONS, priceNote } from '../../lib/vehicle'
import '../../motors.css'

const photosOf = (p) => (Array.isArray(p?.images) ? p.images : []).filter((s) => typeof s === 'string' && /^https?:\/\//i.test(s))

export { vehicleLink, useVehicleContact, askOnWhatsApp } from './contact'

function Gallery({ p, title }) {
  const photos = photosOf(p)
  const [i, setI] = useState(0)
  const [open, setOpen] = useState(false)
  useEffect(() => { setI(0) }, [p.id])
  if (!photos.length) {
    return <div className="vx-gallery vx-gallery-empty">{VI.camera}<span>The seller's photos will appear here.</span></div>
  }
  const cur = photos[Math.min(i, photos.length - 1)]
  return (
    <div className="vx-gallery">
      <button type="button" className="vx-gallery-main" onClick={() => setOpen(true)} aria-label={`Open photo ${i + 1} of ${photos.length} full screen`}>
        <img className="vx-gallery-blur" src={cur} alt="" aria-hidden="true" />
        <img className="vx-gallery-img" src={cur} alt={`${title}, photo ${i + 1} of ${photos.length}`} fetchPriority="high" />
        <span className="vx-gallery-count">{VI.camera}{i + 1} / {photos.length}</span>
        <span className="vx-gallery-zoom">Tap to zoom</span>
      </button>
      {photos.length > 1 && (
        <>
          <button type="button" className="vx-gallery-nav prev" onClick={() => setI((n) => (n - 1 + photos.length) % photos.length)} aria-label="Previous photo">‹</button>
          <button type="button" className="vx-gallery-nav next" onClick={() => setI((n) => (n + 1) % photos.length)} aria-label="Next photo">›</button>
          <div className="vx-thumbs" aria-label="All photos">
            {photos.map((src, k) => (
              <button type="button" key={`${src}-${k}`} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`} aria-pressed={k === i}>
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
      {open && <PhotoViewer images={photos} start={i} alt={title} onClose={() => setOpen(false)} />}
    </div>
  )
}

// Pure layout: used by the live page and by the listing form's preview.
export function VehicleView({ p, preview = false, onAsk, onRegister, contact, similar = [] }) {
  const { role, profile, settings, isStaff } = useAuth()
  const [saving, setSaving] = useState(false)
  const v = vehicleOf(p)
  const title = vehicleTitle(v, p.name)
  const facts = vehicleFacts(v)
  const top = ['year', 'mileage_km', 'transmission', 'fuel'].map((k) => facts.find((f) => f.key === k)).filter(Boolean)
  const rest = facts.filter((f) => !['make', 'model', 'variant'].includes(f.key))
  const sold = p.status === 'out_of_stock'
  const wa = contact?.whatsapp && !preview ? (q) => askOnWhatsApp(p, contact, q) : null
  const group = bodyGroup(v.body || p.category)
  const affiliate = role === 'reseller' && profile?.partner?.code
  const sub = [v.variant && !title.includes(v.variant) ? v.variant : null, v.body, v.colour].filter(Boolean).join(' · ')
  const ask = (q) => onAsk?.(q)
  // Count the view and the taps on WhatsApp and phone links (anonymous).
  useEffect(() => { if (!preview && p.id) track('view', { product: p.id, ref: contact?.ref }) }, [p.id, preview]) // eslint-disable-line react-hooks/exhaustive-deps
  const countTap = (e) => {
    if (preview) return
    const a = e.target.closest?.('a[href]')
    if (!a) return
    const href = a.getAttribute('href') || ''
    if (/^https:\/\/(wa\.me|api\.whatsapp)/.test(href)) track('whatsapp', { product: p.id, ref: contact?.ref })
    else if (href.startsWith('tel:')) track('call', { product: p.id, ref: contact?.ref })
  }

  return (
    <div className={`vx vx-page ${preview ? 'is-preview' : ''}`} onClickCapture={countTap}>
      <nav className="vx-crumbs" aria-label="Breadcrumb">
        <Link to="/motors">Motors</Link><span aria-hidden>›</span>
        {group ? <Link to={`/motors?type=${encodeURIComponent(group)}`}>{group}</Link> : <span>Vehicles</span>}
      </nav>

      <div className="vx-top">
        <Gallery p={p} title={title} />

        <section className="vx-panel" aria-label="Price and how to ask">
          <h1 className="vx-title">{title}</h1>
          {sub && <p className="vx-sub">{sub}</p>}
          <p className="vx-loc">{VI.pin}<span>{v.location || 'Location on enquiry'}</span><span className="dot" aria-hidden>•</span><span>{p.vendor_name || 'ZaMarket'}</span></p>

          <div className="vx-price-box">
            <span className="vx-price-label">Asking price</span>
            <strong className="vx-price">{money(p.price, { whole: true })}</strong>
            {priceNote(v) && <span className="vx-tag on">{priceNote(v)}</span>}
          </div>

          {top.length > 0 && (
            <ul className="vx-keyfacts">
              {top.map((f) => <li key={f.key}>{FACT_ICON[f.key]}<span>{f.label}</span><strong>{f.value}</strong></li>)}
            </ul>
          )}

          {sold ? (
            <div className="vx-sold">
              <strong>This vehicle has been sold.</strong>
              <p>Have a look at the other vehicles in the showroom.</p>
              <Link className="vx-btn primary" to="/motors">See available vehicles</Link>
            </div>
          ) : (
            <>
              <div className="vx-contact">
                {wa && <a className="vx-btn wa big" href={wa()} target="_blank" rel="noreferrer">{VI.whatsapp}Ask on WhatsApp</a>}
                <button type="button" className={`vx-btn ${wa ? 'ghost' : 'primary'} big`} onClick={() => ask('')}>{VI.chat}{wa ? 'Request a call back' : 'Ask about this vehicle'}</button>
                {contact?.phone && !preview && <a className="vx-btn ghost big" href={`tel:${contact.phone.replace(/\s+/g, '')}`}>{VI.phone}Call {contact.phone}</a>}
              </div>
              <div className="vx-quick">
                <span>Tap a question to ask it</span>
                <div>
                  {QUICK_QUESTIONS.map((q) => wa
                    ? <a key={q} href={wa(q)} target="_blank" rel="noreferrer">{q}</a>
                    : <button key={q} type="button" onClick={() => ask(q)}>{q}</button>)}
                </div>
              </div>
            </>
          )}

          {!preview && (affiliate
            ? <AffiliateTools p={p} title={title} link={contact?.link} settings={settings} onRegister={() => onRegister?.()}
                store={p.vendor_name ? { business_name: p.vendor_name, logo_url: p.vendor_logo, location: p.vendor_location, category: p.vendor_category } : null} />
            : (
              <div className="vx-share">
                <ShareProduct product={{ ...p, name: title }} store={p.vendor_name ? { business_name: p.vendor_name, logo_url: p.vendor_logo, location: p.vendor_location, category: p.vendor_category } : null}
                  settings={settings} link={contact?.link} className="vx-btn ghost" label="Share this vehicle">{VI.share}</ShareProduct>
                {isStaff && <button type="button" className="vx-btn ghost" onClick={() => setSaving(true)}>{VI.camera}Photos to post</button>}
                {saving && <PhotoSaver p={p} title={title} onClose={() => setSaving(false)} />}
              </div>
            ))}
        </section>
      </div>

      <div className="vx-details">
        <section className="vx-card-block">
          <h2>Specifications</h2>
          {rest.length ? (
            <dl className="vx-specs">
              {rest.map((f) => <div key={f.key}><dt>{FACT_ICON[f.key]}{f.label}</dt><dd>{f.value}</dd></div>)}
            </dl>
          ) : <p className="vx-muted">The seller has not given the specifications yet. Ask and we will find out.</p>}
        </section>

        {v.features.length > 0 && (
          <section className="vx-card-block">
            <h2>Features</h2>
            <ul className="vx-features">{v.features.map((f) => <li key={f}>{VI.check}{f}</li>)}</ul>
          </section>
        )}

        {(v.known_issues || p.description) && (
          <section className="vx-card-block">
            <h2>Condition and notes</h2>
            {v.known_issues && <div className="vx-issues"><strong>Known issues, as told by the seller</strong><p>{v.known_issues}</p></div>}
            {p.description && <p className="vx-desc">{p.description}</p>}
          </section>
        )}

        <section className="vx-card-block">
          <h2>Seeing the vehicle</h2>
          <dl className="vx-specs one">
            <div><dt>{VI.pin}Where</dt><dd>{v.location || 'Ask us'}</dd></div>
            {v.viewing && <div><dt>{VI.year}When</dt><dd>{v.viewing}</dd></div>}
            {p.vendor_name ? <div><dt>{VI.condition}Listed by</dt><dd>{p.vendor_slug && !preview ? <Link to={`/${p.vendor_slug}`}>{p.vendor_name}</Link> : p.vendor_name}</dd></div>
              : <div><dt>{VI.condition}Listed by</dt><dd>ZaMarket Motors, for the owner</dd></div>}
          </dl>
          {!sold && <button type="button" className="vx-btn ghost" onClick={() => ask('Can I come and see it? When?')}>Arrange a viewing</button>}
        </section>

      </div>

      {similar.length > 0 && (
        <section className="vx-similar">
          <div className="vx-similar-head"><h2>More vehicles</h2><Link to="/motors">See all</Link></div>
          <div className="vx-similar-row">{similar.map((s) => <VehicleCard key={s.id} p={s} compact />)}</div>
        </section>
      )}

      {!sold && (
        <div className={`vx-sticky ${preview ? 'is-preview' : ''}`}>
          <div><span>Asking price</span><strong>{money(p.price, { whole: true })}</strong></div>
          {wa
            ? <a className="vx-btn wa" href={wa()} target="_blank" rel="noreferrer">{VI.whatsapp}WhatsApp</a>
            : null}
          <button type="button" className={`vx-btn ${wa ? 'ghost' : 'primary'}`} onClick={() => ask('')}>{wa ? 'Call me back' : 'Ask'}</button>
        </div>
      )}
    </div>
  )
}

// The live vehicle page.
export default function VehiclePage({ p }) {
  const contact = useVehicleContact(p)
  const [asking, setAsking] = useState(null)
  const [similar, setSimilar] = useState([])
  const group = bodyGroup(vehicleOf(p).body || p.category)

  useEffect(() => {
    let alive = true
    supabase.from('public_products').select('*').eq('offering_type', 'vehicle').eq('status', 'published').neq('id', p.id).order('created_at', { ascending: false }).limit(24)
      .then(({ data }) => {
        if (!alive) return
        const list = data || []
        const same = list.filter((x) => bodyGroup(vehicleOf(x).body || x.category) === group)
        const other = list.filter((x) => !same.includes(x))
        setSimilar([...same, ...other].slice(0, 6))
      })
    return () => { alive = false }
  }, [p.id, group])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('ask') === '1') setAsking({ question: '' })
  }, [])

  return (
    <>
      <VehicleView p={p} contact={contact} similar={similar} onAsk={(question) => setAsking({ question })} onRegister={() => setAsking({ question: '', register: true })} />
      {asking && <AskModal p={p} first={asking.question} register={asking.register} affiliateCode={contact.ref} onClose={() => setAsking(null)} />}
    </>
  )
}

// Name, phone, the questions. Recorded as a deal so the team follows it up
// and any affiliate who sent the buyer is credited.
function AskModal({ p, first, onClose, register = false, affiliateCode = null }) {
  const toast = useToast()
  const { attribution } = useCart()
  const v = vehicleOf(p)
  const title = vehicleTitle(v, p.name)
  const [f, setF] = useState({ name: '', phone: '', via: 'WhatsApp', note: '', offer: '' })
  const [picked, setPicked] = useState(() => new Set(first ? [first] : []))
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const toggle = (q) => setPicked((s) => { const n = new Set(s); if (n.has(q)) n.delete(q); else n.add(q); return n })
  const message = useMemo(() => [
    register ? 'Buyer registered by their affiliate.' : '',
    [...picked].join(' '),
    f.note.trim(),
    `Reply by: ${f.via}.`,
  ].filter(Boolean).join(' '), [picked, f.note, f.via, register])

  const send = async (e) => {
    e.preventDefault()
    setBusy(true)
    const a = attribution ? attribution() : {}
    const { data, error } = await supabase.rpc('submit_enquiry', {
      payload: {
        product_id: p.id, name: f.name, phone: f.phone, message, offer_amount: f.offer ? f.offer : null,
        referral_code: register ? affiliateCode : a.referral_code, campaign_code: a.campaign_code, invite_code: a.invite_code, store_ref: a.store_ref,
      },
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    track('enquiry', { product: p.id })
    setDone(data)
  }

  return (
    <Modal title={done ? (register ? 'Buyer registered' : 'We have your question') : register ? `Register a buyer for the ${title}` : `Ask about the ${title}`} onClose={onClose}>
      {done ? (
        <div className="stack center">
          {register
            ? <p>{f.name.split(' ')[0]} is registered to you. We will {f.via === 'Phone call' ? 'call' : 'message'} them soon. Follow it in Vehicles → My buyers.</p>
            : <p>Thank you, {f.name.split(' ')[0]}. We will {f.via === 'Phone call' ? 'call' : 'message'} you on {f.phone} soon.</p>}
          <div className="voucher" style={{ fontSize: '1.3rem' }}>Ref {done.reference}</div>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      ) : (
        <form onSubmit={send} className="stack vx-ask">
          <div>
            <span className="small strong">{register ? 'What does the buyer want to know?' : 'What would you like to know?'}</span>
            <div className="vx-ask-chips">
              {QUICK_QUESTIONS.map((q) => (
                <button type="button" key={q} className={picked.has(q) ? 'on' : ''} aria-pressed={picked.has(q)} onClick={() => toggle(q)}>{picked.has(q) && VI.check}{q}</button>
              ))}
            </div>
          </div>
          <label className="field"><span>Anything else? (optional)</span><textarea className="input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          {priceNote(v) && (
            <label className="field"><span>{register ? "Buyer's offer (optional)" : 'Your offer (optional)'}</span><input className="input" inputMode="numeric" value={f.offer} onChange={(e) => setF({ ...f, offer: e.target.value.replace(/[^0-9.]/g, '') })} placeholder={`Asking ${money(p.price, { whole: true })}`} /></label>
          )}
          <label className="field"><span>{register ? "Buyer's name" : 'Your name'}</span><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete={register ? 'off' : 'name'} /></label>
          <label className="field"><span>{register ? "Buyer's phone number" : 'Your phone number'}</span><input className="input" type="tel" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete={register ? 'off' : 'tel'} placeholder="0977 123 456" /></label>
          <div>
            <span className="small strong">{register ? 'How should we contact them?' : 'How should we reply?'}</span>
            <div className="vx-ask-chips">
              {['WhatsApp', 'Phone call'].map((x) => <button type="button" key={x} className={f.via === x ? 'on' : ''} aria-pressed={f.via === x} onClick={() => setF({ ...f, via: x })}>{x}</button>)}
            </div>
          </div>
          <button className="btn buy block" disabled={busy || (!register && !picked.size && !f.note.trim() && !f.offer)}>{busy ? 'Sending…' : register ? 'Register this buyer' : 'Send'}</button>
          <p className="tiny muted">{register ? 'Only register someone who asked you about this vehicle and agreed to be contacted. Their number goes to the ZaMarket team only.' : 'Your number goes to the ZaMarket team only, to answer you about this vehicle.'}</p>
        </form>
      )}
    </Modal>
  )
}
