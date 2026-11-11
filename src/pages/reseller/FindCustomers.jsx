import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money } from '../../lib/format'
import { commissionLabel } from '../../lib/economics'
import ShareProduct from '../../components/ShareProduct'
import { Loading, Empty, CopyLine, useToast } from '../../components/ui'
import { productShareUrl } from '../../lib/affiliateLinks'

const ROUTES = [
  {
    name: 'WhatsApp & communities',
    lead: 'Reach people who have shown an interest in this kind of product.',
    steps: [
      'Post one clear image or a short product video on your status, with the price and your tracked link.',
      'Answer product questions with verified details; ask permission before sending someone a direct message.',
      'Contribute helpfully in relevant groups and respect every group’s advertising rules.',
      'Follow up once with people who asked for details, unless they opt out.',
    ],
  },
  {
    name: 'Facebook & Instagram',
    lead: 'Make useful, searchable posts for buyers, not just broadcasts to friends.',
    steps: [
      'Pick a real customer question and show how the product fits their need.',
      'Use genuine seller photos or an approved ZaMarket poster; clearly show the current price.',
      'Use a relevant local caption and your tracked product link. Reels can demonstrate features when real footage is available.',
      'Reply promptly to genuine enquiries and track which products bring completed orders.',
    ],
  },
  {
    name: 'TikTok & video',
    lead: 'Show what a product actually does, using real video you have permission to use.',
    steps: [
      'Make a short demonstration, unpacking, comparison, or answer to a common question.',
      'Lead with the real problem or feature, not an exaggerated income or discount claim.',
      'Add accurate price and availability information; guide interested viewers to the product link in your profile or permitted location.',
      'Repeat the formats that produce qualified enquiries and completed purchases.',
    ],
  },
  {
    name: 'Workplaces & referrals',
    lead: 'Reach relevant buyers through genuine introductions and group opportunities.',
    steps: [
      'Approach office organisers or businesses with products actually useful to them.',
      'Offer to answer practical questions or help coordinate an enquiry; never claim unapproved discounts.',
      'Use the tracked product link when you introduce the offer.',
      'For group enquiries, confirm stock, price and fulfilment with ZaMarket before making commitments.',
    ],
  },
]

const wa = text => `https://wa.me/?text=${encodeURIComponent(text)}`
const getFirst = value => Array.isArray(value) ? value.find(x => typeof x === 'string' && x.trim()) : null
const safeFacts = p => (Array.isArray(p?.benefits) ? p.benefits : []).filter(x => typeof x === 'string' && x.trim()).slice(0, 3)

function messagesFor(product, link) {
  if (!product) return []
  const name = product.name
  const price = money(product.price)
  const vendor = product.vendor_name ? ` from ${product.vendor_name}` : ''
  const details = safeFacts(product)
  const benefits = details.length ? `\n${details.map(x => `• ${x}`).join('\n')}` : ''
  const enquiry = ['negotiate', 'enquire'].includes(product.sales_model)
  const action = enquiry ? 'View the details and enquire' : 'See the real photographs and current ordering details'
  return [
    {
      label: 'Social media caption',
      text: `Looking for ${name.toLowerCase()}?\n\n${name}${vendor} is listed on ZaMarket at ${price}.${benefits}\n\n${action}:\n${link}`,
    },
    {
      label: 'Personal reply to an interested buyer',
      text: `Hi {name}, following up on your interest in ${name}. The current listed price is ${price}.${details[0] ? `\n${details[0]}` : ''}\n\nYou can see the photos and full details here: ${link}\n\nIs there anything specific you'd like me to check?`,
    },
    {
      label: 'Offer-focused post (only genuine offers)',
      text: `${name}${vendor}\nPrice: ${price}${product.normal_price > product.price ? `\nPrevious listed price: ${money(product.normal_price)}` : ''}${benefits}\n\n${action}: ${link}`,
    },
  ]
}

export default function FindCustomers() {
  const { profile, settings } = useAuth()
  const toast = useToast()
  const r = profile?.partner
  const [productId, setProductId] = useState('')
  const [route, setRoute] = useState(0)
  const [messageIndex, setMessageIndex] = useState(0)
  const { data, loading } = useData(async () => ({
    products: await q(supabase.from('public_products').select('*').eq('status', 'published').order('name').limit(150)),
    summary: r ? await q(supabase.rpc('reseller_summary', { p_reseller: r.id })) : null,
    vehicleRewards: r ? (await supabase.rpc('affiliate_vehicle_reward_estimates')).data || [] : [],
  }), [r?.id])

  const products = data?.products || []
  const product = products.find(p => p.id === productId) || products[0]
  const link = product ? productShareUrl(window.location.origin, product, 'reseller', r?.code) : ''
  const baseLink = r?.code ? `${window.location.origin}/r/${r.code}` : ''
  const messages = useMemo(() => messagesFor(product, link), [product, link])
  const earned = p => p.offering_type === 'vehicle' ? Number(data?.vehicleRewards?.find(x => x.product_id === p.id)?.estimated_reward || 0) : commissionLabel(p, settings).perUnit
  const active = ROUTES[route] || ROUTES[0]
  const activeMessage = messages[messageIndex] || messages[0]
  const copy = async (value) => {
    try { await navigator.clipboard.writeText(value); toast('Copied. Check the price and details before posting.') }
    catch { toast('Could not copy. Select the text to copy it.', true) }
  }

  if (!r) return <Empty title="No affiliate profile">This account is not linked to an approved affiliate.</Empty>
  if (loading) return <Loading />
  const s = data?.summary || {}
  return (
    <div className="affiliate-studio stack">
      <header className="aff-studio-intro">
        <div>
          <span className="eyebrow">ZAMARKET / AFFILIATE STUDIO</span>
          <h1>Create. Share. Earn.</h1>
          <p>Choose a real listing, make a beautiful promotion and share a link that credits your account.</p>
        </div>
        <Link to="/sell/earnings" className="aff-studio-results">My earnings <span aria-hidden="true">↗</span></Link>
      </header>

      <div className="aff-studio-process" aria-label="Promotion steps">
        <span className="is-current"><b>01</b> Pick a product</span>
        <span><b>02</b> Create a poster</span>
        <span><b>03</b> Share &amp; follow up</span>
      </div>

      <section className="aff-studio-panel" aria-labelledby="aff-products-title">
        <div className="aff-studio-section-top">
          <div><span className="eyebrow">YOUR CATALOGUE</span><h2 id="aff-products-title">What would you like to promote?</h2></div>
          <Link to="/sell/products" className="aff-studio-text-link">Explore all products <span aria-hidden="true">→</span></Link>
        </div>
        {!product ? <Empty title="No published products yet">Try again when a seller has a live listing.</Empty> : (
          <>
            <div className="aff-studio-products" aria-label="Choose a product to promote">
              {products.map(p => (
                <button type="button" key={p.id} onClick={() => { setProductId(p.id); setMessageIndex(0) }} aria-pressed={product.id === p.id} className={`aff-studio-product-choice ${product.id === p.id ? 'is-selected' : ''}`}>
                  {getFirst(p.images) ? <img src={getFirst(p.images)} alt="" loading="lazy" /> : <span className="aff-studio-photo-fallback">Photo not available</span>}
                  <span className="aff-studio-choice-body"><strong>{p.name}</strong><small>{money(p.price)}</small></span>
                </button>
              ))}
            </div>

            <div className="aff-studio-product-feature">
              <div className="aff-studio-product-photo">
                {getFirst(product.images) ? <img src={getFirst(product.images)} alt={product.name} loading="lazy" /> : <div className="aff-studio-photo-fallback">Ask the seller for an authentic product photograph</div>}
                <span className="aff-studio-photo-pill">Actual listing photo</span>
              </div>
              <div className="aff-studio-product-copy">
                <span className="eyebrow">READY TO PROMOTE</span>
                <h3>{product.name}</h3>
                <p className="aff-studio-seller">{product.vendor_name || 'ZaMarket seller'}</p>
                <div className="aff-studio-product-price"><span>Customer price</span><strong>{money(product.price)}</strong></div>
                <div className="aff-studio-reward"><span>Your estimated reward per qualified sale</span><strong>{product.offering_type === 'vehicle' && !earned(product) ? 'To be confirmed' : money(earned(product))}</strong></div>
                <p className="aff-studio-disclaimer">Final earnings depend on the agreed commission, completed sale and applicable checks.</p>
                <div className="aff-studio-actions">
                  <ShareProduct product={product} store={product.vendor_name ? { business_name: product.vendor_name, logo_url: product.vendor_logo, location: product.vendor_location, category: product.vendor_category } : null} settings={settings} link={link} className="btn primary" label="Create promotion poster" />
                  <a className="btn" href={wa(messages[0]?.text || link)} target="_blank" rel="noreferrer">WhatsApp message</a>
                </div>
              </div>
            </div>
            <div className="aff-studio-link-row">
              <div><strong>Tracked product link</strong><small>Every sale attributed through this link follows your affiliate terms.</small></div>
              <div className="aff-studio-copy-line"><CopyLine text={link} /></div>
            </div>
          </>
        )}
      </section>

      {product && <section className="aff-studio-panel" aria-labelledby="aff-messages-title">
        <div className="aff-studio-section-top"><div><span className="eyebrow">COPY &amp; SHARE</span><h2 id="aff-messages-title">Your ready-to-edit message</h2></div><span className="aff-studio-mini-note">Only verified product facts</span></div>
        <div className="aff-studio-segments" role="group" aria-label="Choose message type">
          {messages.map((m, i) => <button type="button" key={m.label} className={i === messageIndex ? 'is-selected' : ''} aria-pressed={i === messageIndex} onClick={() => setMessageIndex(i)}>{['Social post', 'Reply to buyer', 'Product offer'][i]}</button>)}
        </div>
        <div className="aff-studio-message-preview"><p>{activeMessage?.text}</p></div>
        <div className="aff-studio-message-actions"><button type="button" className="btn primary" onClick={() => copy(activeMessage?.text || '')}>Copy message</button><a className="btn" href={wa(activeMessage?.text || '')} target="_blank" rel="noreferrer">Open WhatsApp</a></div>
        <p className="tiny muted">Adapt the message for your audience. Never imply you used the product or promise discounts or delivery that the seller hasn't confirmed.</p>
      </section>}

      <section className="aff-studio-panel aff-studio-growth" aria-labelledby="aff-growth-title">
        <div className="aff-studio-section-top"><div><span className="eyebrow">GROW YOUR SALES</span><h2 id="aff-growth-title">Where to find interested buyers</h2></div><Link to="/sell/training" className="aff-studio-text-link">Go to Academy <span aria-hidden="true">↗</span></Link></div>
        <div className="aff-studio-segments aff-studio-channels" role="group" aria-label="Promotion channel">
          {ROUTES.map((item, i) => <button type="button" className={route === i ? 'is-selected' : ''} onClick={() => setRoute(i)} key={item.name} aria-pressed={route === i}>{item.name}</button>)}
        </div>
        <p className="aff-studio-channel-intro">{active.lead}</p>
        <ol className="aff-studio-channel-steps">{active.steps.map(step => <li key={step}>{step}</li>)}</ol>
      </section>

      <div className="aff-studio-bottom-line">
        <div><strong>{s.sales_month ?? 0}</strong><span>Orders placed this month</span></div>
        <div><strong>{money(s.pending ?? 0)}</strong><span>Pending approval</span></div>
        <Link to="/sell/earnings">See full performance <span aria-hidden="true">→</span></Link>
      </div>
      <details className="aff-studio-other-link"><summary>Need your general marketplace referral link?</summary><CopyLine text={baseLink} /><p className="tiny muted">For a particular product, use the tracked product link above instead.</p></details>
    </div>
  )
}
