import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Field, Input, Select, useToast, Loading } from '../../components/ui'
import { useDepartments } from '../../lib/departments'

export function homeFor(role) {
  if (role === 'marketing') return '/admin/marketing'
  if (['founder', 'ops', 'finance', 'delivery'].includes(role)) return '/admin'
  if (role === 'reseller') return '/sell'
  if (role === 'vendor') return '/vendor'
  return '/account'
}

export function Login() {
  const { user, role, loading } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [mode, setMode] = useState('in')
  const [withEmail, setWithEmail] = useState(false)
  const [sp] = useSearchParams()
  const next = sp.get('next')
  const [f, setF] = useState({ email: '', password: '', full_name: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((c) => ({ ...c, [k]: v }))

  useEffect(() => { if (!loading && user && role) nav(next && next.startsWith('/') ? next : homeFor(role), { replace: true }) }, [user, role, loading])

  // Google handles the password. ZaMarket never sees it.
  const google = async () => {
    setBusy(true)
    const back = `${window.location.origin}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: back, queryParams: { prompt: 'select_account' } },
    })
    if (error) { setBusy(false); toast(error.message, true) }
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const res = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email: f.email, password: f.password })
      : await supabase.auth.signUp({ email: f.email, password: f.password, options: { data: { full_name: f.full_name, phone: f.phone } } })
    setBusy(false)
    if (res.error) return toast(res.error.message, true)
    if (mode === 'up' && !res.data.session) toast('Check your email to confirm your account')
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card stack">
        <Link to="/" className="brand" style={{ color: 'var(--green-deep)', padding: 0 }}>Za<span style={{ color: 'var(--copper)' }}>Market</span></Link>
        <div>
          <h1>Welcome back</h1>
          <p className="small muted">Sign in to continue to ZaMarket.</p>
        </div>

        <button type="button" className="btn google block" onClick={google} disabled={busy}>
          <GoogleMark />
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <p className="tiny muted center">You choose your Google account. Your Google password is never seen or stored by ZaMarket.</p>

        {!withEmail ? (
          <button type="button" className="btn ghost block" onClick={() => setWithEmail(true)}>Use an email and password instead</button>
        ) : (
          <>
            <div className="auth-or"><span>or</span></div>
            <form onSubmit={submit} className="stack-sm">
              {mode === 'up' && (
                <>
                  <Field label="Full name"><Input value={f.full_name} onChange={set('full_name')} required /></Field>
                  <Field label="Phone"><Input value={f.phone} onChange={set('phone')} type="tel" required /></Field>
                </>
              )}
              <Field label="Email"><Input value={f.email} onChange={set('email')} type="email" required autoComplete="email" /></Field>
              <Field label="Password"><Input value={f.password} onChange={set('password')} type="password" required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>
              <button className="btn primary block" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
              <button type="button" className="btn ghost block" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
                {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// Google's own mark, drawn so it renders without loading anything.
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.7l4-3Z" />
      <path fill="#EA4335" d="M12 4.7c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.7 12 4.7Z" />
    </svg>
  )
}

// Plain customer account page (no partner role yet)
export function Account() {
  const { profile, signOut, loading } = useAuth()
  if (loading) return <Loading />
  if (!profile) return <Navigate to="/login" replace />
  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <h1>Hi {profile.full_name || 'there'}</h1>
      <div className="card stack-sm">
        <p>Your account is set up. You can shop as a customer, or apply to join as a partner.</p>
        <div className="btn-row">
          <Link className="btn primary" to="/apply/reseller">Apply to be an affiliate</Link>
          <Link className="btn" to="/apply/vendor">Apply to sell as a vendor</Link>
        </div>
      </div>
      <button className="btn ghost" onClick={signOut}>Sign out</button>
    </div>
  )
}

const PENDING = 'zm-pending-apply'

function buildRow(isVendor, f, user, profile) {
  return isVendor
    ? { user_id: user.id, business_name: f.business_name, owner_name: f.full_name || profile?.full_name, phone: f.phone || profile?.phone, email: user.email, location: f.location, category: f.category || null, description: f.description, delivery_capability: f.delivery_capability || null, return_policy: f.return_policy || null, links: f.links || null, licenses: f.licenses || null, payout_info: f.payout_info || null, agreed_terms: true }
    : { user_id: user.id, full_name: f.full_name || profile?.full_name, phone: f.phone || profile?.phone, email: user.email, location: f.location, experience: f.experience || null, categories: f.categories || null, agreed_terms: true }
}

function BigText({ label, hint, optional, ...rest }) {
  return (
    <label className="big-field">
      <span className="big-label">{label}{optional && <span className="muted" style={{ fontWeight: 400 }}> (optional)</span>}</span>
      <input className="big-input" {...rest} />
      {hint && <span className="big-hint">{hint}</span>}
    </label>
  )
}

export function Apply() {
  const DEPARTMENTS = useDepartments()
  const { kind } = useParams()
  const { user, profile, loading, refresh } = useAuth()
  const toast = useToast()
  const isVendor = kind === 'vendor'
  const table = isVendor ? 'vendors' : 'resellers'
  const [existing, setExisting] = useState(undefined)
  const [f, setF] = useState({})
  const [busy, setBusy] = useState(false)
  const [waitingEmail, setWaitingEmail] = useState(false)
  const [terms, setTerms] = useState(null)
  const set = (k) => (e) => setF((c) => ({ ...c, [k]: e.target.value }))

  useEffect(() => {
    supabase.from('settings').select('key,value').in('key', ['reseller_terms', 'vendor_terms'])
      .then(({ data }) => setTerms(Object.fromEntries((data || []).map((r) => [r.key, r.value]))))
  }, [])

  // Load existing application, or send one saved before email confirmation.
  useEffect(() => {
    if (!user) return
    (async () => {
      const { data } = await supabase.from(table).select('*').eq('user_id', user.id).maybeSingle()
      if (!data) {
        try {
          const pending = JSON.parse(localStorage.getItem(PENDING) || 'null')
          if (pending && pending.kind === kind) {
            const { data: made } = await supabase.from(table).insert(buildRow(isVendor, pending.f, user, profile)).select().single()
            localStorage.removeItem(PENDING)
            if (made) { setExisting(made); await refresh(); return }
          }
        } catch { /* ignore */ }
      }
      setExisting(data || null)
    })()
  }, [user, kind])

  if (loading || (user && existing === undefined)) return <Loading />
  if (existing) return (
    <div className="wizard">
      <div className="done-card">
        <div className="done-tick">{existing.status === 'approved' ? '✓' : '⏳'}</div>
        <div className="strong">{existing.status === 'pending' ? 'Application received' : existing.status === 'approved' ? "You're approved" : 'Application not active'}</div>
        <div className="small">{existing.status === 'pending' ? "We'll call you soon. You don't need to do anything else." : existing.status === 'approved' ? 'Your dashboard is ready.' : 'Please contact us if you think this is a mistake.'}</div>
      </div>
      {existing.status === 'approved' && <Link className="btn big primary block" to={isVendor ? '/vendor' : '/sell'}>Open my dashboard</Link>}
    </div>
  )
  if (waitingEmail) return (
    <div className="wizard">
      <div className="done-card">
        <div className="done-tick">✉️</div>
        <div className="strong">Check your email</div>
        <div className="small">Tap the link we sent to {f.email}. Then sign in, and your application sends by itself.</div>
      </div>
      <Link className="btn big primary block" to={`/login?next=/apply/${kind}`}>Sign in</Link>
    </div>
  )

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      let u = user
      if (!u) {
        const { data, error } = await supabase.auth.signUp({ email: f.email, password: f.password, options: { data: { full_name: f.full_name, phone: f.phone } } })
        if (error) throw error
        if (!data.session) {
          localStorage.setItem(PENDING, JSON.stringify({ kind, f: { ...f, password: undefined } }))
          setWaitingEmail(true)
          return
        }
        u = data.user
      }
      const { data: made, error } = await supabase.from(table).insert(buildRow(isVendor, f, u, profile)).select().single()
      if (error) throw error
      setExisting(made)
      await refresh()
    } catch (err) {
      toast(err.message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="wizard">
      <div>
        <h1>{isVendor ? 'Sell your products with us' : 'Earn money selling our products'}</h1>
        <p className="lead">{isVendor
          ? 'Fill this in and we will call you.'
          : 'Share products with anyone — friends, your WhatsApp status, TikTok, Facebook, or people you meet. When someone buys through your link, you earn commission on that sale. Fill this in and we will call you.'}</p>
        {isVendor && (
          <div className="card flat small stack-sm">
            <strong>Before you fill this in, here is who we are.</strong>
            <p>Listing is free. We only earn when something of yours sells. We take the order, confirm it with the customer by phone, and deliver it. You are paid after delivery, and you can ask to be paid from your dashboard.</p>
            <p><strong>What we ask for now:</strong> your business name, your phone, and the area you work from. That is all.</p>
            <p><strong>What we ask for later:</strong> if you want to list expensive items, or before a large payout, we meet you and look at an ID or PACRA paper. We write down that the check happened — <strong>we never store your ID number</strong>.</p>
            <p>You must own what you sell, or have the owner's permission.</p>
            <p><Link to="/about">See our contacts, address and what we do with your details →</Link></p>
          </div>
        )}
        {!isVendor && (
          <ul className="sell-points">
            <li>Your own link, with ready-made messages, photos and prices</li>
            <li>No stock to buy, nothing to carry, no deliveries to make</li>
            <li>Commission on every completed sale, tracked in your dashboard</li>
            <li>Paid after the customer receives the order</li>
            <li>What you earn depends on what you sell. There's no salary and nothing is guaranteed.</li>
          </ul>
        )}
      </div>

      {isVendor && <BigText label="Business name" value={f.business_name || ''} onChange={set('business_name')} required />}
      <BigText label="Your name" value={f.full_name ?? profile?.full_name ?? ''} onChange={set('full_name')} required autoComplete="name" />
      <BigText label="Phone number" type="tel" inputMode="tel" value={f.phone ?? profile?.phone ?? ''} onChange={set('phone')} required autoComplete="tel" placeholder="e.g. 0977 123 456" />
      <BigText label="Town or area" value={f.location || ''} onChange={set('location')} required placeholder="e.g. Chilenje, Lusaka" />
      {isVendor
        ? <BigText label="What do you sell?" value={f.description || ''} onChange={set('description')} required placeholder="e.g. Cakes and bread" />
        : <BigText label="What would you like to sell?" optional value={f.categories || ''} onChange={set('categories')} placeholder="e.g. phones, beauty" />}
      {isVendor && <BigText label="How should we pay you?" optional value={f.payout_info || ''} onChange={set('payout_info')} placeholder="Airtel / MTN number or bank" />}

      <details>
        <summary>{isVendor ? 'More about your business (optional)' : 'Tell us more (optional)'}</summary>
        <div className="stack mt">
          {isVendor ? (
            <>
              <label className="big-field"><span className="big-label">Type of products</span><Select value={f.category} onChange={(v) => setF({ ...f, category: v })} options={DEPARTMENTS.map((d) => d.name)} placeholder="Choose" /></label>
              <BigText label="Can you deliver, or should we collect?" value={f.delivery_capability || ''} onChange={set('delivery_capability')} />
              <BigText label="Returns / refunds" value={f.return_policy || ''} onChange={set('return_policy')} />
              <BigText label="Facebook, Instagram or website" value={f.links || ''} onChange={set('links')} />
              <BigText label="Licences (if needed)" value={f.licenses || ''} onChange={set('licenses')} />
            </>
          ) : (
            <BigText label="Have you sold things before?" value={f.experience || ''} onChange={set('experience')} placeholder="e.g. I sell on WhatsApp status" />
          )}
        </div>
      </details>

      {!user && (
        <div className="stack card">
          <div className="big-label">Make your login</div>
          <BigText label="Email" type="email" value={f.email || ''} onChange={set('email')} required autoComplete="email" />
          <BigText label="Password" type="password" value={f.password || ''} onChange={set('password')} required minLength={6} autoComplete="new-password" hint="At least 6 letters or numbers" />
          <span className="small muted">Already have a login? <Link to={`/login?next=/apply/${kind}`}>Sign in</Link></span>
        </div>
      )}

      <label className="check big-check">
        <input type="checkbox" required />
        <span>
          I agree to the rules.{' '}
          <details style={{ display: 'inline' }}>
            <summary style={{ display: 'inline' }}>Read them</summary>
            <span className="small muted" style={{ display: 'block', marginTop: 6 }}>
              {(isVendor ? terms?.vendor_terms : terms?.reseller_terms) || 'Loading the rules…'}
            </span>
          </details>
        </span>
      </label>

      <button className="btn big primary block" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
    </form>
  )
}
