import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { upcomingMenu, planTotals, fromPrice, lunchShareProduct, groupPct } from '../lib/lunch'
import { BookSheet, TeamDiscounts } from '../pages/public/Lunch'
import ShareProduct from './ShareProduct'
import PhotoViewer from './PhotoViewer'
import '../lunch.css'

const COLS = 'id,vendor_id,slug,title,tagline,about_cook,in_the_box,cover_url,proof_images,dishes,delivery_windows,delivery_area,cutoff_hour,guarantee,status,group_discounts'

// The lunch section of a seller's shop, laid out like the showroom: a photo
// banner, the dishes as cards, then the days. Tap the days you want, choose
// a dish (and how many) for each, and the total updates as you go. Booking
// goes to the seller's kitchen list and to ZaMarket at the same time.
export default function LunchShop({ vendorId, vendor }) {
  const [deals, setDeals] = useState([])
  useEffect(() => {
    if (!vendorId) return
    supabase.from('meal_deals').select(COLS).eq('status', 'published').eq('vendor_id', vendorId).order('created_at', { ascending: false })
      .then(({ data }) => setDeals(data || []), () => {})
  }, [vendorId])
  if (!deals.length) return null
  return <>{deals.map((d) => <LunchDealShop key={d.id} deal={d} vendor={vendor} />)}</>
}

function LunchDealShop({ deal, vendor }) {
  const [products, setProducts] = useState([])
  const [availability, setAvailability] = useState([])
  const [picks, setPicks] = useState({})
  const [booking, setBooking] = useState(false)
  const [viewer, setViewer] = useState(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const ids = (deal.dishes || []).map((d) => d.product_id)
    if (!ids.length) return
    Promise.all([
      supabase.from('public_products').select('*').in('id', ids),
      supabase.rpc('meal_availability', { p_deal: deal.id, p_days: 16 }),
    ]).then(([p, a]) => { setProducts(p.data || []); setAvailability(a.data || []) }, () => {})
  }, [deal.id, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const menu = useMemo(() => upcomingMenu({ deal, products, availability, days: 10 }).slice(0, 8), [deal, products, availability])
  const dishes = useMemo(() => {
    const m = new Map()
    for (const day of menu) for (const x of day.dishes) {
      const cur = m.get(x.id) || { ...x, days: [] }
      const d = day.label.split(' ')[0]
      if (!cur.days.includes(d)) cur.days.push(d)
      m.set(x.id, cur)
    }
    return [...m.values()]
  }, [menu])
  const totals = planTotals(picks, menu, deal.group_discounts)
  const from = fromPrice(products, deal)
  const firstOpen = (day) => day.dishes.find((x) => !x.soldOut)

  const toggleDay = (day) => setPicks((cur) => {
    const next = { ...cur }
    if (next[day.date]) delete next[day.date]
    else { const x = firstOpen(day); if (x) next[day.date] = { [x.id]: 1 } }
    return next
  })
  const setDish = (day, id) => setPicks((cur) => {
    const q = Object.values(cur[day.date] || {})[0] || 1
    return { ...cur, [day.date]: { [id]: q } }
  })
  const setQty = (day, q) => setPicks((cur) => {
    const [id] = Object.keys(cur[day.date] || {})
    if (!id) return cur
    if (q < 1) { const next = { ...cur }; delete next[day.date]; return next }
    return { ...cur, [day.date]: { [id]: q } }
  })
  // "The whole week": the next five open days, a dish each.
  const wholeWeek = () => {
    const next = {}
    for (const day of menu.slice(0, 5)) { const x = firstOpen(day); if (x) next[day.date] = { [x.id]: 1 } }
    setPicks(next)
  }
  const chosenDays = menu.filter((d) => picks[d.date])
  const kind = totals.lunches === 1 ? 'trial' : Object.values(picks).some((d) => Object.values(d).some((q) => q > 1)) ? 'team' : 'week'
  const link = `${window.location.origin}/lunch/${deal.slug}`
  const shareProduct = lunchShareProduct({ deal, vendorName: vendor?.business_name, dishes, from, link })
  const windows = deal.delivery_windows || []

  return (
    <section className="ln ln-shop" id="lunch" aria-label={deal.title}>
      <div className="ln-shop-banner">
        {deal.cover_url && <img src={deal.cover_url} alt="" loading="lazy" />}
        <div className="ln-shop-banner-copy">
          <span className="ln-eyebrow">Lunch at work</span>
          <h2>{deal.title}</h2>
          {deal.tagline && <p>{deal.tagline}</p>}
          <div className="ln-shop-chips">
            {from > 0 && <span>From {money(from, { whole: true })}</span>}
            <span>Order by {deal.cutoff_hour}:00 the day before</span>
            {windows.length > 0 && <span>Delivered {windows[0].split('–')[0]}–{windows[windows.length - 1].split('–')[1]}</span>}
            {deal.guarantee && <span>Late or wrong? That lunch is free</span>}
          </div>
        </div>
      </div>

      {dishes.length > 0 && (
        <div className="ln-shop-dishes">
          {dishes.map((x) => (
            <article key={x.id} className="ln-shop-dish">
              <button type="button" className="ln-shop-photo" onClick={() => x.images?.length && setViewer({ images: x.images, alt: x.name })} aria-label={`See ${x.name} close up`}>
                {x.images?.[0] ? <img src={x.images[0]} alt={x.name} loading="lazy" /> : <span>Photo coming</span>}
                {x.kind === 'tray' && <em>Sharing tray{x.serves ? ` · serves ${x.serves}` : ''}</em>}
              </button>
              <div className="ln-shop-dish-body">
                <strong>{x.name}</strong>
                <b>{money(x.price, { whole: true })}</b>
                <span>{x.days.join(' · ')}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {menu.length === 0 ? <p className="ln-muted">No lunch days are open in the next two weeks. Please check back soon.</p> : (
        <div className="ln-shop-order">
          <div className="ln-shop-order-head">
            <h3>Choose your days</h3>
            <div>
              <button type="button" className="ln-mini" onClick={wholeWeek}>Whole week</button>
              {totals.lunches > 0 && <button type="button" className="ln-mini" onClick={() => setPicks({})}>Clear</button>}
            </div>
          </div>
          <div className="ln-shop-days" role="group" aria-label="Lunch days">
            {menu.map((day) => {
              const on = !!picks[day.date]
              const open = !!firstOpen(day)
              const [d, n] = day.label.split(' ')
              return (
                <button type="button" key={day.date} className={on ? 'on' : ''} disabled={!open} aria-pressed={on} onClick={() => toggleDay(day)}>
                  <small>{d}</small><b>{n}</b><span>{open ? (on ? '✓' : '+') : 'Full'}</span>
                </button>
              )
            })}
          </div>

          {chosenDays.length > 0 && (
            <ul className="ln-shop-lines">
              {chosenDays.map((day) => {
                const [id] = Object.keys(picks[day.date])
                const q = Number(picks[day.date][id] || 1)
                const dish = day.dishes.find((x) => x.id === id)
                const max = dish?.remaining == null ? 50 : dish.remaining
                return (
                  <li key={day.date}>
                    <span className="ln-shop-line-day">{day.label}</span>
                    {day.dishes.length > 1
                      ? <select value={id} onChange={(e) => setDish(day, e.target.value)} aria-label={`Dish for ${day.long}`}>
                          {day.dishes.map((x) => <option key={x.id} value={x.id} disabled={x.soldOut}>{x.name} · {money(x.price, { whole: true })}{x.soldOut ? ' (full)' : ''}</option>)}
                        </select>
                      : <span className="ln-shop-line-dish">{dish?.name}</span>}
                    <span className="ln-qty">
                      <button type="button" onClick={() => setQty(day, q - 1)} aria-label={q === 1 ? 'Remove this day' : 'One less'}>{q === 1 ? '✕' : '−'}</button>
                      <b>{q}</b>
                      <button type="button" disabled={q >= max} onClick={() => setQty(day, q + 1)} aria-label="One more">+</button>
                    </span>
                    <b className="ln-shop-line-total">{money(Number(dish?.price || 0) * q, { whole: true })}{groupPct(deal.group_discounts, q) > 0 && <small>−{groupPct(deal.group_discounts, q)}%</small>}</b>
                  </li>
                )
              })}
            </ul>
          )}

          <TeamDiscounts tiers={deal.group_discounts} />
          <div className="ln-shop-total" aria-live="polite">
            <div>
              <span>{totals.lunches ? `${totals.lunches} lunch${totals.lunches === 1 ? '' : 'es'} · ${totals.days} day${totals.days === 1 ? '' : 's'}` : 'Tap the days you want lunch'}{totals.discount > 0 ? ` · ${money(totals.discount)} off` : ''}</span>
              <strong>{money(totals.total, { whole: totals.discount === 0 })}</strong>
            </div>
            <button type="button" className="ln-btn primary" disabled={!totals.lunches} onClick={() => setBooking(true)}>Order</button>
          </div>
          <p className="ln-fine">Nothing is charged now. We call you to confirm and you pay by mobile money.</p>
        </div>
      )}

      <div className="ln-shop-foot">
        <Link className="ln-btn ghost" to={`/lunch/${deal.slug}`}>Full menu and details</Link>
        <ShareProduct product={shareProduct} link={link} store={vendor ? { business_name: vendor.business_name, logo_url: vendor.logo_url, location: vendor.town } : null} className="ln-btn ghost" label="Share this lunch plan" />
      </div>

      {booking && <BookSheet deal={deal} kind={kind} picks={picks} menu={menu} totals={totals} onClose={() => setBooking(false)} onDone={() => { setPicks({}); setRefresh((n) => n + 1) }} />}
      {viewer && <PhotoViewer images={viewer.images} start={0} alt={viewer.alt} onClose={() => setViewer(null)} />}
    </section>
  )
}
