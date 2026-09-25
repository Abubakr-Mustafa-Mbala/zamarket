// Posts that are not adverts. An affiliate shouting "buy this" is one of ten
// thousand. An affiliate explaining why this transaction is safer is one of very few.
//
// Every number here is counted by the marketplace. If a number doesn't exist yet,
// the post that needs it is not offered.

export const POST_KINDS = {
  trust: 'Why this is different',
  education: 'What to check before you buy',
  discovery: 'Something I found',
  proof: 'What actually happened',
  vendor: 'Meet a local business',
  howto: 'How ordering works',
}

export function trustPosts({ proof, link, vendors = [], quotes = [] }) {
  const p = proof || {}
  const out = []
  const add = (kind, title, text, needs = true) => { if (needs) out.push({ kind, title, text }) }

  add('trust', 'Why I use ZaMarket',
`One thing I like about ZaMarket: you don't just get a picture and a WhatsApp number.

You can see who you're buying from, what ZaMarket checked about them, the full price with delivery, and what happens if the order goes wrong.

Nothing is paid until they call you to confirm.

${link}`)

  add('education', 'Before you buy anything online',
`Before you send money to anyone online, check five things:

• Who is selling it? Can you see a real business?
• Where are they? Is there an actual place?
• Is the full price shown, including delivery?
• What happens if it never arrives?
• Can you see reviews from people who actually bought?

If you can't answer those, don't send the money. That's why I check ZaMarket first.

${link}`)

  add('howto', 'How an order works',
`How buying on ZaMarket actually goes:

1. You order online — no money yet
2. A real person calls you to confirm the price and delivery
3. You pay
4. They collect it from the seller and bring it to you
5. You rate the order afterwards

That's it. No sending money to a stranger and hoping.

${link}`)

  add('trust', 'If something goes wrong',
`Most online sellers tell you to "contact the seller" and then disappear.

ZaMarket keeps the record of every order — what you paid, what was promised, who was delivering. If the wrong thing arrives or nothing arrives, you go to ZaMarket, not to a stranger.

Worth knowing before you buy.

${link}`)

  add('proof', 'The numbers so far',
`Some honest numbers from ZaMarket:

${p.completed_orders} order${p.completed_orders === 1 ? '' : 's'} completed and delivered
${p.checked_businesses} local business${p.checked_businesses === 1 ? '' : 'es'} checked by the team${p.verified_reviews > 0 ? `\n${p.verified_reviews} review${p.verified_reviews === 1 ? '' : 's'} from people who actually bought` : ''}

Small numbers, real ones. Every order is recorded.

${link}`, Number(p.completed_orders) >= 5)

  for (const v of vendors.slice(0, 3)) {
    add('vendor', `Meet ${v.business_name}`,
`${v.business_name}${v.town ? ` — ${v.town}` : ''}

${v.tagline || v.description || 'A local business selling on ZaMarket.'}

You can see their shop, their prices and what ZaMarket checked about them before you order anything.

${link.replace(/\/$/, '')}/${v.slug}`)
  }

  for (const qt of (quotes || []).slice(0, 3)) {
    add('proof', `What ${qt.name} said`,
`"${qt.comment}"

— ${qt.name}, after buying ${qt.product || 'on ZaMarket'}${qt.vendor ? ` from ${qt.vendor}` : ''}

That's a real review from a real order, not something we wrote.

${link}`)
  }

  add('discovery', 'Found on ZaMarket',
`Spent a few minutes going through ZaMarket today.

Local businesses, proper prices, delivery in Lusaka, and you can check the seller before you order.

Have a look for yourself:
${link}`)

  return out
}
