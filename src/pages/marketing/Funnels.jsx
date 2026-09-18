import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, num } from '../../lib/format'
import { Loading, Modal, Field, Input, Select, Textarea, useToast, Empty, Badge } from '../../components/ui'
import { DateBar, useRange } from '../shared/Earnings'

// The five steps everyone goes through. Naming them is what makes the weak one obvious.
const STEPS = [
  { key: 'saw', label: 'Saw it', note: 'Opened your link or the free guide page' },
  { key: 'leads', label: 'Left their number', note: 'Claimed the guide, or started checkout' },
  { key: 'buyers', label: 'Bought', note: 'Placed an order that was not cancelled' },
  { key: 'added', label: 'Added more', note: 'Took the add-on at checkout' },
  { key: 'repeat', label: 'Came back', note: 'Ordered again in these dates' },
]

const ADVICE = {
  leads: 'Few people leave their number. Usually the promise is weak or the page asks too much. Try a simpler free guide, a clearer headline, or a voucher.',
  buyers: "People give their number but don't buy. Call them sooner — the same day works best — and check the price against what else they can find.",
  added: 'Almost nobody adds the extra. Make the add-on cheap and obviously useful next to what they already chose.',
  repeat: 'Nobody comes back. Message past customers when new stock lands, and use a repeat-order offer.',
}

export default function Funnels() {
  const [range, setRange] = useRange('30d')
  const [edit, setEdit] = useState(null)
  const { data, loading, reload } = useData(async () => {
    const funnels = await q(supabase.from('funnels').select('*,campaign:campaigns(name,code),magnet:lead_magnets(name,slug),product:products(name),bump:offers!funnels_bump_offer_id_fkey(name)').order('created_at', { ascending: false }))
    const reports = {}
    for (const f of funnels) {
      const { data: r } = await supabase.rpc('funnel_report', { p_funnel: f.id, p_from: range.from, p_to: range.to })
      reports[f.id] = r
    }
    return { funnels, reports }
  }, [range.from, range.to])

  return (
    <div className="stack">
      <div className="card"><DateBar range={range} setRange={setRange} /></div>
      <div className="between">
        <p className="small muted">A funnel is one path a customer takes, from first seeing you to buying again. Naming the steps shows you which one is leaking.</p>
        <button className="btn primary" onClick={() => setEdit({ status: 'active' })}>New funnel</button>
      </div>

      {loading ? <Loading /> : (data?.funnels || []).length === 0 ? (
        <Empty title="No funnels yet">
          Start with one: the campaign link you share, the free guide people claim, the product you want them to buy, and the add-on at checkout.
        </Empty>
      ) : data.funnels.map((f) => {
        const r = data.reports[f.id] || {}
        const top = Math.max(1, ...STEPS.map((s) => Number(r[s.key]) || 0))
        const weakest = ['leads', 'buyers', 'added', 'repeat'].find((k) => {
          const rate = { leads: r.lead_rate, buyers: r.buy_rate, added: r.add_rate, repeat: null }[k]
          return rate != null && rate < { leads: 3, buyers: 20, added: 15 }[k]
        }) || (Number(r.repeat) === 0 && Number(r.buyers) > 2 ? 'repeat' : null)
        return (
          <section key={f.id} className="card stack-sm">
            <div className="between">
              <div>
                <h3>{f.name}</h3>
                <p className="tiny muted">
                  {[f.campaign && `Link /go/${f.campaign.code}`, f.magnet && `Guide /free/${f.magnet.slug}`, f.product && f.product.name, f.bump && `Add-on: ${f.bump.name}`].filter(Boolean).join(' · ') || 'Nothing linked yet'}
                </p>
              </div>
              <div className="btn-row">
                <Badge status={f.status === 'active' ? 'active' : 'paused'} />
                <button className="btn sm" onClick={() => setEdit(f)}>Edit</button>
              </div>
            </div>

            <div className="funnel-steps">
              {STEPS.map((st, i) => {
                const v = Number(r[st.key]) || 0
                const prev = i === 0 ? null : Number(r[STEPS[i - 1].key]) || 0
                const rate = prev ? Math.round((v / prev) * 100) : null
                return (
                  <div key={st.key} className={`fs ${weakest === st.key ? 'weak' : ''}`}>
                    <div className="fs-bar"><span style={{ width: `${Math.max((v / top) * 100, v ? 5 : 0)}%` }} /></div>
                    <div className="fs-row">
                      <span className="fs-label"><strong>{st.label}</strong><span className="tiny muted">{st.note}</span></span>
                      <span className="fs-num"><b>{num(v)}</b>{rate != null && <span className="tiny muted"> · {rate}% of the step before</span>}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="fs-summary">
              <div><b>{money(r.sales)}</b><span>sales</span></div>
              <div><b>{money(r.per_customer)}</b><span>per customer</span></div>
              <div><b>{r.cost_per_customer ? money(r.cost_per_customer) : '—'}</b><span>cost per customer</span></div>
              <div><b>{money(r.spend)}</b><span>spent</span></div>
            </div>

            {weakest && (
              <div className="fs-advice">
                <strong>Weakest step: {STEPS.find((s) => s.key === weakest).label.toLowerCase()}.</strong> {ADVICE[weakest]}
              </div>
            )}
            {!weakest && Number(r.buyers) > 0 && <p className="small ok">This funnel is working. Spend more on the same link before changing anything.</p>}
          </section>
        )
      })}

      {edit && <FunnelEditor funnel={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function FunnelEditor({ funnel, onClose, onDone }) {
  const toast = useToast()
  const { user } = useAuth()
  const [f, setF] = useState({ ...funnel })
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v || null }))
  const { data: refs } = useData(async () => ({
    campaigns: await q(supabase.from('campaigns').select('id,name,code').order('created_at', { ascending: false })),
    magnets: await q(supabase.from('lead_magnets').select('id,name,slug').order('created_at', { ascending: false })),
    products: await q(supabase.from('public_products').select('id,name').order('name')),
    offers: await q(supabase.from('offers').select('id,name,category').in('category', ['upsell', 'continuity'])),
  }), [])
  const save = async () => {
    if (!f.name) return toast('Give the funnel a name', true)
    const row = { name: f.name, campaign_id: f.campaign_id || null, magnet_id: f.magnet_id || null, product_id: f.product_id || null,
      bump_offer_id: f.bump_offer_id || null, repeat_offer_id: f.repeat_offer_id || null, notes: f.notes || null, status: f.status || 'active' }
    const res = f.id ? await supabase.from('funnels').update(row).eq('id', f.id) : await supabase.from('funnels').insert({ ...row, created_by: user.id })
    if (res.error) return toast(res.error.message, true)
    toast('Saved'); onDone()
  }
  const remove = async () => {
    if (!window.confirm('Delete this funnel? The orders and leads stay, only the report goes.')) return
    const { error } = await supabase.from('funnels').delete().eq('id', f.id)
    if (error) return toast(error.message, true)
    onDone()
  }
  return (
    <Modal title={f.id ? f.name : 'New funnel'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save() }} className="form-grid">
        <Field label="Name" hint="e.g. Solar lamps from Facebook" span><Input value={f.name} onChange={set('name')} required /></Field>
        <Field label="1. How they find you" hint="The campaign link you share" span><Select value={f.campaign_id} onChange={set('campaign_id')} options={(refs?.campaigns || []).map((c) => [c.id, `${c.name} (/go/${c.code})`])} placeholder="None yet" /></Field>
        <Field label="2. What makes them leave a number" hint="A free guide or voucher (optional)" span><Select value={f.magnet_id} onChange={set('magnet_id')} options={(refs?.magnets || []).map((m) => [m.id, `${m.name} (/free/${m.slug})`])} placeholder="None — they go straight to the product" /></Field>
        <Field label="3. What you want them to buy" span><Select value={f.product_id} onChange={set('product_id')} options={(refs?.products || []).map((p) => [p.id, p.name])} placeholder="Any product" /></Field>
        <Field label="4. The add-on at checkout" span><Select value={f.bump_offer_id} onChange={set('bump_offer_id')} options={(refs?.offers || []).filter((o) => o.category === 'upsell').map((o) => [o.id, o.name])} placeholder="None" /></Field>
        <Field label="5. What brings them back" span><Select value={f.repeat_offer_id} onChange={set('repeat_offer_id')} options={(refs?.offers || []).filter((o) => o.category === 'continuity').map((o) => [o.id, o.name])} placeholder="None" /></Field>
        <Field label="Notes" span><Textarea value={f.notes} onChange={set('notes')} rows={2} placeholder="What you're testing this month" /></Field>
        <div className="span btn-row">
          <button className="btn primary">Save</button>
          {f.id && <button type="button" className="btn" onClick={() => { setF({ ...f, status: f.status === 'active' ? 'paused' : 'active' }); }}>{f.status === 'active' ? 'Mark paused' : 'Mark active'}</button>}
          {f.id && <button type="button" className="btn danger" onClick={remove}>Delete</button>}
        </div>
        <p className="span tiny muted">Missing a piece? Create it first under Campaigns, Lead magnets or Offers, then come back.</p>
      </form>
    </Modal>
  )
}
