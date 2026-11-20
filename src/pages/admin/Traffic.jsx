import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/format'
import { Loading, Empty } from '../../components/ui'
import { CHANNEL_LABEL } from '../../lib/channel'
import GIcon from '../../components/GrowthIcons'
import LineChart from '../../components/LineChart'
import Donut from '../../components/Donut'
import '../../growth-centre.css'

// Visitors & Traffic: who is visiting, where they came from, where they stop,
// which products and vehicles get attention, and what affiliates bring.
// Everything comes from traffic_summary, counted anonymously on the site
// itself (one browser = one visitor), so it works without Google Analytics.
// No percentages against earlier periods are shown, because the report does
// not hold an earlier period to compare with.

export const RANGES = [[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']]
export const sourceName = (s) => (s === 'direct' ? 'Direct or unknown' : s === 'search' ? 'Search engines' : s === 'google' ? 'Google search' : CHANNEL_LABEL[s] || String(s || '').replace(/^\w/, (c) => c.toUpperCase()))
const SOURCE_COLOR = { facebook: '#4C7DFF', whatsapp: '#25D366', status: '#3FB68B', instagram: '#E1306C', tiktok: '#22D3EE', search: '#F5B53F', google: '#F5B53F', direct: '#8B8FA8', qr: '#C084FC', flyer: '#FB923C', email: '#60A5FA', sms: '#A3E635', other: '#64748B', marketplace: '#8B8FA8', organic: '#A892FF' }
const SPARE = ['#A892FF', '#F472B6', '#38BDF8', '#FACC15', '#34D399', '#FB7185']
export function sourceItems(sources, top = 5) {
  const list = [...(sources || [])].sort((a, b) => b.visitors - a.visitors)
  const main = list.slice(0, top).map((s, i) => ({ key: s.source, label: sourceName(s.source), value: Number(s.visitors) || 0, color: SOURCE_COLOR[s.source] || SPARE[i % SPARE.length] }))
  const rest = list.slice(top).reduce((n, s) => n + (Number(s.visitors) || 0), 0)
  return rest ? [...main, { key: 'rest', label: 'Other recorded sources', value: rest, color: '#475569' }] : main
}
export const dayPoints = (days) => (days || []).map((d) => {
  const dt = new Date(`${d.day}T00:00:00`)
  return { key: d.day, label: dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), long: dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), values: { v: Number(d.visitors) || 0 } }
})

export function useTraffic(days) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setData(null); setError('')
    supabase.rpc('traffic_summary', { p_days: days }).then(({ data: d, error: e }) => {
      if (!alive) return
      if (e) setError(/traffic_summary|function/.test(e.message) ? 'Visitor counting is not switched on yet. Run section 26 of run-in-supabase.sql in Supabase.' : e.message)
      else setData(d || {})
    })
    return () => { alive = false }
  }, [days])
  return { data, error }
}

export function trafficTotals(data) {
  const vehicles = data?.vehicles || []
  const sum = (k) => vehicles.reduce((a, v) => a + Number(v[k] || 0), 0)
  return { visitors: data?.visitors || 0, today: data?.visitors_today || 0, pages: data?.page_views || 0, vviews: sum('views'), whatsapp: sum('whatsapp'), asks: sum('enquiries') + sum('calls') }
}

export function Period({ days, setDays }) {
  return (
    <div className="gc-period" role="tablist" aria-label="Period">
      {RANGES.map(([d, l]) => <button type="button" role="tab" aria-selected={days === d} key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{l}</button>)}
    </div>
  )
}

const periodWords = (d) => (d === 1 ? 'today' : `the last ${d} days`)

export default function Traffic() {
  const [days, setDays] = useState(30)
  const { data, error } = useTraffic(days)
  const [pics, setPics] = useState({})
  const [names, setNames] = useState({})

  // Thumbnails from the catalogue and affiliate names, for the lists below.
  useEffect(() => {
    if (!data) return
    const ids = [...new Set([...(data.products || []).map((p) => p.product_id), ...(data.vehicles || []).map((v) => v.product_id)])].filter(Boolean)
    if (ids.length) supabase.from('products').select('id,images').in('id', ids).then(({ data: rows }) => setPics(Object.fromEntries((rows || []).map((r) => [r.id, (r.images || [])[0]]))), () => {})
    const codes = (data.affiliates || []).map((a) => a.code).filter(Boolean)
    if (codes.length) supabase.from('resellers').select('code,full_name').in('code', codes).then(({ data: rows }) => setNames(Object.fromEntries((rows || []).map((r) => [r.code, r.full_name]))), () => {})
  }, [data])

  const t = trafficTotals(data)
  const points = useMemo(() => dayPoints(data?.days), [data])
  const slugName = useMemo(() => Object.fromEntries([...(data?.products || []), ...(data?.vehicles || [])].filter((p) => p.slug).map((p) => [p.slug, p.name])), [data])

  return (
    <div className="gc gc-traffic">
      <header className="gc-page-head">
        <div className="gc-crumbs"><Link to="/admin/marketing">Marketing & Growth</Link><span>›</span><span>Visitors & Traffic</span></div>
        <div className="gc-head-row">
          <div className="gc-head-ico tone-violet"><GIcon name="chart" size={28} /></div>
          <div>
            <h1>Visitors & Traffic</h1>
            <p>Who is visiting, where they came from, where they stop, and what they look at. Counted anonymously on the site: one browser is one visitor, and no names or numbers are recorded. Your team, affiliates and sellers looking at their own shop are not counted.</p>
          </div>
        </div>
        <Period days={days} setDays={setDays} />
      </header>

      {error ? <Empty title="Not available yet">{error}</Empty> : !data ? <Loading /> : (
        <>
          <div className="gc-stats gc-stats-6">
            <Stat icon="users" tone="violet" label="Visitors" value={t.visitors} sub={`different browsers, ${periodWords(days)}`} />
            <Stat icon="calendar" tone="blue" label="Visitors today" value={t.today} sub="since midnight, Lusaka time" />
            <Stat icon="pages" tone="pink" label="Pages and vehicles opened" value={t.pages} sub="every page opened" />
            <Stat icon="car" tone="amber" label="Vehicle views" value={t.vviews} sub="times a vehicle was opened" />
            <Stat icon="whatsapp" tone="green" label="WhatsApp taps" value={t.whatsapp} sub="taps on a vehicle’s WhatsApp button" />
            <Stat icon="phone" tone="purple" label="Enquiries and calls" value={t.asks} sub="vehicle enquiry forms and call taps" />
          </div>

          <div className="gc-grid-2-1">
            <section className="gc-panel">
              <div className="gc-panel-head"><h2><GIcon name="trend" /> Visitor activity</h2><small>{RANGES.find((r) => r[0] === days)[1]}</small></div>
              {days === 1 ? <p className="gc-note">Today is one day: choose 7, 30 or 90 days to see the trend. {t.today} visitors so far today.</p> : <LineChart points={points} series={[{ key: 'v', name: 'Visitors', color: '#A892FF' }]} markPeak empty="No visits recorded in this period yet." />}
            </section>
            <section className="gc-panel">
              <div className="gc-panel-head"><h2><GIcon name="share" /> Where visitors come from</h2></div>
              {(data.sources || []).length ? <Donut items={sourceItems(data.sources)} centre="visitors" /> : <p className="gc-note">No visits recorded in this period yet.</p>}
              <p className="gc-foot">From the tag on our links (?src=) or the site that sent them. “Direct or unknown” means we could not tell; it is never guessed.</p>
            </section>
          </div>

          {data.funnel && <Journey f={data.funnel} />}

          <section className="gc-panel">
            <div className="gc-panel-head"><h2><GIcon name="box" /> Products people are interested in</h2><small>{periodWords(days)}</small></div>
            {(data.products || []).length ? (
              <ul className="gc-products">
                {data.products.map((p) => (
                  <li key={p.product_id}>
                    <span className="gc-thumb">{pics[p.product_id] ? <img src={pics[p.product_id]} alt="" loading="lazy" /> : <GIcon name="box" />}</span>
                    <span className="gc-prod-name"><Link to={`/p/${p.slug || p.product_id}`}>{p.name}</Link>{p.price ? <small>{money(p.price, { whole: true })}</small> : null}</span>
                    <span className="gc-prod-num"><b>{p.visitors}</b><small>visitors</small></span>
                    <span className="gc-prod-num"><b>{p.carts}</b><small>added to cart</small></span>
                  </li>
                ))}
              </ul>
            ) : <p className="gc-note">No product pages opened in this period yet.</p>}
            <p className="gc-foot">Many visitors and few carts usually means the price, the first photo or the description needs work.</p>
          </section>

          <Motors vehicles={data.vehicles || []} pics={pics} />

          <div className="gc-grid-2">
            <section className="gc-panel">
              <div className="gc-panel-head"><h2><GIcon name="pages" /> Most visited pages</h2></div>
              {(data.pages || []).length ? (
                <ul className="gc-rank">{data.pages.map((p) => <li key={p.path}><span><b>{pageName(p.path, slugName)}</b><small>{p.path}</small></span><em>{p.visitors}<small>visitors</small></em></li>)}</ul>
              ) : <p className="gc-note">No visits recorded in this period yet.</p>}
            </section>
            <section className="gc-panel">
              <div className="gc-panel-head"><h2><GIcon name="handshake" /> Visitors brought by affiliates</h2></div>
              {(data.affiliates || []).length ? (
                <ul className="gc-rank">{data.affiliates.map((a) => <li key={a.code}><span><b>{names[a.code] || a.code}</b><small>code {a.code}</small></span><em>{a.visitors}<small>visitors</small></em><em>{a.taps}<small>taps</small></em></li>)}</ul>
              ) : <p className="gc-note">No visitors came through an affiliate link in this period.</p>}
              <p className="gc-foot">Taps are WhatsApp, call and enquiry taps by those visitors. Sales and commissions are counted separately, in Affiliates.</p>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

export function Stat({ icon, tone, label, value, sub, to }) {
  const body = (
    <>
      <span className={`gc-stat-ico tone-${tone}`}><GIcon name={icon} /></span>
      <span className="gc-stat-label">{label}</span>
      <strong className="gc-stat-num">{typeof value === 'number' ? value.toLocaleString('en-ZM') : value}</strong>
      {sub && <small className="gc-stat-sub">{sub}</small>}
    </>
  )
  return to ? <Link to={to} className="gc-stat is-link">{body}</Link> : <div className="gc-stat">{body}</div>
}

// Readable names for page addresses (the address is still shown under it).
export function pageName(path, slugName = {}) {
  const p = String(path || '')
  const seg = p.split('?')[0].split('/').filter(Boolean)
  const words = (s) => decodeURIComponent(s || '').replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  if (!seg.length) return 'Home page'
  const [a, b] = seg
  if (a === 'p' && b) return slugName[b] || `Product: ${words(b)}`
  if (a === 'lunch') return b ? `Weekly lunch: ${words(b)}` : 'Weekly lunch'
  if (a === 'motors') return 'Motors showroom'
  if (a === 'blog') return b ? `Article: ${words(b)}` : 'Journal (blog)'
  if (a === 'store' && b) return `Store: ${words(b)}`
  if (a === 'sellers') return 'All stores'
  if (a === 'search') return 'Search and categories'
  if (a === 'cart') return 'Cart'
  if (a === 'checkout') return 'Checkout'
  if (a === 'affiliates') return 'Affiliate programme'
  if (a === 'grow') return 'Sell on ZaMarket'
  if (a === 'giveaway' || a === 'giveaways') return b ? `Giveaway: ${words(b)}` : 'Giveaways'
  if (a === 'about') return 'About ZaMarket'
  if (a === 'apply') return b ? `Apply: ${words(b)}` : 'Apply'
  if (seg.length === 1) return `Store: ${words(a)}`
  return words(seg.join(' › '))
}

// Where people stop. The steps mix shop orders and vehicle enquiries, because
// the report counts them together; the note says so.
const STEPS = [
  ['visited', 'Visited the site', 'users'],
  ['viewed', 'Looked at a product or vehicle', 'eye'],
  ['carted', 'Added to cart', 'cart'],
  ['checkout', 'Opened checkout', 'wallet'],
  ['ordered', 'Ordered or enquired', 'trophy'],
]
export function Journey({ f, compact = false }) {
  const top = Math.max(1, Number(f.visited || 0))
  let worst = null
  STEPS.forEach(([k], i) => {
    if (!i) return
    const prev = Number(f[STEPS[i - 1][0]] || 0)
    const lost = prev - Number(f[k] || 0)
    if (prev > 0 && (!worst || lost / prev > worst.rate)) worst = { rate: lost / prev, from: STEPS[i - 1][1], to: STEPS[i][1] }
  })
  return (
    <section className="gc-panel">
      <div className="gc-panel-head"><h2><GIcon name="funnel" /> Customer buying journey</h2><small>where people stop</small></div>
      <div className="gc-journey">
        {STEPS.map(([k, label, icon], i) => {
          const n = Number(f[k] || 0)
          const prev = i ? Number(f[STEPS[i - 1][0]] || 0) : 0
          return (
            <div key={k} className="gc-jstep">
              <span className="gc-jico"><GIcon name={icon} size={18} /></span>
              <span className="gc-jlabel">{label}</span>
              <span className="gc-jbar"><i style={{ width: `${Math.max(2, (n / top) * 100)}%`, opacity: 1 - i * 0.12 }} /></span>
              <b>{n.toLocaleString('en-ZM')}</b>
              <small>{i ? (prev ? `${Math.round((n / prev) * 100)}% of the step before` : '–') : 'everyone'}</small>
            </div>
          )
        })}
      </div>
      {worst && worst.rate > 0 && <p className="gc-fix"><b>Biggest drop:</b> between “{worst.from.toLowerCase()}” and “{worst.to.toLowerCase()}”: {Math.round(worst.rate * 100)}% don’t continue. That is the step to improve first.</p>}
      {!compact && <p className="gc-foot">Shop orders and vehicle enquiries are counted together here, because the visit records don’t yet separate a shop journey from a Motors journey.</p>}
    </section>
  )
}

// ZaMarket Motors: a table on a computer, tap-to-open cards on a phone.
function Motors({ vehicles, pics }) {
  const [open, setOpen] = useState(null)
  const sum = (k) => vehicles.reduce((a, v) => a + Number(v[k] || 0), 0)
  return (
    <section className="gc-panel gc-motors">
      <div className="gc-panel-head"><h2><GIcon name="car" /> ZaMarket Motors</h2><small>{vehicles.length} live vehicles</small></div>
      {!vehicles.length ? <p className="gc-note">No live vehicles yet.</p> : (
        <>
          <div className="gc-motors-sum">
            <span><b>{sum('views')}</b> views</span><span><b>{sum('whatsapp')}</b> WhatsApp taps</span><span><b>{sum('calls')}</b> calls</span><span><b>{sum('enquiries')}</b> enquiries</span><span><b>{sum('shares')}</b> shares</span>
          </div>
          <div className="gc-table-wrap gc-only-wide">
            <table className="gc-table">
              <thead><tr><th>Vehicle</th><th>Views</th><th>Visitors</th><th>WhatsApp</th><th>Calls</th><th>Enquiries</th><th>Shares</th><th>Via affiliates</th></tr></thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.product_id}>
                    <td><span className="gc-veh"><span className="gc-thumb sm">{pics[v.product_id] ? <img src={pics[v.product_id]} alt="" loading="lazy" /> : <GIcon name="car" size={18} />}</span><span><Link to={`/admin/vehicles/${v.product_id}`}>{v.name}</Link><small>{money(v.price, { whole: true })}{v.status === 'out_of_stock' ? ' · sold' : ''}</small></span></span></td>
                    <td>{v.views}</td><td>{v.visitors}</td><td>{v.whatsapp}</td><td>{v.calls}</td><td>{v.enquiries}</td><td>{v.shares}</td><td>{v.from_affiliates}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="gc-veh-cards gc-only-narrow">
            {vehicles.map((v) => (
              <li key={v.product_id} className={open === v.product_id ? 'open' : ''}>
                <button type="button" onClick={() => setOpen(open === v.product_id ? null : v.product_id)} aria-expanded={open === v.product_id}>
                  <span className="gc-thumb sm">{pics[v.product_id] ? <img src={pics[v.product_id]} alt="" loading="lazy" /> : <GIcon name="car" size={18} />}</span>
                  <span className="gc-veh-title"><b>{v.name}</b><small>{money(v.price, { whole: true })}{v.status === 'out_of_stock' ? ' · sold' : ''} · {v.views} views · {v.whatsapp} WhatsApp</small></span>
                  <GIcon name="chevron" size={18} className="gc-chev" />
                </button>
                {open === v.product_id && (
                  <div className="gc-veh-body">
                    {[['Views', v.views], ['Visitors', v.visitors], ['WhatsApp taps', v.whatsapp], ['Calls', v.calls], ['Enquiries', v.enquiries], ['Shares', v.shares], ['Via affiliates', v.from_affiliates]].map(([l, n]) => <span key={l}><b>{n}</b><small>{l}</small></span>)}
                    <Link to={`/admin/vehicles/${v.product_id}`} className="gc-veh-link">Open the listing <GIcon name="arrow" size={16} /></Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="gc-foot">A WhatsApp tap means someone opened WhatsApp to ask, not a confirmed conversation or a sale. Many views and few taps usually means the first photo or the price needs work.</p>
    </section>
  )
}
