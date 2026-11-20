import { Link } from 'react-router-dom'
import { useSeo } from '../../lib/seo'
import '../../affiliate-program.css'

// "Grow with ZaMarket": the offer to sellers, in plain words. Marketing like
// an agency does it, but no joining fee and no monthly fee: the seller keeps
// the full amount they ask for, and ZaMarket earns only when a sale happens.
// Every seller is reviewed before joining.

const week = [
  ['01', 'Videos of your products', 'Short vertical videos made from your own photos: for TikTok, Instagram, Facebook and WhatsApp Status.'],
  ['02', 'Posted and shared', 'On ZaMarket’s pages, and by our affiliates, who share your products with the people they know.'],
  ['03', 'Customers contacted', 'We follow up people who ask, and reach out to offices and groups that need what you sell.'],
  ['04', 'A report every Monday', 'Your real numbers on WhatsApp: how many people saw your products, asked about them and ordered.'],
]
const compare = [
  ['What it costs you', 'A monthly fee, paid whether you sell or not', 'No joining fee. No monthly fee.'],
  ['When they earn', 'Every month, up front', 'Only when one of your items sells'],
  ['Your price', 'You set it; their fee comes from your pocket', 'You set the amount you receive. You get it in full, every time.'],
  ['Content', 'Often you send the photos and write the posts', 'We make the videos and posters from your photos'],
  ['Results', 'Reports of “reach” and “impressions”', 'Real numbers: people who saw, asked and ordered'],
  ['Delivery', 'Not their problem', 'We collect from you and deliver to the customer in Lusaka'],
]
const review = [
  ['Where you work from', 'We visit your shop, kitchen or workshop, or see it on a video call.'],
  ['Your products are real', 'What you sell is what is in the photos and the description.'],
  ['Lawful and halal', 'We only sell what is legal and halal. Nothing misleading.'],
  ['You can deliver on time', 'You can have an order ready when we come to collect it.'],
]
const faq = [
  ['Do I pay anything to join?', 'No. There is no joining fee and no monthly fee. ZaMarket earns only from sales that actually happen.'],
  ['How much do I receive when something sells?', 'Exactly the amount you set for that item. You see it when you add the product, and it is never reduced.'],
  ['When am I paid?', 'When we collect the order from you, as agreed with you when you join.'],
  ['Who delivers?', 'ZaMarket collects the order from you and delivers it to the customer in Lusaka. You prepare it; we do the rest.'],
  ['Can anyone join?', 'No. Every seller is reviewed first, so customers can trust everyone on ZaMarket. We look at where you work from, your products and whether you can prepare orders on time. Car sellers join by invitation only.'],
  ['What if my products do not sell?', 'You have lost nothing: there was no fee. Your Monday report shows where people stop (seeing, asking or ordering), and we change the photos, the description or the way we promote it.'],
  ['How long does applying take?', 'A few minutes: continue with Google, tell us about your business, and send. We then contact you to arrange the review.'],
]

export default function GrowWithUs() {
  useSeo({
    title: 'Sell on ZaMarket | We bring you customers, no monthly fee',
    description: 'Sell on ZaMarket in Lusaka. We make videos of your products, share them, contact customers and deliver. No joining fee, no monthly fee: you receive the full amount you set. Every seller is reviewed.',
    canonical: '/grow',
  })
  return <div className="affiliate-recruitment">
    <section className="affiliate-hero">
      <div className="affiliate-glow" aria-hidden="true" />
      <div className="affiliate-hero-inner">
        <p className="affiliate-eyebrow"><span /> ZAMARKET · FOR BUSINESSES IN LUSAKA</p>
        <h1>We bring you customers. <em>We only earn when you sell.</em></h1>
        <p className="affiliate-intro">Marketing agencies charge every month, whether you sell or not. ZaMarket works the other way: we make the videos, share your products, contact customers and deliver, and you pay no joining fee and no monthly fee. You set the amount you receive for each item, and you get it in full every time it sells.</p>
        <div className="affiliate-actions"><Link to="/apply/vendor" className="affiliate-button affiliate-button-primary">Apply to sell <span aria-hidden="true">↗</span></Link><a href="#what-we-do" className="affiliate-button affiliate-button-outline">What we do for you</a></div>
        <p className="affiliate-disclosure">Every seller is reviewed before joining. Sales depend on your products and on real customers; nobody can promise a number, but you will see every number, every week.</p>
        <div className="affiliate-metrics" aria-label="The offer"><div><strong>K0</strong><span>to join</span></div><div><strong>K0</strong><span>a month</span></div><div><strong>100%</strong><span>of your price to you</span></div><div><strong>Mon</strong><span>your real numbers</span></div></div>
      </div>
    </section>

    <section className="affiliate-section" id="what-we-do">
      <div className="affiliate-heading"><span>EVERY WEEK</span><h2>What we do for your business.</h2><p>The work an agency would charge you for, done for the sellers on ZaMarket.</p></div>
      <div className="affiliate-feature-grid">{week.map(([i, t, d]) => <div className="affiliate-feature" key={i}><span>{i}</span><h3>{t}</h3><p>{d}</p></div>)}</div>
    </section>

    <section className="affiliate-section">
      <div className="affiliate-heading"><span>THE DIFFERENCE</span><h2>An agency, or ZaMarket?</h2></div>
      <table className="grow-compare">
        <thead><tr><th /><th>A usual agency</th><th>ZaMarket</th></tr></thead>
        <tbody>{compare.map(([k, a, z]) => <tr key={k}><td><b>{k}</b></td><td>{a}</td><td>{z}</td></tr>)}</tbody>
      </table>
    </section>

    <section className="affiliate-section affiliate-two-col">
      <div className="affiliate-heading"><span>WE REVIEW EVERY SELLER</span><h2>Not everyone can join. That is why customers trust it.</h2><p>Before your shop goes live, we get to know your business. It protects the customers, and it protects you: you sell next to businesses that are as serious as you are.</p></div>
      <div className="affiliate-steps">{review.map(([t, d], i) => <div key={t}><b>{i + 1}</b><span><strong>{t}</strong><small>{d}</small></span></div>)}</div>
    </section>

    <section className="affiliate-section affiliate-two-col">
      <div className="affiliate-heading"><span>HOW TO START</span><h2>From applying to your first Monday report.</h2><p>Home bakers and cooks, small shops, boutiques, makers and traders in and around Lusaka.</p></div>
      <div className="affiliate-steps">
        <div><b>1</b><span><strong>Apply</strong><small>A few minutes: continue with Google and tell us about your business.</small></span></div>
        <div><b>2</b><span><strong>We review</strong><small>We contact you and see where you work from.</small></span></div>
        <div><b>3</b><span><strong>Add your products</strong><small>Photos, a clear description and the amount you want to receive. We help you.</small></span></div>
        <div><b>4</b><span><strong>We start promoting</strong><small>Videos, posts, affiliates and outreach.</small></span></div>
        <div><b>5</b><span><strong>Your Monday report</strong><small>Real numbers on WhatsApp, every week.</small></span></div>
      </div>
    </section>

    <section className="affiliate-section affiliate-faq"><div className="affiliate-heading"><span>GOOD TO KNOW</span><h2>Questions sellers ask us</h2></div><div>{faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
    <section className="affiliate-final"><span className="affiliate-eyebrow">ZAMARKET · LUSAKA</span><h2>Let us bring you customers.</h2><p>No joining fee, no monthly fee, and every number shown to you. Apply, and we will be in touch to review your business.</p><Link to="/apply/vendor" className="affiliate-button affiliate-button-primary">Apply to sell <span aria-hidden="true">↗</span></Link></section>
  </div>
}
