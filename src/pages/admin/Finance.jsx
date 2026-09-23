import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import Split from './Split'
import ProfitGuard from './ProfitGuard'
import { useAuth } from '../../lib/auth'
import { money, date, datetime, n, title } from '../../lib/format'
import { EXPENSE_CATEGORIES } from '../../lib/statuses'
import { Badge, Table, Loading, Modal, Field, Input, Select, Textarea, useToast, Stat, Tabs } from '../../components/ui'

const TABS = [['owed', 'Who we owe'], ['requests', 'Payout requests'], ['commissions', 'Commissions'], ['settlements', 'Vendor payouts'], ['expenses', 'Expenses'], ['capital', 'Founder money'], ['split', 'Our split'], ['guard', 'Profit guard']]

export default function Finance() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'owed'
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Finance</h1><p>Every kwacha owed, to whom, and why.</p></div></div>
      <Tabs tabs={TABS} value={tab} onChange={(v) => setSp({ tab: v })} />
      {tab === 'owed' && <Owed />}
      {tab === 'requests' && <PayoutRequests />}
      {tab === 'split' && <Split />}
      {tab === 'guard' && <ProfitGuard />}
      {tab === 'commissions' && <Commissions />}
      {tab === 'settlements' && <Settlements />}
      {tab === 'expenses' && <Expenses />}
      {tab === 'capital' && <Capital />}
    </div>
  )
}

function Owed() {
  const { data, loading } = useData(async () => {
    const [comms, setts, purchases] = await Promise.all([
      q(supabase.from('commissions').select('amount,status,eligible_at,reseller:resellers(full_name,phone)').in('status', ['pending', 'verified', 'approved'])),
      q(supabase.from('settlements').select('net_payable,status,vendor:vendors(business_name,payout_info)').in('status', ['pending', 'eligible', 'approved'])),
      q(supabase.from('purchases').select('amount_paid,status,supplier:suppliers(name),items:purchase_items(quantity,unit_price)').neq('status', 'cancelled')),
    ])
    const group = (rows, key, amt, ready) => Object.values(rows.reduce((m, r) => { const k = key(r); m[k] = m[k] || { id: k, name: k, ready: 0, waiting: 0, note: r.note }; if (ready(r)) m[k].ready += amt(r); else m[k].waiting += amt(r); return m }, {}))
    const resellers = group(comms, (c) => c.reseller?.full_name || '?', (c) => n(c.amount), (c) => ['verified', 'approved'].includes(c.status) || new Date(c.eligible_at) < new Date())
    const vendors = group(setts.map((s) => ({ ...s, note: s.vendor?.payout_info })), (s) => s.vendor?.business_name || '?', (s) => n(s.net_payable), (s) => s.status !== 'pending')
    const suppliers = purchases.map((p) => ({ name: p.supplier?.name || '?', owed: p.items.reduce((t, i) => t + i.quantity * n(i.unit_price), 0) - n(p.amount_paid) })).filter((s) => s.owed > 0)
      .reduce((m, s) => { m[s.name] = m[s.name] || { id: s.name, name: s.name, ready: 0, waiting: 0 }; m[s.name].ready += s.owed; return m }, {})
    return { resellers, vendors, suppliers: Object.values(suppliers) }
  }, [])
  if (loading || !data) return <Loading />
  const total = (rows) => rows.reduce((t, r) => t + r.ready, 0)
  const Block = ({ title: t, rows, hint }) => (
    <div className="card">
      <div className="card-title"><h3>{t}</h3><span className="strong money copper">{money(total(rows))}</span></div>
      {rows.length === 0 ? <p className="small muted">Nothing owed.</p> : rows.map((r) => (
        <div key={r.id} className="between small" style={{ padding: '4px 0' }}>
          <span>{r.name}{r.note && <span className="tiny muted"> · {r.note}</span>}</span>
          <span className="row"><span className="money strong">{money(r.ready)}</span>{r.waiting > 0 && <span className="tiny muted">+{money(r.waiting)} {hint}</span>}</span>
        </div>
      ))}
    </div>
  )
  return (
    <div className="stack">
      <div className="grid-3">
        <Stat label="Owed to resellers" value={money(total(data.resellers))} sub="ready to pay" />
        <Stat label="Owed to vendors" value={money(total(data.vendors))} sub="ready to pay" />
        <Stat label="Owed to suppliers" value={money(total(data.suppliers))} sub="unpaid purchases" />
      </div>
      <Block title="Resellers" rows={data.resellers} hint="in grace period" />
      <Block title="Vendors" rows={data.vendors} hint="not yet eligible" />
      <Block title="Suppliers" rows={data.suppliers} />
      <p className="tiny muted">Pay people, then mark items as paid in the Commissions and Vendor payouts tabs so the numbers stay honest.</p>
    </div>
  )
}

function PayoutRequests() {
  const toast = useToast()
  const { data, loading, reload } = useData(() => q(
    supabase.from('payouts').select('*,reseller:resellers(full_name,phone),vendor:vendors(business_name,phone)').order('requested_at', { ascending: false }).limit(200)
  ), [])
  const act = async (p, status) => {
    const note = status === 'rejected' ? window.prompt('Why not?') : null
    if (status === 'rejected' && !note) return
    if (status === 'paid' && !window.confirm(`Confirm you have sent ${money(p.amount)}. This also marks the commissions or payouts behind it as paid.`)) return
    const { error } = await supabase.rpc('set_payout_status', { p_payout: p.id, p_status: status, p_note: note })
    if (error) return toast(error.message, true)
    toast(status === 'paid' ? 'Marked paid' : `Request ${status}`); reload()
  }
  if (loading) return <Loading />
  const waiting = (data || []).filter((p) => ['requested', 'approved'].includes(p.status))
  const done = (data || []).filter((p) => !['requested', 'approved'].includes(p.status))
  const row = (p) => {
    const who = p.reseller?.full_name || p.vendor?.business_name || '—'
    const phone = p.reseller?.phone || p.vendor?.phone
    return (
      <div key={p.id} className="mini-row">
        <span className="grow">
          <strong>{who}</strong>
          <span className="tiny muted">{p.payee_type === 'reseller' ? 'Reseller' : 'Vendor'} · {date(p.requested_at)} · {p.method}{p.details ? ` to ${p.details}` : ''}{phone ? ` · ${phone}` : ''}</span>
          {p.note && <span className="tiny muted">{p.note}</span>}
        </span>
        <span className="strong money">{money(p.amount)}</span>
        <Badge status={{ requested: 'pending', approved: 'approved', paid: 'paid', rejected: 'rejected' }[p.status]}>
          {{ requested: 'Waiting', approved: 'Approved', paid: 'Paid', rejected: 'Not approved' }[p.status]}
        </Badge>
        {p.status === 'requested' && <div className="btn-row"><button className="btn sm" onClick={() => act(p, 'approved')}>Approve</button><button className="btn sm ghost" onClick={() => act(p, 'rejected')}>Decline</button></div>}
        {['requested', 'approved'].includes(p.status) && <button className="btn sm buy" onClick={() => act(p, 'paid')}>Mark paid</button>}
      </div>
    )
  }
  return (
    <div className="stack">
      <p className="small muted">Affiliates and vendors ask to be paid here. Send the money the way they asked, then tap Mark paid — that also settles the commissions or vendor payouts behind it, so nothing is paid twice.</p>
      <section className="card">
        <div className="card-title"><h3>Waiting</h3><span className="strong money copper">{money(waiting.reduce((t, p) => t + n(p.amount), 0))}</span></div>
        {waiting.length === 0 ? <p className="small muted">No requests right now.</p> : <div className="mini-table">{waiting.map(row)}</div>}
      </section>
      {done.length > 0 && (
        <section className="card">
          <h3 className="mb">History</h3>
          <div className="mini-table">{done.map(row)}</div>
        </section>
      )}
    </div>
  )
}

function Commissions() {
  const toast = useToast()
  const [filter, setFilter] = useState('open')
  const { data, loading, reload } = useData(() => q(supabase.from('commissions').select('*,reseller:resellers(full_name,phone),order:orders(order_number,status)').order('created_at', { ascending: false }).limit(300)), [])
  const rows = (data || []).filter((c) => (filter === 'open' ? ['pending', 'verified', 'approved'].includes(c.status) : filter === 'paid' ? c.status === 'paid' : ['rejected', 'reversed'].includes(c.status)))
  const move = async (c, status) => {
    const { error } = await supabase.rpc('set_commission_status', { p_id: c.id, p_status: status, p_reason: status === 'rejected' ? window.prompt('Reason?') || 'Rejected' : null })
    if (error) return toast(error.message, true)
    toast(`Commission ${status}`); reload()
  }
  return (
    <div className="stack">
      <div className="segmented"><button className={filter === 'open' ? 'on' : ''} onClick={() => setFilter('open')}>Open</button><button className={filter === 'paid' ? 'on' : ''} onClick={() => setFilter('paid')}>Paid</button><button className={filter === 'void' ? 'on' : ''} onClick={() => setFilter('void')}>Rejected</button></div>
      <p className="tiny muted">Pending → Verified (after the grace period, if not refunded) → Approved → Paid. Refunds reverse unpaid commissions automatically.</p>
      {loading ? <Loading /> : (
        <Table rows={rows} empty="No commissions in this view" cols={[
          { key: 'reseller', label: 'Reseller', render: (c) => <div><div className="strong">{c.reseller?.full_name}</div><div className="tiny muted">#{c.order?.order_number} · order {title(c.order?.status)}</div></div> },
          { key: 'amount', label: 'Amount', num: true, render: (c) => money(c.amount) },
          { key: 'status', label: 'Status', render: (c) => <Badge status={c.status} /> },
          { key: 'eligible_at', label: 'Eligible', render: (c) => <span className={new Date(c.eligible_at) > new Date() ? 'warn tiny' : 'tiny'}>{datetime(c.eligible_at)}</span> },
          { key: 'x', label: '', render: (c) => (
            <div className="btn-row">
              {c.status === 'pending' && <button className="btn sm" disabled={new Date(c.eligible_at) > new Date()} onClick={() => move(c, 'verified')}>Verify</button>}
              {c.status === 'verified' && <button className="btn sm" onClick={() => move(c, 'approved')}>Approve</button>}
              {c.status === 'approved' && <button className="btn sm primary" onClick={() => move(c, 'paid')}>Mark paid</button>}
              {['pending', 'verified', 'approved'].includes(c.status) && <button className="btn sm danger" onClick={() => move(c, 'rejected')}>Reject</button>}
            </div>
          ) },
        ]} />
      )}
    </div>
  )
}

function Settlements() {
  const toast = useToast()
  const [filter, setFilter] = useState('open')
  const { data, loading, reload } = useData(() => q(supabase.from('settlements').select('*,vendor:vendors(business_name,payout_info),order:orders(order_number,status)').order('created_at', { ascending: false }).limit(300)), [])
  const rows = (data || []).filter((s) => (filter === 'open' ? ['pending', 'eligible', 'approved'].includes(s.status) : filter === 'paid' ? s.status === 'paid' : s.status === 'cancelled'))
  const move = async (s, status) => {
    const { error } = await supabase.rpc('set_settlement_status', { p_id: s.id, p_status: status })
    if (error) return toast(error.message, true)
    toast(`Payout ${status}`); reload()
  }
  return (
    <div className="stack">
      <div className="segmented"><button className={filter === 'open' ? 'on' : ''} onClick={() => setFilter('open')}>Open</button><button className={filter === 'paid' ? 'on' : ''} onClick={() => setFilter('paid')}>Paid</button><button className={filter === 'void' ? 'on' : ''} onClick={() => setFilter('void')}>Cancelled</button></div>
      <p className="tiny muted">Vendor is paid gross minus the marketplace fee once the order is completed and past the return window.</p>
      {loading ? <Loading /> : (
        <Table rows={rows} empty="No payouts in this view" cols={[
          { key: 'vendor', label: 'Vendor', render: (s) => <div><div className="strong">{s.vendor?.business_name}</div><div className="tiny muted">#{s.order?.order_number}{s.vendor?.payout_info ? ` · ${s.vendor.payout_info}` : ''}</div></div> },
          { key: 'gross', label: 'Sale', num: true, render: (s) => money(s.gross) },
          { key: 'marketplace_fee', label: 'Our fee', num: true, render: (s) => money(s.marketplace_fee) },
          { key: 'net_payable', label: 'Pay vendor', num: true, render: (s) => <span className="strong">{money(s.net_payable)}</span> },
          { key: 'status', label: 'Status', render: (s) => <Badge status={s.status} /> },
          { key: 'x', label: '', render: (s) => (
            <div className="btn-row">
              {s.status === 'pending' && <button className="btn sm" onClick={() => move(s, 'eligible')}>Mark eligible</button>}
              {s.status === 'eligible' && <button className="btn sm" onClick={() => move(s, 'approved')}>Approve</button>}
              {s.status === 'approved' && <button className="btn sm primary" onClick={() => move(s, 'paid')}>Mark paid</button>}
            </div>
          ) },
        ]} />
      )}
    </div>
  )
}

function Expenses() {
  const toast = useToast()
  const { user } = useAuth()
  const [add, setAdd] = useState(false)
  const [f, setF] = useState({ category: 'packaging', amount: '', description: '', spent_on: new Date().toISOString().slice(0, 10) })
  const { data, loading, reload } = useData(() => q(supabase.from('expenses').select('*').order('spent_on', { ascending: false }).limit(300)), [])
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('expenses').insert({ category: f.category, amount: n(f.amount), description: f.description || null, spent_on: f.spent_on, created_by: user.id })
    if (error) return toast(error.message, true)
    toast('Expense saved'); setAdd(false); setF({ ...f, amount: '', description: '' }); reload()
  }
  const total = (data || []).reduce((t, e) => t + n(e.amount), 0)
  return (
    <div className="stack">
      <div className="between"><span className="muted">Total logged: <span className="strong money">{money(total)}</span></span><button className="btn primary" onClick={() => setAdd(true)}>Add expense</button></div>
      {loading ? <Loading /> : (
        <Table rows={data} empty="No expenses logged" cols={[
          { key: 'spent_on', label: 'Date', render: (e) => date(e.spent_on) },
          { key: 'category', label: 'Category', render: (e) => title(e.category) },
          { key: 'description', label: 'What' },
          { key: 'amount', label: 'Amount', num: true, render: (e) => money(e.amount) },
        ]} />
      )}
      {add && (
        <Modal title="Add expense" onClose={() => setAdd(false)}>
          <form onSubmit={submit} className="form-grid">
            <Field label="Category"><Select value={f.category} onChange={(v) => setF({ ...f, category: v })} options={EXPENSE_CATEGORIES} /></Field>
            <Field label="Date"><Input type="date" value={f.spent_on} onChange={(v) => setF({ ...f, spent_on: v })} /></Field>
            <Field label="Amount"><Input money value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required /></Field>
            <Field label="What for"><Input value={f.description} onChange={(v) => setF({ ...f, description: v })} /></Field>
            <div className="span"><button className="btn primary block">Save</button></div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Capital() {
  const toast = useToast()
  const { user, isFounder, settings } = useAuth()
  const [add, setAdd] = useState(null)
  const [f, setF] = useState({ amount: '', purpose: '' })
  const { data, loading, reload } = useData(async () => ({
    ins: await q(supabase.from('founder_contributions').select('*,founder:profiles(full_name)').order('contributed_on', { ascending: false })),
    outs: await q(supabase.from('founder_withdrawals').select('*,founder:profiles(full_name)').order('withdrawn_on', { ascending: false })),
  }), [])
  if (!isFounder) return <p className="muted">Only founders can see founder money.</p>
  if (loading || !data) return <Loading />
  const totalIn = data.ins.reduce((t, x) => t + n(x.amount), 0)
  const totalOut = data.outs.reduce((t, x) => t + n(x.amount), 0)
  const submit = async (e) => {
    e.preventDefault()
    const table = add === 'in' ? 'founder_contributions' : 'founder_withdrawals'
    const { error } = await supabase.from(table).insert({ founder_id: user.id, amount: n(f.amount), purpose: f.purpose || null })
    if (error) return toast(error.message, true)
    toast('Saved'); setAdd(null); setF({ amount: '', purpose: '' }); reload()
  }
  const alloc = settings.capital_allocation || {}
  return (
    <div className="stack">
      <div className="grid-3">
        <Stat label="Founders put in" value={money(totalIn)} />
        <Stat label="Founders took out" value={money(totalOut)} />
        <Stat label="Net capital in the business" value={money(totalIn - totalOut)} />
      </div>
      <p className="tiny muted">Founder money is not revenue. It is tracked separately so profit numbers stay honest.</p>
      {Object.keys(alloc).length > 0 && (
        <div className="card"><h3 className="mb">Starting capital plan</h3><div className="row">{Object.entries(alloc).map(([k, v]) => <span key={k} className="badge">{title(k)}: {v}</span>)}</div><p className="tiny muted mt">Edit in Settings.</p></div>
      )}
      <div className="btn-row"><button className="btn primary" onClick={() => setAdd('in')}>Record contribution</button><button className="btn" onClick={() => setAdd('out')}>Record withdrawal</button></div>
      <div className="grid-2 tight">
        <div className="card"><h3 className="mb">Contributions</h3><Table rows={data.ins} empty="None yet" cols={[{ key: 'contributed_on', label: 'Date', render: (x) => date(x.contributed_on) }, { key: 'founder', label: 'Who', render: (x) => x.founder?.full_name }, { key: 'purpose', label: 'Purpose' }, { key: 'amount', label: 'Amount', num: true, render: (x) => money(x.amount) }]} /></div>
        <div className="card"><h3 className="mb">Withdrawals</h3><Table rows={data.outs} empty="None yet" cols={[{ key: 'withdrawn_on', label: 'Date', render: (x) => date(x.withdrawn_on) }, { key: 'founder', label: 'Who', render: (x) => x.founder?.full_name }, { key: 'purpose', label: 'Purpose' }, { key: 'amount', label: 'Amount', num: true, render: (x) => money(x.amount) }]} /></div>
      </div>
      {add && (
        <Modal title={add === 'in' ? 'Founder contribution' : 'Founder withdrawal'} onClose={() => setAdd(null)}>
          <form onSubmit={submit} className="stack">
            <Field label="Amount"><Input money value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required /></Field>
            <Field label="Purpose"><Input value={f.purpose} onChange={(v) => setF({ ...f, purpose: v })} /></Field>
            <button className="btn primary block">Save</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
