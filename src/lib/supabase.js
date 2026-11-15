import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configured = Boolean(url && key)

// When a phone sleeps or the tab sits in the background, the sign-in pass
// (an access token that lasts about an hour) can expire before it is renewed,
// and the next save fails with "JWT expired". This wrapper renews the pass
// and repeats the request once, so the person never sees that error.
let renewing = null
async function renewedToken() {
  if (!renewing) {
    renewing = supabase.auth.refreshSession()
      .then(({ data }) => data?.session?.access_token || null)
      .catch(() => null)
      .finally(() => { setTimeout(() => { renewing = null }, 0) })
  }
  return renewing
}

async function fetchWithRenewal(input, init = {}) {
  const res = await fetch(input, init)
  if (res.status !== 401) return res
  const target = typeof input === 'string' ? input : input?.url || ''
  if (target.includes('/auth/v1/')) return res
  let expired = false
  try { expired = /jwt expired|token is expired|invalid jwt/i.test(await res.clone().text()) } catch { expired = false }
  if (!expired) return res
  const token = await renewedToken()
  if (!token) return res
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined))
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder', {
  global: { fetch: (...args) => fetchWithRenewal(...args) },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'zamarket-auth',
  },
})

// Throws on error so callers can use try/catch.
export async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}
