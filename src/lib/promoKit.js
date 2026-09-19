// The promotion kit is assembled, not written.
// Approved facts (name, price, offer, benefits, link) are placed into approved
// templates. Nothing is invented, so an affiliate can never accidentally promise
// something the seller did not say.

import { money } from './format'

const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length]

// ---- the approved facts, pulled straight from the offering ----
export function facts(product, offer, link, settings) {
  const price = Number(product.price || 0)
  const normal = product.normal_price && Number(product.normal_price) > price ? Number(product.normal_price) : null
  const benefits = (product.benefits || []).filter(Boolean).slice(0, 3)
  return {
    name: product.name,
    price: money(price),
    normal: normal ? money(normal) : null,
    save: normal ? money(normal - price) : null,
    benefits,
    offer: offer?.copy || null,
    link,
    delivery: product.fulfilment === 'service'
      ? 'Book online, pay after we confirm'
      : product.fulfilment === 'made_to_order'
        ? 'Made to order, delivered in Lusaka'
        : 'Delivered in Lusaka, pay when you receive it',
    kind: product.offering_type || 'product',
    vendor: product.vendor_name || null,
  }
}

// ---- approved wording, per channel. {curly} parts are filled in. ----
const WHATSAPP = [
  { name: 'Short', body: (f) => `Hi 👋\n\n${f.name} is available for ${f.price}.${f.offer ? `\n${f.offer}.` : ''}\n${f.delivery}.\n\nOrder here:\n${f.link}` },
  { name: 'What you get', body: (f) => `Hi 👋\n\n${f.name} — ${f.price}.${f.benefits.length ? `\n\n${f.benefits.map((b) => `• ${b}`).join('\n')}` : ''}\n\n${f.delivery}.\n${f.link}` },
  { name: 'Offer first', body: (f) => `${f.offer ? `${f.offer} 🔥\n\n` : f.save ? `Save ${f.save} 🔥\n\n` : ''}${f.name}${f.normal ? `\nNormally ${f.normal}, now ${f.price}` : `\n${f.price}`}\n${f.delivery}.\n\n${f.link}` },
  { name: 'One question', body: (f) => `Hi 👋 quick one — do you still need ${f.name.toLowerCase()}?\n\nIt's ${f.price}${f.offer ? `, and right now: ${f.offer.toLowerCase()}` : ''}. ${f.delivery}.\n\n${f.link}` },
]

const SOCIAL = [
  { name: 'Plain', body: (f) => `${f.name} — ${f.price}.${f.offer ? `\n${f.offer}.` : ''}\n${f.delivery}.\n\nOrder: ${f.link}` },
  { name: 'Benefits', body: (f) => `${f.name}, ${f.price}${f.benefits.length ? `\n\n${f.benefits.map((b) => `✓ ${b}`).join('\n')}` : ''}\n\n${f.delivery}.\nOrder here: ${f.link}` },
  { name: 'Deal', body: (f) => `${f.save ? `SAVE ${f.save}` : f.offer || 'Available now'}\n\n${f.name}${f.normal ? ` — was ${f.normal}, now ${f.price}` : ` — ${f.price}`}\n${f.delivery}.\n\n${f.link}` },
  { name: 'Question', body: (f) => `Looking for ${f.name.toLowerCase()} in Lusaka?\n\n${f.price}${f.offer ? `. ${f.offer}` : ''}. ${f.delivery}.\n\n${f.link}` },
]

const STATUS = [
  { name: 'Status', body: (f) => `${f.name}\n${f.price}${f.offer ? `\n${f.offer}` : ''}\n\nOrder: ${f.link}` },
  { name: 'Status, question', body: (f) => `Who needs ${f.name.toLowerCase()}? ${f.price}.\nSend me a message, or order here: ${f.link}` },
]

// Offering types that read differently
const ENQUIRY = [
  { name: 'Enquiry', body: (f) => `${f.name}\n${f.kind === 'vehicle' ? 'Asking price' : 'From'} ${f.price}${f.benefits.length ? `\n\n${f.benefits.map((b) => `• ${b}`).join('\n')}` : ''}\n\nSerious enquiries here:\n${f.link}` },
  { name: 'Enquiry, short', body: (f) => `${f.name} — ${f.price}. Details and enquiries: ${f.link}` },
]
const COURSE = [
  { name: 'Course', body: (f) => `${f.name}\nFrom ${f.price}${f.benefits.length ? `\n\n${f.benefits.map((b) => `✓ ${b}`).join('\n')}` : ''}\n\nBook your place: ${f.link}` },
  { name: 'Course, question', body: (f) => `Want to learn ${f.name.toLowerCase().replace(/^learn /, '')}?\n\nFrom ${f.price}. Flexible times.\nBook here: ${f.link}` },
]

export const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp message' },
  { key: 'social', label: 'Social caption' },
  { key: 'status', label: 'Status or story' },
]

export const IMAGE_LAYOUTS = [
  { key: 'product', label: 'Product card' },
  { key: 'offer', label: 'Offer card' },
  { key: 'none', label: 'No picture' },
]

export function templatesFor(channel, kind) {
  if (kind === 'vehicle') return channel === 'status' ? STATUS : ENQUIRY
  if (kind === 'course' || kind === 'class') return channel === 'status' ? STATUS : COURSE
  if (channel === 'whatsapp') return WHATSAPP
  if (channel === 'social') return SOCIAL
  return STATUS
}

// One assembled promotion: the wording plus everything it was built from.
export function buildKit({ product, offer, link, channel = 'whatsapp', variant = 0, settings, intro = '' }) {
  const f = facts(product, offer, link, settings)
  const list = templatesFor(channel, f.kind)
  const t = pick(list, variant)
  const body = t.body(f)
  return {
    facts: f,
    templateName: t.name,
    variants: list.length,
    text: intro ? `${intro.trim()}\n\n${body}` : body,
  }
}
