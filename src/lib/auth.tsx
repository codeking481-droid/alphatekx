import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabase'

type Profile = { id: string; email: string; credits: number; plan: string; revenue: number; display_name?: string }
type AuthValue = { session: Session | null; user: User | null; profile: Profile | null; loading: boolean; configured: boolean; refreshProfile: () => Promise<void>; signOut: () => Promise<void> }
const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = async () => {
    if (!supabase) return
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setProfile(null); return }
    let { data } = await supabase.from('profiles').select('id,email,credits,plan,revenue,display_name').eq('id', auth.user.id).maybeSingle()
    if (!data) {
      await supabase.rpc('ensure_user_profile')
      data = (await supabase.from('profiles').select('id,email,credits,plan,revenue,display_name').eq('id', auth.user.id).maybeSingle()).data
    }
    if (data) setProfile(data as Profile)
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); if (data.session) void refreshProfile() })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (next) void refreshProfile(); else setProfile(null) })
    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthValue>(() => ({ session, user: session?.user ?? null, profile, loading, configured: isSupabaseConfigured, refreshProfile, signOut: async () => { await supabase?.auth.signOut() } }), [session, profile, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
