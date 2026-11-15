import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useCart } from '../../lib/cart'
import { useSeo } from '../../lib/seo'
import { money } from '../../lib/format'
import { Loading, useToast } from '../../components/ui'
import PhotoViewer from '../../components/PhotoViewer'
import { PhotoSaver } from '../../components/vehicle/AffiliateTools'
import { upcomingMenu, planTotals, planPayloadDays, fromPrice, affiliateEarnings, lunchPostText } from '../../lib/lunch'
import { whatsappLink } from '../../lib/vehicle'
import '../../lunch.css'

const DEAL_COLS = 'id,vendor_id,slug,title,tagline,about_cook,in_the_box,cover_url,proof_images,dishes,delivery_windows,delivery_area,cutoff_hour,guarantee,status'
const KINDS = [
  ['trial', 'Try one lunch', 'One lunch, one day. See if you love it.'],
  ['week', 'My lunches', 'Pick your days. Lunch is sorted.'],
  ['team', 'For my team', 'Several lunches a day, one delivery.'],
]

function useDeliveryIncluded() {
  const [inc, setInc] = useState(false)
  useEffect(() => {
    supabase.from('settings').select('key,value').eq('key', 'delivery_included').then(({ data }) => {
      const v = data?.[0]?.value
      setInc(v === true || v === 'true')
    })
  }, [])
  return inc
}

// /lunch: every published lunch deal.
export function LunchIndex() {
  useSeo({ title: 'Homemade lunch delivered to your workplace | ZaMarket', description: 'Order homemade lunches a day ahead and get them delivered to your office in Lusaka. Try one lunch first.' })
  const [deals, setDeals] = useState(null)
  const [vendors, setVendors] = useState({})
  useEffect(() => {
    supabase.from('meal_deals').select(DEAL_COLS).eq('status', 'published').order('created_at', { ascending: false }).then(({ data }) => {
      setDeals(data || [])
      const ids = [...new Set((data || []).map((d) => d.vendor_id))]
      if (ids.length) supabase.from('public_vendors').select('id,business_name,slug,logo_url').in('id', ids).then(({ data: v }) => setVendors(Object.fromEntries((v || []).map((x) => [x.id, x]))))
    })
  }, [])
  return (
    <div className="ln ln-index">
      <header className="ln-index-head">
        <span className="ln-eyebrow">Lunch at work</span>
        <h1>Homemade lunch, delivered to your office</h1>
        <p>Order by the evening before. Delivered at lunchtime. Try one lunch first.</p>
      </header>
      {deals === null ? <Loading /> : deals.length === 0 ? (
        <div className="ln-empty"><h2>No lunch plans right now</h2><p>New lunch plans appear here as soon as we list them.</p></div>
      ) : (
        <div className="ln-index-grid">
          {deals.map((d) => (
            <Link key={d.id} to={`/lunch/${d.slug}`} className="ln-index-card">
              <span className="ln-index-photo">{d.cover_url ? <img src={d.cover_url} alt="" loading="lazy" /> : null}</span>
              <span className="ln-index-body">
                <small>{vendors[d.vendor_id]?.business_name || ''}</small>
                <strong>{d.title}</strong>
                {d.tagline && <span>{d.tagline}</span>}
                <em>See the menu →</em>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// /lunch/:slug: one lunch deal, everything on one page, booked in three steps.
export default function LunchPage() {
  const { slug } = useParams()
  const [deal, setDeal] = useState(undefined)
  const [products, setProducts] = useState([])
  const [vendor, setVendor] = useState(null)
  const [availability, setAvailability] = useState([])
  const [reviews, setReviews] = useState([])
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let alive = true
    supabase.from('meal_deals').select(DEAL_COLS).eq('slug', slug).eq('status', 'published').maybeSingle().then(async ({ data }) => {
      if (!alive) return
      if (!data) { setDeal(null); return }
      setDeal(data)
      const ids = (data.dishes || []).map((d) => d.product_id)
      const [p, v, a, r] = await Promise.all([
        ids.length ? supabase.from('public_products').select('*').in('id', ids) : { data: [] },
        supabase.from('public_vendors').select('id,business_name,slug,logo_url,town,cover_url').eq('id', data.vendor_id).maybeSingle(),
        supabase.rpc('meal_availability', { p_deal: data.id, p_days: 16 }),
        ids.length ? supabase.from('reviews').select('id,product_rating,comment,customer_name,verified,photo_url,created_at,product_id').in('product_id', ids).eq('approved', true).order('created_at', { ascending: false }).limit(12) : { data: [] },
      ])
      if (!alive) return
      setProducts(p.data || [])
      setVendor(v.data || null)
      setAvailability(a.data || [])
      setReviews(r.data || [])
    })
    return () => { alive = false }
  }, [slug, refresh])

  useSeo(deal ? { title: `${deal.title}${vendor ? ` by ${vendor.business_name}` : ''} | ZaMarket`, description: deal.tagline || 'Homemade lunch delivered to your workplace.', image: deal.cover_url } : { title: 'Lunch | ZaMarket' })

  if (deal === undefined) return <Loading />
  if (deal === null) return <div className="ln"><div className="ln-empty"><h2>This lunch plan is not available</h2><p>It may have been paused. <Link to="/lunch">See other lunch plans</Link></p></div></div>
  return <LunchView deal={deal} products={products} vendor={vendor} availability={availability} reviews={reviews} onBooked={() => setRefresh((n) => n + 1)} />
}

export function LunchView({ deal, products, vendor, availability, reviews = [], preview = false, onBooked }) {
  const { role, profile, settings } = useAuth()
  const deliveryIncluded = useDeliveryIncluded()
  const menu = useMemo(() => upcomingMenu({ deal, products, availability, days: 10 }).slice(0, 8), [deal, products, availability])
  // Each dish once, with the weekdays it is cooked.
  const dishList = useMemo(() => {
    const m = new Map()
    for (const day of menu) for (const dish of day.dishes) {
      const short = day.label.split(' ')[0]
      const cur = m.get(dish.id) || { ...dish, days: [] }
      if (!cur.days.includes(short)) cur.days.push(short)
      m.set(dish.id, cur)
    }
    return [...m.values()]
  }, [menu])
  const from = fromPrice(products, deal)
  const [kind, setKind] = useState('week')
  const [picks, setPicks] = useState({})
  const [viewer, setViewer] = useState(null)
  const [booking, setBooking] = useState(false)
  const totals = planTotals(picks, menu)
  const proofs = (deal.proof_images || []).filter(Boolean)
  const rating = reviews.length ? reviews.reduce((t, r) => t + Number(r.product_rating || 0), 0) / reviews.filter((r) => r.product_rating).length : 0
  const affiliate = role === 'reseller' && profile?.partner?.code

  const choose = (date, id, qty) => setPicks((cur) => {
    if (kind === 'trial') return qty > 0 ? { [date]: { [id]: 1 } } : {}
    const day = { ...(cur[date] || {}) }
    if (kind === 'week') { for (const k of Object.keys(day)) delete day[k] }
    if (qty > 0) day[id] = qty; else delete day[id]
    const next = { ...cur, [date]: day }
    if (!Object.keys(day).length) delete next[date]
    return next
  })
  const switchKind = (k) => { setKind(k); setPicks({}) }

  return (
    <div className={`ln ln-page ${preview ? 'is-preview' : ''}`}>
      <section className="ln-hero">
        {deal.cover_url && <img className="ln-hero-img" src={deal.cover_url} alt="" />}
        <div className="ln-hero-shade" />
        <div className="ln-hero-copy">
          {vendor && <span className="ln-eyebrow">{vendor.business_name}{vendor.town ? ` · ${vendor.town}` : ''}</span>}
          <h1>{deal.title}</h1>
          {deal.tagline && <p>{deal.tagline}</p>}
          <ul className="ln-hero-facts">
            {from > 0 && <li><strong>{money(from, { whole: true })}</strong> a lunch</li>}
            <li>Order by <strong>{deal.cutoff_hour}:00</strong> the day before</li>
            <li>Delivered <strong>{(deal.delivery_windows || [])[0]?.split('–')[0]}–{(deal.delivery_windows || []).slice(-1)[0]?.split('–')[1]}</strong></li>
          </ul>
          <div className="ln-hero-cta">
            <a href="#book" className="ln-btn primary" onClick={() => switchKind('trial')}>Try one lunch</a>
            <a href="#book" className="ln-btn ghost" onClick={() => switchKind('week')}>Book my lunches</a>
          </div>
        </div>
      </section>

      <ul className="ln-trust">
        {deal.guarantee && <li><b>Late or not as described?</b><span>Tell us the same day and that lunch is free.</span></li>}
        <li><b>Made fresh to order</b><span>Cooked for the day you booked.</span></li>
        <li><b>Delivered by ZaMarket</b><span>{deliveryIncluded ? 'Delivery is included in the price.' : 'Delivery confirmed when we call you.'}</span></li>
        <li><b>Pay once we call you</b><span>We confirm your order, you pay by mobile money.</span></li>
      </ul>

      <section className="ln-section" id="menu">
        <div className="ln-head"><h2>The menu</h2><p>Every dish, and the days it is cooked. Tap a photo to see it close up.</p></div>
        {dishList.length === 0 ? <p className="ln-muted">No lunch days are open in the next two weeks. Please check back soon.</p> : (
          <div className="ln-dishes">
            {dishList.map((dish) => (
              <div key={dish.id} className="ln-dish">
                <button type="button" className="ln-dish-photo" onClick={() => dish.images?.length && setViewer({ images: dish.images, alt: dish.name })} aria-label={`See ${dish.name} close up`}>
                  {dish.images?.[0] ? <img src={dish.images[0]} alt={dish.name} loading="lazy" /> : <span>Photo coming</span>}
                  {dish.kind === 'tray' && <em>Sharing tray{dish.serves ? ` · serves ${dish.serves}` : ''}</em>}
                </button>
                <div className="ln-dish-body">
                  <strong>{dish.name}</strong>
                  {dish.benefits?.length > 0 && <span className="ln-dish-sides">{dish.benefits.slice(0, 3).join(' · ')}</span>}
                  <div className="ln-dish-foot">
                    <b>{money(dish.price, { whole: true })}</b>
                    <span className="ln-dish-days">{dish.days.join(' · ')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {deal.in_the_box && (
        <section className="ln-section ln-box">
          <div className="ln-head"><h2>In every lunch</h2></div>
          <p>{deal.in_the_box}</p>
        </section>
      )}

      {(deal.about_cook || proofs.length > 0) && (
        <section className="ln-section">
          <div className="ln-head"><h2>Who cooks your lunch</h2></div>
          {deal.about_cook && <p className="ln-story">{deal.about_cook}</p>}
          {proofs.length > 0 && (
            <div className="ln-proof">
              {proofs.map((src, i) => (
                <button type="button" key={`${src}-${i}`} onClick={() => setViewer({ images: proofs, start: i, alt: 'From the kitchen' })} aria-label={`Open photo ${i + 1}`}><img src={src} alt="" loading="lazy" /></button>
              ))}
            </div>
          )}
          {vendor?.slug && !preview && <Link className="ln-link" to={`/${vendor.slug}`}>Visit {vendor.business_name} →</Link>}
        </section>
      )}

      <section className="ln-section">
        <div className="ln-head">
          <h2>What people say</h2>
          {reviews.length > 0 && rating > 0 && <p><strong>{rating.toFixed(1)} out of 5</strong> from {reviews.length} review{reviews.length === 1 ? '' : 's'} by people who ordered</p>}
        </div>
        {reviews.length ? (
          <div className="ln-reviews">
            {reviews.slice(0, 6).map((r) => (
              <figure key={r.id} className="ln-review">
                {r.photo_url && <img src={r.photo_url} alt="" loading="lazy" />}
                {r.product_rating ? <span className="ln-stars" aria-label={`${r.product_rating} out of 5`}>{'★'.repeat(r.product_rating)}{'☆'.repeat(5 - r.product_rating)}</span> : null}
                {r.comment && <blockquote>{r.comment}</blockquote>}
                <figcaption>{r.customer_name?.split(' ')[0] || 'A customer'}{r.verified ? ' · ordered on ZaMarket' : ''}</figcaption>
              </figure>
            ))}
          </div>
        ) : <p className="ln-muted">New on ZaMarket. Reviews appear here from people who have ordered. Start with one lunch and be among the first.</p>}
      </section>

      <section className="ln-section ln-how">
        <div className="ln-head"><h2>How it works</h2></div>
        <ol>
          <li><span>1</span><div><strong>Choose</strong><p>Pick your days and your dish for each day. Or try one lunch first.</p></div></li>
          <li><span>2</span><div><strong>Confirm</strong><p>We call you to confirm and you pay by mobile money. Order by {deal.cutoff_hour}:00 the day before.</p></div></li>
          <li><span>3</span><div><strong>Enjoy</strong><p>Your lunch arrives at your workplace in the time you chose.</p></div></li>
        </ol>
      </section>

      {affiliate && !preview && <LunchAffiliate deal={deal} vendor={vendor} menu={menu} from={from} code={profile.partner.code} />}

      <section className="ln-section ln-book" id="book">
        <div className="ln-head"><h2>Book</h2><p>Three quick steps. Nothing is charged until we call you.</p></div>
        <div className="ln-kinds" role="tablist" aria-label="What would you like">
          {KINDS.map(([k, t, s]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => switchKind(k)}><strong>{t}</strong><span>{s}</span></button>
          ))}
        </div>

        <div className="ln-step"><b>1</b><span>{kind === 'trial' ? 'Pick your day and dish' : kind === 'team' ? 'Pick days, dishes and how many' : 'Pick your days and a dish for each'}</span></div>
        <div className="ln-picker">
          {menu.map((day) => (
            <div key={day.date} className={`ln-pick-day ${picks[day.date] ? 'on' : ''}`}>
              <div className="ln-pick-date">{day.label}</div>
              <div className="ln-pick-dishes">
                {day.dishes.map((dish) => {
                  const q = Number(picks[day.date]?.[dish.id] || 0)
                  const max = dish.remaining == null ? 50 : dish.remaining
                  return (
                    <div key={dish.id} className={`ln-pick ${q ? 'on' : ''} ${dish.soldOut ? 'is-out' : ''}`}>
                      <button type="button" className="ln-pick-main" disabled={dish.soldOut} onClick={() => choose(day.date, dish.id, q ? 0 : 1)} aria-pressed={q > 0}>
                        <span className="ln-pick-tick" aria-hidden>{q ? '✓' : ''}</span>
                        <span className="ln-pick-name">{dish.name}</span>
                        <span className="ln-pick-price">{dish.soldOut ? 'Fully booked' : money(dish.price, { whole: true })}{!dish.soldOut && dish.remaining != null && dish.remaining <= 5 && <small>{dish.remaining} left</small>}</span>
                      </button>
                      {kind === 'team' && q > 0 && (
                        <span className="ln-qty">
                          <button type="button" onClick={() => choose(day.date, dish.id, q - 1)} aria-label="One less">−</button>
                          <b>{q}</b>
                          <button type="button" disabled={q >= max} onClick={() => choose(day.date, dish.id, q + 1)} aria-label="One more">+</button>
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="ln-summary" aria-live="polite">
          <div><span>{totals.lunches} lunch{totals.lunches === 1 ? '' : 'es'} · {totals.days} day{totals.days === 1 ? '' : 's'}</span><strong>{money(totals.total, { whole: true })}</strong></div>
          <button type="button" className="ln-btn primary" disabled={!totals.lunches || preview} onClick={() => setBooking(true)}>Continue</button>
        </div>
      </section>

      <section className="ln-section ln-faq">
        <div className="ln-head"><h2>Questions</h2></div>
        <details><summary>When do I pay?</summary><p>After you book, we call you to confirm. You pay by mobile money for all the lunches you booked, and they are confirmed once paid.</p></details>
        <details><summary>When must I order?</summary><p>By {deal.cutoff_hour}:00 the day before. Lunch is cooked fresh for the day you booked.</p></details>
        <details><summary>Where do you deliver?</summary><p>{deal.delivery_area || 'Workplaces in Lusaka.'} Tell us your building and floor or the reception desk when you book.</p></details>
        {deal.guarantee && <details><summary>What if my lunch is late or wrong?</summary><p>If it arrives after the time you chose, or is not what you ordered, tell us the same day and that lunch is free.</p></details>}
        <details><summary>Can I order for my office?</summary><p>Yes. Choose "For my team", pick how many lunches each day, and we deliver them together.</p></details>
        {settings?.company_whatsapp && <a className="ln-link" href={whatsappLink(settings.company_whatsapp, `Hello ZaMarket, I have a question about ${deal.title}.`)} target="_blank" rel="noreferrer">Ask us on WhatsApp →</a>}
      </section>

      {totals.lunches > 0 && !booking && !preview && (
        <div className="ln-sticky"><div><span>{totals.lunches} lunch{totals.lunches === 1 ? '' : 'es'}</span><strong>{money(totals.total, { whole: true })}</strong></div><button type="button" className="ln-btn primary" onClick={() => setBooking(true)}>Continue</button></div>
      )}
      {booking && <BookSheet deal={deal} kind={kind} picks={picks} menu={menu} totals={totals} onClose={() => setBooking(false)} onDone={() => { setPicks({}); onBooked?.() }} />}
      {viewer && <PhotoViewer images={viewer.images} start={viewer.start || 0} alt={viewer.alt} onClose={() => setViewer(null)} />}
    </div>
  )
}

function LunchAffiliate({ deal, vendor, menu, from, code }) {
  const toast = useToast()
  const [rate, setRate] = useState(null)
  const [photos, setPhotos] = useState(false)
  useEffect(() => { supabase.rpc('meal_deal_affiliate_rate', { p_deal: deal.id }).then(({ data }) => setRate(data)) }, [deal.id])
  const earn = affiliateEarnings(rate, menu)
  const link = `${window.location.origin}/r/${code}/lunch/${deal.slug}`
  const post = lunchPostText({ deal, vendorName: vendor?.business_name, from, link })
  const images = [deal.cover_url, ...(deal.proof_images || []), ...menu.flatMap((d) => d.dishes.map((x) => x.images?.[0]))].filter(Boolean)
  const uniq = [...new Set(images)]
  const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg) } catch { toast('Press and hold to copy', true) } }
  return (
    <section className="ln-section ln-aff">
      <div className="ln-head"><h2>Promote this lunch plan</h2></div>
      {earn ? (
        <div className="ln-earn">
          <div><span>Each lunch delivered</span><strong>{money(earn.perLunch)}</strong></div>
          <div><span>A customer's 5-day week</span><strong>{money(earn.week)}</strong></div>
          <div><span>A month of lunches</span><strong>{money(earn.month)}</strong></div>
        </div>
      ) : null}
      <p className="ln-muted">You earn on every lunch delivered to a customer you bring, every day, including when they book again. Earned daily, paid out with your other earnings.</p>
      <code className="ln-code">{link}</code>
      <div className="ln-aff-actions">
        <button type="button" className="ln-btn ghost" onClick={() => copy(link, 'Link copied')}>Copy link</button>
        <button type="button" className="ln-btn ghost" onClick={() => copy(post, 'Post copied')}>Copy post</button>
        <button type="button" className="ln-btn ghost" onClick={() => setPhotos(true)}>Photos</button>
        <a className="ln-btn primary" href={`https://wa.me/?text=${encodeURIComponent(post)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
      </div>
      {photos && <PhotoSaver p={{ images: uniq }} title={deal.title} onClose={() => setPhotos(false)} />}
    </section>
  )
}

function BookSheet({ deal, kind, picks, menu, totals, onClose, onDone }) {
  const toast = useToast()
  const { attribution } = useCart()
  const [f, setF] = useState({ window: (deal.delivery_windows || [])[1] || (deal.delivery_windows || [])[0] || '', company: '', address: '', area: '', instructions: '', name: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const chosen = menu.filter((d) => picks[d.date]).map((d) => ({ label: d.label, items: d.dishes.filter((x) => picks[d.date]?.[x.id]).map((x) => `${picks[d.date][x.id]} × ${x.name}`) }))

  const send = async (e) => {
    e.preventDefault()
    setBusy(true)
    const a = attribution ? attribution() : {}
    const { data, error } = await supabase.rpc('place_meal_plan', {
      payload: {
        deal_id: deal.id, kind, window: f.window,
        workplace: { company: f.company, address: f.address, area: f.area, instructions: f.instructions },
        customer: { full_name: f.name, phone: f.phone },
        days: planPayloadDays(picks),
        referral_code: a.referral_code, campaign_code: a.campaign_code, invite_code: a.invite_code, store_ref: a.store_ref,
      },
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    setDone(data)
    onDone?.()
  }

  return (
    <div className="ln-sheet" role="dialog" aria-modal="true" aria-label="Book your lunches">
      <div className="ln-sheet-card">
        <button type="button" className="ln-sheet-x" onClick={onClose} aria-label="Close">✕</button>
        {done ? (
          <div className="ln-done">
            <div className="ln-done-tick" aria-hidden>✓</div>
            <h2>Booked. Reference {done.reference}</h2>
            <p>{done.lunches} lunch{done.lunches === 1 ? '' : 'es'} over {done.days} day{done.days === 1 ? '' : 's'}, {money(done.total, { whole: true })} in total.</p>
            <p><strong>What happens next:</strong> we call you on {f.phone} to confirm, and you pay by mobile money. Your lunches are confirmed once paid.</p>
            <button type="button" className="ln-btn primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={send} className="ln-form">
            <h2>{kind === 'trial' ? 'Your trial lunch' : kind === 'team' ? "Your team's lunches" : 'Your lunches'}</h2>
            <ul className="ln-chosen">{chosen.map((c) => <li key={c.label}><b>{c.label}</b><span>{c.items.join(', ')}</span></li>)}</ul>

            <div className="ln-step"><b>2</b><span>When and where</span></div>
            <div className="ln-windows" role="radiogroup" aria-label="Delivery time">
              {(deal.delivery_windows || []).map((w) => <button type="button" key={w} role="radio" aria-checked={f.window === w} className={f.window === w ? 'on' : ''} onClick={() => setF({ ...f, window: w })}>{w}</button>)}
            </div>
            <label><span>Workplace</span><input required value={f.company} onChange={set('company')} placeholder="e.g. Zanaco Head Office" /></label>
            <label><span>Where exactly</span><input required value={f.address} onChange={set('address')} placeholder="Street, building, floor or reception" /></label>
            <label><span>Area</span><input value={f.area} onChange={set('area')} placeholder="e.g. Cairo Road, Longacres" /></label>
            <label><span>Note for the rider (optional)</span><input value={f.instructions} onChange={set('instructions')} placeholder="e.g. Call when at the gate" /></label>

            <div className="ln-step"><b>3</b><span>Your details</span></div>
            <label><span>Your name</span><input required value={f.name} onChange={set('name')} autoComplete="name" /></label>
            <label><span>Phone (we call to confirm)</span><input required type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="0977 123 456" /></label>

            <div className="ln-form-total"><span>{totals.lunches} lunch{totals.lunches === 1 ? '' : 'es'}</span><strong>{money(totals.total, { whole: true })}</strong></div>
            <button className="ln-btn primary big" disabled={busy}>{busy ? 'Booking…' : 'Book my lunch' + (totals.lunches > 1 ? 'es' : '')}</button>
            <p className="ln-fine">Nothing is charged now. We call you to confirm and you pay by mobile money.</p>
          </form>
        )}
      </div>
    </div>
  )
}
