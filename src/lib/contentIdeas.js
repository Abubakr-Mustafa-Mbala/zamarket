import { money } from './format'

// Thirty things to post, built from what is actually in the shop.
// Each one says what to film, what to write, and which link to use.
// Nothing here invents claims about a product — the words come from what the seller typed.

const TEMPLATES = [
  {
    key: 'price_reveal', platform: 'TikTok', kind: 'Video, 15 seconds',
    title: (p) => `Price reveal: ${p.name}`,
    hook: (p) => `"How much do you think this costs in Lusaka?"`,
    shots: (p) => ['Hold the item, turn it slowly', 'Show the detail people care about', 'Then show the price on screen'],
    caption: (p, link) => `How much did you guess? ${p.name} — ${money(p.price)}, delivered in Lusaka.\nOrder: ${link}`,
  },
  {
    key: 'unboxing', platform: 'TikTok', kind: 'Video, 20 seconds',
    title: (p) => `Unboxing the ${p.name}`,
    hook: () => 'New stock just arrived.',
    shots: (p) => ['Open the packaging on camera', 'Show what is inside', 'Show it working or being used'],
    caption: (p, link) => `Just arrived: ${p.name}. ${money(p.price)}.\nWe deliver in Lusaka and you pay when you receive it.\n${link}`,
  },
  {
    key: 'in_use', platform: 'Instagram', kind: 'Photo or short video',
    title: (p) => `${p.name} in real life`,
    hook: (p) => `Not a catalogue photo — this is it in use.`,
    shots: (p) => ['Use it the way a customer would', 'Close-up of the part that matters', 'Wide shot in a real room'],
    caption: (p, link) => `${p.name}, ${money(p.price)}.\n${(p.benefits || [])[0] || 'Ask me anything about it.'}\n${link}`,
  },
  {
    key: 'question', platform: 'WhatsApp status', kind: 'Photo + question',
    title: (p) => `Ask about the ${p.name}`,
    hook: () => 'Questions get replies. Adverts get ignored.',
    shots: () => ['One clear photo', 'Write the question over it'],
    caption: (p, link) => `Would you buy this at ${money(p.price)}? Yes or no, tell me why.\n${link}`,
  },
  {
    key: 'packing', platform: 'TikTok', kind: 'Video, 15 seconds',
    title: (p) => `Packing an order: ${p.name}`,
    hook: () => 'Pack an order with me.',
    shots: () => ['Wrap it properly', 'Write the delivery note', 'Hand it to the rider or put it in the car'],
    caption: (p, link) => `Another ${p.name} going out in Lusaka today. ${money(p.price)}.\n${link}`,
  },
  {
    key: 'compare', platform: 'Facebook', kind: 'Photo + text',
    title: (p) => `What ${money(p.price)} gets you`,
    hook: (p) => `People ask what ${money(p.price)} can get you in Lusaka.`,
    shots: () => ['One photo of the item', 'Or three photos side by side'],
    caption: (p, link) => `${money(p.price)} gets you a ${p.name}. Delivered, and you pay when it reaches you.\n${link}`,
  },
  {
    key: 'behind', platform: 'Instagram', kind: 'Story or reel',
    title: (p) => `Behind the ${p.name}`,
    hook: () => 'Where it comes from, and why we chose it.',
    shots: (p) => ['Talk to camera for 15 seconds', 'Show the item while you talk'],
    caption: (p, link) => `Why we stock the ${p.name}. Honest answer in the video.\n${link}`,
  },
  {
    key: 'faq', platform: 'TikTok', kind: 'Video, 20 seconds',
    title: (p) => `The question everyone asks about the ${p.name}`,
    hook: (p) => (p.faqs?.[0]?.q ? `"${p.faqs[0].q}"` : 'The question I get every week.'),
    shots: () => ['Say the question', 'Answer it plainly while showing the item'],
    caption: (p, link) => `${p.faqs?.[0]?.q || 'Your questions about this one'} — answered.\n${p.name}, ${money(p.price)}.\n${link}`,
  },
  {
    key: 'seller_story', platform: 'Instagram', kind: 'Photo + caption',
    title: (p) => `Meet the seller behind the ${p.name}`,
    hook: (p) => (p.vendor_name ? `${p.vendor_name} makes these here in Lusaka.` : 'The people behind what we sell.'),
    shots: () => ['A photo of the seller at work', 'A photo of the finished item'],
    caption: (p, link) => `${p.vendor_name || 'A local seller'} on ZaMarket. ${p.name}, ${money(p.price)}.\nBuying here supports them directly.\n${link}`,
  },
  {
    key: 'delivery', platform: 'WhatsApp status', kind: 'Photo',
    title: () => 'How ordering works',
    hook: () => 'People hesitate because they do not trust online.',
    shots: () => ['A photo of an order going out', 'Three steps written on screen'],
    caption: (p, link) => `Order online, we call you to confirm, you pay when you receive it. Nothing paid upfront.\n${link}`,
  },
]

const WEEK_PLAN = [
  ['Monday', 'Price reveal or new stock'],
  ['Tuesday', 'Product in real life'],
  ['Wednesday', 'Answer the question customers ask most'],
  ['Thursday', 'Packing an order, or a delivery going out'],
  ['Friday', 'A seller story, or how ordering works'],
  ['Saturday', 'Ask a question on status and reply to everyone'],
  ['Sunday', 'Rest, or reshare the best post of the week'],
]

export { WEEK_PLAN }

// affiliateCode: every link becomes that affiliate's link, so the sale is credited to them.
export function buildIdeas(products, campaign, host = '', affiliateCode = null) {
  if (!products?.length) return []
  const link = (p) => (affiliateCode
    ? `${host}/r/${affiliateCode}/${p.slug}`
    : campaign ? `${host}/go/${campaign.code}` : p.vendor_slug ? `${host}/${p.vendor_slug}/${p.slug}` : `${host}/p/${p.slug}`)
  const out = []
  // spread the templates across the products so it never repeats the same item twice in a row
  TEMPLATES.forEach((t, ti) => {
    products.forEach((p, pi) => {
      if ((ti + pi) % Math.max(1, Math.ceil((TEMPLATES.length * products.length) / 30)) !== 0) return
      if (t.key === 'seller_story' && !p.vendor_name) return
      if (t.key === 'faq' && !p.faqs?.length && Math.random() > 0.4) return
      out.push({
        id: `${t.key}-${p.id}`,
        platform: t.platform,
        kind: t.kind,
        product: p,
        title: t.title(p),
        hook: t.hook(p),
        shots: t.shots(p),
        caption: t.caption(p, link(p)),
      })
    })
  })
  return out.slice(0, 30)
}
