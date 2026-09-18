// Pure calculation engine. No UI, no Supabase. Every number the app shows comes from here.
import { n } from './format'

const r2 = (x) => Math.round(x * 100) / 100

// ---------- Landed cost (spec §34) ----------
export function landedCost({ quantity, unitPrice, shipping = 0, transport = 0, other = 0, damaged = 0 }) {
  const goods = n(quantity) * n(unitPrice)
  const total = goods + n(shipping) + n(transport) + n(other)
  const sellable = Math.max(0, n(quantity) - n(damaged))
  return {
    goods: r2(goods),
    extras: r2(n(shipping) + n(transport) + n(other)),
    total: r2(total),
    sellable,
    perUnit: sellable ? r2(total / sellable) : 0,
  }
}

// ---------- Markup vs margin (spec §30) ----------
export const margin = (price, cost) => (n(price) > 0 ? r2(((n(price) - n(cost)) / n(price)) * 100) : 0)
export const markup = (price, cost) => (n(cost) > 0 ? r2(((n(price) - n(cost)) / n(cost)) * 100) : 0)
export const priceFromMargin = (cost, marginPct) => (n(marginPct) >= 100 ? 0 : r2(n(cost) / (1 - n(marginPct) / 100)))
export const priceFromMarkup = (cost, markupPct) => r2(n(cost) * (1 + n(markupPct) / 100))

// ---------- Commission (mirrors commission_for() in SQL) ----------
export function commissionAmount(product, unitPrice, qty, settings) {
  if (product?.commission_type === 'flat') return r2(n(product.commission_value) * qty)
  if (product?.commission_type === 'pct') return r2((unitPrice * qty * n(product.commission_value)) / 100)
  return r2((unitPrice * qty * n(settings?.default_commission_pct)) / 100)
}

export function commissionLabel(product, settings) {
  if (product?.commission_type === 'flat') return { text: `K${n(product.commission_value).toFixed(2)} flat`, perUnit: n(product.commission_value) }
  const pctVal = product?.commission_type === 'pct' ? n(product.commission_value) : n(settings?.default_commission_pct)
  return { text: `${pctVal}%`, perUnit: r2((n(product?.price) * pctVal) / 100) }
}

// ---------- Unit economics (spec §25, §31) ----------
// All inputs are per unit. Percent inputs are of selling price.
export function unitEconomics(i) {
  const price = n(i.price)
  const productCost = n(i.productCost)
  const shipping = n(i.shipping)
  const packaging = n(i.packaging)
  const delivery = n(i.delivery)
  const other = n(i.other)
  const storage = n(i.storage)
  const paymentFee = r2((price * n(i.paymentFeePct)) / 100)
  const commission = i.commissionFlat != null ? n(i.commissionFlat) : r2((price * n(i.commissionPct)) / 100)
  const marketplaceFee = r2((price * n(i.marketplaceFeePct)) / 100)
  const advertising = n(i.advertising)
  const damage = r2((productCost * n(i.damagePct)) / 100)
  const returns = r2((price * n(i.returnPct)) / 100)

  const trueUnitCost = r2(productCost + shipping + packaging + delivery + paymentFee + other)
  const contributionBeforeAds = r2(price - trueUnitCost - commission - marketplaceFee)
  const totalCosts = r2(trueUnitCost + commission + marketplaceFee + advertising + damage + returns + storage)
  const netProfit = r2(price - totalCosts)
  const netMargin = price > 0 ? r2((netProfit / price) * 100) : 0
  const contributionMargin = price > 0 ? r2((contributionBeforeAds / price) * 100) : 0

  // Variable-percentage costs scale with price; fixed ones don't.
  const fixed = productCost + shipping + packaging + delivery + other + advertising + damage + storage + (i.commissionFlat != null ? n(i.commissionFlat) : 0)
  const varPct = (n(i.paymentFeePct) + (i.commissionFlat != null ? 0 : n(i.commissionPct)) + n(i.marketplaceFeePct) + n(i.returnPct)) / 100
  const breakEvenPrice = varPct < 1 ? r2(fixed / (1 - varPct)) : 0
  const minProfit = n(i.minProfit)
  const minPriceForMinProfit = varPct < 1 ? r2((fixed + minProfit) / (1 - varPct)) : 0
  const maxProductCost = r2(Math.max(0, productCost + netProfit - minProfit))
  const maxAdvertising = r2(Math.max(0, advertising + netProfit - minProfit))
  const maxDelivery = r2(Math.max(0, delivery + netProfit - minProfit))
  const maxCommissionPct = price > 0 ? r2(Math.max(0, n(i.commissionPct) + ((netProfit - minProfit) / price) * 100)) : 0
  const maxMarketplaceFeePct = price > 0 ? r2(Math.max(0, n(i.marketplaceFeePct) + ((netProfit - minProfit) / price) * 100)) : 0

  return {
    price, productCost, shipping, packaging, delivery, other, storage, paymentFee, commission, marketplaceFee, advertising, damage, returns,
    trueUnitCost, contributionBeforeAds, contributionMargin, totalCosts, netProfit, netMargin,
    breakEvenPrice, minPriceForMinProfit, maxProductCost, maxAdvertising, maxDelivery, maxCommissionPct, maxMarketplaceFeePct,
    markup: markup(price, trueUnitCost),
    fixedCosts: r2(fixed), variablePct: r2(varPct * 100),
  }
}

// Price needed to hit a target when some costs are a % of price.
export function priceForTarget(fixedCosts, variablePct, mode, targetPct) {
  const v = n(variablePct) / 100
  const t = n(targetPct) / 100
  if (mode === 'margin') return 1 - v - t <= 0 ? 0 : r2(n(fixedCosts) / (1 - v - t))
  const d = 1 - v * (1 + t)
  return d <= 0 ? 0 : r2((n(fixedCosts) * (1 + t)) / d)
}

export function light(netMargin, netProfit, settings) {
  const target = n(settings?.target_margin_pct ?? 30)
  const minProfit = n(settings?.min_profit_per_unit ?? 0)
  if (netProfit <= 0) return { tone: 'bad', label: 'Loss-making' }
  if (netMargin < target || netProfit < minProfit) return { tone: 'warn', label: 'Below target' }
  return { tone: 'ok', label: 'Profitable' }
}

// ---------- Pre-purchase simulator (spec §27–29) ----------
export function simulate(i, settings) {
  const qty = Math.max(0, n(i.quantity))
  const lc = landedCost({ quantity: qty, unitPrice: i.purchasePrice, shipping: i.supplierShipping, transport: i.inboundTransport, other: i.otherInbound, damaged: Math.round((qty * n(i.damagePct)) / 100) })
  const sellable = lc.sellable
  const perUnit = (mult) =>
    unitEconomics({
      price: i.sellingPrice,
      productCost: lc.perUnit,
      packaging: i.packaging,
      delivery: n(i.delivery) * mult.delivery,
      paymentFeePct: i.paymentFeePct,
      commissionPct: i.commissionPct,
      marketplaceFeePct: i.marketplaceFeePct,
      advertising: n(i.advertising) * mult.ads,
      damagePct: 0, // already removed from sellable units above
      returnPct: n(i.returnPct) * mult.returns,
      storage: sellable ? n(i.storage) / sellable : 0,
      other: i.otherPerUnit,
      minProfit: i.minProfit,
    })

  const cases = {
    bad: perUnit({ delivery: 1.25, ads: 1.5, returns: 2 }),
    expected: perUnit({ delivery: 1, ads: 1, returns: 1 }),
    good: perUnit({ delivery: 0.9, ads: 0.7, returns: 0.5 }),
  }
  const totals = Object.fromEntries(
    Object.entries(cases).map(([k, u]) => [
      k,
      {
        revenue: r2(u.price * sellable),
        profit: r2(u.netProfit * sellable),
        costs: r2(u.totalCosts * sellable),
        breakEvenUnits: u.netProfit > 0 ? Math.ceil(lc.total / Math.max(0.01, u.price - (u.totalCosts - lc.perUnit))) : null,
      },
    ])
  )
  const e = cases.expected
  const target = n(settings?.target_margin_pct ?? 30)
  const minProfit = n(settings?.min_profit_per_unit ?? 0)
  let decision
  if (e.netProfit <= 0 || cases.bad.netProfit < -e.netProfit) decision = { verdict: 'DO NOT BUY', tone: 'bad', why: 'Expected profit is negative or the bad case wipes it out.' }
  else if (e.netMargin < target || e.netProfit < minProfit || cases.bad.netProfit <= 0) decision = { verdict: 'TEST FIRST', tone: 'warn', why: 'Positive but thin. Buy a small batch and confirm demand and costs before committing.' }
  else decision = { verdict: 'BUY', tone: 'ok', why: 'Healthy margin in the expected case and still profitable in the bad case.' }

  return { landed: lc, sellable, cases, totals, decision, assumptions: {
    bad: 'Delivery +25%, ad cost +50%, returns ×2',
    expected: 'Your inputs as entered',
    good: 'Delivery −10%, ad cost −30%, returns halved',
  } }
}

// ---------- Offer engine (spec §23–25; Hormozi offer categories) ----------
export const OFFER_TYPES = [
  { key: 'buy_x_get_y', category: 'attraction', name: 'Buy X get Y free', fields: ['buyQty', 'freeQty'], help: 'Customer pays for X units and receives X+Y.' },
  { key: 'percent_off', category: 'attraction', name: 'Percentage discount', fields: ['discountPct'], help: 'A straight percentage off the selling price.' },
  { key: 'fixed_off', category: 'attraction', name: 'Fixed amount off', fields: ['discountAmount'], help: 'A fixed kwacha amount off the selling price.' },
  { key: 'free_gift', category: 'attraction', name: 'Free gift with purchase', fields: ['giftName', 'giftCost'], help: 'Customer pays the normal price and gets a bonus item.' },
  { key: 'bundle', category: 'attraction', name: 'Bundle price', fields: ['buyQty', 'bundlePrice'], help: 'A set quantity for one bundled price.' },
  { key: 'free_delivery', category: 'attraction', name: 'Free delivery', fields: ['minSpend'], help: 'Delivery on us in Lusaka District when the order reaches a minimum spend.' },
  { key: 'flash', category: 'attraction', name: 'Limited-time price', fields: ['discountPct'], help: 'Percentage off with a hard end date. Set an end date below.' },
  { key: 'order_bump', category: 'upsell', name: 'Order bump', fields: ['bumpPrice'], help: 'This product offered as a quick add-on at checkout, at a special price.' },
  { key: 'upsell', category: 'upsell', name: 'Upgrade offer', fields: ['bumpPrice'], help: 'A bigger or better product suggested at checkout, at a special price.' },
  { key: 'downsell', category: 'downsell', name: 'Downsell', fields: ['discountPct'], help: 'Shown only when a customer removes this product from their cart.' },
  { key: 'payment_plan', category: 'downsell', name: 'Deposit now, rest on delivery', fields: ['deposit'], help: 'Normal price; customer pays a deposit when we confirm, the rest on delivery.' },
  { key: 'continuity', category: 'continuity', name: 'Repeat order price', fields: ['discountPct', 'cycleDays'], help: 'A loyalty price for customers who reorder regularly.' },
]

export const OFFER_CATEGORIES = {
  attraction: 'Attraction — bring people in',
  upsell: 'Upsell — grow the order',
  downsell: 'Downsell — catch the no',
  continuity: 'Continuity — keep them coming back',
}

export const FIELD_LABELS = {
  buyQty: 'Units customer pays for', freeQty: 'Free units', discountPct: 'Discount (%)', discountAmount: 'Discount (K)',
  giftName: 'Gift (what the customer gets)', giftCost: 'Cost of gift to us (K)', bundlePrice: 'Bundle price (K)', minSpend: 'Minimum spend (K)',
  bumpPrice: 'Add-on price (K)', deposit: 'Deposit (K)', cycleDays: 'Reorder every (days)',
}
export const TEXT_FIELDS = ['giftName']

// One "deal" = what a customer gets for taking the offer once.
// MUST match offer_deal() in schema.sql — the database is what actually charges.
export function dealTerms(type, cfg = {}, product = {}, gift = null) {
  const base = n(product.price)
  const normal = n(product.normal_price) || base
  let units = 1
  let price = base
  switch (type) {
    case 'buy_x_get_y': {
      const freeQty = parseInt(cfg.freeQty) || 0
      units = (parseInt(cfg.buyQty) || 1) + (gift ? 0 : freeQty)   // a different free product is its own line
      price = (parseInt(cfg.buyQty) || 1) * base
      break
    }
    case 'bundle': units = Math.max(1, parseInt(cfg.buyQty) || 1); price = cfg.bundlePrice !== undefined && cfg.bundlePrice !== '' ? n(cfg.bundlePrice) : base * units; break
    case 'fixed_off': price = Math.max(0, base - n(cfg.discountAmount)); break
    case 'order_bump': case 'upsell': price = cfg.bumpPrice !== undefined && cfg.bumpPrice !== '' ? n(cfg.bumpPrice) : base; break
    case 'percent_off': case 'flash': case 'downsell': case 'continuity': price = r2(base * (1 - n(cfg.discountPct) / 100)); break
    default: break
  }
  const giftValue = gift ? (n(gift.normal_price) || n(gift.price)) * (parseInt(cfg.freeQty) || 1) : 0
  const normalValue = units * normal + giftValue
  return { units, price: r2(price), normalValue: r2(normalValue), savings: r2(Math.max(0, normalValue - price)), giftQty: gift ? (parseInt(cfg.freeQty) || 1) : 0 }
}

// Economics of one deal, for the builder. Mirrors enforce_offer_floor() in schema.sql.
export function offerEconomics(type, cfg, product, settings, gift = null) {
  const d = dealTerms(type, cfg, product, gift)
  const cost = n(product?.effective_cost)
  const packaging = n(product?.packaging_cost ?? settings?.default_packaging_cost)
  const commissionPct = product?.commission_type === 'pct' ? n(product.commission_value) : product?.commission_type === 'flat' ? 0 : n(settings?.default_commission_pct)
  const commissionFlat = product?.commission_type === 'flat' ? n(product.commission_value) * d.units : null
  const u = unitEconomics({
    price: d.price,
    productCost: cost * d.units + (type === 'free_gift' ? n(cfg.giftCost) : 0) + (gift ? n(gift.effective_cost) * d.giftQty : 0),
    packaging: packaging * (d.units + (d.giftQty || 0)),
    delivery: type === 'free_delivery' ? n(settings?.local_delivery_fee) : 0,
    paymentFeePct: settings?.payment_fee_pct,
    commissionPct, commissionFlat,
    marketplaceFeePct: product?.owner_type === 'vendor' ? settings?.marketplace_fee_pct : 0,
    minProfit: settings?.min_profit_per_unit,
  })
  const floor = n(settings?.price_floor_margin_pct ?? 10)
  return { ...u, units: d.units, normalValue: d.normalValue, savings: d.savings, belowFloor: u.netMargin < floor, floor, light: light(u.netMargin, u.netProfit, settings) }
}

// How far you can go on an offer before it stops being worth doing.
// Everything an offer can give away is measured against the same floor.
export function offerLimits(product, settings) {
  const price = n(product?.price)
  const floor = n(settings?.price_floor_margin_pct ?? 10)
  const minProfit = n(settings?.min_profit_per_unit ?? 0)
  if (price <= 0) return { maxDiscountPct: 0, maxDiscountAmount: 0, safeFreeQty: 0, floorPrice: price, price }

  // Lowest price for one unit that still clears the floor and the minimum profit.
  const at = (p) => offerEconomics('percent_off', { discountPct: price > 0 ? ((price - p) / price) * 100 : 0 }, product, settings)
  let lo = 0, hi = price
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const e = at(mid)
    if (e.netMargin >= floor && e.netProfit >= minProfit) hi = mid; else lo = mid
  }
  const floorPrice = r2(hi)
  const maxDiscountPct = Math.max(0, Math.floor(((price - floorPrice) / price) * 100))
  // Buy X get Y: the free units must still leave the deal above the floor.
  let safeFreeQty = 0
  for (let buy = 2; buy <= 6 && safeFreeQty === 0; buy++) {
    for (let free = 3; free >= 1; free--) {
      const e = offerEconomics('buy_x_get_y', { buyQty: buy, freeQty: free }, product, settings)
      if (e.netMargin >= floor && e.netProfit >= minProfit) { safeFreeQty = free; return { maxDiscountPct, maxDiscountAmount: r2(price - floorPrice), floorPrice, price, safeBuyQty: buy, safeFreeQty: free } }
    }
  }
  return { maxDiscountPct, maxDiscountAmount: r2(price - floorPrice), floorPrice, price, safeBuyQty: 0, safeFreeQty: 0 }
}

// Build offers that are profitable by construction, trimmed to what this product can carry.
export function safeOfferIdeas(product, settings) {
  const price = n(product?.price)
  const lim = offerLimits(product, settings)
  const round5 = (v) => Math.max(5, Math.round(v / 5) * 5)
  const ideas = []
  const ok = (type, config) => {
    const e = offerEconomics(type, config, product, settings)
    return e.netProfit > 0 && !e.belowFloor
  }

  if (lim.safeFreeQty > 0) {
    ideas.push({ type: 'buy_x_get_y', category: 'attraction', config: { buyQty: lim.safeBuyQty, freeQty: lim.safeFreeQty },
      name: `Buy ${lim.safeBuyQty}, get ${lim.safeFreeQty} free`, why: `The most you can give free here. Sells ${lim.safeBuyQty + lim.safeFreeQty} at once.` })
  }
  if (lim.maxDiscountPct >= 5) {
    const pct = Math.min(20, Math.max(5, Math.floor(lim.maxDiscountPct / 5) * 5))
    ideas.push({ type: 'percent_off', category: 'attraction', config: { discountPct: pct }, name: `${pct}% off`, why: `You can afford up to ${lim.maxDiscountPct}% on this one.` })
    const amount = round5(Math.min(lim.maxDiscountAmount, price * 0.15))
    if (amount >= 5 && ok('fixed_off', { discountAmount: amount })) {
      ideas.push({ type: 'fixed_off', category: 'attraction', config: { discountAmount: amount }, name: `${amount} kwacha off`, why: 'A kwacha amount often feels bigger than a percentage.' })
    }
  }
  const bundleQty = 3
  const bundlePrice = Math.max(lim.floorPrice * bundleQty, Math.round(price * 2.7))
  if (ok('bundle', { buyQty: bundleQty, bundlePrice })) {
    ideas.push({ type: 'bundle', category: 'attraction', config: { buyQty: bundleQty, bundlePrice: Math.round(bundlePrice) }, name: `3 for one price`, why: 'Raises how much each customer spends in one go.' })
  }
  const minSpend = Math.max(100, Math.round((price * 2) / 50) * 50)
  if (ok('free_delivery', { minSpend })) {
    ideas.push({ type: 'free_delivery', category: 'attraction', config: { minSpend }, name: `Free delivery over ${minSpend}`, why: 'Pushes people to add another item instead of cutting your price.' })
  }
  const giftCost = round5(Math.min(lim.maxDiscountAmount, price * 0.05))
  if (giftCost >= 5 && ok('free_gift', { giftName: 'a small gift', giftCost })) {
    ideas.push({ type: 'free_gift', category: 'attraction', config: { giftName: 'a small gift', giftCost }, name: 'Free gift with every order', why: 'Adds value without lowering the price they see.' })
  }
  const bump = Math.max(lim.floorPrice, Math.round(price * 0.85))
  if (ok('order_bump', { bumpPrice: bump })) {
    ideas.push({ type: 'order_bump', category: 'upsell', config: { bumpPrice: Math.round(bump) }, name: `Add another at ${Math.round(bump)}`, why: 'Offered at checkout, once they have already decided.' })
  }
  if (lim.maxDiscountPct >= 10) {
    const d = Math.min(15, lim.maxDiscountPct)
    ideas.push({ type: 'downsell', category: 'downsell', config: { discountPct: d }, name: `Wait — ${d}% off`, why: 'Shown only when someone removes it from their cart.' })
    ideas.push({ type: 'continuity', category: 'continuity', config: { discountPct: Math.min(10, lim.maxDiscountPct), cycleDays: 30 }, name: 'Monthly repeat order', why: 'For things people buy again and again.' })
  }
  return { ideas, limits: lim }
}

// Vendor sale split (spec §20)
export function vendorSplit(gross, vendorFeePct, commission, settings) {
  const fee = r2((n(gross) * n(vendorFeePct)) / 100)
  const onTop = settings?.commission_source === 'on_top'
  const vendorPayable = r2(n(gross) - fee - (onTop ? n(commission) : 0))
  const marketplace = r2(fee - (onTop ? 0 : n(commission)))
  return { fee, vendorPayable, reseller: n(commission), marketplace }
}

// ---------- Simple pricing for "I bought goods" ----------
// Round to prices people actually use: K1 under K100, K5 under K1,000, K10 above.
export function nicePrice(x) {
  if (!(x > 0)) return 0
  const step = x < 100 ? 1 : x < 1000 ? 5 : 10
  return Math.ceil(x / step) * step
}

// Prices from a profit target ON TOP OF COST (markup). 50% on a K1,100 cost = K1,650.
// cost = what one unit cost to buy and bring here + what you spend each time you sell one.
export function pricing({ unitCost, perSale = 0, commissionType = 'pct', commissionValue = 0, paymentFeePct = 0, targetMarkup = 50 }) {
  const cost = r2(n(unitCost) + n(perSale))
  const m = n(targetMarkup) / 100
  const fee = n(paymentFeePct) / 100
  const cut = commissionType === 'pct' ? n(commissionValue) / 100 : 0
  const flat = commissionType === 'flat' ? n(commissionValue) : 0
  const goal = cost * (1 + m)
  const youExact = 1 - fee > 0 ? goal / (1 - fee) : 0
  const resellerExact = commissionType === 'flat' ? (1 - fee > 0 ? (goal + flat) / (1 - fee) : 0) : (1 - fee - cut > 0 ? goal / (1 - fee - cut) : 0)
  const keep = (price) => {
    const pr = n(price)
    const paymentFee = r2((pr * n(paymentFeePct)) / 100)
    const commission = commissionType === 'flat' ? flat : r2(pr * cut)
    const you = r2(pr - cost - paymentFee)
    const withReseller = r2(you - commission)
    return { you, withReseller, commission, paymentFee, onCostYou: cost > 0 ? r2((you / cost) * 100) : 0, onCostReseller: cost > 0 ? r2((withReseller / cost) * 100) : 0 }
  }
  return {
    cost, targetMarkup: n(targetMarkup), keep,
    minYou: { exact: r2(youExact), price: nicePrice(youExact) },
    minReseller: { exact: r2(resellerExact), price: nicePrice(resellerExact) },
  }
}
