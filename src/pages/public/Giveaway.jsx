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
import { usablePhone, prettyPhone } from '../../lib/phone'

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
const ordinal = (n) => ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth',
  'Seventh', 'Eighth', 'Ninth', 'Tenth'][n] || `Prize ${n}`
const available = (p) => p?.status === 'published' && (['made_to_order','service'].includes(p.fulfilment) || Number(p.stock_available) > 0)

function Countdown({ end, now }) {
  const remaining = Math.max(0, end - now)
  const parts = [
    [Math.floor(remaining / 86400000), 'days'],
    [Math.floor(remaining / 3600000) % 24, 'hours'],
    [Math.floor(remaining / 60000) % 60, 'mins'],
    [Math.floor(remaining / 1000) % 60, 'secs'],
  ]
  return <div className="gw-count" aria-label={`Time remaining: ${fmtLeft(remaining)}`}>
    {parts.map(([n, unit]) => <span key={unit}><strong>{String(n).padStart(2, '0')}</strong><small>{unit}</small></span>)}
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

// The number we would ring, shown back to the entrant with a way to fix it.
function ContactNumber({ known, editing, setEditing, phone, setPhone, save, busy, winner }) {
  if (known && !editing) return (
    <p className="gw-phone-known">
      {winner ? 'We will ring ' : 'If you win we will ring '}<strong>{prettyPhone(known)}</strong>.{' '}
      <button type="button" className="gw-link" onClick={() => setEditing(true)}>Change number</button>
    </p>
  )
  return (
    <div className="gw-phone">
      <span>{known ? 'New phone number' : winner ? 'We have no phone number for you. Add one so we can ring you.' : 'Add a phone number so we can ring you if you win'}</span>
      <div className="gw-phone-row">
        <input type="tel" inputMode="tel" autoComplete="tel" value={phone}
          onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0977 123 456" />
        <button type="button" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      <small>Only ZaMarket staff see it. It is never shown on the wheel.</small>
    </div>
  )
}

export default function GiveawayPage() {
  const { slug } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [optIn, setOptIn] = useState(false)
  const [phone, setPhone] = useState('')
  const [editingPhone, setEditingPhone] = useState(false)
  const { setCampaign } = useCart()
  // What only this person may know about their entry: the number we would
  // ring, and after the draw whether they won. Google sign-in gives us an
  // email address and no phone number, so without asking there is no way to
  // ring a winner.
  const { data: mine, reload: reloadMine } = useData(async () => {
    if (!user) return null
    const { data: row } = await supabase.rpc('my_giveaway_entry', { p_slug: slug })
    return row || null
  }, [slug, user?.id])
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

  // The headline reads better with its last couple of words picked out in
  // gold, which is what the approved design does. Splitting on the title
  // itself keeps that working whatever the campaign is called.
  const titleWords = String(data.title).trim().split(/\s+/)
  const titleLead = titleWords.slice(0, Math.max(1, titleWords.length - 2)).join(' ')
  const titleGold = titleWords.slice(Math.max(1, titleWords.length - 2)).join(' ')

  const knownPhone = mine?.phone || ''
  const savePhone = async () => {
    if (!usablePhone(phone)) return toast('Enter a phone number we can ring, like 0977 123 456', true)
    setBusy(true)
    const { error: phoneError } = await supabase.rpc('set_giveaway_contact', { p_slug: slug, p_phone: phone })
    setBusy(false)
    if (phoneError) return toast(phoneError.message, true)
    toast('Number saved')
    setEditingPhone(false); setPhone(''); reloadMine()
  }
  const enter = async () => {
    if (!user) return toast('Please sign in to enter', true)
    // Asked before entering, so nobody wins a prize we cannot hand over.
    if (!knownPhone && !usablePhone(phone)) return toast('Add a phone number so we can ring you if you win', true)
    setBusy(true)
    try {
      const { error: entryError } = await supabase.rpc('enter_giveaway', { p_slug: slug })
      if (entryError) throw entryError
      if (usablePhone(phone)) {
        const { error: phoneError } = await supabase.rpc('set_giveaway_contact', { p_slug: slug, p_phone: phone })
        if (phoneError) toast('You are entered, but your number was not saved. Add it below.', true)
      }
      if (optIn) {
        const { error: consentError } = await supabase.rpc('set_marketing_consent', { p_granted: true, p_source: `giveaway:${slug}` })
        if (consentError) toast('Entry confirmed; optional marketing preferences could not be saved.', true)
      }
      toast('You are entered. Good luck!')
      setPhone(''); reload(); reloadMine()
    } catch (e) { toast(e.message || 'Entry could not be completed', true) }
    finally { setBusy(false) }
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(landingUrl); toast('Giveaway link copied') }
    catch { toast('Could not copy. Share the page address from your browser.', true) }
  }

  const shelf = featured.length > 0 && (
    <section className="gw-section" aria-label="Featured products">
      <header className="gw-shelf-head">
        <div>
          <span className="gw-eyebrow">Browse while you&rsquo;re here</span>
          <h2>{vendorOnly ? `From ${vendorName}` : 'More to discover on ZaMarket'}</h2>
          <p>Live catalogue listings, at the price they are selling for today.</p>
        </div>
        <Link to={vendorOnly ? `/${encodeURIComponent(vendorSlug)}` : '/search'}>
          {vendorOnly ? 'Visit the shop' : 'Browse all products'} <Icon.arrow />
        </Link>
      </header>
      <div className="gw-product-grid">{featured.map((p) => <ProductCard key={p.id} p={p}/>)}</div>
    </section>
  )

  const realOffers = offers.length > 0 && (
    <section className="gw-section" aria-label="Current offers">
      <span className="gw-eyebrow">Actual listed savings</span>
      <h2>Offers worth a look.</h2>
      <p>Taken from offers the sellers themselves created. Nothing here is invented.</p>
      <div className="gw-offer-grid">{offers.map(({ offer, product: op, saving }) => {
        const copy = offerCopy(offer, op.name)
        return <Link className="gw-real-offer" to={productPath(op)} key={offer.id}>
          <div>
            <span>{saving > 0 ? `SAVE ${money(saving, { whole: true })}` : 'ON OFFER'}</span>
            {/* offerCopy already names the product, so printing it again
                underneath just repeats the headline back at the reader. */}
            <h3>{copy.get}</h3>
            {copy.bonus && <p>{copy.bonus}</p>}
            <strong>{money(offer.deal_price, { whole: true })}</strong>
            {saving > 0 && <span className="gw-old-price">{money(offer.normal_value, { whole: true })} before</span>}
            <small>View this offer <Icon.arrow /></small>
          </div>
          {op.images?.[0] && <img src={op.images[0]} alt="" loading="lazy"/>}
        </Link>
      })}</div>
    </section>
  )

  const rules = (
    <section className="gw-info-block" aria-label="Giveaway rules">
      <span className="gw-eyebrow">Please read</span>
      <h2>Giveaway rules</h2>
      <ul className="gw-rules">
        <li>Entry is free. No purchase or payment is required.</li>
        <li>One entry per person through a ZaMarket account.</li>
        <li>Available to eligible participants in {data.area}, aged {data.min_age} and above.</li>
        <li>Entries close {localDate(data.closes_at)}.</li>
        <li>Winners are selected by the recorded draw, not by the on-screen wheel animation.</li>
        <li>The winner is contacted privately. Contact information is never displayed publicly.</li>
        <li>A testimonial or review is never required to receive the prize.</li>
        <li>This promotion is not sponsored, endorsed, administered by or associated with Meta, Instagram, TikTok or WhatsApp.</li>
      </ul>
      {data.terms && <p>{data.terms}</p>}
    </section>
  )

  const doors = (
    <section className="gw-info-block gw-doors-block">
      <span className="gw-eyebrow">While you are here</span>
      <h2>Three other things you can do</h2>
      <div className="gw-more-doors">
        <Link to="/search">Browse all products <Icon.arrow /></Link>
        <Link to="/affiliates">Earn by referring buyers <Icon.arrow /></Link>
        <Link to="/apply/vendor">Sell on ZaMarket <Icon.arrow /></Link>
      </div>
      <p className="gw-doors-note">Nothing here is a condition of entry. Your entry is already counted.</p>
    </section>
  )

  return <div className="gw-campaign">
    <nav className="gw-breadcrumb" aria-label="Breadcrumb"><Link to="/giveaways">Giveaways</Link><span>/</span><span>{data.title}</span></nav>

    <section className="gw-hero" aria-label="Giveaway prize">
      <div className="gw-head">
        <span className="gw-badge"><Icon.gift /> {open ? 'Featured vendor giveaway' : data.result ? 'Giveaway · draw complete' : 'Giveaway · entries closed'}</span>
        {vendorName && <p className="gw-hero-vendor">Presented by {vendorName} on ZaMarket</p>}
        <h1>{titleLead} <span className="gw-gold">{titleGold}</span></h1>
        <p className="gw-hero-summary">{data.prize_text || prizeTitle}</p>
        {open ? <>
          <p className="gw-timer-label">Entries close in</p>
          <Countdown end={closes} now={now}/>
        </> : (
          <p className="gw-closed-message">{data.result
            ? 'The result has been recorded. See the winner reveal below.'
            : 'Entries have closed. The draw result will appear here.'}</p>
        )}
        {open && <div className="gw-hero-buttons">
          <a className="gw-primary-action" href="#giveaway-entry">Enter giveaway — it&rsquo;s free <Icon.arrow /></a>
          <a className="gw-secondary-action" href="#giveaway-details">See how to enter</a>
        </div>}
        <p className="gw-hero-disclaimer">No purchase necessary. Sharing does not increase your chance of winning.</p>
      </div>
      <div className="gw-prize-art">
        {photo
          ? <img src={photo} alt={prizeTitle} className="gw-photo"/>
          : <div className="gw-photo gw-photo-none"><Icon.gift/><span>{prizeTitle}</span></div>}
        <span className="gw-rosette">Grand<br/>prize</span>
        <div className="gw-prize-plaque">
          <span>The prize</span>
          <strong>{prizeTitle}</strong>
          {Number(data.prize_value || product?.price) > 0 && <span>Stated value {money(data.prize_value || product.price, { whole: true })}</span>}
        </div>
      </div>
    </section>

    <div className="gw-chips">
      <span><Icon.check /> No purchase necessary</span>
      <span><Icon.shield /> Fair, recorded winner selection</span>
      <span><Icon.check /> Marketing emails optional</span>
      <span><Icon.box /> Real products from real sellers</span>
    </div>

    {(data.prizes || []).length > 1 && (
      <section className="gw-section" aria-label="The prizes">
        <span className="gw-eyebrow">What is being given away</span>
        <h2>{data.prizes.length} prizes, {data.winners} winner{data.winners === 1 ? '' : 's'}</h2>
        <p>Drawn in order. The first name out takes first prize.</p>
        <div className="gw-prize-list">
          {data.prizes.map((pz) => (
            <div className="gw-prize-row" key={pz.rank}>
              <span className="gw-prize-rank">{ordinal(pz.rank)}</span>
              {pz.images?.[0] && <img src={pz.images[0]} alt="" loading="lazy" />}
              <div>
                <strong>{pz.name}</strong>
                <span>
                  {pz.winners > 1 ? `${pz.winners} winners` : '1 winner'}
                  {Number(pz.value) > 0 && ` · worth ${money(pz.value, { whole: true })} each`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    )}

    <section className="gw-detail-grid" aria-label="How the giveaway works">
      <div className="gw-detail" id="giveaway-details">
        <span className="gw-eyebrow">Simple and transparent</span>
        <h2>How to enter</h2>
        <ol className="gw-steps">
          <li><span>01</span><strong>Create an account</strong><p>Sign up, or use the ZaMarket account you already have.</p></li>
          <li><span>02</span><strong>Enter for free</strong><p>One entry per person before {localDate(data.closes_at)}. No purchase required.</p></li>
          <li><span>03</span><strong>Return for the result</strong><p>The system records the draw. The winner is contacted privately.</p></li>
        </ol>
      </div>
      <div className="gw-enter" id="giveaway-entry">
        <span className="gw-eyebrow">Your entry</span>
        {data.result && mine?.won ? <>
          <h2>You won{mine.prize ? `: ${mine.prize}` : ''}.</h2>
          <p>Congratulations. ZaMarket will ring you to arrange your prize. We never ask a winner to pay anything.</p>
          <ContactNumber known={knownPhone} editing={editingPhone} setEditing={setEditingPhone}
            phone={phone} setPhone={setPhone} save={savePhone} busy={busy} winner />
        </> : data.result ? <>
          <h2>Winner drawn</h2>
          <p>The draw is complete. You can reveal the recorded result below.</p>
        </> : data.mine ? <>
          <h2>You&rsquo;re entered.</h2>
          <p>Your entry is recorded. Check back after the closing date for the result.</p>
          <div className="gw-enter-done"><Icon.check /> Entry confirmed</div>
          <ContactNumber known={knownPhone} editing={editingPhone} setEditing={setEditingPhone}
            phone={phone} setPhone={setPhone} save={savePhone} busy={busy} />
        </> : open ? <>
          <h2>Your chance to win.</h2>
          <p>One free entry per person. No purchase or social sharing is necessary.</p>
          {user && !knownPhone && (
            <label className="gw-phone">
              <span>Phone number, so we can ring you if you win</span>
              <input type="tel" inputMode="tel" autoComplete="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0977 123 456" />
              <small>Only ZaMarket staff see it. It is never shown on the wheel.</small>
            </label>
          )}
          {user && knownPhone && <p className="gw-phone-known">If you win we will ring <strong>{prettyPhone(knownPhone)}</strong>.</p>}
          <label className="gw-consent">
            <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)}/>
            <span>I&rsquo;d also like occasional ZaMarket offers. Optional, and I can unsubscribe.</span>
          </label>
          {user
            ? <button className="gw-primary-action gw-entry-submit" onClick={enter} disabled={busy}>{busy ? 'Submitting entry…' : 'Enter for free'} <Icon.arrow /></button>
            : <Link className="gw-primary-action gw-entry-submit" to={`/login?next=${encodeURIComponent(`/giveaways/${slug}`)}`}>Sign in to enter <Icon.arrow /></Link>}
        </> : <>
          <h2>Entries closed</h2>
          <p>The result will be published on this page after the draw.</p>
        </>}
        <div className="gw-share-box">
          <strong>Tell someone about it</strong>
          <p>Sharing is entirely optional and gives no extra entries.</p>
          <div className="gw-share-actions">
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
            <button onClick={copyLink}>Copy link</button>
          </div>
        </div>
      </div>
    </section>

    {data.result && <Wheel names={data.names} result={data.result} campaign={data.title}
      vendorName={vendorName} prizeName={prizeTitle} prizePhoto={photo}
      prizeValue={Number(data.prize_value || product?.price) || 0}
      products={featured} offers={offers} />}

    {data.result && <DidntWin slug={slug} prizeValue={Number(data.prize_value || product?.price) || 0} prizeName={prizeTitle} prizePhoto={photo} />}

    {product && <section className="gw-shop-prize">
      <div>
        <span className="gw-eyebrow">Found something you like?</span>
        <h2>{buyable ? 'Need this before the draw?' : 'This one is the last'}</h2>
        {/* Never offer to sell the prize when it is the only one there is.
            Taking money for something nobody can deliver costs more than the
            sale is worth. */}
        <p>{buyable
          ? 'You can order this one separately. Buying does not affect your entry, and it does not affect the draw.'
          : `The prize is the only one in stock, so it is held back while the giveaway runs.${vendorName ? ` ${vendorName} has other things, though.` : ''}`}</p>
      </div>
      <div className="gw-shop-prize-actions">
        {buyable && <Link to={productPath(product)} className="gw-primary-action">View product <Icon.arrow /></Link>}
        {product.vendor_slug && <Link to={`/${encodeURIComponent(product.vendor_slug)}`} className="gw-secondary-action">Visit {vendorName || 'the shop'}</Link>}
      </div>
    </section>}

    {shelf}
    {realOffers}

    {data.description && <section className="gw-info-block">
      <span className="gw-eyebrow">About this campaign</span>
      <h2>About the prize</h2>
      <p>{data.description}</p>
    </section>}

    {rules}
    {doors}
  </div>
}

// The draw, and the screen it gets recorded on.
//
// The result is decided and written down by the database the moment entries
// close. Nothing here chooses anything; the spin reveals a stored answer and
// pressing it again cannot change it.
//
// Two honesty rules shape the whole component:
//
//   1. The ring is made of real entries, in the order people entered, and
//      the winner's slice is wherever they actually are in it. An earlier
//      version showed eleven names and moved the winner into the last slot
//      when they were not among them. True to the stored result, but on a
//      video posted publicly the other entrants would never find their own
//      name and it would read as a stitch-up.
//   2. Everybody who entered is on it. Not a sample — a thousand entries
//      means a thousand slices. Somebody who entered and cannot find their
//      own name on a recorded draw does not enter the next one, and no
//      caption fixes that. The ceiling exists only so a runaway campaign
//      cannot hang a phone, and the page says when it has been reached.
//
// Names are a first name and an initial. No number or full name is ever on
// screen, which is what makes the recording safe to post.
const NAME_CAP = 20000

function WheelFace({ slots, labelled, ring, wedge, angle, total, big }) {
  return (
    <div className={`gw-wheel-wrap${big ? ' gw-wheel-big' : ''}`}>
      <div className="gw-pointer" aria-hidden />
      <div className="gw-wheel"
        style={{ transform: `rotate(${angle}deg)`, '--slices': slots.length, background: ring }}>
        {wedge && <div className="gw-winner-wedge" style={{ background: wedge }} aria-hidden />}
        {labelled && slots.map((n, i) => (
          <span key={`${n}-${i}`} className="gw-slice" style={{ '--i': i }}><em>{n}</em></span>
        ))}
      </div>
      <div className="gw-wheel-hub" aria-hidden>
        <b>{total}</b><span>{total === 1 ? 'entry' : 'entries'}</span>
      </div>
    </div>
  )
}

function useDraw(names, result) {
  const winners = result?.winners || []
  const firstName = winners[0]?.name || 'the winner'
  const total = Number(result?.entry_count) || names.length

  const slots = useMemo(() => {
    const list = (names || []).filter(Boolean).slice(0, NAME_CAP)
    if (!list.length) return [firstName]
    if (!list.includes(firstName)) list.push(firstName)
    return list
  }, [names, firstName])

  const target = Math.max(0, slots.indexOf(firstName))
  const per = 360 / slots.length
  return {
    winners, firstName, total, slots, target, per,
    angle: 360 * 5 + (360 - (target * per + per / 2)),
    // Labels stop being readable long before the slices do.
    labelled: slots.length <= 14,
    partial: slots.length < total,
  }
}

// Every entry, written out, with a box to find yourself in.
//
// The wheel can show two thousand slices but at that size nobody can read
// their own name off it. This is the part that answers "was I even in it?" —
// and it answers it before the draw as well as after, so people can check
// their entry landed while there is still time to do something about it.
function EntryList({ names = [], total = 0 }) {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase()
    if (!q) return names
    return names.filter((n) => String(n).toLowerCase().includes(q))
  }, [names, find])

  if (!names.length) return null

  return (
    <section className="gw-entries" aria-label="Everyone who entered">
      <button className="gw-entries-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span><Icon.user /> {open ? 'Hide the entry list' : `See all ${total || names.length} entries`}</span>
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>

      {open && <>
        <label className="gw-entries-find">
          <Icon.search />
          <input value={find} onChange={(e) => setFind(e.target.value)}
            placeholder="Find your name" aria-label="Find your name in the entry list" />
        </label>
        <p className="gw-entries-count">
          {find.trim()
            ? `${shown.length} of ${names.length} ${shown.length === 1 ? 'entry matches' : 'entries match'}`
            : `${names.length} ${names.length === 1 ? 'entry' : 'entries'}, in the order they came in`}
          {total > names.length && ` · ${total} entered in total`}
        </p>
        <ol className="gw-entries-grid">
          {shown.slice(0, 600).map((n, i) => <li key={`${n}-${i}`}>{n}</li>)}
        </ol>
        {shown.length > 600 && (
          <p className="gw-entries-count">
            Showing the first 600. Type a name above to find a particular one.
          </p>
        )}
        {shown.length === 0 && <p className="gw-entries-count">No entry matches that.</p>}
      </>}
    </section>
  )
}

function Draw({ names = [], result, big = false, onRevealed }) {
  const { winners, firstName, total, slots, target, per, angle, labelled, partial } = useDraw(names, result)
  const [spinning, setSpinning] = useState(false)
  const [shown, setShown] = useState(false)

  // The ring.
  //
  // Every entry is a slice. At two thousand entries a slice is a fifth of a
  // degree, so the colours stay close together on purpose: a dense ring of
  // fine stripes reads as "a lot of people", while high contrast at that
  // width would strobe horribly once it starts turning.
  //
  // The winner's slice is marked with a wedge of at least a degree and a
  // half, or it would be invisible. The wedge is a marker pointing at the
  // winning slice, not a claim that their slice was bigger.
  const ring = useMemo(() => {
    const stops = slots.map((_, i) =>
      `${i % 2 ? '#2b2140' : '#211a33'} ${(i * per).toFixed(3)}deg ${((i + 1) * per).toFixed(3)}deg`)
    return `conic-gradient(from 0deg, ${stops.join(',')})`
  }, [slots, per])

  // The winner's slice, marked. At two thousand entries a slice is a fifth
  // of a degree, so the marker is widened to something a camera can see. It
  // points at the winning slice; it does not pretend the slice was bigger.
  const wedge = useMemo(() => {
    if (!shown) return null
    const mid = (target + 0.5) * per
    const half = Math.max(per, 1.6) / 2
    const a = Math.max(0, mid - half).toFixed(3)
    const b = Math.min(360, mid + half).toFixed(3)
    return `conic-gradient(from 0deg, transparent 0 ${a}deg, #f3cb83 ${a}deg ${b}deg, transparent ${b}deg 360deg)`
  }, [shown, target, per])

  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  // How the wheel moves.
  //
  // A single CSS transition gives one long slowdown that is over before
  // anybody has felt anything. This drives the rotation frame by frame from
  // a speed curve that decays overall but surges twice on the way down:
  // fast, easing, fast again, then a long settle onto the winner.
  //
  // Position only ever increases. The speed dips and rises; the wheel never
  // turns back, which would look broken and, worse, rigged.
  const SPIN_MS = 11000
  const curve = useMemo(() => {
    const steps = 720
    const speed = (t) => Math.pow(1 - t, 1.7) * (1 + 0.55 * Math.cos(2 * Math.PI * 2.1 * t))
    const out = new Float64Array(steps + 1)
    let sum = 0
    for (let i = 1; i <= steps; i++) {
      sum += Math.max(0, speed((i - 0.5) / steps))
      out[i] = sum
    }
    for (let i = 0; i <= steps; i++) out[i] /= sum || 1
    return out
  }, [])

  const [turn, setTurn] = useState(0)
  const frame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const finish = () => { setSpinning(false); setShown(true); onRevealed?.() }
  const spin = () => {
    if (spinning || shown) return
    if (reduced) { setTurn(angle); return finish() }
    setSpinning(true)
    const started = performance.now()
    const steps = curve.length - 1
    const run = (now) => {
      const t = Math.min(1, (now - started) / SPIN_MS)
      const x = Math.min(steps, Math.max(0, t * steps))
      const i = Math.floor(x)
      const eased = curve[i] + (curve[Math.min(steps, i + 1)] - curve[i]) * (x - i)
      setTurn(angle * eased)
      if (t < 1) frame.current = requestAnimationFrame(run)
      else finish()
    }
    frame.current = requestAnimationFrame(run)
  }

  // The name under the pointer, right now. Tying the ticker to the wheel's
  // real position rather than to a timer is what makes it read as a draw
  // rather than a decoration.
  const under = useMemo(() => {
    if (!slots.length) return ''
    const at = ((-turn % 360) + 360) % 360
    return slots[Math.floor(at / per) % slots.length]
  }, [turn, slots, per])

  return (
    <>
      <WheelFace slots={slots} labelled={labelled} ring={ring} wedge={wedge}
        angle={spinning || shown ? turn : 0} total={total} big={big} />

      {shown ? (
        <div className="gw-winner">
          <span className="gw-eyebrow">{winners.length > 1 ? 'The winners' : 'The winner'}</span>
          {winners.map((w, i) => (
            <div className="gw-winner-row" key={w.entry_id || i}>
              <strong>{w.name}</strong>
              {/* With several prizes, the name on its own is only half the
                  news. This is the line people screenshot. */}
              {w.prize && <span className="gw-winner-prize">
                {winners.length > 1 && w.prize_rank ? `${ordinal(w.prize_rank)} prize · ` : 'wins '}{w.prize}
              </span>}
            </div>
          ))}
        </div>
      ) : spinning ? (
        <div className="gw-ticker" aria-live="off">
          <strong>{under}</strong>
        </div>
      ) : (
        <button className="gw-primary-action gw-spin" onClick={spin}>Spin the wheel</button>
      )}

      <p className="gw-wheel-proof">
        {shown
          ? `Drawn ${new Date(result.drawn_at).toLocaleString('en-ZM')} from ${total} ${total === 1 ? 'entry' : 'entries'}. ${winners.length > 1 ? 'The winners are' : 'The winner is'} contacted privately.`
          : 'The result was decided and recorded when entries closed. Spinning reveals it — it cannot change who won.'}
      </p>
      {partial && (
        <p className="gw-wheel-proof">
          The wheel shows {slots.length} of {total} entries. All {total} were in the draw.
        </p>
      )}
    </>
  )
}

// The reveal screen.
//
// He records this on a phone. It is a sequence rather than one screen,
// because the plan is to warm an audience up first: introduce the shop, show
// a few products, show the real offers, and only then draw. Everything else
// on the site is out of the way so the recording is postable as it is.
function RevealStage({ onClose, campaign, vendorName, prizeName, prizePhoto, prizeValue,
                       products = [], offers = [], names, result }) {
  const [step, setStep] = useState(0)

  const steps = useMemo(() => {
    const list = [
      { key: 'intro', label: 'The prize' },
      ...(products.length ? [{ key: 'products', label: 'Products' }] : []),
      ...(offers.length ? [{ key: 'offers', label: 'Offers' }] : []),
      { key: 'draw', label: 'The draw' },
    ]
    return list
  }, [products.length, offers.length])

  const here = steps[Math.min(step, steps.length - 1)]?.key

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setStep((n) => Math.min(steps.length - 1, n + 1))
      if (e.key === 'ArrowLeft') setStep((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey) }
  }, [onClose, steps.length])

  return (
    <div className="gw-stage" role="dialog" aria-modal="true" aria-label="Reveal screen">
      <button className="gw-stage-close" onClick={onClose} aria-label="Close the reveal screen">&times;</button>

      <div className="gw-stage-inner">
        <span className="gw-stage-brand">ZaMarket</span>

        {here === 'intro' && <>
          <h2 className="gw-stage-title">{campaign}</h2>
          {vendorName && <p className="gw-stage-sub">Presented by {vendorName}</p>}
          {prizePhoto
            ? <img className="gw-stage-photo" src={prizePhoto} alt={prizeName} />
            : <div className="gw-stage-photo gw-photo-none"><Icon.gift /></div>}
          <div className="gw-winner">
            <span className="gw-eyebrow">The prize</span>
            <strong className="gw-stage-prize">{prizeName}</strong>
            {prizeValue > 0 && <p className="gw-wheel-proof">Worth {money(prizeValue, { whole: true })}</p>}
          </div>
        </>}

        {here === 'products' && <>
          <h2 className="gw-stage-title">{vendorName ? `More from ${vendorName}` : 'More on ZaMarket'}</h2>
          <div className="gw-stage-grid">
            {products.slice(0, 4).map((p) => (
              <div className="gw-stage-item" key={p.id}>
                {p.images?.[0] && <img src={p.images[0]} alt="" />}
                <strong>{p.name}</strong>
                <span>{money(p.price, { whole: true })}</span>
              </div>
            ))}
          </div>
        </>}

        {here === 'offers' && <>
          <h2 className="gw-stage-title">On offer right now</h2>
          <div className="gw-stage-grid">
            {offers.slice(0, 2).map(({ offer, product: op, saving }) => {
              const copy = offerCopy(offer, op.name)
              return (
                <div className="gw-stage-item gw-stage-offer" key={offer.id}>
                  {op.images?.[0] && <img src={op.images[0]} alt="" />}
                  {saving > 0 && <em>Save {money(saving, { whole: true })}</em>}
                  <strong>{copy.bonus || copy.get}</strong>
                  <span>{money(offer.deal_price, { whole: true })}</span>
                </div>
              )
            })}
          </div>
        </>}

        {here === 'draw' && <>
          <h2 className="gw-stage-title">{campaign}</h2>
          <Draw names={names} result={result} big />
        </>}
      </div>

      <nav className="gw-stage-nav" aria-label="Reveal steps">
        <button onClick={() => setStep((n) => Math.max(0, n - 1))} disabled={step === 0} aria-label="Previous">‹</button>
        <span>{steps.map((s, i) => (
          <i key={s.key} className={i === step ? 'on' : ''} onClick={() => setStep(i)} title={s.label} />
        ))}</span>
        <button onClick={() => setStep((n) => Math.min(steps.length - 1, n + 1))}
          disabled={step >= steps.length - 1} aria-label="Next">›</button>
      </nav>
    </div>
  )
}

function Wheel({ names = [], result, campaign = '', vendorName = '', prizeName = '',
                 prizePhoto = null, prizeValue = 0, products = [], offers = [] }) {
  const [stage, setStage] = useState(false)
  return (
    <>
      <section className="gw-wheel-wrap-card" aria-label="The draw">
        <h2>The draw</h2>
        <Draw names={names} result={result} />
        <EntryList names={names} total={Number(result?.entry_count) || names.length} />
        <button className="gw-secondary-action gw-stage-open" onClick={() => setStage(true)}>
          <Icon.camera /> Open the reveal screen
        </button>
        <p className="gw-wheel-proof">
          A full-screen version for recording: the prize, the shop&rsquo;s products, the offers, then the draw.
        </p>
      </section>

      {stage && (
        <RevealStage onClose={() => setStage(false)} campaign={campaign} vendorName={vendorName}
          prizeName={prizeName} prizePhoto={prizePhoto} prizeValue={prizeValue}
          products={products} offers={offers} names={names} result={result} />
      )}
    </>
  )
}

// What somebody sees after the draw.
//
// Three states live in here, because they are three views of the same thing
// and splitting them would let them drift apart:
//
//   B — they entered, did not win, and the earning window is open.
//   C — the window has closed. What they earned is still theirs, and the two
//       ordinary ways to earn are offered instead.
//   nothing — they won, or never entered. The panel does not appear at all.
//
// Two things it must never do. It must not suggest the reward is the prize:
// it is money earned, and the progress bar says so in those words. And it
// must not overstate what is owed, so money still inside its grace period —
// which a refund would take back — is counted separately from money that has
// cleared.
function DidntWin({ slug, prizeValue = 0, prizeName = '', prizePhoto = null }) {
  const { user } = useAuth()
  const toast = useToast()
  const [now, setNow] = useState(Date.now())
  const { data } = useData(async () => {
    if (!user) return null
    const { data: row, error } = await supabase.rpc('my_promo_referral', { p_slug: slug })
    if (error) throw error
    return row
  }, [slug, user?.id])

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
  if (!data) return null

  const ends = new Date(data.expires_at).getTime()
  const left = Math.max(0, ends - now)
  const days = Math.floor(left / 86400000)
  const hours = Math.floor((left % 86400000) / 3600000)
  const confirmed = Number(data.earned || 0)
  const pending = Number(data.pending || 0)
  const reward = Number(data.reward || 0)

  // The progress bar is measured against the thing they entered for, because
  // that is what they wanted. It is a shopping target, not a prize: the words
  // below say "towards", and the money is theirs either way.
  const goal = prizeValue > 0 ? prizeValue : 0
  const pct = goal > 0 ? Math.min(100, Math.round((confirmed / goal) * 100)) : 0
  const salesToGoal = goal > 0 && reward > 0 ? Math.ceil(Math.max(0, goal - confirmed) / reward) : 0

  // The referral link the rest of the site already understands: /r/<code>
  // remembers who sent this visitor, and the product slug after it takes
  // them straight to the thing being promoted. A "?ref=" parameter would be
  // read by nothing and the referrer would earn nothing.
  const link = (p) => `${window.location.origin}/r/${encodeURIComponent(data.code.toLowerCase())}/${encodeURIComponent(p.slug)}`

  const copy = async (text, said) => {
    try { await navigator.clipboard.writeText(text); toast(said) }
    catch { toast('Could not copy. Hold the link to copy it by hand.', true) }
  }

  // State C — the window has closed.
  if (!data.open) {
    return (
      <section className="gw-section" aria-label="The referral offer has ended">
        <div className="gw-ended">
          <span className="gw-badge">Offer closed</span>
          <h1>This earning offer has ended.</h1>
          <p>
            New referrals no longer qualify for this campaign. Everything you already earned
            stays recorded and is paid under the terms it was earned on.
          </p>
          {confirmed + pending > 0 && (
            <div className="gw-earn-totals">
              <div><b>{money(confirmed, { whole: true })}</b><span>earned</span></div>
              {pending > 0 && <div><b>{money(pending, { whole: true })}</b><span>still clearing</span></div>}
            </div>
          )}
        </div>
        <div className="gw-doors-pair" style={{ marginTop: 14 }}>
          <div className="gw-earn-card">
            <h2>Already a customer?</h2>
            <p>
              Once you have completed an order, you can keep earning the fixed reward for every
              new customer you bring, with no campaign and no deadline.
            </p>
            <Link className="gw-secondary-action" to="/search">Browse products <Icon.arrow /></Link>
          </div>
          <div className="gw-earn-card">
            <h2>Want to promote properly?</h2>
            <p>
              Our affiliate programme is separate and runs on agreed percentage commissions
              rather than a flat amount. It is open by application.
            </p>
            <Link className="gw-secondary-action" to="/affiliates">Apply to be an affiliate <Icon.arrow /></Link>
          </div>
        </div>
      </section>
    )
  }

  // State B — the window is open.
  return (
    <>
      <section className="gw-hero" aria-label="Earn from referrals">
        <div className="gw-head">
          <span className="gw-badge"><Icon.sparkles /> Your second opportunity begins</span>
          <h1>Didn&rsquo;t win? <span className="gw-gold">You can still earn.</span></h1>
          <p className="gw-hero-summary">
            Share a ZaMarket product with someone who actually wants it. When a{' '}
            <strong>new customer</strong> completes a purchase through your link, you earn a fixed
            reward — the same money an affiliate earns, paid the same way.
          </p>
          <p className="gw-hero-disclaimer">
            For verified entrants who did not win. No previous purchase is required during this
            limited period, and you never earn on your own orders.
          </p>
        </div>
        <div className="gw-prize-art">
          {prizePhoto
            ? <img src={prizePhoto} alt={prizeName} className="gw-photo"/>
            : <div className="gw-photo gw-photo-none"><Icon.gift/><span>{prizeName}</span></div>}
          <div className="gw-prize-plaque">
            <span>Earn towards this</span>
            <strong>{prizeName}</strong>
            {goal > 0 && <span>{money(goal, { whole: true })}</span>}
          </div>
        </div>
      </section>

      <div className="gw-ribbon">
        <strong><Icon.clock /> Limited-time referral opportunity</strong>
        <span>
          {days > 0 ? `${days} day${days === 1 ? '' : 's'} ` : ''}{hours}h remaining · closes {localDate(data.expires_at)}
        </span>
      </div>

      <div className="gw-earn-pair">
        <div className="gw-earn-card">
          <span className="gw-eyebrow">Fixed reward · not an affiliate percentage</span>
          <h2>One successful sale. One clear reward.</h2>
          <div className="gw-fixed">
            <div>
              <b>{money(reward, { whole: true })}</b>
              <small>per qualifying sale</small>
            </div>
            <div className="gw-fixed-not">
              <b>{reward}%</b>
              <small>Not a percentage. A flat amount, set per product.</small>
            </div>
          </div>
          <div className="gw-mylink">
            <code>{data.code}</code>
            <button onClick={() => copy(data.code, 'Code copied')}>Copy code</button>
          </div>
          <div className="gw-earn-totals">
            <div><b>{money(confirmed, { whole: true })}</b><span>earned</span></div>
            {pending > 0 && <div><b>{money(pending, { whole: true })}</b><span>still clearing</span></div>}
          </div>
          <p>
            It pays on a first order from somebody new.
            {Number(data.cap) > 0 && ` The most you can earn from this campaign is ${money(data.cap, { whole: true })}.`}
            {pending > 0 && ' Money still clearing is from orders that have not finished yet — a refund would take that part back, so it is counted separately.'}
          </p>
        </div>

        {goal > 0 && (
          <div className="gw-earn-card">
            <span className="gw-eyebrow">Product goal</span>
            <h2>Earn towards the thing you wanted.</h2>
            <div className="gw-goal-figures">
              <b>{money(confirmed, { whole: true })}</b>
              <span>of {money(goal, { whole: true })}{prizeName ? ` · ${prizeName}` : ''}</span>
            </div>
            <div className="gw-progress-track">
              <div className="gw-progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <p className="gw-goal-note">
              {salesToGoal > 0
                ? `${salesToGoal} more qualifying ${salesToGoal === 1 ? 'sale covers' : 'sales cover'} it.`
                : 'You have earned enough to cover it.'}{' '}
              This is money you earned, not a prize — spend it on this or on anything else.
            </p>
          </div>
        )}
      </div>

      <section className="gw-section" aria-label="How earning works">
        <span className="gw-eyebrow">Your temporary referral privilege</span>
        <h2>How it works</h2>
        <ol className="gw-steps">
          <li><span>01</span><strong>Choose an eligible product</strong><p>Only the products approved for this campaign earn a reward.</p></li>
          <li><span>02</span><strong>Share your unique link</strong><p>Send it to someone who genuinely wants that product. Never spam contacts.</p></li>
          <li><span>03</span><strong>Get rewarded after purchase</strong><p>Paid, fulfilled orders from new customers earn the fixed amount.</p></li>
        </ol>
      </section>

      {(data.products || []).length > 0 && (
        <section className="gw-section" aria-label="Products you can share">
          <header className="gw-shelf-head">
            <div>
              <span className="gw-eyebrow">Curated, not crowded</span>
              <h2>Choose a product to share</h2>
              <p>Real listings at live prices, with the reward each one pays.</p>
            </div>
          </header>
          <div className="gw-product-grid">
            {data.products.map((p) => (
              <div className="gw-product gw-share-item" key={p.slug}>
                <div className="gw-product-image">
                  {p.images?.[0]
                    ? <img src={p.images[0]} alt={p.name} loading="lazy" />
                    : <span className="gw-product-image-fallback"><Icon.box /></span>}
                </div>
                <div className="gw-product-details">
                  <h3>{p.name}</h3>
                  <div className="gw-product-price"><strong>{money(p.price, { whole: true })}</strong></div>
                  <span className="gw-share-reward">You earn {money(p.reward, { whole: true })}</span>
                  <div className="gw-share-row">
                    <button onClick={() => copy(link(p), 'Link copied — share it with someone who wants this')}>Copy link</button>
                    <a href={`https://wa.me/?text=${encodeURIComponent(`${p.name} on ZaMarket — ${money(p.price, { whole: true })}\n${link(p)}`)}`}
                       target="_blank" rel="noreferrer">WhatsApp</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="gw-notice">
        <strong>What happens when the timer reaches zero?</strong>
        This privilege ends for people who have not bought anything. Rewards already earned stay
        recorded and are paid under the terms they were earned on. Customers who have completed an
        order keep the ordinary referral reward, and the approved affiliate programme carries on
        separately on its own percentage terms.
      </div>
    </>
  )
}
