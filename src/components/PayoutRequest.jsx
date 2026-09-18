import { useState } from 'react'
import { supabase, q } from '../lib/supabase'
import { useData } from '../lib/useData'
import { money } from '../lib/format'
import { Modal, Field, Input, Select, useToast, Badge, Loading } from './ui'

const METHODS = [['airtel', 'Airtel Money'], ['mtn', 'MTN Money'], ['zamtel', 'Zamtel Kwacha'], ['bank', 'Bank transfer'], ['cash', 'Cash']]

// Resellers and vendors ask to be paid instead of waiting and wondering.
export default function PayoutRequest({ who = 'reseller' }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ amount: '', method: 'airtel', details: '' })
  const [busy, setBusy] = useState(false)
  const { data, loading, reload } = useData(async () => ({
    balance: await q(supabase.rpc('payout_balance')),
    history: await q(supabase.from('payouts').select('*').order('requested_at', { ascending: false }).limit(10)),
  }), [])
  if (loading || !data) return <Loading />
  const b = data.balance

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.rpc('request_payout', { p_amount: Number(f.amount), p_method: f.method, p_details: f.details })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast('Request sent. We will pay you and mark it here.')
    setOpen(false); setF({ ...f, amount: '' }); reload()
  }

  return (
    <section className="card stack-sm">
      <div className="between">
        <h3>Getting paid</h3>
        {Number(b.ready) > 0 && <button className="btn buy" onClick={() => { setF({ ...f, amount: String(b.ready) }); setOpen(true) }}>Ask to be paid</button>}
      </div>
      <div className="mini-stats">
        <div><b>{money(b.ready)}</b><span>ready to request</span></div>
        <div><b>{money(b.requested)}</b><span>requested, being paid</span></div>
        <div><b>{money(b.paid_before)}</b><span>paid to you so far</span></div>
      </div>
      {Number(b.ready) <= 0 && <p className="small muted">Money appears here once an order is complete and past its check. The smallest payout is {money(b.minimum)}.</p>}

      {data.history.length > 0 && (
        <div className="mini-table">
          {data.history.map((p) => (
            <div key={p.id} className="mini-row">
              <span className="grow"><strong>{money(p.amount)}</strong><span className="tiny muted">{new Date(p.requested_at).toLocaleDateString('en-GB')} · {(METHODS.find((m) => m[0] === p.method) || [, p.method])[1]}</span></span>
              <Badge status={{ requested: 'pending', approved: 'approved', paid: 'paid', rejected: 'rejected' }[p.status]}>
                {{ requested: 'Waiting', approved: 'Approved', paid: 'Paid', rejected: 'Not approved' }[p.status]}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal title="Ask to be paid" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="stack">
            <p className="small muted">You can request up to {money(b.ready)} right now. Smallest payout is {money(b.minimum)}.</p>
            <Field label="How much"><Input money value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required /></Field>
            <Field label="Pay me by"><Select value={f.method} onChange={(v) => setF({ ...f, method: v })} options={METHODS} /></Field>
            <Field label={f.method === 'bank' ? 'Bank, branch and account number' : 'Number to send to'}><Input value={f.details} onChange={(v) => setF({ ...f, details: v })} required /></Field>
            <button className="btn primary block" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
          </form>
        </Modal>
      )}
    </section>
  )
}
