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
  const [ref, setRefState] = useState(() => localStorage.getItem('zm-ref') || '')
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)) }, [items])

  // offer: a public_offers row (optional)
  const add = (product, qty = 1, offer = null) => setItems((cur) => {
    const key = offer ? `${product.id}:${offer.id}` : product.id
    const i = cur.findIndex((x) => x.key === key)
    if (i >= 0) return cur.map((x, k) => (k === i ? { ...x, qty: x.qty + qty } : x))
    const line = {
      key, id: product.id, name: product.name, image: product.images?.[0] || null, qty,
      price: Number(product.price), units: 1, normalValue: Number(product.normal_price || product.price),
    }
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
  const setQty = (key, qty) => setItems((cur) => (qty <= 0 ? cur.filter((x) => x.key !== key) : cur.map((x) => (x.key === key ? { ...x, qty } : x))))
  const clear = () => setItems([])
  const setRef = (code) => { localStorage.setItem('zm-ref', code); setRefState(code) }
  const count = items.reduce((s, x) => s + x.qty * (x.units || 1), 0)
  const subtotal = items.reduce((s, x) => s + x.qty * x.price, 0)
  const savings = items.reduce((s, x) => s + x.qty * Math.max(0, (x.normalValue || x.price) - x.price), 0)
  const payload = () => items.map((x) => (x.offer_id ? { product_id: x.id, offer_id: x.offer_id, deals: x.qty } : { product_id: x.id, quantity: x.qty }))
  return <Ctx.Provider value={{ items, add, setQty, clear, count, subtotal, savings, payload, ref, setRef }}>{children}</Ctx.Provider>
}

export const useCart = () => useContext(Ctx)
