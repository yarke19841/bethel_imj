import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthCtx = createContext()
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function loadProfile() {
      if (!session) { setProfile(null); setLoading(false); return }
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (!error) setProfile(data)
      setLoading(false)
    }
    loadProfile()
  }, [session])

  const logout = async () => {
    const { error } = await supabase.auth.signOut() // o { scope: 'global' }
    if (error) throw error
    setSession(null)
    setProfile(null)
  }

  return (
    <AuthCtx.Provider value={{ session, profile, loading, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}
