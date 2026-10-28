import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { date } from '../lib/format'
import Icon from '../lib/icons'

// "Verified" on its own is just a green tick. This shows what was actually
// checked, and the numbers only appear when they are real.
//
// Seller verification is switched off until ZaMarket is registered and real
// background checks exist (see verification_on in the schema). While it is off
// this panel makes no claim about who the seller is. It says the one thing that
// is true either way: ZaMarket takes the order, confirms it and delivers it, so
// the shopper's recourse is to ZaMarket.
export default function TrustPanel({ slug, compact = false }) {
  const [t, setT] = useState(null)
  const [open, setOpen] = useState(!compact)
  useEffect(() => {
    if (!slug) return
    supabase.rpc('vendor_trust', { p_slug: slug }).then(({ data }) => setT(data?.found ? data : null))
  }, [slug])
  if (!t) return null

  const checks = t.checks || []
  const done = checks.filter((c) => c.done)
  const verifying = t.verification !== false
  const facts = [
    t.completed_orders > 0 && `${t.completed_orders} order${t.completed_orders === 1 ? '' : 's'} completed through ZaMarket`,
    t.verified_reviews > 0 && `${t.verified_reviews} review${t.verified_reviews === 1 ? '' : 's'} from people who actually bought`,
    t.since && `Selling on ZaMarket since ${date(t.since)}`,
  ].filter(Boolean)

  const title = verifying
    ? t.level === 'verified' ? 'Checked by ZaMarket'
      : t.level === 'known' ? 'Met by ZaMarket'
      : 'New on ZaMarket'
    : 'Your order is handled by ZaMarket'

  const sub = verifying
    ? `${done.length} of ${checks.length} checks done · tap to see exactly what we checked`
    : 'Tap to see what that covers'

  return (
    <section className="trust-panel">
      {!compact && (t.completed_orders > 0 || t.verified_reviews > 0) && (
        <div className="tp-record">
          <div><b>{t.completed_orders}</b><span>completed orders</span></div>
          {t.completed_orders > 0 && <div><b>{Math.round((t.on_time / t.completed_orders) * 100)}%</b><span>delivered on time</span></div>}
          <div><b>{t.verified_reviews}</b><span>verified reviews</span></div>
          {t.rating ? <div><b>{t.rating}/5</b><span>average rating</span></div> : null}
        </div>
      )}
      <button type="button" className="tp-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="tp-icon"><Icon.shield /></span>
        <span className="tp-title">
          <strong>{title}</strong>
          <span className="tiny muted">{sub}</span>
        </span>
        <span className="tp-caret" aria-hidden>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="tp-body">
          {!verifying && (
            <p className="tp-lead">
              You order from ZaMarket, not from a stranger. We take the order, confirm it with you by
              phone, arrange delivery and handle the money. If something goes wrong, you come to us.
            </p>
          )}
          <ul className="tp-checks">
            {checks.map((c) => (
              <li key={c.label} className={c.done ? 'done' : 'not'}>
                <span aria-hidden>{c.done ? <Icon.check /> : <Icon.info />}</span>
                {c.label}
              </li>
            ))}
          </ul>
          {facts.length > 0 && (
            <ul className="tp-facts">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
          )}
          <p className="tiny muted">
            {verifying
              ? "Whatever we haven't checked, we don't claim. Every order here is taken, confirmed and delivered by ZaMarket, so if anything goes wrong you come to us, not to a stranger."
              : "We don't background-check sellers yet, so we don't claim to. What we do claim is the order itself: confirmed by phone before you pay anything, and our responsibility until it reaches you."}
          </p>
          <Link to="/how-it-works" className="small">How ZaMarket works →</Link>
        </div>
      )}
    </section>
  )
}
