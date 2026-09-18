import { useMemo, useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, datetime, date, n, title } from '../../lib/format'
import { Badge, Loading, Modal, Field, Input, Textarea, useToast, Empty, Stat } from '../../components/ui'

const TABS = [['open', 'Open'], ['agreed', 'Agreed'], ['closed', 'Closed'], ['lost', 'Lost']]
const STATUS_WORD = { enquiry: 'New enquiry', negotiating: 'Talking', agreed: 'Price agreed', closed: 'Sold', lost: 'Lost' }
const TONE = { enquiry: 'warn', negotiating: 'info', agreed: 'ok', closed: 'ok', lost: 'bad' }
const wa = (phone) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^0/, '260')}`

export default function Deals() {
  const [tab, setTab] = useState('open')
  const [open, setOpen] = useState(null)
  const { data, loading, reload } = useData(() => q(
    supabase.from('deals').select('*,product:products(name,slug),package:product_packages(name),vendor:vendors(business_name),reseller:resellers(full_name,code)').order('created_at', { ascending: false }).limit(300)
  ), [])
  const rows = (data || []).filter((d) => (tab === 'open' ? ['enquiry', 'negotiating'].includes(d.status) : d.status === tab))
  const counts = useMemo(() => {
    const c = { open: 0, agreed: 0, closed: 0, lost: 0 }
    for (const d of data || []) { if (['enquiry', 'negotiating'].includes(d.status)) c.open++; else c[d.status] = (c[d.status] || 0) + 1 }
    return c
  }, [data])
  const sold = (data || []).filter((d) => d.status === 'closed')
  const feesOwed = sold.filter((d) => d.fee_status !== 'received').reduce((t, d) => t + n(d.marketplace_amount), 0)

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Enquiries and deals</h1>
          <p>For vehicles and anything sold by talking to the customer: an enquiry comes in, you agree a price, then record the sale.</p>
        </div>
      </div>

      <div className="grid-4">
        <Stat label="Waiting for you" value={counts.open} tone={counts.open ? 'warn' : ''} />
        <Stat label="Price agreed" value={counts.agreed} />
        <Stat label="Sold" value={counts.closed} sub={money(sold.reduce((t, d) => t + n(d.final_price), 0))} />
        <Stat label="Our fees to collect" value={money(feesOwed)} tone={feesOwed ? 'copper' : ''} />
      </div>

      <div className="tabs">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} ({counts[k] || 0})</button>)}
      </div>

      {loading ? <Loading /> : rows.length === 0 ? (
        <Empty title={tab === 'open' ? 'No enquiries waiting' : `Nothing ${tab}`}>
          Enquiries arrive when a customer taps Enquire or Make an offer on an offering set to "enquire first" or "open to offers".
        </Empty>
      ) : (
        <div className="lead-list">
          {rows.map((d) => (
            <button key={d.id} type="button" className="lead-row" onClick={() => setOpen(d)}>
              <span className="lr-main">
                <span className="lr-name">D{d.deal_number} · {d.product?.name} <Badge tone={TONE[d.status]}>{STATUS_WORD[d.status]}</Badge></span>
                <span className="lr-interest">{d.message || 'No message'}</span>
                <span className="lr-meta">
                  <span>{d.customer_name}</span>
                  {d.vendor && <span>for {d.vendor.business_name}</span>}
                  {d.reseller && <span>via {d.reseller.full_name}</span>}
                  <span>{date(d.created_at)}</span>
                </span>
              </span>
              <span className="lr-side">
                <span className="lr-phone">{money(d.final_price ?? d.advertised_price)}</span>
                {d.final_price && d.status === 'closed' && <span className="tiny muted">asked {money(d.advertised_price)}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && <DealDrawer deal={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  )
}

function DealDrawer({ deal: initial, onClose, onChanged }) {
  const toast = useToast()
  const { isStaff, settings } = useAuth()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [evidence, setEvidence] = useState('')
  const [busy, setBusy] = useState(false)
  const { data, reload } = useData(async () => ({
    deal: await q(supabase.from('deals').select('*,product:products(name),package:product_packages(name),vendor:vendors(business_name),reseller:resellers(full_name,code)').eq('id', initial.id).single()),
    events: await q(supabase.from('deal_events').select('*,user:profiles(full_name)').eq('deal_id', initial.id).order('created_at', { ascending: false })),
  }), [initial.id])
  const d = data?.deal || initial
  const closed = d.status === 'closed'
  const lost = d.status === 'lost'

  const act = async (action, extra = {}) => {
    setBusy(true)
    const { error } = await supabase.rpc('deal_action', {
      p_deal: d.id, p_action: action,
      p_amount: extra.amount !== undefined ? extra.amount : (amount === '' ? null : n(amount)),
      p_note: note || null, p_evidence: extra.evidence || evidence || null,
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast({ offer: 'Their offer recorded', counter: 'Your price sent', agree: 'Price agreed', close: 'Sale recorded', lost: 'Marked lost', reopen: 'Reopened', note: 'Note saved', fee_received: 'Fee marked received' }[action] || 'Saved')
    setAmount(''); setNote(''); setEvidence('')
    reload(); onChanged()
  }

  const rate = d.commission_type === 'flat' ? money(d.commission_value) : `${n(d.commission_value)}%`
  const wouldEarn = (price) => (d.commission_type === 'flat' ? n(d.commission_value) : (n(price) * n(d.commission_value)) / 100)

  return (
    <Modal title={`D${d.deal_number} · ${d.product?.name || 'Deal'}`} onClose={onClose} wide>
      <div className="stack">
        <div className="lead-head">
          <div>
            <div className="row"><Badge tone={TONE[d.status]}>{STATUS_WORD[d.status]}</Badge>{d.package && <span className="small muted">{d.package.name}</span>}</div>
            <div className="lead-phone">{d.customer_name} · {d.customer_phone}</div>
          </div>
          <div className="btn-row">
            <a className="btn primary" href={`tel:${d.customer_phone}`}>Call</a>
            <a className="btn buy" href={wa(d.customer_phone)} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </div>

        <dl className="kv">
          <dt>Asking price</dt><dd>{money(d.advertised_price)}</dd>
          {d.final_price != null && <><dt>{closed ? 'Sold for' : 'Agreed at'}</dt><dd className="strong">{money(d.final_price)}</dd></>}
          {d.message && <><dt>Their message</dt><dd>{d.message}</dd></>}
          {d.vendor && <><dt>Vendor</dt><dd>{d.vendor.business_name}</dd></>}
          {d.reseller && <><dt>Brought by</dt><dd>{d.reseller.full_name} ({d.reseller.code}) · {rate}</dd></>}
          {closed && d.reseller && <><dt>Reseller earns</dt><dd className="copper strong">{money(d.reseller_amount)}</dd></>}
          {closed && <><dt>Our fee</dt><dd className="strong">{money(d.marketplace_amount)} {d.fee_status === 'received' ? <span className="badge ok">Received</span> : <span className="badge warn">To collect</span>}</dd></>}
          {closed && d.evidence && <><dt>Verified by</dt><dd>{d.evidence}</dd></>}
          {lost && d.lost_reason && <><dt>Lost because</dt><dd>{d.lost_reason}</dd></>}
        </dl>

        {!closed && !lost && (
          <div className="log-box stack-sm">
            <div className="form-grid">
              <Field label="Amount" hint={d.reseller ? `At this price the reseller earns ${money(wouldEarn(amount || d.advertised_price))}` : 'Price being discussed'}>
                <Input money value={amount} onChange={setAmount} placeholder={String(d.advertised_price)} />
              </Field>
              <Field label="Note (optional)"><Input value={note} onChange={setNote} placeholder="What was said" /></Field>
            </div>
            <div className="btn-row">
              <button className="btn" disabled={busy} onClick={() => act('offer')}>They offered this</button>
              <button className="btn" disabled={busy} onClick={() => act('counter')}>We offered this</button>
              <button className="btn primary" disabled={busy} onClick={() => act('agree')}>Price agreed</button>
              <button className="btn sm ghost" disabled={busy} onClick={() => act('note', { amount: null })}>Just save a note</button>
              <button className="btn sm danger" disabled={busy} onClick={() => act('lost', { amount: null })}>Lost</button>
            </div>
          </div>
        )}

        {d.status === 'agreed' && isStaff && (
          <div className="card flat stack-sm">
            <h3>Record the sale</h3>
            <p className="small muted">Do this once the customer has actually paid and received it. Commission is worked out from the final price, not the asking price.</p>
            <div className="form-grid">
              <Field label="Final price"><Input money value={amount} onChange={setAmount} placeholder={String(d.final_price ?? d.advertised_price)} /></Field>
              <Field label="How was it verified?" hint="Receipt number, bank reference, or who handed it over"><Input value={evidence} onChange={setEvidence} /></Field>
            </div>
            {d.reseller && <p className="small">Reseller {d.reseller.full_name} earns <strong>{money(wouldEarn(amount || d.final_price))}</strong> at that price.</p>}
            <button className="btn buy" disabled={busy} onClick={() => act('close')}>Record the sale</button>
          </div>
        )}

        {closed && isStaff && d.fee_status !== 'received' && (
          <div className="card flat between">
            <span className="small">Our fee of {money(d.marketplace_amount)} is still to collect.</span>
            <button className="btn sm primary" disabled={busy} onClick={() => act('fee_received', { amount: null })}>Fee received</button>
          </div>
        )}
        {lost && isStaff && <button className="btn" disabled={busy} onClick={() => act('reopen', { amount: null })}>Reopen this deal</button>}

        <div>
          <h3 className="mb">History</h3>
          {(data?.events || []).length === 0 ? <p className="small muted">Nothing yet.</p> : (
            <ol className="history">
              {data.events.map((e) => (
                <li key={e.id}>
                  <span className="h-when">{datetime(e.created_at)}</span>
                  <span className="h-what">
                    <strong>{{ enquiry: 'Enquiry', offer: 'Customer offered', counter: 'We offered', agreed: 'Price agreed', closed: 'Sale recorded', lost: 'Lost', reopened: 'Reopened', note: 'Note' }[e.kind] || title(e.kind)}</strong>
                    {e.amount != null && <> · {money(e.amount)}</>}
                    {e.user?.full_name && <span className="muted"> · {e.user.full_name.split(' ')[0]}</span>}
                    {e.note && <span className="h-note">{e.note}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  )
}
