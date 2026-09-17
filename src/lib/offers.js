import { useEffect, useState } from 'react'
import { money } from './format'

// Customer-facing words for an offer. `o` is a row from public_offers.
export function offerCopy(o, productName) {
  const c = o.config || {}
  const units = o.units || 1
  const name = productName || 'this product'
  const plural = units > 1 ? `${units} × ${name}` : name
  switch (o.type) {
    case 'buy_x_get_y': return { get: `${plural} — you pay for ${c.buyQty}`, bonus: `${c.freeQty} free` }
    case 'bundle': return { get: plural }
    case 'percent_off': case 'flash': return { get: `${name} at ${c.discountPct}% off` }
    case 'fixed_off': return { get: `${name} with ${money(c.discountAmount)} off` }
    case 'free_gift': return { get: name, bonus: c.giftName ? `Free ${c.giftName}` : 'Free gift included' }
    case 'free_delivery': return { get: `Free delivery in Lusaka on orders over ${money(c.minSpend)}` }
    case 'order_bump': case 'upsell': return { get: `Add ${name} to your order` }
    case 'downsell': return { get: `${name} at ${c.discountPct}% off` }
    case 'payment_plan': return { get: `Pay ${money(c.deposit)} when we confirm, the rest on delivery` }
    case 'continuity': return { get: `${c.discountPct}% off when you reorder${c.cycleDays ? ` every ${c.cycleDays} days` : ''}` }
    default: return { get: name }
  }
}

// Offers that change the price and are taken as a "deal" from the product page.
export const DEAL_TYPES = ['buy_x_get_y', 'bundle', 'percent_off', 'flash', 'fixed_off', 'free_gift', 'continuity']
// Offers that are a condition on a normal purchase.
export const CONDITION_TYPES = ['free_delivery', 'payment_plan']
// Offers shown at checkout.
export const CHECKOUT_TYPES = ['order_bump', 'upsell']

export function useCountdown(endAt) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!endAt) return
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [endAt])
  if (!endAt) return null
  const ms = new Date(endAt).getTime() - now
  if (ms <= 0) return 'Ended'
  const d = Math.floor(ms / 864e5)
  const h = Math.floor((ms % 864e5) / 36e5)
  const m = Math.floor((ms % 36e5) / 6e4)
  if (d >= 3) return `Ends ${new Date(endAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  if (d >= 1) return `Ends in ${d}d ${h}h`
  return `Ends in ${h}h ${m}m`
}
