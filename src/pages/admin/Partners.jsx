import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, date, n, title } from '../../lib/format'
import { Badge, Table, Loading, Modal, Field, Input, Select, Textarea, Segmented, Breakdown, useToast, Tabs, Stat, CopyLine } from '../../components/ui'


// The deal struck with one seller: our cut, the room left for an affiliate,
// and what it costs to deliver from where they are. Agreed at onboarding, and
// every change is recorded because these decide what everyone earns.
function TermsCell({ v, onDone }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [t, setT] = useState(null)
  const [f, setF] = useState({ fee: '', allowance: '', delivery: '', note: '' })
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await supabase.rpc('vendor_terms', { p_vendor: v.id })
    setT(data)
    setF({
      fee: data?.fee_is_custom ? data.fee_pct : '',
      allowance: data?.allowance_is_custom ? data.allowance_pct : '',
      delivery: data?.delivery_is_custom ? data.delivery_fee : '',
      note: v.terms_note || '',
    })
  }

  const save = async () => {
    setBusy(true)
    const num = (x) => (x === '' || x == null ? null : Number(x))
    const { error } = await supabase.rpc('set_vendor_terms', {
      p_vendor: v.id, p_fee_pct: num(f.fee), p_allowance_pct: num(f.allowance),
      p_delivery: num(f.delivery), p_note: f.note || null,
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast('Terms saved. Their prices have been brought in line.')
    setOpen(false); onDone()
  }

  const custom = v.fee_pct_override != null || v.commission_allowance_override != null || v.delivery_fee_override != null

  return (
    <>
      <button className="btn sm" onClick={(e) => { e.stopPropagation(); setOpen(true); load() }}>
        {custom ? 'Own terms' : 'Standard'}
      </button>
      {open && (
        <Modal title={`Terms for ${v.business_name}`} onClose={() => setOpen(false)}>
          <div className="stack">
            <p className="small muted">
              Leave a box empty to use the marketplace default. Changing these re-prices everything
              this seller has listed, so what the shopper pays moves — what the seller receives does not.
            </p>
            <div className="form-grid">
              <Field label="Our fee (%)" hint={t ? `Default is ${t.fee_pct}%` : ''}>
                <Input type="number" value={f.fee} onChange={(val) => setF({ ...f, fee: val })} placeholder="default" />
              </Field>
              <Field label="Room for affiliate commission (%)" hint={t ? `Default is ${t.allowance_pct}%` : ''}>
                <Input type="number" value={f.allowance} onChange={(val) => setF({ ...f, allowance: val })} placeholder="default" />
              </Field>
              <Field label="Delivery from their place (K)" hint={t ? `Default is K${t.delivery_fee}` : 'What one trip costs you'} span>
                <Input type="number" value={f.delivery} onChange={(val) => setF({ ...f, delivery: val })} placeholder="default" />
              </Field>
              <Field label="Why these terms" hint="For your own record" span>
                <Textarea value={f.note} onChange={(val) => setF({ ...f, note: val })} rows={2}
                  placeholder="An hour out of town, so delivery costs more" />
              </Field>
            </div>
            <TermsMaths fee={f.fee || t?.fee_pct} allowance={f.allowance || t?.allowance_pct} />
            <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save terms'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

// A worked example, because percentages on their own do not show the shape of
// the deal. Uses a round K100 so the numbers are easy to read off.
function TermsMaths({ fee, allowance }) {
  const [p, setP] = useState(null)
  useEffect(() => {
    supabase.rpc('shelf_price', { p_take: 100, p_fee_pct: Number(fee || 0), p_allowance_pct: Number(allowance || 0) })
      .then(({ data, error }) => { if (!error) setP(Number(data)) })
      .catch(() => {})
  }, [fee, allowance])
  if (!p) return null
  const aff = Math.round(p * Number(allowance || 0)) / 100
  return (
    <div className="price-maths">
      <div className="pm-row"><span>If they ask for</span><strong>K100.00</strong></div>
      <div className="pm-row lead"><span>The shopper pays</span><strong>K{p.toFixed(2)}</strong></div>
      <div className="pm-row"><span>They always receive</span><span>K100.00</span></div>
      <div className="pm-row"><span>An affiliate would earn up to</span><span>K{aff.toFixed(2)}</span></div>
      <div className="pm-row total"><span>You keep</span>
        <strong>K{(p - 100 - aff).toFixed(2)} — or K{(p - 100).toFixed(2)} if nobody referred it</strong>
      </div>
    </div>
  )
}

function TrustCell({ v, onDone, verifying }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ level: v.trust_level || 'new', id_seen: !!v.id_seen, note: v.id_seen_note || '', reg: v.business_reg_no || '' })
  const save = async () => {
    const { error } = await supabase.rpc('set_vendor_trust', { p_vendor: v.id, p_level: f.level, p_id_seen: f.id_seen, p_note: f.note || null, p_reg_no: f.reg || null })
    if (error) return toast(error.message, true)
    toast('Saved'); setOpen(false); onDone()
  }

  // Verification is switched off until ZaMarket is registered. The column still
  // shows, so the history stays visible, but nothing new can be recorded.
  if (!verifying) return <span className="tiny muted">Not in use</span>

  const label = { new: 'Not checked', known: 'Met them', verified: 'Verified' }[v.trust_level || 'new']
  return (
    <>
      <button className="btn sm" onClick={(e) => { e.stopPropagation(); setOpen(true) }}>
        <Badge status={v.trust_level === 'verified' ? 'approved' : v.trust_level === 'known' ? 'pending' : 'draft'}>{label}</Badge>
      </button>
      {open && (
        <Modal title={`Checks on ${v.business_name}`} onClose={() => setOpen(false)}>
          <div className="stack">
            <p className="small muted">Ask for as little as possible, as late as possible. Everyday sellers need nothing beyond a phone and an area. Meet them and see an ID or PACRA paper before they list anything expensive, and before a large payout.</p>
            <Field label="How far have we checked them?">
              <Segmented options={[['new', 'Not checked'], ['known', 'Met them'], ['verified', 'ID or PACRA seen']]} value={f.level} onChange={(val) => setF({ ...f, level: val })} />
            </Field>
            <label className="check"><input type="checkbox" checked={f.id_seen} onChange={(e) => setF({ ...f, id_seen: e.target.checked })} /> Someone on our team saw their ID or registration in person</label>
            <Field label="What was seen, by whom, where" hint="Never type the ID number itself — just the fact of the check">
              <Textarea value={f.note} onChange={(val) => setF({ ...f, note: val })} rows={2} placeholder="NRC seen at their shop in Kabwata, 19 Sept, by Abubakr" />
            </Field>
            <Field label="PACRA number (optional)"><Input value={f.reg} onChange={(val) => setF({ ...f, reg: val })} /></Field>
            {v.id_seen_at && <p className="tiny muted">First checked {date(v.id_seen_at)}.</p>}
            <button className="btn primary" onClick={save}>Save</button>
          </div>
        </Modal>
      )}
    </>
  )
}

export function Vendors() {
  const { isFounder, settings } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('approved')
  const [open, setOpen] = useState(null)
  const { data, loading, reload } = useData(async () => {
    const vendors = await q(supabase.from('vendors').select('*,products(id,status),settlements(gross,marketplace_fee,net_payable,status)').order('created_at', { ascending: false }))
    return vendors.map((v) => ({
      ...v,
      live: v.products.filter((p) => p.status === 'published').length,
      sales: v.settlements.filter((s) => s.status !== 'cancelled').reduce((t, s) => t + n(s.gross), 0),
      fees: v.settlements.filter((s) => s.status !== 'cancelled').reduce((t, s) => t + n(s.marketplace_fee), 0),
      owed: v.settlements.filter((s) => ['pending', 'eligible', 'approved'].includes(s.status)).reduce((t, s) => t + n(s.net_payable), 0),
    }))
  }, [])
  const rows = (data || []).filter((v) => (tab === 'pending' ? v.status === 'pending' : tab === 'approved' ? v.status === 'approved' : !['pending', 'approved'].includes(v.status)))
  const pending = (data || []).filter((v) => v.status === 'pending').length
  const review = async (id, status) => {
    const reason = ['rejected', 'suspended', 'terminated'].includes(status) ? window.prompt('Reason?') : null
    if (['rejected', 'suspended', 'terminated'].includes(status) && !reason) return
    const { error } = await supabase.rpc('review_application', { p_table: 'vendors', p_id: id, p_status: status, p_reason: reason })
    if (error) return toast(error.message, true)
    toast(`Vendor ${status}`); setOpen(null); reload()
  }
  const saveVendor = async (v) => {
    const { error } = await supabase.from('vendors').update({ fee_pct_override: v.fee_pct_override === '' || v.fee_pct_override == null ? null : n(v.fee_pct_override), health: v.health, payout_info: v.payout_info, slug: v.slug }).eq('id', v.id)
    if (error) return toast(error.message, true)
    toast('Saved'); setOpen(null); reload()
  }

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Vendors</h1><p>Businesses selling through the marketplace. We charge {settings.marketplace_fee_pct}% per sale unless overridden.</p></div></div>
      <Tabs tabs={[['approved', 'Active'], ['pending', `Applications${pending ? ` (${pending})` : ''}`], ['other', 'Inactive']]} value={tab} onChange={setTab} />
      {loading ? <Loading /> : (
        <Table rows={rows} onRow={setOpen} empty={tab === 'pending' ? 'No applications waiting' : 'No vendors here'} cols={[
          { key: 'business_name', label: 'Vendor', render: (v) => <div><div className="strong">{v.business_name}</div><div className="tiny muted">{v.category} · {v.location}</div></div> },
          // Verification is off until ZaMarket is registered, so the column is
          // not shown at all rather than sitting there doing nothing.
          ...(settings?.verification_on === 'on'
            ? [{ key: 'trust_level', label: 'Checked', render: (v) => <TrustCell v={v} onDone={reload} verifying /> }]
            : []),
          { key: 'terms', label: 'Terms', render: (v) => <TermsCell v={v} onDone={reload} /> },
          { key: 'status', label: 'Status', render: (v) => <span className="row"><Badge status={v.status} />{v.status === 'approved' && <Badge status={v.health} />}</span> },
          { key: 'live', label: 'Live products', num: true },
          { key: 'sales', label: 'Sales', num: true, render: (v) => money(v.sales) },
          { key: 'fees', label: 'Fees earned', num: true, render: (v) => money(v.fees) },
          { key: 'owed', label: 'We owe', num: true, render: (v) => <span className={v.owed ? 'copper strong' : ''}>{money(v.owed)}</span> },
          { key: 'created_at', label: 'Applied', render: (v) => date(v.created_at) },
          // Some sellers cannot set their own shop up. This opens their own
          // screens so a staff member can do it for them.
          { key: 'setup', label: '', render: (v) => v.status === 'approved'
            ? <Link className="btn sm" to={`/admin/vendors/${v.id}/shop`} onClick={(e) => e.stopPropagation()}>Set up shop</Link>
            : null },
        ]} />
      )}
      {open && <VendorModal v={open} onClose={() => setOpen(null)} onReview={review} onSave={saveVendor} canReview={isFounder} />}
    </div>
  )
}

function VendorModal({ v: initial, onClose, onReview, onSave, canReview }) {
  const [v, setV] = useState({ ...initial })
  const set = (k) => (val) => setV((c) => ({ ...c, [k]: val }))
  return (
    <Modal title={v.business_name} onClose={onClose}>
      <div className="stack">
        <div className="between"><div className="row"><Badge status={v.status} />{v.status === 'approved' && <Badge status={v.health} />}</div><div className="btn-row">{v.status === 'approved' && <Link className="btn sm primary" to={`/admin/vendors/${v.id}/shop`}>Set up their shop</Link>}{v.status !== 'pending' && <Link className="btn sm" to={`/admin/earnings/vendor/${v.id}`}>View earnings</Link>}</div></div>
        <Breakdown items={[['Owner', v.owner_name || '—'], ['Phone', v.phone], ['Email', v.email || '—'], ['Location', v.location || '—'], ['Category', v.category || '—'], ['Delivers?', v.delivery_capability || '—'], ['Returns policy', v.return_policy || '—'], ['Links', v.links || '—'], ['Licences', v.licenses || '—'], ['Payout details', v.payout_info || '—'], ['Agreed to terms', v.agreed_terms ? 'Yes' : 'No']]} />
        {v.description && <div className="small"><span className="strong">What they sell:</span> {v.description}</div>}
        {v.slug && v.status === 'approved' && (
          <div className="stack-sm">
            <div className="tiny muted">Store link</div>
            <CopyLine text={`${window.location.origin}/${v.slug}`} />
            {canReview && <div className="row"><Input value={v.slug} onChange={set('slug')} style={{ maxWidth: 220 }} /><button className="btn sm" onClick={() => onSave(v)}>Change link</button></div>}
          </div>
        )}
        {v.status === 'approved' && (
          <div className="card flat form-grid">
            <Field label="Fee override (%)" hint="Empty = global fee"><Input type="number" value={v.fee_pct_override} onChange={set('fee_pct_override')} /></Field>
            <Field label="Health"><Select value={v.health} onChange={set('health')} options={['healthy', 'watch', 'at_risk', 'suspended']} /></Field>
            <Field label="Payout details" span><Input value={v.payout_info} onChange={set('payout_info')} /></Field>
            <div className="span"><button className="btn primary" onClick={() => onSave(v)}>Save</button></div>
          </div>
        )}
        {canReview && (
          <div className="btn-row">
            {v.status !== 'approved' && <button className="btn primary" onClick={() => onReview(v.id, 'approved')}>Approve</button>}
            {v.status === 'pending' && <button className="btn danger" onClick={() => onReview(v.id, 'rejected')}>Reject</button>}
            {v.status === 'approved' && <button className="btn danger" onClick={() => onReview(v.id, 'suspended')}>Suspend</button>}
            {v.status === 'suspended' && <button className="btn danger" onClick={() => onReview(v.id, 'terminated')}>Terminate</button>}
          </div>
        )}
        {!canReview && <p className="tiny muted">Only a founder can approve or suspend vendors.</p>}
      </div>
    </Modal>
  )
}

export function Resellers() {
  const { isFounder, settings } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('approved')
  const [open, setOpen] = useState(null)
  const { data, loading, reload } = useData(async () => {
    const rs = await q(supabase.from('resellers').select('*,orders(id,status,subtotal,risk_flags),commissions(amount,status)').order('created_at', { ascending: false }))
    const training = await q(supabase.from('training_progress').select('user_id'))
    return rs.map((r) => {
      const good = r.orders.filter((o) => !['cancelled', 'refunded', 'returned', 'fraud_review'].includes(o.status))
      return {
        ...r, trained: training.filter((t) => t.user_id === r.user_id).length,
        sales: good.length, revenue: good.reduce((t, o) => t + n(o.subtotal), 0),
        flagged: r.orders.filter((o) => o.risk_flags?.length).length,
        earned: r.commissions.filter((c) => c.status === 'paid').reduce((t, c) => t + n(c.amount), 0),
        owed: r.commissions.filter((c) => ['verified', 'approved'].includes(c.status)).reduce((t, c) => t + n(c.amount), 0),
        pendingAmt: r.commissions.filter((c) => c.status === 'pending').reduce((t, c) => t + n(c.amount), 0),
      }
    })
  }, [])
  const rows = (data || []).filter((r) => (tab === 'pending' ? r.status === 'pending' : tab === 'approved' ? r.status === 'approved' : !['pending', 'approved'].includes(r.status)))
  const pending = (data || []).filter((r) => r.status === 'pending').length
  const review = async (id, status) => {
    const reason = ['rejected', 'suspended', 'terminated'].includes(status) ? window.prompt('Reason?') : null
    if (['rejected', 'suspended', 'terminated'].includes(status) && !reason) return
    const { error } = await supabase.rpc('review_application', { p_table: 'resellers', p_id: id, p_status: status, p_reason: reason })
    if (error) return toast(error.message, true)
    toast(`Reseller ${status}`); setOpen(null); reload()
  }
  const saveTarget = async (r) => {
    const { error } = await supabase.from('resellers').update({ monthly_target: n(r.monthly_target) }).eq('id', r.id)
    if (error) return toast(error.message, true)
    toast('Saved'); setOpen(null); reload()
  }

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Affiliates</h1><p>People selling on commission. Default {settings.default_commission_pct}% unless a product says otherwise.</p></div></div>
      <div className="grid-3">
        <Stat label="Active resellers" value={(data || []).filter((r) => r.status === 'approved').length} />
        <Stat label="Owed now" value={money((data || []).reduce((t, r) => t + r.owed, 0))} tone="copper" />
        <Stat label="In grace period" value={money((data || []).reduce((t, r) => t + r.pendingAmt, 0))} sub={`${settings.commission_grace_hours ?? 24}h after completion`} />
      </div>
      <Tabs tabs={[['approved', 'Active'], ['pending', `Applications${pending ? ` (${pending})` : ''}`], ['other', 'Inactive']]} value={tab} onChange={setTab} />
      {loading ? <Loading /> : (
        <Table rows={rows} onRow={setOpen} empty={tab === 'pending' ? 'No applications waiting' : 'No resellers here'} cols={[
          { key: 'full_name', label: 'Reseller', render: (r) => <div><div className="strong">{r.full_name}</div><div className="tiny muted">{r.code ? `Code ${r.code}` : r.location}</div></div> },
          { key: 'status', label: 'Status', render: (r) => <span className="row"><Badge status={r.status} />{r.flagged > 0 && <span className="badge bad">{r.flagged} flagged</span>}</span> },
          { key: 'trained', label: 'Training', num: true, render: (r) => <span className={r.trained >= 9 ? 'ok' : r.trained ? '' : 'muted'}>{r.trained >= 9 ? 'Done' : `${r.trained}/9`}</span> },
          { key: 'sales', label: 'Sales', num: true },
          { key: 'revenue', label: 'Revenue', num: true, render: (r) => money(r.revenue) },
          { key: 'earned', label: 'Paid out', num: true, render: (r) => money(r.earned) },
          { key: 'owed', label: 'Owed', num: true, render: (r) => <span className={r.owed ? 'copper strong' : ''}>{money(r.owed)}</span> },
        ]} />
      )}
      {open && (
        <Modal title={open.full_name} onClose={() => setOpen(null)}>
          <div className="stack">
            <div className="between"><Badge status={open.status} />{open.status !== 'pending' && <Link className="btn sm" to={`/admin/earnings/reseller/${open.id}`}>View earnings</Link>}</div>
            <Breakdown items={[['Phone', open.phone], ['Email', open.email || '—'], ['Location', open.location || '—'], ['Wants to sell', open.categories || '—'], ['Agreed to terms', open.agreed_terms ? 'Yes' : 'No'], ['Applied', date(open.created_at)]]} />
            {open.experience && <div className="small"><span className="strong">Experience:</span> {open.experience}</div>}
            {open.code && <div><div className="tiny muted mb">Referral link</div><CopyLine text={`${window.location.origin}/r/${open.code}`} /></div>}
            {open.status === 'approved' && (
              <div className="card flat row">
                <Field label="Monthly sales target (K)"><Input money value={open.monthly_target} onChange={(v) => setOpen({ ...open, monthly_target: v })} /></Field>
                <button className="btn primary sm" style={{ marginTop: 22 }} onClick={() => saveTarget(open)}>Save</button>
              </div>
            )}
            {isFounder ? (
              <div className="btn-row">
                {open.status !== 'approved' && <button className="btn primary" onClick={() => review(open.id, 'approved')}>Approve</button>}
                {open.status === 'pending' && <button className="btn danger" onClick={() => review(open.id, 'rejected')}>Reject</button>}
                {open.status === 'approved' && <button className="btn danger" onClick={() => review(open.id, 'suspended')}>Suspend</button>}
              </div>
            ) : <p className="tiny muted">Only a founder can approve or suspend affiliates.</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
