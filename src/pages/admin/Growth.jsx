import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { money, date, n, title } from '../../lib/format'
import { SOURCES } from '../../lib/statuses'
import { Badge, Table, Loading, Modal, Field, Input, Select, Textarea, useToast, Stat, Stars, Tabs } from '../../components/ui'

export function Marketing() {
  const toast = useToast()
  const [add, setAdd] = useState(false)
  const { data, loading, reload } = useData(async () => {
    const [spend, orders] = await Promise.all([
      q(supabase.from('marketing_spend').select('*').order('spent_on', { ascending: false })),
      q(supabase.from('orders').select('source,channel,subtotal,status,created_at').not('status', 'in', '(cancelled,fraud_review)')),
    ])
    const bySource = {}
    for (const o of orders) {
      const k = o.source.startsWith('reseller:') ? 'reseller' : o.source
      bySource[k] = bySource[k] || { source: k, orders: 0, revenue: 0, spend: 0 }
      bySource[k].orders += 1; bySource[k].revenue += n(o.subtotal)
    }
    for (const s of spend) { bySource[s.source] = bySource[s.source] || { source: s.source, orders: 0, revenue: 0, spend: 0 }; bySource[s.source].spend += n(s.amount) }
    return { spend, sources: Object.values(bySource).sort((a, b) => b.revenue - a.revenue), total: spend.reduce((t, s) => t + n(s.amount), 0), orders: orders.length }
  }, [])
  if (loading || !data) return <Loading />
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Marketing</h1><p>What each channel costs and what it brings back.</p></div>
        <button className="btn primary" onClick={() => setAdd(true)}>Log spend</button>
      </div>
      <div className="grid-3">
        <Stat label="Total ad spend" value={money(data.total)} />
        <Stat label="Cost per order (all orders)" value={data.orders ? money(data.total / data.orders) : '—'} />
        <Stat label="Orders" value={data.orders} />
      </div>
      <div className="card">
        <h3 className="mb">By source</h3>
        <Table rows={data.sources.map((s) => ({ ...s, id: s.source }))} empty="No orders yet" cols={[
          { key: 'source', label: 'Source', render: (s) => title(s.source) },
          { key: 'orders', label: 'Orders', num: true },
          { key: 'revenue', label: 'Revenue', num: true, render: (s) => money(s.revenue) },
          { key: 'spend', label: 'Spend', num: true, render: (s) => money(s.spend) },
          { key: 'cpo', label: 'Cost / order', num: true, render: (s) => s.orders && s.spend ? money(s.spend / s.orders) : '—' },
          { key: 'roas', label: 'Return on spend', num: true, render: (s) => s.spend ? `${(s.revenue / s.spend).toFixed(1)}×` : '—' },
        ]} />
      </div>
      <div className="card">
        <h3 className="mb">Spend log</h3>
        <Table rows={data.spend} empty="No spend logged" cols={[
          { key: 'spent_on', label: 'Date', render: (s) => date(s.spent_on) },
          { key: 'source', label: 'Source', render: (s) => title(s.source) },
          { key: 'amount', label: 'Amount', num: true, render: (s) => money(s.amount) },
          { key: 'clicks', label: 'Clicks', num: true },
          { key: 'notes', label: 'Notes' },
        ]} />
      </div>
      {add && <SpendModal onClose={() => setAdd(false)} onDone={() => { setAdd(false); reload() }} />}
    </div>
  )
}

function SpendModal({ onClose, onDone }) {
  const toast = useToast()
  const [f, setF] = useState({ source: 'facebook_ad', spent_on: new Date().toISOString().slice(0, 10), amount: '', clicks: '', notes: '' })
  const set = (k) => (v) => setF((c) => ({ ...c, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('marketing_spend').insert({ source: f.source, spent_on: f.spent_on, amount: n(f.amount), clicks: Number(f.clicks) || 0, notes: f.notes || null })
    if (error) return toast(error.message, true)
    toast('Spend logged'); onDone()
  }
  return (
    <Modal title="Log marketing spend" onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <Field label="Source"><Select value={f.source} onChange={set('source')} options={SOURCES} /></Field>
        <Field label="Date"><Input type="date" value={f.spent_on} onChange={set('spent_on')} /></Field>
        <Field label="Amount"><Input money value={f.amount} onChange={set('amount')} required /></Field>
        <Field label="Clicks (optional)"><Input type="number" value={f.clicks} onChange={set('clicks')} /></Field>
        <Field label="Notes" span><Textarea value={f.notes} onChange={set('notes')} rows={2} /></Field>
        <div className="span"><button className="btn primary block">Save</button></div>
      </form>
    </Modal>
  )
}

export function Reviews() {
  const toast = useToast()
  const [tab, setTab] = useState('new')
  const { data, loading, reload } = useData(() => q(supabase.from('reviews').select('*,product:products(name),vendor:vendors(business_name),order:orders(order_number)').order('created_at', { ascending: false })), [])
  const rows = (data || []).filter((r) => (tab === 'new' ? !r.approved : r.approved))
  const setApproved = async (id, approved) => {
    const { error } = await supabase.from('reviews').update({ approved }).eq('id', id)
    if (error) return toast(error.message, true)
    toast(approved ? 'Published' : 'Hidden'); reload()
  }
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Reviews</h1><p>Customers rate the product, the seller, delivery and the marketplace. You choose what goes public.</p></div></div>
      <Tabs tabs={[['new', 'To approve'], ['live', 'Published']]} value={tab} onChange={setTab} />
      {loading ? <Loading /> : (
        <Table rows={rows} empty={tab === 'new' ? 'No reviews waiting' : 'No published reviews'} cols={[
          { key: 'product', label: 'Product', render: (r) => <div><div className="strong">{r.product?.name}</div><div className="tiny muted">#{r.order?.order_number} · {r.customer_name}{r.verified && ' · verified'}</div></div> },
          { key: 'ratings', label: 'Ratings', render: (r) => <div className="tiny">Product <Stars n={r.product_rating} /><br />Seller <Stars n={r.vendor_rating} /><br />Delivery <Stars n={r.delivery_rating} /><br />Marketplace <Stars n={r.marketplace_rating} /></div> },
          { key: 'comment', label: 'Comment' },
          { key: 'created_at', label: 'When', render: (r) => date(r.created_at) },
          { key: 'x', label: '', render: (r) => r.approved ? <button className="btn sm" onClick={() => setApproved(r.id, false)}>Hide</button> : <button className="btn sm primary" onClick={() => setApproved(r.id, true)}>Publish</button> },
        ]} />
      )}
    </div>
  )
}
