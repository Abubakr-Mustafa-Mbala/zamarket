import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSeo } from '../../lib/seo'
import { Loading } from '../../components/ui'

// Who we are, how to reach us, and what we promise. A new business has to say this plainly.
export default function About() {
  const [s, setS] = useState(null)
  useSeo({ title: 'About ZaMarket — who we are and how to reach us', description: 'ZaMarket is a Lusaka marketplace. Here is who runs it, how to contact a real person, and what we promise buyers and sellers.' })
  useEffect(() => {
    supabase.from('settings').select('key,value').then(({ data }) => {
      setS(Object.fromEntries((data || []).map((r) => [r.key, typeof r.value === 'string' ? r.value : r.value])))
    })
  }, [])
  if (!s) return <Loading />
  const val = (k) => { const v = s[k]; return typeof v === 'string' ? v.replace(/^"|"$/g, '') : v }
  const name = val('business_name') || 'ZaMarket'
  const phone = val('company_phone')
  const wa = val('company_whatsapp')
  const email = val('company_email')
  const address = val('company_address')
  const reg = val('company_registration')
  const socials = [['Facebook', val('social_facebook')], ['Instagram', val('social_instagram')], ['TikTok', val('social_tiktok')]].filter(([, u]) => u)

  return (
    <div className="about">
      <header className="about-head">
        <h1>About {name}</h1>
        <p className="lead">{name} is a marketplace in Lusaka. Local sellers list what they make and sell; we take the order, call the customer to confirm it, and deliver it. Money changes hands when the goods do.</p>
        <p className="lead">We started it because buying online here usually means paying a stranger first and hoping. That is the part we removed.</p>
      </header>

      <section className="about-contact">
        <div>
          <h2>Talk to a person</h2>
          <p className="small muted">Any working day. A real number, answered by us.</p>
          <ul className="contact-list">
            {phone && <li><span>Phone</span><a href={`tel:${phone}`}>{phone}</a></li>}
            {wa && <li><span>WhatsApp</span><a href={`https://wa.me/${String(wa).replace(/\D/g, '').replace(/^0/, '260')}`} target="_blank" rel="noreferrer">{wa}</a></li>}
            {email && <li><span>Email</span><a href={`mailto:${email}`}>{email}</a></li>}
            {address && <li><span>Find us</span><span>{address}</span></li>}
            {reg && <li><span>Registration</span><span>{reg}</span></li>}
          </ul>
          {!phone && !wa && !email && <p className="small muted">Contact details are being set up.</p>}
          {socials.length > 0 && <div className="btn-row mt">{socials.map(([label, url]) => <a key={label} className="btn sm" href={url} target="_blank" rel="noreferrer">{label}</a>)}</div>}
        </div>
      </section>

      <section className="about-cols">
        <article>
          <h2>Buying from us</h2>
          <p>You order online. We call you to agree the delivery and the price before anything is paid. When the order reaches you, you pay — cash or mobile money, whichever suits.</p>
          <p>If what arrives is not what was described, tell us and we will put it right. We only ever ask for your name, your phone and where to deliver.</p>
        </article>
        <article>
          <h2>Selling with us</h2>
          <p>Listing costs nothing. We earn a share only when something of yours sells, and you are paid after the customer has received it. You can ask to be paid from your dashboard whenever there is money waiting.</p>
          <p>Bring your own customers through your store link and our share is smaller, because you did the work of finding them.</p>
        </article>
        <article>
          <h2>Checks on sellers</h2>
          <p>To sell everyday items we need a business name, a phone number and the area you work from. That is all, and you can start the same day.</p>
          <p>Before anyone lists expensive items, or takes a large payout, we meet them and look at an NRC or PACRA paper. <strong>We write down that the check happened. We do not keep the ID number.</strong></p>
          <p>Everything sold here must belong to the seller, or be sold with the owner's permission.</p>
        </article>
        <article>
          <h2>Your details</h2>
          <p>Your phone and address are used to deliver your order, and for nothing else. We do not sell anyone's details to anybody.</p>
          <p>A seller sees a customer's phone and address only after an order is confirmed, so they can prepare and deliver it. Ask us to delete your details and we will, except where we must keep a record of a sale.</p>
        </article>
      </section>

      <section className="about-cta">
        <div>
          <h2>Sell with us, or earn from sharing</h2>
          <p className="small muted">Two ways in. Both are free to start.</p>
        </div>
        <div className="btn-row"><Link className="btn primary" to="/apply/vendor">Sell on ZaMarket</Link><Link className="btn" to="/apply/reseller">Become an affiliate</Link></div>
      </section>
    </div>
  )
}
