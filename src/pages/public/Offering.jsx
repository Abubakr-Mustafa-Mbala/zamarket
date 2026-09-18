import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../lib/cart'
import { money } from '../../lib/format'
import { Modal, Stars, useToast } from '../../components/ui'
import { iconFor } from '../../lib/categories'
import { useDepartments } from '../../lib/departments'

// Icons a seller can pick for "What you get" blocks (original line drawings)
const G = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
export const BENEFIT_ICONS = {
  check: <svg viewBox="0 0 24 24" {...G}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></svg>,
  certificate: <svg viewBox="0 0 24 24" {...G}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M7 8h10M7 11h6" /><path d="m14 16 1 5 2-1.5 2 1.5 1-5" /></svg>,
  car: <svg viewBox="0 0 24 24" {...G}><path d="M4 15v-3l2-5h12l2 5v3" /><path d="M3 15h18v3H3z" /><circle cx="7.5" cy="18" r="1.5" /><circle cx="16.5" cy="18" r="1.5" /></svg>,
  clock: <svg viewBox="0 0 24 24" {...G}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  shield: <svg viewBox="0 0 24 24" {...G}><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>,
  people: <svg viewBox="0 0 24 24" {...G}><circle cx="9" cy="8" r="3" /><path d="M3 20c.7-3.3 3-5 6-5s5.3 1.7 6 5M16 5a3 3 0 0 1 0 6M18 14.5c1.6.7 2.6 2.6 3 5.5" /></svg>,
  book: <svg viewBox="0 0 24 24" {...G}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" /></svg>,
  map: <svg viewBox="0 0 24 24" {...G}><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11Z" /><circle cx="12" cy="10" r="2.2" /></svg>,
  star: <svg viewBox="0 0 24 24" {...G}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></svg>,
  gift: <svg viewBox="0 0 24 24" {...G}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13M12 8c-1.5-3-5-3.5-5-1.5S9.5 8 12 8Zm0 0c1.5-3 5-3.5 5-1.5S14.5 8 12 8Z" /></svg>,
}
const ICON_ORDER = ['check', 'certificate', 'shield', 'clock', 'star', 'people', 'book', 'map']

const TYPE_WORD = { product: 'Product', service: 'Service', course: 'Course', class: 'Class', vehicle: 'Vehicle', event: 'Event', deal: 'Opportunity', other: 'Offering' }
export const defaultCta = (model, type) => ({ buy: 'Buy now', book: type === 'course' || type === 'class' ? 'Enrol now' : 'Book now', enquire: 'Enquire', negotiate: type === 'vehicle' ? 'Make an offer' : 'Enquire' }[model] || 'Get started')

// Pure renderer — used by the live page and by the builder preview.
export function OfferingView({ p, packages = [], reviews = [], onPrimary, onSecondary, onPackage, preview = false }) {
  const DEPARTMENTS = useDepartments()
  const pg = p.page || {}
  const model = p.sales_model || 'buy'
  const primary = pg.cta_primary || defaultCta(model, p.offering_type)
  const secondary = pg.cta_secondary || (model === 'buy' || model === 'book' ? 'Ask a question' : null)
  const heroImg = p.images?.[0]
  const media = pg.media_section && (pg.media_section.name || pg.media_section.image || pg.media_section.specs?.length) ? pg.media_section : null
  const benefits = (pg.benefits || []).filter((b) => b?.title)
  const listPrice = packages.length ? Math.min(...packages.map((x) => Number(x.price))) : Number(p.price)
  const specs = (pg.specs || []).filter((s) => s?.label && s?.value)
  const priceWord = model === 'negotiate' ? 'Asking price' : packages.length > 1 ? 'From' : 'Price'

  return (
    <div className={`offering ${preview ? 'is-preview' : ''}`}>
      {/* HERO */}
      <section className="of-hero">
        <div className="of-hero-copy">
          <span className="of-type">{TYPE_WORD[p.offering_type] || 'Offering'}{p.category ? ` · ${p.category}` : ''}</span>
          <h1>{pg.hero_headline || p.name}</h1>
          {pg.hero_headline && <div className="of-name">{p.name}</div>}
          {pg.location_text && <div className="of-loc">{BENEFIT_ICONS.map}<span>{pg.location_text}</span></div>}
          {p.description && <p className="of-lead">{p.description.split('\n')[0]}</p>}
          {(pg.hero_points || []).filter(Boolean).length > 0 && (
            <ul className="of-points">{pg.hero_points.filter(Boolean).map((x, i) => <li key={i}>{BENEFIT_ICONS.check}<span>{x}</span></li>)}</ul>
          )}
          <div className="of-price-line"><span>{priceWord}</span><strong>{money(listPrice)}</strong>{model === 'negotiate' && <em>Open to offers</em>}</div>
          <div className="of-ctas">
            <button type="button" className="btn buy" onClick={onPrimary}>{primary}</button>
            {secondary && <button type="button" className="btn ghost-dark" onClick={onSecondary}>{secondary}</button>}
          </div>
        </div>
        <div className="of-hero-media">
          {heroImg ? <img src={heroImg} alt={p.name} /> : <span className="of-ph" aria-hidden>{iconFor(p.category, DEPARTMENTS)}</span>}
          {p.images?.length > 1 && <div className="of-thumbs">{p.images.slice(1, 4).map((src, i) => <img key={i} src={src} alt="" />)}</div>}
        </div>
      </section>

      {/* PROVIDER */}
      <section className="of-provider">
        <span className="seller-mark" aria-hidden>{(p.vendor_name || 'ZaMarket').slice(0, 1)}</span>
        <div className="of-prov-info">
          <strong>{p.vendor_name || 'ZaMarket'}</strong>
          <span className="small muted">{p.vendor_name ? 'Seller on ZaMarket' : 'Sold by ZaMarket'}{p.rating ? <> · <Stars n={p.rating} /> {p.rating} ({p.review_count} review{p.review_count === 1 ? '' : 's'})</> : ''}</span>
        </div>
        <div className="of-prov-links">
          {p.vendor_slug && !preview && <Link to={`/${p.vendor_slug}`} className="btn sm">Visit store</Link>}
          {!preview && <Link to="/" className="btn sm ghost">Explore ZaMarket</Link>}
        </div>
      </section>

      {/* FEATURED MEDIA (training vehicle, facility, equipment…) */}
      {media && (
        <section className="of-media">
          <div className="of-media-img">{media.image ? <img src={media.image} alt={media.name || media.title} /> : <span className="of-ph" aria-hidden>{BENEFIT_ICONS.star}</span>}</div>
          <div>
            <h2>{media.title || 'Featured'}</h2>
            {media.name && <div className="of-media-name">{media.name}</div>}
            {media.text && <p className="muted">{media.text}</p>}
            {(media.specs || []).filter((s) => s?.label).length > 0 && (
              <dl className="of-specs">{media.specs.filter((s) => s?.label).map((s, i) => <div key={i}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>
            )}
          </div>
        </section>
      )}

      {/* SPECS (vehicles and anything with specifications) */}
      {specs.length > 0 && (
        <section className="of-block">
          <h2>Specifications</h2>
          <dl className="of-specs wide">{specs.map((s, i) => <div key={i}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>
        </section>
      )}

      {/* PACKAGES */}
      {packages.length > 0 && (
        <section className="of-block" id="packages">
          <h2>{pg.packages_title || (p.offering_type === 'course' || p.offering_type === 'class' ? 'Choose your course' : 'Choose a package')}</h2>
          <div className={`of-packages n${Math.min(packages.length, 4)}`}>
            {packages.map((k) => {
              const save = k.normal_price && Number(k.normal_price) > Number(k.price) ? Number(k.normal_price) - Number(k.price) : 0
              return (
                <div key={k.id || k.name} className={`of-pack ${k.featured ? 'featured' : ''}`}>
                  {k.featured && <span className="of-popular">Most popular</span>}
                  <div className="of-pack-name">{k.name}</div>
                  {k.subtitle && <div className="of-pack-sub">{k.subtitle}</div>}
                  <ul>{(k.items || []).filter(Boolean).map((it, i) => <li key={i}>{BENEFIT_ICONS.check}<span>{it}</span></li>)}</ul>
                  <div className="of-pack-price">
                    <strong>{money(k.price)}</strong>
                    {save > 0 && <span><s>{money(k.normal_price)}</s> Save {money(save)}</span>}
                  </div>
                  <button type="button" className={`btn block ${k.featured ? 'buy' : 'primary'}`} onClick={() => onPackage?.(k)}>
                    {model === 'negotiate' || model === 'enquire' ? 'Enquire about this' : `Choose ${k.name}`}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* VALUE STACK */}
      {benefits.length > 0 && (
        <section className="of-block">
          <h2>{pg.benefits_title || 'What you get'}</h2>
          <div className="of-benefits">
            {benefits.map((b, i) => (
              <div key={i} className="of-benefit">
                <span className="of-b-icon">{BENEFIT_ICONS[b.icon] || BENEFIT_ICONS[ICON_ORDER[i % ICON_ORDER.length]]}</span>
                <strong>{b.title}</strong>
                {b.text && <p>{b.text}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* DETAILS */}
      {((pg.included || []).filter(Boolean).length > 0 || (pg.requirements || []).filter(Boolean).length > 0) && (
        <section className="of-block of-two">
          {(pg.included || []).filter(Boolean).length > 0 && <div><h3>What's included</h3><ul className="of-list">{pg.included.filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          {(pg.requirements || []).filter(Boolean).length > 0 && <div><h3>What you'll need</h3><ul className="of-list plain">{pg.requirements.filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        </section>
      )}

      {(pg.sections || []).filter((s) => s?.title && (s.items || []).filter(Boolean).length).map((sec, i) => (
        <section key={i} className="of-block"><h2>{sec.title}</h2><ul className="of-list">{sec.items.filter(Boolean).map((x, k) => <li key={k}>{x}</li>)}</ul></section>
      ))}

      {/* SCHEDULE + AREAS */}
      {((pg.schedule || []).filter((s) => s?.label).length > 0 || (pg.areas || []).filter(Boolean).length > 0) && (
        <section className="of-block of-two">
          {(pg.schedule || []).filter((s) => s?.label).length > 0 && (
            <div>
              <h3>{pg.schedule_title || (p.offering_type === 'course' || p.offering_type === 'class' ? 'Class schedule' : 'Opening hours')}</h3>
              <dl className="of-schedule">{pg.schedule.filter((s) => s?.label).map((s, i) => <div key={i}><dt>{s.label}</dt><dd>{s.hours}</dd></div>)}</dl>
            </div>
          )}
          {(pg.areas || []).filter(Boolean).length > 0 && (
            <div>
              <h3>Areas we serve</h3>
              <div className="of-areas">{pg.areas.filter(Boolean).map((a, i) => <span key={i}>{BENEFIT_ICONS.map}{a}</span>)}</div>
            </div>
          )}
        </section>
      )}

      {/* WHY US */}
      {(pg.why || []).filter(Boolean).length > 0 && (
        <section className="of-why">
          <h2>Why choose {p.vendor_name || 'us'}?</h2>
          <ul>{pg.why.filter(Boolean).map((x, i) => <li key={i}>{BENEFIT_ICONS.star}<span>{x}</span></li>)}</ul>
        </section>
      )}

      {p.description && p.description.includes('\n') && (
        <section className="of-block"><h2>About</h2><p className="pdp-desc">{p.description}</p></section>
      )}

      {!preview && (
        <section className="of-block" id="reviews">
          <h2>Reviews</h2>
          {reviews.length === 0 ? <p className="muted">No reviews yet.</p> : reviews.map((r) => (
            <div key={r.id} className="review">
              <div className="row"><Stars n={r.product_rating} /><strong>{(r.customer_name || 'Customer').split(' ')[0]}</strong>{r.verified && <span className="badge ok">Verified</span>}</div>
              {r.comment && <p>{r.comment}</p>}
            </div>
          ))}
        </section>
      )}

      <section className="of-final">
        <div>
          <h2>{model === 'negotiate' ? 'Interested?' : 'Ready to start?'}</h2>
          <p>{model === 'negotiate' ? 'Send an enquiry or an offer. We confirm details with you by phone.' : model === 'enquire' ? 'Send an enquiry and we\'ll get back to you by phone.' : 'Nothing to pay until we confirm with you by phone.'}</p>
        </div>
        <div className="of-ctas">
          <button type="button" className="btn light" onClick={onPrimary}>{primary}</button>
          {!preview && <Link to="/" className="btn ghost-light">Explore ZaMarket</Link>}
        </div>
      </section>

      <div className="of-sticky">
        <div><span className="tiny muted">{priceWord}</span><strong>{money(listPrice)}</strong></div>
        <button type="button" className="btn buy" onClick={onPrimary}>{primary}</button>
      </div>
    </div>
  )
}

// Live page: loads packages, handles booking / buying / enquiries.
export function OfferingPage({ p, reviews }) {
  const nav = useNavigate()
  const { add, attribution } = useCart()
  const toast = useToast()
  const [packages, setPackages] = useState([])
  const [enquire, setEnquire] = useState(null)
  useEffect(() => {
    supabase.from('public_packages').select('*').eq('product_id', p.id).order('sort').then(({ data }) => setPackages(data || []))
  }, [p.id])
  const model = p.sales_model || 'buy'
  const direct = model === 'buy' || model === 'book'

  const takePackage = (k) => {
    if (!direct) return setEnquire({ package: k })
    add(p, 1, null, { package: k })
    nav('/cart')
  }
  const primary = () => {
    if (!direct) return setEnquire({ package: null })
    if (packages.length > 1) return document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (packages.length === 1) return takePackage(packages[0])
    add(p, 1, null, {}); nav('/cart')
  }
  return (
    <>
      <OfferingView p={p} packages={packages} reviews={reviews} onPrimary={primary} onSecondary={() => setEnquire({ package: null, question: true })} onPackage={takePackage} />
      {enquire && <EnquiryModal p={p} pkg={enquire.package} question={enquire.question} attribution={attribution} onClose={() => setEnquire(null)} toast={toast} />}
    </>
  )
}

function EnquiryModal({ p, pkg, question, attribution, onClose, toast }) {
  const [f, setF] = useState({ name: '', phone: '', message: '', offer: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const negotiate = p.sales_model === 'negotiate' && !question
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const a = attribution ? attribution() : {}
    const { data, error } = await supabase.rpc('submit_enquiry', {
      payload: { product_id: p.id, package_id: pkg?.id || null, name: f.name, phone: f.phone, message: f.message, offer_amount: negotiate && f.offer ? f.offer : null,
        referral_code: a.referral_code, campaign_code: a.campaign_code, invite_code: a.invite_code, store_ref: a.store_ref },
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    setDone(data)
  }
  return (
    <Modal title={done ? 'Enquiry sent' : negotiate ? `Make an offer on ${p.name}` : `Enquire about ${p.name}`} onClose={onClose}>
      {done ? (
        <div className="stack center">
          <p>Thank you, {f.name.split(' ')[0]}. We'll call you shortly{negotiate ? ' to discuss your offer' : ''}.</p>
          <div className="voucher" style={{ fontSize: '1.3rem' }}>Ref {done.reference}</div>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="stack">
          {pkg && <div className="card flat small">Package: <strong>{pkg.name}</strong> · {money(pkg.price)}</div>}
          {negotiate && <div className="small muted">Asking price {money(pkg?.price || p.price)}. Offers are welcome; the seller will respond through ZaMarket.</div>}
          <label className="field"><span>Your name</span><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
          <label className="field"><span>Phone</span><input className="input" type="tel" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" placeholder="0977 123 456" /></label>
          {negotiate && <label className="field"><span>Your offer (optional)</span><input className="input" inputMode="numeric" value={f.offer} onChange={(e) => setF({ ...f, offer: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="e.g. 85000" /></label>}
          <label className="field"><span>{negotiate ? 'Anything you want to ask?' : 'Your question or details'}</span><textarea className="input" rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder={p.offering_type === 'event' ? 'Date, number of guests…' : ''} /></label>
          <button className="btn buy block" disabled={busy}>{busy ? 'Sending…' : negotiate ? 'Send my offer' : 'Send enquiry'}</button>
        </form>
      )}
    </Modal>
  )
}
