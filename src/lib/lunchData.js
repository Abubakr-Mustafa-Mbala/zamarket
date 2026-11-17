import { supabase } from './supabase'

// A lunch plan's dishes: ordinary shop products and lunch-only dishes (which
// the shop never lists). Both come back in one list.
export async function loadDealDishes(deal) {
  const ids = (deal?.dishes || []).map((d) => d.product_id)
  if (!ids.length) return []
  const [shop, lunch] = await Promise.all([
    supabase.from('public_products').select('*').in('id', ids),
    supabase.from('public_lunch_dishes').select('*').in('id', ids),
  ])
  const seen = new Set()
  return [...(shop.data || []), ...(lunch.data || [])].filter((p) => (seen.has(p.id) ? false : seen.add(p.id)))
}
