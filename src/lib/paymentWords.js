// How payment works, in one place, so every screen and every message says the same thing.
//
// A ZaMarket product: we hold the stock, so the customer can pay on delivery.
// A vendor product: we must pay the vendor when we collect it, so the customer
// pays by mobile money after we confirm the order, and then we deliver.

export const PAY_RULES = {
  confirm_then_pay: {
    short: 'Confirmed by phone, then you pay',
    line: 'We call to confirm your order, you pay by mobile money, then we deliver.',
    caption: 'We call to confirm, you pay by mobile money, then we deliver',
  },
  on_delivery: {
    short: 'Pay when it reaches you',
    line: 'We call to confirm your order, then you pay when it reaches you.',
    caption: 'We call to confirm, you pay when it reaches you',
  },
}

// Which rule applies to a product.
export function payRule(product, settings) {
  const forced = settings?.payment_rule
  if (forced === 'confirm_then_pay' || forced === 'on_delivery') return PAY_RULES[forced]
  // default: our own stock can be paid on delivery, a vendor's cannot
  return product?.owner_type === 'vendor' ? PAY_RULES.confirm_then_pay : PAY_RULES.on_delivery
}

export const payLine = (product, settings) => payRule(product, settings).line
export const payCaption = (product, settings) => payRule(product, settings).caption

// What the whole marketplace says when no single product is in view.
export const MARKETPLACE_PAY_LINE = 'We call to confirm every order before any money moves.'
