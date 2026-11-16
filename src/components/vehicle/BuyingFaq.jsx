
// How buying a vehicle through ZaMarket works, as short questions that open
// when tapped. ZaMarket connects buyers with the owner or dealer; it does not
// sell the vehicle itself, and this says so plainly.
export const BUYING_STEPS = [
  ['You enquire', 'Tap Ask on WhatsApp or send the form. We record your enquiry.'],
  ['We connect you', 'We pass it to the owner or dealer handling the vehicle, and someone gets back to you.'],
  ['You view and inspect', 'We help arrange the viewing. Bring a mechanic if you like.'],
  ['You agree with the seller', 'Agree the price and check the papers. Pay only after you have seen it.'],
]

const QUESTIONS = [
  ['Does ZaMarket sell the vehicle?', 'No. We list vehicles for owners and dealers we work with, and connect you with them. The sale is between you and the seller; we help you get there.'],
  ['Can I make an offer?', 'Where the listing says negotiable, yes. Put your offer in your enquiry and we pass it on. If it says nothing about the price, ask us.'],
  ['When do I pay?', 'Only after you have seen the vehicle in person and checked the registration book or import papers match the vehicle and the seller.'],
  ['Can a mechanic check it?', 'Yes, and it is worth it. Ask us and we pass the request to the seller.'],
  ['Are the details on the page certain?', 'They come from the seller. Confirm anything important before you agree.'],
]

export default function BuyingFaq({ compact = false }) {
  return (
    <section className={`vx-faq ${compact ? 'is-compact' : ''}`}>
      <details className="vx-faq-steps">
        <summary><span>How buying works</span><em>4 steps</em></summary>
        <ol>
          {BUYING_STEPS.map(([t, d], i) => <li key={t}><span>{i + 1}</span><div><strong>{t}</strong><p>{d}</p></div></li>)}
        </ol>
      </details>
      {QUESTIONS.map(([q, a]) => (
        <details key={q}>
          <summary><span>{q}</span></summary>
          <p>{a}</p>
        </details>
      ))}
    </section>
  )
}

