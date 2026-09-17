import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, pct, date, datetime, n, title } from '../../lib/format'
import { Badge, Table, Loading, Field, Input, Select, useToast, Stat, Tabs } from '../../components/ui'

// ---------------- Reports ----------------
export function Reports() {
  const [tab, setTab] = useState('products')
  const { data, loading } = useData(async () => {
    const [items, orders] = await Promise.all([
      q(supabase.from('order_items').select('quantity,line_total,unit_cost_snapshot,product:products(name,owner_type),orders!inner(status,channel,source,seller_type,created_at,delivery_fee)').eq('orders.status', 'completed')),
      q(supabase.from('orders').select('status,channel,source,seller_type,total,created_at,is_local')),
    ])
    const prod = {}
    for (const it of items) {
      const k = it.product?.name || '?'
      prod[k] = prod[k] || { id: k, name: k, owner: it.product?.owner_type, units: 0, revenue: 0, cost: 0 }
      prod[k].units += it.quantity; prod[k].revenue += n(it.line_total); prod[k].cost += it.product?.owner_type === 'founder' ? n(it.unit_cost_snapshot) * it.quantity : 0
    }
    const chan = {}
    for (const o of orders.filter((o) => !['cancelled', 'fraud_review'].includes(o.status))) {
      const k = o.channel; chan[k] = chan[k] || { id: k, name: title(k), orders: 0, revenue: 0 }; chan[k].orders += 1; chan[k].revenue += n(o.total)
    }
    const st = {}
    for (const o of orders) { st[o.status] = (st[o.status] || 0) + 1 }
    const total = orders.length || 1
    return {
      products: Object.values(prod).map((p) => ({ ...p, profit: p.revenue - p.cost, margin: p.revenue ? ((p.revenue - p.cost) / p.revenue) * 100 : 0 })).sort((a, b) => b.profit - a.profit),
      channels: Object.values(chan).sort((a, b) => b.revenue - a.revenue),
      health: Object.entries(st).map(([k, v]) => ({ id: k, status: k, count: v, share: (v / total) * 100 })).sort((a, b) => b.count - a.count),
      local: orders.filter((o) => o.is_local).length, outside: orders.filter((o) => !o.is_local).length,
      sellers: ['founder', 'reseller', 'vendor'].map((s) => ({ id: s, name: title(s), orders: orders.filter((o) => o.seller_type === s && !['cancelled', 'fraud_review'].includes(o.status)).length })),
    }
  }, [])
  if (loading || !data) return <Loading />
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Reports</h1><p>Completed orders only, unless stated. What sells, where it sells, and what goes wrong.</p></div></div>
      <Tabs tabs={[['products', 'Products'], ['channels', 'Channels & sellers'], ['health', 'Order health']]} value={tab} onChange={setTab} />
      {tab === 'products' && (
        <Table rows={data.products} empty="No completed orders yet" cols={[
          { key: 'name', label: 'Product', render: (p) => <div><div className="strong">{p.name}</div><div className="tiny muted">{p.owner === 'vendor' ? 'Vendor product' : 'Our product'}</div></div> },
          { key: 'units', label: 'Units', num: true },
          { key: 'revenue', label: 'Revenue', num: true, render: (p) => money(p.revenue) },
          { key: 'profit', label: 'Gross profit', num: true, render: (p) => p.owner === 'vendor' ? '—' : money(p.profit) },
          { key: 'margin', label: 'Margin', num: true, render: (p) => p.owner === 'vendor' ? '—' : pct(p.margin) },
        ]} />
      )}
      {tab === 'channels' && (
        <div className="grid-2 tight">
          <div className="card"><h3 className="mb">By channel</h3><Table rows={data.channels} cols={[{ key: 'name', label: 'Channel' }, { key: 'orders', label: 'Orders', num: true }, { key: 'revenue', label: 'Revenue', num: true, render: (c) => money(c.revenue) }]} /></div>
          <div className="card stack">
            <div><h3 className="mb">By seller</h3><Table rows={data.sellers} cols={[{ key: 'name', label: 'Seller' }, { key: 'orders', label: 'Orders', num: true }]} /></div>
            <div className="grid-2"><Stat label="Lusaka District" value={data.local} sub="orders" /><Stat label="Outside zone" value={data.outside} sub="orders" /></div>
          </div>
        </div>
      )}
      {tab === 'health' && (
        <Table rows={data.health} cols={[{ key: 'status', label: 'Status', render: (h) => <Badge status={h.status} /> }, { key: 'count', label: 'Orders', num: true }, { key: 'share', label: 'Share', num: true, render: (h) => pct(h.share) }]} />
      )}
    </div>
  )
}

// ---------------- Team ----------------
const ROLES = ['founder', 'ops', 'finance', 'delivery', 'marketing', 'vendor', 'reseller', 'customer']
export function Team() {
  const toast = useToast()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const { data, loading, reload } = useData(() => q(supabase.from('profiles').select('*').order('created_at', { ascending: false })), [])
  const rows = (data || []).filter((p) => !search || (p.full_name || '').toLowerCase().includes(search.toLowerCase()) || (p.email || '').includes(search))
  const setRole = async (p, role) => {
    if (p.id === user.id && role !== 'founder' && !window.confirm('Remove your own founder role?')) return
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id)
    if (error) return toast(error.message, true)
    toast(`${p.full_name || p.email} is now ${role}`); reload()
  }
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Team</h1><p>Who can do what. Founder: everything. Ops: orders, products, stock. Finance: money. Delivery: deliveries. Marketing: campaigns, offers, resellers and vendors. Vendor and reseller roles are granted by approving applications.</p></div><Input value={search} onChange={setSearch} placeholder="Search" style={{ maxWidth: 220 }} /></div>
      {loading ? <Loading /> : (
        <Table rows={rows} cols={[
          { key: 'full_name', label: 'Person', render: (p) => <div><div className="strong">{p.full_name || '—'}</div><div className="tiny muted">{p.email}{p.phone ? ` · ${p.phone}` : ''}</div></div> },
          { key: 'created_at', label: 'Joined', render: (p) => date(p.created_at) },
          { key: 'role', label: 'Role', render: (p) => <select className="status-select" value={p.role} onChange={(e) => setRole(p, e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{title(r)}</option>)}</select> },
        ]} />
      )}
    </div>
  )
}

// ---------------- Settings ----------------
const FIELDS = [
  { key: 'referral_reward', label: 'Reward for a customer when a friend they invited completes a first order (K)', type: 'number' },
  { key: 'business_name', label: 'Business name (on receipts)', type: 'text' },
  { key: 'business_phone', label: 'Business phone (on receipts)', type: 'text' },
  { key: 'receipt_footer', label: 'Receipt footer message', type: 'text' },
  { key: 'marketplace_fee_pct', label: 'Marketplace fee charged to vendors (%)', type: 'number' },
  { key: 'own_audience_fee_pct', label: 'Lower fee when a vendor brings the customer through their own link (%)', type: 'number' },
  { key: 'default_commission_pct', label: 'Default reseller commission (%)', type: 'number' },
  { key: 'commission_source', label: 'Where the reseller commission comes from', type: 'select', options: [['from_fee', 'Out of the marketplace fee (vendor still pays the full fee)'], ['on_top', 'On top of the fee (vendor pays fee + commission)']] },
  { key: 'local_delivery_fee', label: 'Delivery fee inside Lusaka District (K)', type: 'number' },
  { key: 'target_markup_pct', label: 'Profit target on top of cost (%) — suggests your selling prices. 50% on K1,100 = K1,650', type: 'number' },
  { key: 'target_margin_pct', label: 'Healthy margin for the green/yellow/red lights (% of selling price)', type: 'number' },
  { key: 'price_floor_margin_pct', label: 'Price floor — offers below this margin need a founder override (%)', type: 'number' },
  { key: 'min_profit_per_unit', label: 'Minimum acceptable profit per unit (K)', type: 'number' },
  { key: 'commission_grace_hours', label: 'Hours after completion before commissions can be verified', type: 'number' },
  { key: 'payment_fee_pct', label: 'Payment processing fee (%)', type: 'number' },
  { key: 'default_packaging_cost', label: 'Default packaging cost per unit (K)', type: 'number' },
]

export function Settings() {
  const toast = useToast()
  const { settings, refresh } = useAuth()
  const [f, setF] = useState({ ...settings })
  const [alloc, setAlloc] = useState(JSON.stringify(settings.capital_allocation || {}, null, 0))
  const save = async () => {
    for (const fld of FIELDS) {
      const val = fld.type === 'number' ? n(f[fld.key]) : f[fld.key]
      const { error } = await supabase.from('settings').upsert({ key: fld.key, value: val ?? '' })
      if (error) return toast(`${fld.label}: ${error.message}`, true)
    }
    try {
      const { error } = await supabase.from('settings').update({ value: JSON.parse(alloc || '{}') }).eq('key', 'capital_allocation')
      if (error) throw new Error(error.message)
    } catch (e) { return toast(`Capital plan: ${e.message}`, true) }
    await refresh()
    toast('Settings saved')
  }
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="page-head"><div><h1>Settings</h1><p>Every rate and rule in one place. Changes are logged.</p></div></div>
      <div className="card stack">
        {FIELDS.map((fld) => (
          <Field key={fld.key} label={fld.label}>
            {fld.type === 'select' ? <Select value={f[fld.key]} onChange={(v) => setF({ ...f, [fld.key]: v })} options={fld.options} /> : <Input type={fld.type === 'text' ? 'text' : 'number'} value={f[fld.key]} onChange={(v) => setF({ ...f, [fld.key]: v })} />}
          </Field>
        ))}
        <Field label="Starting capital plan (JSON)" hint='e.g. {"inventory":200,"packaging":50,"delivery":50,"advertising":100,"reserve":100}'><Input value={alloc} onChange={setAlloc} /></Field>
        <button className="btn primary" onClick={save}>Save settings</button>
      </div>
      <div className="card small muted">
        <p className="strong" style={{ color: 'var(--ink)' }}>How the vendor split works</p>
        <p className="mt">On a K500 vendor sale with a 10% fee and a 5% reseller commission: the vendor receives K450. With "out of the fee", the reseller gets K25 and the marketplace keeps K25. With "on top", the vendor receives K425, the reseller K25, and the marketplace keeps K50.</p>
      </div>
    </div>
  )
}

// ---------------- Audit ----------------
export function Audit() {
  const [search, setSearch] = useState('')
  const { data, loading } = useData(() => q(supabase.from('audit_logs').select('*,user:profiles(full_name,email)').order('created_at', { ascending: false }).limit(500)), [])
  const rows = (data || []).filter((l) => !search || l.action.includes(search) || l.entity.includes(search) || (l.reason || '').toLowerCase().includes(search.toLowerCase()))
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Audit log</h1><p>Prices, fees, statuses, stock and money changes — who, what, when, why.</p></div><Input value={search} onChange={setSearch} placeholder="Filter" style={{ maxWidth: 220 }} /></div>
      {loading ? <Loading /> : (
        <Table rows={rows} empty="Nothing logged yet" cols={[
          { key: 'created_at', label: 'When', render: (l) => <span className="tiny">{datetime(l.created_at)}</span> },
          { key: 'user', label: 'Who', render: (l) => l.user?.full_name || l.user?.email || 'Customer / system' },
          { key: 'action', label: 'What', render: (l) => <span className="strong">{title(l.action)}</span> },
          { key: 'change', label: 'Change', render: (l) => <span className="tiny">{l.old_value ? `${JSON.stringify(l.old_value)} → ` : ''}{l.new_value ? JSON.stringify(l.new_value) : ''}</span> },
          { key: 'reason', label: 'Reason' },
        ]} />
      )}
    </div>
  )
}
