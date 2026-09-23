import { createContext, useContext, useEffect, useMemo, useState } from 'react'

// "My list" — things a customer wants to come back to. Kept on their own phone,
// so it works without an account and nothing personal leaves the device.
const KEY = 'zamarket-saved'
const Ctx = createContext(null)

export function SavedProvider({ children }) {
  const [ids, setIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
  })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* private mode */ } }, [ids])

  const value = useMemo(() => ({
    ids,
    count: ids.length,
    has: (id) => ids.includes(id),
    toggle: (id) => setIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [id, ...list].slice(0, 200))),
    clear: () => setIds([]),
  }), [ids])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useSaved = () => useContext(Ctx) || { ids: [], count: 0, has: () => false, toggle: () => {}, clear: () => {} }
