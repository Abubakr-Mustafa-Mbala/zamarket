import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { money, slugify } from '../../lib/format'
import { Loading, Empty, Badge, useToast } from '../../components/ui'
import { uploadVehiclePhoto } from '../../lib/photos'
import { PRODUCT_WORD } from '../../lib/statuses'
import { firstBookable, dayLabel, addDays, cleanTiers } from '../../lib/lunch'
import { LunchView } from '../public/Lunch'
import { moveOrderTo } from '../../lib/orderMove'
import '../../lunch.css'

const COLS = 'id,vendor_id,slug,title,tagline,about_cook,in_the_box,cover_url,proof_images,dishes,delivery_windows,delivery_area,cutoff_hour,guarantee,status,rejection_reason,created_at,group_discounts,trial_first,day_discounts'
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WINDOW_CHOICES = ['11:00–11:30', '11:30–12:00', '12:00–12:30', '12:30–13:00', '13:00–13:30', '13:30–14:00']
const rand = () => Math.random().toString(36).slice(2, 6)
const BLANK = { title: 'Home Lunch, at Work', tagline: 'A proper homemade lunch, delivered to your workplace on the days you choose.', about_cook: '', in_the_box: '', cover_url: '', proof_images: [], dishes: [], delivery_windows: ['11:30–12:00', '12:00–12:30', '12:30–13:00'], delivery_area: '', cutoff_hour: 18, guarantee: true, status: 'draft' }

function F({ label, optional, hint, wide, children }) {
  return <label className={`ln-field ${wide ? 'wide' : ''}`}><span>{label}{optional && <em> (optional)</em>}</span>{children}{hint && <small className="ln-hint">{hint}</small>}</label>
}

export default function LunchDeals() {
  const { profile, isStaff } = useAuth()
  const vendorId = profile?.role === 'vendor' ? profile?.partner?.id : null
  const [tab, setTab] = useState('plan')
  const [deals, setDeals] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let q = supabase.from('meal_deals').select(COLS).order('created_at', { ascending: false })
    if (vendorId) q = q.eq('vendor_id', vendorId)
    q.then(({ data, error }) => {
      if (error) { setDeals([]); return }
      setDeals(data || [])
      if (vendorId && data?.length && !openId) setOpenId(data[0].id)
    })
  }, [vendorId, reload]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = (deals || []).find((d) => d.id === openId)
  const tabs = [['plan', 'Lunch plan'], ['kitchen', 'Kitchen'], ...(isStaff ? [['bookings', 'Bookings']] : [])]

  return (
    <div className="ln ln-admin">
      <div>
        <h1 style={{ fontSize: '1.6rem' }}>Lunch plans</h1>
        <p className="ln-muted">Homemade lunches delivered to workplaces. {vendorId ? 'You choose the dishes, the days and how many you can cook.' : 'Review, publish and run the lunch plans.'}</p>
      </div>
      <div className="ln-chips" role="tablist">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'plan' && (deals === null ? <Loading /> : (
        <>
          {(isStaff || deals.length > 1) && (
            <section className="ln-section">
              <div className="ln-head"><h2>{isStaff ? 'All lunch plans' : 'Your lunch plans'}</h2></div>
              {deals.length ? deals.map((d) => (
                <button key={d.id} type="button" className={`ln-dish-row ${openId === d.id ? 'on' : ''}`} style={{ textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer' }} onClick={() => setOpenId(d.id)}>
                  {d.cover_url ? <img src={d.cover_url} alt="" /> : <span className="ph" />}
                  <span><strong>{d.title}</strong><small>/lunch/{d.slug}</small></span>
                  <Badge status={d.status}>{PRODUCT_WORD[d.status]}</Badge>
                </button>
              )) : <p className="ln-muted">No lunch plans yet.</p>}
            </section>
          )}
          {open
            ? <DealEditor key={open.id} deal={open} vendorId={open.vendor_id} onSaved={() => setReload((n) => n + 1)} />
            : vendorId
              ? <DealEditor key="new" deal={{ ...BLANK, vendor_id: vendorId }} vendorId={vendorId} onSaved={(id) => { setOpenId(id); setReload((n) => n + 1) }} />
              : isStaff && <StaffNew onCreated={(id) => { setOpenId(id); setReload((n) => n + 1) }} />}
        </>
      ))}
      {tab === 'kitchen' && <Kitchen deals={deals || []} vendorId={vendorId} />}
      {tab === 'bookings' && isStaff && <Bookings deals={deals || []} />}
    </div>
  )
}

function StaffNew({ onCreated }) {
  const [vendors, setVendors] = useState([])
  const [v, setV] = useState('')
  useEffect(() => { supabase.from('vendors').select('id,business_name').eq('status', 'approved').order('business_name').then(({ data }) => setVendors(data || [])) }, [])
  if (!v) {
    return (
      <section className="ln-section">
        <div className="ln-head"><h2>Start a lunch plan for a seller</h2></div>
        <F label="Seller"><select value={v} onChange={(e) => setV(e.target.value)}><option value="">Choose…</option>{vendors.map((x) => <option key={x.id} value={x.id}>{x.business_name}</option>)}</select></F>
      </section>
    )
  }
  return <DealEditor deal={{ ...BLANK, vendor_id: v }} vendorId={v} onSaved={onCreated} />
}

function DealEditor({ deal, vendorId, onSaved }) {
  const toast = useToast()
  const { isStaff, profile } = useAuth()
  const isNew = !deal.id
  const [d, setD] = useState({ ...BLANK, ...deal })
  const [products, setProducts] = useState(null)
  const [vendor, setVendor] = useState(null)
  const [view, setView] = useState('edit')
  const [busy, setBusy] = useState('')
  const [uploading, setUploading] = useState(0)
  const [pct, setPct] = useState('')
  const [cap, setCap] = useState(null)
  const [editDish, setEditDish] = useState(null)
  // Customer reviews (screenshots from WhatsApp) are kept apart from kitchen
  // photos. Read separately, so nothing breaks before the SQL update is run.
  const [reviewsOk, setReviewsOk] = useState(true)
  useEffect(() => {
    if (!deal.id) return
    supabase.from('meal_deals').select('review_images').eq('id', deal.id).maybeSingle()
      .then(({ data, error }) => { if (error) setReviewsOk(false); else setD((x) => ({ ...x, review_images: data?.review_images || [] })) })
  }, [deal.id])
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }))

  const loadProducts = () => supabase.from('products').select('id,name,price,vendor_price,images,order_days,daily_limit,lead_time_days,fulfilment,status,benefits,vendor_id,slug,description,lunch_only').eq('vendor_id', vendorId).order('name')
    .then(({ data }) => setProducts(data || []))
  useEffect(() => {
    loadProducts()
    supabase.from('public_vendors').select('id,business_name,slug,logo_url,town').eq('id', vendorId).maybeSingle().then(({ data }) => setVendor(data || { business_name: profile?.partner?.business_name }))
    if (isStaff) {
      supabase.from('settings').select('key,value').in('key', ['commission_allowance_pct', 'default_commission_pct']).then(({ data }) => {
        const m = Object.fromEntries((data || []).map((r) => [r.key, Number(r.value)]))
        setCap(m.commission_allowance_pct ?? 10)
        if (!deal.id) setPct(String(m.commission_allowance_pct ?? 10))
      })
      if (deal.id) supabase.rpc('meal_deal_affiliate_rate', { p_deal: deal.id }).then(({ data }) => { if (data != null) setPct(String(data)) })
    }
  }, [vendorId]) // eslint-disable-line react-hooks/exhaustive-deps

  const picked = new Map((d.dishes || []).map((x) => [x.product_id, x]))
  // Only the lunch plan's own dishes. Shop products stay in the shop; one
  // added to the plan before shows here only so it can be taken out.
  const dishes = (products || []).filter((p) => p.lunch_only || picked.has(p.id))
  const chosen = (products || []).filter((p) => picked.has(p.id))
  const toggleDish = (p) => set('dishes')(picked.has(p.id) ? d.dishes.filter((x) => x.product_id !== p.id) : [...d.dishes, { product_id: p.id, kind: 'box' }])
  const setDish = (id, patch) => set('dishes')(d.dishes.map((x) => (x.product_id === id ? { ...x, ...patch } : x)))
  const checks = [
    ['A cover photo of real food', Boolean(d.cover_url)],
    ['At least one dish', d.dishes.length > 0],
    ['Every dish has a photo', chosen.length > 0 && chosen.every((p) => p.images?.length)],
    ['Every dish has cooking days', chosen.length > 0 && chosen.every((p) => p.order_days?.length)],
    ['Every dish has a daily limit', chosen.length > 0 && chosen.every((p) => p.daily_limit)],
    ['Who cooks (a few lines)', (d.about_cook || '').trim().length >= 40],
    ['At least 2 kitchen or packing photos', (d.proof_images || []).length >= 2],
  ]
  const ready = checks.every(([, ok]) => ok)

  const upload = async (files, into) => {
    const list = [...files].filter((f) => f.type?.startsWith('image/'))
    setUploading(list.length)
    for (const f of list) {
      try {
        const url = await uploadVehiclePhoto(f)
        if (into === 'cover') set('cover_url')(url)
        else if (into === 'review') setD((x) => ({ ...x, review_images: [...(x.review_images || []), url] }))
        else setD((x) => ({ ...x, proof_images: [...(x.proof_images || []), url] }))
      } catch (e) { toast(e.message, true) }
      setUploading((n) => Math.max(0, n - 1))
    }
  }

  const save = async (status) => {
    if (status === 'submitted' && !ready) return toast('Finish the checklist first so customers trust it', true)
    setBusy(status || 'save')
    const row = {
      title: d.title.trim(), tagline: d.tagline?.trim() || null, about_cook: d.about_cook?.trim() || null, in_the_box: d.in_the_box?.trim() || null,
      cover_url: d.cover_url || null, proof_images: d.proof_images || [], dishes: d.dishes, delivery_windows: d.delivery_windows,
      delivery_area: d.delivery_area?.trim() || null, cutoff_hour: Number(d.cutoff_hour) || 18, guarantee: !!d.guarantee,
      trial_first: !!d.trial_first,
    }
    // Team discounts are ZaMarket's to set (they come out of ZaMarket's share).
    if (isStaff) { row.group_discounts = cleanTiers(d.group_discounts); row.day_discounts = cleanTiers(d.day_discounts).map((t) => ({ min: Math.min(14, t.min), pct: t.pct })) }
    if (status) row.status = status
    // A seller's change to a live plan goes back to ZaMarket for a quick check.
    if (!isStaff && !status && !['draft', 'submitted'].includes(d.status)) {
      if (['published', 'suspended'].includes(d.status) && !window.confirm('Your changes go to ZaMarket for a quick check. The lunch plan is hidden from customers until approved. Continue?')) { setBusy(''); return }
      row.status = d.status === 'rejected' ? 'draft' : 'submitted'
    }
    if (reviewsOk) row.review_images = d.review_images || []
    let res
    if (isNew) res = await supabase.from('meal_deals').insert({ ...row, vendor_id: vendorId, slug: `${slugify(row.title).slice(0, 60) || 'lunch'}-${rand()}`, status: status || 'draft' }).select('id').single()
    else res = await supabase.from('meal_deals').update(row).eq('id', d.id).select('id').single()
    setBusy('')
    if (res.error) return toast(res.error.message, true)
    toast(status === 'submitted' ? 'Sent to ZaMarket for review' : 'Saved')
    if (row.status) setD((x) => ({ ...x, status: row.status }))
    onSaved?.(res.data.id)
  }

  const decide = async (status) => {
    let reason = null
    if (status === 'suspended' || status === 'rejected') {
      reason = window.prompt(status === 'suspended' ? 'Why is it on hold? The seller sees this.' : 'What should the seller fix? They see this.')
      if (!reason?.trim()) return
    }
    if (status === 'published' && isNew) return toast('Save it first', true)
    setBusy(status)
    if (status === 'published') { const r = await supabase.from('meal_deals').update({ dishes: d.dishes }).eq('id', d.id); if (r.error) { setBusy(''); return toast(r.error.message, true) } }
    const { error } = await supabase.rpc('set_meal_deal_status', { p_deal: d.id, p_status: status, p_affiliate_pct: pct === '' ? null : Number(pct), p_reason: reason })
    setBusy('')
    if (error) return toast(error.message, true)
    setD((x) => ({ ...x, status, rejection_reason: reason }))
    toast({ published: 'Live. Customers can book now.', suspended: 'On hold. Hidden from customers.', rejected: 'Sent back to the seller' }[status])
    onSaved?.(d.id)
  }

  if (products === null) return <Loading />
  const previewProducts = chosen.map((p) => ({ ...p, price: Number(p.price) }))

  return (
    <>
      <div className="ln-chips">
        <button type="button" className={view === 'edit' ? 'on' : ''} onClick={() => setView('edit')}>Details</button>
        <button type="button" className={view === 'preview' ? 'on' : ''} onClick={() => setView('preview')}>Preview</button>
        {!isNew && d.status === 'published' && <a className="ln-link" style={{ alignSelf: 'center', marginLeft: 8 }} href={`/lunch/${d.slug}`} target="_blank" rel="noreferrer">Open the live page →</a>}
      </div>
      {['suspended', 'rejected'].includes(d.status) && d.rejection_reason && <p className="ln-section" style={{ borderColor: '#f09080' }}><b>{d.status === 'suspended' ? 'On hold: ' : 'To fix: '}</b>{d.rejection_reason}</p>}

      {view === 'preview' ? (
        <LunchView deal={{ ...d, id: d.id || 'preview' }} products={previewProducts} vendor={vendor} availability={[]} preview />
      ) : (
        <>
          <section className="ln-section">
            <div className="ln-head"><h2>Ready to win trust?</h2><p>Office workers want proof before they pay. Each tick makes it easier to say yes.</p></div>
            <div className="ln-chips">{checks.map(([l, ok]) => <span key={l} className={`ln-pill ${ok ? '' : 'wait'}`}>{ok ? '✓ ' : ''}{l}</span>)}</div>
          </section>

          <section className="ln-section">
            <div className="ln-head"><h2>1. The offer</h2></div>
            <div className="ln-fields">
              <F label="Title" wide><input value={d.title} onChange={(e) => set('title')(e.target.value)} maxLength={90} /></F>
              <F label="One line that sells it" wide hint="e.g. A proper homemade lunch, delivered to your workplace on the days you choose."><input value={d.tagline || ''} onChange={(e) => set('tagline')(e.target.value)} maxLength={160} /></F>
              <F label="In every lunch" optional wide hint="e.g. A main, a starch, vegetables or salad, and a piece of fruit. Packed in a sealed box with a fork and napkin.">
                <textarea value={d.in_the_box || ''} onChange={(e) => set('in_the_box')(e.target.value)} maxLength={600} />
              </F>
            </div>
            <div className="ln-field"><span>Cover photo (a real dish, in daylight)</span>
              <div className="ln-thumbs">
                {d.cover_url && <div><img src={d.cover_url} alt="Cover" /><button type="button" onClick={() => set('cover_url')('')} aria-label="Remove">✕</button></div>}
                {!d.cover_url && <label>{uploading ? 'Uploading…' : 'Add cover'}<input type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files, 'cover'); e.target.value = '' }} /></label>}
              </div>
            </div>
          </section>

          <section className="ln-section">
            <div className="ln-head"><h2>2. The dishes</h2><p>Add each lunch dish here: its photo, price, the weekday it is cooked and how many you can make. Lunch dishes are not shown in your shop; customers get them only through this lunch plan.</p></div>
            <button type="button" className="ln-btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => setEditDish({})}>Add a lunch dish</button>
            {editDish && !editDish.id && <LunchDishForm key="new" dish={editDish} vendorId={vendorId} live={deal.status === 'published'} isStaff={isStaff}
              onClose={() => setEditDish(null)} onSaved={(id) => { setEditDish(null); loadProducts(); if (id && !picked.has(id)) set('dishes')([...(d.dishes || []), { product_id: id, kind: 'box' }]) }} />}
            <div className="ln-dish-pick">
              {dishes.length === 0 && <p className="ln-muted">No lunch dishes yet. Tap &ldquo;Add a lunch dish&rdquo; for each one.</p>}
              {dishes.map((p) => {
                const on = picked.has(p.id)
                const problems = [!p.images?.length && 'no photo', !p.order_days?.length && 'no cooking days', !p.daily_limit && 'no daily limit', p.status !== 'published' && !p.lunch_only && 'not live yet'].filter(Boolean)
                return (
                  <div key={p.id} className="ln-dish-wrap">
                  <div className={`ln-dish-row ${on ? 'on' : ''}`}>
                    {p.images?.[0] ? <img src={p.images[0]} alt="" /> : <span className="ph" />}
                    <span>
                      <strong>{p.name}{p.lunch_only && <em className="ln-tag">Lunch only</em>}</strong>
                      {p.lunch_only
                        ? <button type="button" className="ln-link ln-edit" onClick={() => setEditDish(editDish?.id === p.id ? null : p)}>{editDish?.id === p.id ? 'Close' : 'Edit dish'}</button>
                        : <em className="ln-tag ln-tag-shop">From your shop: tap Remove to take it out of the plan</em>}
                      <small>{Number(p.price) > 0 ? money(p.price, { whole: true }) : 'Price set when approved'} · {p.order_days?.length ? p.order_days.map((n) => DAYS[n]).join(', ') : 'Mon–Fri'} · {p.daily_limit ? `${p.daily_limit} a day` : 'no limit'}</small>
                      {problems.length > 0 && <small className="bad"> · {problems.join(', ')}</small>}
                      {on && (
                        <span className="ln-chips" style={{ marginTop: 6 }}>
                          <button type="button" className={picked.get(p.id).kind !== 'tray' ? 'on' : ''} onClick={() => setDish(p.id, { kind: 'box' })}>Lunch box</button>
                          <button type="button" className={picked.get(p.id).kind === 'tray' ? 'on' : ''} onClick={() => setDish(p.id, { kind: 'tray' })}>Sharing tray</button>
                          {picked.get(p.id).kind === 'tray' && <input aria-label="Serves" inputMode="numeric" style={{ width: 90, minHeight: 38, borderRadius: 10, border: '1px solid var(--ln-line)', background: 'var(--ln-bg)', color: 'var(--ln-text)', padding: '0 8px' }} placeholder="Serves" value={picked.get(p.id).serves || ''} onChange={(e) => setDish(p.id, { serves: e.target.value.replace(/\D/g, '') || null })} />}
                        </span>
                      )}
                    </span>
                    <button type="button" className={`ln-btn ${on ? 'ghost' : 'primary'}`} style={{ minHeight: 38 }} onClick={() => toggleDish(p)}>{on ? 'Remove' : 'Add'}</button>
                  </div>
                  {editDish?.id === p.id && <LunchDishForm key={p.id} dish={p} vendorId={vendorId} live={deal.status === 'published'} isStaff={isStaff}
                    onClose={() => setEditDish(null)} onSaved={() => { setEditDish(null); loadProducts() }} />}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="ln-section">
            <div className="ln-head"><h2>3. Delivery and ordering</h2></div>
            <div className="ln-field"><span>Delivery times customers can choose</span>
              <div className="ln-chips">{WINDOW_CHOICES.map((w) => {
                const on = d.delivery_windows.includes(w)
                return <button key={w} type="button" className={on ? 'on' : ''} onClick={() => set('delivery_windows')(on ? d.delivery_windows.filter((x) => x !== w) : WINDOW_CHOICES.filter((x) => x === w || d.delivery_windows.includes(x)))}>{w}</button>
              })}</div>
            </div>
            <div className="ln-fields">
              <F label="Orders close the day before at"><select value={d.cutoff_hour} onChange={(e) => set('cutoff_hour')(Number(e.target.value))}>{[14, 15, 16, 17, 18, 19, 20, 21].map((h) => <option key={h} value={h}>{h}:00</option>)}</select></F>
              <F label="Where we deliver" optional hint="e.g. Offices in central Lusaka: Cairo Road, Longacres, Rhodes Park"><input value={d.delivery_area || ''} onChange={(e) => set('delivery_area')(e.target.value)} maxLength={300} /></F>
            </div>
            <label className="ln-field" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <input type="checkbox" checked={!!d.trial_first} onChange={(e) => set('trial_first')(e.target.checked)} style={{ width: 22, height: 22, minHeight: 0 }} />
              <span>Let first-time customers taste first: they pay for the first lunch, then for the other days after tasting it. <small className="ln-hint">Only someone who has never booked with you can choose this. The other days are cooked only once paid.</small></span>
            </label>
            {isStaff && <TierEditor title="Package discount (ZaMarket pays for it)" unit="days" max={3} limit={14} hint="Counted on the number of days booked: e.g. 5 days (a full week) 5% off. A day gets the package or the team discount, whichever is bigger, never both." tiers={d.day_discounts || []} onChange={set('day_discounts')} />}
            {isStaff && <TierEditor tiers={d.group_discounts || []} onChange={set('group_discounts')} />}
            <label className="ln-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" checked={!!d.guarantee} onChange={(e) => set('guarantee')(e.target.checked)} style={{ width: 22, height: 22, minHeight: 0 }} />
              <span>Guarantee: a lunch that is late or not as described is free</span>
            </label>
          </section>

          <section className="ln-section">
            <div className="ln-head"><h2>4. Who cooks</h2><p>This is what makes strangers trust you. Real people, a real kitchen.</p></div>
            <F label="About you and your kitchen" wide hint="Who you are, how long you have cooked, how you keep things clean, your health permit or food-handler certificate if you have one.">
              <textarea value={d.about_cook || ''} onChange={(e) => set('about_cook')(e.target.value)} maxLength={1500} />
            </F>
            <div className="ln-field"><span>Kitchen and packing photos</span>
              <div className="ln-thumbs">
                {(d.proof_images || []).map((src, i) => (
                  <div key={`${src}-${i}`}>
                    <img src={src} alt="" />
                    <button type="button" onClick={() => set('proof_images')(d.proof_images.filter((_, k) => k !== i))} aria-label="Remove">✕</button>
                    {reviewsOk && <button type="button" className="ln-thumb-move" onClick={() => setD((x) => ({ ...x, proof_images: x.proof_images.filter((_, k) => k !== i), review_images: [...(x.review_images || []), src] }))}>It's a review</button>}
                  </div>
                ))}
                <label>{uploading ? 'Uploading…' : 'Add photos'}<input type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files, 'proof'); e.target.value = '' }} /></label>
              </div>
              {reviewsOk && (d.proof_images || []).length > 1 && (
                <button type="button" className="ln-btn ghost" style={{ alignSelf: 'flex-start' }}
                  onClick={() => setD((x) => ({ ...x, review_images: [...(x.review_images || []), ...(x.proof_images || [])], proof_images: [] }))}>
                  These are all customer messages: move them to reviews
                </button>
              )}
              <small className="ln-hint">Your kitchen, cooking and packed lunches. Only real photos. Ask before posting anyone's face.{reviewsOk ? ' A customer message by mistake here? Tap "It\'s a review" to move it.' : ''}</small>
            </div>
          </section>

          <section className="ln-section">
            <div className="ln-head"><h2>5. What customers said</h2><p>Screenshots of real messages from people who ordered (WhatsApp, SMS). They show whole, not cut, in their own section. Never posters or shared photos.</p></div>
            {reviewsOk ? (
              <div className="ln-field">
                <div className="ln-thumbs ln-thumbs-tall">
                  {(d.review_images || []).map((src, i) => <div key={`${src}-${i}`}><img src={src} alt="" /><button type="button" onClick={() => set('review_images')(d.review_images.filter((_, k) => k !== i))} aria-label="Remove">✕</button></div>)}
                  <label>{uploading ? 'Uploading…' : 'Add screenshots'}<input type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files, 'review'); e.target.value = '' }} /></label>
                </div>
                <small className="ln-hint">Only real messages. Cover a customer's number or face if they did not agree to show it.</small>
              </div>
            ) : <p className="ln-muted">Run the latest SQL update in Supabase to turn this on.</p>}
          </section>

          {isStaff && !isNew && (
            <section className="ln-section" style={{ borderColor: '#8e6cff' }}>
              <div className="ln-head"><h2>Affiliate rate · private</h2><p>Paid to the affiliate on each lunch delivered to a customer they brought. Up to {cap ?? 10}%, the room already built into the price.</p></div>
              <F label="Affiliate % per lunch"><input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ''))} /></F>
            </section>
          )}
        </>
      )}

      <div className="ln-savebar">
        <span className="note">{d.status === 'published' ? 'Live' : d.status === 'submitted' ? 'Waiting for review' : ready ? 'Ready to send' : `${checks.filter(([, ok]) => !ok).length} to finish`}</span>
        <button type="button" className="ln-btn ghost" disabled={!!busy} onClick={() => save(null)}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        {!isStaff && d.status !== 'published' && <button type="button" className="ln-btn primary" disabled={!!busy || !ready} onClick={() => save('submitted')}>Send for review</button>}
        {isStaff && !isNew && d.status !== 'published' && <button type="button" className="ln-btn primary" disabled={!!busy} onClick={() => decide('published')}>{d.status === 'suspended' ? 'Put back live' : 'Publish'}</button>}
        {isStaff && !isNew && d.status === 'published' && <button type="button" className="ln-btn primary" disabled={!!busy} onClick={() => decide('published')}>Update rate</button>}
        {isStaff && !isNew && d.status === 'published' && <button type="button" className="ln-btn ghost" disabled={!!busy} onClick={() => decide('suspended')}>Put on hold</button>}
        {isStaff && !isNew && d.status === 'submitted' && <button type="button" className="ln-btn ghost" disabled={!!busy} onClick={() => decide('rejected')}>Send back</button>}
      </div>
    </>
  )
}

// The morning view: how many of each dish, and where each lunch goes.
// Staff only: discount levels for team orders. ZaMarket pays for them from
// its share, so the seller is still paid in full for every lunch.
function TierEditor({ tiers, onChange, title = 'Team discount (ZaMarket pays for it)', unit = 'lunches', max = 4, limit = 100, hint = 'Counted per delivery day: a manager ordering 10 lunches for Monday gets the 10+ level on Monday. At most 10%.' }) {
  const rows = tiers.length ? tiers : []
  const put = (i, k, v) => onChange(rows.map((t, j) => (j === i ? { ...t, [k]: v } : t)))
  return (
    <div className="ln-field">
      <span>{title}</span>
      {rows.map((t, i) => (
        <div key={i} className="ln-tier-row">
          <label>From <input type="number" min={2} max={limit} value={t.min} onChange={(e) => put(i, 'min', e.target.value)} /> {unit}</label>
          <label><input type="number" min={1} max={10} step={0.5} value={t.pct} onChange={(e) => put(i, 'pct', e.target.value)} />% off</label>
          <button type="button" className="ln-mini" onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {rows.length < max && <button type="button" className="ln-mini" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...rows, rows.length ? { min: Number(rows[rows.length - 1].min) * 2 || 10, pct: Math.min(10, Number(rows[rows.length - 1].pct) + 3) } : { min: 5, pct: 5 }])}>Add a level</button>}
      <small className="ln-hint">{hint}</small>
    </div>
  )
}

// A dish that exists only for the lunch plan: never listed in the shop.
// The seller types what she wants to receive; the shop price is worked out
// the same way as for every product. It goes live with the lunch plan.
const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat']]
function LunchDishForm({ dish, vendorId, live, isStaff, onClose, onSaved }) {
  const toast = useToast()
  const { user } = useAuth()
  const isNew = !dish.id
  const [f, setF] = useState({ name: dish.name || '', description: dish.description || '', take: dish.vendor_price ?? '', images: dish.images || [], days: dish.order_days || [], limit: dish.daily_limit || '' })
  const [busy, setBusy] = useState(false)
  const [up, setUp] = useState(false)
  const lockedName = !isStaff && dish.status === 'published'
  const box = useRef(null)
  useEffect(() => { box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [])
  const addPhoto = async (files) => {
    setUp(true)
    for (const file of [...files].filter((x) => x.type?.startsWith('image/'))) {
      try { const url = await uploadVehiclePhoto(file); setF((x) => ({ ...x, images: [...x.images, url] })) } catch (e) { toast(e.message, true) }
    }
    setUp(false)
  }
  const save = async () => {
    if (f.name.trim().length < 3) return toast('Give the dish a name', true)
    if (!(Number(f.take) > 0)) return toast('Enter what you want to receive for one lunch', true)
    if (!f.images.length) return toast('Add a real photo of the dish', true)
    if (!f.days.length) return toast('Choose the day or days you cook it', true)
    if (!(Number(f.limit) > 0)) return toast('How many can you make that day?', true)
    setBusy(true)
    const row = {
      description: f.description.trim() || null, images: f.images, order_days: [...f.days].sort(), daily_limit: Math.round(Number(f.limit)),
      fulfilment: 'made_to_order', lead_time_days: 0, category: 'Lunch', lunch_only: true,
    }
    if (!lockedName) { row.name = f.name.trim(); row.vendor_price = Number(f.take) }
    let res
    if (isNew) {
      res = await supabase.from('products').insert({ ...row, slug: `${slugify(f.name).slice(0, 50) || 'lunch'}-${Math.random().toString(36).slice(2, 7)}`, vendor_id: vendorId, owner_type: 'vendor', created_by: user?.id,
        status: isStaff && live ? 'published' : 'draft' }).select('id').single()
    } else {
      if (!isStaff) row.status = dish.status === 'published' ? 'submitted' : dish.status
      res = await supabase.from('products').update(row).eq('id', dish.id).select('id').single()
    }
    setBusy(false)
    if (res.error) return toast(/only be changed by the marketplace team/i.test(res.error.message) ? 'This dish is live. Message ZaMarket to change its name or price.' : res.error.message, true)
    toast(isNew ? 'Dish added to the lunch plan. Save the plan to keep it.' : 'Dish saved')
    onSaved?.(res.data?.id)
  }
  return (
    <div className="ln-dish-form" ref={box}>
      <div className="ln-fields">
        <label className="ln-field"><span>Dish name</span><input value={f.name} disabled={lockedName} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Grilled chicken and rice" /></label>
        <label className="ln-field"><span>What you receive for one lunch (K)</span><input inputMode="decimal" value={f.take} disabled={lockedName} onChange={(e) => setF({ ...f, take: e.target.value.replace(/[^\d.]/g, '') })} placeholder="e.g. 60" /><small className="ln-hint">Customers see the shop price, worked out the same way as your other products.</small></label>
      </div>
      <label className="ln-field"><span>What is in it (optional)</span><textarea maxLength={400} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Grilled chicken quarter, savoury rice, coleslaw" /></label>
      <div className="ln-field"><span>Cooked on</span>
        <div className="ln-chips">{WEEKDAYS.map(([n, l]) => <button key={n} type="button" className={f.days.includes(n) ? 'on' : ''} onClick={() => setF({ ...f, days: f.days.includes(n) ? f.days.filter((x) => x !== n) : [...f.days, n] })}>{l}</button>)}</div>
      </div>
      <label className="ln-field"><span>Most you can make that day</span><input inputMode="numeric" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value.replace(/\D/g, '') })} placeholder="e.g. 20" /></label>
      <div className="ln-field"><span>Photo of the real dish</span>
        <div className="ln-thumbs">
          {f.images.map((src, i) => <div key={`${src}-${i}`}><img src={src} alt="" /><button type="button" onClick={() => setF({ ...f, images: f.images.filter((_, k) => k !== i) })} aria-label="Remove">✕</button></div>)}
          <label>{up ? 'Uploading…' : 'Add photo'}<input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhoto(e.target.files); e.target.value = '' }} /></label>
        </div>
      </div>
      {lockedName && <p className="ln-hint">This dish is live, so its name and price are changed by ZaMarket. You can still change its photo, days and how many you make.</p>}
      <div className="ln-row">
        <button type="button" className="ln-btn primary" disabled={busy || up} onClick={save}>{busy ? 'Saving…' : isNew ? 'Add dish' : 'Save dish'}</button>
        <button type="button" className="ln-btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

function Kitchen({ deals, vendorId }) {
  const [date, setDate] = useState(() => firstBookable(23))
  const [vendor, setVendor] = useState(vendorId || deals[0]?.vendor_id || '')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [counts, setCounts] = useState({})
  const [tick, setTick] = useState(0)
  const toast = useToast()
  const { isStaff } = useAuth()
  const vendors = [...new Set(deals.map((d) => d.vendor_id))]
  useEffect(() => { if (!vendor && deals[0]) setVendor(deals[0].vendor_id) }, [deals]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!vendor) return
    setData(null); setError('')
    supabase.rpc('meal_kitchen', { p_date: date, p_vendor: vendor }).then(({ data: k, error: e }) => { if (e) setError(e.message); else setData(k) })
  }, [date, vendor, tick])
  useEffect(() => {
    if (!vendor) return
    supabase.rpc('meal_kitchen_days', { p_vendor: vendor, p_days: 14 }).then(({ data: k }) => setCounts(Object.fromEntries((k || []).map((x) => [x.date, x]))), () => {})
  }, [vendor, tick])
  // The kitchen marks each drop-off as cooking, then ready for the rider.
  const step = async (x, status) => {
    for (const id of x.item_ids || []) {
      const { error: e } = await supabase.rpc('vendor_set_item_status', { p_item: id, p_status: status })
      if (e) return toast(e.message, true)
    }
    toast(status === 'ready' ? 'Ready. The rider collects it.' : 'Marked as cooking')
    setTick((n) => n + 1)
  }
  const move = async (x, status) => {
    const { error: e } = await moveOrderTo(supabase, x.order_id, status)
    if (e) return toast(e.message, true)
    toast(status === 'delivered' ? 'Delivered' : 'On the way'); setTick((n) => n + 1)
  }
  const total = (data?.dishes || []).reduce((t, x) => t + x.quantity, 0)
  const paid = (data?.drops || []).filter((x) => x.paid).length
  const days = Array.from({ length: 10 }, (_, i) => addDays(firstBookable(23), i - 1))
  return (
    <section className="ln-section">
      <div className="ln-head"><h2>Kitchen</h2><p>Everything to cook and pack for the day, added up for you.</p></div>
      <div className="ln-kdays">{days.map((x) => <button key={x} type="button" className={date === x ? 'on' : ''} onClick={() => setDate(x)}><span>{dayLabel(x)}</span><b>{counts[x]?.lunches ?? 0}</b><small>{counts[x]?.lunches ? `${counts[x].paid} paid` : 'lunches'}</small></button>)}</div>
      {!vendorId && vendors.length > 1 && (
        <F label="Seller"><select value={vendor} onChange={(e) => setVendor(e.target.value)}>{vendors.map((v) => <option key={v} value={v}>{deals.find((d) => d.vendor_id === v)?.title || v}</option>)}</select></F>
      )}
      {error ? <p className="ln-muted">{/function|schema cache/i.test(error) ? 'Run the latest SQL update in Supabase first.' : error}</p> : !data ? <Loading /> : (
        <>
          <div className="ln-kitchen-top">
            <div><span>Lunches</span><strong>{total}</strong></div>
            <div><span>Dishes</span><strong>{data.dishes.length}</strong></div>
            <div><span>Paid drop-offs</span><strong>{paid}/{data.drops.length}</strong></div>
          </div>
          {data.dishes.length ? <div className="ln-cook">{data.dishes.map((x) => <div key={x.name}><span>{x.name}</span><b>{x.quantity}</b></div>)}</div> : <p className="ln-muted">No lunches booked for {dayLabel(date, true)}.</p>}
          {data.drops.length > 0 && (
            <div className="ln-drops">
              <h3>Drop-offs</h3>
              {data.drops.map((x) => (
                <div key={x.order_number} className="ln-drop">
                  <div className="ln-drop-top"><strong>{x.window} · {x.name}</strong><span className={`ln-pill ${x.paid ? '' : 'wait'}`}>{x.paid ? 'Paid' : 'Awaiting payment'}</span></div>
                  <span>{x.items}</span>
                  {x.request && <span className="ln-request"><b>Request:</b> {x.request}</span>}
                  <small>{x.workplace}{x.landmark ? ` · near ${x.landmark}` : ''} · {x.plan} · order #{x.order_number}</small>
                  {x.paid && !['delivered', 'completed'].includes(x.status) && (
                    <div className="ln-row">
                      {x.kitchen !== 'ready' && x.kitchen !== 'preparing' && <button type="button" className="ln-mini" onClick={() => step(x, 'preparing')}>Cooking</button>}
                      {x.kitchen !== 'ready' && <button type="button" className="ln-mini" onClick={() => step(x, 'ready')}>Ready for pickup</button>}
                      {x.kitchen === 'ready' && <span className="ln-pill">Ready for pickup</span>}
                      {isStaff && ['paid', 'processing', 'ready_for_dispatch'].includes(x.status) && <button type="button" className="ln-mini" onClick={() => move(x, 'out_for_delivery')}>On the way</button>}
                      {isStaff && x.status === 'out_for_delivery' && <button type="button" className="ln-mini" onClick={() => move(x, 'delivered')}>Delivered</button>}
                    </div>
                  )}
                  {['delivered', 'completed'].includes(x.status) && <span className="ln-pill">Delivered</span>}
                </div>
              ))}
              <p className="ln-hint">Cook only paid lunches. Unpaid ones are confirmed by ZaMarket before the cut-off.</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}

// Staff: every booking, and one tap to record the week's payment.
function Bookings({ deals }) {
  const toast = useToast()
  const [plans, setPlans] = useState(null)
  const [show, setShow] = useState('awaiting_payment')
  const [paying, setPaying] = useState(null)
  const [pay, setPay] = useState({ method: 'mtn_money', reference: '' })
  const [reload, setReload] = useState(0)
  useEffect(() => {
    supabase.from('meal_plans').select('*').order('created_at', { ascending: false }).limit(200).then(({ data }) => setPlans(data || []))
  }, [reload])
  const titles = useMemo(() => Object.fromEntries(deals.map((d) => [d.id, d.title])), [deals])
  const list = (plans || []).filter((p) => show === 'all' || p.status === show || (show === 'awaiting_payment' && p.status === 'first_paid'))
  const endTrial = async (p) => {
    if (!window.confirm(`End LP${p.plan_number} after the first lunch? Its unpaid days are cancelled.`)) return
    const { error } = await supabase.rpc('end_meal_plan_after_first', { p_plan: p.id, p_reason: null })
    if (error) return toast(error.message, true)
    toast('Unpaid days cancelled'); setReload((n) => n + 1)
  }
  const METHOD = { mtn_money: 'MTN MoMo', airtel_money: 'Airtel Money', zamtel_kwacha: 'Zamtel Kwacha' }
  const confirm = async (p) => {
    const { error } = await supabase.rpc('confirm_meal_plan_payment', { p_plan: p.id, p_method: pay.method, p_reference: pay.reference || null })
    if (error) return toast(error.message, true)
    toast(p.pay_mode === 'after_first' && p.status === 'awaiting_payment' ? `LP${p.plan_number}: first lunch paid and confirmed.` : `LP${p.plan_number} paid. All its lunches are confirmed.`)
    setPaying(null); setPay({ method: 'mtn_money', reference: '' }); setReload((n) => n + 1)
  }
  return (
    <section className="ln-section">
      <div className="ln-head"><h2>Bookings</h2><p>Call the customer, take the mobile money payment, then record it here once for the whole booking.</p></div>
      <div className="ln-chips">{[['awaiting_payment', 'To call and confirm'], ['paid', 'Paid'], ['trial_ended', 'Stopped after first'], ['all', 'All']].map(([k, l]) => <button key={k} type="button" className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}</div>
      {plans === null ? <Loading /> : list.length === 0 ? <p className="ln-muted">Nothing here.</p> : list.map((p) => (
        <div key={p.id} className="ln-plan">
          <div className="ln-plan-top"><strong>LP{p.plan_number} · {p.customer_name}</strong><span className={`ln-pill ${p.status === 'paid' ? '' : 'wait'}`}>{{ paid: 'Paid', cancelled: 'Cancelled', first_paid: 'First lunch paid', trial_ended: 'Stopped after first lunch' }[p.status] || 'Awaiting payment'}</span></div>
          <span>{p.lunches} lunch{p.lunches === 1 ? '' : 'es'} · {money(p.total, { whole: true })} · {{ trial: 'Trial', week: 'Own lunches', team: 'Team' }[p.kind]} · {titles[p.deal_id] || ''}</span>
          {p.request && <span className="ln-request"><b>Request:</b> {p.request} <em>Confirm with the customer and the kitchen.</em></span>}
          <small className="ln-muted"><a className="ln-link" href={`tel:${p.customer_phone}`}>{p.customer_phone}</a> · {p.place === 'home' ? 'Home: ' : ''}{p.workplace}{p.landmark ? ` (near ${p.landmark})` : ''} · {p.delivery_window}{p.payment_method ? ` · pays by ${METHOD[p.payment_method]}` : ''}{p.referral_code ? ` · via ${p.referral_code}` : ''}</small>
          {p.pay_mode === 'after_first' && <span className="ln-request"><b>Tastes first:</b> {p.status === 'awaiting_payment' ? 'take payment for the first lunch only.' : p.status === 'first_paid' ? 'after the first lunch, ask if they want the other days. Record the rest when paid, or end the plan.' : 'done.'}</span>}
          {['awaiting_payment', 'first_paid'].includes(p.status) && (paying === p.id ? (
            <div className="ln-fields">
              <F label="Paid by"><select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="mtn_money">MTN Money</option><option value="airtel_money">Airtel Money</option><option value="zamtel_kwacha">Zamtel Kwacha</option><option value="bank">Bank</option><option value="cash">Cash</option></select></F>
              <F label="Transaction reference" optional><input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></F>
              <div className="ln-field"><button type="button" className="ln-btn primary" onClick={() => confirm(p)}>{p.pay_mode === 'after_first' && p.status === 'awaiting_payment' ? 'Record the first lunch paid' : p.status === 'first_paid' ? 'Record the other days paid' : `Record ${money(p.total, { whole: true })} paid`}</button></div>
              <div className="ln-field"><button type="button" className="ln-btn ghost" onClick={() => setPaying(null)}>Cancel</button></div>
            </div>
          ) : (
            <div className="ln-row">
              <button type="button" className="ln-btn ghost" onClick={() => { setPaying(p.id); setPay({ method: p.payment_method || 'mtn_money', reference: '' }) }}>Customer has paid</button>
              {p.status === 'first_paid' && <button type="button" className="ln-btn ghost" onClick={() => endTrial(p)}>Didn&rsquo;t continue</button>}
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
