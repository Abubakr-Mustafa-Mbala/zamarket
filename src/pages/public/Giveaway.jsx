import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { useCart } from '../../lib/cart'
import { Loading, useToast } from '../../components/ui'
import { money } from '../../lib/format'
import { useSeo } from '../../lib/seo'
import { offerCopy, DEAL_TYPES } from '../../lib/offers'
import Icon from '../../lib/icons'

// A real prize, real product photography, a free entry and a recorded draw.
// A promotion page must never invent inventory, discounts, ratings or prizes.
// The database selects the winner; the wheel below reveals the stored result.
const fmtLeft = (ms) => {
  if (ms <= 0) return 'Closed'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return d > 0 ? `${d}d ${h}h remaining` : h > 0 ? `${h}h ${m}m remaining` : `${Math.max(1, m)}m remaining`
}
const localDate = (value) => new Date(value).toLocaleString('en-ZM', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})
const productPath = (p) => p.vendor_slug && p.slug ? `/${encodeURIComponent(p.vendor_slug)}/${encodeURIComponent(p.slug)}` : `/p/${encodeURIComponent(p.slug || p.id)}`
const salePrice = (p) => Number(p?.normal_price) > Number(p?.price) && Number(p?.price) > 0
const available = (p) => p?.status === 'published' && (['made_to_order','service'].includes(p.fulfilment) || Number(p.stock_available) > 0)

function Countdown({ end, now }) {
  const remaining = Math.max(0, end - now)
  const parts = [
    [Math.floor(remaining / 86400000), 'days'],
    [Math.floor(remaining / 3600000) % 24, 'hours'],
    [Math.floor(remaining / 60000) % 60, 'mins'],
    [Math.floor(remaining / 1000) % 60, 'secs'],
  ]
  return <div className="gw-countdown" aria-label={`Time remaining: ${fmtLeft(remaining)}`}>
    {parts.map(([n, unit]) => <div key={unit}><strong>{String(n).padStart(2, '0')}</strong><span>{unit}</span></div>)}
  </div>
}

export function GiveawayList() {
  useSeo({
    title: 'Giveaways | ZaMarket',
    description: 'Genuine free-to-enter prize draws on ZaMarket. No purchase required.',
    canonical: '/giveaways',
  })
  const { data, loading, error } = useData(async () => {
    const { data: rows, error: fetchError } = await supabase.from('giveaway_campaigns')
      .select('slug,title,description,prize_text,prize_value,closes_at,status,winners')
      .in('status', ['live', 'closed', 'drawn', 'fulfilled'])
      .order('closes_at', { ascending: false })
    if (fetchError) throw fetchError
    return rows || []
  }, [])
  if (loading) return <Loading shape="cards" />
  const live = (data || []).filter((g) => g.status === 'live' && new Date(g.closes_at) > new Date())
  const past = (data || []).filter((g) => !live.includes(g))
  return <div className="gw-index">
    <header className="gw-index-hero">
      <span className="gw-eyebrow"><Icon.gift /> ZAMARKET GIVEAWAYS</span>
      <h1>Something worth winning.</h1>
      <p>Real prizes from real businesses. Free to enter, with a draw recorded by the system.</p>
    </header>
    {error && <div className="card" role="alert">Giveaways could not load. Please refresh and try again.</div>}
    {!error && live.length === 0 && <div className="gw-empty">
      <Icon.gift /><h2>No giveaway is open right now</h2>
      <p>When a new campaign starts, its prize and entry details will appear here. In the meantime, explore what our sellers offer.</p>
      <Link className="btn primary" to="/search">Explore products <Icon.arrow /></Link>
    </div>}
    {live.length > 0 && <section aria-label="Active giveaways"><h2 className="gw-section-title">Open for entries</h2>
      <div className="gw-index-grid">{live.map((g) => <GiveawayCard key={g.slug} g={g}/>)}</div></section>}
    {past.length > 0 && <section aria-label="Previous giveaways" className="gw-previous"><h2 className="gw-section-title">Previous campaigns</h2>
      <div className="gw-index-grid">{past.slice(0, 9).map((g) => <GiveawayCard key={g.slug} g={g}/>)}</div></section>}
  </div>
}
function GiveawayCard({ g }) {
  const live = g.status === 'live' && new Date(g.closes_at) > new Date()
  return <Link to={`/giveaways/${encodeURIComponent(g.slug)}`} className="gw-index-card">
    <span className="gw-card-topline">{live ? <><span className="gw-live-dot"/> OPEN FOR ENTRIES</> : 'CAMPAIGN ENDED'}</span>
    <h3>{g.title}</h3>
    {g.prize_text && <p>{g.prize_text}</p>}
    <div className="gw-index-card-foot"><strong>{g.prize_value > 0 ? money(g.prize_value) + ' prize' : 'Free entry'}</strong><span>{live ? fmtLeft(new Date(g.closes_at).getTime() - Date.now()) : 'See campaign'} <Icon.arrow /></span></div>
  </Link>
}

function ProductCard({ p }) {
  const canBuy = available(p)
  return <Link className="gw-product" to={productPath(p)}>
    <div className="gw-product-image">{p.images?.[0] ? <img src={p.images[0]} alt={p.name} loading="lazy"/> : <span className="gw-product-image-fallback"><Icon.box /></span>}
      {salePrice(p) && canBuy && <span className="gw-product-offer">On offer</span>}
    </div>
    <div className="gw-product-details"><h3>{p.name}</h3>
      <div className="gw-product-price"><strong>{money(p.price, {whole:true})}</strong>{salePrice(p) && canBuy && <s>{money(p.normal_price,{whole:true})}</s>}</div>
      <span className="gw-product-action">{canBuy ? 'View product' : 'View details'} <Icon.arrow /></span>
    </div>
  </Link>
}

export default function GiveawayPage() {
  const { slug } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [optIn, setOptIn] = useState(false)
  const { setCampaign } = useCart()
  const { data, loading, error, reload } = useData(async () => {
    const { data: row, error: fetchError } = await supabase.rpc('giveaway_public', { p_slug: slug })
    if (fetchError) throw fetchError
    return row
  }, [slug])
  const vendorSlug = data?.product?.vendor_slug
  // Read the shop's real listings. If this campaign has no vendor, show a
  // small curated selection from the wider marketplace instead.
  const { data: recommended } = useData(async () => {
    if (!data) return []
    const fields = 'id,name,slug,price,normal_price,images,fulfilment,stock_available,status,vendor_slug,vendor_name,featured_in_store'
    const fetch = async (shopSlug = null) => {
      let query = supabase.from('public_products').select(fields)
        .eq('status', 'published').order('featured_in_store', { ascending: false }).limit(12)
      if (shopSlug) query = query.eq('vendor_slug', shopSlug)
      const { data: rows, error: fetchError } = await query
      if (fetchError) throw fetchError
      return rows || []
    }
    const own = vendorSlug ? await fetch(vendorSlug) : []
    const remaining = own.filter((p) => p.slug !== data.product?.slug)
    if (remaining.length >= 4) return remaining
    // A seller with just one prize should still introduce visitors to the
    // marketplace. Never fabricate a collection of products they don't sell.
    const broader = await fetch()
    return [...remaining, ...broader.filter((p) => !remaining.some((ownItem) => ownItem.id === p.id))]
      .filter((p) => p.slug !== data.product?.slug)
  }, [vendorSlug, data?.slug])
  const items = recommended || []
  const featured = items.slice(0, 4)
  const vendorOnly = !!vendorSlug && featured.length > 0 && featured.every((p) => p.vendor_slug === vendorSlug)

  // The real offers table, not a price comparison. A seller's "buy one get one
  // free" is an offer row with a type; it is invisible to anyone who only
  // looks at whether normal_price is higher than price. Everything shown here
  // is a live row the seller created — nothing on this page invents a deal.
  const { data: liveOffers } = useData(async () => {
    if (!items.length) return []
    const ids = items.map((p) => p.id)
    const { data: rows, error: offerError } = await supabase
      .from('public_offers')
      .select('id,product_id,type,name,deal_price,normal_value,units,end_at,remaining,config,gift_name')
      .in('product_id', ids)
    if (offerError) throw offerError
    return (rows || []).filter((o) => DEAL_TYPES.includes(o.type))
  }, [items.map((p) => p.id).join(',')])

  // One offer per product, best saving first, and only where the product can
  // actually be bought today.
  const offers = useMemo(() => {
    const byId = new Map(items.map((p) => [p.id, p]))
    const seen = new Set()
    return (liveOffers || [])
      .map((o) => ({ offer: o, product: byId.get(o.product_id) }))
      .filter(({ product }) => product && available(product))
      .map((row) => ({ ...row, saving: Math.max(0, Number(row.offer.normal_value || 0) - Number(row.offer.deal_price || 0)) }))
      .sort((a, b) => b.saving - a.saving)
      .filter(({ product }) => (seen.has(product.id) ? false : seen.add(product.id)))
      .slice(0, 2)
  }, [liveOffers, items])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { if (slug) setCampaign(slug) }, [slug])
  useSeo(data ? {
    title: `${data.title} | ZaMarket giveaway`,
    description: `${data.prize_text || data.title}. Free to enter on ZaMarket. No purchase necessary.`,
    canonical: `/giveaways/${slug}`,
  } : {})
  if (loading) return <Loading shape="page" />
  if (error || !data) return <div className="gw-empty"><h1>{error ? 'Giveaway temporarily unavailable' : 'We couldn’t find that giveaway'}</h1><p>{error ? 'Please refresh and try again.' : 'The campaign may have been taken down.'}</p><Link className="btn primary" to="/giveaways">See giveaways</Link></div>

  const closes = new Date(data.closes_at).getTime()
  const open = data.status === 'live' && now < closes
  const product = data.product
  const photo = product?.images?.[0]
  const buyable = available(product)
  const vendorName = product?.vendor_name
  const prizeTitle = product?.name || data.prize_text || data.title
  const landingUrl = `${window.location.origin}/giveaways/${encodeURIComponent(slug)}`
  const shareText = `${data.title} — a free-to-enter prize draw on ZaMarket. No purchase necessary.\n${landingUrl}?src=whatsapp`
  const enter = async () => {
    if (!user) return toast('Please sign in to enter', true)
    setBusy(true)
    try {
      const { error: entryError } = await supabase.rpc('enter_giveaway', { p_slug: slug })
      if (entryError) throw entryError
      if (optIn) {
        const { error: consentError } = await supabase.rpc('set_marketing_consent', { p_granted: true, p_source: `giveaway:${slug}` })
        if (consentError) toast('Entry confirmed; optional marketing preferences could not be saved.', true)
      }
      toast('You are entered. Good luck!')
      reload()
    } catch (e) { toast(e.message || 'Entry could not be completed', true) }
    finally { setBusy(false) }
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(landingUrl); toast('Giveaway link copied') }
    catch { toast('Could not copy. Share the page address from your browser.', true) }
  }
  return <div className="gw-campaign">
    <nav className="gw-breadcrumb" aria-label="Breadcrumb"><Link to="/giveaways">Giveaways</Link><span>/</span><span>{data.title}</span></nav>
    <section className="gw-hero" aria-label="Giveaway prize">
      <div className="gw-head">
        <span className="gw-eyebrow"><Icon.gift /> {open ? 'GIVEAWAY • ENTER NOW' : data.result ? 'GIVEAWAY • DRAW COMPLETE' : 'GIVEAWAY • ENTRIES CLOSED'}</span>
        {vendorName && <p className="gw-hero-vendor">Presented by {vendorName} on ZaMarket</p>}
        <h1>{data.title}</h1>
        <p className="gw-hero-summary">{data.prize_text || prizeTitle}</p>
        <div className="gw-hero-facts">
          <span><Icon.shield /> Free entry</span>
          <span><Icon.ticket /> {data.winners} {data.winners === 1 ? 'winner' : 'winners'}</span>
          <span><Icon.calendar /> Closes {localDate(data.closes_at)}</span>
        </div>
        {open ? <><p className="gw-timer-label">Entries close in</p><Countdown end={closes} now={now}/></>
          : <p className="gw-closed-message">{data.result ? 'The result has been recorded. See the winner reveal below.' : 'Entries have closed. The draw result will appear here.'}</p>}
        {open && <div className="gw-hero-buttons"><a className="gw-primary-action" href="#giveaway-entry">Enter giveaway <Icon.arrow /></a><a className="gw-secondary-action" href="#giveaway-details">How to enter</a></div>}
        <p className="gw-hero-disclaimer">No purchase necessary. Sharing does not increase your chance of winning.</p>
      </div>
      <div className="gw-prize-art">
        {photo ? <img src={photo} alt={prizeTitle} className="gw-photo"/> : <div className="gw-photo gw-photo-none"><Icon.gift/><span>{prizeTitle}</span></div>}
        <div className="gw-prize-plaque"><span>THE PRIZE</span><strong>{prizeTitle}</strong>{Number(data.prize_value || product?.price) > 0 && <span>Stated value {money(data.prize_value || product.price,{whole:true})}</span>}</div>
      </div>
    </section>

    <section className="gw-detail-grid" aria-label="How the giveaway works">
      <div className="gw-detail" id="giveaway-details">
        <span className="gw-eyebrow">01 / HOW IT WORKS</span><h2>Simple to enter. Fair for everyone.</h2>
        <ol className="gw-steps">
          <li><span>01</span><div><strong>Sign in to ZaMarket</strong><p>Create an account or use your existing one.</p></div></li>
          <li><span>02</span><div><strong>Enter for free</strong><p>Submit one entry before {localDate(data.closes_at)}. No purchase required.</p></div></li>
          <li><span>03</span><div><strong>Return for the result</strong><p>The system records the draw. The winner is contacted privately.</p></div></li>
        </ol>
      </div>
      <div className="gw-detail gw-enter" id="giveaway-entry">
        <span className="gw-eyebrow">02 / YOUR ENTRY</span>
        {data.result ? <><h2>Winner drawn</h2><p>The draw is complete. You can reveal the recorded result below.</p></>
        : data.mine ? <><h2>You're entered.</h2><p>Your entry is recorded. Check back after the closing date for the result.</p><div className="gw-enter-done"><Icon.check /> Entry confirmed</div></>
        : open ? <><h2>Your chance to win.</h2><p>One free entry per person. No purchase or social sharing is necessary.</p>
          <label className="gw-consent"><input type="checkbox" checked={optIn} onChange={(e)=>setOptIn(e.target.checked)}/><span>I'd also like occasional ZaMarket offers. Optional, and I can unsubscribe.</span></label>
          {user ? <button className="gw-primary-action gw-entry-submit" onClick={enter} disabled={busy}>{busy ? 'Submitting entry…' : 'Enter for free'} <Icon.arrow /></button>
            : <Link className="gw-primary-action gw-entry-submit" to={`/login?next=${encodeURIComponent(`/giveaways/${slug}`)}`}>Sign in to enter <Icon.arrow /></Link>}
        </> : <><h2>Entries closed</h2><p>The result will be published on this page after the draw.</p></>}
        <div className="gw-share-box"><strong>Tell someone about it</strong><p>Sharing is entirely optional and gives no extra entries.</p>
          <div className="gw-share-actions"><a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a><button onClick={copyLink}>Copy link</button></div>
        </div>
      </div>
    </section>

    {data.result && <Wheel names={data.names} result={data.result} />}

    {product && <section className="gw-shop-prize">
      <div><span className="gw-eyebrow">FOUND SOMETHING YOU LIKE?</span><h2>{buyable ? 'Need this before the draw?' : 'This one is the last'}</h2>
        {/* Never offer to sell the prize when it is the only one there is.
            Taking money for something nobody can deliver costs more than the
            sale is worth. */}
        <p>{buyable
          ? 'You can order this one separately. Buying does not affect your entry, and it does not affect the draw.'
          : `The prize is the only one in stock, so it is held back while the giveaway runs.${vendorName ? ` ${vendorName} has other things, though.` : ''}`}</p></div>
      <div className="gw-shop-prize-actions">
        {buyable && <Link to={productPath(product)} className="gw-primary-action">View product <Icon.arrow /></Link>}
        {product.vendor_slug && <Link to={`/${encodeURIComponent(product.vendor_slug)}`} className="gw-secondary-action">Visit {vendorName || 'the shop'}</Link>}
      </div>
    </section>}

    {featured.length > 0 && <section className="gw-shelf" aria-label="Featured products">
      <header className="gw-shelf-head"><div><span className="gw-eyebrow">DISCOVER MORE</span><h2>{vendorOnly ? `More from ${vendorName}` : 'More to discover on ZaMarket'}</h2><p>Products you can explore while you are here.</p></div>
        <Link to={vendorOnly ? `/${encodeURIComponent(vendorSlug)}` : '/search'}>{vendorOnly ? 'Explore the shop' : 'Browse all products'} <Icon.arrow /></Link></header>
      <div className="gw-product-grid">{featured.map((p)=><ProductCard key={p.id} p={p}/>)}</div>
    </section>}

    {offers.length > 0 && <section className="gw-real-offers" aria-label="Current offers">
      <header className="gw-shelf-head"><div><span className="gw-eyebrow">ACTUAL LISTED SAVINGS</span><h2>Offers worth a look.</h2><p>These discounts are based on current published catalogue prices.</p></div></header>
      <div className="gw-offer-grid">{offers.map(({ offer, product, saving }) => {
        const copy = offerCopy(offer, product.name)
        return <Link className="gw-real-offer" to={productPath(product)} key={offer.id}>
          <div>
            <span>{saving > 0 ? `SAVE ${money(saving, { whole: true })}` : 'ON OFFER'}</span>
            <h3>{copy.bonus || copy.get}</h3>
            <p>{copy.bonus ? copy.get : product.name}</p>
            <strong>{money(offer.deal_price, { whole: true })}</strong>
            {saving > 0 && <span className="gw-old-price">{money(offer.normal_value, { whole: true })} before</span>}
            <small>View this offer <Icon.arrow /></small>
          </div>
          {product.images?.[0] && <img src={product.images[0]} alt="" loading="lazy"/>}
        </Link>
      })}</div>
    </section>}

    {data.description && <section className="gw-info-block"><span className="gw-eyebrow">ABOUT THIS CAMPAIGN</span><h2>About the prize</h2><p>{data.description}</p></section>}
    <section className="gw-info-block gw-rule-block"><span className="gw-eyebrow">PLEASE READ</span><h2>Giveaway rules</h2>
      <ul className="gw-rules">
        <li>Entry is free. No purchase or payment is required.</li><li>One entry per person through a ZaMarket account.</li>
        <li>Available to eligible participants in {data.area}, aged {data.min_age} and above.</li>
        <li>Entries close {localDate(data.closes_at)}.</li><li>Winners are selected by the recorded draw, not by the on-screen wheel animation.</li>
        <li>The winner is contacted privately. Contact information is never displayed publicly.</li>
        <li>A testimonial or review is never required to receive the prize.</li>
        <li>This promotion is not sponsored, endorsed, administered by or associated with Meta, Instagram, TikTok or WhatsApp.</li>
      </ul>{data.terms && <p>{data.terms}</p>}
    </section>
    {/* The page is the busiest on the site while a campaign runs. These are
        the three things a visitor can do next — and none of them is a
        condition of entry, which both the law and Meta's rules require. */}
    <section className="gw-info-block gw-doors-block">
      <span className="gw-eyebrow">WHILE YOU ARE HERE</span>
      <h2>Three other things you can do</h2>
      <div className="gw-more-doors"><Link to="/search">Browse all products <Icon.arrow /></Link><Link to="/affiliates">Earn by referring buyers <Icon.arrow /></Link><Link to="/apply/vendor">Sell on ZaMarket <Icon.arrow /></Link></div>
      <p className="gw-doors-note">Nothing here is a condition of entry. Your entry is already counted.</p>
    </section>
  </div>
}

// The wheel.
//
// It is told the winner and spins to them. The maths below only works out
// which angle lands on the already-decided name — it never chooses.
function Wheel({ names = [], result }) {
  const [spinning, setSpinning] = useState(false)
  const [shown, setShown] = useState(false)
  const winners = result?.winners || []
  const firstName = winners[0]?.name || 'the winner'

  // The wheel can hold a readable number of names. With more entrants than
  // that, the rest are represented rather than crammed in unreadably — the
  // draw already happened over every single entry.
  const slots = useMemo(() => {
    const list = names.slice(0, 11)
    if (!list.includes(firstName)) list[list.length - 1] = firstName
    return list.length ? list : [firstName]
  }, [names, firstName])

  const target = Math.max(0, slots.indexOf(firstName))
  const per = 360 / slots.length
  // Five full turns, then stop with the winner's slice at the top.
  const angle = 360 * 5 + (360 - (target * per + per / 2))
  const ref = useRef(null)

  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  const spin = () => {
    if (spinning || shown) return
    if (reduced) { setShown(true); return }
    setSpinning(true)
    setTimeout(() => { setSpinning(false); setShown(true) }, 5200)
  }

  return (
    <div className="card stack-sm gw-wheel-card">
      <h2>{shown ? 'The winner' : 'The draw'}</h2>
      <div className="gw-wheel-wrap">
        <div className="gw-pointer" aria-hidden />
        <div ref={ref} className={`gw-wheel ${spinning ? 'spin' : ''}`}
          style={{ '--turn': `${angle}deg`, '--slices': slots.length }}>
          {slots.map((n, i) => (
            <span key={`${n}-${i}`} className="gw-slice" style={{ '--i': i }}>
              <em>{n}</em>
            </span>
          ))}
        </div>
      </div>

      {shown ? (
        <div className="gw-winner">
          {winners.map((w) => <strong key={w.entry_id}>{w.name}</strong>)}
          <p className="small muted">
            Drawn {new Date(result.drawn_at).toLocaleString('en-ZM')} from {result.entry_count} entries.
            We are contacting the winner privately.
          </p>
        </div>
      ) : (
        <>
          <button className="btn primary" onClick={spin} disabled={spinning}>
            {spinning ? 'Spinning…' : 'Spin the wheel'}
          </button>
          <p className="tiny muted">
            The result was decided by the system when entries closed and is already recorded.
            Spinning only reveals it — it cannot change who won.
          </p>
        </>
      )}
      {names.length > slots.length && (
        <p className="tiny muted">
          Showing {slots.length} of {result.entry_count} entries on the wheel. Every entry was in the draw.
        </p>
      )}
    </div>
  )
}
