import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)

// Stable session handling: we never redirect until the initial session check has finished,
// and the profile is loaded before role-gated routes render. This is what prevents the
// "logs in then bounces back to login" bug.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const profileId = useRef(null)
  const [advanced, setAdvancedState] = useState(() => localStorage.getItem('zm-advanced') === '1')

  const loadProfile = useCallback(async (userId) => {
    profileId.current = userId || null
    if (!userId) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(data || null)
    if (data && ['vendor', 'reseller'].includes(data.role)) {
      const table = data.role === 'vendor' ? 'vendors' : 'resellers'
      const { data: p } = await supabase.from(table).select('*').eq('user_id', userId).maybeSingle()
      setProfile({ ...data, partner: p })
    }
  }, [])

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('settings').select('key,value')
    if (data) setSettings(Object.fromEntries(data.map((s) => [s.key, s.value])))
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      await loadProfile(data.session?.user?.id)
      if (data.session) await loadSettings()
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!alive) return
      setSession(s)
      if (event === 'SIGNED_IN' && s?.user?.id !== profileId.current) {
        // A new user just signed in: hold route guards until their profile is loaded.
        setLoading(true)
        await loadProfile(s?.user?.id)
        await loadSettings()
        setLoading(false)
      } else if (event === 'USER_UPDATED') {
        await loadProfile(s?.user?.id)
      }
      if (event === 'SIGNED_OUT') { profileId.current = null; setProfile(null); setSettings({}) }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [loadProfile, loadSettings])

  const setAdvanced = (v) => { localStorage.setItem('zm-advanced', v ? '1' : '0'); setAdvancedState(v) }
  const signOut = () => supabase.auth.signOut()
  const refresh = () => Promise.all([loadProfile(session?.user?.id), loadSettings()])

  const role = profile?.role || null
  const isStaff = ['founder', 'ops', 'finance', 'delivery'].includes(role)
  const isFounder = role === 'founder'

  return (
    <Ctx.Provider value={{ session, user: session?.user || null, profile, role, isStaff, isFounder, settings, loading, advanced, setAdvanced, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
