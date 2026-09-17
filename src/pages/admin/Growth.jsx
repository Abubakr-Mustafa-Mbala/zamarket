import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { money, date, n, title } from '../../lib/format'
import { SOURCES } from '../../lib/statuses'
import { Badge, Table, Loading, Modal, Field, Input, Select, Textarea, useToast, Stat, Stars, Tabs, CopyLine, Segmented } from '../../components/ui'

export function SpendAndSources() {
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
        <div><h2>Spend and sources</h2><p className="muted">What each channel costs and what it brings back.</p></div>
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
  const [f, setF] = useState({ source: 'facebook_ad', spent_on: new Date().toISOString().slice(0, 10), amount: '', clicks: '', notes: '', campaign_id: '' })
  const { data: campaigns } = useData(() => q(supabase.from('campaigns').select('id,name').order('created_at', { ascending: false })), [])
  const set = (k) => (v) => setF((c) => ({ ...c, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('marketing_spend').insert({ source: f.source, spent_on: f.spent_on, amount: n(f.amount), clicks: Number(f.clicks) || 0, notes: f.notes || null, campaign_id: f.campaign_id || null })
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
        <Field label="Campaign (optional)" span><Select value={f.campaign_id} onChange={set('campaign_id')} options={(campaigns || []).map((c) => [c.id, c.name])} placeholder="Not linked to a campaign" /></Field>
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


// ================= Marketing workspace =================
const PLATFORMS = [['meta', 'Facebook & Instagram ads'], ['instagram', 'Instagram (organic)'], ['facebook', 'Facebook (organic)'], ['tiktok', 'TikTok'], ['whatsapp', 'WhatsApp'], ['google', 'Google'], ['outreach', 'Outreach (calls, messages)'], ['referral', 'Referral'], ['print', 'Flyers & posters'], ['other', 'Other']]
const GOALS = [['customers', 'Get customers'], ['resellers', 'Recruit resellers'], ['vendors', 'Recruit vendors']]

export function Marketing() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'campaigns'
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Marketing</h1><p>Campaign links for every ad, post and outreach push — and what each one brings in.</p></div></div>
      <Tabs tabs={[['campaigns', 'Campaigns'], ['requests', 'Vendor ad requests'], ['spend', 'Spend and sources']]} value={tab} onChange={(v) => setSp({ tab: v })} />
      {tab === 'campaigns' && <Campaigns />}
      {tab === 'requests' && <AdRequests />}
      {tab === 'spend' && <SpendAndSources />}
    </div>
  )
}

export function Campaigns() {
  const [edit, setEdit] = useState(null)
  const today = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
  const { data, loading, reload } = useData(() => q(supabase.rpc('campaign_stats', { p_from: from, p_to: today })), [])
  const host = window.location.host
  return (
    <div className="stack">
      <div className="between">
        <p className="small muted">Last 90 days. Every campaign gets a short link like <strong>{host}/go/amina-cakes</strong> — use it in the ad, post or message.</p>
        <button className="btn primary" onClick={() => setEdit({ owner_type: 'marketplace', goal: 'customers', platform: 'meta', destination: '/', status: 'active', budget: '' })}>New campaign</button>
      </div>
      {loading ? <Loading /> : (
        <Table rows={data} onRow={setEdit} empty="No campaigns yet — create one for your next ad or post" cols={[
          { key: 'name', label: 'Campaign', render: (c) => <div><div className="strong">{c.name}</div><div className="tiny muted">/go/{c.code} · {c.owner_type === 'vendor' ? `for ${c.vendor}` : 'ZaMarket'}</div></div> },
          { key: 'platform', label: 'Where', render: (c) => (PLATFORMS.find((x) => x[0] === c.platform) || [0, c.platform])[1] },
          { key: 'status', label: 'Status', render: (c) => <Badge status={c.status === 'ended' ? 'expired' : c.status} /> },
          { key: 'visits', label: 'Visits', num: true },
          { key: 'leads', label: 'Leads', num: true, render: (c) => c.leads ?? 0 },
          { key: 'orders', label: 'Orders', num: true, render: (c) => c.goal === 'customers' ? c.orders : `${c.applications ?? 0} applied` },
          { key: 'revenue', label: 'Sales', num: true, render: (c) => money(c.revenue) },
          { key: 'spend', label: 'Spend', num: true, render: (c) => money(c.spend) },
          { key: 'cpo', label: 'Cost per order', num: true, render: (c) => (c.orders && Number(c.spend) ? money(c.spend / c.orders) : '—') },
        ]} />
      )}
      {edit && <CampaignEditor campaign={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
    </div>
  )
}

export function CampaignEditor({ campaign, onClose, onDone }) {
  const toast = useToast()
  const { user } = useAuth()
  const [c, setC] = useState({ ...campaign })
  const set = (k) => (v) => setC((x) => ({ ...x, [k]: v }))
  const { data: refs } = useData(async () => ({
    vendors: await q(supabase.from('public_vendors').select('id,business_name,slug').order('business_name')),
    products: await q(supabase.from('products').select('id,name,slug,vendor_id').in('status', ['published', 'out_of_stock']).order('name')),
  }), [])
  const vendor = (refs?.vendors || []).find((v) => v.id === c.vendor_id)
  const destinations = [
    ['/', 'ZaMarket homepage'],
    ['/search?deals=1', "Today's deals"],
    ...(vendor ? [[`/${vendor.slug}`, `${vendor.business_name} store`]] : (refs?.vendors || []).map((v) => [`/${v.slug}`, `${v.business_name} store`])),
    ...(refs?.products || []).filter((p) => !vendor || p.vendor_id === vendor.id).map((p) => [p.vendor_id ? `/${(refs.vendors.find((v) => v.id === p.vendor_id) || {}).slug}/${p.slug}` : `/p/${p.slug}`, `Product: ${p.name}`]),
    ['/apply/reseller', 'Become a reseller page'],
    ['/apply/vendor', 'Sell on ZaMarket page'],
  ]
  const slugify = (v) => v.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const save = async (e) => {
    e.preventDefault()
    const row = {
      name: c.name, code: slugify(c.code || c.name), owner_type: c.owner_type, vendor_id: c.owner_type === 'vendor' ? c.vendor_id || null : null,
      goal: c.goal, platform: c.platform, destination: c.destination || '/', budget: n(c.budget), status: c.status,
      starts_on: c.starts_on || null, ends_on: c.ends_on || null, notes: c.notes || null,
    }
    const res = c.id ? await supabase.from('campaigns').update(row).eq('id', c.id) : await supabase.from('campaigns').insert({ ...row, created_by: user.id })
    if (res.error) return toast(res.error.message.includes('campaigns_code_key') ? 'That link name is taken. Try another.' : res.error.message, true)
    toast(c.id ? 'Campaign saved' : 'Campaign created'); onDone()
  }
  const link = `${window.location.host}/go/${slugify(c.code || c.name || '')}`
  return (
    <Modal title={c.id ? c.name : 'New campaign'} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <div className="form-grid">
          <Field label="Campaign name" span><Input value={c.name} onChange={set('name')} placeholder="e.g. Amina's cakes — December" required /></Field>
          <Field label="Link name" hint={`Your link: ${link}`} span><Input value={c.code ?? ''} onChange={set('code')} placeholder={slugify(c.name || 'amina-cakes')} /></Field>
          <Field label="Who is it for?"><Segmented options={[['marketplace', 'ZaMarket'], ['vendor', 'A vendor']]} value={c.owner_type} onChange={set('owner_type')} /></Field>
          {c.owner_type === 'vendor' && <Field label="Vendor"><Select value={c.vendor_id} onChange={(v) => setC((x) => ({ ...x, vendor_id: v, destination: `/${((refs?.vendors || []).find((y) => y.id === v) || {}).slug || ''}` }))} options={(refs?.vendors || []).map((v) => [v.id, v.business_name])} placeholder="Choose vendor" required /></Field>}
          <Field label="Goal"><Select value={c.goal} onChange={set('goal')} options={GOALS} /></Field>
          <Field label="Where will the link be used?"><Select value={c.platform} onChange={set('platform')} options={PLATFORMS} /></Field>
          <Field label="Send people to" span><Select value={c.destination} onChange={set('destination')} options={destinations} /></Field>
          <Field label="Budget (K, optional)"><Input money value={c.budget} onChange={set('budget')} /></Field>
          <Field label="Status"><Select value={c.status} onChange={set('status')} options={[['active', 'Active'], ['paused', 'Paused'], ['ended', 'Ended'], ['draft', 'Draft']]} /></Field>
          <Field label="Starts"><Input type="date" value={c.starts_on} onChange={set('starts_on')} /></Field>
          <Field label="Ends"><Input type="date" value={c.ends_on} onChange={set('ends_on')} /></Field>
          <Field label="Notes" span><Textarea value={c.notes} onChange={set('notes')} rows={2} placeholder="Audience, creative, offer, who's running it" /></Field>
        </div>
        {c.id && <div><div className="tiny muted mb">Share this link</div><CopyLine text={`${window.location.origin}/go/${c.code}`} /></div>}
        <button className="btn primary block">{c.id ? 'Save campaign' : 'Create campaign'}</button>
      </form>
    </Modal>
  )
}

export function AdRequests() {
  const toast = useToast()
  const [open, setOpen] = useState(null)
  const [campaignFor, setCampaignFor] = useState(null)
  const { data, loading, reload } = useData(async () => {
    const [reqs, vendors] = await Promise.all([
      q(supabase.from('ad_requests').select('*,product:products(name,slug)').order('created_at', { ascending: false })),
      q(supabase.from('public_vendors').select('id,business_name,slug')),
    ])
    return reqs.map((r) => ({ ...r, vendor: vendors.find((v) => v.id === r.vendor_id) || null }))
  }, [])
  const update = async (r, patch) => {
    const { error } = await supabase.from('ad_requests').update(patch).eq('id', r.id)
    if (error) return toast(error.message, true)
    toast('Request updated'); setOpen(null); reload()
  }
  return (
    <div className="stack">
      <p className="small muted">Vendors ask for ads from their dashboard. Reply, create the campaign, and they'll see its link and progress.</p>
      {loading ? <Loading /> : (
        <Table rows={data} onRow={setOpen} empty="No ad requests from vendors yet" cols={[
          { key: 'vendor', label: 'Vendor', render: (r) => <span className="strong">{r.vendor?.business_name}</span> },
          { key: 'goal', label: 'What they want' },
          { key: 'promote', label: 'Promote', render: (r) => r.product ? r.product.name : 'Their store' },
          { key: 'budget', label: 'Budget', num: true, render: (r) => (r.budget ? money(r.budget) : '—') },
          { key: 'status', label: 'Status', render: (r) => <Badge status={{ new: 'pending', in_progress: 'processing', live: 'active', done: 'completed', declined: 'rejected' }[r.status]}>{title(r.status)}</Badge> },
          { key: 'created_at', label: 'Asked', render: (r) => date(r.created_at) },
        ]} />
      )}
      {open && (
        <Modal title={`Ad request from ${open.vendor?.business_name}`} onClose={() => setOpen(null)}>
          <div className="stack">
            <div className="small"><strong>Goal:</strong> {open.goal}</div>
            <div className="small"><strong>Promote:</strong> {open.product ? open.product.name : 'Their whole store'}{open.budget ? ` · Budget ${money(open.budget)}` : ''}</div>
            {open.audience && <div className="small"><strong>Audience:</strong> {open.audience}</div>}
            {open.notes && <div className="small"><strong>Notes:</strong> {open.notes}</div>}
            <Field label="Reply to the vendor"><Textarea value={open.reply} onChange={(v) => setOpen({ ...open, reply: v })} rows={3} /></Field>
            <div className="btn-row">
              <button className="btn primary" onClick={() => setCampaignFor(open)}>Create campaign</button>
              <button className="btn" onClick={() => update(open, { status: 'in_progress', reply: open.reply || null })}>Mark in progress</button>
              <button className="btn" onClick={() => update(open, { status: 'done', reply: open.reply || null })}>Mark done</button>
              <button className="btn danger" onClick={() => update(open, { status: 'declined', reply: open.reply || null })}>Decline</button>
            </div>
          </div>
        </Modal>
      )}
      {campaignFor && (
        <CampaignEditor
          campaign={{ owner_type: 'vendor', vendor_id: campaignFor.vendor_id, goal: 'customers', platform: 'meta', status: 'active', budget: campaignFor.budget || '',
            name: `${campaignFor.vendor?.business_name} — ${new Date().toLocaleDateString('en-GB', { month: 'long' })}`,
            destination: campaignFor.product ? `/${campaignFor.vendor?.slug}/${campaignFor.product.slug}` : `/${campaignFor.vendor?.slug}`, notes: campaignFor.goal }}
          onClose={() => setCampaignFor(null)}
          onDone={async () => {
            const { data: latest } = await supabase.from('campaigns').select('id').eq('vendor_id', campaignFor.vendor_id).order('created_at', { ascending: false }).limit(1)
            await supabase.from('ad_requests').update({ status: 'live', campaign_id: latest?.[0]?.id || null, reply: open?.reply || null }).eq('id', campaignFor.id)
            setCampaignFor(null); setOpen(null); reload(); toast('Campaign created and linked to the request')
          }}
        />
      )}
    </div>
  )
}
