import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/format'
import { Loading, Empty } from '../../components/ui'
import { CHANNEL_LABEL } from '../../lib/channel'
import '../../motors.css'

// Who is visiting, where they came from, and which vehicles are getting
// attention: views, WhatsApp taps, calls, enquiries and shares. Counted
// anonymously on the site itself, so it works without Google Analytics.
const RANGES = [[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']]
const sourceName = (s) => CHANNEL_LABEL[s] || (s === 'direct' ? 'Direct or unknown' : s === 'search' ? 'Search engines' : s)

export default function Traffic() {
  const [days, setDays] = useState(30)
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

  const peak = Math.max(1, ...((data?.days || []).map((d) => d.visitors)))
  const vehicles = data?.vehicles || []
  const sum = (k) => vehicles.reduce((a, v) => a + Number(v[k] || 0), 0)

  return (
    <div className="vx vx-form vx-traffic">
      <div className="vx-form-head">
        <div><h1>Visitors</h1><p>Who is visiting, where they came from, where they stop, and which vehicles people ask about. Anonymous: no names or numbers are recorded. Your team, affiliates, and sellers looking at their own shop are not counted.</p></div>
      </div>
      <div className="vx-tabs">
        {RANGES.map(([d, l]) => <button type="button" key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{l}</button>)}
      </div>

      {error ? <Empty title="Not available yet">{error}</Empty> : !data ? <Loading /> : (
        <>
          <div className="vx-aff-stats vx-traffic-stats">
            <div><span>Visitors</span><strong>{data.visitors || 0}</strong></div>
            <div><span>Today</span><strong>{data.visitors_today || 0}</strong></div>
            <div><span>Pages and vehicles opened</span><strong>{data.page_views || 0}</strong></div>
            <div><span>Vehicle views</span><strong>{sum('views')}</strong></div>
            <div><span>WhatsApp taps</span><strong>{sum('whatsapp')}</strong></div>
            <div><span>Enquiries and calls</span><strong>{sum('enquiries') + sum('calls')}</strong></div>
          </div>

          {(data.days || []).length > 1 && (
            <section className="vx-card-block">
              <h2>Visitors per day</h2>
              <div className="vx-bars" role="img" aria-label="Visitors per day">
                {data.days.map((d) => <span key={d.day} title={`${d.day}: ${d.visitors}`} style={{ height: `${Math.max(4, (d.visitors / peak) * 100)}%` }} />)}
              </div>
              <p className="vx-muted tiny">{data.days[0].day} to {data.days[data.days.length - 1].day} · busiest day {peak} visitors</p>
            </section>
          )}

          {data.funnel && <Funnel f={data.funnel} />}

          {(data.products || []).length > 0 && (
            <section className="vx-card-block">
              <h2>Products people look at</h2>
              <ul className="vx-rank">{data.products.map((p) => <li key={p.product_id}><span><Link to={`/p/${p.slug || p.product_id}`}>{p.name}</Link></span><b>{p.visitors} people · {p.carts} added to cart</b></li>)}</ul>
              <p className="vx-muted tiny">Many looks and few carts usually means the price, photo or description needs work.</p>
            </section>
          )}

          <section className="vx-card-block">
            <h2>Vehicles</h2>
            {vehicles.length ? (
              <div className="vx-table-wrap">
                <table className="vx-table">
                  <thead><tr><th>Vehicle</th><th>Views</th><th>People</th><th>WhatsApp</th><th>Calls</th><th>Enquiries</th><th>Shares</th><th>Via affiliates</th></tr></thead>
                  <tbody>
                    {vehicles.map((v) => (
                      <tr key={v.product_id}>
                        <td><Link to={`/admin/vehicles/${v.product_id}`}>{v.name}</Link><small>{money(v.price, { whole: true })}{v.status === 'out_of_stock' ? ' · sold' : ''}</small></td>
                        <td>{v.views}</td><td>{v.visitors}</td><td>{v.whatsapp}</td><td>{v.calls}</td><td>{v.enquiries}</td><td>{v.shares}</td><td>{v.from_affiliates}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="vx-muted">No live vehicles yet.</p>}
            <p className="vx-muted tiny">A vehicle with many views and few taps usually needs a better first photo or a clearer price. Many taps and no enquiries means people are asking on WhatsApp: check the ZaMarket WhatsApp.</p>
          </section>

          <div className="vx-traffic-two">
            <section className="vx-card-block">
              <h2>Where visitors came from</h2>
              {(data.sources || []).length ? <ul className="vx-rank">{data.sources.map((s) => <li key={s.source}><span>{sourceName(s.source)}</span><b>{s.visitors}</b></li>)}</ul> : <p className="vx-muted">No visits yet.</p>}
            </section>
            <section className="vx-card-block">
              <h2>Most visited pages</h2>
              {(data.pages || []).length ? <ul className="vx-rank">{data.pages.map((p) => <li key={p.path}><span>{p.path}</span><b>{p.visitors}</b></li>)}</ul> : <p className="vx-muted">No visits yet.</p>}
            </section>
          </div>

          {(data.affiliates || []).length > 0 && (
            <section className="vx-card-block">
              <h2>Visitors brought by affiliates</h2>
              <ul className="vx-rank">{data.affiliates.map((a) => <li key={a.code}><span>{a.code}</span><b>{a.visitors} visitors · {a.taps} taps</b></li>)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

// Where people stop: each step as a share of everyone who visited, and the
// biggest drop called out in words.
const STEPS = [
  ['visited', 'Visited the site'],
  ['viewed', 'Looked at a product or vehicle'],
  ['carted', 'Added to cart'],
  ['checkout', 'Opened checkout'],
  ['ordered', 'Ordered or enquired'],
]
function Funnel({ f }) {
  const top = Math.max(1, Number(f.visited || 0))
  let worst = null
  STEPS.forEach(([k], i) => {
    if (!i) return
    const prev = Number(f[STEPS[i - 1][0]] || 0)
    const lost = prev - Number(f[k] || 0)
    if (prev > 0 && (!worst || lost / prev > worst.rate)) worst = { rate: lost / prev, from: STEPS[i - 1][1], to: STEPS[i][1] }
  })
  return (
    <section className="vx-card-block">
      <h2>Where people stop</h2>
      <div className="vx-funnel">
        {STEPS.map(([k, label], i) => {
          const n = Number(f[k] || 0)
          const prev = i ? Number(f[STEPS[i - 1][0]] || 0) : 0
          return (
            <div key={k} className="vx-funnel-row">
              <span className="vx-funnel-label">{label}</span>
              <span className="vx-funnel-bar"><i style={{ width: `${Math.max(2, (n / top) * 100)}%` }} /></span>
              <b>{n}</b>
              <small>{i && prev ? `${Math.round((n / prev) * 100)}% of the step before` : ''}</small>
            </div>
          )
        })}
      </div>
      {worst && worst.rate > 0 && <p className="vx-muted tiny">The biggest drop is between “{worst.from.toLowerCase()}” and “{worst.to.toLowerCase()}”: {Math.round(worst.rate * 100)}% don’t continue. That is the step to improve first.</p>}
    </section>
  )
}
