import { useEffect, useState } from 'react'
import { PENDING, packPending, readPending } from '../../lib/pendingApplication'
import { Link, useNavigate, useParams, Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Field, Input, Select, useToast, Loading } from '../../components/ui'
import { useDepartments } from '../../lib/departments'
import { recruitmentAttribution } from '../../lib/affiliateRecruitment'

// A path is only safe if it is a path on this site. Resolving it against our
// own origin is the check that cannot be talked around: a scheme, a
// protocol-relative "//host", a backslash variant or an encoded one all end
// up pointing somewhere else, and are rejected.
export function safeNext(value) {
  const raw = String(value || '')
  if (!raw || raw.length > 512) return ''
  // Reject control characters and backslashes before parsing; some browsers
  // treat a backslash as a slash, and the parser may not.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return ''
  if (!raw.startsWith('/') || raw.startsWith('//')) return ''
  try {
    const origin = window.location.origin
    const url = new URL(raw, origin)
    if (url.origin !== origin) return ''
    return url.pathname + url.search + url.hash
  } catch { return '' }
}

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
  const [recovery, setRecovery] = useState(false)
  const set = (k) => (v) => setF((c) => ({ ...c, [k]: v }))

  // Where to go after signing in.
  //
  // This used to accept anything starting with "/", which is not the same as
  // "somewhere on this site". A browser reads "//evil.com" as a full address
  // on another domain, and "/\\evil.com" the same way — both start with a
  // slash and both leave ZaMarket. A link like
  // zamarket.shop/login?next=//evil.com would therefore land somebody on a
  // stranger's page at the exact moment they had just typed their password,
  // which is the whole shape of a phishing attack.
  //
  // So the destination is resolved against our own origin and only used if it
  // actually stays here. Anything else quietly goes to the normal home page.
  useEffect(() => {
    if (loading || !user || !role) return
    nav(safeNext(next) || homeFor(role), { replace: true })
  }, [user, role, loading])

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
    // Sign in only. New accounts are created through Google, so there is no
    // signUp call behind this form to reach even if the mode were wrong.
    const res = await supabase.auth.signInWithPassword({ email: f.email, password: f.password })
    setBusy(false)
    if (res.error) return toast(res.error.message, true)

  }

  const requestReset = async (event) => {
    event.preventDefault()
    if (!f.email.trim()) return toast('Enter your account email first', true)
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(f.email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error) return toast('Could not request a recovery link. Please check your details or contact ZaMarket support.', true)
    setRecovery(true)
    toast('If the address is registered, you will receive a password recovery email.')
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card stack">
        <Link to="/" className="brand" style={{ color: 'var(--ink)', padding: 0 }}>Za<span style={{ color: 'var(--copper)' }}>Market</span></Link>
        <div>
          <h1>Welcome back</h1>
          <p className="small muted">Sign in to continue to ZaMarket.</p>
        </div>

        <button type="button" className="btn google block" onClick={google} disabled={busy}>
          <GoogleMark />
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <p className="tiny muted center">You choose your Google account. Your Google password is never seen or stored by ZaMarket.</p>

        {/* A password is offered for signing IN, never for creating a new
            account. People who already have one keep working and can attach
            Google from their account page; everyone new gets an account whose
            recovery Google handles, because a lost password on a Supabase
            account is close to unrecoverable and an affiliate's earnings sit
            behind it. */}
        {mode === 'up' ? (
          <button type="button" className="btn ghost block" onClick={() => setMode('in')}>
            Already have an account? Sign in
          </button>
        ) : !withEmail ? (
          <button type="button" className="btn ghost block" onClick={() => setWithEmail(true)}>I already have a password</button>
        ) : (
          <>
            <div className="auth-or"><span>or</span></div>
            <form onSubmit={submit} className="stack-sm">
              <Field label="Email"><Input value={f.email} onChange={set('email')} type="email" required autoComplete="email" /></Field>
              <Field label="Password"><Input value={f.password} onChange={set('password')} type="password" required minLength={6} autoComplete="current-password" /></Field>
              <button className="btn primary block" disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</button>
              <p className="tiny muted">
                Once you are in, attach Google from your account page. After that
                a forgotten password is something Google can put right for you.
              </p>
            </form>
            <form onSubmit={requestReset} className="stack-sm">
              <p className="small muted">Forgot your password? Enter your email above and request a secure recovery link.</p>
              <button className="btn block" disabled={busy}>Send password recovery link</button>
              {recovery && <p className="small">Check your inbox and spam folder. For security, we do not confirm whether an email address has an account.</p>}
            </form>
          </>
        )}
        <p className="tiny muted center">
          Seller or affiliate, and cannot sign in at all? <Link to="/recover">Get back into your account</Link>
        </p>
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

export function ResetPassword() {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    // Supabase completes the recovery URL exchange and exposes the resulting
    // recovery session. This never asks a user to send a password to support.
    supabase.auth.getSession().then(({ data }) => { if (alive) setReady(!!data?.session) })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (alive && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) setReady(!!session)
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  const save = async (event) => {
    event.preventDefault()
    if (password.length < 12) return toast('Use at least 12 characters', true)
    if (password !== confirm) return toast('Passwords do not match', true)
    if (!ready) return toast('Open the latest recovery link in your email first', true)
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return toast(error.message, true)
    setDone(true)
    toast('Password changed successfully')
  }

  return <div className="auth-wrap"><div className="card auth-card stack">
    <h1>Recover your ZaMarket account</h1>
    {done ? <><p>Password updated. Your listings, orders and earnings stay with the same account.</p><Link className="btn primary" to="/account">Go to account</Link></> :
      <><p className="small muted">Open the secure link from your email, then choose a new password. Never share a recovery link with anyone.</p>
      {!ready && <p className="small">No recovery session yet. Please open the email recovery link or request a new one from the login page.</p>}
      <form className="stack-sm" onSubmit={save}>
        <Field label="New password"><Input type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={12} required /></Field>
        <Field label="Confirm new password"><Input type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={12} required /></Field>
        <button className="btn primary block" disabled={!ready || busy}>{busy ? 'Saving…' : 'Update password'}</button>
      </form></>}
  </div></div>
}

// Plain customer account page (no partner role yet)
export function Account() {
  const { profile, user, signOut, loading } = useAuth()
  const toast = useToast()
  const [linking, setLinking] = useState(false)
  const googleConnected = user?.identities?.some((identity) => identity.provider === 'google')
  const connectGoogle = async () => {
    setLinking(true)
    const { error } = await supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: `${window.location.origin}/account` } })
    setLinking(false)
    if (error) toast(error.message || 'Could not link Google. Contact support without sharing your password.', true)
  }
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
      <div className="card stack-sm">
        <h2>Account security and recovery</h2>
        <p className="small muted">Your purchases, seller listings and affiliate earnings remain tied to this account. Link Google while you are already signed in; never create a second account to recover earnings.</p>
        <p className="small">Google sign-in: <strong>{googleConnected ? 'Connected' : 'Not linked yet'}</strong></p>
        {!googleConnected && <button className="btn primary" disabled={linking} onClick={connectGoogle}>{linking ? 'Opening Google…' : 'Link Google to this account'}</button>}
        <p className="tiny muted">Google linking requires the identity-linking option to be enabled in Supabase Auth. Keep your existing login method until linking and sign-in have both been tested.</p>
        <p className="tiny muted">Lost access to all login methods? Contact ZaMarket support for identity verification and a protected account-recovery review. We do not reset payouts based only on a message.</p>
      </div>
      <button className="btn ghost" onClick={signOut}>Sign out</button>
    </div>
  )
}


function buildRow(isVendor, f, user, profile, attribution = {}) {
  return isVendor
    ? { user_id: user.id, business_name: f.business_name, owner_name: f.full_name || profile?.full_name, phone: f.phone || profile?.phone, email: user.email, location: f.location, category: f.category || null, description: f.description, delivery_capability: f.delivery_capability || null, return_policy: f.return_policy || null, links: f.links || null, licenses: f.licenses || null, payout_info: f.payout_info || null, agreed_terms: true }
    : { user_id: user.id, full_name: f.full_name || profile?.full_name, phone: f.phone || profile?.phone, email: user.email, location: f.location, experience: f.experience || null, categories: f.categories || null, application_source: attribution.source || 'direct', application_campaign: attribution.campaign || 'organic', agreed_terms: true }
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
  const [searchParams] = useSearchParams()
  const attribution = recruitmentAttribution(searchParams)
  const resumePath = `/apply/${kind}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  const loginPath = `/login?next=${encodeURIComponent(resumePath)}`
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
          const pending = readPending(localStorage.getItem(PENDING))
          if (!pending) localStorage.removeItem(PENDING)
          if (pending && pending.kind === kind) {
            const { data: made } = await supabase.from(table).insert(buildRow(isVendor, pending.f, user, profile, pending.attribution || attribution)).select().single()
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
        <div className="small">{existing.status === 'pending' ? "We have it. Our team reviews every application and calls the phone number you gave. Come back to this page any time to see the result." : existing.status === 'approved' ? 'Your dashboard is ready.' : 'Please contact us if you think this is a mistake.'}</div>
      </div>
      {existing.status === 'pending' && (
        <div className="card flat small stack-sm">
          <strong>While you wait</strong>
          {isVendor
            ? <p>Get clear photographs and prices ready for the first things you want to list. Once you are approved you can add them straight away.</p>
            : <p>Read how affiliate selling works, so you are ready to share your first product the day you are approved.</p>}
          <Link to={isVendor ? '/sellers' : '/affiliates'}>{isVendor ? 'See the shops already on ZaMarket →' : 'How affiliate selling works →'}</Link>
        </div>
      )}
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
      <Link className="btn big primary block" to={loginPath}>Sign in</Link>
    </div>
  )

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      let u = user
      if (!u) {
        // Sellers and affiliates hold earnings, so their account is the one
        // that must not become unrecoverable. Applying signs them in with
        // Google first and the application is kept until they come back,
        // rather than creating a password account here.
        localStorage.setItem(PENDING, packPending({ kind, f, attribution }))
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
        })
        if (error) throw error
        return
      }
      const { data: made, error } = await supabase.from(table).insert(buildRow(isVendor, f, u, profile, attribution)).select().single()
      if (error) throw error
      setExisting(made)
      await refresh()
    } catch (err) {
      toast(err.message, true)
    } finally {
      setBusy(false)
    }
  }

  const steps = user
    ? ['Tell us about you', 'We review it', 'We call you']
    : ['Tell us about you', 'Choose your Google account', 'We review and call you']

  return (
    <form onSubmit={submit} className="wizard apply-form">
      <div className="stack-sm">
        <h1>{isVendor ? 'Sell your products on ZaMarket' : 'Become a ZaMarket affiliate'}</h1>
        <p className="lead">{isVendor
          ? 'Three short steps. It takes a couple of minutes and costs nothing.'
          : 'Share products you believe in and earn commission when they sell. Free to join, and applying takes a couple of minutes.'}</p>
        <ol className="apply-steps" aria-label="How applying works">
          {steps.map((label, i) => (
            <li key={label} className={i === 0 ? 'on' : ''}><b>{i + 1}</b><span>{label}</span></li>
          ))}
        </ol>
      </div>

      {isVendor ? (
        <ul className="apply-facts">
          <li><b>Listing is free.</b> We only earn when something of yours sells.</li>
          <li><b>We handle the order.</b> We take it, confirm it with the customer by phone and deliver it.</li>
          <li><b>You are paid after delivery,</b> and you ask for your money from your dashboard.</li>
          <li><b>We ask for little now:</b> your business name, your phone and the area you work from.</li>
          <li><b>Later, for expensive items or a large payout,</b> we meet you and look at an ID or PACRA paper. We record that the check happened. We never store your ID number.</li>
          <li><b>You must own what you sell,</b> or have the owner's permission.</li>
        </ul>
      ) : (
        <ul className="apply-facts">
          <li><b>Your own link,</b> with ready-made product posts, photos and current prices.</li>
          <li><b>No stock to buy,</b> nothing to carry and no deliveries to make.</li>
          <li><b>Commission on completed sales,</b> tracked in your dashboard.</li>
          <li><b>Paid after the customer receives the order.</b></li>
          <li><b>This is commission work, not a job.</b> Your income depends on real sales. There is no salary and no guaranteed earnings.</li>
        </ul>
      )}
      <p className="small muted" style={{ marginTop: -6 }}>
        {isVendor
          ? <Link to="/about">Who we are, our contacts and what we do with your details →</Link>
          : <Link to="/affiliates">How affiliate selling and the free training work →</Link>}
      </p>

      {isVendor && <BigText label="Business name" value={f.business_name || ''} onChange={set('business_name')} required />}
      <BigText label="Your name" value={f.full_name ?? profile?.full_name ?? ''} onChange={set('full_name')} required autoComplete="name" />
      <BigText label="Phone number" type="tel" inputMode="tel" value={f.phone ?? profile?.phone ?? ''} onChange={set('phone')} required autoComplete="tel" placeholder="e.g. 0977 123 456" />
      <BigText label="Town or area" value={f.location || ''} onChange={set('location')} required placeholder="e.g. Chilenje, Lusaka" />
      {isVendor
        ? <BigText label="What do you sell?" value={f.description || ''} onChange={set('description')} required placeholder="e.g. Cakes and bread" />
        : <BigText label="What would you like to promote?" optional value={f.categories || ''} onChange={set('categories')} placeholder="e.g. phones, beauty" />}
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
          <div className="big-label">Next: your Google account</div>
          <p className="small">
            The button below opens Google. Pick your account and you come
            straight back here. Your answers are kept and sent for you.
          </p>
          <p className="small muted">
            That Google account becomes your ZaMarket login, so your earnings
            are behind a password only Google holds. ZaMarket never sees it.
          </p>
          <span className="small muted">Already have an account? <Link to={loginPath}>Sign in first</Link></span>
        </div>
      )}

      {!isVendor && <p className="tiny muted">We use your application details to evaluate your request and contact you about the affiliate programme. Please provide only your own information. <Link to="/about">See our business details and contact information.</Link></p>}

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

      <button className="btn big primary block" disabled={busy}>
        {busy ? (user ? 'Sending…' : 'Opening Google…') : (user ? 'Send my application' : 'Continue with Google')}
      </button>
      {!user && <p className="tiny muted" style={{ textAlign: 'center', marginTop: -8 }}>Nothing is sent until you have chosen your account.</p>}
    </form>
  )
}
