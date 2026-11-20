import { ORDER_NEXT } from './statuses.js'

// The database only allows one step at a time (paid → processing → out for
// delivery). The buttons jump to where the order actually is, so walk the
// shortest allowed path and record each step. Never passes through
// cancelled, refunded, returned, failed delivery or fraud review on the way.
const DETOURS = new Set(['cancelled', 'refunded', 'returned', 'failed_delivery', 'fraud_review', 'customer_unreachable', 'pending'])

export function orderPath(from, to) {
  if (from === to) return []
  const prev = { [from]: null }
  const queue = [from]
  while (queue.length) {
    const s = queue.shift()
    for (const t of ORDER_NEXT[s] || []) {
      if (t in prev) continue
      if (t !== to && DETOURS.has(t)) continue
      prev[t] = s
      if (t === to) {
        const path = [t]
        for (let p = s; p !== from; p = prev[p]) path.unshift(p)
        return path
      }
      queue.push(t)
    }
  }
  return null
}

// rpc: supabase client. Reads the order's current status, then steps through.
export async function moveOrderTo(supabase, orderId, to, reason = null) {
  const { data, error } = await supabase.from('orders').select('status').eq('id', orderId).single()
  if (error) return { error }
  const path = orderPath(data.status, to)
  if (!path) return { error: { message: `This order is ${data.status.replace(/_/g, ' ')} and can't go to ${to.replace(/_/g, ' ')}.` } }
  for (const step of path) {
    const { error: e } = await supabase.rpc('set_order_status', { p_order: orderId, p_status: step, p_reason: step === to ? reason : null })
    if (e) return { error: e }
  }
  return { error: null, path }
}
