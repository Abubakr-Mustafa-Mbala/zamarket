// Hooks are written from approved facts only. If the fact is missing, the hook
// does not exist — nothing here invents a claim, a saving, a shortage or a review.

import { money } from './format'

const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ')
const lower = (s) => clean(s).charAt(0).toLowerCase() + clean(s).slice(1)

export const FAMILIES = {
  benefit: 'Benefit',
  offer: 'Offer',
  value: 'Value',
  trust: 'Trust',
  local: 'Local',
  discovery: 'Discovery',
  action: 'Straight to it',
  proof: 'Proof',
  urgency: 'Urgency',
  education: 'Learning',
}

// Everything the engine is allowed to say about this offering.
export function approvedFacts({ product, offer, reviews = [], settings }) {
  const price = Number(product?.price || 0)
  const normal = product?.normal_price && Number(product.normal_price) > price ? Number(product.normal_price) : null
  const benefits = (product?.benefits || []).map(clean).filter(Boolean)
  const kind = product?.offering_type || 'product'
  const model = product?.sales_model || (product?.fulfilment === 'service' ? 'book' : 'buy')
  const stock = product?.owner_type === 'founder' && product?.fulfilment === 'in_stock' ? Number(product.stock_available ?? 0) : null
  const best = reviews.find((r) => r.comment && (r.product_rating || 0) >= 4)
  const isNew = product?.created_at ? (Date.now() - new Date(product.created_at).getTime()) / 864e5 <= 21 : false
  return {
    name: clean(product?.name),
    price, normal,
    save: normal ? normal - price : null,
    benefits, kind, model, stock,
    offer: offer?.copy ? clean(offer.copy) : null,
    offerEnds: offer?.end || null,
    vendor: clean(product?.vendor_name) || null,
    review: best ? { text: clean(best.comment), stars: best.product_rating, by: clean(best.customer_name).split(' ')[0] } : null,
    rating: product?.rating || null,
    reviewCount: product?.review_count || 0,
    isNew,
    freeDelivery: settings?.delivery_included === true || settings?.delivery_included === 'true',
    category: clean(product?.category),
  }
}

// Each hook says where it came from, so nothing is unexplained.
export function buildHooks(facts) {
  const h = []
  const add = (family, text, from) => { if (text) h.push({ family, text: clean(text), from }) }

  if (facts.benefits[0]) add('benefit', facts.benefits[0], 'your first listed benefit')
  if (facts.benefits[1]) add('benefit', facts.benefits[1], 'your second listed benefit')

  if (facts.offer) add('offer', facts.offer, 'the live offer')
  if (facts.save) add('offer', `Save ${money(facts.save)}`, 'the normal price you set')
  if (facts.normal) add('value', `Was ${money(facts.normal)}, now ${money(facts.price)}`, 'the normal price you set')

  if (facts.kind === 'vehicle') {
    add('action', 'Looking for your next vehicle?', 'the offering type')
    add('trust', 'Enquire through ZaMarket', 'how this one is sold')
  } else if (facts.kind === 'course' || facts.kind === 'class') {
    add('education', `Learn ${lower(facts.name)}`, 'the offering name')
    add('action', 'Book your place', 'how this one is sold')
  } else if (facts.model === 'book') {
    add('action', `Book ${lower(facts.name)}`, 'how this one is sold')
  }

  add('discovery', `New on ZaMarket: ${facts.name}`, facts.isNew ? 'listed in the last three weeks' : null)
  add('discovery', `Meet ${lower(facts.name)}`, 'the offering name')
  add('value', `${money(facts.price)} — here is what you get`, 'the price')
  add('local', 'Available in Lusaka', 'where you deliver')
  if (facts.freeDelivery) add('local', 'Free delivery in Lusaka', 'your delivery setting')
  add('trust', 'Ordered online, confirmed by phone', 'how ZaMarket works')
  add('trust', 'Buy it through ZaMarket', 'how ZaMarket works')

  if (facts.review) add('proof', `"${facts.review.text}"`, `a verified review by ${facts.review.by}`)
  if (facts.rating && facts.reviewCount >= 3) add('proof', `${facts.rating} stars from ${facts.reviewCount} buyers`, 'your real ratings')

  if (facts.stock != null && facts.stock > 0 && facts.stock <= 5) add('urgency', `Only ${facts.stock} left`, 'your stock count')
  if (facts.offerEnds) {
    const d = new Date(facts.offerEnds)
    if (!Number.isNaN(d.getTime())) add('urgency', `Offer ends ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`, 'the offer end date')
  }

  add('action', 'Ready to get yours?', 'nothing — a plain ask')
  // no duplicates, hooks that fit on a poster only
  const seen = new Set()
  return h.filter((x) => {
    const k = x.text.toLowerCase()
    if (seen.has(k) || x.text.length > 58) return false
    seen.add(k)
    return true
  })
}

// One short line under the name. Approved benefit, or the seller's own description.
export function valueLine(facts, product, hook) {
  const used = String(hook || '').toLowerCase()
  const desc = clean(product?.description).split(/[.\n]/)[0]
  const first = facts.benefits[0]
  // prefer the seller's own sentence; fall back to a benefit that is not already the hook
  if (desc && desc.length <= 120 && desc.toLowerCase() !== used) return desc
  if (first && first.length <= 100 && first.toLowerCase() !== used) return first
  return null
}

// The trust row. Only true things.
export function trustPoints(facts, product, settings) {
  const points = []
  points.push({ icon: 'truck', label: facts.freeDelivery ? 'Free delivery\nin Lusaka' : 'Delivered\nin Lusaka' })
  points.push({ icon: 'phone', label: 'Confirmed\nby phone' })
  if (product?.trust_level === 'verified' || product?.vendor_trust === 'verified') points.push({ icon: 'shield', label: 'Verified\nZaMarket seller' })
  else points.push({ icon: 'shield', label: 'Listed on\nZaMarket' })
  return points
}

export const ctaFor = (facts) =>
  facts.kind === 'vehicle' || facts.model === 'negotiate' || facts.model === 'enquire' ? 'ENQUIRE ON ZAMARKET'
    : facts.model === 'book' ? 'BOOK NOW ON ZAMARKET'
      : 'BUY NOW ON ZAMARKET'
