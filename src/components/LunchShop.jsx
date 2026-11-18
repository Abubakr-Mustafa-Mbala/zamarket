import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { upcomingMenu, fromPrice, workingWeeks, packagePrice, defaultDish } from '../lib/lunch'
import { loadDealDishes } from '../lib/lunchData'
import { DEAL_COLS } from '../pages/public/Lunch'
import { shareAudience } from './ShareProduct'
import ShareLunch from './ShareLunch'
import { useAuth } from '../lib/auth'
import DishCollage, { collagePhotos } from './DishCollage'
import '../lunch.css'

const I = (d) => <svg viewBox="0 0 24 24" aria-hidden="true">{d}</svg>
const ICONS = {
  week: I(<><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M7.5 14h2M11 14h2M14.5 14h2M7.5 17h2" /></>),
  van: I(<><path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3v3h-7z" /><circle cx="6.5" cy="17" r="1.8" /><circle cx="16.5" cy="17" r="1.8" /></>),
  cloche: I(<><path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 8V6.5M10.5 6.5h3" /></>),
  leaf: I(<><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" /><path d="M5 19 13 11" /></>),
  chef: I(<><path d="M7 13.5V19h10v-5.5" /><path d="M7 13.5a3.5 3.5 0 1 1 1.5-6.6 3.8 3.8 0 0 1 7 0A3.5 3.5 0 1 1 17 13.5z" /><path d="M7 16.5h10" /></>),
  door: I(<><path d="M5 20V4h11v16M3 20h18M13 12h.01" /></>),
  office: I(<><path d="M4 20V5h9v15M13 9h7v11M2.5 20h19M7 8.5h3M7 12h3M7 15.5h3M16 12.5h1.5M16 15.5h1.5" /></>),
  arrow: I(<path d="M5 12h14M13 6l6 6-6 6" />),
}

// The weekly lunch offer inside a seller's shop, laid out like a menu board:
// the offer, this week's dishes, the plans with their real prices, and one
// button. Every price and dish comes from the lunch plan itself.
export default function LunchShop({ vendorId, vendor }) {
  const [deals, setDeals] = useState([])
  useEffect(() => {
    if (!vendorId) return
    supabase.from('meal_deals').select(DEAL_COLS).eq('status', 'published').eq('vendor_id', vendorId).order('created_at', { ascending: false })
      .then(({ data }) => setDeals(data || []), () => {})
  }, [vendorId])
  if (!deals.length) return null
  return <>{deals.map((d) => <WeeklyLunchOffer key={d.id} deal={d} vendor={vendor} />)}</>
}

// Weekly lunch inside the Food & cakes category: every seller's published
// lunch plan, each as its menu board, with the seller's name on it.
export function CategoryLunch() {
  const [deals, setDeals] = useState([])
  const [vendors, setVendors] = useState({})
  useEffect(() => {
    supabase.from('meal_deals').select(DEAL_COLS).eq('status', 'published').order('created_at', { ascending: false }).then(async ({ data }) => {
      const ids = [...new Set((data || []).map((d) => d.vendor_id))]
      if (ids.length) {
        const { data: v } = await supabase.from('public_vendors').select('id,business_name,slug,logo_url,town').in('id', ids)
        setVendors(Object.fromEntries((v || []).map((x) => [x.id, x])))
      }
      setDeals(data || [])
    }, () => {})
  }, [])
  if (!deals.length) return null
  return (
    <section className="cat-lunch" aria-label="Weekly lunch">
      {deals.map((d) => (
        <div key={d.id} className="cat-lunch-item">
          {vendors[d.vendor_id] && <Link className="cat-lunch-from" to={`/${vendors[d.vendor_id].slug}`}>From <b>{vendors[d.vendor_id].business_name}</b> · see the shop →</Link>}
          <WeeklyLunchOffer deal={d} vendor={vendors[d.vendor_id]} />
        </div>
      ))}
    </section>
  )
}

export function WeeklyLunchOffer({ deal, vendor, preview = false }) {
  const { role, profile } = useAuth() || {}
  const owner = ['founder', 'ops'].includes(role) || (role === 'vendor' && profile?.partner?.id === deal.vendor_id)
  const [products, setProducts] = useState([])
  const [availability, setAvailability] = useState([])
  useEffect(() => {
    let alive = true
    Promise.all([loadDealDishes(deal), supabase.rpc('meal_availability', { p_deal: deal.id, p_days: 24 })])
      .then(([p, a]) => { if (alive) { setProducts(p); setAvailability(a.data || []) } }, () => {})
    return () => { alive = false }
  }, [deal.id])
  const menu = useMemo(() => upcomingMenu({ deal, products, availability, days: 21 }), [deal, products, availability])
  const weeks = useMemo(() => workingWeeks(menu, 2), [menu])
  const wi = Math.max(0, weeks.findIndex((w) => w.open === 5))
  const week = weeks[wi]
  const full = week ? packagePrice(weeks, wi, 'week', menu, deal) : null
  const four = week ? packagePrice(weeks, wi, 'monthu', menu, deal) : null
  const from = fromPrice(products, deal)
  const photo = deal.cover_url || products.find((p) => p.images?.[0])?.images[0]
  const collage = collagePhotos(products).length >= 2
  const link = `${window.location.origin}/lunch/${deal.slug}`
  const to = (plan) => `/lunch/${deal.slug}?plan=${plan}#order`
  const isNew = deal.created_at && Date.now() - new Date(deal.created_at).getTime() < 45 * 864e5
  const today = new Date().toISOString().slice(0, 10)
  const dayCards = week ? week.days.map((d) => ({ ...d, dish: d.day ? defaultDish(d.day) || d.day.dishes[0] : null })) : []
  const distinct = new Set(dayCards.filter((d) => d.dish).map((d) => d.dish.id)).size
  const DAYNAME = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const best = full && full.discount > 0 && (!four || full.discount / full.before >= (four.discount || 0) / (four.before || 1))

  return (
    <section className="ln ln-offer" id="lunch" aria-label="Weekly office lunches">
      <div className={`ln-offer-top ${collage ? 'has-collage' : ''}`}>
        {!collage && photo && <img className="ln-offer-bg" src={photo} alt="" loading="lazy" />}
        <div className="ln-offer-fade" />
        <div className="ln-offer-brand">
          <span className="ln-offer-zm"><img src="/favicon.svg" alt="" />ZaMarket</span>
          {vendor?.business_name && <><i aria-hidden="true" />{vendor.logo_url ? <img className="ln-offer-vlogo" src={vendor.logo_url} alt={vendor.business_name} /> : <span className="ln-offer-vname">{vendor.business_name}</span>}</>}
        </div>
        <div className="ln-offer-head">
          {isNew && <span className="ln-badge">New on ZaMarket</span>}
          <h2>Weekly <span>Office Lunches</span></h2>
          <p>Fresh, delicious homemade lunches delivered to your office or doorstep, Monday to Friday.</p>
          <ul className="ln-offer-chips">
            <li>{ICONS.week}<span>Mon–Fri</span></li>
            <li>{ICONS.van}<span>Delivered</span></li>
            <li>{ICONS.cloche}<span>Homemade meals</span></li>
          </ul>
        </div>
        {collage && <DishCollage className="ln-offer-collage" cover={deal.cover_url} dishes={products.filter((p) => deal.dishes?.some((d) => d.product_id === p.id))} />}
      </div>

      {dayCards.some((d) => d.dish) && (
        <div className="ln-offer-panel">
          <div className="ln-offer-panel-head">
            <h3>{ICONS.week}{week.start <= today ? 'This week’s menu' : 'Next week’s menu'}</h3>
            {distinct >= 4 && <span className="ln-pill">A different homemade meal each day</span>}
          </div>
          <div className="ln-offer-days">
            {dayCards.map((d) => (
              <Link key={d.date} to={to('week')} className={`ln-offer-day ${d.dish ? '' : 'is-closed'}`}>
                <em>{DAYNAME[d.weekday]}</em>
                <span className="ln-offer-day-photo">{d.dish?.images?.[0] ? <img src={d.dish.images[0]} alt="" loading="lazy" /> : null}</span>
                <strong>{d.dish ? d.dish.name : 'No lunch this day'}</strong>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="ln-offer-plans">
        <h3><span className="ln-offer-ico">{ICONS.cloche}</span>Choose your lunch plan</h3>
        <div className="ln-offer-plan-grid">
          {full && full.dates.length > 0 && (
            <Link to={to('week')} className="ln-plan-card is-main">
              <span className="ln-radio" aria-hidden />
              <span className="ln-plan-text"><strong>Full workweek</strong><small>Monday – Friday ({full.dates.length} lunches)</small></span>
              <span className="ln-plan-price">{best && <em className="ln-best">Best value</em>}<b>{money(full.total, { whole: true })}</b>{full.discount > 0 && <s>{money(full.before, { whole: true })}</s>}</span>
            </Link>
          )}
          {four && four.dates.length > 0 && (
            <Link to={to('monthu')} className="ln-plan-card">
              <span className="ln-radio" aria-hidden />
              <span className="ln-plan-text"><strong>Four-day plan</strong><small>Monday – Thursday ({four.dates.length} lunches)</small></span>
              <span className="ln-plan-price"><b>{money(four.total, { whole: true })}</b>{four.discount > 0 && <s>{money(four.before, { whole: true })}</s>}</span>
            </Link>
          )}
          <Link to={to('custom')} className="ln-plan-card">
            <span className="ln-radio" aria-hidden />
            <span className="ln-plan-text"><strong>Custom days</strong><small>Choose the days you want</small></span>
            {from > 0 && <span className="ln-plan-price"><small>From</small><b>{money(from, { whole: true })}<i>/day</i></b></span>}
          </Link>
        </div>
      </div>

      <ul className="ln-offer-trust">
        <li>{ICONS.leaf}<span>Cooked fresh each day</span></li>
        <li>{ICONS.chef}<span>Homemade taste</span></li>
        <li>{ICONS.door}<span>To your office or door</span></li>
        <li>{ICONS.office}<span>Ideal for offices &amp; busy schedules</span></li>
      </ul>

      <div className="ln-offer-cta">
        <Link to={to('week')} className="ln-btn primary big ln-cta">{ICONS.cloche}Order your weekly lunch today{ICONS.arrow}</Link>
        {!preview && <ShareLunch deal={deal} vendorName={vendor?.business_name} menu={menu} from={from} link={link} audience={shareAudience(role)} />}
        {!preview && owner && <Link to={role === 'vendor' ? '/vendor/lunch' : '/admin/lunch'} className="ln-btn ghost">Edit this offer</Link>}
      </div>
    </section>
  )
}
