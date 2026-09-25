import { Link } from 'react-router-dom'
import { useSeo } from '../../lib/seo'
import Icon from '../../lib/icons'

// Trust is not "trust us". Trust is knowing exactly what happens when something
// goes wrong, written down before it does.
const COVERED = [
  'Your order never arrived',
  'The wrong item arrived',
  'What arrived is materially different from what the page described',
  'It arrived damaged',
  'The seller cancelled after you had already paid',
  'You were charged more than the total we confirmed with you on the phone',
]

const NOT_COVERED = [
  ['You changed your mind', 'Tell us before it goes out and we will cancel it. Once it is delivered, a change of mind is between you and the seller.'],
  ['Normal wear, or a fault appearing much later', 'Any warranty is the seller’s or the manufacturer’s, and the page says so where one exists.'],
  ['You paid the seller directly, outside ZaMarket', 'We can only stand behind orders that went through us. This is the main reason to order here rather than by direct message.'],
  ['Services and bookings already carried out', 'If a service was done badly, tell us — we will get both sides and help resolve it, but it is not the same as an undelivered parcel.'],
  ['Vehicles and negotiated sales', 'We introduce buyer and seller and keep the record. The sale itself is between the two of you, and we say so plainly before you enquire.'],
]

const STEPS = [
  ['Tell us within 48 hours', 'Call or WhatsApp with your order number. It is on your receipt, under the QR code.'],
  ['We look at the record', 'We have the order, the price we confirmed, the payment and the delivery. Nothing depends on anyone’s memory.'],
  ['We ask the seller', 'They get a chance to explain or put it right, usually within two working days.'],
  ['We decide and tell you both', 'Repair, replacement, or your money back, depending on what happened and what the offering is.'],
]

export default function Protection() {
  useSeo({
    title: 'What happens if something goes wrong — ZaMarket buyer protection',
    description: 'ZaMarket keeps the record of every order. Here is exactly what is covered if an order goes wrong, what is not, and how we resolve it.',
  })
  return (
    <div className="how-page">
      <header>
        <h1>If something goes wrong</h1>
        <p className="lead">Most places tell you to contact the seller and disappear. We keep the record of every order, so you come to us. Here is exactly what that means, before you need it.</p>
      </header>

      <section className="card stack-sm">
        <h2><Icon.shield /> What we stand behind</h2>
        <ul className="plain-list">{COVERED.map((c) => <li key={c}>{c}</li>)}</ul>
        <p className="small muted">This covers orders placed and paid through ZaMarket. We will repair, replace, or refund, depending on what happened.</p>
      </section>

      <section className="card stack-sm">
        <h2>How we sort it out</h2>
        <ol className="how-steps tight">
          {STEPS.map(([t, b], i) => (
            <li key={t}><span className="hs-num">{i + 1}</span><span className="hs-text"><strong>{t}</strong><span>{b}</span></span></li>
          ))}
        </ol>
      </section>

      <section className="card stack-sm">
        <h2>What we don't cover</h2>
        <p className="small muted">We would rather say this plainly now than argue about it later.</p>
        <div className="nc-list">
          {NOT_COVERED.map(([t, b]) => <div key={t}><strong>{t}</strong><span>{b}</span></div>)}
        </div>
      </section>

      <section className="how-cta">
        <div>
          <h2>Any question about an order</h2>
          <p className="small muted">Have your order number ready. It is on your receipt.</p>
        </div>
        <div className="btn-row">
          <Link className="btn primary" to="/about">Our contacts</Link>
          <Link className="btn" to="/how-it-works">How ordering works</Link>
        </div>
      </section>
    </div>
  )
}
