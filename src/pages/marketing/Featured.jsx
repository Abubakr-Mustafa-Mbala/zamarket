import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { date, n } from '../../lib/format'
import { Loading, Modal, Field, Input, Select, Textarea, useToast, Empty, Badge } from '../../components/ui'
import PhotoUpload from '../../components/PhotoUpload'

const KINDS = [['business', 'A business'], ['offering', 'One offering'], ['collection', 'A collection'], ['deal', 'A deal']]
const today = () => new Date().toISOString().slice(0, 10)

// The homepage hero is a marketing slot you control: who is featured, for how long,
// and what it brought.
export default function Featured() {
  const toast = useToast()
  const [edit, setEdit] = useState(null)
  const { data, loading, reload } = useData(async () => ({
    slots: await q(supabase.from('featured_slots').select('*,vendor:vendors(business_name,slug),product:products(name,slug)').order('sort').order('created_at', { ascending: false })),
    vendors: await q(supabase.from('public_vendors').select('id,business_name,slug').order('business_name')),
    products: await q(supabase.from('public_products').select('id,name,slug,vendor_id').order('name')),
  }), [])
  if (loading) return <Loading />
  const slots = data.slots || []
  const live = slots.filter((s) => s.status === 'active' && s.starts_on <= today() && (!s.ends_on || s.ends_on >= today()))

  const end = async (slot) => {
    const { error } = await supabase.from('featured_slots').update({ status: 'ended' }).eq('id', slot.id)
    if (error) return toast(error.message, true)
    toast('Taken off the homepage'); reload()
  }

  return (
    <div className="stack">
      <div className="between">
        <p className="small muted">One business, offering or deal at the top of the homepage. If none is running, the standing ZaMarket banner shows instead.</p>
        <button className="btn primary" onClick={() => setEdit({ kind: 'business', eyebrow: 'Featured business', cta: 'Visit store', starts_on: today(), status: 'active' })}>Feature something</button>
      </div>

      <section className="card stack-sm">
        <h3>On the homepage now</h3>
        {live.length === 0 ? <Empty title="Nothing featured">The standing ZaMarket banner is showing.</Empty> : (
          <div className="mini-table">
            {live.map((s) => (
              <div key={s.id} className="mini-row">
                <span className="grow">
                  <strong>{s.headline}</strong>
                  <span className="tiny muted">{s.eyebrow} · {s.vendor?.business_name || s.product?.name || 'Marketplace'} · from {date(s.starts_on)}{s.ends_on ? ` to ${date(s.ends_on)}` : ', no end date'}</span>
                </span>
                <span className="tiny muted">{s.impressions} seen · {s.clicks} tapped{s.impressions > 0 ? ` · ${Math.round((s.clicks / s.impressions) * 100)}%` : ''}</span>
                <button className="btn sm" onClick={() => setEdit(s)}>Edit</button>
                <button className="btn sm ghost" onClick={() => end(s)}>Take down</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {slots.filter((s) => !live.includes(s)).length > 0 && (
        <section className="card stack-sm">
          <h3>Scheduled and finished</h3>
          <div className="mini-table">
            {slots.filter((s) => !live.includes(s)).map((s) => (
              <div key={s.id} className="mini-row">
                <span className="grow"><strong>{s.headline}</strong><span className="tiny muted">{date(s.starts_on)}{s.ends_on ? ` – ${date(s.ends_on)}` : ''}</span></span>
                <Badge status={s.status === 'active' ? 'pending' : 'ended'}>{s.status === 'active' ? 'Scheduled' : 'Finished'}</Badge>
                <span className="tiny muted">{s.clicks} tapped</span>
                <button className="btn sm" onClick={() => setEdit(s)}>Edit</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {edit && <SlotEditor slot={edit} refs={data} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function SlotEditor({ slot, refs, onClose, onDone }) {
  const toast = useToast()
  const { user } = useAuth()
  const [f, setF] = useState({ ...slot })
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v || null }))
  const vendor = refs.vendors.find((v) => v.id === f.vendor_id)

  const save = async () => {
    if (!f.headline) return toast('Write the headline customers will read', true)
    const row = {
      kind: f.kind, vendor_id: f.vendor_id || null, product_id: f.product_id || null,
      eyebrow: f.eyebrow || 'Featured', headline: f.headline, sub: f.sub || null,
      image_url: f.image_url || null, cta: f.cta || 'Visit store', link: f.link || null,
      starts_on: f.starts_on || today(), ends_on: f.ends_on || null, sort: n(f.sort), status: f.status || 'active',
    }
    const res = f.id ? await supabase.from('featured_slots').update(row).eq('id', f.id) : await supabase.from('featured_slots').insert({ ...row, created_by: user.id })
    if (res.error) return toast(res.error.message, true)
    toast('Saved'); onDone()
  }

  return (
    <Modal title={f.id ? 'Featured slot' : 'Feature something on the homepage'} onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); save() }} className="form-grid">
        <Field label="What are you featuring?"><Select value={f.kind} onChange={set('kind')} options={KINDS} /></Field>
        <Field label="Label above the headline"><Input value={f.eyebrow} onChange={set('eyebrow')} placeholder="Featured business" /></Field>
        <Field label="Business" hint="The hero links to their store" span>
          <Select value={f.vendor_id} onChange={set('vendor_id')} options={refs.vendors.map((v) => [v.id, v.business_name])} placeholder="None — marketplace campaign" />
        </Field>
        <Field label="Headline" hint="Their own words are best" span><Input value={f.headline} onChange={set('headline')} placeholder="Sweet Creations — cakes for life's special moments" /></Field>
        <Field label="One line underneath" span><Input value={f.sub} onChange={set('sub')} placeholder="Made to order, delivered in Lusaka" /></Field>
        <Field label="Featured offering (optional)" span>
          <Select value={f.product_id} onChange={set('product_id')}
            options={refs.products.filter((p) => !f.vendor_id || p.vendor_id === f.vendor_id).map((p) => [p.id, p.name])} placeholder="None" />
        </Field>
        <div className="span"><PhotoUpload label={f.image_url ? 'Change the hero photo' : '📷 Hero photo'} onDone={set('image_url')} /></div>
        {f.image_url && <div className="span"><img src={f.image_url} alt="" style={{ maxWidth: 260, borderRadius: 12 }} /></div>}
        <Field label="Button text"><Input value={f.cta} onChange={set('cta')} placeholder="Visit store" /></Field>
        <Field label="Order on the homepage" hint="Lower shows first"><Input type="number" value={f.sort ?? 0} onChange={set('sort')} /></Field>
        <Field label="From"><Input type="date" value={f.starts_on} onChange={set('starts_on')} /></Field>
        <Field label="Until (optional)"><Input type="date" value={f.ends_on || ''} onChange={set('ends_on')} /></Field>
        <div className="span btn-row">
          <button className="btn primary">Save</button>
          {f.id && <button type="button" className="btn" onClick={() => { setF({ ...f, status: f.status === 'active' ? 'ended' : 'active' }) }}>{f.status === 'active' ? 'Mark finished' : 'Make active'}</button>}
        </div>
        {vendor && <p className="span tiny muted">Links to {window.location.host}/{vendor.slug}</p>}
        <p className="span tiny muted">Only say what the business actually offers. The hero is measured: you will see how many saw it and how many tapped it.</p>
      </form>
    </Modal>
  )
}
