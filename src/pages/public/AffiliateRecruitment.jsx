import { Link, useSearchParams } from 'react-router-dom'
import { useSeo } from '../../lib/seo'
import { applicationLink } from '../../lib/affiliateRecruitment'
import '../../affiliate-program.css'

const benefits = [
  ['01', 'Your personal referral link', 'Share a direct link to a product and let ZaMarket track qualifying orders.'],
  ['02', 'Products and promotional tools', 'Discover products, see their current prices and use prepared marketing materials.'],
  ['03', 'Training is provided', 'Approved affiliates are invited into our academy and taught how this is done properly. The training runs there, not as notes inside the marketplace.'],
  ['04', 'See your own results', 'Your dashboard shows sales, commission status and payouts.'],
]
const faq = [
  ['Does it cost anything to join?', 'No. Joining is free, and you never pay to share products. You do not buy stock.'],
  ['How long does applying take?', 'About two minutes: continue with Google, answer a few questions about you, and send. Our team reviews every application.'],
  ['Do I need previous sales experience?', 'No. The training starts from the beginning. You do need a willingness to learn and to promote products responsibly.'],
  ['Is this a job with a monthly salary?', 'No. This is an independent, commission-based affiliate opportunity. There is no fixed salary and no guaranteed income.'],
  ['Do I have to buy products or keep stock?', 'No. Affiliates share products; ZaMarket handles order confirmation and fulfilment as described in the programme terms.'],
  ['When do I earn commission?', 'Commission depends on the product and a qualifying completed order. Cancelled, returned or fraudulent orders do not qualify. Your dashboard shows the current status.'],
  ['Will I receive training?', 'Yes. Once your application is approved, you are given access to our academy, which is a separate learning platform with its own sign-in. ZaMarket itself is where you get your link, browse products and see your earnings. The academy details are sent to you after approval.'],
  ['What happens after applying?', 'Create your account, submit your application and wait for our team to review it. You can check the application status on the same page.'],
]

export default function AffiliateRecruitment() {
  const [params] = useSearchParams()
  const apply = applicationLink(params)
  useSeo({
    title: 'Become a ZaMarket Affiliate in Zambia | Apply & Learn',
    description: 'Apply to become a ZaMarket affiliate in Zambia. Promote products, access training and earn commission on qualifying completed sales. No fixed salary or guaranteed earnings.',
    canonical: '/affiliates',
  })
  return <div className="affiliate-recruitment">
    <section className="affiliate-hero">
      <div className="affiliate-glow" aria-hidden="true" />
      <div className="affiliate-hero-inner">
        <p className="affiliate-eyebrow"><span /> ZAMARKET · AFFILIATE PROGRAMME · ZAMBIA</p>
        <h1>Get paid for <em>recommending</em> things people need.</h1>
        <p className="affiliate-intro">You already tell friends where to buy things. Every time they buy, the shop gets a customer and you get nothing. As a ZaMarket affiliate, you share a product with your own link, and when someone buys through it and the order is completed, you earn a commission. Free to join. No shop, no stock, no money to start: just your phone.</p>
        <div className="affiliate-actions"><Link to={apply} className="affiliate-button affiliate-button-primary">Apply to join <span aria-hidden="true">↗</span></Link><a href="#how-it-works" className="affiliate-button affiliate-button-outline">See how it works</a></div>
        <p className="affiliate-disclosure">Commission-based independent work, not salaried employment. Earnings depend on actual completed sales and are not guaranteed. Applications are reviewed.</p>
        <div className="affiliate-metrics" aria-label="Programme essentials"><div><strong>01</strong><span>Apply online</span></div><div><strong>02</strong><span>Learn the system</span></div><div><strong>03</strong><span>Share products</span></div><div><strong>04</strong><span>Track qualifying sales</span></div></div>
      </div>
    </section>

    <section className="affiliate-section affiliate-simple" id="how-it-works">
      <div className="affiliate-heading"><span>IN SIMPLE WORDS</span><h2>What is affiliate marketing?</h2><p>It is recommending, with a link that remembers it was you. Big shops around the world pay people this way. In Zambia it is new, so we explain it properly and teach you how to do it.</p></div>
      <div className="affiliate-howto">
        <div><b>1</b><strong>Pick a product</strong><small>From real Lusaka sellers on ZaMarket: cakes, weekly lunch, home goods, cars and more. Your dashboard shows the commission on each one before you share it.</small></div>
        <div><b>2</b><strong>Share your link</strong><small>On your WhatsApp Status, in a chat with someone who needs it, on Facebook or TikTok. Ready-made posters and captions are given to you.</small></div>
        <div><b>3</b><strong>Someone buys</strong><small>ZaMarket confirms the order, collects the payment and delivers. You do not handle money or goods.</small></div>
        <div><b>4</b><strong>You earn</strong><small>When the order is completed, the commission shows in your dashboard and is paid out to you.</small></div>
      </div>
      <div className="affiliate-example">
        <p className="affiliate-preview-label">AN EXAMPLE OF HOW IT ADDS UP</p>
        <p>Say a product pays <b>K40</b> commission. You share it on your Status, and over a month <b>5 people</b> buy through your link and their orders are completed. That is <b>K200</b>. Share three products like that and help 15 people, and it is K600.</p>
        <small>These numbers are only an example to show the idea. Real commission is different for each product and is shown in your dashboard. Nobody can promise income: you earn only on completed sales you brought.</small>
      </div>
      <div className="affiliate-fit">
        <div><strong>Good for you if</strong><ul><li>you have many contacts on WhatsApp, or friends at work and in your groups</li><li>people often ask you where to buy things</li><li>you are a student, a creator, already selling on Facebook, or simply want a skill</li></ul></div>
        <div><strong>What you need</strong><ul><li>a smartphone with WhatsApp</li><li>a Google account (to sign in safely: your earnings stay tied to it)</li><li>an hour or two a week to share and reply</li></ul></div>
      </div>
    </section>

    <section className="affiliate-section">
      <div className="affiliate-heading"><span>THE OPPORTUNITY</span><h2>Everything you need to start learning and selling.</h2><p>You do not need to set up your own online store or carry inventory. Focus on helping customers discover products that suit them.</p></div>
      <div className="affiliate-feature-grid">{benefits.map(([index, title, text]) => <div className="affiliate-feature" key={index}><span>{index}</span><h3>{title}</h3><p>{text}</p></div>)}</div>
    </section>

    <section className="affiliate-academy-teaser">
      <div className="affiliate-academy-copy"><span className="affiliate-eyebrow">TRAINING</span><h2>Not just a link. You are taught how to sell.</h2><p>Nobody is handed a referral link and left to work it out. Approved affiliates are taken through the real thing: how a commission actually works, how to talk to a customer without exaggerating, what to put on WhatsApp, and how to follow up like a professional.</p><div className="affiliate-course-tags"><span>Taught, not self-service</span><span>Starts from the beginning</span><span>Practical, phone-first</span><span>Honest selling only</span></div><Link className="affiliate-button affiliate-button-primary" to={apply}>Apply to join</Link></div>
      <div className="affiliate-course-preview" aria-label="What the training covers"><p className="affiliate-preview-label">WHAT THE TRAINING COVERS</p><div><span>01</span><strong>Understanding your commission</strong><small>Get the basics right</small></div><div><span>02</span><strong>Finding your first customers</strong><small>Choose the right products</small></div><div><span>03</span><strong>Content that earns attention</strong><small>Posts, stories and conversations</small></div><div><span>04</span><strong>Follow up professionally</strong><small>Build your sales habit</small></div><p className="affiliate-preview-footnote">The training runs in our academy, which is a separate platform with its own sign-in. Details are sent to you once your application is approved.</p></div>
    </section>

    <section className="affiliate-section affiliate-two-col"><div className="affiliate-heading"><span>WHO CAN APPLY</span><h2>Start with your phone and your willingness to learn.</h2><p>Designed for people across Zambia who want to build a practical sales skill, including adult students, content creators, people already selling through social media and beginners. Product and delivery availability vary by area.</p><p>Use your own honest promotional messages and follow platform rules. No unsolicited bulk messaging, false product claims or fake earnings screenshots.</p></div><div className="affiliate-steps"><div><b>1</b><span><strong>Submit your application</strong><small>Tell us your name, contact details, location and interests.</small></span></div><div><b>2</b><span><strong>Receive a review decision</strong><small>We review applications and activate eligible accounts.</small></span></div><div><b>3</b><span><strong>Complete the training</strong><small>You are sent into our academy and taught how to sell responsibly.</small></span></div><div><b>4</b><span><strong>Share, improve and track</strong><small>Promote products, review performance and build consistency.</small></span></div></div></section>

    <section className="affiliate-section affiliate-faq"><div className="affiliate-heading"><span>GOOD TO KNOW</span><h2>Questions before you join?</h2></div><div>{faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
    <section className="affiliate-final"><span className="affiliate-eyebrow">ZAMARKET · ZAMBIA</span><h2>Ready to learn and promote real products?</h2><p>Apply to be considered for the affiliate programme and begin your ZaMarket sales journey.</p><Link to={apply} className="affiliate-button affiliate-button-primary">Start my application <span aria-hidden="true">↗</span></Link></section>
  </div>
}
