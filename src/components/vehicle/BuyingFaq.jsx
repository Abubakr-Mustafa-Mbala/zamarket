// How buying a vehicle works, from the buyer's side only: four short steps
// that are always visible, and a few questions that open when tapped.
export const BUYING_STEPS = [
  ['Enquire', 'Tap Ask on WhatsApp or send the form. Ask anything: price, papers, more photos.'],
  ['Talk it through', 'We answer your questions and pass on your offer if the price is negotiable.'],
  ['See it', 'We arrange a viewing. Bring a mechanic if you like.'],
  ['Agree and buy', 'Agree the price, check the papers, and only then pay.'],
]

const QUESTIONS = [
  ['Can I make an offer?', 'Where the listing says negotiable, yes. Put your offer in your enquiry. If it says nothing about the price, just ask.'],
  ['When do I pay?', 'Only after you have seen the vehicle in person and checked that the registration book or import papers match the vehicle and the seller.'],
  ['Can a mechanic check it?', 'Yes, and it is worth it. Tell us when you enquire and we arrange it.'],
  ['Are the details on the page certain?', 'They come from the seller. Confirm anything important at the viewing before you agree.'],
]

export default function BuyingFaq({ compact = false }) {
  return (
    <section className={`vx-buy ${compact ? 'is-compact' : ''}`} aria-label="How buying works">
      <h2>How buying works</h2>
      <ol className="vx-buy-steps">
        {BUYING_STEPS.map(([t, d], i) => <li key={t}><span>{i + 1}</span><div><strong>{t}</strong><p>{d}</p></div></li>)}
      </ol>
      <div className="vx-faq">
        {QUESTIONS.map(([q, a]) => (
          <details key={q}>
            <summary><span>{q}</span></summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
