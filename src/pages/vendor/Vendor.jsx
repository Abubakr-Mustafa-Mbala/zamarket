import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, date, n, title } from '../../lib/format'
import { Badge, Table, Loading, Stat, Empty, useToast, Stars } from '../../components/ui'
import { ProductEditor } from '../admin/Products'

const useVendor = () => useAuth().profile?.partner || null

export function VendorHome() {
  const v = useVendor()
  const { settings } = useAuth()
  const { data, loading } = useData(async () => v ? {
    items: await q(supabase.from('order_items').select('quantity,line_total,order:orders(status)').eq('vendor_id', v.id)),
    setts: await q(supabase.from('settlements').select('marketplace_fee,net_payable,status').eq('vendor_id', v.id)),
    products: await q(supabase.from('products').select('status').eq('vendor_id', v.id)),
    reviews: await q(supabase.from('reviews').select('vendor_rating,comment,customer_name,created_at').eq('vendor_id', v.id).order('created_at', { ascending: false }).limit(5)),
  } : null, [v?.id])
  if (!v) return <Empty title="No vendor profile">Your account isn't linked to an approved vendor application.</Empty>
  if (loading || !data) return <Loading />
  const live = data.items.filter((i) => !['cancelled', 'refunded', 'returned'].includes(i.order?.status))
  const returns = data.items.filter((i) => ['refunded', 'returned'].includes(i.order?.status)).length
  const open = data.setts.filter((s) => ['pending', 'eligible', 'approved'].includes(s.status)).reduce((t, s) => t + n(s.net_payable), 0)
  const paid = data.setts.filter((s) => s.status === 'paid').reduce((t, s) => t + n(s.net_payable), 0)
  const fees = data.setts.filter((s) => s.status !== 'cancelled').reduce((t, s) => t + n(s.marketplace_fee), 0)
  const rating = data.reviews.length ? data.reviews.reduce((t, r) => t + n(r.vendor_rating), 0) / data.reviews.length : null
  return (
    <div className="stack">
      <div className="page-head"><div><h1>{v.business_name}</h1><p>Marketplace fee: {v.fee_pct_override ?? settings.marketplace_fee_pct}% per sale</p></div></div>
      <div className="grid-4">
        <Stat hero label="Sales" value={money(live.reduce((t, i) => t + n(i.line_total), 0))} sub={`${live.reduce((t, i) => t + i.quantity, 0)} units`} />
        <Stat label="Payouts coming" value={money(open)} tone="copper" />
        <Stat label="Paid to you" value={money(paid)} />
        <Stat label="Marketplace fees" value={money(fees)} sub={`${returns} returns / refunds`} />
      </div>
      <div className="grid-2 tight">
        <div className="card"><h3 className="mb">Products</h3>{['published', 'submitted', 'draft', 'rejected'].map((s) => <div key={s} className="between small"><Badge status={s} /><span>{data.products.filter((p) => p.status === s).length}</span></div>)}</div>
        <div className="card stack-sm"><div className="between"><h3>Reviews</h3>{rating && <Stars n={rating} />}</div>{data.reviews.length === 0 ? <p className="small muted">No reviews yet.</p> : data.reviews.map((r, i) => <div key={i} className="small"><Stars n={r.vendor_rating} /> {r.comment || <span className="muted">No comment</span>}</div>)}</div>
      </div>
    </div>
  )
}

export function VendorProducts() {
  const v = useVendor()
  const [edit, setEdit] = useState(null)
  const { data, loading, reload } = useData(() => v ? q(supabase.from('products').select('*').eq('vendor_id', v.id).order('created_at', { ascending: false })) : Promise.resolve([]), [v?.id])
  if (!v) return <Empty title="No vendor profile" />
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>My products</h1><p>Add products and send them for review. We publish them once approved.</p></div>
        <button className="btn primary" onClick={() => setEdit({ status: 'draft', owner_type: 'vendor', benefits: [], images: [], faqs: [] })}>Add product</button>
      </div>
      {loading ? <Loading /> : (
        <Table rows={data} onRow={(p) => ['draft', 'submitted', 'rejected', 'out_of_stock'].includes(p.status) ? setEdit(p) : null} empty="No products yet" cols={[
          { key: 'name', label: 'Product', render: (p) => <div><div className="strong">{p.name}</div>{p.status === 'rejected' && p.rejection_reason && <div className="tiny bad">{p.rejection_reason}</div>}</div> },
          { key: 'status', label: 'Status', render: (p) => <Badge status={p.status} /> },
          { key: 'price', label: 'Price', num: true, render: (p) => money(p.price) },
        ]} />
      )}
      <p className="tiny muted">Published products can only be changed by the marketplace team, so prices customers see stay consistent. Message us to update one.</p>
      {edit && <ProductEditor product={edit} vendorMode={v.id} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
    </div>
  )
}

export function VendorOrders() {
  const v = useVendor()
  const toast = useToast()
  const { data, loading, reload } = useData(() => v ? q(supabase.from('order_items').select('id,quantity,line_total,product:products(name),order:orders(id,order_number,status,created_at,area,district:districts(name))').eq('vendor_id', v.id).order('id', { ascending: false }).limit(200)) : Promise.resolve([]), [v?.id])
  const requestCancel = async (orderId) => {
    const reason = window.prompt('Why should this order be cancelled?')
    if (!reason) return
    const { error } = await supabase.rpc('set_order_status', { p_order: orderId, p_status: 'cancelled', p_reason: reason })
    if (error) return toast(error.message, true)
    toast('Cancellation request sent to the marketplace team'); reload()
  }
  if (!v) return <Empty title="No vendor profile" />
  if (loading) return <Loading />
  const rows = (data || []).sort((a, b) => (b.order?.created_at || '').localeCompare(a.order?.created_at || ''))
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Orders</h1><p>Orders containing your products. The marketplace team handles customer contact, payment and delivery.</p></div></div>
      <Table rows={rows} empty="No orders yet" cols={[
        { key: 'order', label: 'Order', render: (i) => <div><div className="strong">#{i.order?.order_number}</div><div className="tiny muted">{date(i.order?.created_at)}</div></div> },
        { key: 'product', label: 'Item', render: (i) => `${i.quantity} × ${i.product?.name}` },
        { key: 'where', label: 'Area', render: (i) => [i.order?.area, i.order?.district?.name].filter(Boolean).join(', ') },
        { key: 'status', label: 'Status', render: (i) => <Badge status={i.order?.status} /> },
        { key: 'line_total', label: 'Value', num: true, render: (i) => money(i.line_total) },
        { key: 'x', label: '', render: (i) => ['pending', 'confirmed', 'payment_pending', 'paid', 'processing'].includes(i.order?.status) ? <button className="btn sm ghost" onClick={() => requestCancel(i.order.id)}>Request cancel</button> : null },
      ]} />
    </div>
  )
}

export function VendorPayouts() {
  const v = useVendor()
  const { data, loading } = useData(() => v ? q(supabase.from('settlements').select('*,order:orders(order_number)').eq('vendor_id', v.id).order('created_at', { ascending: false })) : Promise.resolve([]), [v?.id])
  if (!v) return <Empty title="No vendor profile" />
  if (loading) return <Loading />
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Payouts</h1><p>Created when an order is completed. Pending → Eligible → Approved → Paid.</p></div></div>
      <Table rows={data} empty="No payouts yet" cols={[
        { key: 'order', label: 'Order', render: (s) => `#${s.order?.order_number}` },
        { key: 'gross', label: 'Sale', num: true, render: (s) => money(s.gross) },
        { key: 'marketplace_fee', label: 'Fee', num: true, render: (s) => money(s.marketplace_fee) },
        { key: 'net_payable', label: 'You receive', num: true, render: (s) => <span className="strong">{money(s.net_payable)}</span> },
        { key: 'status', label: 'Status', render: (s) => <Badge status={s.status} /> },
        { key: 'paid_at', label: 'Paid', render: (s) => date(s.paid_at) },
      ]} />
    </div>
  )
}
