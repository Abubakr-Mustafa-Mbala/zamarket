import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSeo } from '../../lib/seo'
import Icon from '../../lib/icons'

const STEPS = [
  { icon: <Icon.search />, title: 'You find it', body: 'Browse products, services, courses and local businesses. Prices are shown in full, with delivery stated before you order.' },
  { icon: <Icon.shield />, title: 'You check the seller', body: 'Every shop page shows what ZaMarket has checked about that business, how long they have sold here, and reviews from people who actually bought.' },
  { icon: <Icon.cart />, title: 'You order', body: 'No money moves yet. You give a name, a phone number and where to deliver. Nothing else.' },
  { icon: <Icon.phone />, title: 'We call you', body: 'A real person confirms what you ordered, the total and the delivery, before you pay anything.' },
  { icon: <Icon.truck />, title: 'We deliver it', body: 'We collect from the seller and bring it to you. For our own stock you can pay on delivery; for a seller’s goods we take payment first, because we pay them on collection.' },
  { icon: <Icon.star />, title: 'You tell the truth about it', body: 'After delivery you can rate the order. Reviews only come from completed orders, so nobody can invent them.' },
]

const PROMISES = [
  ['Nothing paid upfront', 'We call before any money moves, every single time.'],
  ['One place to complain', 'If something arrives wrong or late, you come to ZaMarket, not to a stranger on Facebook.'],
  ['Your details stay yours', 'Phone and address are used to deliver your order and nothing else. We do not sell anyone’s details.'],
  ['No invented reviews', 'Ratings are attached to real orders. We do not write them and we do not delete bad ones for being bad.'],
]

function RealWords() {
  const [quotes, setQuotes] = useState([])
  useEffect(() => { supabase.rpc('public_proof', { p_limit: 3 }).then(({ data }) => setQuotes(data || [])) }, [])
  if (!quotes.length) return null
  return (
    <section className="real-words">
      <h2>What customers said afterwards</h2>
      <p className="small muted">Only from completed orders. We don't write these and we don't delete the unflattering ones.</p>
      <div className="rw-grid">
        {quotes.map((q, i) => (
          <blockquote key={i}>
            <span className="proof-stars">{'★'.repeat(q.rating || 5)}</span>
            <p>“{q.comment}”</p>
            <cite>{q.name} · {q.product}{q.vendor ? ` · ${q.vendor}` : ''}</cite>
          </blockquote>
        ))}
      </div>
    </section>
  )
}

export default function HowItWorks() {
  useSeo({
    title: 'How ZaMarket works — buying safely online in Lusaka',
    description: 'How an order works on ZaMarket: you order, we call to confirm, we collect from the seller and deliver, and you rate it afterwards.',
  })
  return (
    <div className="how-page">
      <header>
        <h1>How ZaMarket works</h1>
        <p className="lead">Buying online in Zambia usually means paying a stranger first and hoping. This is what we do instead.</p>
      </header>

      <ol className="how-steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="hs-num">{i + 1}</span>
            <span className="hs-icon">{s.icon}</span>
            <span className="hs-text"><strong>{s.title}</strong><span>{s.body}</span></span>
          </li>
        ))}
      </ol>

      <RealWords />

      <section className="how-promises">
        <h2>What we promise, and what we don't</h2>
        <div className="hp-grid">
          {PROMISES.map(([t, b]) => (
            <div key={t}><strong>{t}</strong><span>{b}</span></div>
          ))}
        </div>
        <p className="small muted">We do not promise the cheapest price, and we do not promise same-day delivery everywhere. We promise you know who you are buying from, what it costs, and who to call.</p>
      </section>

      <section className="how-cta">
        <div>
          <h2>See for yourself</h2>
          <p className="small muted">Start with today's deals, or read who we are and how to reach us.</p>
        </div>
        <div className="btn-row">
          <Link className="btn primary" to="/">Start shopping</Link>
          <Link className="btn" to="/protection">If something goes wrong</Link>
        </div>
      </section>
    </div>
  )
}
