import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, datetime, n, title } from '../../lib/format'
import { Loading, Segmented, useToast } from '../../components/ui'
import { btSupported, receiptBytes, printBytes } from '../../lib/thermal'
import QrCode from '../../components/QrCode'

export default function Receipt() {
  const { id } = useParams()
  const { settings } = useAuth()
  const [size, setSize] = useState(() => localStorage.getItem('zm-receipt-size') || '80')
  const [printing, setPrinting] = useState(false)
  const toast = useToast()
  const { data: o, loading } = useData(() => q(
    supabase.from('orders').select('*,customer:customers(full_name,phone),district:districts(name),province:provinces(name),reseller:resellers(full_name),items:order_items(quantity,unit_price,line_total,choices,note,product:products(name,normal_price,price),offer:offers(name)),payments(amount,method,reference,created_at)').eq('id', id).single()
  ), [id])
  if (loading || !o) return <Loading />

  const paid = o.payments.reduce((t, p) => t + n(p.amount), 0)
  const balance = Math.max(0, n(o.total) - paid)
  const savings = o.items.reduce((t, i) => t + Math.max(0, n(i.product?.normal_price || i.product?.price) * i.quantity - n(i.line_total)), 0)
  const biz = settings.business_name || 'ZaMarket'
  const pick = (v) => { setSize(v); localStorage.setItem('zm-receipt-size', v) }
  const bluetooth = async () => {
    setPrinting(true)
    try {
      const data = receiptBytes(o, {
        width: size === '58' ? 32 : 48,
        business: settings.business_name || 'ZaMarket',
        phone: settings.business_phone,
        footer: settings.receipt_footer || 'Thank you!',
        reviewLink: `${window.location.host}/review`,
      })
      const id = await printBytes(data, localStorage.getItem('zm-printer'))
      localStorage.setItem('zm-printer', id)
      toast('Sent to the printer')
    } catch (e) {
      if (e.name !== 'NotFoundError') toast(e.message, true)
    } finally { setPrinting(false) }
  }
  const forget = () => { localStorage.removeItem('zm-printer'); toast('Printer forgotten. You will pick it again next time.') }

  return (
    <div className={`receipt-page size-${size}`}>
      <div className="receipt-tools no-print">
        <Link to={`/admin/orders/${id}`} className="btn ghost sm">Back</Link>
        <Segmented options={[['58', '58mm'], ['80', '80mm'], ['a4', 'A4']]} value={size} onChange={pick} />
        {btSupported() && <button className="btn buy sm" onClick={bluetooth} disabled={printing}>{printing ? 'Printing…' : 'Bluetooth printer'}</button>}
        <button className="btn primary sm" onClick={() => window.print()}>Print</button>
      </div>

      {btSupported() && localStorage.getItem('zm-printer') && <div className="no-print tiny muted" style={{ textAlign: 'center', marginBottom: 8 }}>Using your saved printer. <button className="btn ghost sm" onClick={forget}>Use a different one</button></div>}
      {!btSupported() && <div className="no-print tiny muted" style={{ textAlign: 'center', marginBottom: 8 }}>For your Bluetooth receipt printer, open this page in Chrome on Android or on a PC.</div>}
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
        {o.needed_by && <div className="r-row r-strong"><span>Needed by</span><span>{new Date(o.needed_by + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>}
        <div className="r-rule" />
        <div className="r-strong">{o.customer?.full_name}</div>
        <div>{o.customer?.phone}</div>
        <div>{[o.address, o.area, o.district?.name, o.province?.name].filter(Boolean).join(', ')}</div>
        <div className="r-rule" />
        {o.items.map((i, k) => (
          <div key={k} className="r-item">
            <div className="r-row"><span className="r-strong">{i.product?.name}</span><span>{money(i.line_total)}</span></div>
            <div className="r-sub">{i.quantity} × {money(i.unit_price)}{i.offer ? ` · ${i.offer.name}` : ''}</div>
            {i.choices && Object.keys(i.choices).length > 0 && <div className="r-sub">{Object.entries(i.choices).map(([k, v]) => `${k}: ${v}`).join(', ')}</div>}
            {i.note && <div className="r-sub">"{i.note}"</div>}
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
        <div className="r-qr">
          <QrCode value={`${window.location.origin}/order/${o.order_number}${o.verify_code ? `?v=${o.verify_code}` : ''}`} size={104} />
          <span>Scan to view this order</span>
          <strong>ZM-{String(o.order_number).padStart(6, '0')}</strong>
        </div>
        <div className="r-center r-foot">
          <div>{settings.receipt_footer || 'Thank you for shopping with us!'}</div>
          <div>Rate your order: {window.location.host}/review</div>
          <div>Order #{o.order_number} · phone {o.customer?.phone}</div>
        </div>
      </div>
    </div>
  )
}
