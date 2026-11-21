import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSeo } from '../../lib/seo'
import { Loading } from '../../components/ui'
import VehicleCard from '../../components/vehicle/VehicleCard'
import { vehicleOf, bodyGroup, BODY_GROUPS, filterVehicles, sortVehicles, TRANSMISSIONS, FUELS } from '../../lib/vehicle'
import '../../motors.css'

const PRICE_STEPS = [50000, 100000, 150000, 200000, 300000, 500000, 800000]
const thisYear = new Date().getFullYear()
const YEAR_STEPS = [thisYear - 3, thisYear - 6, thisYear - 10, thisYear - 15]


export default function Motors() {
  useSeo({ title: 'Vehicles for sale in Zambia | ZaMarket Motors', description: 'Cars, SUVs, pickups and trucks for sale in Zambia. Real photos, clear prices and every detail on one page. Ask on WhatsApp in one tap.' })
  const [params, setParams] = useSearchParams()
  const [cars, setCars] = useState(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [more, setMore] = useState(false)

  const f = {
    q: params.get('q') || '',
    group: params.get('type') || 'All',
    make: params.get('make') || '',
    maxPrice: params.get('max') || '',
    transmission: params.get('gear') || '',
    fuel: params.get('fuel') || '',
    minYear: params.get('from') || '',
  }
  const sort = params.get('sort') || 'new'
  const setF = (key, value) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'All') next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    let alive = true
    setError('')
    supabase.from('public_products').select('*').eq('offering_type', 'vehicle').eq('status', 'published').order('created_at', { ascending: false }).limit(300)
      .then(({ data, error: failure }) => {
        if (!alive) return
        if (failure) { setCars([]); setError('Vehicles could not be loaded. Please try again.') } else setCars(data || [])
      })
    return () => { alive = false }
  }, [refresh])

  const makes = useMemo(() => [...new Set((cars || []).map((p) => vehicleOf(p).make).filter(Boolean))].sort(), [cars])
  const groups = useMemo(() => BODY_GROUPS.filter((g) => (cars || []).some((p) => (bodyGroup(vehicleOf(p).body || p.category) || 'Cars') === g)), [cars])
  const list = useMemo(() => sortVehicles(filterVehicles(cars, f), sort), [cars, params]) // eslint-disable-line react-hooks/exhaustive-deps
  const filtersOn = Boolean(f.make || f.maxPrice || f.transmission || f.fuel || f.minYear || f.q || f.group !== 'All')
  const [all, setAll] = useState(false)
  const shown = filtersOn || all ? list : list.slice(0, 6)
  const bannerPhoto = (cars || []).map((p) => (Array.isArray(p.images) ? p.images[0] : null)).find((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
  const clearAll = () => { setParams(new URLSearchParams(), { replace: true }); setAll(false) }

  return (
    <div className="vx vx-showroom">
      <section className="vx-banner" aria-label="ZaMarket Motors">
        <div className="vx-banner-copy">
          <h1>ZaMarket Motors</h1>
          <p>Quality vehicles in Zambia</p>
        </div>
        <div className="vx-banner-car" aria-hidden="true">
          {bannerPhoto ? <img src={bannerPhoto} alt="" /> : BANNER_CAR}
        </div>
      </section>

      {cars && cars.length > 0 && (
        <div className="vx-chips" role="group" aria-label="Filter vehicles">
          <button type="button" className={`vx-chip ${f.q || f.transmission || f.fuel || sort !== 'new' ? 'on' : ''}`} onClick={() => setMore(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>Filters
          </button>
          <ChipSelect label="Make" value={f.make} onChange={(x) => setF('make', x)} options={makes.map((m) => [m, m])} />
          <ChipSelect label="Body type" value={f.group === 'All' ? '' : f.group} onChange={(x) => setF('type', x)} options={groups.map((g) => [g, g])} />
          <ChipSelect label="Price" value={f.maxPrice} onChange={(x) => setF('max', x)} options={PRICE_STEPS.map((x) => [String(x), `Up to K${x.toLocaleString('en-ZM')}`])} />
          <ChipSelect label="Year" value={f.minYear} onChange={(x) => setF('from', x)} options={YEAR_STEPS.map((y) => [String(y), `${y} or newer`])} />
        </div>
      )}

      {cars === null ? <Loading shape="cards" />
        : error ? <div className="vx-empty"><p role="alert">{error}</p><button className="vx-btn primary" onClick={() => setRefresh((n) => n + 1)}>Try again</button></div>
          : cars.length === 0 ? (
            <div className="vx-empty">
              <h2>No vehicles listed right now</h2>
              <p>New vehicles appear here as soon as we list them. Please check back soon.</p>
              <Link className="vx-btn ghost" to="/">Back to the marketplace</Link>
            </div>
          ) : (
            <section className="vx-list" aria-labelledby="vx-list-title">
              <div className="vx-list-head">
                <h2 id="vx-list-title">{filtersOn ? `${list.length} vehicle${list.length === 1 ? '' : 's'}` : 'Featured vehicles'}</h2>
                {filtersOn
                  ? <button type="button" className="vx-viewall" onClick={clearAll}>Clear filters</button>
                  : list.length > shown.length && <button type="button" className="vx-viewall" onClick={() => setAll(true)}>View all {list.length}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
              </div>
              {shown.length
                ? <div className="vx-grid">{shown.map((p) => <VehicleCard key={p.id} p={p} />)}</div>
                : (
                  <div className="vx-empty">
                    <h2>No vehicles match</h2>
                    <p>Try fewer filters to see everything we have listed.</p>
                    <button className="vx-btn ghost" onClick={clearAll}>Show all vehicles</button>
                  </div>
                )}
            </section>
          )}

      {more && (
        <div className="modal-backdrop" onClick={() => setMore(false)}>
          <div className="modal vx-filter-sheet" role="dialog" aria-modal="true" aria-label="Filters" onClick={(e) => e.stopPropagation()}>
            <div className="vx vx-sheet-inner">
              <div className="vx-list-head"><h2>Filters</h2><button type="button" className="vx-viewall" onClick={() => setMore(false)}>Done</button></div>
              <label className="vx-sheet-field"><span>Search</span>
                <input value={f.q} onChange={(e) => setF('q', e.target.value)} placeholder="Toyota, Hilux, Lusaka…" />
              </label>
              <div className="vx-sheet-field"><span>Gearbox</span><div className="vx-choices">{['', ...TRANSMISSIONS].map((x) => <button key={x || 'any'} type="button" className={f.transmission === x ? 'on' : ''} onClick={() => setF('gear', x)}>{x || 'Any'}</button>)}</div></div>
              <div className="vx-sheet-field"><span>Fuel</span><div className="vx-choices">{['', ...FUELS].map((x) => <button key={x || 'any'} type="button" className={f.fuel === x ? 'on' : ''} onClick={() => setF('fuel', x)}>{x || 'Any'}</button>)}</div></div>
              <div className="vx-sheet-field"><span>Sort by</span><div className="vx-choices">
                {[['new', 'Newest listed'], ['price_asc', 'Lowest price'], ['price_desc', 'Highest price'], ['year_desc', 'Newest year'], ['mileage_asc', 'Lowest mileage']].map(([k, l]) => (
                  <button key={k} type="button" className={sort === k ? 'on' : ''} onClick={() => setF('sort', k === 'new' ? '' : k)}>{l}</button>
                ))}
              </div></div>
              <div className="vx-sheet-actions">
                <button type="button" className="vx-btn ghost" onClick={clearAll}>Clear all</button>
                <button type="button" className="vx-btn primary" onClick={() => setMore(false)}>Show {list.length} vehicle{list.length === 1 ? '' : 's'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// A chip that opens the phone's own picker. Shows the choice once made.
function ChipSelect({ label, value, onChange, options }) {
  const current = options.find(([v]) => v === value)
  return (
    <label className={`vx-chip ${value ? 'on' : ''}`}>
      <span>{current ? current[1] : label}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{`Any ${label.toLowerCase()}`}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

// Shown in the banner until the first vehicle is listed. An original drawing.
const BANNER_CAR = (
  <svg viewBox="0 0 360 150" className="vx-banner-svg">
    <defs>
      <linearGradient id="vxb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e9e6f2" /><stop offset=".55" stopColor="#9d98ad" /><stop offset="1" stopColor="#4b475a" /></linearGradient>
      <linearGradient id="vxg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#2b2840" /><stop offset="1" stopColor="#5b5378" /></linearGradient>
    </defs>
    <ellipse cx="190" cy="128" rx="160" ry="10" fill="#000" opacity=".45" />
    <path d="M30 104c0-12 8-18 22-21l46-9 38-26c10-7 20-10 34-10h62c14 0 25 4 35 12l30 23 34 6c16 3 26 11 26 24v12c0 6-4 10-10 10H40c-6 0-10-5-10-11z" fill="url(#vxb)" />
    <path d="M110 74l32-22c8-5 16-7 26-7h26v29zm96 0V45h18c12 0 21 3 29 9l26 20z" fill="url(#vxg)" />
    <path d="M40 98h300" stroke="#fff" strokeOpacity=".5" />
    <circle cx="96" cy="122" r="21" fill="#1c1a26" /><circle cx="96" cy="122" r="11" fill="#b9b5c6" />
    <circle cx="282" cy="122" r="21" fill="#1c1a26" /><circle cx="282" cy="122" r="11" fill="#b9b5c6" />
    <path d="M330 94h12" stroke="#ffe7a8" strokeWidth="5" strokeLinecap="round" />
  </svg>
)
