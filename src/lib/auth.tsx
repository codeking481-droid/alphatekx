import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabase'
import { hydrateCredits } from './creditStore'

type LocalUser = { id: string; email: string; name?: string }
type AuthUser = User | LocalUser

type Profile = { id: string; email: string; credits: number; plan: string; revenue: number; display_name?: string }
type AuthValue = {
  session: Session | null
  user: AuthUser | null
  profile: Profile | null
  loading: boolean
  configured: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
  localSignIn: (name: string, email: string) => Promise<void>
}
const AuthContext = createContext<AuthValue | null>(null)

const LOCAL_USER_KEY = 'alphatekx:local-user'

function readLocalUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LocalUser
  } catch { return null }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [localUser, setLocalUser] = useState<LocalUser | null>(readLocalUser())
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
    if (data) {
      const balance = await hydrateCredits()
      if (Number.isFinite(balance)) data = { ...data, credits: balance }
      setProfile(data as Profile)
    }
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); if (data.session) void refreshProfile() })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (next) void refreshProfile(); else setProfile(null) })
    return () => data.subscription.unsubscribe()
  }, [])

  const user: AuthUser | null = useMemo(() => {
    return session?.user ?? localUser
  }, [session, localUser])

  const localSignIn = async (name: string, email: string) => {
    const normalizedEmail = email.trim().toLowerCase()
    const existing = readLocalUser()
    const value: LocalUser = { id: (existing?.email === normalizedEmail ? existing.id : crypto.randomUUID()), email: normalizedEmail, name: name.trim() }
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(value))
    setLocalUser(value)
  }

  const signOut = async () => {
    await supabase?.auth.signOut()
    localStorage.removeItem(LOCAL_USER_KEY)
    setLocalUser(null)
  }

  const value = useMemo<AuthValue>(() => ({ session, user, profile, loading, configured: isSupabaseConfigured, refreshProfile, signOut, localSignIn }), [session, user, profile, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
