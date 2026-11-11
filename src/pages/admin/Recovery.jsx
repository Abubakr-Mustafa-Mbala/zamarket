import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { Loading, Empty, Field, Textarea, useToast } from '../../components/ui'
import { prettyPhone } from '../../lib/phone'

// Moving a shop or affiliate account to a new login, for someone who has lost
// both their password and their Google account.
//
// The rule this screen enforces: the founder rings the number ALREADY ON THE
// ACCOUNT, not a number the requester offers now. Whoever answers that line
// is the owner. The database refuses an approval without that confirmation,
// and pauses payouts afterwards so a mistake can be undone before money moves.
export default function Recovery() {
  const toast = useToast()
  const { data, loading, reload } = useData(() => q(supabase.rpc('account_recovery_queue')), [])
  if (loading) return <Loading />
  const rows = data || []
  const waiting = rows.filter((r) => r.status === 'pending')
  const decided = rows.filter((r) => r.status !== 'pending')

  return (
    <div className="stack">
      <div className="page-head"><div>
        <h1>Account recovery</h1>
        <p>For a seller or affiliate who can no longer sign in. They ask at zamarket.shop/recover.</p>
      </div></div>

      <div className="card flat small stack-sm">
        <strong>Before you approve</strong>
        <ul className="fc-rules">
          <li>Ring the phone number shown under <strong>On record</strong>. Never a number the person gives you now.</li>
          <li>Ask something only the owner would know, such as a recent order or what they sell.</li>
          <li>If nobody answers on that number, do not approve. Decline and ask them to visit in person.</li>
          <li>After approval, payouts on that account pause for a few days. Use that time to hear from anyone who objects.</li>
        </ul>
      </div>

      {waiting.length === 0
        ? <Empty title="No requests waiting" />
        : waiting.map((r) => <Request key={r.id} r={r} onDone={() => { reload() }} toast={toast} />)}

      {decided.length > 0 && (
        <div className="stack-sm">
          <h3>Decided in the last 60 days</h3>
          {decided.map((r) => (
            <div key={r.id} className="card stack-sm">
              <div className="between">
                <span className="strong">{r.claimed_name} · {r.kind === 'vendor' ? 'shop' : 'affiliate'}</span>
                <span className={`badge ${r.status === 'approved' ? 'ok' : 'bad'}`}>{r.status}</span>
              </div>
              <div className="tiny muted">New login {r.requester_email} · {r.decided_at ? new Date(r.decided_at).toLocaleString('en-ZM') : ''}</div>
              {r.decision_note && <div className="small">{r.decision_note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Request({ r, onDone, toast }) {
  const matches = r.matches || []
  const [target, setTarget] = useState(matches.length === 1 ? matches[0].id : '')
  const [called, setCalled] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const decide = async (approve) => {
    if (approve && !target) return toast('Choose the account', true)
    if (approve && !called) return toast('Ring the number on record first, and tick the box', true)
    if (approve && note.trim().length < 10) return toast('Write down who you spoke to and what they said', true)
    setBusy(true)
    const { data, error } = await supabase.rpc('decide_account_recovery', {
      p_request: r.id, p_approve: approve, p_target: approve ? target : null, p_called: called, p_note: note,
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast(approve
      ? `Account moved. Payouts paused until ${new Date(data.payout_hold_until).toLocaleDateString('en-GB')}.`
      : 'Request declined')
    onDone()
  }

  return (
    <div className="card stack-sm">
      <div className="between">
        <div>
          <div className="strong">{r.claimed_name}</div>
          <div className="tiny muted">Asked {new Date(r.created_at).toLocaleString('en-ZM')} · wants their {r.kind === 'vendor' ? 'shop' : 'affiliate account'}</div>
        </div>
        <span className="badge">waiting</span>
      </div>
      <dl className="kv">
        <dt>New login</dt><dd>{r.requester_email || 'unknown'}{r.requester_name ? ` (${r.requester_name})` : ''}</dd>
        <dt>Number they gave</dt><dd>{prettyPhone(r.claimed_phone)}</dd>
        {r.note && <><dt>They said</dt><dd>{r.note}</dd></>}
      </dl>

      {matches.length === 0 ? (
        <p className="small warn-text">No {r.kind === 'vendor' ? 'shop' : 'affiliate'} has that phone number on record. This request cannot be approved.</p>
      ) : (
        <div className="stack-sm">
          <strong className="small">On record</strong>
          {matches.map((m) => (
            <label key={m.id} className="check">
              <input type="radio" name={`target-${r.id}`} checked={target === m.id} onChange={() => setTarget(m.id)} />
              <span>
                <strong>{m.name}</strong>{m.owner && m.owner !== m.name ? ` · ${m.owner}` : ''} · {m.status}
                <span className="tiny muted" style={{ display: 'block' }}>
                  Old login {m.email || 'none'} · joined {new Date(m.since).toLocaleDateString('en-GB')}
                </span>
                <a className="btn sm primary" style={{ marginTop: 6 }} href={`tel:${m.phone}`}>Ring {prettyPhone(m.phone)}</a>
              </span>
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={called} onChange={(e) => setCalled(e.target.checked)} />
            <span>I rang the number on record and the owner confirmed this request.</span>
          </label>
        </div>
      )}

      <Field label="What was said (kept in the audit log)">
        <Textarea value={note} onChange={setNote} rows={2} placeholder="e.g. Rang 0977 123 456 at 10:15. Mary answered, confirmed she lost her phone and described her last order." />
      </Field>
      <div className="btn-row">
        {matches.length > 0 && <button className="btn primary" disabled={busy} onClick={() => decide(true)}>Move the account to the new login</button>}
        <button className="btn ghost" disabled={busy} onClick={() => decide(false)}>Decline</button>
      </div>
    </div>
  )
}
