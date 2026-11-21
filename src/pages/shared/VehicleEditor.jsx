import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { money, slugify } from '../../lib/format'
import { Loading, Empty, Badge, useToast } from '../../components/ui'
import { uploadVehiclePhoto } from '../../lib/photos'
import { vehicleDealBreakdown } from '../../lib/vehicleDealMath'
import { VehicleView } from '../../components/vehicle/VehiclePage'
import VehicleCard from '../../components/vehicle/VehicleCard'
import { VI } from '../../components/vehicle/icons'
import {
  MAKES, BODY_TYPES, TRANSMISSIONS, FUELS, DRIVES, CONDITIONS, PAPERS, SERVICE, TOWNS, FEATURES,
  vehicleOf, vehicleTitle, specsFrom, normaliseVehicle, listingChecks, PRICE_NOTES, priceNote,
} from '../../lib/vehicle'
import { PRODUCT_WORD } from '../../lib/statuses'
import ShareProduct from '../../components/ShareProduct'
import '../../motors.css'

const SHOTS = ['Front', 'Back', 'Left side', 'Right side', 'Front seats', 'Back seats', 'Dashboard with mileage', 'Engine', 'Boot', 'Tyres']
const thisYear = new Date().getFullYear()
const YEARS = Array.from({ length: thisYear - 1979 }, (_, i) => String(thisYear + 1 - i))
const rand = () => Math.random().toString(36).slice(2, 6)

function Choices({ options, value, onChange, multi = false }) {
  const on = (o) => (multi ? (value || []).includes(o) : value === o)
  const tap = (o) => {
    if (!multi) return onChange(value === o ? '' : o)
    const set = new Set(value || [])
    if (set.has(o)) set.delete(o); else set.add(o)
    onChange([...set])
  }
  return (
    <div className="vx-choices">
      {options.map((o) => <button type="button" key={o} className={on(o) ? 'on' : ''} aria-pressed={on(o)} onClick={() => tap(o)}>{o}</button>)}
    </div>
  )
}

function F({ label, optional, hint, wide, children }) {
  return (
    <label className={`vx-field ${wide ? 'wide' : ''}`}>
      <span>{label}{optional && <em> (optional)</em>}</span>
      {children}
      {hint && <small className="vx-hint">{hint}</small>}
    </label>
  )
}

function Step({ n, title, note, children, className = '' }) {
  return (
    <section className={`vx-step ${className}`}>
      <div className="vx-step-head"><span className="vx-step-num">{n}</span><div><h2>{title}</h2>{note && <p>{note}</p>}</div></div>
      {children}
    </section>
  )
}

export default function VehicleEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const nav = useNavigate()
  const toast = useToast()
  const { profile, isStaff, user } = useAuth()
  const vendorId = profile?.role === 'vendor' ? profile?.partner?.id : null
  const base = vendorId ? '/vendor/vehicles' : '/admin/vehicles'

  const [row, setRow] = useState(isNew ? { status: 'draft', images: [], page: {}, price: '' } : null)
  const [v, setV] = useState(isNew ? { price_note: 'Negotiable', features: [] } : null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('edit')
  const [busy, setBusy] = useState('')
  const [uploading, setUploading] = useState(0)
  const [ownFeature, setOwnFeature] = useState('')

  useEffect(() => {
    if (isNew) return
    let alive = true
    supabase.from('products').select('*,vendor:vendors(business_name,slug,logo_url,location,category)').eq('id', id).single().then(({ data, error: e }) => {
      if (!alive) return
      if (e || !data) { setError(e?.message || 'This vehicle could not be found'); return }
      setRow(data)
      setV(vehicleOf(data))
    })
    return () => { alive = false }
  }, [id, isNew])

  const title = vehicleTitle(v || {}, row?.name)
  const checks = useMemo(() => (v ? listingChecks(v, { price: row?.price, images: row?.images }) : []), [v, row?.price, row?.images])
  const ready = checks.every((c) => c.done)
  const doneCount = checks.filter((c) => c.done).length
  const preview = useMemo(() => {
    if (!row || !v) return null
    const clean = normaliseVehicle(v)
    return { ...row, name: title || 'Your vehicle', price: Number(row.price) || 0, page: { ...(row.page || {}), vehicle: clean, specs: specsFrom(clean), location_text: clean.location || '' },
      vendor_name: row.vendor?.business_name || (vendorId ? profile?.partner?.business_name : null) || null, status: row.status === 'out_of_stock' ? 'out_of_stock' : 'published' }
  }, [row, v, title, vendorId, profile])

  if (error) return <Empty title="This vehicle could not be opened">{error} <Link to={base}>Back to vehicles</Link></Empty>
  if (!row || !v) return <Loading />

  const set = (k) => (val) => setV((x) => ({ ...x, [k]: val }))
  const setR = (k) => (val) => setRow((x) => ({ ...x, [k]: val }))
  const images = row.images || []
  const fee = Number(row.deal_fee_pct ?? 0)
  const share = Number(row.vehicle_affiliate_share_pct ?? 50)
  const math = isStaff && Number(row.price) > 0 && fee > 0 && fee <= 100 && share >= 0 && share <= 100 ? vehicleDealBreakdown(Number(row.price), fee, share, true) : null

  const addPhotos = async (files) => {
    const list = [...files].filter((f) => f.type?.startsWith('image/'))
    if (!list.length) return
    setUploading(list.length)
    let added = 0
    for (const file of list) {
      try {
        const url = await uploadVehiclePhoto(file)
        setRow((x) => ({ ...x, images: [...(x.images || []), url] }))
        added++
      } catch (e) { toast(e.message, true) }
      setUploading((n) => Math.max(0, n - 1))
    }
    if (added) toast(added === 1 ? 'Photo added' : `${added} photos added`)
  }
  const move = (i, d) => setRow((x) => {
    const a = [...(x.images || [])]
    const j = i + d
    if (j < 0 || j >= a.length) return x
    ;[a[i], a[j]] = [a[j], a[i]]
    return { ...x, images: a }
  })
  const makeMain = (i) => setRow((x) => { const a = [...(x.images || [])]; const [p] = a.splice(i, 1); return { ...x, images: [p, ...a] } })
  const removePhoto = (i) => setRow((x) => ({ ...x, images: (x.images || []).filter((_, k) => k !== i) }))
  const addOwnFeature = () => {
    const f = ownFeature.trim()
    if (!f) return
    set('features')([...(v.features || []), f])
    setOwnFeature('')
  }

  // status: 'draft' | 'submitted' | 'published' | 'out_of_stock'
  const save = async (status) => {
    if (['published', 'submitted'].includes(status) && !ready) {
      toast(`Still needed: ${checks.filter((c) => !c.done).map((c) => c.label.toLowerCase()).join(', ')}`, true)
      return
    }
    if (status === 'published' && isStaff && (!(fee > 0 && fee <= 100) || !(share >= 0 && share <= 100) || !row.vehicle_seller_agreement_note?.trim())) {
      toast("Fill in the seller's fee, the affiliate share and the agreement note (step 7) before publishing.", true)
      return
    }
    setBusy(status)
    try {
      const clean = normaliseVehicle(v)
      const name = vehicleTitle(clean, row.name) || 'Vehicle'
      const out = {
        name,
        category: 'Vehicles',
        offering_type: 'vehicle',
        sales_model: 'negotiate',
        price: Number(row.price) || 0,
        images: images,
        description: (row.description || '').trim() || null,
        page: { ...(row.page || {}), vehicle: clean, specs: specsFrom(clean), location_text: clean.location || null },
        status,
      }
      if (status === 'published') out.rejection_reason = null
      if (isStaff) {
        out.deal_fee_pct = fee
        out.vehicle_affiliate_share_pct = share
        out.vehicle_seller_agreement_note = row.vehicle_seller_agreement_note?.trim() || null
        // Whose vehicle it is when ZaMarket lists it for a dealer or owner.
        // Private. Vehicles never count as ZaMarket stock either way.
        if (row.third_party_owner !== undefined) out.third_party_owner = row.third_party_owner?.trim() || null
        out.commission_type = 'pct'
        out.commission_value = Math.round(fee * share) / 100
      }
      let res
      if (isNew) {
        out.slug = `${slugify(name) || 'vehicle'}-${rand()}`
        out.owner_type = vendorId ? 'vendor' : 'founder'
        out.created_by = user?.id
        if (vendorId) out.vendor_id = vendorId
        res = await supabase.from('products').insert(out).select('id').single()
      } else {
        res = await supabase.from('products').update(out).eq('id', row.id).select('id').single()
      }
      if (res.error) throw new Error(/only be changed by the marketplace team/i.test(res.error.message)
        ? 'This vehicle is live, so its price and title can only be changed by ZaMarket. Message us and we will update it.'
        : res.error.message)
      toast({ draft: 'Saved as a draft', submitted: 'Sent to ZaMarket for review', published: 'Live in the showroom', out_of_stock: 'Marked as sold' }[status] || 'Saved')
      if (isNew) nav(`${base}/${res.data.id}`, { replace: true })
      else setRow((x) => ({ ...x, status }))
    } catch (e) { toast(e.message, true) } finally { setBusy('') }
  }

  const live = row.status === 'published'
  // Take a live vehicle out of the showroom, or return a dealer's listing,
  // with a note the dealer sees.
  const holdOrReturn = async (status) => {
    const note = window.prompt(status === 'suspended' ? 'Why is it on hold? The seller sees this.' : 'What should the seller fix? They see this.')
    if (!note || !note.trim()) return
    setBusy(status)
    const { error } = await supabase.from('products').update({ status, rejection_reason: note.trim() }).eq('id', row.id)
    setBusy('')
    if (error) return toast(error.message, true)
    setRow((x) => ({ ...x, status, rejection_reason: note.trim() }))
    toast(status === 'suspended' ? 'On hold. Hidden from the showroom.' : 'Sent back to the seller')
  }
  const sold = row.status === 'out_of_stock'

  return (
    <div className="vx vx-form">
      <div className="vx-form-head">
        <div>
          <Link to={base} className="vx-link">← All vehicles</Link>
          <h1>{isNew ? 'List a vehicle' : title || 'Vehicle'}</h1>
          <p>Photos, price and the details. Everything a buyer needs, on one page.</p>
        </div>
        <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
          {!isNew && <Badge status={row.status}>{PRODUCT_WORD[row.status]}</Badge>}
          {!isNew && ['published', 'out_of_stock'].includes(row.status) && <ShareVehicle r={{ ...row, page: { ...(row.page || {}), vehicle: v } }} label="Share this vehicle" />}
          {['suspended', 'rejected'].includes(row.status) && row.rejection_reason && <span className="tiny bad" style={{ maxWidth: 320, textAlign: 'right' }}>{row.rejection_reason}</span>}
          <div className="vx-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>Details</button>
            <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'on' : ''} onClick={() => { setTab('preview'); window.scrollTo(0, 0) }}>Preview</button>
          </div>
        </div>
      </div>

      <div className="vx-progress" aria-label="Listing progress">
        <div className="vx-progress-bar"><span style={{ width: `${(doneCount / checks.length) * 100}%` }} /></div>
        <ul className="vx-checks">{checks.map((c) => <li key={c.key} className={c.done ? 'done' : ''}>{c.done && VI.check}{c.label}</li>)}</ul>
      </div>

      {tab === 'preview' && preview ? (
        <div className="stack">
          <p className="vx-muted">How buyers will see it. The showroom card:</p>
          <div style={{ maxWidth: 340 }}><VehicleCard p={preview} /></div>
          <p className="vx-muted">And the vehicle page:</p>
          <VehicleView p={preview} preview />
        </div>
      ) : (
        <>
          <Step n={1} title="Photos" note="The first photo is the one buyers see first. Clear photos in daylight sell cars.">
            <div className="vx-photos">
              {images.map((src, i) => (
                <div key={`${src}-${i}`} className="vx-photo">
                  <img src={src} alt={`Photo ${i + 1}`} />
                  {i === 0 ? <span className="main-tag">Main photo</span> : <button type="button" className="main-tag set" onClick={() => makeMain(i)}>Make main</button>}
                  <div className="vx-photo-tools">
                    {i > 0 && <button type="button" onClick={() => move(i, -1)} aria-label="Move earlier">‹</button>}
                    {i < images.length - 1 && <button type="button" onClick={() => move(i, 1)} aria-label="Move later">›</button>}
                    <button type="button" className="rm" onClick={() => removePhoto(i)} aria-label="Remove photo">✕</button>
                  </div>
                </div>
              ))}
              <label className="vx-photo-add">
                {VI.camera}
                <span>{uploading ? `Uploading… ${uploading} left` : images.length ? 'Add more photos' : 'Add photos'}</span>
                <input type="file" accept="image/*" multiple hidden disabled={!!uploading} onChange={(e) => { const f = e.target.files; addPhotos(f); e.target.value = '' }} />
              </label>
            </div>
            <div>
              <p className="vx-hint" style={{ marginBottom: 6 }}>{images.length} photo{images.length === 1 ? '' : 's'}{images.length < 8 ? ' · aim for 8 or more' : ' · great'}. Take these:</p>
              <div className="vx-shotlist">{SHOTS.map((s) => <span key={s}>{s}</span>)}</div>
            </div>
          </Step>

          <Step n={2} title="Which vehicle">
            <div className="vx-fields">
              <F label="Make">
                <input list="vx-makes" value={v.make || ''} onChange={(e) => set('make')(e.target.value)} placeholder="Toyota" autoComplete="off" />
                <datalist id="vx-makes">{MAKES.map((m) => <option key={m} value={m} />)}</datalist>
              </F>
              <F label="Model"><input value={v.model || ''} onChange={(e) => set('model')(e.target.value)} placeholder="Hilux" /></F>
              <F label="Year">
                <select value={v.year || ''} onChange={(e) => set('year')(e.target.value)}><option value="">Choose the year</option>{YEARS.map((y) => <option key={y}>{y}</option>)}</select>
              </F>
              <F label="Version" optional hint="e.g. 2.8 GD-6 Raider, 1.5 G"><input value={v.variant || ''} onChange={(e) => set('variant')(e.target.value)} /></F>
              <F label="Body type" wide><Choices options={BODY_TYPES} value={v.body} onChange={set('body')} /></F>
              <F label="Colour" optional><input value={v.colour || ''} onChange={(e) => set('colour')(e.target.value)} placeholder="White" /></F>
            </div>
            {title && <div className="vx-title-preview"><span>Buyers will see it as</span>{title}</div>}
          </Step>

          <Step n={3} title="Key details" note="The four things every buyer asks first.">
            <div className="vx-fields">
              <F label="Mileage (km)" hint="As shown on the dashboard"><input inputMode="numeric" value={v.mileage_km || ''} onChange={(e) => set('mileage_km')(e.target.value.replace(/[^\d]/g, ''))} placeholder="98000" /></F>
              <F label="Engine size" optional hint="e.g. 2.8L, 1500cc"><input value={v.engine || ''} onChange={(e) => set('engine')(e.target.value)} /></F>
              <F label="Gearbox" wide><Choices options={TRANSMISSIONS} value={v.transmission} onChange={set('transmission')} /></F>
              <F label="Fuel" wide><Choices options={FUELS} value={v.fuel} onChange={set('fuel')} /></F>
              <F label="Drive" optional wide><Choices options={DRIVES} value={v.drive} onChange={set('drive')} /></F>
              <F label="Seats" optional><input inputMode="numeric" value={v.seats || ''} onChange={(e) => set('seats')(e.target.value.replace(/[^\d]/g, ''))} placeholder="5" /></F>
            </div>
          </Step>

          <Step n={4} title="Condition and papers" note="Only what the seller can show. Leave anything unknown empty.">
            <div className="vx-fields">
              <F label="Condition" optional wide><Choices options={CONDITIONS} value={v.condition} onChange={set('condition')} /></F>
              <F label="Papers" optional wide><Choices options={PAPERS} value={v.papers} onChange={set('papers')} /></F>
              <F label="Service history" optional wide><Choices options={SERVICE} value={v.service} onChange={set('service')} /></F>
              <F label="Known issues" optional wide hint="Being honest about small faults builds trust and saves wasted viewings.">
                <textarea value={v.known_issues || ''} onChange={(e) => set('known_issues')(e.target.value)} placeholder="e.g. Small dent on the back bumper. Aircon needs a regas." />
              </F>
            </div>
          </Step>

          <Step n={5} title="Features" note="Tap what the vehicle has.">
            <Choices options={[...new Set([...FEATURES, ...(v.features || [])])]} value={v.features || []} onChange={set('features')} multi />
            <div className="vx-fields">
              <F label="Something else" optional>
                <input value={ownFeature} onChange={(e) => setOwnFeature(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOwnFeature() } }} placeholder="e.g. New tyres" />
              </F>
              <div className="vx-field" style={{ justifyContent: 'flex-end' }}><button type="button" className="vx-btn ghost" onClick={addOwnFeature}>Add</button></div>
            </div>
          </Step>

          <Step n={6} title="Price and where it is">
            <div className="vx-fields">
              <F label="Asking price (K)" hint={vendorId ? 'The price buyers see. Nothing is added to it.' : "The seller's price. ZaMarket's fee is not added to it."}>
                <input inputMode="decimal" value={row.price ?? ''} onChange={(e) => setR('price')(e.target.value.replace(/[^\d.]/g, ''))} placeholder="185000" />
              </F>
              <div className="vx-field" style={{ justifyContent: 'center' }}>
                <span className="vx-field-label">Next to the price</span>
                <div className="vx-choices">
                  {[...PRICE_NOTES, ''].map((x) => <button key={x || 'none'} type="button" className={priceNote(v) === x ? 'on' : ''} aria-pressed={priceNote(v) === x} onClick={() => set('price_note')(x)}>{x || 'Nothing'}</button>)}
                </div>
                <input aria-label="Or the seller's own words" value={priceNote(v)} maxLength={40} onChange={(e) => set('price_note')(e.target.value)} placeholder="Or the seller's own words" />
              </div>
              <F label="Town where the vehicle is">
                <input list="vx-towns" value={v.location || ''} onChange={(e) => set('location')(e.target.value)} placeholder="Lusaka" autoComplete="off" />
                <datalist id="vx-towns">{TOWNS.map((t) => <option key={t} value={t} />)}</datalist>
              </F>
              <F label="When it can be seen" optional hint="e.g. Weekdays after 17:00, Saturday mornings"><input value={v.viewing || ''} onChange={(e) => set('viewing')(e.target.value)} /></F>
              <F label="Anything else buyers should know" optional wide>
                <textarea value={row.description || ''} onChange={(e) => setR('description')(e.target.value)} placeholder="e.g. One owner since new. Serviced at Toyota. Selling because we are moving." />
              </F>
            </div>
            {Number(row.price) > 0 && <p className="vx-muted">Buyers see <strong style={{ color: 'var(--vx-text)' }}>{money(row.price, { whole: true })}</strong>{priceNote(v) ? ` · ${priceNote(v)}` : ''}</p>}
          </Step>

          {isStaff && (
            <Step n={7} title="Seller agreement · private" note="Never shown to buyers. Needed before a ZaMarket-listed vehicle goes live." className="vx-private">
              <div className="vx-fields">
                <F label="Seller's success fee (%)" hint="Share of the final agreed sale price the owner pays ZaMarket"><input inputMode="decimal" value={row.deal_fee_pct ?? ''} onChange={(e) => setR('deal_fee_pct')(e.target.value.replace(/[^\d.]/g, ''))} placeholder="5" /></F>
                <F label="Affiliate share of that fee (%)" hint="50 means an affiliate who brings the buyer gets half"><input inputMode="decimal" value={row.vehicle_affiliate_share_pct ?? 50} onChange={(e) => setR('vehicle_affiliate_share_pct')(e.target.value.replace(/[^\d.]/g, ''))} /></F>
                <F label="Owner or dealer" hint="Whose vehicle this is, e.g. Nor's Motors. Private. It is never counted as ZaMarket's stock."><input value={row.third_party_owner || ''} maxLength={120} onChange={(e) => setR('third_party_owner')(e.target.value)} placeholder="e.g. Nor's Motors" /></F>
                <F label="Agreement note" wide hint="Who the seller is, how they agreed, and where the evidence is kept">
                  <textarea value={row.vehicle_seller_agreement_note || ''} onChange={(e) => setR('vehicle_seller_agreement_note')(e.target.value)} />
                </F>
              </div>
              {math && (
                <div className="vx-specs one vx-money" style={{ display: 'grid' }}>
                  <div><dt>Seller receives at the asking price</dt><dd>{money(math.sellerReceives)}</dd></div>
                  <div><dt>ZaMarket's fee</dt><dd>{money(math.grossFee)}</dd></div>
                  <div><dt>Affiliate earns, if one brought the buyer</dt><dd>{money(math.affiliateEarns)}</dd></div>
                </div>
              )}
            </Step>
          )}
        </>
      )}

      <div className="vx-savebar">
        <span className="vx-note">{ready ? (live ? 'Live in the showroom' : sold ? 'Marked as sold' : 'Ready to go') : `${checks.length - doneCount} thing${checks.length - doneCount === 1 ? '' : 's'} still needed`}</span>
        {!(vendorId && (live || sold)) && <button type="button" className="vx-btn ghost" disabled={!!busy} onClick={() => save(vendorId ? 'draft' : isNew ? 'draft' : row.status)}>{busy && busy !== 'submitted' && busy !== 'published' ? 'Saving…' : 'Save'}</button>}
        {vendorId
          ? <button type="button" className="vx-btn primary" disabled={!!busy || !ready} onClick={() => { if (!(live || sold) || window.confirm('Your changes go to ZaMarket for a quick check. The vehicle leaves the showroom until they are approved. Continue?')) save('submitted') }}>{busy === 'submitted' ? 'Sending…' : live || sold ? 'Send changes for review' : 'Send for review'}</button>
          : (
            <>
              {live && <button type="button" className="vx-btn ghost" disabled={!!busy} onClick={() => { if (window.confirm('Mark this vehicle as sold? It leaves the showroom.')) save('out_of_stock') }}>Mark as sold</button>}
              {(live || row.status === 'submitted') && <button type="button" className="vx-btn ghost" disabled={!!busy} onClick={() => holdOrReturn(live ? 'suspended' : 'rejected')}>{live ? 'Put on hold' : 'Send back'}</button>}
              {!live && <button type="button" className="vx-btn primary" disabled={!!busy || !ready} onClick={() => save('published')}>{busy === 'published' ? 'Publishing…' : sold ? 'Put back on sale' : row.status === 'suspended' ? 'Put back live' : 'Publish'}</button>}
            </>
          )}
        {!isNew && (live || sold) && <a className="vx-btn ghost" href={`/p/${row.slug || row.id}`} target="_blank" rel="noreferrer">View</a>}
      </div>
    </div>
  )
}

// Every vehicle listing in one place.
// Staff and the seller share a vehicle from here with the same poster and
// caption the showroom uses. The link is the public vehicle page.
const storeOf = (r) => (r?.vendor?.business_name ? { business_name: r.vendor.business_name, logo_url: r.vendor.logo_url, location: r.vendor.location, category: r.vendor.category } : null)
const pageLink = (r) => `${typeof window !== 'undefined' ? window.location.origin : 'https://zamarket.shop'}${r.slug ? `/car/${encodeURIComponent(r.slug)}` : `/p/${r.id}`}`
function ShareVehicle({ r, label = 'Share', className = 'vx-btn ghost' }) {
  const v = vehicleOf(r)
  return <ShareProduct product={{ ...r, offering_type: 'vehicle', name: vehicleTitle(v, r.name) }} store={storeOf(r)} link={pageLink(r)} className={className} label={label}>{VI.share}</ShareProduct>
}

export function VehicleList() {
  const { profile } = useAuth()
  const vendorId = profile?.role === 'vendor' ? profile?.partner?.id : null
  const base = vendorId ? '/vendor/vehicles' : '/admin/vehicles'
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [show, setShow] = useState('all')

  useEffect(() => {
    let q = supabase.from('products').select('*,vendor:vendors(business_name,logo_url,location,category)').eq('offering_type', 'vehicle').order('created_at', { ascending: false })
    if (vendorId) q = q.eq('vendor_id', vendorId)
    q.then(({ data, error: e }) => { if (e) setError(e.message); else setRows(data || []) })
  }, [vendorId])

  const list = (rows || []).filter((r) => show === 'all' || (show === 'live' ? r.status === 'published' : show === 'sold' ? r.status === 'out_of_stock' : !['published', 'out_of_stock'].includes(r.status)))
  const count = (k) => (rows || []).filter((r) => (k === 'live' ? r.status === 'published' : k === 'sold' ? r.status === 'out_of_stock' : !['published', 'out_of_stock'].includes(r.status))).length

  return (
    <div className="vx vx-form">
      <div className="vx-form-head">
        <div><h1>Vehicles</h1><p>The showroom: every vehicle, its status, and one tap to edit.</p></div>
        <div className="btn-row">{!vendorId && <Link className="vx-btn ghost" to="/admin/traffic">Views and enquiries</Link>}<Link className="vx-btn ghost" to="/motors" target="_blank">Open the showroom</Link><Link className="vx-btn primary" to={`${base}/new`}>List a vehicle</Link></div>
      </div>
      <div className="vx-tabs">
        {[['all', `All${rows ? ` (${rows.length})` : ''}`], ['live', `Live (${count('live')})`], ['other', `Drafts and review (${count('other')})`], ['sold', `Sold (${count('sold')})`]].map(([k, l]) => (
          <button type="button" key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>
        ))}
      </div>
      {error ? <Empty title="Vehicles could not be loaded">{error}</Empty>
        : rows === null ? <Loading />
          : list.length ? (
            <div className="vx-admin-list">
              {list.map((r) => {
                const v = vehicleOf(r)
                return (
                  <div key={r.id} className="vx-admin-item">
                    <Link to={`${base}/${r.id}`} className="vx-admin-row">
                      <span className="vx-admin-photo">{r.images?.[0] ? <img src={r.images[0]} alt="" loading="lazy" /> : VI.camera}</span>
                      <span className="vx-admin-main">
                        <strong>{vehicleTitle(v, r.name)}</strong>
                        <span>{money(r.price, { whole: true })} · {(r.images || []).length} photos · {v.location || 'No town yet'}{r.vendor?.business_name ? ` · ${r.vendor.business_name}` : r.third_party_owner ? ` · for ${r.third_party_owner}` : ''}</span>
                        {!vendorId && !r.vendor_id && !r.third_party_owner && <span className="vx-owner-missing">Whose car is this? Tap to add the owner</span>}
                      </span>
                      <Badge status={r.status} />
                    </Link>
                    {r.status === 'published' && <ShareVehicle r={r} className="vx-btn ghost vx-admin-share" />}
                  </div>
                )
              })}
            </div>
          ) : <Empty title={rows.length ? 'Nothing here' : 'No vehicles yet'}><Link className="vx-btn primary" to={`${base}/new`}>List the first vehicle</Link></Empty>}
    </div>
  )
}
