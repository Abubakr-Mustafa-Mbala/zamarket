import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { DEAL_COLS } from '../pages/public/Lunch'
import { loadDealDishes } from '../lib/lunchData'
import { upcomingMenu, workingWeeks, packagePrice, fromPrice, dayLabel } from '../lib/lunch'

// Special offers as round highlights, like on an Instagram page: a ring with
// the food photo. Tap it and the offer opens as a short story (the dishes,
// this week's menu, the plans), with one button to the offer itself.
// Only real, published offers appear; nothing shows when there are none.

const SEEN = 'zm-offers-seen'
const seenSet = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN) || '[]')) } catch { return new Set() } }

export default function OfferHighlights({ vendorId = null, title = 'Special offers' }) {
  const [deals, setDeals] = useState([])
  const [vendors, setVendors] = useState({})
  const [open, setOpen] = useState(null)
  const [seen, setSeen] = useState(seenSet)
  useEffect(() => {
    let q = supabase.from('meal_deals').select(DEAL_COLS).eq('status', 'published').order('created_at', { ascending: false })
    if (vendorId) q = q.eq('vendor_id', vendorId)
    q.then(async ({ data }) => {
      const list = data || []
      const ids = [...new Set(list.map((d) => d.vendor_id))]
      if (ids.length) {
        const { data: v } = await supabase.from('public_vendors').select('id,business_name,slug,logo_url').in('id', ids)
        setVendors(Object.fromEntries((v || []).map((x) => [x.id, x])))
      }
      setDeals(list)
    }, () => {})
  }, [vendorId])
  if (!deals.length) return null
  const view = (d) => {
    setOpen(d)
    const s = new Set(seen); s.add(d.id); setSeen(s)
    try { localStorage.setItem(SEEN, JSON.stringify([...s])) } catch { /* ignore */ }
  }
  return (
    <section className="hl" aria-label={title}>
      <div className="hl-row">
        {deals.map((d) => (
          <button key={d.id} type="button" className={`hl-item ${seen.has(d.id) ? 'seen' : ''}`} onClick={() => view(d)}>
            <span className="hl-ring"><span className="hl-photo">{d.cover_url ? <img src={d.cover_url} alt="" loading="lazy" /> : null}</span></span>
            <b>Weekly lunch</b>
            {!vendorId && vendors[d.vendor_id] && <small>{vendors[d.vendor_id].business_name}</small>}
          </button>
        ))}
      </div>
      {open && <OfferStory deal={open} vendor={vendors[open.vendor_id]} onClose={() => setOpen(null)} />}
    </section>
  )
}

const SLIDE_MS = 5000

function OfferStory({ deal, vendor, onClose }) {
  const [dishes, setDishes] = useState(null)
  const [avail, setAvail] = useState([])
  const [i, setI] = useState(0)
  const [t, setT] = useState(0)
  const paused = useRef(false)
  useEffect(() => {
    Promise.all([loadDealDishes(deal), supabase.rpc('meal_availability', { p_deal: deal.id, p_days: 24 })])
      .then(([p, a]) => { setDishes(p); setAvail(a.data || []) }, () => setDishes([]))
  }, [deal])
  const menu = useMemo(() => upcomingMenu({ deal, products: dishes || [], availability: avail, days: 21 }), [deal, dishes, avail])
  const weeks = useMemo(() => workingWeeks(menu, 2), [menu])
  // The first full week that can still be booked (late in the week, next week).
  const wi = Math.max(0, weeks.findIndex((w) => w.open === 5))
  const week = weeks[wi]
  const days = week ? week.days.filter((d) => d.day).map((d) => ({ label: dayLabel(d.date), dish: d.day.dishes.find((x) => !x.soldOut) || d.day.dishes[0] })) : []
  const plans = week ? [['week', 'Full working week'], ['monthu', 'Monday to Thursday']].map(([id, name]) => ({ id, name, ...packagePrice(weeks, wi, id, menu, deal) })).filter((p) => p.dates.length && p.total > 0) : []
  const lunches = (n) => `${n} lunch${n === 1 ? '' : 'es'}`
  const from = fromPrice(dishes || [], deal)
  const photos = [...new Set([deal.cover_url, ...(dishes || []).map((p) => p.images?.[0])].filter(Boolean))]
  const slides = ['cover', days.length ? 'menu' : null, plans.length || from ? 'plans' : null].filter(Boolean)
  const link = `/lunch/${deal.slug}`

  // Each slide plays for a few seconds; hold to pause, tap the sides to move.
  useEffect(() => {
    if (!dishes) return
    const start = performance.now() - t * SLIDE_MS
    let raf
    const step = (now) => {
      if (paused.current) { raf = requestAnimationFrame(step); return }
      const p = (now - start) / SLIDE_MS
      if (p >= 1) { if (i < slides.length - 1) { setI(i + 1); setT(0) } else setT(1); return }
      setT(p); raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [i, dishes, slides.length])
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [onClose])
  const go = (d) => { const n = i + d; if (n < 0) return; if (n >= slides.length) return onClose(); setI(n); setT(0) }
  const kind = slides[i]

  return (
    <div className="hl-story" role="dialog" aria-label="Weekly lunch offer">
      <div className="hl-bars">{slides.map((s, k) => <span key={s}><i style={{ width: `${k < i ? 100 : k === i ? t * 100 : 0}%` }} /></span>)}</div>
      <div className="hl-top">
        <span>{vendor?.logo_url ? <img src={vendor.logo_url} alt="" /> : null}<b>{vendor?.business_name || 'ZaMarket'}</b><small>Weekly lunch offer</small></span>
        <button type="button" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="hl-stage"
        onPointerDown={() => { paused.current = true }} onPointerUp={() => { paused.current = false }} onPointerLeave={() => { paused.current = false }}>
        {!dishes ? <div className="hl-wait" /> : kind === 'cover' ? (
          <div className="hl-slide hl-cover">
            <div className={`hl-cover-grid n${Math.min(photos.length, 4)}`}>{photos.slice(0, 4).map((src) => <img key={src} src={src} alt="" />)}</div>
            <div className="hl-copy">
              <em>Weekly lunch offer</em>
              <h2>Your lunch, sorted for the week.</h2>
              <p>Homemade lunch delivered to your office or door, on the days you choose.</p>
              {from > 0 && <strong>From {money(from, { whole: true })} a lunch</strong>}
            </div>
          </div>
        ) : kind === 'menu' ? (
          <div className="hl-slide hl-menu">
            <h2>{week.start <= new Date().toISOString().slice(0, 10) ? 'This week’s menu' : 'Next week’s menu'}</h2>
            <ul>{days.map((d) => <li key={d.label}>{d.dish?.images?.[0] ? <img src={d.dish.images[0]} alt="" /> : <span />}<span><b>{d.label}</b>{d.dish?.name}</span></li>)}</ul>
          </div>
        ) : (
          <div className="hl-slide hl-plans">
            <h2>Choose your plan</h2>
            {plans.map((p) => <div key={p.id} className="hl-plan"><span><b>{p.name}</b><small>{lunches(p.dates.length)}</small></span><strong>{money(p.total, { whole: true })}{p.discount > 0 && <s>{money(p.before, { whole: true })}</s>}</strong></div>)}
            <div className="hl-plan"><span><b>Choose my days</b><small>Any days you like</small></span>{from > 0 && <strong><small>From</small> {money(from, { whole: true })}</strong>}</div>
            <p>Order by {deal.cutoff_hour || 18}:00 the day before.</p>
          </div>
        )}
        <button type="button" className="hl-tap left" aria-label="Back" onClick={() => go(-1)} />
        <button type="button" className="hl-tap right" aria-label="Next" onClick={() => go(1)} />
      </div>
      <Link to={link} className="hl-cta" onClick={onClose}>See the offer and order →</Link>
    </div>
  )
}
