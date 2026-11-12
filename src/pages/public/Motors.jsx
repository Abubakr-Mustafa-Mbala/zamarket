import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/format'
import { useSeo } from '../../lib/seo'
import { Loading } from '../../components/ui'

const readSpec = (p, term) => {
  const specs = p?.page?.specs
  const row = (Array.isArray(specs) ? specs : []).find(s => new RegExp(term, 'i').test(s?.label || ''))
  return row?.value || ''
}
const locationOf = p => p?.page?.location_text || readSpec(p, 'location|town') || 'Ask for location'
const photoOf = p => (Array.isArray(p?.images) ? p.images : []).find(s => typeof s === 'string' && /^https:\/\//i.test(s))

export default function Motors() {
  useSeo({ title: 'Vehicles for sale in Zambia | ZaMarket Motors', description: 'Browse available cars, SUVs and pickups on ZaMarket. Compare real vehicle photos and specifications and send an enquiry to sellers in Zambia.' })
  const [cars, setCars] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('new')
  const [kind, setKind] = useState('All vehicles')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let alive = true
    setError('')
    supabase.from('public_products').select('*').eq('offering_type', 'vehicle').eq('status', 'published').order('created_at', { ascending: false }).limit(200)
      .then(({ data, error: failure }) => {
        if (!alive) return
        if (failure) { setCars([]); setError('Vehicles are temporarily unavailable. Please try again.') }
        else setCars(data || [])
      })
    return () => { alive = false }
  }, [refresh])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = (cars || []).filter(p => {
      if (term && !`${p.name} ${p.description || ''} ${locationOf(p)}`.toLowerCase().includes(term)) return false
      if (kind === 'Cars' && !/sedan|saloon|hatchback|car/i.test(`${p.category || ''} ${readSpec(p, 'body')}`)) return false
      if (kind === 'SUVs' && !/suv|4x4/i.test(`${p.category || ''} ${readSpec(p, 'body')}`)) return false
      if (kind === 'Pickups' && !/pickup|double cab|single cab|bakkie/i.test(`${p.category || ''} ${readSpec(p, 'body')}`)) return false
      return true
    })
    return list.sort((a,b) => sort === 'price_asc' ? a.price-b.price : sort === 'price_desc' ? b.price-a.price : (b.created_at || '').localeCompare(a.created_at || ''))
  }, [cars, search, sort, kind])

  return <div className="motors-root stack">
    <section className="motors-intro">
      <div className="motors-intro-copy">
        <span className="eyebrow">ZAMARKET MOTORS · ZAMBIA</span>
        <h1>Find a vehicle worth taking a closer look at.</h1>
        <p>Real listings, real photographs and the specifications you need before arranging an enquiry or viewing.</p>
        <div className="btn-row"><a className="btn primary" href="#vehicles">Explore vehicles</a><Link className="btn" to="/apply/vendor">List a vehicle</Link></div>
      </div>
      <div className="motors-intro-photo" aria-hidden>
        {photoOf(cars?.[0]) ? <img src={photoOf(cars[0])} alt="" /> : <span>Cars · SUVs · Pickups</span>}
      </div>
    </section>
    <div className="motors-assurance"><span>Clear specifications</span><span>Direct vehicle enquiries</span><span>Real seller photographs</span><span>Promote with ZaMarket</span></div>
    <section id="vehicles" className="stack-sm">
      <div className="between"><div><span className="eyebrow">VEHICLE LISTINGS</span><h2>Explore available vehicles</h2></div><Link className="btn sm" to="/how-it-works">How ZaMarket works</Link></div>
      <div className="motors-filters">
        <input className="input" aria-label="Find a vehicle" placeholder="Search make, model or location…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="input" aria-label="Vehicle type" value={kind} onChange={e=>setKind(e.target.value)}>{['All vehicles','Cars','SUVs','Pickups'].map(k=><option key={k}>{k}</option>)}</select>
        <select className="input" aria-label="Sort vehicles" value={sort} onChange={e=>setSort(e.target.value)}><option value="new">Newest first</option><option value="price_asc">Lowest price</option><option value="price_desc">Highest price</option></select>
      </div>
      {cars === null ? <Loading /> : error ? <div className="card stack-sm"><p role="alert">{error}</p><button className="btn" onClick={()=>setRefresh(n=>n+1)}>Retry</button></div> :
        filtered.length ? <div className="motors-grid">{filtered.map(p => <Link key={p.id} className="motors-card" to={`/p/${p.slug || p.id}`}>
          <div className="motors-photo">{photoOf(p) ? <img src={photoOf(p)} alt={p.name} loading="lazy" /> : <div>Photographs requested from seller</div>}</div>
          <div className="motors-card-body"><h3>{p.name}</h3><p className="small muted">{[readSpec(p,'year'),readSpec(p,'mileage|kilomet'),readSpec(p,'transmission'),readSpec(p,'fuel')].filter(Boolean).join(' · ') || 'View full specifications'}</p>
          <div className="motors-card-bottom"><strong>{money(p.price)}</strong><span>{locationOf(p)}</span></div><span className="motors-card-cta">See vehicle &amp; enquire →</span></div>
        </Link>)}</div> : <div className="card stack-sm"><h3>No matching vehicles yet</h3><p className="small muted">Try another keyword or check back for new listings.</p><button className="btn" onClick={()=>{setSearch('');setKind('All vehicles')}}>Clear filters</button></div>}
      <p className="tiny muted">Vehicles are offered by independent sellers. Confirm registration documents, ownership, condition and the final price before making payment. ZaMarket does not guarantee a vehicle's condition without an independently verified inspection.</p>
    </section>
  </div>
}
