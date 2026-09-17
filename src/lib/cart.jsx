import { createContext, useContext, useEffect, useState } from 'react'

const Ctx = createContext(null)
const KEY = 'zm-cart'

// A cart line is either a plain product (qty = units) or an offer deal (qty = number of deals).
// Prices here are for display; the database recalculates everything when the order is placed.
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]').map((i) => ({ units: 1, ...i, key: i.key || i.id }))
  } catch { return [] }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load)
  // Who gets credit: the last link the customer arrived through (reseller /r/..., store /store-name, campaign /go/...), kept 30 days.
  const readTouch = () => {
    try {
      const t = JSON.parse(localStorage.getItem('zm-touch') || 'null')
      if (t && Date.now() - t.at < 30 * 864e5) return t
    } catch { /* ignore */ }
    const legacy = localStorage.getItem('zm-ref')
    return legacy ? { type: 'reseller', code: legacy, at: Date.now() } : null
  }
  const [touch, setTouchState] = useState(readTouch)
  const setTouch = (t) => { const v = { ...t, at: Date.now() }; localStorage.setItem('zm-touch', JSON.stringify(v)); localStorage.removeItem('zm-ref'); setTouchState(v) }
  const ref = touch?.type === 'reseller' ? touch.code : ''
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)) }, [items])

  // offer: a public_offers row (optional); extra: { choices: {Flavour: 'Vanilla'}, note: 'Happy birthday' }
  const add = (product, qty = 1, offer = null, extra = {}) => setItems((cur) => {
    const choices = extra.choices || {}
    const note = (extra.note || '').trim()
    const pkg = extra.package || null
    const detail = Object.keys(choices).length || note ? `:${JSON.stringify(choices)}:${note}` : ''
    const key = (offer ? `${product.id}:${offer.id}` : product.id) + (pkg ? `:pkg:${pkg.id}` : '') + detail
    const i = cur.findIndex((x) => x.key === key)
    if (i >= 0) return cur.map((x, k) => (k === i ? { ...x, qty: x.qty + qty } : x))
    const line = {
      key, id: product.id, name: product.name, image: product.images?.[0] || null, qty,
      price: Number(product.price), units: 1, normalValue: Number(product.normal_price || product.price),
      choices, note,
      fulfilment: product.fulfilment || 'in_stock', lead_time_days: product.lead_time_days || 0, order_days: product.order_days || null,
      time_slots: product.time_slots || null, service_location: product.service_location || null, duration_text: product.duration_text || null,
      vendor_name: product.vendor_name || null,
    }
    if (pkg) Object.assign(line, { package_id: pkg.id, package_name: pkg.name, name: `${product.name} — ${pkg.name}`, price: Number(pkg.price), normalValue: Number(pkg.normal_price || pkg.price) })
    if (offer) {
      Object.assign(line, {
        offer_id: offer.id, offer_name: offer.name, offer_type: offer.type,
        min_spend: offer.config?.minSpend != null ? Number(offer.config.minSpend) : null,
        remaining: offer.remaining,
      })
      if (offer.deal_price != null) Object.assign(line, { price: Number(offer.deal_price), units: offer.units || 1, normalValue: Number(offer.normal_value) })
    }
    return [...cur, line]
  })
  const setChoice = (key, name, value) => setItems((cur) => cur.map((x) => (x.key === key ? { ...x, choices: { ...(x.choices || {}), [name]: value } } : x)))
  const setQty = (key, qty) => setItems((cur) => (qty <= 0 ? cur.filter((x) => x.key !== key) : cur.map((x) => (x.key === key ? { ...x, qty } : x))))
  const clear = () => setItems([])
  const setRef = (code) => setTouch({ type: 'reseller', code })
  const setStoreRef = (slug) => { if (!(touch?.type === 'campaign' && touch.store === slug)) setTouch({ type: 'store', code: slug }) }
  const setCampaign = (code, store) => setTouch({ type: 'campaign', code, store: store || null })
  const setInvite = (code) => setTouch({ type: 'invite', code })
  const attribution = () => ({
    referral_code: touch?.type === 'reseller' ? touch.code : null,
    store_ref: touch?.type === 'store' ? touch.code : null,
    campaign_code: touch?.type === 'campaign' ? touch.code : null,
    invite_code: touch?.type === 'invite' ? touch.code : null,
    source: touch?.type === 'reseller' ? `reseller:${touch.code}` : touch?.type === 'store' ? `vendor:${touch.code}` : touch?.type === 'campaign' ? `campaign:${touch.code}` : touch?.type === 'invite' ? `referral:${touch.code}` : 'organic',
  })
  const count = items.reduce((s, x) => s + x.qty * (x.units || 1), 0)
  const subtotal = items.reduce((s, x) => s + x.qty * x.price, 0)
  const savings = items.reduce((s, x) => s + x.qty * Math.max(0, (x.normalValue || x.price) - x.price), 0)
  const payload = () => items.map((x) => ({
    ...(x.offer_id ? { product_id: x.id, offer_id: x.offer_id, deals: x.qty } : { product_id: x.id, quantity: x.qty }),
    ...(x.package_id ? { package_id: x.package_id } : {}),
    ...(x.choices && Object.keys(x.choices).length ? { choices: x.choices } : {}),
    ...(x.note ? { note: x.note } : {}),
  }))
  const madeToOrder = items.filter((x) => x.fulfilment === 'made_to_order' || x.fulfilment === 'service')
  const needsAddress = items.some((x) => x.fulfilment !== 'service' || x.service_location === 'at_customer')
  const needsDelivery = items.some((x) => x.fulfilment !== 'service')
  return <Ctx.Provider value={{ items, add, setQty, clear, count, subtotal, savings, payload, madeToOrder, needsAddress, needsDelivery, setChoice, ref, setRef, touch, setStoreRef, setCampaign, setInvite, attribution }}>{children}</Ctx.Provider>
}

export const useCart = () => useContext(Ctx)
