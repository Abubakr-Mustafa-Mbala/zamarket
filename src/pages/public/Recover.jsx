import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useData } from '../../lib/useData'
import { Field, Input, Textarea, Segmented, useToast, Loading } from '../../components/ui'
import { usablePhone } from '../../lib/phone'

// For a seller or affiliate who can no longer sign in at all: the password is
// forgotten and the Google account is gone too. Their earnings are behind
// that login, so this is deliberately not instant. They sign in with a new
// Google account and ask; a founder rings the number already on the account.
export default function Recover() {
  const { user, loading } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ kind: 'vendor', phone: '', name: '', note: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((c) => ({ ...c, [k]: v }))
  const { data: mine, reload } = useData(async () => {
    if (!user) return []
    const { data } = await supabase.from('account_recovery_requests')
      .select('id,kind,status,created_at,decided_at').eq('requester', user.id)
      .order('created_at', { ascending: false }).limit(3)
    return data || []
  }, [user?.id])

  if (loading) return <Loading />
  const waiting = (mine || []).find((r) => r.status === 'pending')
  const latest = (mine || [])[0]

  const submit = async (e) => {
    e.preventDefault()
    if (!usablePhone(f.phone)) return toast('Enter the phone number that is on the account', true)
    setBusy(true)
    const { error } = await supabase.rpc('request_account_recovery', {
      p_kind: f.kind, p_phone: f.phone, p_name: f.name, p_note: f.note,
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast('Request received')
    reload()
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card stack">
        <Link to="/" className="brand" style={{ color: 'var(--ink)', padding: 0 }}>Za<span style={{ color: 'var(--copper)' }}>Market</span></Link>
        <div>
          <h1>Get back into your account</h1>
          <p className="small muted">For sellers and affiliates who can no longer sign in.</p>
        </div>

        <ol className="recover-steps small">
          <li>Sign in here with the Google account you will use from now on.</li>
          <li>Tell us the phone number that is on your shop or affiliate account.</li>
          <li>We ring <strong>that number</strong> to check it is you. Keep it switched on.</li>
          <li>Your account is moved to your new login. Payouts pause for a few days afterwards, as a safeguard. Your earnings are not affected.</li>
        </ol>

        {!user ? (
          <>
            <Link className="btn primary block" to={`/login?next=${encodeURIComponent('/recover')}`}>Sign in with Google to start</Link>
            <p className="tiny muted">Only forgotten your password? You do not need this page. Use “Send password recovery link” on the sign-in page instead.</p>
          </>
        ) : waiting ? (
          <div className="card flat stack-sm">
            <strong>Your request is with us</strong>
            <p className="small">We will ring the phone number on the account. If that number no longer works, contact ZaMarket directly, because we cannot move an account without reaching its owner.</p>
          </div>
        ) : latest?.status === 'approved' ? (
          <div className="card flat stack-sm">
            <strong>Your account has been moved to this login</strong>
            <Link className="btn primary block" to="/login">Open my dashboard</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="stack-sm">
            {latest?.status === 'declined' && <p className="small warn-text">Your last request could not be approved. You can ask again, or contact ZaMarket directly.</p>}
            <Field label="Which account?">
              <Segmented options={[['vendor', 'My shop'], ['reseller', 'My affiliate account']]} value={f.kind} onChange={set('kind')} />
            </Field>
            <Field label="Phone number on the account"><Input type="tel" value={f.phone} onChange={set('phone')} placeholder="e.g. 0977 123 456" required /></Field>
            <Field label={f.kind === 'vendor' ? 'Shop name or your name' : 'Your name'}><Input value={f.name} onChange={set('name')} required /></Field>
            <Field label="What happened? (optional)"><Textarea value={f.note} onChange={set('note')} rows={2} /></Field>
            <button className="btn primary block" disabled={busy}>{busy ? 'Sending…' : 'Ask ZaMarket to check'}</button>
            <p className="tiny muted">For your safety we never say on this page whether a phone number belongs to an account.</p>
          </form>
        )}
      </div>
    </div>
  )
}
