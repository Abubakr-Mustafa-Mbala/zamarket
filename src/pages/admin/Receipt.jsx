import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, datetime, n, title } from '../../lib/format'
import { Loading, Segmented } from '../../components/ui'

export default function Receipt() {
  const { id } = useParams()
  const { settings } = useAuth()
  const [size, setSize] = useState(() => localStorage.getItem('zm-receipt-size') || '80')
  const { data: o, loading } = useData(() => q(
    supabase.from('orders').select('*,customer:customers(full_name,phone),district:districts(name),province:provinces(name),reseller:resellers(full_name),items:order_items(quantity,unit_price,line_total,product:products(name,normal_price,price),offer:offers(name)),payments(amount,method,reference,created_at)').eq('id', id).single()
  ), [id])
  if (loading || !o) return <Loading />

  const paid = o.payments.reduce((t, p) => t + n(p.amount), 0)
  const balance = Math.max(0, n(o.total) - paid)
  const savings = o.items.reduce((t, i) => t + Math.max(0, n(i.product?.normal_price || i.product?.price) * i.quantity - n(i.line_total)), 0)
  const biz = settings.business_name || 'ZaMarket'
  const pick = (v) => { setSize(v); localStorage.setItem('zm-receipt-size', v) }

  return (
    <div className={`receipt-page size-${size}`}>
      <div className="receipt-tools no-print">
        <Link to={`/admin/orders/${id}`} className="btn ghost sm">Back</Link>
        <Segmented options={[['58', '58mm'], ['80', '80mm'], ['a4', 'A4']]} value={size} onChange={pick} />
        <button className="btn primary sm" onClick={() => window.print()}>Print</button>
      </div>

      <div className="receipt">
        <div className="r-center">
          <div className="r-biz">{biz}</div>
          {settings.business_phone && <div>{settings.business_phone}</div>}
          <div className="r-title">{o.payment_status === 'paid' || balance === 0 ? 'RECEIPT' : 'DELIVERY NOTE'}</div>
        </div>
        <div className="r-rule" />
        <div className="r-row"><span>Order</span><span>#{o.order_number}</span></div>
        <div className="r-row"><span>Date</span><span>{datetime(o.created_at)}</span></div>
        <div className="r-row"><span>Printed</span><span>{datetime(new Date())}</span></div>
        <div className="r-rule" />
        <div className="r-strong">{o.customer?.full_name}</div>
        <div>{o.customer?.phone}</div>
        <div>{[o.address, o.area, o.district?.name, o.province?.name].filter(Boolean).join(', ')}</div>
        <div className="r-rule" />
        {o.items.map((i, k) => (
          <div key={k} className="r-item">
            <div className="r-row"><span className="r-strong">{i.product?.name}</span><span>{money(i.line_total)}</span></div>
            <div className="r-sub">{i.quantity} × {money(i.unit_price)}{i.offer ? ` · ${i.offer.name}` : ''}</div>
          </div>
        ))}
        <div className="r-rule" />
        <div className="r-row"><span>Subtotal</span><span>{money(o.subtotal)}</span></div>
        <div className="r-row"><span>Delivery</span><span>{n(o.delivery_fee) === 0 ? 'Free' : money(o.delivery_fee)}</span></div>
        <div className="r-row r-total"><span>TOTAL</span><span>{money(o.total)}</span></div>
        {savings > 0 && <div className="r-row"><span>You saved</span><span>{money(savings)}</span></div>}
        <div className="r-rule" />
        {o.payments.map((p, k) => (
          <div key={k} className="r-row"><span>Paid · {title(p.method)}{p.reference ? ` ${p.reference}` : ''}</span><span>{money(p.amount)}</span></div>
        ))}
        <div className="r-row r-total"><span>{balance > 0 ? 'BALANCE DUE' : 'PAID IN FULL'}</span><span>{balance > 0 ? money(balance) : '✓'}</span></div>
        {balance > 0 && (
          <>
            <div className="r-rule" />
            <div className="r-sign"><span>Cash received</span><span className="r-line" /></div>
          </>
        )}
        <div className="r-sign"><span>Received by (customer)</span><span className="r-line" /></div>
        <div className="r-sign"><span>Delivered by</span><span className="r-line" /></div>
        <div className="r-rule" />
        <div className="r-center r-foot">
          <div>{settings.receipt_footer || 'Thank you for shopping with us!'}</div>
          <div>Rate your order: {window.location.host}/review</div>
          <div>Order #{o.order_number} · phone {o.customer?.phone}</div>
        </div>
      </div>
    </div>
  )
}
