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
import { upcomingMenu, planTotals, planPayloadDays, fromPrice, affiliateEarnings, lunchPostText, cleanTiers, workingWeeks, PACKAGES, packageDates, packagePrice, picksFromDates, matchPackage, dateRange, defaultDish } from '../../lib/lunch'
import { loadDealDishes } from '../../lib/lunchData'
import { shareAudience } from '../../components/ShareProduct'
import ShareLunch from '../../components/ShareLunch'
import DishCollage, { collagePhotos } from '../../components/DishCollage'
import { whatsappLink } from '../../lib/vehicle'
import '../../lunch.css'

export const DEAL_COLS = 'id,vendor_id,slug,title,tagline,about_cook,in_the_box,cover_url,proof_images,dishes,delivery_windows,delivery_area,cutoff_hour,guarantee,status,group_discounts,trial_first,day_discounts'
export function useDeliveryIncluded() {
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
      <nav className="crumbs ln-crumbs" aria-label="You are here"><Link to="/">Home</Link><span>Weekly lunch</span></nav>
      <header className="ln-index-head">
        <span className="ln-eyebrow">Lunch at work</span>
        <h1>Homemade lunch, delivered to your office</h1>
        <p>Choose your days once. Fresh homemade lunch arrives every working day you picked.</p>
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
                <em>Order weekly lunch →</em>
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
      // Customer review screenshots: read on their own, so the page still
      // works before the SQL update that adds them.
      supabase.from('meal_deals').select('review_images').eq('id', data.id).maybeSingle()
        .then(({ data: rv }) => { if (alive && rv?.review_images?.length) setDeal((x) => (x ? { ...x, review_images: rv.review_images } : x)) }, () => {})
      const ids = (data.dishes || []).map((d) => d.product_id)
      const [p, v, a, r] = await Promise.all([
        loadDealDishes(data).then((list) => ({ data: list })),
        supabase.from('public_vendors').select('id,business_name,slug,logo_url,town,cover_url').eq('id', data.vendor_id).maybeSingle(),
        supabase.rpc('meal_availability', { p_deal: data.id, p_days: 24 }),
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
  const menu = useMemo(() => upcomingMenu({ deal, products, availability, days: 21 }), [deal, products, availability])
  const allDishes = useMemo(() => [...new Map(menu.flatMap((d) => d.dishes).map((x) => [x.id, x])).values()], [menu])
  const from = fromPrice(products, deal)
  const [order, setOrder] = useState(null)
  const [viewer, setViewer] = useState(null)
  const proofs = (deal.proof_images || []).filter(Boolean)
  const said = (deal.review_images || []).filter(Boolean)
  const owner = ['founder', 'ops'].includes(role) || (role === 'vendor' && profile?.partner?.id === deal.vendor_id)
  const rated = reviews.filter((r) => r.product_rating)
  const rating = rated.length ? rated.reduce((t, r) => t + Number(r.product_rating || 0), 0) / rated.length : 0
  const affiliate = role === 'reseller' && profile?.partner?.code
  const windows = deal.delivery_windows || []
  const link = `${window.location.origin}/lunch/${deal.slug}`

  return (
    <div className={`ln ln-page ${preview ? 'is-preview' : ''}`}>
      {!preview && (
        <nav className="crumbs ln-crumbs" aria-label="You are here">
          <Link to="/">Home</Link>
          {vendor?.slug && <Link to={`/${vendor.slug}`}>{vendor.business_name}</Link>}
          <span>Weekly lunch</span>
        </nav>
      )}
      {owner && !preview && (
        <div className="ln-owner">
          <span>{role === 'vendor' ? 'This is your lunch offer.' : 'Seller\u2019s lunch offer.'} Change the dishes, photos, words or days any time.</span>
          <Link className="ln-btn primary" to={role === 'vendor' ? '/vendor/lunch' : '/admin/lunch'}>Edit lunch offer</Link>
        </div>
      )}
      {affiliate && !preview && <a className="ln-owner ln-owner-aff" href="#promote"><span>You can earn on this offer.</span><b>Promote it ↓</b></a>}
      <section className={`ln-hero ${collagePhotos(allDishes).length >= 2 ? 'has-collage' : ''}`}>
        {deal.cover_url && <img className="ln-hero-img" src={deal.cover_url} alt="" />}
        {collagePhotos(allDishes).length >= 2 && <DishCollage className="ln-hero-collage" cover={deal.cover_url} dishes={allDishes} />}
        <div className="ln-hero-shade" />
        <div className="ln-hero-copy">
          <span className="ln-eyebrow">{vendor ? `${vendor.business_name} · ` : ''}Weekly lunch</span>
          <h1>Your lunch is sorted for the week.</h1>
          <p>{deal.tagline || 'Choose your weekly lunch package and enjoy freshly prepared homemade meals delivered to your workplace or preferred delivery address.'}</p>
          <ul className="ln-hero-facts">
            {from > 0 && <li>From <strong>{money(from, { whole: true })}</strong> a lunch</li>}
            <li>Order by <strong>{deal.cutoff_hour}:00</strong> the day before</li>
            {windows.length > 0 && <li>Delivered <strong>{windows[0].split('–')[0]}–{windows[windows.length - 1].split('–')[1]}</strong></li>}
          </ul>
          <div className="ln-hero-cta">
            <a href="#order" className="ln-btn primary">Order weekly lunch</a>
            {!preview && !affiliate && <ShareLunch deal={deal} vendorName={vendor?.business_name} menu={menu} from={from} link={link} audience={shareAudience(role)} />}
          </div>
        </div>
      </section>

      <WeeklyOrder deal={deal} menu={menu} preview={preview} deliveryIncluded={deliveryIncluded} onOrder={(o) => setOrder(o)} onPhoto={setViewer} />

      <ul className="ln-trust">
        <li><b>Homemade, fresh each day</b><span>Cooked for the day you booked, never the day before.</span></li>
        <li><b>Delivered to you</b><span>{deliveryIncluded ? 'To your office or doorstep. Delivery is included.' : 'To your office or doorstep. We confirm delivery on the call.'}</span></li>
        <li><b>One order for the week</b><span>Pick your days once. No need to order every morning.</span></li>
        {deal.guarantee && <li><b>Late or not as described?</b><span>Tell us the same day and that lunch is free.</span></li>}
      </ul>

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
            <div className={`ln-proof n${Math.min(proofs.length, 4)}`}>
              {proofs.map((src, i) => (
                <button type="button" key={`${src}-${i}`} onClick={() => setViewer({ images: proofs, start: i, alt: 'From the kitchen' })} aria-label={`Open photo ${i + 1}`}><img src={src} alt="" loading="lazy" /></button>
              ))}
            </div>
          )}
          {vendor?.slug && !preview && <Link className="ln-link" to={`/${vendor.slug}`}>Visit {vendor.business_name} →</Link>}
        </section>
      )}

      {said.length > 0 && (
        <section className="ln-section">
          <div className="ln-head"><h2>What customers said</h2><p>Real messages from people who ordered.</p></div>
          <div className="ln-said">
            {said.map((src, i) => (
              <button type="button" key={`${src}-${i}`} onClick={() => setViewer({ images: said, start: i, alt: 'A message from a customer' })} aria-label={`Open message ${i + 1}`}><img src={src} alt="" loading="lazy" /></button>
            ))}
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="ln-section">
          <div className="ln-head">
            <h2>What people say</h2>
            {rating > 0 && <p><strong>{rating.toFixed(1)} out of 5</strong> from {reviews.length} review{reviews.length === 1 ? '' : 's'} by people who ordered</p>}
          </div>
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
        </section>
      )}

      <section className="ln-section ln-how">
        <div className="ln-head"><h2>How it works</h2></div>
        <ol>
          <li><span>1</span><div><strong>Choose your days</strong><p>The full week, Monday to Thursday, two weeks, or the days you want.</p></div></li>
          <li><span>2</span><div><strong>Confirm and pay</strong><p>We call you to confirm, then you pay by mobile money. Your lunches are confirmed once paid.</p></div></li>
          <li><span>3</span><div><strong>Enjoy lunch</strong><p>Fresh lunch arrives at your office or door each day you chose.</p></div></li>
        </ol>
      </section>

      {affiliate && !preview && <LunchAffiliate deal={deal} vendor={vendor} menu={menu} from={from} code={profile.partner.code} />}

      <section className="ln-section ln-faq">
        <div className="ln-head"><h2>Questions</h2></div>
        <details><summary>Can I remove a day?</summary><p>Yes. Tap any day to take it out of your order, or add it back. The total changes straight away.</p></details>
        <details><summary>When do I pay?</summary><p>After you order, we call you to confirm. You pay by mobile money, and your lunches are confirmed once the payment is received.{deal.trial_first ? ' Ordering for the first time? You can choose to pay for your first lunch, and the other days after you have tasted it.' : ''}</p></details>
        <details><summary>When must I order?</summary><p>By {deal.cutoff_hour}:00 the day before. Lunch is cooked fresh for each day you booked.</p></details>
        <details><summary>Where do you deliver?</summary><p>{deal.delivery_area || 'Offices and homes in Lusaka.'} Tell us the building, floor or a landmark when you order.</p></details>
        {deal.guarantee && <details><summary>What if my lunch is late or wrong?</summary><p>If it arrives after the time you chose, or is not what you ordered, tell us the same day and that lunch is free.</p></details>}
        <details><summary>Can I order for my office?</summary><p>Yes. Set how many lunches each day and they come together.{cleanTiers(deal.group_discounts).length ? ' Bigger orders get the team discount shown above.' : ''}</p></details>
        {settings?.company_whatsapp && <a className="ln-link" href={whatsappLink(settings.company_whatsapp, `Hello ZaMarket, I have a question about ${deal.title}.`)} target="_blank" rel="noreferrer">Ask us on WhatsApp →</a>}
      </section>

      {order && <BookSheet deal={deal} picks={order.picks} menu={menu} totals={order.totals} deliveryIncluded={deliveryIncluded} onClose={() => setOrder(null)} onDone={() => onBooked?.()} />}
      {viewer && <PhotoViewer images={viewer.images} start={viewer.start || 0} alt={viewer.alt} onClose={() => setViewer(null)} />}
    </div>
  )
}

// The order card: package, week, days, lunches a day, the week's menu and
// the total. Every price is the dish's own price for that day.
export function WeeklyOrder({ deal, menu, preview = false, deliveryIncluded = false, onOrder, onPhoto, compact = false }) {
  const weeks = useMemo(() => workingWeeks(menu, 3), [menu])
  const firstFull = Math.max(0, weeks.findIndex((w) => w.open === 5))
  const [w, setW] = useState(firstFull)
  const [pkg, setPkg] = useState(() => {
    try { const q = new URLSearchParams(window.location.search).get('plan'); return PACKAGES.some((p) => p.id === q) ? q : 'week' } catch { return 'week' }
  })
  const [custom, setCustom] = useState(null)
  const [choice, setChoice] = useState({})
  const [perDay, setPerDay] = useState(1)
  useEffect(() => { setW(firstFull) }, [firstFull])
  // Arriving from the shop's lunch board (…#order): bring the order card into view.
  useEffect(() => {
    if (weeks.length && window.location.hash === '#order') document.getElementById('order')?.scrollIntoView({ block: 'start' })
  }, [weeks.length])

  const dates = pkg === 'custom' ? (custom || packageDates(weeks, w, 'week')) : packageDates(weeks, w, pkg)
  const picks = picksFromDates(dates, menu, choice, perDay)
  const totals = planTotals(picks, menu, deal.group_discounts, deal.day_discounts)
  const shownWeeks = pkg === 'two' ? weeks.slice(w, w + 2) : weeks.slice(w, w + 1)
  const today = new Date().toISOString().slice(0, 10)
  const weekName = (wk, i) => (wk.start <= today ? 'This week' : i === 0 || (weeks[0].start <= today && i === 1) ? 'Next week' : `Week of ${wk.days[0].label}`)

  const choosePkg = (id) => { setPkg(id); setCustom(id === 'custom' ? packageDates(weeks, w, 'week') : null) }
  const chooseWeek = (i) => { setW(i); if (pkg === 'custom') setCustom(packageDates(weeks, i, 'week')) }
  const toggle = (date) => {
    const next = dates.includes(date) ? dates.filter((d) => d !== date) : [...dates, date].sort()
    const m = matchPackage(weeks, w, next)
    setPkg(m); setCustom(m === 'custom' ? next : null)
  }
  const maxPerDay = Math.min(50, ...dates.map((d) => {
    const day = menu.find((x) => x.date === d)
    const dish = day?.dishes.find((x) => x.id === choice[d]) || defaultDish(day)
    return dish?.remaining == null ? 50 : dish.remaining
  }))

  if (!weeks.length) return <section className="ln-section ln-order" id="order"><p className="ln-muted">No lunch days are open in the next few weeks. Please check back soon.</p></section>

  return (
    <section className={`ln-section ln-order ${compact ? 'is-compact' : ''}`} id="order">
      <div className="ln-head"><h2>Choose your lunch package</h2><p>Your days, one order. Tap a day to remove it or add it back.</p></div>

      {weeks.length > 1 && (
        <div className="ln-weeks" role="tablist" aria-label="Which week">
          {weeks.map((wk, i) => (
            <button key={wk.start} type="button" role="tab" aria-selected={w === i} className={w === i ? 'on' : ''} onClick={() => chooseWeek(i)}>
              <strong>{weekName(wk, i)}</strong><span>{dateRange(wk.days.filter((d) => d.open).map((d) => d.date))}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ln-packages" role="radiogroup" aria-label="Package">
        {PACKAGES.map((p) => {
          const price = p.id === 'custom' ? null : packagePrice(weeks, w, p.id, menu, deal)
          const disabled = p.id === 'two' ? !weeks[w + 1] : p.id !== 'custom' && !price?.dates.length
          if (p.id === 'two' && !weeks[w + 1]) return null
          return (
            <button key={p.id} type="button" role="radio" aria-checked={pkg === p.id} disabled={disabled} className={`ln-package ${pkg === p.id ? 'on' : ''}`} onClick={() => choosePkg(p.id)}>
              <span className="ln-radio" aria-hidden />
              <span className="ln-package-text"><strong>{p.title}</strong><small>{p.id === 'custom' ? p.sub : `${p.sub} · ${price.dates.length} lunch${price.dates.length === 1 ? '' : 'es'}`}</small></span>
              {price && price.total > 0 && <span className="ln-plan-price">{price.discount > 0 && <em className="ln-best">Save {money(price.discount, { whole: true })}</em>}<b>{money(price.total, { whole: true })}</b>{price.discount > 0 && <s>{money(price.before, { whole: true })}</s>}</span>}
            </button>
          )
        })}
      </div>

      {shownWeeks.map((wk) => (
        <div key={wk.start} className="ln-weekdays" role="group" aria-label={`Days, ${dateRange(wk.days.map((d) => d.date))}`}>
          {wk.days.map((d) => {
            const on = dates.includes(d.date)
            const dish = d.day ? (d.day.dishes.find((x) => x.id === choice[d.date]) || defaultDish(d.day)) : null
            const [name, num] = d.label.split(' ')
            return (
              <button key={d.date} type="button" className={on ? 'on' : ''} disabled={!d.open} aria-pressed={on} onClick={() => toggle(d.date)}>
                <small>{name}</small><b>{num}</b>
                <span>{!d.open ? (d.day ? 'Full' : 'Closed') : on ? '✓' : 'Add'}</span>
                {dish && d.open && <em>{dish.name}</em>}
              </button>
            )
          })}
        </div>
      ))}

      <div className="ln-perday">
        <div><strong>Lunches each day</strong><small>Ordering for colleagues too? Add more.</small></div>
        <span className="ln-qty">
          <button type="button" disabled={perDay <= 1} onClick={() => setPerDay((n) => Math.max(1, n - 1))} aria-label="One less">−</button>
          <b>{perDay}</b>
          <button type="button" disabled={perDay >= maxPerDay} onClick={() => setPerDay((n) => Math.min(maxPerDay, n + 1))} aria-label="One more">+</button>
        </span>
      </div>
      <TeamDiscounts tiers={deal.group_discounts} />

      <details className="ln-menu-week">
        <summary><span>See this week&rsquo;s menu</span><em>{shownWeeks.reduce((n, wk) => n + wk.open, 0)} days</em></summary>
        <ul>
          {shownWeeks.flatMap((wk) => wk.days).filter((d) => d.day).map((d) => {
            const on = dates.includes(d.date)
            const sel = d.day.dishes.find((x) => x.id === choice[d.date]) || defaultDish(d.day)
            return (
              <li key={d.date} className={on ? '' : 'off'}>
                <div className="ln-menu-day">{d.day.long}{!on && <small>Not in your order</small>}</div>
                {d.day.dishes.map((x) => (
                  <label key={x.id} className={`ln-menu-dish ${sel?.id === x.id ? 'on' : ''} ${x.soldOut ? 'is-out' : ''}`}>
                    {d.day.dishes.length > 1 && <input type="radio" name={`dish-${d.date}`} checked={sel?.id === x.id} disabled={x.soldOut} onChange={() => setChoice((c) => ({ ...c, [d.date]: x.id }))} />}
                    <button type="button" className="ln-menu-photo" onClick={() => x.images?.length && onPhoto?.({ images: x.images, alt: x.name })} aria-label={`See ${x.name} close up`}>
                      {x.images?.[0] ? <img src={x.images[0]} alt={x.name} loading="lazy" /> : <span>Photo coming</span>}
                    </button>
                    <span className="ln-menu-text">
                      <strong>{x.name}</strong>
                      {x.description && <span>{x.description}</span>}
                      <b>{x.soldOut ? 'Fully booked' : money(x.price, { whole: true })}</b>
                    </span>
                  </label>
                ))}
              </li>
            )
          })}
        </ul>
      </details>

      <div className="ln-order-total" aria-live="polite">
        <div>
          <span>{totals.lunches ? `${totals.lunches} lunch${totals.lunches === 1 ? '' : 'es'} · ${dateRange(Object.keys(picks))}` : 'Tap the days you want lunch'}</span>
          <strong>{money(totals.total, { whole: totals.discount === 0 })}</strong>
          <small>{totals.discount > 0 ? `You save ${money(totals.discount)} · ` : ''}{deliveryIncluded ? 'Delivery included' : 'Delivery confirmed on the call'}</small>
        </div>
        <button type="button" className="ln-btn primary big" disabled={!totals.lunches || preview} onClick={() => onOrder?.({ picks, totals })}>Order weekly lunch</button>
      </div>
    </section>
  )
}

function LunchAffiliate({ deal, vendor, menu, from, code }) {
  const toast = useToast()
  const [rate, setRate] = useState(null)
  const [photos, setPhotos] = useState(false)
  useEffect(() => { supabase.rpc('meal_deal_affiliate_rate', { p_deal: deal.id }).then(({ data }) => setRate(data)) }, [deal.id])
  // Arriving from "Promote it" on the affiliate's products page.
  useEffect(() => { if (window.location.hash === '#promote') setTimeout(() => document.getElementById('promote')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350) }, [])
  const earn = affiliateEarnings(rate, menu)
  const link = `${window.location.origin}/r/${code}/lunch/${deal.slug}`
  const post = lunchPostText({ deal, vendorName: vendor?.business_name, from, link })
  const images = [deal.cover_url, ...(deal.proof_images || []), ...menu.flatMap((d) => d.dishes.map((x) => x.images?.[0]))].filter(Boolean)
  const uniq = [...new Set(images)]
  const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg) } catch { toast('Press and hold to copy', true) } }
  return (
    <section className="ln-section ln-aff" id="promote">
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
      <ShareLunch deal={deal} vendorName={vendor?.business_name} menu={menu} from={from} link={link} audience="affiliate" className="ln-btn primary big" label="Make the offer poster" />
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

// The team discount levels, in plain words. Nothing shows when there are none.
export function TeamDiscounts({ tiers }) {
  const list = cleanTiers(tiers)
  if (!list.length) return null
  return (
    <div className="ln-tiers">
      <b>Ordering for your team?</b>
      <span>{list.map((t) => `${t.min}+ lunches in one delivery: ${t.pct}% off`).join(' · ')}</span>
    </div>
  )
}

const METHODS = [['mtn_money', 'MTN MoMo'], ['airtel_money', 'Airtel Money'], ['zamtel_kwacha', 'Zamtel Kwacha']]
const newRef = () => { try { return crypto.randomUUID() } catch { return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` } }

// Checkout: what you ordered, where it goes, how you pay, who you are, and
// the full summary before you confirm. Sent once even if tapped twice.
export function BookSheet({ deal, picks, menu, totals, deliveryIncluded = false, onClose, onDone }) {
  const toast = useToast()
  const { attribution } = useCart()
  const [ref] = useState(newRef)
  const [f, setF] = useState({ place: 'office', window: (deal.delivery_windows || [])[1] || (deal.delivery_windows || [])[0] || '', company: '', address: '', area: '', landmark: '', instructions: '', name: '', phone: '', request: '', method: '', payMode: 'upfront' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const chosen = menu.filter((d) => picks[d.date]).map((d) => ({ date: d.date, label: d.label, items: d.dishes.filter((x) => picks[d.date]?.[x.id]).map((x) => ({ name: x.name, q: picks[d.date][x.id], price: x.price })) }))
  const kind = totals.lunches === 1 ? 'trial' : Object.values(picks).some((d) => Object.values(d).some((q) => q > 1)) ? 'team' : 'week'
  const canTryFirst = deal.trial_first && chosen.length > 1
  const first = chosen[0] ? Number(totals.byDate?.[chosen[0].date] || 0) : 0
  const payNow = f.payMode === 'after_first' && canTryFirst ? first : totals.total
  const methodName = METHODS.find(([k]) => k === f.method)?.[1] || 'mobile money'

  const send = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!f.method) return toast('Choose how you will pay', true)
    setBusy(true)
    const a = attribution ? attribution() : {}
    const { data, error } = await supabase.rpc('place_meal_plan', {
      payload: {
        deal_id: deal.id, kind, window: f.window, client_ref: ref,
        pay_mode: canTryFirst ? f.payMode : 'upfront', payment_method: f.method,
        workplace: { place: f.place, company: f.place === 'office' ? f.company : '', address: f.address, area: f.area, landmark: f.landmark, instructions: f.instructions },
        customer: { full_name: f.name, phone: f.phone },
        days: planPayloadDays(picks), request: f.request.trim() || null,
        referral_code: a.referral_code, campaign_code: a.campaign_code, invite_code: a.invite_code, store_ref: a.store_ref,
      },
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    setDone(data)
    onDone?.()
  }

  return (
    <div className="ln-sheet" role="dialog" aria-modal="true" aria-label="Order your weekly lunch">
      <div className="ln-sheet-card">
        <button type="button" className="ln-sheet-x" onClick={onClose} aria-label="Close">✕</button>
        {done ? (
          <div className="ln-done">
            <div className="ln-done-tick" aria-hidden>✓</div>
            <h2>Order received. Reference {done.reference}</h2>
            <p>{done.lunches} lunch{done.lunches === 1 ? '' : 'es'} over {done.days} day{done.days === 1 ? '' : 's'}, {money(done.total)} in total{Number(done.saved) > 0 ? `, ${money(done.saved)} saved` : ''}.</p>
            <p><strong>What happens next:</strong> we call you on {f.phone} to confirm. Then you pay {money(done.pay_mode === 'after_first' ? done.first_total : done.total)} by {methodName}{done.pay_mode === 'after_first' ? ' for your first lunch. After you have tasted it, we ask if you want the other days; they go ahead once paid' : ''}. Your lunches are confirmed once ZaMarket receives the payment.</p>
            {f.request.trim() && <p>Your request is with the kitchen. We tell you on the call if it can be done.</p>}
            <button type="button" className="ln-btn primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={send} className="ln-form">
            <h2>Your weekly lunch</h2>
            <ul className="ln-chosen">{chosen.map((c) => <li key={c.date}><b>{c.label}</b><span>{c.items.map((x) => `${x.q} × ${x.name}`).join(', ')}</span></li>)}</ul>
            <button type="button" className="ln-link ln-edit" onClick={onClose}>Change days</button>

            <div className="ln-step"><b>1</b><span>Where we deliver</span></div>
            <div className="ln-seg" role="radiogroup" aria-label="Deliver to">
              <button type="button" role="radio" aria-checked={f.place === 'office'} className={f.place === 'office' ? 'on' : ''} onClick={() => setF({ ...f, place: 'office' })}>My office</button>
              <button type="button" role="radio" aria-checked={f.place === 'home'} className={f.place === 'home' ? 'on' : ''} onClick={() => setF({ ...f, place: 'home' })}>My home</button>
            </div>
            {f.place === 'office' && <label><span>Workplace</span><input required value={f.company} onChange={set('company')} placeholder="e.g. Zanaco Head Office" /></label>}
            <label><span>{f.place === 'office' ? 'Building, floor or reception' : 'House number and street'}</span><input required value={f.address} onChange={set('address')} placeholder={f.place === 'office' ? 'e.g. 3rd floor, ask at reception' : 'e.g. Plot 12, Lukasu Road'} /></label>
            <label><span>Area</span><input value={f.area} onChange={set('area')} placeholder="e.g. Cairo Road, Longacres, Ibex Hill" /></label>
            <label><span>Nearby landmark</span><input value={f.landmark} onChange={set('landmark')} maxLength={160} placeholder="e.g. Opposite the Total filling station" /></label>
            <label><span>Note for the rider (optional)</span><input value={f.instructions} onChange={set('instructions')} placeholder="e.g. Call when at the gate" /></label>
            <span className="ln-label">Delivery time</span>
            <div className="ln-windows" role="radiogroup" aria-label="Delivery time">
              {(deal.delivery_windows || []).map((w) => <button type="button" key={w} role="radio" aria-checked={f.window === w} className={f.window === w ? 'on' : ''} onClick={() => setF({ ...f, window: w })}>{w}</button>)}
            </div>

            <div className="ln-step"><b>2</b><span>How you pay</span></div>
            <div className="ln-seg three" role="radiogroup" aria-label="Payment method">
              {METHODS.map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={f.method === k} className={f.method === k ? 'on' : ''} onClick={() => setF({ ...f, method: k })}>{l}</button>)}
            </div>
            {canTryFirst && (
              <div className="ln-paymode" role="radiogroup" aria-label="When you pay">
                <label className={f.payMode === 'upfront' ? 'on' : ''}><input type="radio" name="paymode" checked={f.payMode === 'upfront'} onChange={() => setF({ ...f, payMode: 'upfront' })} /><span><strong>Pay for the whole order</strong><small>{money(totals.total)} once we confirm</small></span></label>
                <label className={f.payMode === 'after_first' ? 'on' : ''}><input type="radio" name="paymode" checked={f.payMode === 'after_first'} onChange={() => setF({ ...f, payMode: 'after_first' })} /><span><strong>First order? Taste it first</strong><small>Pay {money(first)} for your first lunch. The other days go ahead once you pay for them after tasting it.</small></span></label>
              </div>
            )}

            <div className="ln-step"><b>3</b><span>Your details</span></div>
            <label><span>Your name</span><input required value={f.name} onChange={set('name')} autoComplete="name" /></label>
            <label><span>Phone (we call to confirm)</span><input required type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="0977 123 456" /></label>
            <label><span>Any request? (optional)</span><textarea rows={2} maxLength={300} value={f.request} onChange={set('request')} placeholder="e.g. No pepper, extra rice, one vegetarian if possible" /><small className="ln-hint">The kitchen sees it. We confirm with you if it can be done.</small></label>

            <div className="ln-summary-box">
              <div><span>{totals.lunches} lunch{totals.lunches === 1 ? '' : 'es'} · {chosen.length} day{chosen.length === 1 ? '' : 's'}</span><b>{money(totals.subtotal)}</b></div>
              {totals.discount > 0 && <div className="save"><span>Discount</span><b>−{money(totals.discount)}</b></div>}
              <div><span>Delivery</span><b>{deliveryIncluded ? 'Included' : 'Confirmed on the call'}</b></div>
              <div className="total"><span>Total</span><strong>{money(totals.total)}</strong></div>
              {payNow !== totals.total && <div><span>To pay first</span><b>{money(payNow)}</b></div>}
            </div>
            <button className="ln-btn primary big" disabled={busy}>{busy ? 'Sending…' : 'Confirm order'}</button>
            <p className="ln-fine">Nothing is charged on this page. We call you to confirm, then you pay by {methodName}. Your lunches are confirmed once ZaMarket receives the payment.</p>
          </form>
        )}
      </div>
    </div>
  )
}
