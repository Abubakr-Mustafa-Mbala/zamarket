import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, n } from '../../lib/format'
import { commissionLabel } from '../../lib/economics'
import { buildIdeas, WEEK_PLAN } from '../../lib/contentIdeas'
import ShareThis from '../../components/ShareThis'
import { Loading, Empty, CopyLine, useToast, Select, Field } from '../../components/ui'

const wa = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`

// Four ways to find customers. Plain, honest, and doable from a phone.
const WAYS = [
  {
    key: 'known', title: 'People you already know', target: '10 people today',
    what: 'Family, friends, church, work, neighbours, old school group, your WhatsApp contacts.',
    how: [
      'Open your WhatsApp contacts and pick 10 people you have spoken to this year.',
      'Send one person at a time, with their name in it. Never a broadcast list.',
      "Ask about them first. Then mention what you're selling, once.",
      'If they say no, thank them and ask if they know someone who might need it.',
    ],
  },
  {
    key: 'status', title: 'Your status and social posts', target: '1 post a day',
    what: 'WhatsApp status, Facebook, TikTok, Instagram. Free, and people already follow you.',
    how: [
      'Post a real photo of the product, not a poster.',
      'Say the price, where you deliver, and how to order.',
      'Show it being used, or your own honest opinion of it.',
      'Put your link in the caption, and repeat it in the comments.',
    ],
  },
  {
    key: 'groups', title: 'Groups and places where people gather', target: '3 groups a week',
    what: 'WhatsApp and Facebook buying-and-selling groups, estate groups, work groups, markets, salons, offices.',
    how: [
      'Check the group rules first. Some ban selling, and getting removed helps nobody.',
      'Answer questions in the group before you ever sell anything.',
      'Post once, clearly, with a photo and the price.',
      'Reply to every comment quickly, even the rude ones.',
    ],
  },
  {
    key: 'strangers', title: 'People you have not met yet', target: '5 a day',
    what: 'Shops, offices, salons, taxi ranks, hostels, anyone whose work matches the product.',
    how: [
      "Lead with a question, not a pitch: 'Do you ever get asked for this?'",
      'Show them the product on your phone.',
      'Take their number and message them the same day.',
      'Follow up once after two days. Then leave it.',
    ],
  },
]

const OBJECTIONS = [
  ['It is too expensive', "Ask what they're comparing it to. Then explain what's included — delivery, the warranty, the quality. If it's still too much, offer a cheaper product instead of dropping the price."],
  ["I'll think about it", "Fine. Ask: 'What would you need to know to decide?' Then answer that, and agree when you'll check back."],
  ['Is it original?', 'Say exactly what you know and nothing more. Show the photos, and say where it comes from. Never promise what you cannot back up.'],
  ["I don't trust buying online", 'They pay when they receive it. ZaMarket calls to confirm every order before anything is paid.'],
  ['Can I get a discount?', "You don't set prices, but tell them about any live offer. If there isn't one, say so honestly."],
  ['Send it and I pay later', 'Say no politely. Orders are confirmed by ZaMarket and paid on delivery.'],
]

export default function FindCustomers() {
  const { profile, settings } = useAuth()
  const toast = useToast()
  const r = profile?.partner
  const [productId, setProductId] = useState('')
  const [way, setWay] = useState('known')
  const { data, loading } = useData(async () => ({
    products: await q(supabase.from('public_products').select('id,name,slug,price,normal_price,description,benefits,commission_type,commission_value,vendor_slug,fulfilment,boost_pct,boost_until').eq('status', 'published').order('name')),
    summary: r ? await q(supabase.rpc('reseller_summary', { p_reseller: r.id })) : null,
  }), [r?.id])

  const product = (data?.products || []).find((p) => p.id === productId) || (data?.products || [])[0]
  const link = r ? `${window.location.host}/r/${r.code}` : ''
  const productLink = product && r ? `${window.location.host}/r/${r.code}/${product.slug}` : link
  const earn = product ? commissionLabel(product, settings) : null

  const messages = useMemo(() => {
    if (!product) return []
    const price = money(product.price)
    const benefit = (product.benefits || [])[0]
    return [
      { label: 'Someone you know', text: `Hi ${'{name}'}, how are you? I've started selling on ZaMarket. We have ${product.name} at ${price}${benefit ? ` — ${benefit.toLowerCase()}` : ''}. Delivery in Lusaka. Want me to send you the details?\n\n${productLink}` },
      { label: 'Status or social post', text: `${product.name} — ${price}\n${(product.benefits || []).slice(0, 3).map((b) => `• ${b}`).join('\n')}\nDelivery in Lusaka, pay when you receive it.\nOrder here: ${productLink}` },
      { label: 'A group', text: `Selling ${product.name} at ${price}. ${benefit || ''} Delivery in Lusaka, other areas arranged. Order through ZaMarket here: ${productLink}` },
      { label: 'Following up', text: `Hi ${'{name}'}, just checking if you still want the ${product.name}. No problem either way — I'll keep you posted if the price changes.` },
      { label: 'After they buy', text: `Thank you! ZaMarket will call you to confirm and arrange delivery. If you're happy with it, telling one friend helps me a lot.` },
    ]
  }, [product, productLink])

  if (!r) return <Empty title="No reseller profile">Your account isn't linked to an approved reseller application.</Empty>
  if (loading) return <Loading />
  const s = data.summary || {}
  const active = WAYS.find((w) => w.key === way)

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Find customers</h1>
          <p>You don't need to be a salesperson. You need to tell enough people, honestly, every day.</p>
        </div>
      </div>

      <div className="fc-plan">
        <div>
          <h3>Your plan for today</h3>
          <ol>
            <li>Message <strong>10 people you know</strong>, one at a time</li>
            <li>Post <strong>once</strong> on your status or social media</li>
            <li>Follow up with <strong>anyone who replied yesterday</strong></li>
          </ol>
          <p className="tiny muted">Do this for two weeks before deciding whether it works. Most sales come after the second message, not the first.</p>
        </div>
        <div className="fc-score">
          <div><b>{s.sales_today ?? 0}</b><span>sales today</span></div>
          <div><b>{s.sales_month ?? 0}</b><span>this month</span></div>
          <div><b>{money(s.pending ?? 0)}</b><span>waiting to be paid</span></div>
          <div><b>{money(s.paid ?? 0)}</b><span>paid to you</span></div>
        </div>
      </div>

      <section className="card stack-sm">
        <h3>Your link</h3>
        <p className="small muted">Every sale through this link is credited to you. Share the product link when you're talking about one thing, and the main link otherwise.</p>
        <CopyLine text={`https://${link}`} />
        <ShareThis store={{ business_name: 'ZaMarket', tagline: 'Everything in one place, delivered in Lusaka', category: 'Marketplace', town: 'Lusaka', product_count: (data.products || []).length }}
          products={data.products || []} link={`https://${link}`}
          caption={`Everything I sell is here — phones, home goods, cakes made to order and services. Delivered in Lusaka, you pay when you receive it.\nShop here: https://${link}`}
          className="btn buy" label="Make a picture of the shop" />
        {product && <CopyLine text={`https://${productLink}`} />}
      </section>

      <section className="card stack-sm">
        <div className="between"><h3>Ready messages</h3>
          <Field label=""><Select value={product?.id || ''} onChange={setProductId} options={(data.products || []).map((p) => [p.id, p.name])} /></Field>
        </div>
        {!product ? <p className="small muted">No products published yet.</p> : (
          <>
            <p className="small">You earn <strong className="copper">{earn.text}</strong> on {product.name} — about {money(earn.perUnit)} per sale.</p>
            {messages.map((m) => (
              <div key={m.label} className="msg">
                <div className="between"><strong className="small">{m.label}</strong>
                  <div className="btn-row">
                    <button className="btn sm" onClick={() => { navigator.clipboard.writeText(m.text).then(() => toast('Copied')) }}>Copy</button>
                    <a className="btn sm buy" href={wa(m.text)} target="_blank" rel="noreferrer">WhatsApp</a>
                  </div>
                </div>
                <div className="share-box">{m.text}</div>
              </div>
            ))}
            <p className="tiny muted">Replace {'{name}'} with the person's name. A message written to one person works far better than the same message sent to everyone.</p>
          </>
        )}
      </section>

      <PostIdeas products={data.products || []} code={r.code} settings={settings} />

      <section className="card stack-sm">
        <h3>Where to find people</h3>
        <div className="chips wrap">{WAYS.map((w) => <button key={w.key} className={`chip ${way === w.key ? 'on' : ''}`} onClick={() => setWay(w.key)}>{w.title}</button>)}</div>
        <div className="fc-way">
          <p className="strong">{active.what}</p>
          <p className="small muted">Aim for {active.target}.</p>
          <ol className="fc-steps">{active.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
        </div>
      </section>

      <section className="card stack-sm">
        <h3>When they hesitate</h3>
        {OBJECTIONS.map(([q1, a]) => <div key={q1} className="faq"><strong>“{q1}”</strong><p className="small">{a}</p></div>)}
      </section>

      <section className="card stack-sm">
        <h3>The rules, plainly</h3>
        <ul className="fc-rules">
          <li>Never promise what a product cannot do. One angry customer costs more than one sale.</li>
          <li>Don't take money yourself. ZaMarket confirms and collects, then pays you.</li>
          <li>Don't buy through your own link. It isn't paid.</li>
          <li>Don't spam. Getting blocked ends your reach.</li>
          <li>You're paid after the customer receives the order, once it's checked.</li>
        </ul>
        <Link to="/sell/products" className="btn">See all products and what you earn</Link>
      </section>
    </div>
  )
}


// The same posting plan the marketplace uses, with the affiliate's own link in every caption.
function PostIdeas({ products, code, settings }) {
  const toast = useToast()
  const [shown, setShown] = useState(6)
  const ideas = useMemo(() => buildIdeas(products, null, window.location.origin, code), [products, code])
  if (!ideas.length) return null
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('Copied') } catch { toast('Could not copy', true) } }
  return (
    <section className="card stack-sm">
      <h3>What to post</h3>
      <p className="small muted">Ready posts using your link, so any sale from them is yours. Copy the caption, film the shots, post it.</p>
      <div className="week-plan">
        {WEEK_PLAN.map(([day, what]) => <div key={day}><strong>{day}</strong><span>{what}</span></div>)}
      </div>
      <div className="idea-list">
        {ideas.slice(0, shown).map((idea) => {
          const earn = commissionLabel(idea.product, settings)
          return (
            <article key={idea.id} className="post-idea">
              <div className="between">
                <span className="pi-head"><strong>{idea.title}</strong><span className="tiny muted">{idea.platform} · {idea.kind}</span></span>
                <span className="tiny copper strong">You earn {money(earn.perUnit)}</span>
              </div>
              <p className="pi-hook">{idea.hook}</p>
              <ol className="pi-shots">{idea.shots.map((sh, i) => <li key={i}>{sh}</li>)}</ol>
              <div className="share-box">{idea.caption}</div>
              <div className="btn-row">
                <ShareThis product={idea.product} link={`${window.location.origin}/r/${code}/${idea.product.slug}`} caption={idea.caption} className="btn sm primary" label="Make picture" />
                <button className="btn sm" onClick={() => copy(idea.caption)}>Copy caption</button>
                <a className="btn sm buy" href={`https://wa.me/?text=${encodeURIComponent(idea.caption)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
              </div>
            </article>
          )
        })}
      </div>
      {shown < ideas.length && <button className="btn" onClick={() => setShown(shown + 6)}>More ideas ({ideas.length - shown} left)</button>}
    </section>
  )
}
