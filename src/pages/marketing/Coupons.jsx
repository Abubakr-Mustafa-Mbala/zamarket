import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { money, date } from '../../lib/format'
import { Loading, Problem, Modal, Field, Input, Select, Textarea, Badge, useToast, Stat } from '../../components/ui'

const blank = {
  code: '', description: '', kind: 'pct', value: '', funded_by: 'marketplace',
  min_order: '', max_discount: '', expires_at: '', usage_limit: '', status: 'active',
}

// Who pays for a discount is the whole question, so the form asks it first and
// shows the consequence in money before anything is saved.
function Editor({ row, vendors, onClose, onSaved }) {
  const toast = useToast()
  const { profile } = useAuth()
  const isVendor = profile?.role === 'vendor'
  const [f, setF] = useState({ ...blank, ...row, funded_by: isVendor ? 'vendor' : (row?.funded_by || 'marketplace') })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))

  const save = async () => {
    if (!f.code.trim()) return toast('Give it a code people can type', true)
    if (!(Number(f.value) > 0)) return toast('How much is the discount?', true)
    setBusy(true)
    const { error } = await supabase.rpc('save_coupon', {
      payload: {
        ...(row?.id ? { id: row.id } : {}),
        code: f.code.trim().toUpperCase(), description: f.description || null,
        kind: f.kind, value: Number(f.value), funded_by: f.funded_by,
        vendor_id: f.vendor_id || null,
        min_order: Number(f.min_order || 0),
        max_discount: f.max_discount === '' ? '' : String(Number(f.max_discount)),
        expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : '',
        usage_limit: f.usage_limit === '' ? '' : String(Number(f.usage_limit)),
        status: f.status,
      },
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast('Coupon saved'); onSaved()
  }

  // A worked example on a K125 order, because percentages hide the damage.
  const example = 125
  const disc = f.kind === 'pct' ? Math.round(example * Number(f.value || 0)) / 100 : Number(f.value || 0)
  const capped = Math.min(disc, example)

  return (
    <Modal title={row?.id ? `Edit ${row.code}` : 'New coupon'} onClose={onClose}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Code" hint="What the customer types. Short and easy to say aloud.">
            <Input value={f.code} onChange={(v) => set('code')(v.toUpperCase())} placeholder="LAUNCH20" />
          </Field>
          <Field label="Discount">
            <div className="row">
              <Input type="number" value={f.value} onChange={set('value')} />
              <Select value={f.kind} onChange={set('kind')} options={[['pct', '% off'], ['flat', 'K off']]} />
            </div>
          </Field>

          {!isVendor && (
            <Field label="Who is paying for it?" span
              hint="This decides whose money the discount comes out of when the order settles.">
              <Select value={f.funded_by} onChange={set('funded_by')} options={[
                ['marketplace', 'ZaMarket — the seller is still paid in full'],
                ['vendor', 'The seller — it comes out of what they receive'],
              ]} />
            </Field>
          )}
          {f.funded_by === 'vendor' && !isVendor && (
            <Field label="Which seller" span>
              <Select value={f.vendor_id || ''} onChange={set('vendor_id')} placeholder="Choose a seller"
                options={(vendors || []).map((v) => [v.id, v.business_name])} />
            </Field>
          )}

          <Field label="Smallest order it works on (K)"><Input type="number" value={f.min_order} onChange={set('min_order')} /></Field>
          <Field label="Most it can take off (K)" hint="Optional cap, useful on a percentage">
            <Input type="number" value={f.max_discount} onChange={set('max_discount')} />
          </Field>
          <Field label="Expires" hint="Leave empty and it runs until you pause it">
            <Input type="date" value={f.expires_at ? String(f.expires_at).slice(0, 10) : ''} onChange={set('expires_at')} />
          </Field>
          <Field label="How many times it can be used"><Input type="number" value={f.usage_limit} onChange={set('usage_limit')} placeholder="no limit" /></Field>
          <Field label="What it is for" span hint="Your own record">
            <Textarea value={f.description} onChange={set('description')} rows={2} placeholder="Launch week" />
          </Field>
        </div>

        <div className="price-maths">
          <div className="pm-row"><span>On a K125 order</span><strong>− {money(capped)}</strong></div>
          <div className="pm-row"><span>The customer pays</span><span>{money(example - capped)}</span></div>
          <div className="pm-row total">
            <span>{f.funded_by === 'vendor' ? 'The seller receives' : 'Comes out of'}</span>
            <strong>
              {f.funded_by === 'vendor'
                ? `${money(capped)} less than usual`
                : 'your share of the sale'}
            </strong>
          </div>
          {f.funded_by === 'marketplace' && capped >= 25 && (
            <p className="tiny" style={{ color: 'var(--warn)' }}>
              On a sale like this your whole share is about {money(25)}. A discount this size means you
              are paying for the order, not earning from it. Worth it to launch; not worth it for long.
            </p>
          )}
        </div>

        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save coupon'}</button>
      </div>
    </Modal>
  )
}

export default function Coupons() {
  const [rows, setRows] = useState(null)
  const [vendors, setVendors] = useState([])
  const [error, setError] = useState(null)
  const [edit, setEdit] = useState(null)

  const load = () => {
    setError(null)
    supabase.rpc('coupon_report').then(({ data, error: e }) => { if (e) setError(e); else setRows(data || []) })
    supabase.from('vendors').select('id,business_name').eq('status', 'approved').then(({ data }) => setVendors(data || []))
  }
  useEffect(load, [])

  if (error) return <Problem error={error} onRetry={load} what="coupons" />
  if (!rows) return <Loading shape="page" />

  const live = rows.filter((r) => r.status === 'active')
  const givenAway = rows.reduce((t, r) => t + Number(r.given_away || 0), 0)

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Coupons</h1>
          <p>A discount is somebody's money. Every code says whose before it goes live.</p>
        </div>
        <button className="btn primary" onClick={() => setEdit({ ...blank })}>New coupon</button>
      </div>

      <div className="stats-row">
        <Stat label="Running now" value={live.length} />
        <Stat label="Times used" value={rows.reduce((t, r) => t + Number(r.orders || 0), 0)} />
        <Stat label="Given away" value={money(givenAway)} />
      </div>

      {rows.length === 0 ? (
        <div className="empty-shop">
          <h2>No coupons yet</h2>
          <p>A launch code is a good reason for a seller to tell their customers about you.</p>
          <button className="btn primary" onClick={() => setEdit({ ...blank })}>Make the first one</button>
        </div>
      ) : (
        <div className="mini-table">
          {rows.map((r) => (
            <div key={r.id} className="mini-row">
              <span className="grow">
                <strong>{r.code} · {r.kind === 'pct' ? `${r.value}% off` : `${money(r.value)} off`}</strong>
                <span className="tiny muted">
                  {r.funded_by === 'vendor' ? `Paid for by ${r.vendor || 'the seller'}` : 'Paid for by ZaMarket'}
                  {r.min_order > 0 ? ` · orders over ${money(r.min_order)}` : ''}
                  {r.expires_at ? ` · until ${date(r.expires_at)}` : ' · no end date'}
                  {r.usage_limit ? ` · ${r.used_count}/${r.usage_limit} used` : ` · used ${r.used_count} times`}
                </span>
              </span>
              <span className="right">
                <b className="copper">{money(r.given_away)}</b>
                <span className="tiny muted">given away</span>
              </span>
              <Badge status={r.status === 'active' ? 'approved' : r.status === 'expired' ? 'draft' : 'pending'}>
                {r.status}
              </Badge>
              <button className="btn sm" onClick={() => setEdit(r)}>Edit</button>
            </div>
          ))}
        </div>
      )}

      {edit && <Editor row={edit} vendors={vendors} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}
