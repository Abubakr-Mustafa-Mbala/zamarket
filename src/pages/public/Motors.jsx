import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSeo } from '../../lib/seo'
import { Loading } from '../../components/ui'
import VehicleCard from '../../components/vehicle/VehicleCard'
import { useVehicleContact, askOnWhatsApp, vehicleLink } from '../../components/vehicle/VehiclePage'
import { VI } from '../../components/vehicle/icons'
import { vehicleOf, bodyGroup, BODY_GROUPS, filterVehicles, sortVehicles, TRANSMISSIONS, FUELS } from '../../lib/vehicle'
import '../../motors.css'

const PRICE_STEPS = [50000, 100000, 150000, 200000, 300000, 500000, 800000]
const thisYear = new Date().getFullYear()
const YEAR_STEPS = [thisYear - 3, thisYear - 6, thisYear - 10, thisYear - 15]

const GROUP_ICON = {
  All: VI.body,
  Cars: <svg viewBox="0 0 32 20" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" d="M3 14v-3l3.5-1.5L10 5h11l4 4.5 4 1V14z" /><circle cx="9" cy="15" r="2.2" fill="currentColor" /><circle cx="24" cy="15" r="2.2" fill="currentColor" /></svg>,
  SUVs: <svg viewBox="0 0 32 20" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" d="M3 14V8l3-4h17l4 5 2 1v4z" /><path stroke="currentColor" strokeWidth="1.7" d="M15 4v5" /><circle cx="9" cy="15" r="2.4" fill="currentColor" /><circle cx="23.5" cy="15" r="2.4" fill="currentColor" /></svg>,
  Pickups: <svg viewBox="0 0 32 20" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" d="M2.5 14V9h13V4h7l4 5h3v5z" /><circle cx="8" cy="15" r="2.4" fill="currentColor" /><circle cx="24" cy="15" r="2.4" fill="currentColor" /></svg>,
  'Vans & buses': <svg viewBox="0 0 32 20" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" d="M3 14V4h21l5 6v4z" /><path stroke="currentColor" strokeWidth="1.5" d="M7 4v5h17M13 4v5M19 4v5" /><circle cx="8.5" cy="15" r="2.2" fill="currentColor" /><circle cx="24" cy="15" r="2.2" fill="currentColor" /></svg>,
  Trucks: <svg viewBox="0 0 32 20" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" d="M2.5 14V3h17v11M19.5 7h5l4.5 4v3z" /><circle cx="7" cy="15" r="2.3" fill="currentColor" /><circle cx="24" cy="15" r="2.3" fill="currentColor" /></svg>,
}

export default function Motors() {
  useSeo({ title: 'Vehicles for sale in Zambia | ZaMarket Motors', description: 'Cars, SUVs, pickups and trucks for sale in Zambia. Real photos, clear prices and every detail on one page. Ask on WhatsApp in one tap.' })
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
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
  const counts = useMemo(() => {
    const c = { All: (cars || []).length }
    for (const p of cars || []) { const g = bodyGroup(vehicleOf(p).body || p.category) || 'Cars'; c[g] = (c[g] || 0) + 1 }
    return c
  }, [cars])
  const list = useMemo(() => sortVehicles(filterVehicles(cars, f), sort), [cars, params]) // eslint-disable-line react-hooks/exhaustive-deps
  const showTools = (cars || []).length >= 6
  const groups = BODY_GROUPS.filter((g) => counts[g])
  const filtersOn = Boolean(f.make || f.maxPrice || f.transmission || f.fuel || f.minYear || f.q || f.group !== 'All')

  // "Ask" on a card: straight to WhatsApp when ZaMarket has a WhatsApp number,
  // otherwise the vehicle page opens with the question form.
  const contact = useVehicleContact(null)
  const onAsk = (p) => {
    const url = contact.whatsapp ? askOnWhatsApp(p, { ...contact, link: vehicleLink(p, contact.ref) }, '') : ''
    if (url) window.open(url, '_blank', 'noopener')
    else nav(`/p/${p.slug || p.id}?ask=1`)
  }

  return (
    <div className="vx vx-showroom">
      <section className="vx-hero">
        <div className="vx-hero-copy">
          <span className="vx-eyebrow">ZaMarket Motors</span>
          <h1>Vehicles for sale</h1>
          <p>Listed by ZaMarket for sellers we know. Real photos, the asking price and every detail on one page. Ask on WhatsApp in one tap.</p>
          {cars && cars.length > 0 && <p className="vx-hero-count"><strong>{cars.length}</strong> vehicle{cars.length === 1 ? '' : 's'} available now</p>}
        </div>
        {/* Search and filters only once there are enough vehicles to need them. */}
        {showTools && (
          <form className="vx-search" role="search" onSubmit={(e) => e.preventDefault()}>
            {VI.search}
            <input aria-label="Search vehicles" placeholder="Search Toyota, Hilux, Lusaka…" value={f.q} onChange={(e) => setF('q', e.target.value)} />
            {f.q && <button type="button" onClick={() => setF('q', '')} aria-label="Clear search">✕</button>}
          </form>
        )}
        {groups.length > 1 && (
          <div className="vx-groups" role="tablist" aria-label="Vehicle type">
            {['All', ...groups].map((g) => (
              <button key={g} type="button" role="tab" aria-selected={f.group === g} className={f.group === g ? 'on' : ''} onClick={() => setF('type', g)}>
                <span className="vx-group-ic">{GROUP_ICON[g]}</span>
                <span>{g === 'All' ? 'All' : g}</span>
                <em>{counts[g] || 0}</em>
              </button>
            ))}
          </div>
        )}
      </section>

      {showTools && (
        <section className="vx-filters" aria-label="Filters">
          <div className="vx-filter-row">
            <label><span>Make</span>
              <select value={f.make} onChange={(e) => setF('make', e.target.value)}><option value="">Any make</option>{makes.map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <label><span>Price up to</span>
              <select value={f.maxPrice} onChange={(e) => setF('max', e.target.value)}><option value="">Any price</option>{PRICE_STEPS.map((x) => <option key={x} value={x}>K{x.toLocaleString('en-ZM')}</option>)}</select>
            </label>
            <label className={more ? '' : 'vx-hide-sm'}><span>Gearbox</span>
              <select value={f.transmission} onChange={(e) => setF('gear', e.target.value)}><option value="">Any</option>{TRANSMISSIONS.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label className={more ? '' : 'vx-hide-sm'}><span>Fuel</span>
              <select value={f.fuel} onChange={(e) => setF('fuel', e.target.value)}><option value="">Any</option>{FUELS.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label className={more ? '' : 'vx-hide-sm'}><span>Year</span>
              <select value={f.minYear} onChange={(e) => setF('from', e.target.value)}><option value="">Any year</option>{YEAR_STEPS.map((y) => <option key={y} value={y}>{y} or newer</option>)}</select>
            </label>
          </div>
          <div className="vx-filter-foot">
            <strong>{`${list.length} vehicle${list.length === 1 ? '' : 's'}`}</strong>
            <select aria-label="Sort vehicles" className="vx-sort" value={sort} onChange={(e) => setF('sort', e.target.value === 'new' ? '' : e.target.value)}>
              <option value="new">Newest listed</option><option value="price_asc">Lowest price</option><option value="price_desc">Highest price</option>
              <option value="year_desc">Newest year</option><option value="mileage_asc">Lowest mileage</option>
            </select>
            <button type="button" className="vx-link vx-show-sm" onClick={() => setMore((m) => !m)}>{more ? 'Fewer filters' : 'More filters'}</button>
            {filtersOn && <button type="button" className="vx-link" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear all</button>}
          </div>
        </section>
      )}

      {cars === null ? <Loading shape="cards" />
        : error ? <div className="vx-empty"><p role="alert">{error}</p><button className="vx-btn primary" onClick={() => setRefresh((n) => n + 1)}>Try again</button></div>
          : list.length ? <div className="vx-grid">{list.map((p) => <VehicleCard key={p.id} p={p} onAsk={onAsk} />)}</div>
            : cars.length ? (
              <div className="vx-empty">
                <h2>No vehicles match</h2>
                <p>Try fewer filters to see everything we have listed.</p>
                <button className="vx-btn ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Show all vehicles</button>
              </div>
            ) : (
              <div className="vx-empty">
                <h2>No vehicles listed right now</h2>
                <p>New vehicles appear here as soon as we list them. Please check back soon.</p>
                <Link className="vx-btn ghost" to="/">Back to the marketplace</Link>
              </div>
            )}

      {cars && cars.length > 0 && (
        <section className="vx-how">
          <h2>How buying works</h2>
          <ol>
            <li><span>1</span><div><strong>Ask</strong><p>Tap Ask on WhatsApp or leave your number. Ask anything: price, papers, more photos.</p></div></li>
            <li><span>2</span><div><strong>See it</strong><p>We arrange a viewing with the seller. Bring a mechanic if you like.</p></div></li>
            <li><span>3</span><div><strong>Agree</strong><p>Agree the price, check the papers, and only then pay.</p></div></li>
          </ol>
        </section>
      )}

      {cars && cars.length > 0 && <p className="vx-fine">Every vehicle here is listed by ZaMarket or a dealer we have approved. Details come from the seller. See the vehicle and check the papers before paying anything.</p>}
    </div>
  )
}
