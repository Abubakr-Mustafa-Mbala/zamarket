import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { departmentsFrom, DEFAULT_DEPARTMENTS } from './categories'

let cache = null
let shopCache = null

// Delivery wording customers see, taken from Settings.
export function useShopInfo() {
  const [info, setInfo] = useState(shopCache || { deliveryIncluded: false, localFee: 30 })
  useEffect(() => {
    if (shopCache) return
    supabase.from('settings').select('key,value').in('key', ['delivery_included', 'local_delivery_fee']).then(({ data }) => {
      const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]))
      shopCache = { deliveryIncluded: m.delivery_included === true || m.delivery_included === 'true', localFee: Number(m.local_delivery_fee ?? 30) }
      setInfo(shopCache)
    })
  }, [])
  return info
}
// Departments are set by the founders in Settings; shoppers read them too.
export function useDepartments() {
  const [list, setList] = useState(cache || departmentsFrom(null))
  useEffect(() => {
    if (cache) return
    supabase.from('settings').select('value').eq('key', 'departments').maybeSingle().then(({ data }) => {
      cache = departmentsFrom({ departments: data?.value })
      setList(cache)
    })
  }, [])
  return list
}
export { DEFAULT_DEPARTMENTS }
