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
      <h1>About {name}</h1>
      <p className="lead">We are a Lusaka marketplace. Local sellers list what they sell, we take the order, confirm it by phone, and deliver it. You pay when you receive it.</p>

      <section className="card stack-sm">
        <h2>Talk to a person</h2>
        <ul className="contact-list">
          {phone && <li><span>Phone</span><a href={`tel:${phone}`}>{phone}</a></li>}
          {wa && <li><span>WhatsApp</span><a href={`https://wa.me/${String(wa).replace(/\D/g, '').replace(/^0/, '260')}`} target="_blank" rel="noreferrer">{wa}</a></li>}
          {email && <li><span>Email</span><a href={`mailto:${email}`}>{email}</a></li>}
          {address && <li><span>Find us</span><span>{address}</span></li>}
          {reg && <li><span>Registration</span><span>{reg}</span></li>}
        </ul>
        {socials.length > 0 && (
          <div className="btn-row">{socials.map(([label, url]) => <a key={label} className="btn sm" href={url} target="_blank" rel="noreferrer">{label}</a>)}</div>
        )}
        {!phone && !wa && !email && <p className="small muted">Contact details are being set up.</p>}
      </section>

      <section className="card stack-sm">
        <h2>If you are buying</h2>
        <ul className="plain-list">
          <li>You pay nothing until we have called you and agreed the price and delivery.</li>
          <li>You pay when the order reaches you, unless you choose to pay earlier.</li>
          <li>If what arrives is not what was described, tell us and we will put it right.</li>
          <li>We only ask for your name, phone and where to deliver. Nothing else.</li>
        </ul>
      </section>

      <section className="card stack-sm">
        <h2>If you are selling with us</h2>
        <ul className="plain-list">
          <li>Listing is free. We take a share only when something sells.</li>
          <li>You keep your own customers. Bring them through your own store link and our fee is smaller.</li>
          <li>We pay you after the order is delivered and checked. You can ask to be paid from your dashboard.</li>
          <li>To start selling everyday items we need your business name, phone and area. Nothing more.</li>
          <li>For expensive items, or before large payouts, we meet you and check an ID or PACRA paper. <strong>We record that the check happened, not your ID number.</strong></li>
          <li>You must own what you sell, or have the owner's permission. Anything suspected stolen is removed and reported.</li>
        </ul>
        <div className="btn-row"><Link className="btn primary" to="/apply/vendor">Sell on ZaMarket</Link><Link className="btn" to="/apply/reseller">Become an affiliate</Link></div>
      </section>

      <section className="card stack-sm">
        <h2>What we do with your details</h2>
        <ul className="plain-list">
          <li>We use your phone and address to deliver your order and nothing else.</li>
          <li>We do not sell anyone's details to anybody.</li>
          <li>Sellers only see a customer's phone and address after an order is confirmed, so they can deliver it.</li>
          <li>Ask us to delete your details and we will, unless we must keep a record of a sale.</li>
        </ul>
      </section>
    </div>
  )
}
