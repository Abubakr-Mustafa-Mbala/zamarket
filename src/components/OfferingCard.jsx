import { Link, useNavigate } from 'react-router-dom'
import { money } from '../lib/format'
import { Stars } from './ui'
import { useSaved } from '../lib/saved'
import { useCart } from '../lib/cart'
import Icon from '../lib/icons'

// The price, written the way a shop writes it: big kwacha, small ngwee.
function Price({ value, was }) {
  const [whole, part] = Number(value || 0).toFixed(2).split('.')
  return (
    <span className="oc-price">
      <span className="oc-k">K</span>
      <b>{Number(whole).toLocaleString('en-ZM')}</b>
      <sup>{part}</sup>
      {was ? <s>{money(was)}</s> : null}
    </span>
  )
}

function SaveButton({ id }) {
  const saved = useSaved()
  const on = saved.has(id)
  return (
    <button type="button" className={`oc-save ${on ? 'on' : ''}`} aria-label={on ? 'Remove from my list' : 'Save to my list'}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); saved.toggle(id) }}>
      <Icon.heart />
    </button>
  )
}

// A service is not a product and a car is not a cake. Each offering type gets the
// card it needs, inside one visual language.

const fallbackIcon = (p) => {
  const t = p.offering_type
  if (t === 'vehicle') return <Icon.car />
  if (t === 'course' || t === 'class') return <Icon.graduation />
  if (t === 'event') return <Icon.ticket />
  if (p.fulfilment === 'service') return <Icon.wrench />
  return <Icon.box />
}

const typeWord = (p) =>
  p.offering_type === 'vehicle' ? 'Vehicle'
    : p.offering_type === 'course' || p.offering_type === 'class' ? 'Course'
      : p.offering_type === 'event' ? 'Event'
        : p.fulfilment === 'service' ? 'Service'
          : p.fulfilment === 'made_to_order' ? 'Made to order'
            : null

function Media({ p, badge, badgeTone = 'deal' }) {
  return (
    <span className="oc-media">
      {p.images?.[0]
        ? <img src={p.images[0]} alt="" loading="lazy" />
        : <span className="oc-fallback" aria-hidden>{fallbackIcon(p)}<em>{typeWord(p) || p.category || 'ZaMarket'}</em></span>}
      {badge && <span className={`oc-badge ${badgeTone}`}>{badge}</span>}
      <SaveButton id={p.id} />
    </span>
  )
}

// A short line under the name — the seller's own words, never invented.
const blurb = (p) => {
  const d = String(p.description || '').split(/[.\n]/)[0].trim()
  if (d && d.length <= 60) return d
  const b = (p.benefits || [])[0]
  return b && b.length <= 60 ? b : null
}

function Chip({ icon, children, tone }) {
  return <span className={`oc-chip ${tone || ''}`}>{icon}{children}</span>
}

function Seller({ p }) {
  if (!p.vendor_name) return null
  return (
    <span className="oc-seller">
      {p.vendor_trust === 'verified' && <span className="oc-verified"><Icon.shield /> Verified</span>}
      <span>by {p.vendor_name}</span>
    </span>
  )
}

export default function OfferingCard({ p, deal, inStore }) {
  const nav = useNavigate()
  const { add } = useCart()
  const to = inStore && p.vendor_slug ? `/${p.vendor_slug}/${p.slug}` : `/p/${p.slug || p.id}`
  const save = p.normal_price && Number(p.normal_price) > Number(p.price) ? Number(p.normal_price) - Number(p.price) : 0
  const savePct = save > 0 ? Math.round((save / Number(p.normal_price)) * 100) : 0
  const badge = deal ? deal.name : save > 0 ? `Save ${savePct}%` : null
  const kind = p.offering_type
  const packages = Number(p.package_count) > 1 ? `${p.package_count} packages` : null
  const specs = (p.page?.specs || []).slice(0, 3).map((s) => s.value).filter(Boolean)
  const desc = blurb(p)
  const out = p.stock_available <= 0 && p.owner_type === 'founder' && p.fulfilment === 'in_stock'

  // vehicles: photo first, then the facts a buyer asks for
  if (kind === 'vehicle') {
    return (
      <Link to={to} className="oc oc-vehicle">
        <Media p={p} badge={badge} />
        <span className="oc-body">
          <span className="oc-name">{p.name}</span>
          {specs.length > 0 && <span className="oc-specs">{specs.join(' · ')}</span>}
          <span className="oc-row"><Price value={p.price} /><Chip icon={<Icon.pin />}>Lusaka</Chip></span>
          <span className="oc-action">Enquire <Icon.arrow /></span>
        </span>
      </Link>
    )
  }

  const service = p.fulfilment === 'service' && !['course', 'class'].includes(kind)
  const course = ['course', 'class'].includes(kind)
  const event = kind === 'event'

  const chip = course || (service && packages)
    ? <Chip icon={<Icon.box />}>{packages || 'Book a place'}</Chip>
    : service
      ? <Chip icon={<Icon.clock />}>{p.duration_text ? `Booking: ${p.duration_text.toLowerCase()}` : 'By appointment'}</Chip>
      : event
        ? <Chip icon={<Icon.calendar />}>{p.page?.schedule?.[0]?.hours || 'See dates'}</Chip>
        : p.fulfilment === 'made_to_order'
          ? <Chip icon={<Icon.clock />}>{p.lead_time_days ? `${p.lead_time_days} day${p.lead_time_days > 1 ? 's' : ''} ahead` : 'Made to order'}</Chip>
          : out
            ? <Chip tone="bad" icon={<Icon.info />}>Out of stock</Chip>
            : <Chip tone="ok" icon={<Icon.check />}>In stock</Chip>

  const buyable = !service && !course && !event && !out && p.sales_model !== 'enquire' && p.sales_model !== 'negotiate' && !Number(p.package_count)
  const actionWord = service ? 'Book now' : course ? 'View course' : event ? 'View event' : buyable ? 'Add to cart' : 'View details'

  return (
    <Link to={to} className="oc">
      <Media p={p} badge={badge} />
      <span className="oc-body">
        <span className="oc-name">{p.name}</span>
        {desc && <span className="oc-desc">{desc}</span>}
        {p.rating ? <span className="oc-rating"><Stars n={p.rating} /><em>{p.review_count}</em></span> : null}
        <span className="oc-row"><Price value={p.price} was={save > 0 ? p.normal_price : null} />{chip}</span>
        <Seller p={p} />
        <button type="button" className="oc-action-btn"
          onClick={(e) => {
            e.preventDefault()
            if (buyable) { add(p, 1); nav('/cart') } else nav(to)
          }}>
          {buyable && <Icon.cart />} {actionWord} {!buyable && <Icon.arrow />}
        </button>
      </span>
    </Link>
  )
}
