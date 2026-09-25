import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { date } from '../lib/format'
import Icon from '../lib/icons'

// "Verified" on its own is just a green tick. This shows what was actually checked,
// and the numbers only appear when they are real.
export default function TrustPanel({ slug, compact = false }) {
  const [t, setT] = useState(null)
  const [open, setOpen] = useState(!compact)
  useEffect(() => {
    if (!slug) return
    supabase.rpc('vendor_trust', { p_slug: slug }).then(({ data }) => setT(data?.found ? data : null))
  }, [slug])
  if (!t) return null

  const done = t.checks.filter((c) => c.done)
  const facts = [
    t.completed_orders > 0 && `${t.completed_orders} order${t.completed_orders === 1 ? '' : 's'} completed through ZaMarket`,
    t.verified_reviews > 0 && `${t.verified_reviews} review${t.verified_reviews === 1 ? '' : 's'} from people who actually bought`,
    t.since && `Selling on ZaMarket since ${date(t.since)}`,
  ].filter(Boolean)

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
          <strong>{t.level === 'verified' ? 'Checked by ZaMarket' : t.level === 'known' ? 'Met by ZaMarket' : 'New on ZaMarket'}</strong>
          <span className="tiny muted">{done.length} of {t.checks.length} checks done · tap to see exactly what we checked</span>
        </span>
        <span className="tp-caret" aria-hidden>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="tp-body">
          <ul className="tp-checks">
            {t.checks.map((c) => (
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
            Whatever we haven't checked, we don't claim. Every order here is taken, confirmed and delivered by ZaMarket, so if anything goes wrong you come to us, not to a stranger.
          </p>
          <Link to="/how-it-works" className="small">How ZaMarket works →</Link>
        </div>
      )}
    </section>
  )
}
