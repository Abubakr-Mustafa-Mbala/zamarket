// The last gate before a creative goes out. It checks the facts behind the
// picture, not the picture's taste: nothing missing, nothing placeholder,
// nothing claimed that the marketplace cannot stand behind.

const PLACEHOLDERS = /\[(product|price|name|insert|your|url|link|benefit|text)[^\]]*\]|lorem ipsum|xxx+|tbd|todo|\bundefined\b|\bnull\b|NaN/i

// Words a marketplace cannot let an affiliate put on a picture unless the seller
// actually wrote them, because we would be the ones standing behind them.
const RISKY = [
  [/\b(guarantee[sd]?|guaranteed)\b/i, 'a guarantee'],
  [/\b(cure|heals?|treats?)\b/i, 'a medical claim'],
  [/\b(100%|best in|number one|no\.? ?1|cheapest)\b/i, 'a "best" or "cheapest" claim'],
  [/\b(original|genuine|authentic)\b/i, 'an authenticity claim'],
  [/\b(free delivery|free shipping)\b/i, 'free delivery'],
  [/\b(last chance|final hours|only today|selling fast|almost gone)\b/i, 'urgency'],
]

export function checkCreative({ product, offer, hook, caption, link, settings }) {
  const problems = []
  const warnings = []
  const text = `${hook || ''} ${caption || ''}`
  const approved = [
    product?.name, product?.description, ...(product?.benefits || []),
    ...(product?.faqs || []).flatMap((f) => [f.q, f.a]), offer?.copy,
  ].join(' ').toLowerCase()

  // ---- must be true before anything is shared
  if (product?.promo_blocked) {
    problems.push(product.promo_note
      ? `The marketplace has stopped promotion of this: ${product.promo_note}`
      : 'The marketplace has stopped promotion of this offering.')
  }
  if (!product?.name) problems.push('The product has no name.')
  if (!(Number(product?.price) > 0)) problems.push('The price is zero. A picture without a real price cannot go out.')
  if (!link) problems.push('There is no link on it, so nobody can order and nobody gets credit.')
  if (PLACEHOLDERS.test(text)) problems.push('There is placeholder text left in the wording.')
  if (product?.status && product.status !== 'published') problems.push('This is not published yet, so the link would go nowhere.')
  if (product?.normal_price && Number(product.normal_price) <= Number(product.price)) {
    problems.push('The "was" price is not higher than the price. A saving that is not real cannot be shown.')
  }
  if (!product?.images?.[0]) warnings.push('There is no photo, so the picture uses a plain panel. A real photo sells far better.')

  // ---- claims that need to come from the seller, not from us
  for (const [re, what] of RISKY) {
    if (re.test(text) && !re.test(approved)) {
      warnings.push(`The wording implies ${what}, and the seller did not write that. Remove it unless you can prove it.`)
    }
  }
  if (/\bfree delivery\b/i.test(text) && settings?.delivery_included !== true && settings?.delivery_included !== 'true') {
    problems.push('It says free delivery, but delivery is not included in your prices.')
  }

  return {
    ok: problems.length === 0,
    problems,
    warnings,
    checked: ['A real price', 'A working link', 'No placeholder text', 'Savings that are real', 'No invented claims'],
  }
}
