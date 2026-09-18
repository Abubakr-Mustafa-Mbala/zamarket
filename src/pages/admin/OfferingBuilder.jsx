import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, n } from '../../lib/format'
import { Loading, Field, Input, Select, Textarea, Segmented, useToast, Empty, Badge } from '../../components/ui'
import { OfferingView, BENEFIT_ICONS, defaultCta } from '../public/Offering'
import { uploadPhoto } from '../../lib/photos'

const TYPES = [['product', 'Product'], ['service', 'Service'], ['course', 'Course'], ['class', 'Class'], ['vehicle', 'Vehicle'], ['event', 'Event'], ['other', 'Other']]
const MODELS = [
  ['buy', 'Buy now', 'Customer adds it to the cart and checks out'],
  ['book', 'Book a date', 'Customer picks a date, and a time if you set times'],
  ['enquire', 'Enquire first', 'Customer sends their details and you call them'],
  ['negotiate', 'Open to offers', 'Customer makes an offer, you agree a price'],
]
const ICONS = Object.keys(BENEFIT_ICONS)

// Suggested wording per offering type. The seller edits everything; nothing is forced.
const HINTS = {
  course: { hero: 'Learn with confidence', points: ['Experienced instructors', 'Practical training', 'Flexible schedules'], media: 'Where you learn', packages: 'Choose your course', schedule: 'Class schedule' },
  class: { hero: 'Join the next class', points: ['Small classes', 'Practical work', 'Flexible times'], media: 'Our space', packages: 'Choose your class', schedule: 'Class schedule' },
  service: { hero: 'Booked in minutes, done properly', points: ['Trained staff', 'Quality work', 'Fair prices'], media: 'Our setup', packages: 'Choose a package', schedule: 'Opening hours' },
  vehicle: { hero: 'Clean, well-kept and ready to drive', points: ['Full service history', 'Inspection welcome', 'Paperwork in order'], media: 'The vehicle', packages: 'Options', schedule: 'Viewing times' },
  event: { hero: "Don't miss it", points: ['Limited places', 'Great line-up'], media: 'The venue', packages: 'Tickets', schedule: 'Programme' },
  product: { hero: '', points: [], media: 'Gallery', packages: 'Choose a package', schedule: 'Opening hours' },
  other: { hero: '', points: [], media: 'Gallery', packages: 'Choose a package', schedule: 'Opening hours' },
}

const lines = (v) => (v || '').split('\n').map((x) => x.trim()).filter(Boolean)

function PhotoPicker({ label, hint, value, onChange, toast }) {
  const [busy, setBusy] = useState(false)
  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try { onChange(await uploadPhoto(file)) } catch (err) { toast(err.message, true) } finally { setBusy(false); e.target.value = '' }
  }
  return (
    <div className="field span">
      <label>{label}</label>
      <div className="photo-pick">
        {value ? <img src={value} alt="" /> : <span className="photo-empty">No photo</span>}
        <div className="stack-sm">
          <label className="btn sm">{busy ? 'Uploading…' : value ? 'Change photo' : '📷 Add photo'}
            <input type="file" accept="image/*" hidden disabled={busy} onChange={pick} />
          </label>
          {value && <button type="button" className="btn sm ghost" onClick={() => onChange('')}>Remove</button>}
          <input className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="or paste a link" />
        </div>
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}
const toText = (arr) => (arr || []).join('\n')

export default function OfferingBuilder() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { profile, isStaff } = useAuth()
  const vendorId = profile?.role === 'vendor' ? profile?.partner?.id : null
  const [tab, setTab] = useState('edit')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [p, setP] = useState(null)
  const [pg, setPg] = useState({})
  const [packs, setPacks] = useState([])
  const { data, loading } = useData(async () => ({
    product: await q(supabase.from('products').select('*,vendor:vendors(business_name)').eq('id', id).single()),
    packages: await q(supabase.from('product_packages').select('*').eq('product_id', id).order('sort')),
  }), [id])

  useEffect(() => {
    if (!data) return
    setP(data.product)
    setPg(data.product.page || {})
    setPacks(data.packages.map((k) => ({ ...k, items_text: toText(k.items) })))
  }, [data])

  if (loading || !p) return <Loading />
  const hint = HINTS[p.offering_type] || HINTS.other
  const setField = (k) => (v) => setP((x) => ({ ...x, [k]: v }))
  const set = (k) => (v) => setPg((x) => ({ ...x, [k]: v }))
  const setMedia = (k) => (v) => setPg((x) => ({ ...x, media_section: { ...(x.media_section || {}), [k]: v } }))
  const rowsOf = (key, fields) => pg[key] || []
  const setRow = (key, i, patch) => setPg((x) => ({ ...x, [key]: (x[key] || []).map((r, k) => (k === i ? { ...r, ...patch } : r)) }))
  const addRow = (key, blank) => setPg((x) => ({ ...x, [key]: [...(x[key] || []), blank] }))
  const delRow = (key, i) => setPg((x) => ({ ...x, [key]: (x[key] || []).filter((_, k) => k !== i) }))

  const preview = useMemo(() => ({
    ...p, page: pg, vendor_name: p.vendor?.business_name || null,
  }), [p, pg])
  const previewPacks = packs.filter((k) => k.active !== false && k.name).map((k) => ({ ...k, items: lines(k.items_text), price: n(k.price), normal_price: k.normal_price === '' ? null : n(k.normal_price) }))

  const save = async (publish) => {
    setSaving(true)
    try {
      const clean = {
        ...pg,
        hero_points: (pg.hero_points || []).filter(Boolean),
        areas: (pg.areas || []).filter(Boolean),
        why: (pg.why || []).filter(Boolean),
        included: (pg.included || []).filter(Boolean),
        requirements: (pg.requirements || []).filter(Boolean),
        benefits: (pg.benefits || []).filter((b) => b?.title),
        specs: (pg.specs || []).filter((s) => s?.label && s?.value),
        schedule: (pg.schedule || []).filter((s) => s?.label),
        sections: (pg.sections || []).filter((s) => s?.title && (s.items || []).filter(Boolean).length).map((s) => ({ ...s, items: s.items.filter(Boolean) })),
      }
      const row = { page: clean, offering_type: p.offering_type, sales_model: p.sales_model, images: p.images || [], price: n(p.price) }
      if (publish) row.status = vendorId ? 'submitted' : 'published'
      const { error } = await supabase.from('products').update(row).eq('id', id)
      if (error) throw new Error(error.message)

      const keep = packs.filter((k) => k.name)
      const existing = data.packages.map((k) => k.id)
      const gone = existing.filter((x) => !keep.some((k) => k.id === x))
      if (gone.length) await supabase.from('product_packages').delete().in('id', gone)
      for (const [i, k] of keep.entries()) {
        const body = {
          product_id: id, name: k.name, subtitle: k.subtitle || null, price: n(k.price),
          normal_price: k.normal_price === '' || k.normal_price == null ? null : n(k.normal_price),
          items: lines(k.items_text), featured: !!k.featured, sort: i, active: k.active !== false,
        }
        const res = k.id ? await supabase.from('product_packages').update(body).eq('id', k.id) : await supabase.from('product_packages').insert(body)
        if (res.error) throw new Error(res.error.message)
      }
      toast(publish ? (vendorId ? 'Sent to ZaMarket for review' : 'Page published') : 'Page saved')
      nav(vendorId ? '/vendor/products' : '/admin/products')
    } catch (e) { toast(e.message, true) } finally { setSaving(false) }
  }

  const Editor = (
    <div className="stack ob-form">
      <section className="card stack-sm">
        <h3>What kind of offering is this?</h3>
        <div className="form-grid">
          <Field label="Type"><Select value={p.offering_type} onChange={setField('offering_type')} options={TYPES} /></Field>
          <Field label="Listed price" hint="Packages below can override this"><Input money value={p.price} onChange={setField('price')} /></Field>
        </div>
        <label className="small strong">How do customers get it?</label>
        <div className="ob-models">
          {MODELS.map(([k, label, note]) => (
            <button type="button" key={k} className={`ob-model ${p.sales_model === k ? 'on' : ''}`} onClick={() => setField('sales_model')(k)}>
              <strong>{label}</strong><span>{note}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card stack-sm">
        <h3>Top of the page</h3>
        <Field label="Headline" hint={hint.hero ? `e.g. ${hint.hero}` : 'The big line customers read first'}><Input value={pg.hero_headline} onChange={set('hero_headline')} /></Field>
        <Field label="Where you are" hint="e.g. Lusaka, Zambia"><Input value={pg.location_text} onChange={set('location_text')} /></Field>
        <Field label="Selling points" hint="One per line. Keep them true — no invented claims.">
          <Textarea value={toText(pg.hero_points)} onChange={(v) => set('hero_points')(lines(v))} rows={3} placeholder={hint.points.join('\n')} />
        </Field>
        <div className="form-grid">
          <Field label="Main button" hint={`Default: ${defaultCta(p.sales_model, p.offering_type)}`}><Input value={pg.cta_primary} onChange={set('cta_primary')} /></Field>
          <Field label="Second button"><Input value={pg.cta_secondary} onChange={set('cta_secondary')} placeholder="Ask a question" /></Field>
        </div>
        <label className="small strong">Photos</label>
        <div className="photo-row">
          {(p.images || []).map((src, i) => (
            <div key={i} className={`photo-thumb ${i === 0 ? 'main' : ''}`}>
              <img src={src} alt="" />
              {i === 0 && <span className="photo-tag">Main</span>}
              <button type="button" onClick={() => setField('images')((p.images || []).filter((_, k) => k !== i))} aria-label="Remove">✕</button>
              {i > 0 && <button type="button" className="mk-main" onClick={() => setField('images')([src, ...(p.images || []).filter((_, k) => k !== i)])}>Make main</button>}
            </div>
          ))}
          <label className="btn sm photo-add">{uploading ? 'Uploading…' : '📷 Add photo'}
            <input type="file" accept="image/*" hidden disabled={uploading} multiple onChange={async (e) => {
              const files = [...(e.target.files || [])]
              setUploading(true)
              try { const urls = []; for (const f of files) urls.push(await uploadPhoto(f)); setField('images')([...(p.images || []), ...urls]) }
              catch (err) { toast(err.message, true) } finally { setUploading(false); e.target.value = '' }
            }} />
          </label>
        </div>
        <p className="tiny muted">The first photo is the big one at the top. Clear daylight photos of the real thing work best.</p>
      </section>

      <Packages packs={packs} setPacks={setPacks} title={pg.packages_title} setTitle={set('packages_title')} hint={hint.packages} />

      <section className="card stack-sm">
        <h3>What you get</h3>
        <p className="small muted">Short blocks with an icon. Best with three to six.</p>
        {(pg.benefits || []).map((b, i) => (
          <div key={i} className="ob-row">
            <select className="input ob-icon" value={b.icon || 'check'} onChange={(e) => setRow('benefits', i, { icon: e.target.value })} aria-label="Icon">
              {ICONS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <span className="ob-icon-preview">{BENEFIT_ICONS[b.icon || 'check']}</span>
            <Input value={b.title} onChange={(v) => setRow('benefits', i, { title: v })} placeholder="Title, e.g. Test preparation" />
            <Input value={b.text} onChange={(v) => setRow('benefits', i, { text: v })} placeholder="One line explaining it" />
            <button type="button" className="btn sm ghost" onClick={() => delRow('benefits', i)}>✕</button>
          </div>
        ))}
        <button type="button" className="btn sm" onClick={() => addRow('benefits', { icon: ICONS[((pg.benefits || []).length) % ICONS.length], title: '', text: '' })}>Add a block</button>
      </section>

      <section className="card stack-sm">
        <h3>{hint.media} (optional)</h3>
        <p className="small muted">A single feature photo with details — the training car, your salon, your equipment, the venue.</p>
        <div className="form-grid">
          <Field label="Section title"><Input value={pg.media_section?.title} onChange={setMedia('title')} placeholder={hint.media} /></Field>
          <Field label="Name"><Input value={pg.media_section?.name} onChange={setMedia('name')} placeholder="e.g. Toyota Corolla (manual) — 2022" /></Field>
          <PhotoPicker label="Photo" value={pg.media_section?.image} onChange={setMedia('image')} toast={toast} hint="The car, the salon, the venue, the equipment." />
          <Field label="Short note" span><Input value={pg.media_section?.note} onChange={setMedia('note')} placeholder="e.g. Dual controls for safety" /></Field>
        </div>
        <label className="small strong">Details</label>
        {(pg.media_section?.specs || []).map((s, i) => (
          <div key={i} className="ob-row">
            <Input value={s.label} onChange={(v) => setMedia('specs')((pg.media_section.specs || []).map((x, k) => (k === i ? { ...x, label: v } : x)))} placeholder="Transmission" />
            <Input value={s.value} onChange={(v) => setMedia('specs')((pg.media_section.specs || []).map((x, k) => (k === i ? { ...x, value: v } : x)))} placeholder="Manual" />
            <button type="button" className="btn sm ghost" onClick={() => setMedia('specs')((pg.media_section.specs || []).filter((_, k) => k !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className="btn sm" onClick={() => setMedia('specs')([...(pg.media_section?.specs || []), { label: '', value: '' }])}>Add a detail</button>
      </section>

      <section className="card stack-sm">
        <h3>Key facts (optional)</h3>
        <p className="small muted">Shown as a clean list: duration, what's certified, mileage, capacity — whatever matters here.</p>
        {(pg.specs || []).map((s, i) => (
          <div key={i} className="ob-row">
            <Input value={s.label} onChange={(v) => setRow('specs', i, { label: v })} placeholder="Duration" />
            <Input value={s.value} onChange={(v) => setRow('specs', i, { value: v })} placeholder="6 weeks" />
            <button type="button" className="btn sm ghost" onClick={() => delRow('specs', i)}>✕</button>
          </div>
        ))}
        <button type="button" className="btn sm" onClick={() => addRow('specs', { label: '', value: '' })}>Add a fact</button>
      </section>

      <section className="card stack-sm">
        <h3>Included and needed</h3>
        <div className="form-grid">
          <Field label="What's included" hint="One per line"><Textarea value={toText(pg.included)} onChange={(v) => set('included')(lines(v))} rows={4} /></Field>
          <Field label="What the customer needs to bring or do" hint="One per line"><Textarea value={toText(pg.requirements)} onChange={(v) => set('requirements')(lines(v))} rows={4} /></Field>
        </div>
      </section>

      <section className="card stack-sm">
        <h3>Times and areas</h3>
        <div className="form-grid">
          <Field label="Section title"><Input value={pg.schedule_title} onChange={set('schedule_title')} placeholder={hint.schedule} /></Field>
        </div>
        {(pg.schedule || []).map((s, i) => (
          <div key={i} className="ob-row">
            <Input value={s.label} onChange={(v) => setRow('schedule', i, { label: v })} placeholder="Weekdays" />
            <Input value={s.hours} onChange={(v) => setRow('schedule', i, { hours: v })} placeholder="8:00 AM – 6:00 PM" />
            <button type="button" className="btn sm ghost" onClick={() => delRow('schedule', i)}>✕</button>
          </div>
        ))}
        <button type="button" className="btn sm" onClick={() => addRow('schedule', { label: '', hours: '' })}>Add a line</button>
        <Field label="Areas you serve" hint="One per line, e.g. Lusaka District, Chalala, Matero"><Textarea value={toText(pg.areas)} onChange={(v) => set('areas')(lines(v))} rows={3} /></Field>
      </section>

      <section className="card stack-sm">
        <h3>Why choose you</h3>
        <Field label="Reasons" hint="One per line. Only what you can stand behind."><Textarea value={toText(pg.why)} onChange={(v) => set('why')(lines(v))} rows={4} /></Field>
      </section>

      <section className="card stack-sm">
        <h3>Extra sections (optional)</h3>
        <p className="small muted">For anything else: curriculum, modules, menu, terms.</p>
        {(pg.sections || []).map((s, i) => (
          <div key={i} className="card flat stack-sm">
            <div className="ob-row">
              <Input value={s.title} onChange={(v) => setRow('sections', i, { title: v })} placeholder="Section title, e.g. What you'll cover" />
              <button type="button" className="btn sm ghost" onClick={() => delRow('sections', i)}>✕</button>
            </div>
            <Textarea value={toText(s.items)} onChange={(v) => setRow('sections', i, { items: lines(v) })} rows={3} placeholder="One line per point" />
          </div>
        ))}
        <button type="button" className="btn sm" onClick={() => addRow('sections', { title: '', items: [] })}>Add a section</button>
      </section>
    </div>
  )

  return (
    <div className="stack ob">
      <div className="page-head">
        <div>
          <Link to={vendorId ? '/vendor/products' : '/admin/products'} className="small">← Products</Link>
          <h1>{p.name}</h1>
          <p>Build the page customers see. Everything here is yours to fill in — nothing is pre-written for you.</p>
        </div>
        <div className="btn-row">
          <Badge status={p.status} />
          <button className="btn" disabled={saving} onClick={() => save(false)}>Save</button>
          <button className="btn primary" disabled={saving} onClick={() => save(true)}>{saving ? 'Saving…' : vendorId ? 'Send for review' : 'Save and publish'}</button>
        </div>
      </div>

      <div className="ob-switch show-mobile">
        <Segmented options={[['edit', 'Edit'], ['preview', 'Preview']]} value={tab} onChange={setTab} />
      </div>

      <div className="ob-split">
        <div className={tab === 'edit' ? '' : 'hide-on-mobile'}>{Editor}</div>
        <aside className={`ob-preview ${tab === 'preview' ? '' : 'hide-on-mobile'}`}>
          <div className="ob-preview-label">Live preview</div>
          <div className="ob-frame">
            <OfferingView p={preview} packages={previewPacks} preview />
          </div>
        </aside>
      </div>
    </div>
  )
}

function Packages({ packs, setPacks, title, setTitle, hint }) {
  const upd = (i, patch) => setPacks(packs.map((k, x) => (x === i ? { ...k, ...patch } : k)))
  const move = (i, dir) => {
    const next = [...packs]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setPacks(next)
  }
  return (
    <section className="card stack-sm">
      <h3>Packages and prices</h3>
      <p className="small muted">Add one package, or several to compare. Leave it empty to just use the listed price.</p>
      <Field label="Section title"><Input value={title} onChange={setTitle} placeholder={hint} /></Field>
      {packs.length === 0 ? <Empty title="No packages yet">Good for courses, services and tickets: Beginner, Standard, Premium.</Empty> : packs.map((k, i) => (
        <div key={k.id || i} className="card flat stack-sm">
          <div className="between">
            <strong>Package {i + 1}</strong>
            <div className="btn-row">
              <button type="button" className="btn sm ghost" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button type="button" className="btn sm ghost" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button type="button" className="btn sm ghost" onClick={() => setPacks(packs.filter((_, x) => x !== i))}>Remove</button>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Name"><Input value={k.name} onChange={(v) => upd(i, { name: v })} placeholder="e.g. Standard package" /></Field>
            <Field label="One-line description"><Input value={k.subtitle} onChange={(v) => upd(i, { subtitle: v })} placeholder="e.g. Complete driving course" /></Field>
            <Field label="Price"><Input money value={k.price} onChange={(v) => upd(i, { price: v })} /></Field>
            <Field label="Normal price (optional)" hint="Shows the saving"><Input money value={k.normal_price ?? ''} onChange={(v) => upd(i, { normal_price: v })} /></Field>
            <Field label="What's included" hint="One per line" span><Textarea value={k.items_text} onChange={(v) => upd(i, { items_text: v })} rows={4} placeholder={'10 practical lessons\n2 hours per lesson\nMock test'} /></Field>
          </div>
          <div className="row">
            <label className="check"><input type="checkbox" checked={!!k.featured} onChange={(e) => setPacks(packs.map((x, j) => ({ ...x, featured: j === i ? e.target.checked : false })))} /> Mark as most popular</label>
            <label className="check"><input type="checkbox" checked={k.active !== false} onChange={(e) => upd(i, { active: e.target.checked })} /> Show on the page</label>
            {Number(k.price) > 0 && Number(k.normal_price) > Number(k.price) && <span className="save small">Saves {money(Number(k.normal_price) - Number(k.price))}</span>}
          </div>
        </div>
      ))}
      <button type="button" className="btn sm" onClick={() => setPacks([...packs, { name: '', subtitle: '', price: '', normal_price: '', items_text: '', featured: packs.length === 1, active: true }])}>Add a package</button>
    </section>
  )
}
