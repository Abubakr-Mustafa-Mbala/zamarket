import { useMemo, useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, datetime, title } from '../../lib/format'
import { Loading, Modal, Field, Input, Select, Textarea, useToast, Empty } from '../../components/ui'

export const CHANNELS = {
  warm: { label: 'Warm outreach', hint: 'People who already know us' },
  content: { label: 'Content', hint: 'Posts, videos, stories' },
  cold: { label: 'Cold outreach', hint: 'Reaching strangers' },
  paid: { label: 'Paid ads', hint: 'Meta, Google and other ads' },
  referral: { label: 'Referrals', hint: 'Customers inviting friends' },
  reseller: { label: 'Resellers', hint: 'Sales from reseller links' },
  organic: { label: 'Found us', hint: 'Came to the site on their own' },
  other: { label: 'Other', hint: '' },
}
const STAGES = [['open', 'Open'], ['new', 'New'], ['contacted', 'Contacted'], ['engaged', 'Engaged'], ['won', 'Won'], ['lost', 'Lost']]
const KINDS = [['call', 'Call'], ['whatsapp', 'WhatsApp'], ['dm', 'DM'], ['sms', 'SMS'], ['in_person', 'In person'], ['note', 'Note']]
const OUTCOMES = [['no_answer', 'No answer'], ['interested', 'Interested'], ['follow_up', 'Call back'], ['ordered', 'Ordered'], ['not_interested', 'Not interested'], ['wrong_number', 'Wrong number']]

const pad = (x) => String(x).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const inDays = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return ymd(d) }
const today = () => ymd(new Date())
const shortDay = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const waLink = (phone) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^0/, '260')}`

export function StageChip({ stage }) {
  return <span className={`stage stage-${stage}`}>{title(stage)}</span>
}

export function FollowUp({ date: d }) {
  if (!d) return null
  const t = today()
  return <span className={`follow ${d < t ? 'late' : d === t ? 'now' : ''}`}>{d < t ? `Overdue · ${shortDay(d)}` : d === t ? 'Today' : shortDay(d)}</span>
}

export default function Leads() {
  const { user, role } = useAuth()
  const seesAll = ['founder', 'ops'].includes(role)
  const [stage, setStage] = useState('open')
  const [who, setWho] = useState(seesAll ? 'all' : 'mine')
  const [channel, setChannel] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)
  const [adding, setAdding] = useState(false)
  const { data, loading, reload } = useData(() => q(
    supabase.from('leads').select('*,owner:profiles(full_name),campaign:campaigns(name,code),magnet:lead_magnets(name)').order('updated_at', { ascending: false }).limit(1000)
  ).then(async (rows) => {
    const vendors = await q(supabase.from('public_vendors').select('id,business_name'))
    return rows.map((l) => ({ ...l, vendor: vendors.find((v) => v.id === l.vendor_id) || null }))
  }), [])

  const rows = useMemo(() => (data || []).filter((l) => {
    if (stage === 'open' ? !['new', 'contacted', 'engaged'].includes(l.stage) : l.stage !== stage) return false
    if (who === 'mine' && l.owner_id !== user.id) return false
    if (who === 'pool' && l.owner_id) return false
    if (channel && l.channel !== channel) return false
    if (search && !`${l.name} ${l.phone} ${l.interest}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }).sort((a, b) => {
    if (stage !== 'open') return 0
    const ad = a.next_follow_up || '9999', bd = b.next_follow_up || '9999'
    return ad.localeCompare(bd)
  }), [data, stage, who, channel, search, user.id])

  const counts = useMemo(() => {
    const c = { open: 0, new: 0, contacted: 0, engaged: 0, won: 0, lost: 0 }
    for (const l of data || []) { c[l.stage] = (c[l.stage] || 0) + 1; if (['new', 'contacted', 'engaged'].includes(l.stage)) c.open++ }
    return c
  }, [data])

  return (
    <div className="stack">
      <div className="mk-toolbar">
        <div className="pipeline" role="tablist">
          {STAGES.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={stage === k} className={`pipe ${stage === k ? 'on' : ''} pipe-${k}`} onClick={() => setStage(k)}>
              <span className="pipe-n">{counts[k] || 0}</span><span className="pipe-l">{l}</span>
            </button>
          ))}
        </div>
        <div className="mk-filters">
          <input className="input" placeholder="Search name, phone, interest" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Whose leads">
            <option value="mine">My leads</option>
            <option value="pool">Unassigned</option>
            <option value="all">{seesAll ? 'Everyone' : 'Mine and unassigned'}</option>
          </select>
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">
            <option value="">All channels</option>
            {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn primary" onClick={() => setAdding(true)}>Add lead</button>
        </div>
      </div>

      {loading ? <Loading /> : rows.length === 0 ? (
        <Empty title={stage === 'open' ? 'No open leads here' : `No ${stage} leads`}>
          {stage === 'open' ? 'Leads arrive from checkout, lead magnets and "tell me when it\'s back" requests. You can also add one yourself.' : ''}
        </Empty>
      ) : (
        <div className="lead-list">
          {rows.map((l) => (
            <button key={l.id} type="button" className="lead-row" onClick={() => setOpen(l)}>
              <span className="lr-main">
                <span className="lr-name">{l.name || 'No name'} <StageChip stage={l.stage} /></span>
                <span className="lr-interest">{l.interest || 'No details yet'}</span>
                <span className="lr-meta">
                  <span>{CHANNELS[l.channel]?.label || l.channel}</span>
                  {l.campaign && <span>{l.campaign.name}</span>}
                  {l.vendor && <span>for {l.vendor.business_name}</span>}
                  <span>{l.owner?.full_name ? l.owner.full_name.split(' ')[0] : 'Unassigned'}</span>
                </span>
              </span>
              <span className="lr-side">
                <span className="lr-phone">{l.phone}</span>
                <FollowUp date={l.next_follow_up} />
                {!l.last_contact_at && l.stage === 'new' && <span className="follow now">Not contacted</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && <LeadDrawer lead={open} onClose={() => setOpen(null)} onChanged={() => { reload() }} />}
      {adding && <AddLead onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload() }} />}
    </div>
  )
}

export function LeadDrawer({ lead: initial, onClose, onChanged }) {
  const toast = useToast()
  const { role } = useAuth()
  const seesAll = ['founder', 'ops'].includes(role)
  const [kind, setKind] = useState('call')
  const [outcome, setOutcome] = useState('')
  const [note, setNote] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const { data, reload } = useData(async () => ({
    lead: await q(supabase.from('leads').select('*,owner:profiles(full_name),campaign:campaigns(name,code),magnet:lead_magnets(name),product:products(name),order:orders(order_number,status,total)').eq('id', initial.id).single())
      .then(async (row) => ({ ...row, vendor: row.vendor_id ? await q(supabase.from('public_vendors').select('business_name').eq('id', row.vendor_id).maybeSingle()) : null })),
    activity: await q(supabase.from('lead_activities').select('*,user:profiles(full_name)').eq('lead_id', initial.id).order('created_at', { ascending: false })),
    team: seesAll ? await q(supabase.from('profiles').select('id,full_name,role').in('role', ['founder', 'ops', 'marketing']).order('full_name')) : [],
  }), [initial.id])
  const l = data?.lead || initial
  const closed = ['won', 'lost'].includes(l.stage)

  const log = async (e) => {
    e?.preventDefault()
    if (kind !== 'note' && !outcome) return toast('Choose what happened', true)
    if (kind === 'note' && !note.trim()) return toast('Write the note', true)
    setBusy(true)
    const { error } = await supabase.rpc('log_lead_activity', { p_lead: l.id, p_kind: kind, p_outcome: kind === 'note' ? null : outcome, p_note: note, p_next: next || null })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast(outcome === 'ordered' ? 'Marked as won' : 'Saved')
    setOutcome(''); setNote(''); setNext('')
    reload(); onChanged()
  }
  const assign = async (owner) => {
    const { error } = await supabase.from('leads').update({ owner_id: owner || null, updated_at: new Date().toISOString() }).eq('id', l.id)
    if (error) return toast(error.message, true)
    toast(owner ? 'Lead assigned' : 'Lead unassigned'); reload(); onChanged()
  }
  const reopen = async () => {
    const { error } = await supabase.from('leads').update({ stage: 'contacted', lost_reason: null, updated_at: new Date().toISOString() }).eq('id', l.id)
    if (error) return toast(error.message.includes('leads_open_phone') ? 'This person already has another open lead.' : error.message, true)
    reload(); onChanged()
  }

  return (
    <Modal title={l.name || 'Lead'} onClose={onClose}>
      <div className="stack">
        <div className="lead-head">
          <div>
            <div className="row"><StageChip stage={l.stage} /><span className="small muted">{CHANNELS[l.channel]?.label}</span></div>
            <div className="lead-phone">{l.phone}</div>
          </div>
          <div className="btn-row">
            <a className="btn primary" href={`tel:${l.phone}`}>Call</a>
            <a className="btn buy" href={waLink(l.phone)} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </div>

        <dl className="kv">
          {l.interest && <><dt>Interested in</dt><dd>{l.interest}</dd></>}
          {l.campaign && <><dt>Campaign</dt><dd>{l.campaign.name}</dd></>}
          {l.magnet && <><dt>Lead magnet</dt><dd>{l.magnet.name}</dd></>}
          {l.vendor && <><dt>For vendor</dt><dd>{l.vendor.business_name}</dd></>}
          {l.product && <><dt>Product</dt><dd>{l.product.name}</dd></>}
          {l.next_follow_up && <><dt>Next follow-up</dt><dd><FollowUp date={l.next_follow_up} /></dd></>}
          {l.order && <><dt>Order</dt><dd>#{l.order.order_number} · {money(l.order.total)}</dd></>}
          {l.lost_reason && <><dt>Lost because</dt><dd>{l.lost_reason}</dd></>}
          <dt>Owner</dt>
          <dd>{seesAll ? (
            <select className="status-select" value={l.owner_id || ''} onChange={(e) => assign(e.target.value)}>
              <option value="">Unassigned</option>
              {(data?.team || []).map((t) => <option key={t.id} value={t.id}>{t.full_name || t.role}</option>)}
            </select>
          ) : (l.owner?.full_name || 'Unassigned')}</dd>
        </dl>

        {closed ? (
          <div className="card flat between">
            <span className="small">{l.stage === 'won' ? 'This lead became a customer.' : 'This lead is closed.'}</span>
            {l.stage === 'lost' && <button className="btn sm" onClick={reopen}>Reopen</button>}
          </div>
        ) : (
          <form onSubmit={log} className="log-box">
            <div className="chips wrap">{KINDS.map(([k, lab]) => <button type="button" key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => { setKind(k); if (k === 'note') setOutcome('') }}>{lab}</button>)}</div>
            {kind !== 'note' && (
              <div className="outcomes">
                {OUTCOMES.map(([k, lab]) => <button type="button" key={k} className={`outcome o-${k} ${outcome === k ? 'on' : ''}`} onClick={() => setOutcome(k)}>{lab}</button>)}
              </div>
            )}
            <Textarea value={note} onChange={setNote} rows={2} placeholder={kind === 'note' ? 'Write a note' : 'What did they say? (optional)'} />
            {!['ordered', 'not_interested', 'wrong_number'].includes(outcome) && (
              <div className="row">
                <span className="small muted">Follow up</span>
                {[['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]].map(([lab, k]) => (
                  <button type="button" key={lab} className={`chip ${next === inDays(k) ? 'on' : ''}`} onClick={() => setNext(inDays(k))}>{lab}</button>
                ))}
                <input type="date" className="input" style={{ width: 'auto' }} value={next} min={today()} onChange={(e) => setNext(e.target.value)} aria-label="Follow-up date" />
              </div>
            )}
            <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            {outcome === 'ordered' && <p className="tiny muted">Orders placed with this phone number mark the lead as won automatically. Use this if they ordered another way.</p>}
          </form>
        )}

        <div>
          <h3 className="mb">History</h3>
          {(data?.activity || []).length === 0 ? <p className="small muted">Nothing yet.</p> : (
            <ol className="history">
              {data.activity.map((a) => (
                <li key={a.id} className={`h-${a.kind}`}>
                  <span className="h-when">{datetime(a.created_at)}</span>
                  <span className="h-what">
                    <strong>{a.kind === 'system' ? 'ZaMarket' : title(a.kind)}</strong>
                    {a.outcome && <> · {OUTCOMES.find((o) => o[0] === a.outcome)?.[1] || title(a.outcome)}</>}
                    {a.user?.full_name && <span className="muted"> · {a.user.full_name.split(' ')[0]}</span>}
                    {a.note && <span className="h-note">{a.note}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  )
}

function AddLead({ onClose, onDone }) {
  const toast = useToast()
  const { user } = useAuth()
  const { data: refs } = useData(async () => ({
    campaigns: await q(supabase.from('campaigns').select('id,name,vendor_id').order('created_at', { ascending: false })),
    vendors: await q(supabase.from('public_vendors').select('id,business_name').order('business_name')),
  }), [])
  const [f, setF] = useState({ name: '', phone: '', channel: 'warm', interest: '', campaign_id: '', vendor_id: '', next_follow_up: today(), mine: true })
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    const phone = f.phone.replace(/\D/g, '').replace(/^260(?=\d{9}$)/, '0').replace(/^(?=\d{9}$)/, '0')
    if (phone.length < 10) return toast('Enter a full phone number, e.g. 0977 123 456', true)
    const { error } = await supabase.from('leads').insert({
      name: f.name.trim(), phone, channel: f.channel, interest: f.interest || null, stage: 'new',
      campaign_id: f.campaign_id || null, vendor_id: f.vendor_id || null, next_follow_up: f.next_follow_up || null,
      owner_id: f.mine ? user.id : null, source: 'manual',
    })
    if (error) return toast(error.message.includes('leads_open_phone') ? 'This person is already an open lead. Search for their number.' : error.message, true)
    toast('Lead added'); onDone()
  }
  return (
    <Modal title="Add a lead" onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <Field label="Name"><Input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={set('phone')} required /></Field>
        <Field label="How did we reach them?" span>
          <div className="chips wrap">{['warm', 'cold', 'content', 'paid', 'referral', 'other'].map((k) => <button type="button" key={k} className={`chip ${f.channel === k ? 'on' : ''}`} onClick={() => set('channel')(k)}>{CHANNELS[k].label}</button>)}</div>
        </Field>
        <Field label="What are they interested in?" span><Textarea value={f.interest} onChange={set('interest')} rows={2} placeholder="e.g. Wants a phone under K2,000 for her son" /></Field>
        <Field label="Campaign (optional)"><Select value={f.campaign_id} onChange={set('campaign_id')} options={(refs?.campaigns || []).map((c) => [c.id, c.name])} placeholder="None" /></Field>
        <Field label="For a vendor (optional)"><Select value={f.vendor_id} onChange={set('vendor_id')} options={(refs?.vendors || []).map((v) => [v.id, v.business_name])} placeholder="ZaMarket" /></Field>
        <Field label="Follow up on"><Input type="date" value={f.next_follow_up} onChange={set('next_follow_up')} /></Field>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.mine} onChange={(e) => set('mine')(e.target.checked)} /> Assign to me</label>
        <div className="span"><button className="btn primary block">Add lead</button></div>
      </form>
    </Modal>
  )
}
