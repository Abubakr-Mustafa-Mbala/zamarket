import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { DEFAULT_DEPARTMENTS, ICON_KEYS, iconByKey } from '../../lib/categories'
import { money, pct, date, datetime, n, title } from '../../lib/format'
import { Badge, Table, Loading, Field, Input, Select, Textarea, Segmented, useToast, Stat, Tabs, CopyLine } from '../../components/ui'

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
  const { user, settings, refresh, isFounder } = useAuth()
  const [search, setSearch] = useState('')
  const [invite, setInvite] = useState({ email: '', role: 'ops' })
  const { data, loading, reload } = useData(async () => ({
    people: await q(supabase.from('profiles').select('*').order('created_at', { ascending: false })),
    invites: isFounder ? await q(supabase.from('staff_invites').select('*').is('used_at', null).order('created_at', { ascending: false })) : [],
  }), [])
  const founders = settings.founder_emails || []
  const rows = (data?.people || []).filter((p) => !search || (p.full_name || '').toLowerCase().includes(search.toLowerCase()) || (p.email || '').includes(search))
  const staff = rows.filter((p) => p.role !== 'customer')

  const setRole = async (p, role) => {
    if (p.id === user.id && role !== 'founder' && !window.confirm('Remove your own founder role? You will lose access to founder-only pages.')) return
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id)
    if (error) return toast(error.message, true)
    toast(`${p.full_name || p.email} is now ${title(role)}`); reload()
  }
  const sendInvite = async (e) => {
    e.preventDefault()
    const email = invite.email.trim().toLowerCase()
    if (!email.includes('@')) return toast('Enter their email address', true)
    if (invite.role === 'founder' && !founders.includes(email)) return toast('Add them to the founders list below first', true)
    const { error } = await supabase.from('staff_invites').upsert({ email, role: invite.role, invited_by: user.id, used_at: null })
    if (error) return toast(error.message, true)
    toast('Invite ready'); setInvite({ email: '', role: 'ops' }); reload()
  }
  const cancelInvite = async (email) => {
    const { error } = await supabase.from('staff_invites').delete().eq('email', email)
    if (error) return toast(error.message, true)
    reload()
  }
  const saveFounders = async (list) => {
    const { error } = await supabase.from('settings').update({ value: list }).eq('key', 'founder_emails')
    if (error) return toast(error.message, true)
    await refresh(); toast('Founders list updated')
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p>Only people you invite get access. Everyone else who signs up is a customer.</p>
        </div>
        <Input value={search} onChange={setSearch} placeholder="Search" style={{ maxWidth: 220 }} />
      </div>

      {isFounder && (
        <div className="grid-2 tight">
          <section className="card stack-sm">
            <h3>Invite someone</h3>
            <p className="small muted">Send them the sign-up link. When they create an account with this email, they get this role automatically.</p>
            <form onSubmit={sendInvite} className="row">
              <Input type="email" value={invite.email} onChange={(v) => setInvite({ ...invite, email: v })} placeholder="their@email.com" style={{ flex: 1, minWidth: 160 }} />
              <Select value={invite.role} onChange={(v) => setInvite({ ...invite, role: v })} options={ROLES.filter((r) => r !== 'customer').map((r) => [r, title(r)])} />
              <button className="btn primary">Add invite</button>
            </form>
            {(data?.invites || []).length > 0 && (
              <div className="mini-table">
                {data.invites.map((i) => (
                  <div key={i.email} className="mini-row">
                    <span className="grow"><strong>{i.email}</strong><span className="tiny muted">Will join as {title(i.role)}</span></span>
                    <CopyLine text={`${window.location.origin}/login`} />
                    <button className="btn sm ghost" onClick={() => cancelInvite(i.email)}>Cancel</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card stack-sm">
            <h3>Founders</h3>
            <p className="small muted">Only these email addresses can hold the founder role. This is what stops anyone else signing up as a founder.</p>
            <div className="chips wrap">
              {founders.map((f) => (
                <span key={f} className="chip on">{f}
                  {founders.length > 1 && <button type="button" aria-label={`Remove ${f}`} className="chip-x" onClick={() => { if (window.confirm(`Remove ${f} from the founders list?`)) saveFounders(founders.filter((x) => x !== f)) }}>✕</button>}
                </span>
              ))}
            </div>
            <form className="row" onSubmit={(e) => { e.preventDefault(); const v = e.target.email.value.trim().toLowerCase(); if (v.includes('@')) { saveFounders([...founders, v]); e.target.reset() } }}>
              <input className="input" name="email" type="email" placeholder="partner@email.com" style={{ flex: 1, minWidth: 160 }} />
              <button className="btn">Add founder email</button>
            </form>
          </section>
        </div>
      )}

      <section className="card">
        <h3 className="mb">Your team</h3>
        {loading ? <Loading /> : (
          <Table rows={staff} empty="No staff yet" cols={[
            { key: 'full_name', label: 'Person', render: (p) => <div><div className="strong">{p.full_name || '—'}</div><div className="tiny muted">{p.email}{p.phone ? ` · ${p.phone}` : ''}</div></div> },
            { key: 'created_at', label: 'Joined', render: (p) => date(p.created_at) },
            { key: 'role', label: 'Role', render: (p) => isFounder
              ? <select className="status-select" value={p.role} onChange={(e) => setRole(p, e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{title(r)}</option>)}</select>
              : <Badge>{title(p.role)}</Badge> },
          ]} />
        )}
        <p className="tiny muted mt">Founder: everything. Ops: orders, products, stock. Finance: money. Delivery: deliveries. Marketing: campaigns, leads and content, no finance. Vendor and reseller roles come from approved applications.</p>
      </section>

      {search && rows.length !== staff.length && (
        <section className="card">
          <h3 className="mb">Customers matching “{search}”</h3>
          <Table rows={rows.filter((p) => p.role === 'customer')} empty="None" cols={[
            { key: 'full_name', label: 'Person', render: (p) => <div><div className="strong">{p.full_name || '—'}</div><div className="tiny muted">{p.email}</div></div> },
            { key: 'role', label: 'Make staff', render: (p) => isFounder ? <select className="status-select" value={p.role} onChange={(e) => setRole(p, e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{title(r)}</option>)}</select> : '—' },
          ]} />
        </section>
      )}
    </div>
  )
}

// ---------------- Settings ----------------
const GROUPS = [
  {
    title: 'Your business',
    note: 'Used on receipts and messages to customers.',
    fields: [
      { key: 'business_name', label: 'Business name', type: 'text', help: 'Printed at the top of every receipt.' },
      { key: 'business_phone', label: 'Business phone', type: 'text', help: 'So customers can reach you from the receipt.' },
      { key: 'receipt_footer', label: 'Thank-you line on receipts', type: 'text', help: 'e.g. Thank you for shopping with us!' },
    ],
  },
  {
    title: 'Pricing',
    note: 'These only suggest prices. You can always type your own.',
    fields: [
      { key: 'target_markup_pct', label: 'Profit you want on top of cost (%)', type: 'number', help: 'If something costs you K100 and this is 50, the suggested price is K150.' },
      { key: 'default_packaging_cost', label: 'Packaging cost per item (K)', type: 'number', help: 'What a bag or box costs you, so profit is honest.' },
      { key: 'min_profit_per_unit', label: 'Least profit you will accept per item (K)', type: 'number', help: 'Below this, the system warns you.' },
      { key: 'target_margin_pct', label: 'Healthy profit share of the price (%)', type: 'number', help: 'Used for the green, yellow and red lights. 30 means about a third of the price is profit.' },
      { key: 'price_floor_margin_pct', label: 'Lowest profit share allowed on an offer (%)', type: 'number', help: 'Stops anyone publishing an offer that barely makes money. A founder can still approve it with a reason.' },
      { key: 'payment_fee_pct', label: 'Payment charge (%)', type: 'number', help: 'What a payment service like Airtel or MTN will take later. Leave at 0 while customers pay you directly.' },
    ],
  },
  {
    title: 'Delivery',
    note: 'Many shops build delivery into the price so customers see "Free delivery". If you do that, add the delivery cost per sale when you price a product in "I bought goods".',
    fields: [
      { key: 'delivery_included', label: 'Delivery is included in my prices', type: 'switch', help: 'On: customers are never charged delivery and the shop says Free delivery. Off: Lusaka District pays the fee below.' },
      { key: 'local_delivery_fee', label: 'Delivery fee inside Lusaka District (K)', type: 'number', help: 'Added automatically. Anywhere else, you set the fee after calling the customer.' },
    ],
  },
  {
    title: 'Vendors and resellers',
    note: 'The vendor pays the marketplace fee, and the reseller\'s commission comes out of that fee.',
    fields: [
      { key: 'marketplace_fee_pct', label: 'Marketplace fee on a vendor sale (%)', type: 'number', help: 'Your share of every vendor sale.' },
      { key: 'own_audience_fee_pct', label: 'Lower fee when the vendor brought the customer (%)', type: 'number', help: 'When someone buys through the vendor\'s own store link, you take this smaller fee instead.' },
      { key: 'default_commission_pct', label: 'Reseller commission (%)', type: 'number', help: 'Paid on completed sales. A product can have its own rate instead. Below about 10% on cheap items, resellers earn too little to bother.' },
      { key: 'reseller_credit_days', label: 'Reseller keeps a customer for (days)', type: 'number', help: "If a customer they brought orders again within this time, the reseller still earns. 0 means they only earn on the first order." },
      { key: 'payout_minimum', label: 'Smallest payout (K)', type: 'number', help: 'Resellers and vendors can ask to be paid once they have at least this much.' },
      { key: 'commission_grace_hours', label: 'Hours to wait before paying a commission', type: 'number', help: 'Time for the customer to report a problem. 24 is normal.' },
      { key: 'referral_reward', label: 'Reward when a customer brings a friend (K)', type: 'number', help: 'Paid after the friend\'s first order is completed.' },
    ],
  },
]

function ResetData() {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState('')
  const [keep, setKeep] = useState(true)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('reset_test_data', { p_confirm: word, p_keep_products: keep })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast(`Cleared ${data.orders} orders and ${data.customers} customers`)
    setOpen(false); setWord('')
  }
  return (
    <section className="card stack-sm" style={{ borderColor: 'var(--bad)' }}>
      <h3>Start fresh before you go live</h3>
      <p className="small muted">Deletes every test order, customer, lead, campaign, review and money record, and sets order numbers back to 1001. Your team accounts and settings stay. This cannot be undone.</p>
      {!open ? <button className="btn danger" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Clear test data</button> : (
        <div className="stack-sm">
          <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep my products and suppliers (stock counts reset to zero)</label>
          <Field label="Type DELETE to confirm"><Input value={word} onChange={setWord} placeholder="DELETE" /></Field>
          <div className="btn-row">
            <button className="btn danger" disabled={busy || word !== 'DELETE'} onClick={run}>{busy ? 'Clearing…' : 'Yes, clear everything'}</button>
            <button className="btn ghost" onClick={() => { setOpen(false); setWord('') }}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}

export function Settings() {
  const toast = useToast()
  const { settings, refresh, isFounder } = useAuth()
  const [f, setF] = useState({ ...settings })
  const [saving, setSaving] = useState(false)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  const capital = { inventory: 200, packaging: 50, delivery: 50, advertising: 100, reserve: 100, ...(f.capital_allocation || {}) }
  const setCapital = (k, v) => setF((x) => ({ ...x, capital_allocation: { ...capital, [k]: Number(v) || 0 } }))
  const depts = Array.isArray(f.departments) && f.departments.length ? f.departments : DEFAULT_DEPARTMENTS
  const setDepts = (list) => setF((x) => ({ ...x, departments: list }))

  const save = async () => {
    setSaving(true)
    try {
      const rows = []
      for (const g of GROUPS) for (const fld of g.fields) rows.push({ key: fld.key, value: fld.type === 'number' ? n(f[fld.key]) : fld.type === 'switch' ? (f[fld.key] === true || f[fld.key] === 'true') : (f[fld.key] ?? '') })
      rows.push({ key: 'capital_allocation', value: capital })
      rows.push({ key: 'departments', value: depts.filter((d) => d.name?.trim()) })
      rows.push({ key: 'reseller_terms', value: f.reseller_terms || '' })
      rows.push({ key: 'vendor_terms', value: f.vendor_terms || '' })
      for (const row of rows) {
        const { error } = await supabase.from('settings').upsert(row)
        if (error) throw new Error(`${row.key}: ${error.message}`)
      }
      await refresh()
      toast('Settings saved')
    } catch (e) { toast(e.message, true) } finally { setSaving(false) }
  }

  const totalCapital = Object.values(capital).reduce((t, v) => t + Number(v || 0), 0)

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <div><h1>Settings</h1><p>Every rule the system follows. Each one explains what it does.</p></div>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
      </div>

      {GROUPS.map((g) => (
        <section key={g.title} className="card stack-sm">
          <h3>{g.title}</h3>
          {g.note && <p className="small muted">{g.note}</p>}
          <div className="settings-grid">
            {g.fields.map((fld) => (
              <Field key={fld.key} label={fld.label} hint={fld.help}>
                {fld.type === 'switch'
                  ? <Segmented options={[['no', 'No, charge delivery'], ['yes', 'Yes, it is included']]} value={(f[fld.key] === true || f[fld.key] === 'true') ? 'yes' : 'no'} onChange={(v) => set(fld.key)(v === 'yes')} />
                  : <Input type={fld.type === 'number' ? 'number' : 'text'} value={f[fld.key] ?? ''} onChange={set(fld.key)} />}
              </Field>
            ))}
          </div>
        </section>
      ))}

      <section className="card stack-sm">
        <h3>Shop departments</h3>
        <p className="small muted">What customers see at the top of the shop and when choosing a category. Use only what you actually sell.</p>
        {depts.map((d, i) => (
          <div key={i} className="ob-row">
            <Input value={d.name} onChange={(v) => setDepts(depts.map((x, k) => (k === i ? { ...x, name: v } : x)))} placeholder="Department name" />
            <select className="input" style={{ maxWidth: 130 }} value={d.icon || 'other'} onChange={(e) => setDepts(depts.map((x, k) => (k === i ? { ...x, icon: e.target.value } : x)))} aria-label="Icon">
              {ICON_KEYS.map((k) => <option key={k} value={k}>{title(k)}</option>)}
            </select>
            <span className="ob-icon-preview">{iconByKey(d.icon)}</span>
            <button type="button" className="btn sm ghost" onClick={() => setDepts(depts.filter((_, k) => k !== i))} aria-label="Remove">✕</button>
            <button type="button" className="btn sm ghost" onClick={() => { if (i === 0) return; const c = [...depts]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; setDepts(c) }} aria-label="Move up">↑</button>
          </div>
        ))}
        <button type="button" className="btn sm" onClick={() => setDepts([...depts, { name: '', icon: 'other' }])}>Add a department</button>
        <p className="tiny muted">Renaming a department doesn't change products already saved under the old name — edit those products to the new name.</p>
      </section>

      <section className="card stack-sm">
        <h3>Starting money plan</h3>
        <p className="small muted">How you plan to split your starting capital. It's a reminder, not a limit.</p>
        <div className="settings-grid">
          {[['inventory', 'Stock to sell'], ['packaging', 'Packaging'], ['delivery', 'Delivery and fuel'], ['advertising', 'Advertising'], ['reserve', 'Kept in reserve']].map(([k, label]) => (
            <Field key={k} label={label}><Input type="number" value={capital[k]} onChange={(v) => setCapital(k, v)} /></Field>
          ))}
        </div>
        <p className="small"><span className="muted">Total planned:</span> <strong>{totalCapital.toLocaleString()}</strong></p>
      </section>

      <section className="card stack-sm">
        <h3>The rules people agree to</h3>
        <p className="small muted">Shown on the application forms. Write them in your own words — keep them fair and true.</p>
        <Field label="Reseller rules"><Textarea value={f.reseller_terms ?? ''} onChange={set('reseller_terms')} rows={5} /></Field>
        <Field label="Vendor rules"><Textarea value={f.vendor_terms ?? ''} onChange={set('vendor_terms')} rows={5} /></Field>
        <p className="tiny muted">Have someone check these against Zambian law before you rely on them in a dispute.</p>
      </section>

      {isFounder && <ResetData />}

      <section className="card small">
        <p className="strong" style={{ color: 'var(--ink)' }}>How a vendor sale is split</p>
        <p className="mt">On a K500 vendor sale with a {f.marketplace_fee_pct ?? 10}% fee and a {f.default_commission_pct ?? 5}% reseller commission:
          the vendor receives {money(500 - (500 * n(f.marketplace_fee_pct ?? 10)) / 100)}, you keep {money((500 * n(f.marketplace_fee_pct ?? 10)) / 100 - (500 * n(f.default_commission_pct ?? 5)) / 100)},
          and the reseller earns {money((500 * n(f.default_commission_pct ?? 5)) / 100)} out of your fee. If no reseller was involved, you keep the whole fee.</p>
      </section>

      <div className="btn-row"><button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button></div>
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
