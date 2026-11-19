import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Modal, useToast } from './ui'
import { track } from '../lib/traffic'

// "Make a request" on a seller's store: lunch on Saturday or Sunday too, an
// event, a big order, something not in the shop. It reaches the ZaMarket
// team as a lead (the seller attached), and the team replies on WhatsApp or
// by phone. No payment, no promise: we reply with what can be done.
const KINDS = [
  ['extra_day', 'Extra lunch day', 'e.g. Saturday lunch for 6 people at our office'],
  ['event', 'Event or group order', 'e.g. 40 lunches for a workshop on Friday'],
  ['special', 'Special order', 'e.g. a birthday cake with our logo'],
  ['other', 'Something else', 'Tell us what you need'],
]

export function StoreRequestForm({ store, kind: startKind = 'extra_day', onClose }) {
  const toast = useToast()
  const [f, setF] = useState({ kind: startKind, what: '', when: '', name: '', phone: '', reply: 'whatsapp' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const hint = (KINDS.find((k) => k[0] === f.kind) || KINDS[3])[2]
  const send = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc('submit_store_request', { payload: { store: store.slug, ...f } })
    setBusy(false)
    if (error) return toast(/function .* does not exist|Could not find the function/i.test(error.message) ? 'Requests are not switched on yet.' : error.message, true)
    track('request', { store: store.id })
    setDone(data)
  }
  return (
    <Modal title={done ? 'We have your request' : `Ask ${store.business_name || 'the shop'}`} onClose={onClose}>
      {done ? (
        <div className="stack center">
          <p>Thank you, {f.name.split(' ')[0]}. We will reply on {f.reply === 'call' ? 'a call to' : 'WhatsApp at'} {f.phone} with what can be done.</p>
          <div className="voucher" style={{ fontSize: '1.2rem' }}>Ref {done.reference}</div>
          <p className="tiny muted">This is a request, not an order. Nothing is booked or paid until we agree it with you.</p>
          <button type="button" className="btn primary" onClick={onClose}>Done</button>
        </div>
      ) : (
        <form className="stack sr-form" onSubmit={send}>
          <div className="sr-kinds">{KINDS.map(([k, l]) => <button key={k} type="button" className={f.kind === k ? 'on' : ''} onClick={() => setF((x) => ({ ...x, kind: k }))}>{l}</button>)}</div>
          <label><span>What would you like?</span><textarea rows={3} maxLength={600} required value={f.what} onChange={set('what')} placeholder={hint} /></label>
          <label><span>When? (optional)</span><input maxLength={80} value={f.when} onChange={set('when')} placeholder="e.g. Saturday 29 November, lunchtime" /></label>
          <div className="sr-two">
            <label><span>Your name</span><input required maxLength={80} value={f.name} onChange={set('name')} autoComplete="name" /></label>
            <label><span>Phone</span><input required inputMode="tel" maxLength={20} value={f.phone} onChange={set('phone')} placeholder="0977 123 456" autoComplete="tel" /></label>
          </div>
          <div className="sr-kinds sr-reply"><span className="small muted">Reply by</span>{[['whatsapp', 'WhatsApp'], ['call', 'Phone call']].map(([k, l]) => <button key={k} type="button" className={f.reply === k ? 'on' : ''} onClick={() => setF((x) => ({ ...x, reply: k }))}>{l}</button>)}</div>
          <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
          <p className="tiny muted">A request is not an order. We reply with what can be done and the price, and nothing is booked until you agree.</p>
        </form>
      )}
    </Modal>
  )
}
