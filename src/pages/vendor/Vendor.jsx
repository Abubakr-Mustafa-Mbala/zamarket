import { Link } from 'react-router-dom'
import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, date, n, title } from '../../lib/format'
import { Badge, Table, Loading, Stat, Empty, useToast, Stars, Tabs, CopyLine, Field, Input, Select, Textarea, Segmented } from '../../components/ui'
import { niceDate } from '../../lib/madeToOrder'
import { ProductEditor } from '../admin/Products'
import { PHOTO_TIPS } from '../../lib/photos'
import PhotoUpload from '../../components/PhotoUpload'
import { THEMES, STYLES } from '../../lib/storeTheme'
import PayoutRequest from '../../components/PayoutRequest'
import ShareThis from '../../components/ShareThis'
import QrCode from '../../components/QrCode'

const useVendor = () => useAuth().profile?.partner || null

export function VendorHome() {
  const v = useVendor()
  const { settings } = useAuth()
  const { data, loading } = useData(async () => v ? {
    sum: await q(supabase.rpc('vendor_summary')),
    setts: await q(supabase.from('settlements').select('marketplace_fee,net_payable,status').eq('vendor_id', v.id)),
    products: await q(supabase.from('products').select('status').eq('vendor_id', v.id)),
    store: await q(supabase.rpc('vendor_store_stats')),
  } : null, [v?.id])
  if (!v) return <Empty title="No vendor profile">Your account isn't linked to an approved vendor application.</Empty>
  if (loading || !data) return <Loading />
  const { sum } = data
  const open = data.setts.filter((s) => ['pending', 'eligible', 'approved'].includes(s.status)).reduce((t, s) => t + n(s.net_payable), 0)
  const paid = data.setts.filter((s) => s.status === 'paid').reduce((t, s) => t + n(s.net_payable), 0)
  const fees = data.setts.filter((s) => s.status !== 'cancelled').reduce((t, s) => t + n(s.marketplace_fee), 0)
  return (
    <div className="stack">
      <div className="page-head"><div><h1>{v.business_name}</h1><p>Marketplace fee: {v.fee_pct_override ?? settings.marketplace_fee_pct}% per sale</p></div></div>
      {sum.to_make > 0 && <Link to="/vendor/orders" className="card between" style={{ color: 'inherit', borderColor: 'var(--copper)' }}><span><span className="strong">{sum.to_make} item{sum.to_make > 1 ? 's' : ''} to prepare</span><br /><span className="small muted">Open your order desk</span></span><span aria-hidden>›</span></Link>}
      <div className="grid-4">
        <Stat hero label="Sales" value={money(sum.sales)} sub={`${sum.units} units`} />
        <Stat label="Payouts coming" value={money(open)} tone="copper" />
        <Stat label="Paid to you" value={money(paid)} />
        <Stat label="Marketplace fees" value={money(fees)} sub={`${sum.returns} returns / refunds`} />
      </div>
      {data.store?.slug && (
        <div className="card stack-sm">
          <div className="between"><h3>Your store link</h3><Link to="/vendor/marketing" className="small">Share and advertise</Link></div>
          <CopyLine text={`${window.location.origin}/${data.store.slug}`} />
          <p className="small muted">Share it on Instagram, WhatsApp or Facebook. Sales from people who arrive through your link cost you a {data.store.own_fee_pct}% fee instead of {data.store.normal_fee_pct}%. So far: {data.store.own_orders} order{data.store.own_orders === 1 ? '' : 's'}, {money(data.store.own_sales)}.</p>
        </div>
      )}
      <VendorTraffic />
      <section className="card stack-sm">
        <h3>Your link to ZaMarket</h3>
        <p className="small muted">Share this with anyone. If they buy from your store, you pay our smaller fee of {settings.own_audience_fee_pct}%. If they buy from another seller here, you still earn {settings.vendor_referral_pct}% of what they spend.</p>
        <ShareThis store={v} products={[]} link={`${window.location.origin}/${v.slug}`} className="btn buy" label="Make a picture of my shop" />
        <div className="store-qr">
          <QrCode value={`${window.location.origin}/${v.slug}`} size={132} />
          <div>
            <strong>Your store's QR code</strong>
            <p className="small muted">Print it on a card, a flyer or your shop window. Anyone who scans it lands on your store.</p>
            <p className="tiny muted">{window.location.host}/{v.slug}</p>
          </div>
        </div>
        {v.ref_code
          ? <CopyLine text={`${window.location.origin}/v/${v.ref_code}`} />
          : <p className="small muted">Your link appears once your account is fully set up.</p>}
        {Number(sum.referral_earned) > 0 && <p className="small">Earned from people you sent: <strong className="copper">{money(sum.referral_earned)}</strong></p>}
      </section>
      <Link to="/vendor/earnings" className="card between" style={{ color: 'inherit' }}><span><span className="strong">See your earnings chart</span><br /><span className="small muted">Day by day, pick any dates, all your records</span></span><span aria-hidden>›</span></Link>
      <div className="grid-2 tight">
        <div className="card"><h3 className="mb">Products</h3>{['published', 'submitted', 'draft', 'rejected'].map((st) => <div key={st} className="between small"><Badge status={st} /><span>{data.products.filter((p) => p.status === st).length}</span></div>)}</div>
        <div className="card stack-sm"><div className="between"><h3>Reviews</h3>{sum.rating && <Stars n={sum.rating} />}</div>{sum.reviews.length === 0 ? <p className="small muted">No reviews yet.</p> : sum.reviews.map((r, i) => <div key={i} className="small"><Stars n={r.rating} /> {r.comment || <span className="muted">No comment</span>}</div>)}</div>
      </div>
      <div className="card small muted">
        <p className="strong" style={{ color: 'var(--ink)' }}>How selling on ZaMarket works</p>
        <p className="mt">Customers order and pay through ZaMarket. We confirm every order, then you can see the customer's phone and address. When the order is complete, your share appears under Payouts and we pay you. Payments for ZaMarket orders always go through ZaMarket.</p>
      </div>
    </div>
  )
}

export function VendorProducts() {
  const v = useVendor()
  const toast = useToast()
  const [edit, setEdit] = useState(null)
  const { data, loading, reload } = useData(() => v ? q(supabase.from('products').select('*').eq('vendor_id', v.id).order('created_at', { ascending: false })) : Promise.resolve([]), [v?.id])
  const setAvailability = async (p) => {
    const { error } = await supabase.rpc('vendor_set_availability', { p_product: p.id, p_available: p.status !== 'published' })
    if (error) return toast(error.message, true)
    toast(p.status === 'published' ? 'Marked sold out — customers cannot order it' : 'Back on sale')
    reload()
  }
  if (!v) return <Empty title="No vendor profile" />
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>My products</h1><p>Add products and send them for review. We publish them once approved.</p></div>
        <button className="btn primary" onClick={() => setEdit({ status: 'draft', owner_type: 'vendor', benefits: [], images: [], faqs: [] })}>Add product</button>
      </div>
      {loading ? <Loading /> : (
        <Table rows={data} onRow={(p) => ['draft', 'submitted', 'rejected'].includes(p.status) ? setEdit(p) : null} empty="No products yet" cols={[
          { key: 'name', label: 'Product', render: (p) => <div><div className="strong">{p.name}</div>{p.status === 'rejected' && p.rejection_reason && <div className="tiny bad">{p.rejection_reason}</div>}</div> },
          { key: 'status', label: 'Status', render: (p) => <Badge status={p.status} /> },
          { key: 'price', label: 'Price', num: true, render: (p) => money(p.price) },
          { key: 'page', label: '', render: (p) => ['draft', 'submitted', 'rejected'].includes(p.status)
            ? <a className="btn sm" href={`/vendor/products/${p.id}/page`} onClick={(e) => e.stopPropagation()}>Design the page</a>
            : ['published', 'out_of_stock'].includes(p.status)
              ? <>
                  <button className={`btn sm ${p.featured_in_store ? 'primary' : ''}`} title="Show this first in my store"
                    onClick={async (e) => {
                      e.stopPropagation()
                      const { error } = await supabase.rpc('vendor_set_featured', { p_product: p.id, p_on: !p.featured_in_store })
                      if (error) return toast(error.message, true)
                      toast(p.featured_in_store ? 'Taken off the front of your store' : 'Now shows first in your store')
                      reload()
                    }}>{p.featured_in_store ? '★ Featured' : '☆ Feature'}</button>
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); setAvailability(p) }}>{p.status === 'published' ? 'Mark sold out' : 'Back in stock'}</button>
                </>
              : null },
        ]} />
      )}
      <div className="card flat small stack-sm">
        <strong>What the words mean</strong>
        <ul className="fc-rules">
          <li><strong>Draft</strong> — only you can see it. Keep editing until you are happy.</li>
          <li><strong>Sent for review</strong> — with the ZaMarket team. We check it and publish it, usually the same day.</li>
          <li><strong>Feature</strong> — up to six products show first when someone opens your store. Choose the ones you most want to sell.</li>
          <li><strong>Published</strong> — live in the shop. Tap <strong>Mark sold out</strong> any time and it disappears from the shop until you put it back.</li>
          <li><strong>Rejected</strong> — something needed changing. Open it to see why, fix it, and send it again.</li>
        </ul>
        <p className="tiny muted">To change a published item, ask us — prices and details are locked once it is live so a customer never sees a price change mid-order.</p>
      </div>
      <p className="tiny muted">Use "Design the page" to add packages, photos, schedule and everything customers see. Published products can only be changed by the marketplace team, so prices customers see stay consistent. Message us to update one.</p>
      {edit && <ProductEditor product={edit} vendorMode={v.id} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
    </div>
  )
}

const ACTIVE = ['pending', 'confirmed', 'payment_pending', 'paid', 'processing', 'ready_for_dispatch', 'customer_unreachable']
const STEP_LABEL = { new: 'Not started', preparing: 'Preparing', ready: 'Ready for collection', collected: 'Collected' }
const STEP_TONE = { new: 'warn', preparing: 'info', ready: 'ok', collected: 'ok' }

export function VendorOrders() {
  const v = useVendor()
  const toast = useToast()
  const [tab, setTab] = useState('todo')
  const { data, loading, reload } = useData(() => (v ? q(supabase.rpc('vendor_orders_list')) : Promise.resolve([])), [v?.id])
  if (!v) return <Empty title="No vendor profile" />
  if (loading || !data) return <Loading />
  const todo = data.filter((o) => ACTIVE.includes(o.status)).sort((a, b) => (a.needed_by || a.created_at).localeCompare(b.needed_by || b.created_at))
  const past = data.filter((o) => !ACTIVE.includes(o.status))
  const list = tab === 'todo' ? todo : past

  const step = async (item, status) => {
    const { error } = await supabase.rpc('vendor_set_item_status', { p_item: item.id, p_status: status })
    if (error) return toast(error.message, true)
    toast(status === 'ready' ? 'Marked ready — we will collect it' : 'Updated'); reload()
  }
  const requestCancel = async (orderId) => {
    const reason = window.prompt('Why should this order be cancelled?')
    if (!reason) return
    const { error } = await supabase.rpc('set_order_status', { p_order: orderId, p_status: 'cancelled', p_reason: reason })
    if (error) return toast(error.message, true)
    toast('Cancellation request sent to the marketplace team'); reload()
  }
  let lastDate = null

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Order desk</h1><p>What to prepare and when. We confirm each order with the customer first; then you'll see their phone and address.</p></div></div>
      <Tabs tabs={[['todo', `To prepare (${todo.length})`], ['past', 'Past orders']]} value={tab} onChange={setTab} />
      {list.length === 0 ? <Empty title={tab === 'todo' ? 'Nothing to prepare right now' : 'No past orders yet'} /> : list.map((o) => {
        const dateKey = o.needed_by || null
        const header = tab === 'todo' && dateKey !== lastDate ? (lastDate = dateKey, <h3 key={`h-${o.order_id}`} className="desk-date">{dateKey ? `Needed ${niceDate(dateKey)}` : 'Ready-made items'}</h3>) : null
        const waiting = ['pending', 'customer_unreachable'].includes(o.status)
        return (
          <div key={o.order_id} className="stack-sm">
            {header}
            <div className="card stack-sm">
              <div className="between">
                <span><span className="strong">Order #{o.order_number}</span> <span className="small muted">{[o.area, o.district].filter(Boolean).join(', ')}</span></span>
                <Badge status={o.status} />
              </div>
              <div className="between small">
                <span><span className="strong">{o.customer}</span>{o.repeat > 0 && <span className="badge ok" style={{ marginLeft: 6 }}>Ordered from you {o.repeat} time{o.repeat > 1 ? 's' : ''} before</span>}</span>
              </div>
              {o.contact ? (
                <div className="contact-box small">
                  <a href={`tel:${o.contact.phone}`} className="strong">{o.contact.phone}</a>
                  {o.contact.address && <span>{o.contact.address}</span>}
                  {o.contact.instructions && <span className="muted">{o.contact.instructions}</span>}
                </div>
              ) : ACTIVE.includes(o.status) && <div className="tiny muted">Phone and address appear once we confirm the order.</div>}
              {waiting && tab === 'todo' && <div className="small warn">Waiting for us to confirm with the customer. Don't start yet.</div>}
              {o.items.map((it) => (
                <div key={it.id} className="desk-item">
                  <div className="between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="strong">{it.quantity} × {it.name}</div>
                      {it.choices && Object.entries(it.choices).map(([k, val]) => <div key={k} className="small">{k === 'Time' ? 'Booked for' : k}: <span className="strong">{val}</span></div>)}
                      {it.note && <div className="small">Message: <span className="strong">“{it.note}”</span></div>}
                    </div>
                    <span className="money small">{money(it.line_total)}</span>
                  </div>
                  <div className="between">
                    <Badge tone={STEP_TONE[it.vendor_status]}>{STEP_LABEL[it.vendor_status] || it.vendor_status}</Badge>
                    {tab === 'todo' && !waiting && (
                      <div className="btn-row">
                        {it.vendor_status === 'new' && <button className="btn sm" onClick={() => step(it, 'preparing')}>Start preparing</button>}
                        {['new', 'preparing'].includes(it.vendor_status) && <button className="btn sm primary" onClick={() => step(it, 'ready')}>Mark ready</button>}
                        {it.vendor_status === 'ready' && <button className="btn sm ghost" onClick={() => step(it, 'preparing')}>Undo</button>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {tab === 'todo' && (o.cancel_requested
                ? <span className="tiny muted">Cancellation requested — the team will review it.</span>
                : <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => requestCancel(o.order_id)}>Can't do this order? Request cancellation</button>)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function VendorPayouts() {
  const v = useVendor()
  const { data, loading } = useData(() => v ? q(supabase.from('settlements').select('*').eq('vendor_id', v.id).order('created_at', { ascending: false })) : Promise.resolve([]), [v?.id])
  if (!v) return <Empty title="No vendor profile" />
  if (loading) return <Loading />
  return (
    <div className="stack">
      <PayoutRequest who="vendor" />
      <div className="page-head"><div><h1>Payouts</h1><p>Created when an order is completed. Pending → Eligible → Approved → Paid.</p></div></div>
      <Table rows={data} empty="No payouts yet" cols={[
        { key: 'order', label: 'Order', render: (s) => `#${s.order_number ?? '—'}` },
        { key: 'gross', label: 'Sale', num: true, render: (s) => money(s.gross) },
        { key: 'marketplace_fee', label: 'Fee', num: true, render: (s) => money(s.marketplace_fee) },
        { key: 'net_payable', label: 'You receive', num: true, render: (s) => <span className="strong">{money(s.net_payable)}</span> },
        { key: 'status', label: 'Status', render: (s) => <Badge status={s.status} /> },
        { key: 'paid_at', label: 'Paid', render: (s) => date(s.paid_at) },
      ]} />
    </div>
  )
}


export function VendorMarketing() {
  const v = useVendor()
  const toast = useToast()
  const [f, setF] = useState({ goal: '', promote: 'store', product_id: '', budget: '', audience: '', notes: '' })
  const set = (k) => (val) => setF((x) => ({ ...x, [k]: val }))
  const { data, loading, reload } = useData(async () => v ? {
    store: await q(supabase.rpc('vendor_store_stats')),
    products: await q(supabase.from('products').select('id,name,slug,status').eq('vendor_id', v.id).eq('status', 'published').order('name')),
    requests: await q(supabase.from('ad_requests').select('*').eq('vendor_id', v.id).order('created_at', { ascending: false })),
    campaigns: await q(supabase.rpc('vendor_campaigns')),
  } : null, [v?.id])
  if (!v) return <Empty title="No vendor profile" />
  if (loading || !data) return <Loading />
  const base = `${window.location.origin}/${data.store.slug}`
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('ad_requests').insert({ vendor_id: v.id, goal: f.goal, promote: f.promote, product_id: f.promote === 'product' ? f.product_id || null : null, budget: f.budget ? n(f.budget) : null, audience: f.audience || null, notes: f.notes || null })
    if (error) return toast(error.message, true)
    toast('Request sent to the ZaMarket marketing team'); setF({ goal: '', promote: 'store', product_id: '', budget: '', audience: '', notes: '' }); reload()
  }
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Share and advertise</h1><p>Bring your own customers with your links, or ask our team to run ads for you.</p></div></div>
      <div className="card stack-sm">
        <h3>Your links</h3>
        <p className="small muted">People who arrive through these links are credited to you, and you pay a {data.store.own_fee_pct}% fee on those sales instead of {data.store.normal_fee_pct}%.</p>
        <div className="tiny muted">Your store</div>
        <CopyLine text={base} />
        {data.products.map((p) => (<div key={p.id}><div className="tiny muted">{p.name}</div><CopyLine text={`${base}/${p.slug}`} /></div>))}
      </div>
      {data.campaigns.length > 0 && (
        <div className="card stack-sm">
          <h3>Campaigns we're running for you</h3>
          {data.campaigns.map((c) => (
            <div key={c.id} className="vendor-campaign">
              <div className="between"><strong>{c.name}</strong><Badge status={c.status === 'ended' ? 'expired' : c.status} /></div>
              <div className="vc-stats">
                <span><strong>{c.visits}</strong>visits</span>
                <span><strong>{c.leads}</strong>leads</span>
                <span><strong>{c.engaged}</strong>interested</span>
                <span><strong>{c.orders}</strong>orders</span>
                <span><strong>{money(c.sales)}</strong>your sales</span>
                {Number(c.spend) > 0 && <span><strong>{money(c.spend)}</strong>ad spend</span>}
              </div>
              <div className="tiny muted">Link: {window.location.host}/go/{c.code}</div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="card stack">
        <h3>Ask us to run ads</h3>
        <Field label="What do you want to achieve?"><Input value={f.goal} onChange={set('goal')} placeholder="e.g. More cake orders for December" required /></Field>
        <Field label="What should we promote?"><Segmented options={[['store', 'My whole store'], ['product', 'One product']]} value={f.promote} onChange={set('promote')} /></Field>
        {f.promote === 'product' && <Field label="Product"><Select value={f.product_id} onChange={set('product_id')} options={data.products.map((p) => [p.id, p.name])} placeholder="Choose product" required /></Field>}
        <div className="form-grid">
          <Field label="Budget (K, optional)"><Input money value={f.budget} onChange={set('budget')} /></Field>
          <Field label="Who are your customers? (optional)"><Input value={f.audience} onChange={set('audience')} placeholder="e.g. Parents in Lusaka" /></Field>
        </div>
        <Field label="Anything else? (optional)"><Textarea value={f.notes} onChange={set('notes')} rows={2} /></Field>
        <button className="btn primary">Send request</button>
      </form>
      <div className="stack-sm">
        <h3>Your requests</h3>
        {data.requests.length === 0 ? <p className="small muted">No requests yet.</p> : data.requests.map((r) => (
          <div key={r.id} className="card stack-sm">
            <div className="between"><span className="strong">{r.goal}</span><Badge status={{ new: 'pending', in_progress: 'processing', live: 'active', done: 'completed', declined: 'rejected' }[r.status]}>{title(r.status)}</Badge></div>
            <div className="tiny muted">Sent {date(r.created_at)}{r.budget ? ` · Budget ${money(r.budget)}` : ''}</div>
            {r.reply && <div className="small">ZaMarket: {r.reply}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}


// A vendor sets up their shopfront: logo, cover, tagline, what makes them good, hours.
export function VendorStore() {
  const v = useVendor()
  const toast = useToast()
  const { refresh } = useAuth()
  const [busy, setBusy] = useState('')
  const [f, setF] = useState(() => ({
    tagline: v?.tagline || '', about: v?.about || v?.description || '',
    logo_url: v?.logo_url || '', cover_url: v?.cover_url || '',
    highlights_text: (v?.highlights || []).join('\n'),
    hours_text: (v?.opening_hours || []).map((h) => `${h.label}: ${h.hours}`).join('\n'),
    colour: v?.theme?.colour || 'pine',
    style: v?.theme?.style || 'clean',
  }))
  if (!v) return <Empty title="No vendor profile" />
  const set = (k) => (val) => setF((x) => ({ ...x, [k]: val }))

  const save = async () => {
    const row = {
      tagline: f.tagline.trim() || null,
      about: f.about.trim() || null,
      logo_url: f.logo_url || null,
      cover_url: f.cover_url || null,
      theme: { colour: f.colour, style: f.style },
      highlights: f.highlights_text.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6),
      opening_hours: f.hours_text.split('\n').filter((l) => l.includes(':')).map((l) => {
        const [label, ...rest] = l.split(':')
        return { label: label.trim(), hours: rest.join(':').trim() }
      }),
    }
    const { error } = await supabase.from('vendors').update(row).eq('id', v.id)
    if (error) return toast(error.message, true)
    await refresh()
    toast('Your shop is updated')
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>My shopfront</h1><p>This is what a customer sees at {window.location.host}/{v.slug}. Fill it in properly and it looks like your own shop.</p></div>
        <div className="btn-row">
          <a className="btn" href={`/${v.slug}`} target="_blank" rel="noreferrer">View my shop</a>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>

      <section className="card form-grid">
        <div className="span photo-help">
          <strong>Photos are cleaned up for you</strong> — squared, centred and brightened. Use a clear logo and a wide photo of your work or your place.
          <ul>{PHOTO_TIPS.slice(0, 3).map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
        <Field label="Logo or profile picture">
          <div className="photo-pick">
            {f.logo_url ? <img src={f.logo_url} alt="" /> : <span className="photo-empty">No logo</span>}
            <PhotoUpload label="Choose" onDone={set('logo_url')} />
          </div>
        </Field>
        <Field label="Cover photo" hint="Wide photo across the top of your shop">
          <div className="photo-pick">
            {f.cover_url ? <img src={f.cover_url} alt="" /> : <span className="photo-empty">No cover</span>}
            <PhotoUpload label="Choose" onDone={set('cover_url')} />
          </div>
        </Field>
        <Field label="One line about your shop" hint="e.g. Home-baked cakes for birthdays and weddings" span>
          <Input value={f.tagline} onChange={set('tagline')} maxLength={90} />
        </Field>
        <Field label="What makes you good" hint="One per line, up to six. Shown as tags." span>
          <Textarea value={f.highlights_text} onChange={set('highlights_text')} rows={3} placeholder={'Baked fresh to order\nDelivery in Lusaka\nCustom designs welcome'} />
        </Field>
        <Field label="When you work" hint="One per line, e.g. Mon–Fri: 08:00 – 17:00" span>
          <Textarea value={f.hours_text} onChange={set('hours_text')} rows={3} placeholder={'Mon–Fri: 08:00 – 17:00\nSaturday: 09:00 – 13:00'} />
        </Field>
        <Field label="Your colour" hint="Used across your shop page" span>
          <div className="swatches">
            {THEMES.map((t) => (
              <button type="button" key={t.key} className={`swatch ${f.colour === t.key ? 'on' : ''}`} onClick={() => set('colour')(t.key)} title={t.name}>
                <span style={{ background: t.brand }} />
                <span className="tiny">{t.name}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Style" span>
          <div className="chips wrap">
            {STYLES.map((st) => <button type="button" key={st.key} className={`chip ${f.style === st.key ? 'on' : ''}`} onClick={() => set('style')(st.key)} title={st.note}>{st.name}</button>)}
          </div>
          <p className="tiny muted">{(STYLES.find((x) => x.key === f.style) || STYLES[0]).note}</p>
        </Field>
        <Field label="About your shop" hint="A short paragraph. Who you are, how long you have done this, what you care about." span>
          <Textarea value={f.about} onChange={set('about')} rows={4} />
        </Field>
        <div className="span"><button className="btn primary" onClick={save}>Save my shopfront</button></div>
      </section>
    </div>
  )
}


// How many people actually looked, and what came of it.
function VendorTraffic() {
  const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const to = new Date().toISOString().slice(0, 10)
  const { data, loading } = useData(() => q(supabase.rpc('vendor_traffic', { p_from: from, p_to: to })), [])
  if (loading || !data || data.hidden) return null
  const t = data
  return (
    <section className="card stack-sm">
      <h3>Who visited, last 30 days</h3>
      <div className="mini-stats">
        <div><b>{t.store_views}</b><span>opened your shop</span></div>
        <div><b>{t.product_views}</b><span>opened a product</span></div>
        <div><b>{t.orders}</b><span>ordered</span></div>
        <div><b>{money(t.sales)}</b><span>completed sales</span></div>
      </div>
      {(t.top || []).length > 0 && (
        <div className="mini-table">
          {t.top.map((x) => <div key={x.name} className="mini-row"><span className="grow">{x.name}</span><span><b>{x.views}</b> views</span></div>)}
        </div>
      )}
      <p className="tiny muted">Visits are counted per day, without recording anything about the person.</p>
    </section>
  )
}
