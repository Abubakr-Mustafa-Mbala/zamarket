import { OfferingPage } from './Offering'
import VendorStorefront, { anchorFor } from '../../components/storefront/VendorStorefront'
import { Fragment, Suspense, useEffect, useMemo, useState, useRef } from 'react'
import { Link, useParams, useNavigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../lib/cart'
import { useSaved } from '../../lib/saved'
import { useAuth } from '../../lib/auth'
import { money } from '../../lib/format'
import { Stars, Modal, Field, Input, useToast, Loading } from '../../components/ui'
import ErrorBoundary from '../../components/ErrorBoundary'
import BrandMark from '../../components/BrandMark'
import JournalHighlights from '../../components/JournalHighlights'
import { offerCopy, useCountdown, DEAL_TYPES, CONDITION_TYPES } from '../../lib/offers'
import { howText } from '../../lib/madeToOrder'
import { iconFor } from '../../lib/categories'
import { useDepartments, useShopInfo } from '../../lib/departments'
import { payLine } from '../../lib/paymentWords'
import { commissionLabel } from '../../lib/economics'
import PromoKit from '../../components/PromoKit'
import PhotoViewer from '../../components/PhotoViewer'
import TrustPanel from '../../components/TrustPanel'
import OfferingCard from '../../components/OfferingCard'
import Icon from '../../lib/icons'
import { detectChannel, rememberChannel } from '../../lib/channel'
import { frontPageOrder, departmentShelves, justAdded, pickedForFront } from '../../lib/frontPage'
import { startAnalytics, trackPage, trackViewItem, trackAddToCart } from '../../lib/analytics'
import { useSeo, productSeo } from '../../lib/seo'
import ShareProduct from '../../components/ShareProduct'
import ShareStore from '../../components/ShareStore'
import { productRelevance } from '../../lib/productDiscovery'
import { productShareUrl } from '../../lib/affiliateLinks'
import { fetchCataloguePages } from '../../lib/paginatedCatalogue'

// ---------- shared catalogue loader ----------
// Cache successful reads briefly; never cache a failed/partial response as an
// empty marketplace. A shared in-flight promise avoids duplicate requests.
const CATALOGUE_TTL_MS = 5 * 60 * 1000
let catalogueCache = null
let catalogueFetchedAt = 0
let catalogueRequest = null
const catalogueListeners = new Set()

function publishCatalogue(value) {
  for (const listener of catalogueListeners) listener(value)
}

async function loadCatalogue({ force = false } = {}) {
  if (!force && catalogueCache && Date.now() - catalogueFetchedAt < CATALOGUE_TTL_MS) {
    return catalogueCache
  }
  if (catalogueRequest) return catalogueRequest
  catalogueRequest = (async () => {
    // Supabase limits individual responses; page each public view to avoid
    // hiding products, offers, or vendors once the marketplace grows.
    //
    // Only products are essential. Offers add deal badges and vendors add the
    // sellers shelf, so if either fails the shop still opens without them.
    // Previously all three were awaited together and one failure blanked the
    // whole marketplace: a permission error on public_offers took the shop
    // down for every logged-out visitor while signed-in ones saw nothing wrong.
    const [productsResult, offersResult, vendorsResult, picksResult] = await Promise.allSettled([
      fetchCataloguePages((from, to) => supabase.from('public_products').select('*').order('created_at', { ascending: false }).order('id').range(from, to)),
      fetchCataloguePages((from, to) => supabase.from('public_offers').select('id,product_id,type,name,deal_price,normal_value,units,end_at,remaining').order('id').range(from, to)),
      fetchCataloguePages((from, to) => supabase.from('public_vendors').select('*').order('business_name').order('id').range(from, to)),
      // The hand-picked front page, published as its own small view so that
      // adding it never has to touch public_products.
      fetchCataloguePages((from, to) => supabase.from('front_page_picks').select('id,front_rank').order('front_rank').order('id').range(from, to)),
    ])

    // Without products there is no marketplace, so that one still throws.
    if (productsResult.status === 'rejected') throw productsResult.reason
    const products = productsResult.value

    const optional = (result, label) => {
      if (result.status === 'fulfilled') return result.value
      console.error(`Catalogue: ${label} unavailable, continuing without it.`, result.reason)
      return []
    }
    const offers = optional(offersResult, 'offers')
    const vendors = optional(vendorsResult, 'vendors')

    // Carry the chosen order onto the products themselves, so everything
    // downstream can keep reading p.front_rank.
    const ranks = new Map(optional(picksResult, 'front page picks').map((r) => [r.id, r.front_rank]))
    if (ranks.size) for (const p of products) if (ranks.has(p.id)) p.front_rank = ranks.get(p.id)
    const offersBy = {}
    for (const offer of offers) {
      (offersBy[offer.product_id] = offersBy[offer.product_id] || []).push(offer)
    }
    catalogueCache = { products, offersBy, vendors }
    catalogueFetchedAt = Date.now()
    publishCatalogue(catalogueCache)
    return catalogueCache
  })().finally(() => { catalogueRequest = null })
  return catalogueRequest
}

function useCatalogue() {
  const [data, setData] = useState(catalogueCache)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const update = (value) => { if (active) { setData(value); setError('') } }
    catalogueListeners.add(update)
    loadCatalogue({ force: attempt > 0 }).then(update).catch((e) => {
      if (active) {
        console.error('Catalogue request failed:', e)
        setError('We could not connect to the marketplace. Please try again.')
      }
    })
    return () => { active = false; catalogueListeners.delete(update) }
  }, [attempt])
  return { data, error, retry: () => setAttempt((n) => n + 1) }
}

function CatalogueUnavailable({ error, retry }) {
  if (!error) return <Loading />
  return (
    <div className="catalogue-unavailable" role="alert">
      <h2>We couldn't load the marketplace</h2>
      <p>{error}</p>
      <button type="button" className="btn primary" onClick={retry}>Try again</button>
    </div>
  )
}

// Departments with nothing in them are hidden from shoppers — an empty shelf looks abandoned.
function useStockedDepartments(all) {
  const { data } = useCatalogue()
  return useMemo(() => {
    if (!data) return []
    const have = new Set((data.products || []).map((p) => p.category))
    return all.filter((d) => have.has(d.name))
  }, [data, all])
}

const isOut = (p) => p.fulfilment === 'in_stock' && (p.status === 'out_of_stock' || (p.owner_type === 'founder' && p.stock_available <= 0))
const dealFor = (offersBy, id) => (offersBy[id] || []).find((o) => DEAL_TYPES.includes(o.type))

function Price({ value, size }) {
  const v = Number(value || 0)
  const [whole, dec] = v.toFixed(2).split('.')
  return (
    <span className={`price-tag ${size || ''}`} aria-label={money(v)}>
      <span className="pt-cur">K</span><span className="pt-whole">{Number(whole).toLocaleString('en-ZM')}</span><span className="pt-dec">{dec}</span>
    </span>
  )
}

// ---------- shell ----------
// The hero belongs to the sellers. Each vendor picks up to six products to
// feature from their own store, and this rotates through them — one product per
// seller, so the front page spreads across businesses. The shopper sees the
// product, the price and whose shop it comes from, and goes straight there.
//
// The founder's own marketing slots still take the stage when one is live
// (FounderHero below); this is what the homepage shows the rest of the time.
function VendorHero() {
  const [slides, setSlides] = useState(null)
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    supabase.rpc('storefront_hero', { p_limit: 6 })
      .then(({ data, error }) => setSlides(!error && Array.isArray(data) ? data : []))
      .catch(() => setSlides([]))
  }, [])

  const n = slides?.length || 0
  const at = n ? i % n : 0

  // Count the exposure so the vendor sees it in their own numbers.
  useEffect(() => {
    if (!n) return
    const id = slides[at]?.product_id
    if (id) supabase.rpc('hero_seen', { p_product: id })
  }, [slides, at, n])

  useEffect(() => {
    if (n < 2 || paused) return
    const t = setInterval(() => setI((x) => x + 1), 6500)
    return () => clearInterval(t)
  }, [n, paused])

  if (slides === null) return <div className="vhero vhero-wait" aria-hidden />
  if (!n) return null

  const s = slides[at]
  const v = s.vendor || {}
  const to = v.slug && s.slug ? `/${v.slug}/${s.slug}` : `/p/${s.slug}`
  const enquire = s.sales_model === 'negotiate' || s.sales_model === 'enquire' || s.offering_type === 'vehicle'
  const book = s.fulfilment === 'service' || s.offering_type === 'event'
  const cta = enquire ? 'Enquire' : book ? 'See times' : 'View this'
  const save = s.normal_price ? Number(s.normal_price) - Number(s.price) : 0

  return (
    <section
      className="vhero"
      aria-label="Featured by our sellers"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Link
        to={to}
        className="vhero-stage"
        onClick={() => supabase.rpc('hero_click', { p_product: s.product_id })}
      >
        <span className="vhero-photo">
          {s.image
            ? <img src={s.image} alt={s.name} key={s.product_id} />
            : <span className="vhero-ph" aria-hidden><Icon.box /></span>}
          {save > 0 && <span className="vhero-save">Save {money(save)}</span>}
        </span>

        <span className="vhero-copy">
          <span className="vhero-eyebrow">
            {s.chosen_by_vendor ? 'Chosen by the seller' : 'On ZaMarket now'}
            {s.category ? <em> · {s.category}</em> : null}
          </span>
          <span className="vhero-name">{s.name}</span>
          <span className="vhero-price">
            <Price value={s.price} size="lg" />
            {s.normal_price && <span className="vhero-was">{money(s.normal_price)}</span>}
            {enquire && <span className="vhero-asking">asking</span>}
          </span>
          {s.rating ? (
            <span className="vhero-rating"><Stars n={s.rating} /> {s.rating} ({s.review_count})</span>
          ) : null}
          <span className="vhero-cta btn primary">{cta} <Icon.arrow /></span>
        </span>
      </Link>

      {v.name && (
        <Link to={`/${v.slug}`} className="vhero-seller" onClick={(e) => e.stopPropagation()}>
          {v.logo
            ? <img src={v.logo} alt="" />
            : <span className="vhero-mark" aria-hidden>{v.name.slice(0, 1)}</span>}
          <span className="vhero-seller-text">
            <b>{v.name}</b>
            <em>
              {[v.town, v.completed_orders > 0 && `${v.completed_orders} order${v.completed_orders === 1 ? '' : 's'} delivered`]
                .filter(Boolean).join(' · ') || 'Selling on ZaMarket'}
            </em>
          </span>
          <span className="vhero-visit">Visit shop <Icon.arrow /></span>
        </Link>
      )}

      {n > 1 && (
        <div className="vhero-dots" role="tablist" aria-label="Featured products">
          {slides.map((x, k) => (
            <button
              key={x.product_id}
              role="tab"
              aria-selected={k === at}
              className={k === at ? 'on' : ''}
              onClick={() => { setI(k); setPaused(true) }}
              aria-label={`${x.name}${x.vendor?.name ? ` from ${x.vendor.name}` : ''}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// The founder's own marketing slot. It only appears when one has been set, and
// when it does it replaces the vendor rotation for as long as it runs.
function FounderHero() {
  const [slots, setSlots] = useState(null)
  const [i, setI] = useState(0)
  useEffect(() => { supabase.rpc('featured_now').then(({ data }) => setSlots(data || [])).catch(() => setSlots([])) }, [])
  useEffect(() => {
    if (!slots?.length) return
    supabase.rpc('featured_seen', { p_slot: slots[i % slots.length].id })
    if (slots.length < 2) return
    const t = setInterval(() => setI((x) => x + 1), 7000)
    return () => clearInterval(t)
  }, [slots, i])
  if (slots === null) return null
  if (!slots.length) return null
  const f = slots[i % slots.length]
  const v = f.vendor || {}
  return (
    <section className="featured-hero">
      <div className="fh-media" style={f.image_url ? { backgroundImage: `url(${f.image_url})` } : undefined} aria-hidden />
      <div className="fh-body">
        <span className="fh-eyebrow">{f.eyebrow}</span>
        <h2>{f.headline}</h2>
        {f.sub && <p>{f.sub}</p>}
        {v.name && (
          <span className="fh-vendor">
            {v.logo ? <img src={v.logo} alt="" /> : <span className="fh-mark">{v.name.slice(0, 1)}</span>}
            <span>{v.name}</span>
            {v.rating ? <span className="fh-rating"><Icon.star /> {v.rating}</span> : null}
          </span>
        )}
        <Link to={f.product?.slug ? `/p/${f.product.slug}` : f.link} className="btn hero-cta" onClick={() => supabase.rpc('featured_click', { p_slot: f.id })}>
          {f.cta} <Icon.arrow />
        </Link>
        {f.product && (
          <Link to={`/p/${f.product.slug}`} className="fh-product">
            {f.product.image ? <img src={f.product.image} alt="" /> : <span className="fh-mark"><Icon.box /></span>}
            <span><em>Featured</em>{f.product.name}<b>{money(f.product.price)}</b></span>
          </Link>
        )}
      </div>
      {slots.length > 1 && (
        <div className="fh-dots">{slots.map((s2, k) => <button key={s2.id} className={k === i % slots.length ? 'on' : ''} onClick={() => setI(k)} aria-label={`Show ${s2.headline}`} />)}</div>
      )}
    </section>
  )
}

// What the homepage shows is decided by the marketplace, not hard-coded here.
// A section only appears when there is enough in it.
// Somewhere to reach a person. The number and links come from Settings, so the
// founder's own phone never has to be hard-coded, and each one only appears
// once it has actually been filled in.
export function HelpStrip({ compact = false }) {
  const { settings } = useAuth()
  const phone = (settings?.company_phone || '').trim()
  const whatsapp = (settings?.company_whatsapp || '').trim()
  const instagram = (settings?.social_instagram || '').trim()
  if (!phone && !whatsapp && !instagram) return null

  const waLink = whatsapp && `https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`
  const igLink = instagram && (instagram.startsWith('http')
    ? instagram
    : `https://instagram.com/${instagram.replace(/^@/, '')}`)

  return (
    <section className={`help-strip ${compact ? 'compact' : ''}`} aria-label="Contact ZaMarket">
      {!compact && (
        <p className="hs-lead">
          <strong>Something wrong with an order?</strong>
          <span>Talk to a person at ZaMarket — not to the seller.</span>
        </p>
      )}
      <div className="hs-links">
        {phone && <a href={`tel:${phone.replace(/\s/g, '')}`} className="hs-link"><Icon.phone /> {phone}</a>}
        {waLink && <a href={waLink} className="hs-link" target="_blank" rel="noreferrer"><Icon.message /> WhatsApp</a>}
        {igLink && <a href={igLink} className="hs-link" target="_blank" rel="noreferrer"><Icon.camera /> Instagram</a>}
      </div>
    </section>
  )
}

// A seller's own products, so a seller card can show its real shelf.
function byVendor(products) {
  const m = {}
  for (const p of products) if (p.vendor_id) (m[p.vendor_id] = m[p.vendor_id] || []).push(p)
  return m
}

function Merchandised({ products, vendors, offersBy, excludeIds = [] }) {
  const [sections, setSections] = useState(null)
  useEffect(() => {
    supabase.rpc('home_sections', { p_min: 2 })
      .then(({ data, error }) => setSections(!error && data?.length ? data : fallbackSections(products)))
      .catch(() => setSections(fallbackSections(products)))
  }, [products.length])
  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])
  const shelves = useMemo(() => byVendor(products), [products])
  if (!sections) return <Loading shape="cards" />

  return (
    <>
      {[...sections].sort((a, b) => Number(a.kind === 'vendors') - Number(b.kind === 'vendors')).map((s) => {
        if (s.kind === 'vendors') {
          if (!vendors?.length) return null
          return (
            <section key={s.key} className="sellers-band home-sellers-bottom">
              <div className="shelf-head"><h2>Shop by store</h2><Link to="/sellers">All stores</Link></div>
              <div className="seller-strip">
                {vendors.slice(0, 5).map((v) => <SellerCard key={v.id} v={v} shelf={shelves[v.id] || []} />)}
              </div>
            </section>
          )
        }
        const excluded = new Set(excludeIds)
        const items = (s.ids || []).map((id) => byId[id]).filter((p) => p && !excluded.has(p.id))
        if (items.length < 2) return null
        return (
          <Row key={s.key} title={s.title} link={s.link} weighted={false}>
            {items.slice(0, 12).map((p) => <OfferingCard key={p.id} p={p} deal={dealFor(offersBy, p.id)} />)}
          </Row>
        )
      })}
    </>
  )
}

// If the marketplace can't answer — an older database, a dropped connection —
// the shop still fills itself from what it already has in hand.
function fallbackSections(products) {
  const pick = (test) => products.filter(test).map((p) => p.id)
  const out = [
    { key: 'just_added', title: 'Just added', sub: 'New on ZaMarket', link: '/search',
      ids: [...products].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12).map((p) => p.id) },
    { key: 'services', title: 'Services you can book', sub: 'Booked by date and time', link: '/search?type=service',
      ids: pick((p) => p.fulfilment === 'service' && !['course', 'class'].includes(p.offering_type)) },
    { key: 'courses', title: 'Learn something new', sub: 'Courses and training', link: '/search?type=course',
      ids: pick((p) => ['course', 'class'].includes(p.offering_type)) },
    { key: 'vehicles', title: 'Vehicles for sale', sub: 'Enquire and agree the price directly', link: '/motors',
      ids: pick((p) => p.offering_type === 'vehicle') },
    { key: 'made_to_order', title: 'Made to order', sub: 'Order a few days ahead', link: '/search',
      ids: pick((p) => p.fulfilment === 'made_to_order') },
  ].map((x) => ({ ...x, kind: 'products' })).filter((x) => x.ids.length >= 2)
  out.push({ key: 'local_sellers', kind: 'vendors', title: 'The businesses behind ZaMarket', sub: 'Every order handled by us, supplied by a local business', link: '/sellers' })
  return out
}

function CategoryRail() {
  const DEPARTMENTS = useDepartments()
  const stocked = useStockedDepartments(DEPARTMENTS)
  const [sp] = useSearchParams()
  const active = sp.get('cat')
  return (
    <nav className="cat-rail" aria-label="Categories">
      <Link to="/search?deals=1" className={`cat ${sp.get('deals') ? 'on' : ''}`}>
        <span className="cat-icon deals"><Icon.tag /></span>
        <span>Today's deals</span>
      </Link>
      {stocked.slice(0, 5).map((d) => (
        <Link key={d.name} to={`/search?cat=${encodeURIComponent(d.name)}`} className={`cat ${active === d.name ? 'on' : ''}`}>
          <span className="cat-icon">{d.icon}</span>
          <span>{d.name}</span>
        </Link>
      ))}
      <Link to="/categories" className="cat">
        <span className="cat-icon"><Icon.more /></span>
        <span>More categories</span>
      </Link>
    </nav>
  )
}

// The old footer was four full columns of links, which on a phone filled almost
// the whole screen. Now it is one compact bar — the links sit in groups that are
// collapsed on a phone and open on a wide screen — and it is the only place on
// the site that asks anyone to sell or to become an affiliate.
function FooterGroup({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`sf-group ${open ? 'open' : ''}`}>
      <button type="button" className="sf-title" onClick={() => setOpen(!open)} aria-expanded={open}>
        {title}<span className="sf-caret" aria-hidden>{open ? '−' : '+'}</span>
      </button>
      <div className="sf-links">{children}</div>
    </div>
  )
}

function ShopFooter({ user, home, giveaway }) {
  return (
    <footer className="shop-footer">
      <div className="sf-groups">
        <FooterGroup title="Shop">
          <Link to="/search">All products</Link>
          <Link to="/search?deals=1">Today's deals</Link>
          {giveaway && <Link className="shop-giveaway-live" to={`/giveaways/${encodeURIComponent(giveaway)}`}><Icon.gift /> Live giveaway</Link>}
          <Link to="/sellers">Sellers</Link>
          <Link to="/motors">ZaMarket Motors</Link>
          <Link to="/blog">The ZaMarket Journal</Link>
          <Link to="/review">Rate an order</Link>
        </FooterGroup>
        <FooterGroup title="ZaMarket">
          <Link to="/how-it-works">How ZaMarket works</Link>
          <Link to="/protection">If something goes wrong</Link>
          <Link to="/about">About us and contacts</Link>
        </FooterGroup>
        <FooterGroup title="Your account">
          <Link to={user ? home : '/login'}>{user ? 'Your account' : 'Sign in'}</Link>
          <Link to="/cart">Cart</Link>
          <Link to="/saved">Saved items</Link>
        </FooterGroup>
        {/* Company and affiliate programme links stay accessible in the footer. */}
        <FooterGroup title="Work with us">
          <Link to="/apply/vendor">Sell on ZaMarket</Link>
          <Link to="/affiliates">Become an affiliate</Link>
        </FooterGroup>
      </div>
      <HelpStrip compact />
      <div className="sf-base">
        <span className="wordmark on-mint">ZaMarket</span>
        <span>© {new Date().getFullYear()} · Lusaka, Zambia</span>
      </div>
    </footer>
  )
}

function BottomBar() {
  const { count } = useCart()
  const saved = useSaved()
  const here = useLocation().pathname
  const items = [
    { to: '/', label: 'Home', icon: <Icon.house />, end: true },
    { to: '/categories', label: 'Categories', icon: <Icon.grid /> },
    { to: '/search?deals=1', label: 'Deals', icon: <Icon.tag /> },
    { to: '/saved', label: 'Saved', icon: <Icon.heart />, badge: saved.count },
    { to: '/cart', label: 'Cart', icon: <Icon.cart />, badge: count },
  ]
  return (
    <nav className="bottom-bar" aria-label="Main">
      {items.map((i) => {
        const on = i.end ? here === '/' : here.startsWith(i.to.split('?')[0])
        return (
          <Link key={i.label} to={i.to} className={on ? 'on' : ''}>
            <span className="bb-icon">{i.icon}{i.badge > 0 && <em>{i.badge}</em>}</span>
            <span>{i.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function PublicShell() {
  const DEPARTMENTS = useDepartments()
  const stocked = useStockedDepartments(DEPARTMENTS)
  const { count, subtotal } = useCart()
  const { user, role, profile, settings: siteSettings } = useAuth()
  const { pathname } = useLocation()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') || '')
  const [cat, setCat] = useState(sp.get('cat') || '')
  useEffect(() => { setQ(sp.get('q') || ''); setCat(sp.get('cat') || '') }, [sp])

  // A giveaway link appears only while a campaign is genuinely open. An
  // always-on "Win now" button that leads to nothing teaches people to ignore
  // it, which is the opposite of what the campaign is for.
  const [activeGiveaway, setActiveGiveaway] = useState(null)
  useEffect(() => {
    let alive = true
    const check = () => supabase.from('giveaway_campaigns').select('slug,closes_at')
      .eq('status', 'live').gt('closes_at', new Date().toISOString())
      .order('closes_at', { ascending: true }).limit(1)
      .then(({ data, error }) => { if (alive && !error) setActiveGiveaway(data?.[0]?.slug || null) })
      .catch(() => { /* the shop works without it */ })
    check()
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => { alive = false; window.removeEventListener('focus', onFocus) }
  }, [])

  // Remember which platform this visit came from, once, on arrival. It is
  // read from ?src= on the link rather than from the referrer, because
  // WhatsApp — where most of this will be shared — sends no referrer and
  // would otherwise be indistinguishable from someone typing the address in.
  // Kept for 30 days, so a status seen on Monday still gets Thursday's order.
  // Analytics loads only if a measurement ID has been saved in Settings, and
  // page views are sent by hand because the URL changes without a page load.
  useEffect(() => {
    if (startAnalytics(siteSettings)) trackPage(pathname)
  }, [siteSettings, pathname])

  const seenChannel = useRef(false)
  useEffect(() => {
    if (seenChannel.current) return
    const found = detectChannel(window.location.search, document.referrer)
    if (found) { rememberChannel(found); seenChannel.current = true }
  }, [sp])
  const showBar = count > 0 && !['/cart', '/checkout'].includes(pathname)
  const home = role === 'reseller' ? '/sell' : role === 'vendor' ? '/vendor' : ['founder', 'ops', 'finance', 'delivery'].includes(role) ? '/admin' : '/account'
  const go = (e) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (cat) params.set('cat', cat)
    nav(`/search?${params}`)
  }

  return (
    <div className="shop" style={showBar ? { paddingBottom: 88 } : undefined}>
      <a className="skip-link" href="#market-main">Skip to products</a>
      <div className="shop-utility"><div className="shop-utility-inner"><span><Icon.pin /> Discover products from businesses in Zambia</span><span><Link to="/how-it-works">How ordering works <Icon.arrow /></Link><Link to="/protection">Customer support</Link></span></div></div>
      <header className="shop-header">
        <div className="shop-bar">
          <Link to="/" className="wordmark" aria-label="ZaMarket home"><BrandMark size={32} /><span className="wordmark-text"><b>ZaMarket</b><i>zamarket.shop</i></span></Link>
          <div className="deliver-to hide-mobile">
            <span className="dt-small">Delivering in</span>
            <span className="dt-big">Lusaka &amp; beyond</span>
          </div>
          <form className="shop-search" onSubmit={go} role="search">
            <select aria-label="Department" value={cat} onChange={(e) => setCat(e.target.value)} className="hide-mobile">
              <option value="">All</option>
              {stocked.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
            <input aria-label="Search ZaMarket" placeholder="Search products, cakes, services…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" aria-label="Search">
              <Icon.search />
            </button>
          </form>
          <Link to={user ? home : '/login'} className="header-link">
            <span className="dt-small">{user ? `Hello, ${(profile?.full_name || 'there').split(' ')[0]}` : 'Hello, sign in'}</span>
            <span className="dt-big header-account-label"><Icon.user /> {user && home !== '/account' ? 'Dashboard' : 'Account'}</span>
          </Link>
          <Link to="/cart" className="header-cart" aria-label={`Cart, ${count} items`}>
            <Icon.cart />
            <span className="cart-count">{count}</span>
            <span className="dt-big hide-mobile">Cart</span>
          </Link>
        </div>
        <nav className="dept-strip" aria-label="Shopping departments">
          <Link to="/search?deals=1">Today's deals</Link>
          <Link to="/motors">Motors</Link>
          <Link to="/blog" className={`journal-nav${pathname.startsWith('/blog') ? ' active' : ''}`}>Journal</Link>
          <Link to="/sellers">Stores</Link>
          {activeGiveaway && <Link className="shop-giveaway-live" to={`/giveaways/${encodeURIComponent(activeGiveaway)}`}><Icon.gift /> Live giveaway</Link>}
        </nav>
      </header>

      {/* The category rail is shop-window furniture. On a product page it
          pushed the price and the buy button off the first screen of a phone,
          so someone who tapped a product saw a photo and had to hunt for how
          to buy it. */}
      {pathname === '/' && <CategoryRail />}
      <main className={pathname === '/affiliates' ? 'shop-main affiliate-shop-main' : 'shop-main'} id="market-main">
        {/* Only the page swaps; the header, search and nav stay put. */}
        {/* The boundary matters most here: without it a single failed page
            takes the whole marketplace down to a black screen. */}
        <ErrorBoundary home="/">
          <Suspense fallback={<Loading shape="page" />}><Outlet /></Suspense>
        </ErrorBoundary>
      </main>
      <BottomBar />

      <ShopFooter user={user} home={home} giveaway={activeGiveaway} />

      {showBar && (
        <div className="cart-bar">
          <span>{count} item{count > 1 ? 's' : ''} · {money(subtotal)}</span>
          <Link to="/cart">View cart</Link>
        </div>
      )}
    </div>
  )
}

// /r/:code — reseller link. Remember the code, go to the store.
export function ReferralCapture() {
  const { code, product } = useParams()
  const { setRef } = useCart()
  const nav = useNavigate()
  useEffect(() => {
    if (!code) return
    setRef(code.toLowerCase())
    supabase.rpc('track_hit', { p_kind: 'affiliate_click', p_code: code.toLowerCase(), p_product: null })
    nav(product ? `/p/${product}` : '/', { replace: true })
  }, [code, product, nav])
  return null
}

// /go/:code — campaign link. Count the visit, remember the campaign, go to its page.
export function GoLink() {
  const { code } = useParams()
  const { setCampaign } = useCart()
  const nav = useNavigate()
  useEffect(() => {
    supabase.rpc('go_link', { p_code: code }).then(({ data }) => {
      const path = data?.path || '/'
      if (data?.found) setCampaign(data.code, path.split('/')[1] || null)
      nav(path, { replace: true })
    })
  }, [code])
  return <Loading />
}

// Credit a store only when the customer ARRIVED on its link (not when browsing in from the marketplace).
const isEntryPage = () => (window.history.state?.idx ?? 0) === 0

// ---------- product card ----------
function Row({ title, sub, link, weighted, children }) {
  return (
    <section className="shelf">
      <div className="shelf-head"><h2>{title}{sub && <span className="sub">{sub}</span>}</h2>{link && <Link to={link}>See all</Link>}</div>
      <div className={`shelf-scroll ${weighted ? 'weighted' : ''}`}>{children}</div>
    </section>
  )
}

// ---------- home ----------
export function Storefront() {
  const stocked = useStockedDepartments(useDepartments())
  useSeo({ title: 'ZaMarket — buy online in Lusaka, Zambia', description: 'Shop phones, home goods, fashion, cakes made to order and local services in Lusaka. Order online and we call you to confirm the price and delivery.' })
  const DEPARTMENTS = useDepartments()
  const { data, error, retry } = useCatalogue()
  const { ref } = useCart()
  const counts = useMemo(() => {
    const m = {}
    for (const p of data?.products || []) m[p.category] = (m[p.category] || 0) + 1
    return m
  }, [data])
  if (!data) return <CatalogueUnavailable error={error} retry={retry} />
  const { products, offersBy, vendors } = data
  // The shop, arranged by department. Inside each one the sellers still take
  // turns, so a department is fair between shops without a cake landing
  // between a toilet cleaner and a bench saw. See src/lib/frontPage.js.
  //
  // A marketplace with only one or two stocked departments has nothing to
  // group, so it falls back to the single mixed row it had before.
  // The hand-picked window comes first and is left exactly as chosen. It is
  // held out of everything below so nothing appears twice.
  const picked = pickedForFront(products)
  const pickedIds = new Set(picked.map((p) => p.id))
  // When you have picked products for the front page, they lead and
  // everything else waits below, grouped by department in short shelves, so
  // no single shop (a bakery, say) fills the first screens unasked.
  const hasPicks = picked.length > 0
  const shelves = departmentShelves(products, { excludeIds: pickedIds, perShelf: hasPicks ? 6 : 12 })
  const useShelves = shelves.length >= 2 || (hasPicks && shelves.length >= 1)
  const frontRow = useShelves ? [] : frontPageOrder(products.filter((p) => !pickedIds.has(p.id))).slice(0, 8)
  const shownIds = [...pickedIds, ...(useShelves ? shelves.flatMap((s) => s.items.map((p) => p.id)) : frontRow.map((p) => p.id))]
  const fresh = justAdded(products, 8).filter((p) => !pickedIds.has(p.id) && !frontRow.some((f) => f.id === p.id))
  const deals = products.filter((p) => dealFor(offersBy, p.id) || (p.normal_price && Number(p.normal_price) > Number(p.price)))
  const scheduled = products.filter((p) => p.fulfilment !== 'in_stock')
  const rated = products.filter((p) => p.rating).sort((a, b) => b.rating - a.rating || b.review_count - a.review_count)

  const services = products.filter((p) => p.fulfilment === 'service' && !['course', 'class'].includes(p.offering_type))
  const courses = products.filter((p) => ['course', 'class'].includes(p.offering_type))
  const vehicles = products.filter((p) => p.offering_type === 'vehicle')
  const events = products.filter((p) => p.offering_type === 'event')
  const goods = products.filter((p) => !['course', 'class', 'vehicle', 'event'].includes(p.offering_type) && p.fulfilment !== 'service')
  const card = (p) => <OfferingCard key={p.id} p={p} deal={dealFor(offersBy, p.id)} />

  return (
    <div className="home">
      <section className="home-market-head" aria-label="Shop ZaMarket">
        <div>
          <h1>Shop ZaMarket</h1>
          <p>Explore products from local sellers.</p>
        </div>
        <Link to="/search" className="home-see-all">All products <Icon.arrow /></Link>
      </section>
      {ref && <p className="tiny hero-ref">You arrived through an affiliate link. Your purchase can credit the affiliate.</p>}
      {products.length === 0 ? <><OpeningSoon /><JournalHighlights /></> : (
        <>
          {picked.length > 0 && (
            <section className="home-product-first" aria-label="Picked for the front page">
              <div className="shelf-head">
                <h2>Worth a look</h2>
                <Link to="/search">All products <Icon.arrow /></Link>
              </div>
              <div className="home-product-grid">{picked.map(card)}</div>
            </section>
          )}
          {useShelves ? shelves.map((s, index) => (
            <Fragment key={s.name}>
              <section className="home-dept" aria-label={s.name}>
                <div className="shelf-head">
                  <h2>{s.name}</h2>
                  <Link to={s.mixed ? '/search' : `/search?cat=${encodeURIComponent(s.name)}`}>
                    {s.total > s.items.length ? `All ${s.total}` : 'See all'} <Icon.arrow />
                  </Link>
                </div>
                <div className="home-product-grid">{s.items.map(card)}</div>
              </section>
            </Fragment>
          )) : (
            <>
              <section className="home-product-first" aria-label="Products from local sellers">
                <div className="home-product-grid">
                  {frontRow.map(card)}
                </div>
              </section>
              <JournalHighlights />
            </>
          )}
          {fresh.length >= 4 && (
            <Row title="Just added" link="/search?sort=new">
              {fresh.map(card)}
            </Row>
          )}
          {deals.length >= 2 && (
            <Row title="Deals worth a look" link="/search?deals=1">
              {deals.slice(0, 8).map(card)}
            </Row>
          )}
          {/* Promotions are still supported, but never displace real products
              from the first screen of the marketplace. */}
          <div className="home-featured-lower"><FounderHero /></div>
          <Merchandised products={products} vendors={vendors} offersBy={offersBy}
            excludeIds={shownIds} />
          {/* The journal sits under the products, not between the first two
              shelves. Someone arriving at a shop is here to look at what is
              for sale; the reading is there for them once they have. */}
          <JournalHighlights />
        </>
      )}
      {/* "Grow with ZaMarket" used to sit here as well as in the footer. A
          shopper does not need to be recruited twice on one page, so the
          recruitment lives in the footer only. */}

      {/* The reassurance about phone confirmation belongs at the bottom, after
          someone has seen the products — not above them, where it was taking a
          third of the first screen. One line, and the full version is its own
          page for anyone who wants it. */}
      {products.length > 0 && (
        <Link to="/how-it-works" className="trust-line">
          <span className="tl-icon" aria-hidden><Icon.shield /></span>
          <span>
            <strong>Confirmed by phone before you pay, delivered by us</strong>
            <em>If something goes wrong you come to ZaMarket, not to the seller — here&rsquo;s how that works</em>
          </span>
          <Icon.arrow />
        </Link>
      )}
    </div>
  )
}

// What a shopper sees before the first seller is live. It is a shop that hasn't
// opened, not a recruitment page: say when, say what's coming, and give them one
// thing to do — leave a number so we can tell them. The "sell with us" pitch is
// in the footer, where it belongs.
function OpeningSoon() {
  // Both hooks must run on every render. Calling useDepartments() a second
  // time inside the `stocked.length ? …` expression made the second call
  // conditional, and React threw error #310 the moment a department went out
  // of stock — which is a blank page, not a missing section.
  const departments = useDepartments()
  const stocked = useStockedDepartments(departments)
  const coming = (stocked.length ? stocked : departments).slice(0, 6)
  return (
    <section className="opening">
      <div className="opening-head">
        <span className="opening-eyebrow">Lusaka</span>
        <h2>The shop opens as soon as the first sellers are live.</h2>
        <p>
          We're signing up bakers, tailors, phone shops and service providers around Lusaka right now.
          The moment there's something to buy, it appears here.
        </p>
        <div className="btn-row">
          <Link to="/how-it-works" className="btn primary"><Icon.info /> How ZaMarket will work</Link>
          <Link to="/sellers" className="btn"><Icon.house /> See who's joined</Link>
        </div>
      </div>
      {coming.length > 0 && (
        <ul className="opening-depts" aria-label="What is coming">
          {coming.map((d) => (
            <li key={d.name}><span aria-hidden>{d.icon}</span>{d.name}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function useSeoStore(store) {
  useSeo(store ? {
    title: `${store.business_name} — ${store.category || 'Seller'} in ${store.town || 'Lusaka'} | ZaMarket`,
    description: (store.description || `Shop ${store.business_name} on ZaMarket. Order online and we call you to confirm.`).slice(0, 160),
  } : {})
}

// Cars and similar are listings, not shelf items: big photo, key facts, asking price.
function ListingCard({ p, store }) {
  const specs = (p.page?.specs || []).slice(0, 4)
  return (
    <Link to={store ? `/${store}/${p.slug}` : `/p/${p.slug}`} className="listing">
      <span className="listing-photo">{p.images?.[0] ? <img src={p.images[0]} alt="" loading="lazy" /> : <span className="ph" aria-hidden />}</span>
      <span className="listing-body">
        <span className="listing-name">{p.name}</span>
        {specs.length > 0 && <span className="listing-specs">{specs.map((sp) => <span key={sp.label}><b>{sp.label}</b> {sp.value}</span>)}</span>}
        <span className="listing-foot">
          <span className="listing-price">{money(p.price)}{p.sales_model === 'negotiate' && <span className="tiny muted"> asking</span>}</span>
          <span className="btn sm primary">{p.sales_model === 'negotiate' || p.sales_model === 'enquire' ? 'Enquire' : 'View'}</span>
        </span>
      </span>
    </Link>
  )
}

// A seller card is a shop window, so it shows what is actually on the shelf
// rather than a cover photo and a rating they may not have yet. Three real
// product photos tell a shopper more than any badge.
//
// The verified tick only appears while seller verification is a real process
// (verification_on in settings); otherwise the card makes no claim about them.
function SellerCard({ v, shelf = [] }) {
  const { settings } = useAuth()
  const verifying = settings?.verification_on === 'on'
  const pics = shelf.filter((p) => p.images?.[0]).slice(0, 3)
  const count = v.product_count ?? shelf.length

  return (
    <Link to={`/${v.slug}`} className="seller">
      {v.cover_url && <span className="seller-cover-mini" style={{ backgroundImage: `url(${v.cover_url})` }} aria-hidden="true" />}
      <span className="seller-top">
        {v.logo_url
          ? <img className="seller-mark" src={v.logo_url} alt="" loading="lazy" />
          : <span className="seller-mark" aria-hidden>{v.business_name.slice(0, 1)}</span>}
        <span className="seller-info">
          <span className="seller-name">
            {v.business_name}
            {verifying && v.trust_level === 'verified' && (
              <span className="seller-check" title="Checked by ZaMarket"><Icon.shield /></span>
            )}
          </span>
          <span className="seller-meta">{[v.category, v.town].filter(Boolean).join(' · ') || 'On ZaMarket'}</span>
        </span>
      </span>

      {pics.length > 0 ? (
        <span className="seller-shelf" aria-hidden>
          {pics.map((p) => <span key={p.id} className="ss-pic"><img src={p.images[0]} alt="" loading="lazy" /></span>)}
          {count > pics.length && <span className="ss-more">+{count - pics.length}</span>}
        </span>
      ) : v.tagline ? (
        <span className="seller-tag">{v.tagline}</span>
      ) : null}

      <span className="seller-foot">
        {v.rating
          ? <span className="seller-meta"><Stars n={v.rating} /> {v.rating} ({v.review_count})</span>
          : <span className="seller-meta">{count > 0 ? `${count} item${count === 1 ? '' : 's'} on sale` : 'Setting up their shop'}</span>}
        <span className="seller-count">Visit shop <Icon.arrow /></span>
      </span>
    </Link>
  )
}

export function SellersPage() {
  useSeo({ title: 'Sellers on ZaMarket — local businesses in Lusaka', description: 'Browse the shops, bakers, tailors and services selling on ZaMarket in Lusaka, Zambia.' })
  const { data, error, retry } = useCatalogue()
  const shelves = useMemo(() => byVendor(data?.products || []), [data])
  if (!data) return <CatalogueUnavailable error={error} retry={retry} />
  return (
    <div className="stack">
      <div className="crumbs"><Link to="/">Home</Link><span>Sellers</span></div>
      <h1>Sellers on ZaMarket</h1>
      {data.vendors.length === 0 ? (
        <div className="empty-shop">
          <h2>No shops are live yet</h2>
          <p>We're signing up local businesses around Lusaka. As each one is ready, their shop appears on this page.</p>
          <Link to="/how-it-works" className="btn">How ZaMarket works</Link>
        </div>
      ) : (
        <div className="seller-grid">
          {data.vendors.map((v) => <SellerCard key={v.id} v={v} shelf={shelves[v.id] || []} />)}
        </div>
      )}
    </div>
  )
}

// ---------- search & departments ----------
const SORTS = [['featured', 'Featured'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['new', 'Newest'], ['rating', 'Top rated']]

export function SearchPage() {
  const DEPARTMENTS = useDepartments()
  const stocked = useStockedDepartments(DEPARTMENTS)
  const [spSeo] = useSearchParams()
  useSeo(spSeo.get('cat')
    ? { title: `${spSeo.get('cat')} in Lusaka | ZaMarket`, description: `Buy ${spSeo.get('cat').toLowerCase()} online in Lusaka. Delivery in Lusaka District, other areas arranged.` }
    : { title: 'All products | ZaMarket Lusaka', noIndex: !!spSeo.get('q') })
  const { data, error, retry } = useCatalogue()
  const [sp, setSp] = useSearchParams()
  const [sheet, setSheet] = useState(false)
  const q = (sp.get('q') || '').trim().toLowerCase()
  const cat = sp.get('cat') || ''
  const type = sp.get('type') || ''
  const sort = sp.get('sort') || 'featured'
  const deals = sp.get('deals') === '1'
  const minR = sp.get('rating') === '4'
  const pmin = sp.get('min') || ''
  const pmax = sp.get('max') || ''
  const setParam = (k, v) => { const n = new URLSearchParams(sp); if (v === '' || v == null || v === false) n.delete(k); else n.set(k, v); setSp(n, { replace: true }) }

  const results = useMemo(() => {
    if (!data) return []
    let list = data.products.filter((p) => {
      if (q && productRelevance(p, q) < 0) return false
      if (cat && p.category !== cat) return false
      if (type === 'in_stock' && p.fulfilment !== 'in_stock') return false
      if (type === 'made_to_order' && p.fulfilment !== 'made_to_order') return false
      if (type === 'service' && p.fulfilment !== 'service') return false
      if (type === 'vehicle' && p.offering_type !== 'vehicle') return false
      if (type === 'scheduled' && p.fulfilment === 'in_stock') return false
      if (deals && !(dealFor(data.offersBy, p.id) || (p.normal_price && Number(p.normal_price) > Number(p.price)))) return false
      if (minR && !(p.rating >= 4)) return false
      if (pmin && Number(p.price) < Number(pmin)) return false
      if (pmax && Number(p.price) > Number(pmax)) return false
      return true
    })
    const by = {
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
      new: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0),
      featured: (a, b) => Number(isOut(a)) - Number(isOut(b)) || (q ? productRelevance(b, q) - productRelevance(a, q) : 0) || Number(!!dealFor(data.offersBy, b.id)) - Number(!!dealFor(data.offersBy, a.id)),
    }[sort]
    return [...list].sort(by)
  }, [data, q, cat, type, sort, deals, minR, pmin, pmax])

  if (!data) return <CatalogueUnavailable error={error} retry={retry} />
  const heading = deals ? "Today's deals" : cat || (q ? `Results for “${sp.get('q')}”` : 'All products')
  const active = [cat, type, deals, minR, pmin, pmax].filter(Boolean).length

  const filters = (
    <div className="filters">
      <div className="f-group">
        <h4>Department</h4>
        <button type="button" className={!cat ? 'on' : ''} onClick={() => setParam('cat', '')}>All departments</button>
        {stocked.map((d) => <button type="button" key={d.name} className={cat === d.name ? 'on' : ''} onClick={() => setParam('cat', d.name)}>{d.name}</button>)}
      </div>
      <div className="f-group">
        <h4>How it's sold</h4>
        {[['', 'Everything'], ['in_stock', 'Ready to deliver'], ['made_to_order', 'Made to order'], ['service', 'Services and bookings']].map(([v, l]) => (
          <button type="button" key={v || 'all'} className={type === v ? 'on' : ''} onClick={() => setParam('type', v)}>{l}</button>
        ))}
      </div>
      <div className="f-group">
        <h4>Price</h4>
        <div className="f-price">
          <input inputMode="decimal" placeholder="Min K" value={pmin} onChange={(e) => setParam('min', e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Minimum price" />
          <input inputMode="decimal" placeholder="Max K" value={pmax} onChange={(e) => setParam('max', e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Maximum price" />
        </div>
      </div>
      <div className="f-group">
        <label className="f-check"><input type="checkbox" checked={deals} onChange={(e) => setParam('deals', e.target.checked ? '1' : '')} /> Deals and savings</label>
        <label className="f-check"><input type="checkbox" checked={minR} onChange={(e) => setParam('rating', e.target.checked ? '4' : '')} /> 4 stars and up</label>
      </div>
      {active > 0 && <button type="button" className="btn sm" onClick={() => setSp(q ? { q: sp.get('q') } : {}, { replace: true })}>Clear filters</button>}
    </div>
  )

  return (
    <div className="search-page">
      <aside className="search-side hide-mobile">{filters}</aside>
      <div className="search-results">
        <div className="crumbs"><Link to="/">Home</Link><span>{heading}</span></div>
        <div className="results-head">
          <div>
            <h1>{heading}</h1>
            <p className="muted small">{results.length} result{results.length === 1 ? '' : 's'}</p>
          </div>
          <div className="row">
            <button type="button" className="btn sm show-mobile" onClick={() => setSheet(true)}>Filters{active ? ` (${active})` : ''}</button>
            <select className="sort" value={sort} onChange={(e) => setParam('sort', e.target.value === 'featured' ? '' : e.target.value)} aria-label="Sort">
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        {results.length === 0 ? (
          <div className="empty-shop">
            <h2>Nothing matches yet</h2>
            <p>Try a different word or remove a filter.</p>
            <Link to="/search" className="btn">See all products</Link>
          </div>
        ) : (
          <div className="grid-products">{results.map((p) => <OfferingCard key={p.id} p={p} deal={dealFor(data.offersBy, p.id)} />)}</div>
        )}
      </div>
      {sheet && (
        <>
          <div className="sheet-backdrop" onClick={() => setSheet(false)} />
          <div className="sheet" role="dialog" aria-label="Filters">
            <div className="between mb"><h3>Filters</h3><button className="btn sm primary" onClick={() => setSheet(false)}>Show {results.length} result{results.length === 1 ? '' : 's'}</button></div>
            {filters}
          </div>
        </>
      )}
    </div>
  )
}

// ---------- product page ----------
function ProductSeo({ p }) {
  useSeo(productSeo(p))
  // Two records of the same visit, on purpose. track_hit is ours and always
  // works; the Analytics event is for behaviour reporting and only fires when
  // a measurement ID has been configured.
  useEffect(() => {
    if (!p?.id) return
    supabase.rpc('track_hit', { p_kind: 'product_view', p_vendor: p.vendor_id || null, p_product: p.id })
    trackViewItem(p)
  }, [p?.id])
  return null
}

// An approved affiliate browsing the shop gets their link and the promotion kit
// right here, on whatever they are looking at.
function AffiliateBar({ p }) {
  const { role, profile, settings } = useAuth()
  const [open, setOpen] = useState(false)
  const toast = useToast()
  const code = profile?.partner?.code
  if (role !== 'reseller' || !code || !p?.slug) return null
  const link = productShareUrl(window.location.origin, p, role, code)
  const earn = commissionLabel(p, settings)
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('Your link is copied') } catch { toast('Could not copy', true) } }
  return (
    <div className="aff-bar">
      <div>
        <strong>Your link for this one</strong>
        <span className="tiny">{link.replace(/^https?:\/\//, '')}</span>
      </div>
      <div className="btn-row">
        <span className="aff-earn">You earn {money(earn.perUnit)}</span>
        <button className="btn sm" onClick={copy}>Copy link</button>
        <button className="btn sm primary" onClick={() => setOpen(true)}>Create promotion</button>
      </div>
      {open && <PromoKit product={p} offer={null} code={code} settings={settings} onClose={() => setOpen(false)} />}
    </div>
  )
}

export function ProductPage() {
  const DEPARTMENTS = useDepartments()
  const shop = useShopInfo()
  const { role: sharingRole, profile: sharingProfile } = useAuth()
  const { id: idParam, store: storeParam, product: productParam } = useParams()
  const id = productParam || idParam
  const { setStoreRef } = useCart()
  const nav = useNavigate()
  const { add } = useCart()
  const toast = useToast()
  const { data: catalogue } = useCatalogue()
  const [p, setP] = useState(null)
  const [offers, setOffers] = useState([])
  const [reviews, setReviews] = useState([])
  const [img, setImg] = useState(0)
  const [viewer, setViewer] = useState(false)
  const [qty, setQty] = useState(1)
  const [notify, setNotify] = useState(false)
  const [choices, setChoices] = useState({})
  const [note, setNote] = useState('')

  // Product navigation always begins at the product photograph, not the Q&A
  // position carried over from the previous page on mobile browsers.
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [id, storeParam])

  useEffect(() => {
    setP(null); setImg(0); setQty(1); setChoices({}); setNote('')
    const isUuid = /^[0-9a-f-]{36}$/i.test(id)
    let query = supabase.from('public_products').select('*')
    query = isUuid ? query.eq('id', id) : query.eq('slug', id)
    if (storeParam) query = query.eq('vendor_slug', storeParam)
    query.maybeSingle().then(({ data }) => {
      setP(data || false)
      if (!data) return
      if (storeParam && isEntryPage()) setStoreRef(storeParam)
      supabase.from('public_offers').select('*').eq('product_id', data.id).then(({ data: o }) => setOffers((o || []).filter((x) => DEAL_TYPES.includes(x.type) || CONDITION_TYPES.includes(x.type))))
      supabase.from('reviews').select('id,product_rating,comment,customer_name,verified,created_at').eq('product_id', data.id).eq('approved', true).order('created_at', { ascending: false }).limit(10).then(({ data: r }) => setReviews(r || []))
    })
  }, [id, storeParam])

  if (p === null) return <Loading />
  if (!p) return <div className="empty-shop"><h2>This product isn't available</h2><p>It may have been removed or sold out.</p><Link to="/search" className="btn">Browse products</Link></div>
  if ((p.offering_type && p.offering_type !== 'product') || Number(p.package_count) > 0 || (p.sales_model && p.sales_model !== 'buy')) return <OfferingPage p={p} reviews={reviews} />

  const seo = productSeo(p)
  const scheduled = p.fulfilment !== 'in_stock'
  const out = isOut(p)
  const opts = Array.isArray(p.options) ? p.options.filter((o) => o?.name && o?.choices?.length) : []
  const missing = opts.find((o) => !choices[o.name])
  const guard = (fn) => () => { if (missing) return toast(`Choose ${missing.name.toLowerCase()}`, true); fn() }
  const condition = offers.find((o) => o.type === 'payment_plan') || null
  const deals = offers.filter((o) => DEAL_TYPES.includes(o.type))
  const conditions = offers.filter((o) => CONDITION_TYPES.includes(o.type))
  const save = p.normal_price && Number(p.normal_price) > Number(p.price) ? Number(p.normal_price) - Number(p.price) : 0
  const cta = p.fulfilment === 'service' ? 'Book now' : p.fulfilment === 'made_to_order' ? 'Order now' : 'Buy now'
  const addToCart = guard(() => { add(p, qty, condition, { choices, note }); trackAddToCart(p, qty); toast('Added to cart') })
  const buyNow = guard(() => { add(p, qty, condition, { choices, note }); nav('/cart') })
  const more = (catalogue?.products || []).filter((x) => x.id !== p.id && (p.vendor_id ? x.vendor_id === p.vendor_id : x.category === p.category)).slice(0, 10)
  const availability = out ? 'Out of stock' : scheduled ? howText(p) : p.owner_type === 'founder' && p.stock_available <= 5 ? `Only ${p.stock_available} left in stock` : 'In stock'
  const deliveryLine = shop.deliveryIncluded ? 'Free delivery in Lusaka District. Other areas confirmed by phone.' : `Delivery in Lusaka District from ${money(shop.localFee)}. Other areas confirmed by phone.`

  const buyBox = (
    <div className="buybox">
      <Price value={p.price} size="lg" />
      {save > 0 && <div className="bb-save">Was <s>{money(p.normal_price)}</s>. You save {money(save)}</div>}
      <div className={`bb-avail ${out ? 'out' : ''}`}>{availability}</div>
      {!scheduled && !out && <div className={`bb-line ${shop.deliveryIncluded ? 'ok strong' : ''}`}>{deliveryLine}</div>}
      <div className="bb-line">{payLine(p, shop.settings || {})}</div>
      {p.fulfilment === 'service' && <div className="bb-line">Pick your date{p.time_slots?.length ? ' and time' : ''} at checkout.</div>}
      {p.fulfilment === 'made_to_order' && <div className="bb-line">Choose the date you need it at checkout.</div>}
      {out ? (
        <button className="btn primary block" onClick={() => setNotify(true)}>Tell me when it's back</button>
      ) : (
        <>
          {p.fulfilment !== 'service' && (
            <div className="qty">
              <span>Quantity</span>
              <div className="qty-ctl">
                <button type="button" aria-label="Fewer" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                <span>{qty}</span>
                <button type="button" aria-label="More" onClick={() => setQty(Math.min(p.owner_type === 'founder' && !scheduled ? Math.max(1, p.stock_available) : 99, qty + 1))}>+</button>
              </div>
            </div>
          )}
          <button className="btn primary block" onClick={addToCart}>Add to cart</button>
          <button className="btn buy block" onClick={buyNow}>{cta}</button>
        </>
      )}
      {/* The seller's own branding travels with the poster: their name, their
          mark and where they are, all of which are already public on their
          shop page. */}
      <ShareProduct
        product={p}
        store={p.vendor_name ? {
          business_name: p.vendor_name,
          logo_url: p.vendor_logo,
          location: p.vendor_location,
          category: p.vendor_category,
        } : null}
        settings={shop.settings || {}}
        link={productShareUrl(window.location.origin, p, sharingRole, sharingProfile?.partner?.code)}
        className="btn block" label={sharingRole === 'reseller' ? 'Share with your affiliate link' : 'Share this'} />
      {p.vendor_slug && <TrustPanel slug={p.vendor_slug} compact />}
      <div className="bb-meta">
        <div><span>Payment</span><span>After we confirm by phone</span></div>
        <div><span>Sold by</span><span>{p.vendor_name ? <Link to={`/${p.vendor_slug}`}>{p.vendor_name}</Link> : 'ZaMarket'}</span></div>
      </div>
    </div>
  )

  return (
    <div className="pdp">
      <ProductSeo p={p} />
      <AffiliateBar p={p} />
      <div className="crumbs">
        <Link to="/">Home</Link>
        {storeParam && p.vendor_name ? <Link to={`/${storeParam}`}>{p.vendor_name}</Link> : p.category && <Link to={`/search?cat=${encodeURIComponent(p.category)}`}>{p.category}</Link>}
        <span>{p.name}</span>
      </div>

      <div className="pdp-grid">
        <div className="pdp-gallery">
          {p.images?.length > 1 && (
            <div className="thumbs">
              {p.images.map((src, i) => <button key={i} type="button" className={i === img ? 'on' : ''} onClick={() => setImg(i)} aria-label={`Photo ${i + 1}`}><img src={src} alt="" /></button>)}
            </div>
          )}
          <div className="main-img">{p.images?.[img]
            ? <button type="button" className="main-img-open" onClick={() => setViewer(true)} aria-label="Open photo full screen"><img src={p.images[img]} alt={p.name} /><span className="main-img-hint" aria-hidden>Tap to zoom</span></button>
            : <span className="pc-ph big" aria-hidden>{iconFor(p.category, DEPARTMENTS)}</span>}</div>
          {viewer && <PhotoViewer images={p.images || []} start={img} alt={p.name} onClose={() => setViewer(false)} />}
        </div>

        <div className="pdp-info">
          <h1>{p.name}</h1>
          {p.vendor_name && <Link to={`/${p.vendor_slug}`} className="pdp-store">Visit {p.vendor_name}</Link>}
          {p.rating ? <div className="pdp-rating"><Stars n={p.rating} /><a href="#reviews">{p.review_count} rating{p.review_count === 1 ? '' : 's'}</a></div> : null}
          <hr />
          <div className="pdp-price-inline"><Price value={p.price} size="lg" />{save > 0 && <span className="bb-save">Save {money(save)}</span>}</div>

          {!out && deals.map((o) => <OfferCard key={o.id} offer={o} product={p} onTake={guard(() => { add(p, 1, o, { choices, note }); nav('/cart') })} />)}
          {conditions.map((o) => <div key={o.id} className="offer-note small"><strong>{offerCopy(o, p.name).get}</strong>{o.terms ? <span className="muted">. {o.terms}</span> : ''}</div>)}

          {!out && (opts.length > 0 || p.note_label) && (
            <div className="pdp-options">
              {opts.map((o) => (
                <div key={o.name} className="field">
                  <label>{o.name}{choices[o.name] ? <span className="muted">: {choices[o.name]}</span> : ''}</label>
                  <div className="chips wrap">{o.choices.map((c) => <button key={c} type="button" className={`chip ${choices[o.name] === c ? 'on' : ''}`} onClick={() => setChoices({ ...choices, [o.name]: c })}>{c}</button>)}</div>
                </div>
              ))}
              {p.note_label && (
                <div className="field">
                  <label>{p.note_label} <span className="muted">(optional)</span></label>
                  <input className="input" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {p.benefits?.length > 0 && (
            <div className="pdp-section">
              <h3>About this item</h3>
              <ul className="pdp-bullets">{p.benefits.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          )}
          <div className="pdp-buy-mobile">{buyBox}</div>
        </div>

        <aside className="pdp-side">{buyBox}</aside>
      </div>

      {p.description && <section className="pdp-section wide"><h2>Description</h2><p className="pdp-desc">{p.description}</p></section>}
      {p.faqs?.length > 0 && (
        <section className="pdp-section wide">
          <h2>Questions and answers</h2>
          {p.faqs.map((f, i) => <div key={i} className="faq"><strong>{f.q}</strong><p>{f.a}</p></div>)}
        </section>
      )}
      <section className="pdp-section wide" id="reviews">
        <h2>Customer reviews</h2>
        {reviews.length === 0 ? <p className="muted">No reviews yet. Bought this? <Link to="/review">Rate your order</Link>.</p> : reviews.map((r) => (
          <div key={r.id} className="review">
            <div className="row"><Stars n={r.product_rating} /><strong>{(r.customer_name || 'Customer').split(' ')[0]}</strong>{r.verified && <span className="badge ok">Verified purchase</span>}</div>
            {r.comment && <p>{r.comment}</p>}
          </div>
        ))}
      </section>
      {more.length > 0 && <Row title={p.vendor_id ? `More from ${p.vendor_name}` : 'You may also like'}>{more.map((x) => <OfferingCard key={x.id} p={x} inStore={!!storeParam} deal={dealFor(catalogue.offersBy, x.id)} />)}</Row>}
      {/* The affiliate pitch used to sit here too. A shopper reading a product
          page is not being recruited; the footer carries it. */}

      {!out && (
        <div className="mobile-buybar">
          <Price value={p.price} />
          <button className="btn primary" onClick={addToCart}>Add to cart</button>
          <button className="btn buy" onClick={buyNow}>{cta}</button>
        </div>
      )}
      {notify && <NotifyModal product={p} onClose={() => setNotify(false)} />}
    </div>
  )
}

function OfferCard({ offer: o, product, onTake }) {
  const copy = offerCopy(o, product.name)
  const ends = useCountdown(o.end_at)
  const save = Number(o.normal_value) - Number(o.deal_price)
  const perUnit = o.units > 1 ? Number(o.deal_price) / o.units : null
  return (
    <div className="offer-card">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="offer-name">{o.name}</div>
        {ends && <span className="offer-ends">{ends}</span>}
      </div>
      <div className="small">{copy.get}</div>
      {copy.bonus && <div className="offer-bonus">+ {copy.bonus}</div>}
      <div className="offer-price"><Price value={o.deal_price} />{save > 0 && <s className="muted small">{money(o.normal_value)}</s>}</div>
      <div className="row small">
        {save > 0 && <span className="save">You save {money(save)}</span>}
        {perUnit && <span className="muted">{money(perUnit)} each</span>}
      </div>
      {o.remaining != null && <div className="tiny warn strong">Only {o.remaining} left at this price</div>}
      {o.terms && <div className="tiny muted">{o.terms}</div>}
      <button className="btn buy block" onClick={onTake}>Take this offer</button>
    </div>
  )
}

function NotifyModal({ product, onClose }) {
  const toast = useToast()
  const [f, setF] = useState({ customer_name: '', phone: '', quantity: 1, location: '' })
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('stock_requests').insert({ ...f, product_id: product.id, quantity: Number(f.quantity) || 1 })
    if (error) return toast(error.message, true)
    toast("We'll let you know when it's back")
    onClose()
  }
  return (
    <Modal title="Tell me when it's back" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Field label="Your name"><Input value={f.customer_name} onChange={(v) => setF({ ...f, customer_name: v })} required /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(v) => setF({ ...f, phone: v })} type="tel" required /></Field>
        <div className="grid-2">
          <Field label="How many"><Input value={f.quantity} onChange={(v) => setF({ ...f, quantity: v })} type="number" min="1" /></Field>
          <Field label="Area"><Input value={f.location} onChange={(v) => setF({ ...f, location: v })} /></Field>
        </div>
        <button className="btn primary block">Send request</button>
      </form>
    </Modal>
  )
}

// ---------- seller store ----------
export function StorePage() {
  const { store: slug, id: legacyId } = useParams()
  const { setStoreRef } = useCart()
  const { settings } = useAuth()
  const nav = useNavigate()
  const [store, setStore] = useState(null)
  const [products, setProducts] = useState(null)
  const [offersBy, setOffersBy] = useState({})
  // The seller's own sections, in the order they arranged them.
  const [sections, setSections] = useState([])
  useEffect(() => {
    const q1 = supabase.from('public_vendors').select('*')
    ;(slug ? q1.eq('slug', slug) : q1.eq('id', legacyId)).maybeSingle().then(({ data }) => {
      setStore(data || false)
      if (!data) return setProducts([])
      if (legacyId) return nav(`/${data.slug}`, { replace: true })
      if (isEntryPage()) setStoreRef(data.slug)
      supabase.from('public_products').select('*').eq('vendor_id', data.id).order('category').order('name').then(({ data: rows }) => setProducts(rows || []))
      supabase.from('store_sections').select('id,name,sort').eq('vendor_id', data.id).order('sort')
        .then(({ data: rows }) => setSections(rows || []))
    })
    supabase.from('public_offers').select('id,product_id,type,name').then(({ data }) => {
      const m = {}; for (const x of data || []) (m[x.product_id] = m[x.product_id] || []).push(x); setOffersBy(m)
    })
  }, [slug, legacyId])
  useSeoStore(store)
  useEffect(() => { if (store?.id) supabase.rpc('track_hit', { p_kind: 'store_view', p_vendor: store.id }) }, [store?.id])
  if (store === null || products === null) return <Loading shape="cards" />
  if (!store) return <div className="empty-shop"><h2>We couldn't find that page</h2><p>Check the link, or browse the marketplace.</p><div className="hero-actions"><Link to="/" className="btn primary">Go to ZaMarket</Link><Link to="/sellers" className="btn">See all sellers</Link></div></div>
  // A shop is laid out by what it sells: cars like a dealership, courses like a college,
  // everything else by department.
  const SECTIONS = [
    ['vehicle', 'Vehicles for sale'],
    ['course', 'Courses and training'],
    ['class', 'Classes'],
    ['event', 'Events'],
    ['service', 'Services'],
  ]
  const byKind = products.reduce((m, p) => { const k = p.offering_type || 'product'; (m[k] = m[k] || []).push(p); return m }, {})
  const special = SECTIONS.filter(([k]) => byKind[k]?.length)
  const plain = [...(byKind.product || []), ...(byKind.other || [])]
  const sectionName = (p) => sections.find((x) => x.id === p.section_id)?.name
  const groups = plain.reduce((m, p) => {
    const k = sectionName(p) || p.category || (sections.length ? 'Other products' : 'Products')
    ;(m[k] = m[k] || []).push(p)
    return m
  }, {})
  // Keep the seller's chosen order, with anything unfiled last.
  const groupOrder = Object.keys(groups).sort((a, b) => {
    const ia = sections.findIndex((x) => x.name === a)
    const ib = sections.findIndex((x) => x.name === b)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })
  // what the vendor chose to put first; if they chose none, the best reviewed
  const picked = products.filter((p) => p.featured_in_store)
  const featured = picked.length
    ? picked.slice(0, 6)
    : [...products].sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.review_count || 0) - (a.review_count || 0)).slice(0, products.length > 6 ? 4 : 0)
  const verified = settings?.verification_on === 'on' && store.trust_level === 'verified'
  return (
    <VendorStorefront
      store={store}
      products={products}
      featured={featured}
      groups={groups}
      groupOrder={groupOrder}
      verified={verified}
      share={<ShareStore store={store} products={products} sections={sections} link={`${window.location.origin}/${store.slug}`} className="btn" label="Share this shop" />}
      renderProduct={(p) => <OfferingCard p={p} deal={dealFor(offersBy, p.id)} inStore={store.slug} />}
      special={special.map(([kind, title]) => (
        <section key={kind} className="zsv-section" id={anchorFor(title)} aria-label={title}>
          <div className="zsv-title"><h2>{title}</h2><span className="zsv-count">{byKind[kind].length}</span></div>
          <div className={kind === 'vehicle' ? 'grid-listings' : 'zsv-grid'}>
            {byKind[kind].map((p) => (kind === 'vehicle'
              ? <ListingCard key={p.id} p={p} store={store.slug} />
              : <OfferingCard key={p.id} p={p} deal={dealFor(offersBy, p.id)} inStore={store.slug} />))}
          </div>
        </section>
      ))}
    />
  )
}
