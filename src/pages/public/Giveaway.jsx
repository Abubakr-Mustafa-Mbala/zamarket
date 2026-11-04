import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { useCart } from '../../lib/cart'
import { Loading, useToast } from '../../components/ui'
import { money } from '../../lib/format'
import { useSeo } from '../../lib/seo'
import Icon from '../../lib/icons'

// A giveaway, and the wheel.
//
// Two things about this page are not negotiable and are worth stating where
// somebody editing it will see them.
//
// 1. ENTRY IS FREE. Under the Zambian Lotteries Act a lottery is a scheme
//    where chances are "acquired by prior payment". Free entry is what keeps
//    this outside that definition. There is no payment path here and there
//    must never be one.
//
// 2. THE WHEEL DOES NOT DECIDE ANYTHING. The winner is chosen by the
//    database, with cryptographic randomness, before this page animates. The
//    spin is told the answer and lands on it. If the wheel picked the winner,
//    anyone could pick the winner by editing the page in their browser.
//
// Social actions are encouraged with links and never required, because Meta
// does not allow requiring a share or a tag to enter — and because we have
// no honest way to verify that someone did it.

const fmtLeft = (ms) => {
  if (ms <= 0) return 'Closed'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (d > 0) return `${d} day${d === 1 ? '' : 's'}, ${h} hr`
  if (h > 0) return `${h} hr ${m} min`
  return `${m} min`
}

export function GiveawayList() {
  useSeo({
    title: 'Giveaways | ZA Market',
    description: 'Free-to-enter giveaways from local sellers on ZA Market. No purchase, no payment.',
    canonical: '/giveaways',
  })
  const { data, loading } = useData(async () => {
    const { data: rows, error } = await supabase.from('giveaway_campaigns')
      .select('slug,title,description,prize_text,prize_value,closes_at,status,winners')
      .in('status', ['live', 'closed', 'drawn', 'fulfilled'])
      .order('closes_at', { ascending: false })
    if (error) throw error
    return rows || []
  }, [])

  if (loading) return <Loading shape="cards" />
  const live = (data || []).filter((g) => g.status === 'live')
  const past = (data || []).filter((g) => g.status !== 'live')

  return (
    <div className="stack">
      <div className="home-market-head">
        <div>
          <h1>Giveaways</h1>
          <p>Free to enter. No purchase, and nothing to pay.</p>
        </div>
      </div>
      {live.length === 0 && past.length === 0 && (
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden><Icon.tag /></span>
          <h1>No giveaway running</h1>
          <p>When one opens it will be here. Meanwhile, have a look at what the sellers have.</p>
          <Link to="/search" className="btn primary">Browse products</Link>
        </div>
      )}
      {live.length > 0 && (
        <div className="home-product-grid">
          {live.map((g) => <GiveawayCard key={g.slug} g={g} />)}
        </div>
      )}
      {past.length > 0 && (
        <>
          <h2 className="shelf-head">Finished</h2>
          <div className="home-product-grid">
            {past.map((g) => <GiveawayCard key={g.slug} g={g} />)}
          </div>
        </>
      )}
    </div>
  )
}

function GiveawayCard({ g }) {
  const left = new Date(g.closes_at).getTime() - Date.now()
  return (
    <Link to={`/giveaways/${g.slug}`} className="card stack-sm gw-card">
      <span className={`badge ${g.status === 'live' ? 'ok' : ''}`}>
        {g.status === 'live' ? `Closes in ${fmtLeft(left)}` : g.status === 'drawn' || g.status === 'fulfilled' ? 'Winner drawn' : 'Closed'}
      </span>
      <h3>{g.title}</h3>
      {g.prize_text && <p className="small muted">{g.prize_text}</p>}
      {g.prize_value > 0 && <p className="strong money">{money(g.prize_value)} prize</p>}
      <p className="tiny muted">{g.winners} winner{g.winners === 1 ? '' : 's'} · free to enter</p>
    </Link>
  )
}

export default function GiveawayPage() {
  const { slug } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  // Unticked, and separate from entering. Entering a giveaway must never
  // subscribe anybody to anything — that is both the rule and the reason
  // people trust the next one.
  const [optIn, setOptIn] = useState(false)
  const { setCampaign } = useCart()

  const { data, loading, reload } = useData(async () => {
    const { data: row, error } = await supabase.rpc('giveaway_public', { p_slug: slug })
    if (error) throw error
    return row
  }, [slug])

  // A ticking countdown, once a second, cleared when the page closes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Anything bought after landing here counts as this campaign's doing. The
  // marketplace already understands `campaign:<code>` as an order source, so
  // the giveaway reports from the same records as everything else rather
  // than keeping its own tally that disagrees.
  useEffect(() => { if (slug) setCampaign(slug) }, [slug])

  useSeo(data ? {
    title: `${data.title} | ZA Market giveaway`,
    description: `${data.prize_text || data.title}. Free to enter on ZA Market.`,
    canonical: `/giveaways/${slug}`,
  } : {})

  if (loading) return <Loading shape="page" />
  if (!data) {
    return (
      <div className="empty-state">
        <h1>We couldn&rsquo;t find that giveaway</h1>
        <p>It may have been taken down. Have a look at what else is running.</p>
        <Link to="/giveaways" className="btn primary">All giveaways</Link>
      </div>
    )
  }

  const closes = new Date(data.closes_at).getTime()
  const open = data.status === 'live' && now < closes
  const product = data.product
  const photo = product?.images?.[0]

  // Can this actually be sold today?
  //
  // A prize is frequently the only unit there is — that is why it is the
  // prize. Something made to order or a service can always be sold, because
  // another is made on request; a stocked item can only be sold if there is
  // a second one on the shelf. Anything else and the buy button is a promise
  // the seller cannot keep.
  const madeOnDemand = product?.fulfilment === 'made_to_order' || product?.fulfilment === 'service'
  const buyable = !!product
    && product.status === 'published'
    && (madeOnDemand || Number(product.stock_available) > 0)

  const enter = async () => {
    if (!user) return toast('Sign in first, then tap enter', true)
    setBusy(true)
    const { error } = await supabase.rpc('enter_giveaway', { p_slug: slug })
    if (error) { setBusy(false); return toast(error.message, true) }
    // Consent is a separate record and a separate decision. It is only ever
    // written when the box was actually ticked.
    if (optIn) await supabase.rpc('set_marketing_consent', { p_granted: true, p_source: `giveaway:${slug}` })
    setBusy(false)
    toast('You are in. Good luck.')
    reload()
  }

  const shareText = `${data.title} — free to enter on ZaMarket.\n${window.location.href}`

  return (
    <div className="stack gw">
      <div className="gw-hero">
        {photo
          ? <img src={photo} alt={product?.name || data.title} className="gw-photo" />
          : <div className="gw-photo gw-photo-none" aria-hidden />}
        <div className="gw-head">
          <span className={`badge ${open ? 'ok' : ''}`}>
            {open ? 'Open now' : data.result ? 'Winner drawn' : 'Entries closed'}
          </span>
          <h1>{data.title}</h1>
          {product && (
            <p className="gw-prize">
              <Link to={product.vendor_slug ? `/${product.vendor_slug}/${product.slug}` : `/p/${product.slug}`}>
                {product.name}
              </Link>
              {product.price > 0 && <span className="money"> · worth {money(product.price)}</span>}
              {product.vendor_name && <span className="muted"> · from {product.vendor_name}</span>}
            </p>
          )}
          {!product && data.prize_text && <p className="gw-prize">{data.prize_text}</p>}
          <div className="gw-facts">
            <span><strong>{open ? fmtLeft(closes - now) : '—'}</strong> left</span>
            <span><strong>{data.entries}</strong> entered</span>
            <span><strong>{data.winners}</strong> winner{data.winners === 1 ? '' : 's'}</span>
            <span><strong>Free</strong> to enter</span>
          </div>
        </div>
      </div>

      {data.result
        ? <Wheel names={data.names} result={data.result} />
        : (
          <div className="card stack-sm gw-enter">
            {data.mine
              ? <><h2>You are entered</h2><p className="small muted">Nothing else to do. The draw happens after entries close, and the result is published on this page.</p></>
              : open
                ? (
                  <>
                    <h2>Enter the giveaway</h2>
                    <p className="small muted">
                      One entry per person. It costs nothing, and you never have to buy anything.
                    </p>
                    <label className="check consent">
                      <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
                      <span>
                        Also send me occasional offers from ZaMarket. Optional — your entry
                        counts either way, and you can stop them at any time.
                      </span>
                    </label>
                    <button className="btn primary" onClick={enter} disabled={busy}>
                      {busy ? 'Entering…' : user ? 'Enter — it is free' : 'Sign in to enter'}
                    </button>
                  </>
                )
                : <><h2>Entries are closed</h2><p className="small muted">The draw happens shortly and the result appears here.</p></>}

            <div className="gw-social">
              <p className="tiny muted">
                Telling people helps, and it is <strong>optional</strong> — sharing is not required
                to enter and does not improve your chances.
              </p>
              <div className="btn-row">
                <a className="btn sm" target="_blank" rel="noreferrer"
                  href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}>Share on WhatsApp</a>
                <button className="btn sm ghost" onClick={() => {
                  navigator.clipboard?.writeText(window.location.href)
                  toast('Link copied')
                }}>Copy link</button>
              </div>
            </div>
          </div>
        )}

      {product && (buyable
        ? (
          <div className="card stack-sm gw-buy">
            <h2>Need it before the draw?</h2>
            <p className="small muted">
              The draw is on {new Date(data.closes_at).toLocaleDateString('en-ZM')}. If you need one
              sooner — a birthday, an order of your own — you can buy the same item now.
              Buying does not affect your entry, and entering does not affect the price.
              {product.fulfilment === 'made_to_order' && product.lead_time_days > 0
                && ` Made to order, about ${product.lead_time_days} day${product.lead_time_days === 1 ? '' : 's'} to prepare.`}
            </p>
            <div className="btn-row">
              <Link className="btn primary"
                to={product.vendor_slug ? `/${product.vendor_slug}/${product.slug}` : `/p/${product.slug}`}>
                Buy it now{product.price > 0 ? ` — ${money(product.price)}` : ''}
              </Link>
              {product.vendor_slug && (
                <Link className="btn" to={`/${product.vendor_slug}`}>
                  See everything from {product.vendor_name || 'this seller'}
                </Link>
              )}
            </div>
          </div>
        )
        : (
          // The prize is often the only one there is. Offering to sell a
          // second would be taking money for something nobody can deliver,
          // so the page sends people to what the seller actually has instead.
          <div className="card stack-sm gw-buy">
            <h2>This one is the last</h2>
            <p className="small muted">
              The prize is the only one in stock, so it is not on sale while the giveaway runs.
              {product.vendor_name ? ` ${product.vendor_name} has other things, though.` : ''}
            </p>
            {product.vendor_slug && (
              <div className="btn-row">
                <Link className="btn primary" to={`/${product.vendor_slug}`}>
                  See what else {product.vendor_name || 'this seller'} has
                </Link>
              </div>
            )}
          </div>
        ))}

      {data.description && (
        <div className="card article"><h2>About this giveaway</h2><p>{data.description}</p></div>
      )}

      {/* The traffic is here anyway. A giveaway page is the busiest page on
          the site while it runs, and sending everyone away empty-handed when
          the draw ends wastes the one moment they are paying attention.
          Nothing here is a condition of entry. */}
      <div className="card stack-sm gw-while-here">
        <h2>While you are here</h2>
        <div className="gw-doors">
          <Link to="/search" className="gw-door">
            <strong>Shop the marketplace</strong>
            <span>Everything local sellers have listed, delivered in Lusaka.</span>
          </Link>
          <Link to="/affiliates" className="gw-door">
            <strong>Earn by sharing products</strong>
            <span>Promote what you like and earn commission on what sells. Free to join.</span>
          </Link>
          <Link to="/apply/vendor" className="gw-door">
            <strong>Sell your own things here</strong>
            <span>Bakers, tailors, phone shops, services. We handle the orders and delivery.</span>
          </Link>
        </div>
      </div>

      <div className="card stack-sm">
        <h2>The rules</h2>
        <ul className="gw-rules">
          <li><strong>Free to enter.</strong> No purchase, no payment, no fee of any kind.</li>
          <li><strong>One entry per person</strong>, through a ZA Market account.</li>
          <li>Open to entrants in <strong>{data.area}</strong>, aged <strong>{data.min_age} and over</strong>.</li>
          <li>Entries close <strong>{new Date(data.closes_at).toLocaleString('en-ZM')}</strong>.</li>
          <li>Winners are chosen at random by the system, not by a person, and the result is published on this page.</li>
          <li>The winner is contacted privately. We never publish anyone&rsquo;s phone number or address.</li>
          <li>A winner is <strong>never</strong> required to give a review or a testimonial to receive the prize.</li>
          <li>
            This giveaway is run by ZA Market. It is <strong>not sponsored, endorsed or
            administered by, and is not associated with, Meta, Instagram, TikTok or WhatsApp.</strong>
          </li>
        </ul>
        {data.terms && <p className="small muted">{data.terms}</p>}
      </div>
    </div>
  )
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
