import { Link, useSearchParams } from 'react-router-dom'
import { useSeo } from '../../lib/seo'
import { applicationLink } from '../../lib/affiliateRecruitment'
import '../../affiliate-program.css'

const benefits = [
  ['01', 'Your personal referral link', 'Share a direct link to a product and let ZA Market track qualifying orders.'],
  ['02', 'Products and promotional tools', 'Discover products, see their current prices and use prepared marketing materials.'],
  ['03', 'Learn in the Academy', 'Start with practical lessons, then access recordings, scheduled live sessions and Q&A as they become available.'],
  ['04', 'See your own results', 'Your dashboard shows sales, commission status and payouts.'],
]
const faq = [
  ['Do I need previous sales experience?', 'No. You will have introductory lessons and practical activities. You do need a willingness to learn and promote products responsibly.'],
  ['Is this a job with a monthly salary?', 'No. This is an independent, commission-based affiliate opportunity. There is no fixed salary and no guaranteed income.'],
  ['Do I have to buy products or keep stock?', 'No. Affiliates share products; ZA Market handles order confirmation and fulfilment as described in the programme terms.'],
  ['When do I earn commission?', 'Commission depends on the product and a qualifying completed order. Cancelled, returned or fraudulent orders do not qualify. Your dashboard shows the current status.'],
  ['Will I receive training?', 'Yes. Nine introductory lessons are already included. Video lessons, live calls and Q&A will appear in the Academy when the team publishes or schedules them.'],
  ['What happens after applying?', 'Create your account, submit your application and wait for our team to review it. You can check the application status on the same page.'],
]

export default function AffiliateRecruitment() {
  const [params] = useSearchParams()
  const apply = applicationLink(params)
  useSeo({
    title: 'Become a ZA Market Affiliate in Zambia | Apply & Learn',
    description: 'Apply to become a ZA Market affiliate in Zambia. Promote products, access training and earn commission on qualifying completed sales. No fixed salary or guaranteed earnings.',
    canonical: '/affiliates',
  })
  return <div className="affiliate-recruitment">
    <section className="affiliate-hero">
      <div className="affiliate-glow" aria-hidden="true" />
      <div className="affiliate-hero-inner">
        <p className="affiliate-eyebrow"><span /> ZA MARKET · AFFILIATE PROGRAMME · ZAMBIA</p>
        <h1>Turn your ability to connect people into a <em>selling skill.</em></h1>
        <p className="affiliate-intro">Promote products from the ZA Market marketplace. Earn commission when qualifying sales are completed. Learn the process through our Affiliate Academy, using practical lessons and ready-to-use marketing tools.</p>
        <div className="affiliate-actions"><Link to={apply} className="affiliate-button affiliate-button-primary">Apply to join <span aria-hidden="true">↗</span></Link><a href="#how-it-works" className="affiliate-button affiliate-button-outline">See how it works</a></div>
        <p className="affiliate-disclosure">Commission-based independent work, not salaried employment. Earnings depend on actual completed sales and are not guaranteed. Applications are reviewed.</p>
        <div className="affiliate-metrics" aria-label="Programme essentials"><div><strong>01</strong><span>Apply online</span></div><div><strong>02</strong><span>Learn the system</span></div><div><strong>03</strong><span>Share products</span></div><div><strong>04</strong><span>Track qualifying sales</span></div></div>
      </div>
    </section>

    <section className="affiliate-section" id="how-it-works">
      <div className="affiliate-heading"><span>THE OPPORTUNITY</span><h2>Everything you need to start learning and selling.</h2><p>You do not need to set up your own online store or carry inventory. Focus on helping customers discover products that suit them.</p></div>
      <div className="affiliate-feature-grid">{benefits.map(([index, title, text]) => <div className="affiliate-feature" key={index}><span>{index}</span><h3>{title}</h3><p>{text}</p></div>)}</div>
    </section>

    <section className="affiliate-academy-teaser">
      <div className="affiliate-academy-copy"><span className="affiliate-eyebrow">ZA MARKET ACADEMY</span><h2>Not just a link. A place to learn how to sell.</h2><p>Follow short lessons, practise useful sales conversations, learn what to post on WhatsApp and social media, and receive guidance from the team.</p><div className="affiliate-course-tags"><span>9 starter lessons</span><span>Recorded lessons when published</span><span>Scheduled live calls</span><span>Questions and answers</span></div><Link className="affiliate-button affiliate-button-primary" to={apply}>Apply for Academy access</Link></div>
      <div className="affiliate-course-preview" aria-label="Sample Academy learning plan"><p className="affiliate-preview-label">STARTER PATH · YOUR LEARNING JOURNEY</p><div><span>01</span><strong>Understanding your commission</strong><small>Get the basics right</small></div><div><span>02</span><strong>Finding your first customers</strong><small>Choose the right products</small></div><div><span>03</span><strong>Content that earns attention</strong><small>Posts, stories and conversations</small></div><div><span>04</span><strong>Follow up professionally</strong><small>Build your sales habit</small></div><p className="affiliate-preview-footnote">Live events and additional videos are available only when scheduled or published.</p></div>
    </section>

    <section className="affiliate-section affiliate-two-col"><div className="affiliate-heading"><span>WHO CAN APPLY</span><h2>Start with your phone and your willingness to learn.</h2><p>Designed for people across Zambia who want to build a practical sales skill, including adult students, content creators, people already selling through social media and beginners. Product and delivery availability vary by area.</p><p>Use your own honest promotional messages and follow platform rules. No unsolicited bulk messaging, false product claims or fake earnings screenshots.</p></div><div className="affiliate-steps"><div><b>1</b><span><strong>Submit your application</strong><small>Tell us your name, contact details, location and interests.</small></span></div><div><b>2</b><span><strong>Receive a review decision</strong><small>We review applications and activate eligible accounts.</small></span></div><div><b>3</b><span><strong>Complete the training</strong><small>Open the Academy and learn how to sell responsibly.</small></span></div><div><b>4</b><span><strong>Share, improve and track</strong><small>Promote products, review performance and build consistency.</small></span></div></div></section>

    <section className="affiliate-section affiliate-faq"><div className="affiliate-heading"><span>GOOD TO KNOW</span><h2>Questions before you join?</h2></div><div>{faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
    <section className="affiliate-final"><span className="affiliate-eyebrow">ZA MARKET · ZAMBIA</span><h2>Ready to learn and promote real products?</h2><p>Apply to be considered for the affiliate programme and begin your ZA Market sales journey.</p><Link to={apply} className="affiliate-button affiliate-button-primary">Start my application <span aria-hidden="true">↗</span></Link></section>
  </div>
}
