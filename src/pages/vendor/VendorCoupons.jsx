import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/format'
import { useToast } from '../../components/ui'

// A seller's own discounts. Everything here is funded by them, which is why
// the cost of each one is shown next to it in kwacha rather than left as a
// percentage they have to work out themselves.
//
// Two things arrive on this page:
//   - coupons they made, which are live straight away
//   - coupons ZaMarket wrote against their money, which do nothing at all
//     until they accept here. That is the whole point: nobody spends a
//     seller's money without the seller agreeing to it.

const blank = {
  code: '', description: '', kind: 'pct', value: '',
  min_order: '', max_discount: '', expires_at: '', usage_limit: '', per_customer_limit: 1,
}

function Pending({ rows, onAnswer, busy }) {
  if (!rows.length) return null
  return (
    <div className="card" style={{ borderColor: 'var(--gold)' }}>
      <h3>Waiting for your decision</h3>
      <p className="small muted">
        ZaMarket has suggested these discounts on your products. They are not
        live and no customer can use them. If you accept, the discount comes
        out of your takings on those orders.
      </p>
      {rows.map((c) => (
        <div key={c.id} className="between mt" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div><b>{c.code}</b> · {c.kind === 'pct' ? `${c.value}% off` : `${money(c.value)} off`}</div>
            {c.description && <div className="small muted">{c.description}</div>}
            <div className="tiny muted">
              {Number(c.min_order) > 0 ? `On orders over ${money(c.min_order)}. ` : ''}
              {c.max_discount ? `Never more than ${money(c.max_discount)} off. ` : ''}
              {c.usage_limit ? `Up to ${c.usage_limit} uses in total.` : 'No limit on total uses.'}
            </div>
          </div>
          <div className="btn-row">
            <button type="button" className="btn" disabled={busy} onClick={() => onAnswer(c.id, false)}>No thanks</button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => onAnswer(c.id, true)}>Accept and fund</button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function VendorCoupons() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))

  const load = () => {
    setLoading(true)
    supabase.rpc('my_coupons').then(({ data, error }) => {
      setLoading(false)
      if (error) return toast(error.message, true)
      setRows(data || [])
    })
  }
  useEffect(load, [])

  const answer = async (id, accept) => {
    setBusy(true)
    const { error } = await supabase.rpc('answer_coupon', { p_coupon: id, p_accept: accept })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast(accept ? 'Accepted. The code works from now on.' : 'Declined. Nobody can use that code.')
    load()
  }

  const save = async (e) => {
    e.preventDefault()
    if (!f.code.trim()) return toast('Give the coupon a code', true)
    if (!(Number(f.value) > 0)) return toast('The discount must be more than zero', true)
    setBusy(true)
    const { error } = await supabase.rpc('save_coupon', {
      payload: {
        code: f.code.trim().toUpperCase(),
        description: f.description.trim() || null,
        kind: f.kind,
        value: Number(f.value),
        min_order: f.min_order === '' ? 0 : Number(f.min_order),
        max_discount: f.max_discount === '' ? '' : String(Number(f.max_discount)),
        expires_at: f.expires_at || '',
        usage_limit: f.usage_limit === '' ? '' : String(Number(f.usage_limit)),
        per_customer_limit: Number(f.per_customer_limit) || 1,
      },
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast('Coupon created. You are funding this one.')
    setF(blank)
    load()
  }

  const pending = rows.filter((c) => c.needs_my_answer)
  const live = rows.filter((c) => !c.needs_my_answer)
  const spent = live.reduce((t, c) => t + Number(c.spent || 0), 0)

  return (
    <div className="stack">
      <div className="page-head workspace-page-head">
        <div>
          <span className="eyebrow"><span className="status-dot" /> YOUR DISCOUNTS</span>
          <h1>Coupons</h1>
          <p>A coupon you create is paid for out of your own takings. The amount
             comes off what you receive for that order, not off ZaMarket's fee.</p>
        </div>
      </div>

      <Pending rows={pending} onAnswer={answer} busy={busy} />

      <form className="card" onSubmit={save}>
        <h3>Make a coupon</h3>
        <div className="grid-2">
          <label>Code
            <input className="input" value={f.code} onChange={set('code')}
                   placeholder="e.g. CUPCAKE10" autoComplete="off" />
          </label>
          <label>What it is for (optional)
            <input className="input" value={f.description} onChange={set('description')}
                   placeholder="e.g. For my WhatsApp customers" />
          </label>
          <label>Type
            <select className="input" value={f.kind} onChange={set('kind')}>
              <option value="pct">A percentage off</option>
              <option value="flat">A fixed amount off</option>
            </select>
          </label>
          <label>{f.kind === 'pct' ? 'Percentage off' : 'Kwacha off'}
            <input className="input" type="number" min="0" step="0.01"
                   value={f.value} onChange={set('value')} placeholder={f.kind === 'pct' ? '10' : '25'} />
          </label>
          <label>Only on orders over (optional)
            <input className="input" type="number" min="0" step="0.01"
                   value={f.min_order} onChange={set('min_order')} placeholder="0" />
          </label>
          {f.kind === 'pct' && (
            <label>Never more than this much off (optional)
              <input className="input" type="number" min="0" step="0.01"
                     value={f.max_discount} onChange={set('max_discount')} placeholder="e.g. 50" />
            </label>
          )}
          <label>Stop working after (optional)
            <input className="input" type="date" value={f.expires_at} onChange={set('expires_at')} />
          </label>
          <label>Total number of uses (optional)
            <input className="input" type="number" min="1" step="1"
                   value={f.usage_limit} onChange={set('usage_limit')} placeholder="no limit" />
          </label>
          <label>Times one person may use it
            <input className="input" type="number" min="1" step="1"
                   value={f.per_customer_limit} onChange={set('per_customer_limit')} />
          </label>
        </div>
        <p className="small muted">
          A percentage discount cannot be more than 90%. Whatever you set here,
          a customer can never be charged less than nothing, and the discount
          never comes out of another seller's money.
        </p>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Create coupon'}</button>
      </form>

      <div className="card">
        <div className="between"><h3>Your coupons</h3>
          {spent > 0 && <span className="small muted">Given away so far: <b>{money(spent)}</b></span>}
        </div>
        {loading ? <p className="small muted">Loading…</p>
         : !live.length ? <p className="small muted">You have not made any coupons yet.</p>
         : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th>Code</th><th>Discount</th><th>Used</th><th>Cost to you</th><th>Status</th>
              </tr></thead>
              <tbody>
                {live.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.code}</b>
                      {c.audience === 'targeted' && <div className="tiny muted">Given to {c.recipients} {c.recipients === 1 ? 'person' : 'people'}</div>}
                      {c.created_by_founder && <div className="tiny muted">Suggested by ZaMarket</div>}
                    </td>
                    <td>{c.kind === 'pct' ? `${c.value}%` : money(c.value)}</td>
                    <td>{c.used_count}{c.usage_limit ? ` of ${c.usage_limit}` : ''}</td>
                    <td className="money">{money(c.spent)}</td>
                    <td>{c.status === 'active' ? 'Live' : c.status === 'declined' ? 'Declined' : c.status === 'paused' ? 'Paused' : c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default VendorCoupons
