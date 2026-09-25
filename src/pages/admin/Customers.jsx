import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, date, n, title } from '../../lib/format'
import { Badge, Table, Loading, Modal, Field, Input, useToast, Tabs } from '../../components/ui'

export function Customers() {
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)
  const { data, loading } = useData(async () => {
    const customers = await q(supabase.from('customers').select('*,district:districts(name),orders(id,order_number,total,status,created_at)').order('created_at', { ascending: false }))
    return customers.map((c) => {
      const good = c.orders.filter((o) => !['cancelled', 'refunded', 'returned', 'fraud_review'].includes(o.status))
      return { ...c, count: good.length, spent: good.reduce((s, o) => s + n(o.total), 0), last: c.orders.map((o) => o.created_at).sort().pop(), problems: c.orders.length - good.length }
    })
  }, [])
  const rows = (data || []).filter((c) => !search || c.full_name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Customers</h1><p>Everyone who has ordered, from any channel.</p></div>
        <Input value={search} onChange={setSearch} placeholder="Search name or phone" style={{ maxWidth: 260 }} />
      </div>
      {loading ? <Loading /> : (
        <Table rows={rows} onRow={setOpen} empty="No customers yet" cols={[
          { key: 'full_name', label: 'Customer', render: (c) => <div><div className="strong">{c.full_name}</div><div className="tiny muted">{c.phone}</div></div> },
          { key: 'where', label: 'Where', render: (c) => [c.area, c.district?.name].filter(Boolean).join(', ') || '—' },
          { key: 'count', label: 'Orders', num: true, render: (c) => <span>{c.count}{c.problems > 0 && <span className="tiny bad"> · {c.problems} issue{c.problems > 1 ? 's' : ''}</span>}</span> },
          { key: 'spent', label: 'Spent', num: true, render: (c) => money(c.spent) },
          { key: 'last', label: 'Last order', render: (c) => date(c.last) },
        ]} />
      )}
      {open && (
        <Modal title={open.full_name} onClose={() => setOpen(null)}>
          <div className="stack">
            <div className="small"><a href={`tel:${open.phone}`}>{open.phone}</a>{open.email && ` · ${open.email}`}<br />{[open.address, open.area, open.district?.name].filter(Boolean).join(', ')}</div>
            {open.notes && <div className="small muted">{open.notes}</div>}
            <h3>Orders</h3>
            {open.orders.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((o) => (
              <div key={o.id} className="between small" style={{ cursor: 'pointer' }} onClick={() => nav(`/admin/orders/${o.id}`)}>
                <span>#{o.order_number} · {date(o.created_at)}</span><span className="row"><Badge status={o.status} /><span className="money">{money(o.total)}</span></span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

const BOARD = [['todo', 'To arrange'], ['moving', 'Out for delivery'], ['done', 'Delivered'], ['failed', 'Failed']]

export function Deliveries() {
  const nav = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState('todo')
  const [edit, setEdit] = useState(null)
  const { data, loading, reload } = useData(() => q(
    supabase.from('deliveries').select('*,assignee:profiles(full_name),order:orders!inner(id,order_number,needed_by,status,total,delivery_fee,delivery_fee_status,is_local,area,address,customer:customers(full_name,phone),district:districts(name))').order('created_at', { ascending: false }).limit(300)
  ), [])
  const rows = (data || []).filter((d) => {
    const s = d.order.status
    if (tab === 'todo') return ['confirmed', 'paid', 'processing', 'ready_for_dispatch', 'payment_pending'].includes(s)
    if (tab === 'moving') return s === 'out_for_delivery'
    if (tab === 'done') return ['delivered', 'completed'].includes(s)
    return ['failed_delivery', 'customer_unreachable'].includes(s)
  })
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Deliveries</h1><p>Lusaka District by us. Other areas by courier or bus, confirmed by phone first.</p></div></div>
      <Tabs tabs={BOARD} value={tab} onChange={setTab} />
      {loading ? <Loading /> : (
        <Table rows={rows} onRow={setEdit} empty="Nothing in this column" cols={[
          { key: 'order', label: 'Order', render: (d) => <span className="strong">#{d.order.order_number}</span> },
          { key: 'customer', label: 'Customer', render: (d) => <div>{d.order.customer?.full_name}<div className="tiny muted">{d.order.customer?.phone}</div></div> },
          { key: 'where', label: 'Where', render: (d) => <div>{[d.order.area, d.order.district?.name].filter(Boolean).join(', ')}{!d.order.is_local && <div><span className="badge warn">Outside zone</span></div>}</div> },
          { key: 'needed', label: 'Needed', render: (d) => d.order.needed_by ? <span className="strong copper">{new Date(d.order.needed_by + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span> : '—' },
          { key: 'status', label: 'Order status', render: (d) => <Badge status={d.order.status} /> },
          { key: 'fee', label: 'Fee', num: true, render: (d) => <span className={d.order.delivery_fee_status !== 'confirmed' ? 'warn' : ''}>{money(d.order.delivery_fee)}{d.order.delivery_fee_status !== 'confirmed' ? ' ?' : ''}</span> },
          { key: 'who', label: 'By', render: (d) => d.courier || d.assignee?.full_name || '—' },
          { key: 'scheduled_date', label: 'Scheduled', render: (d) => date(d.scheduled_date) },
        ]} />
      )}
      {edit && <DeliveryModal d={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} onOpenOrder={() => nav(`/admin/orders/${edit.order.id}`)} />}
    </div>
  )
}

function DeliveryModal({ d, onClose, onDone, onOpenOrder }) {
  const toast = useToast()
  const { settings } = useAuth()
  const [f, setF] = useState({ courier: d.courier || '', delivery_cost: d.delivery_cost, fuel_cost: d.fuel_cost, scheduled_date: d.scheduled_date || '', failure_reason: d.failure_reason || '' })
  const set = (k) => (v) => setF((c) => ({ ...c, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('deliveries').update({ courier: f.courier || null, delivery_cost: n(f.delivery_cost), fuel_cost: n(f.fuel_cost), scheduled_date: f.scheduled_date || null, failure_reason: f.failure_reason || null }).eq('id', d.id)
    if (error) return toast(error.message, true)
    toast('Delivery updated'); onDone()
  }
  return (
    <Modal title={`Delivery for #${d.order.order_number}`} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="small">{d.order.customer?.full_name} · <a href={`tel:${d.order.customer?.phone}`}>{d.order.customer?.phone}</a><br />{[d.order.address, d.order.area, d.order.district?.name].filter(Boolean).join(', ')}</div>
        <div className="form-grid">
          <Field label="Courier / who delivers"><Input value={f.courier} onChange={set('courier')} placeholder="Founder, bus, courier name" /></Field>
          <Field label="Scheduled date"><Input type="date" value={f.scheduled_date} onChange={set('scheduled_date')} /></Field>
          <Field label="Delivery cost to us" hint="What the rider or courier was paid"><Input money value={f.delivery_cost} onChange={set('delivery_cost')} /></Field>
          <Field label="Fuel"><Input money value={f.fuel_cost} onChange={set('fuel_cost')} /></Field>
          <div className="span small muted">
            {n(f.delivery_cost) + n(f.fuel_cost) > 0
              ? <>This order's profit uses <strong>{money(n(f.delivery_cost) + n(f.fuel_cost))}</strong> for delivery.</>
              : <>Nothing recorded yet, so profit assumes <strong>{money(settings.assumed_delivery_cost ?? 25)}</strong> per delivery. Free delivery for the customer is never free for us — put the real figure here.</>}
          </div>
          <Field label="Failure reason (if failed)" span><Input value={f.failure_reason} onChange={set('failure_reason')} /></Field>
        </div>
        <p className="tiny muted">Change the order's status (out for delivery, delivered, failed) from the order page.</p>
        <div className="btn-row"><button className="btn primary">Save</button><button type="button" className="btn" onClick={onOpenOrder}>Open order</button><a className="btn" href={`/admin/orders/${d.order.id}/receipt`}>Delivery note</a></div>
      </form>
    </Modal>
  )
}
