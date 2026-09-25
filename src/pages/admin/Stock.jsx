import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, date, datetime, n, title } from '../../lib/format'
import { landedCost } from '../../lib/economics'
import { effectiveCost } from './Products'
import { Badge, Table, Loading, Modal, Field, Input, Select, Textarea, Breakdown, useToast, Tabs, Stat } from '../../components/ui'

// ---------------- Inventory ----------------
export function Inventory() {
  const { advanced } = useAuth()
  const [tab, setTab] = useState('stock')
  const [adj, setAdj] = useState(null)
  const { data, loading, reload } = useData(async () => {
    const [products, requests, moves] = await Promise.all([
      q(supabase.from('products').select('*').eq('owner_type', 'founder').order('name')),
      q(supabase.from('stock_requests').select('*,product:products(name)').eq('fulfilled', false).order('created_at', { ascending: false })),
      q(supabase.from('inventory_movements').select('*,product:products(name)').order('created_at', { ascending: false }).limit(100)),
    ])
    return { products, requests, moves }
  }, [])
  if (loading || !data) return <Loading />
  const value = data.products.reduce((s, p) => s + p.stock_available * effectiveCost(p), 0)
  const fulfil = async (id) => { await supabase.from('stock_requests').update({ fulfilled: true }).eq('id', id); reload() }

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Inventory</h1><p>Founder-owned stock. Vendors hold their own.</p></div></div>
      <div className="grid-3">
        <Stat label="Stock value (at cost)" value={money(value)} />
        <Stat label="Units available" value={data.products.reduce((s, p) => s + p.stock_available, 0)} />
        <Stat label="Waiting demand" value={data.requests.length} sub="customers asking for out-of-stock items" tone={data.requests.length ? 'copper' : ''} />
      </div>
      <Tabs tabs={[['stock', 'Stock levels'], ['requests', 'Waiting demand'], ...(advanced ? [['moves', 'Movements']] : [])]} value={tab} onChange={setTab} />
      {tab === 'stock' && (
        <Table
          rows={data.products}
          onRow={(p) => setAdj(p)}
          cols={[
            { key: 'name', label: 'Product', render: (p) => <span className="strong">{p.name}</span> },
            { key: 'stock_available', label: 'Available', num: true, render: (p) => <span className={p.stock_available <= 3 ? 'warn strong' : ''}>{p.stock_available}</span> },
            { key: 'stock_reserved', label: 'Reserved', num: true },
            { key: 'stock_sold', label: 'Sold', num: true },
            { key: 'stock_damaged', label: 'Damaged', num: true },
            { key: 'value', label: 'Value', num: true, render: (p) => money(p.stock_available * effectiveCost(p)) },
          ]}
        />
      )}
      {tab === 'requests' && (
        <Table
          rows={data.requests}
          empty="No one is waiting on out-of-stock items"
          cols={[
            { key: 'product', label: 'Product', render: (r) => r.product?.name },
            { key: 'customer_name', label: 'Customer', render: (r) => <div>{r.customer_name}<div className="tiny muted">{r.phone} · {r.location}</div></div> },
            { key: 'quantity', label: 'Qty', num: true },
            { key: 'created_at', label: 'Asked', render: (r) => date(r.created_at) },
            { key: 'x', label: '', render: (r) => <button className="btn sm" onClick={() => fulfil(r.id)}>Done</button> },
          ]}
        />
      )}
      {tab === 'moves' && (
        <Table rows={data.moves} cols={[
          { key: 'created_at', label: 'When', render: (m) => datetime(m.created_at) },
          { key: 'product', label: 'Product', render: (m) => m.product?.name },
          { key: 'type', label: 'Type', render: (m) => <Badge>{title(m.type)}</Badge> },
          { key: 'quantity', label: 'Qty', num: true },
          { key: 'reason', label: 'Reason' },
        ]} />
      )}
      {adj && <AdjustModal product={adj} onClose={() => setAdj(null)} onDone={() => { setAdj(null); reload() }} />}
    </div>
  )
}

function AdjustModal({ product, onClose, onDone }) {
  const toast = useToast()
  const [f, setF] = useState({ type: 'adjustment', qty: 0, reason: '' })
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.rpc('adjust_inventory', { p_product: product.id, p_type: f.type, p_qty: Number(f.qty), p_reason: f.reason })
    if (error) return toast(error.message, true)
    toast('Stock adjusted'); onDone()
  }
  return (
    <Modal title={`Adjust stock: ${product.name}`} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <p className="small muted">Available now: <span className="strong">{product.stock_available}</span>. Every adjustment is logged with your name and reason.</p>
        <Field label="Type"><Select value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[['adjustment', 'Count correction (+/−)'], ['damage', 'Damaged'], ['loss', 'Lost / stolen'], ['return', 'Returned stock received']]} /></Field>
        <Field label="Quantity" hint={f.type === 'adjustment' ? 'Use a negative number to reduce' : 'Units'}><Input type="number" value={f.qty} onChange={(v) => setF({ ...f, qty: v })} required /></Field>
        <Field label="Reason"><Input value={f.reason} onChange={(v) => setF({ ...f, reason: v })} required /></Field>
        <button className="btn primary block">Apply</button>
      </form>
    </Modal>
  )
}

// ---------------- Purchases ----------------
export function Purchases() {
  const [edit, setEdit] = useState(null)
  const { data, loading, reload } = useData(() => q(supabase.from('purchases').select('*,supplier:suppliers(name),items:purchase_items(*,product:products(name))').order('created_at', { ascending: false })), [])
  const total = (p) => p.items.reduce((s, i) => s + i.quantity * n(i.unit_price), 0) + n(p.supplier_shipping) + n(p.inbound_transport) + n(p.storage_cost) + n(p.other_costs)
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Purchases</h1><p>Stock we buy from suppliers. Receiving a purchase adds stock and sets the landed cost.</p></div>
        <button className="btn primary" onClick={() => setEdit({ status: 'draft', items: [] })}>New purchase</button>
      </div>
      {loading ? <Loading /> : (
        <Table rows={data} onRow={setEdit} empty="No purchases yet" cols={[
          { key: 'order_date', label: 'Date', render: (p) => date(p.order_date) },
          { key: 'supplier', label: 'Supplier', render: (p) => <span className="strong">{p.supplier?.name || '—'}</span> },
          { key: 'items', label: 'Items', render: (p) => p.items.map((i) => `${i.quantity} × ${i.product?.name}`).join(', ') },
          { key: 'status', label: 'Status', render: (p) => <Badge status={p.status} /> },
          { key: 'total', label: 'Landed total', num: true, render: (p) => money(total(p)) },
          { key: 'owed', label: 'Still owed', num: true, render: (p) => { const o = total(p) - n(p.supplier_shipping) - n(p.inbound_transport) - n(p.other_costs) - n(p.amount_paid); return <span className={o > 0 ? 'warn' : ''}>{money(Math.max(0, o))}</span> } },
        ]} />
      )}
      {edit && <PurchaseEditor purchase={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function PurchaseEditor({ purchase, onClose, onDone }) {
  const toast = useToast()
  const { user } = useAuth()
  const { data: refs } = useData(async () => ({
    suppliers: await q(supabase.from('suppliers').select('id,name').order('name')),
    products: await q(supabase.from('products').select('id,name').eq('owner_type', 'founder').order('name')),
  }), [])
  const [p, setP] = useState({ ...purchase })
  const [items, setItems] = useState(purchase.items?.length ? purchase.items.map((i) => ({ ...i })) : [{ product_id: '', quantity: 1, unit_price: 0, quantity_received: 0, quantity_damaged: 0 }])
  const set = (k) => (v) => setP((c) => ({ ...c, [k]: v }))
  const received = p.status === 'received'
  const goods = items.reduce((s, i) => s + n(i.quantity) * n(i.unit_price), 0)
  const extras = n(p.supplier_shipping) + n(p.inbound_transport) + n(p.storage_cost) + n(p.other_costs)
  const perItem = items.map((i) => landedCost({ quantity: i.quantity, unitPrice: i.unit_price, damaged: i.quantity_damaged, shipping: goods ? (extras * n(i.quantity) * n(i.unit_price)) / goods : 0 }))

  const save = async () => {
    const row = { supplier_id: p.supplier_id || null, order_date: p.order_date || new Date().toISOString().slice(0, 10), status: p.status, supplier_shipping: n(p.supplier_shipping), inbound_transport: n(p.inbound_transport), storage_cost: n(p.storage_cost), other_costs: n(p.other_costs), amount_paid: n(p.amount_paid), notes: p.notes || null }
    let id = p.id
    if (id) { const { error } = await supabase.from('purchases').update(row).eq('id', id); if (error) throw new Error(error.message) }
    else { const d = await q(supabase.from('purchases').insert({ ...row, created_by: user.id }).select().single()); id = d.id }
    await supabase.from('purchase_items').delete().eq('purchase_id', id)
    const clean = items.filter((i) => i.product_id).map((i) => ({ purchase_id: id, product_id: i.product_id, quantity: Number(i.quantity), unit_price: n(i.unit_price), quantity_received: Number(i.quantity_received) || 0, quantity_damaged: Number(i.quantity_damaged) || 0 }))
    if (clean.length) { const { error } = await supabase.from('purchase_items').insert(clean); if (error) throw new Error(error.message) }
    return id
  }
  const submit = async (e) => { e.preventDefault(); try { await save(); toast('Saved'); onDone() } catch (err) { toast(err.message, true) } }
  const receive = async () => {
    if (!window.confirm('Receive this purchase? Stock will be added and the landed cost locked in.')) return
    try {
      const id = await save()
      const { error } = await supabase.rpc('receive_purchase', { p_purchase: id })
      if (error) throw new Error(error.message)
      toast('Stock received'); onDone()
    } catch (err) { toast(err.message, true) }
  }

  return (
    <Modal title={p.id ? 'Purchase' : 'New purchase'} onClose={onClose} wide>
      <form onSubmit={submit} className="stack">
        <div className="form-grid">
          <Field label="Supplier"><Select value={p.supplier_id} onChange={set('supplier_id')} options={(refs?.suppliers || []).map((s) => [s.id, s.name])} placeholder="Choose supplier" disabled={received} /></Field>
          <Field label="Order date"><Input type="date" value={p.order_date || new Date().toISOString().slice(0, 10)} onChange={set('order_date')} disabled={received} /></Field>
          <Field label="Status"><Select value={p.status} onChange={set('status')} options={['draft', 'ordered', 'paid', 'in_transit', 'cancelled']} disabled={received} /></Field>
          <Field label="Amount paid to supplier so far"><Input money value={p.amount_paid} onChange={set('amount_paid')} /></Field>
          <Field label="Supplier shipping"><Input money value={p.supplier_shipping} onChange={set('supplier_shipping')} disabled={received} /></Field>
          <Field label="Transport to us"><Input money value={p.inbound_transport} onChange={set('inbound_transport')} disabled={received} /></Field>
          <Field label="Storage / rent"><Input money value={p.storage_cost} onChange={set('storage_cost')} disabled={received} /></Field>
          <Field label="Other inbound costs (duty, clearing…)"><Input money value={p.other_costs} onChange={set('other_costs')} disabled={received} /></Field>
          <Field label="Notes"><Input value={p.notes} onChange={set('notes')} /></Field>
        </div>

        <div className="stack-sm">
          <h3>Items</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th className="num">Ordered</th><th className="num">Unit price</th><th className="num">Received</th><th className="num">Damaged</th><th className="num">Landed / unit</th><th /></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td style={{ minWidth: 160 }}><select className="input" value={it.product_id} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, product_id: e.target.value } : x)))} disabled={received} required><option value="">Choose</option>{(refs?.products || []).map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}</select></td>
                    <td><Input type="number" min="1" value={it.quantity} onChange={(v) => setItems(items.map((x, k) => (k === i ? { ...x, quantity: v } : x)))} style={{ width: 70 }} disabled={received} /></td>
                    <td><Input money value={it.unit_price} onChange={(v) => setItems(items.map((x, k) => (k === i ? { ...x, unit_price: v } : x)))} style={{ width: 90 }} disabled={received} /></td>
                    <td><Input type="number" min="0" value={it.quantity_received} onChange={(v) => setItems(items.map((x, k) => (k === i ? { ...x, quantity_received: v } : x)))} style={{ width: 70 }} disabled={received} /></td>
                    <td><Input type="number" min="0" value={it.quantity_damaged} onChange={(v) => setItems(items.map((x, k) => (k === i ? { ...x, quantity_damaged: v } : x)))} style={{ width: 70 }} disabled={received} /></td>
                    <td className="num strong">{money(perItem[i].perUnit)}</td>
                    <td>{!received && items.length > 1 && <button type="button" className="btn sm ghost" onClick={() => setItems(items.filter((_, k) => k !== i))}>✕</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!received && <button type="button" className="btn sm" onClick={() => setItems([...items, { product_id: '', quantity: 1, unit_price: 0, quantity_received: 0, quantity_damaged: 0 }])}>Add item</button>}
        </div>

        <div className="card flat">
          <Breakdown items={[['Goods', goods], ['Shipping, transport, storage & other', extras]]} total={['Total landed cost', goods + extras]} />
          <p className="tiny muted mt">Extra costs are spread across items in proportion to their value, then divided by sellable (received minus damaged) units.</p>
        </div>

        <div className="btn-row">
          {!received && <button className="btn">Save</button>}
          {!received && p.status !== 'cancelled' && <button type="button" className="btn primary" onClick={receive}>Receive stock</button>}
          {received && <span className="badge ok">Received {date(p.received_at)}</span>}
        </div>
      </form>
    </Modal>
  )
}

// ---------------- Suppliers ----------------
export function Suppliers() {
  const [edit, setEdit] = useState(null)
  const { data, loading, reload } = useData(async () => {
    const suppliers = await q(supabase.from('suppliers').select('*').order('name'))
    const purchases = await q(supabase.from('purchases').select('supplier_id,amount_paid,status,items:purchase_items(quantity,unit_price)'))
    return suppliers.map((s) => {
      const mine = purchases.filter((p) => p.supplier_id === s.id && p.status !== 'cancelled')
      const bought = mine.reduce((t, p) => t + p.items.reduce((x, i) => x + i.quantity * n(i.unit_price), 0), 0)
      const paid = mine.reduce((t, p) => t + n(p.amount_paid), 0)
      return { ...s, purchases: mine.length, bought, owed: Math.max(0, bought - paid) }
    })
  }, [])
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Suppliers</h1><p>Who we buy from. Not the same as vendors, who sell through us.</p></div>
        <button className="btn primary" onClick={() => setEdit({})}>Add supplier</button>
      </div>
      {loading ? <Loading /> : (
        <Table rows={data} onRow={setEdit} empty="No suppliers yet" cols={[
          { key: 'name', label: 'Supplier', render: (s) => <div><div className="strong">{s.name}</div><div className="tiny muted">{s.location}</div></div> },
          { key: 'contact', label: 'Contact', render: (s) => <div>{s.contact_name}<div className="tiny muted">{s.phone}</div></div> },
          { key: 'lead_time_days', label: 'Lead time', render: (s) => s.lead_time_days ? `${s.lead_time_days} days` : '—' },
          { key: 'quality', label: 'Quality / reliability', render: (s) => `${s.quality || '–'} / ${s.reliability || '–'}` },
          { key: 'bought', label: 'Bought', num: true, render: (s) => money(s.bought) },
          { key: 'owed', label: 'We owe', num: true, render: (s) => <span className={s.owed > 0 ? 'warn' : ''}>{money(s.owed)}</span> },
        ]} />
      )}
      {edit && <SupplierEditor supplier={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function SupplierEditor({ supplier, onClose, onDone }) {
  const toast = useToast()
  const [s, setS] = useState({ ...supplier })
  const set = (k) => (v) => setS((c) => ({ ...c, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    const row = { name: s.name, contact_name: s.contact_name || null, phone: s.phone || null, email: s.email || null, location: s.location || null, moq: s.moq ? Number(s.moq) : null, lead_time_days: s.lead_time_days ? Number(s.lead_time_days) : null, reliability: s.reliability ? Number(s.reliability) : null, quality: s.quality ? Number(s.quality) : null, notes: s.notes || null }
    const res = s.id ? await supabase.from('suppliers').update(row).eq('id', s.id) : await supabase.from('suppliers').insert(row)
    if (res.error) return toast(res.error.message, true)
    toast('Saved'); onDone()
  }
  const five = [1, 2, 3, 4, 5].map((x) => [x, String(x)])
  return (
    <Modal title={s.id ? s.name : 'New supplier'} onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <Field label="Name" span><Input value={s.name} onChange={set('name')} required /></Field>
        <Field label="Contact person"><Input value={s.contact_name} onChange={set('contact_name')} /></Field>
        <Field label="Phone"><Input value={s.phone} onChange={set('phone')} type="tel" /></Field>
        <Field label="Email"><Input value={s.email} onChange={set('email')} type="email" /></Field>
        <Field label="Location"><Input value={s.location} onChange={set('location')} /></Field>
        <Field label="Minimum order"><Input type="number" value={s.moq} onChange={set('moq')} /></Field>
        <Field label="Lead time (days)"><Input type="number" value={s.lead_time_days} onChange={set('lead_time_days')} /></Field>
        <Field label="Quality (1–5)"><Select value={s.quality} onChange={set('quality')} options={five} placeholder="—" /></Field>
        <Field label="Reliability (1–5)"><Select value={s.reliability} onChange={set('reliability')} options={five} placeholder="—" /></Field>
        <Field label="Notes" span><Textarea value={s.notes} onChange={set('notes')} rows={2} /></Field>
        <div className="span"><button className="btn primary block">Save</button></div>
      </form>
    </Modal>
  )
}
