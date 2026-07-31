import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabase'
import { hydrateCredits } from './creditStore'
import { userEmail } from './adminAccess'
import { clearAgentCache } from './agents/agentStore'

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
const PROFILE_TIMEOUT_MS = 10_000

function clearUserArtifacts() {
  try {
    for (const key of ['alphatekx:connected-platforms', 'alphatekx:running-automation', 'alphatekx:mature-wizard', 'alphatekx:mature-wizard-done']) {
      localStorage.removeItem(key)
    }
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith('alphatekx:connected-platforms:')) localStorage.removeItem(key)
    }
  } catch {}
  clearAgentCache()
}

function readLocalUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LocalUser
  } catch { return null }
}

async function withTimeout<T>(work: Promise<T>, label: string, timeoutMs = PROFILE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} took too long. Please refresh and try again.`)), timeoutMs)
  })
  try { return await Promise.race([work, timeout]) }
  finally { if (timer) clearTimeout(timer) }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [localUser, setLocalUser] = useState<LocalUser | null>(readLocalUser())
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = async () => {
    if (!supabase) return
    try {
      const { data: auth } = await withTimeout(supabase.auth.getUser(), 'Authentication check')
      if (!auth.user) { setProfile(null); return }
      const email = userEmail(auth.user)
      const fallback: Profile = {
        id: auth.user.id,
        email,
        credits: 0,
        plan: 'free',
        revenue: 0,
        display_name: String(auth.user.user_metadata?.name || auth.user.user_metadata?.full_name || email.split('@')[0] || 'AlphaTekx user'),
      }
      let { data } = await withTimeout(
        supabase.from('profiles').select('id,email,credits,plan,revenue,display_name').eq('id', auth.user.id).maybeSingle(),
        'Profile load'
      )
      if (!data) {
        await withTimeout(supabase.rpc('ensure_user_profile'), 'Profile setup')
        data = (await withTimeout(
          supabase.from('profiles').select('id,email,credits,plan,revenue,display_name').eq('id', auth.user.id).maybeSingle(),
          'Profile reload'
        )).data
      }
      let nextProfile = (data || fallback) as Profile
      const balance = await hydrateCredits().catch(() => Number.NaN)
      if (Number.isFinite(balance)) nextProfile = { ...nextProfile, credits: balance }
      setProfile(nextProfile)
    } catch (error) {
      console.warn('[AlphaTekx] profile refresh failed:', error)
      const current = session?.user
      if (current) setProfile({ id: current.id, email: userEmail(current), credits: 0, plan: 'free', revenue: 0 })
    }
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => {
      const currentUserId = session?.user?.id ?? null
      if (data.session?.user?.id && currentUserId && data.session.user.id !== currentUserId) {
        clearUserArtifacts()
      }
      setSession(data.session)
      setLoading(false)
      if (data.session) {
        localStorage.removeItem(LOCAL_USER_KEY)
        setLocalUser(null)
        void refreshProfile()
      }
    }).catch(error => {
      console.warn('[AlphaTekx] session restore failed:', error)
      setSession(null)
      setProfile(null)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      const changedUser = Boolean(session?.user?.id && next?.user?.id && session.user.id !== next.user.id)
      if (!next || changedUser) clearUserArtifacts()
      setSession(next)
      setLoading(false)
      if (next) {
        localStorage.removeItem(LOCAL_USER_KEY)
        setLocalUser(null)
        void refreshProfile()
      } else {
        clearUserArtifacts()
        setProfile(null)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [session?.user?.id])

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
    try { await supabase?.auth.signOut() } catch {}
    clearUserArtifacts()
    localStorage.removeItem(LOCAL_USER_KEY)
    setSession(null)
    setLocalUser(null)
    setProfile(null)
  }

  const value = useMemo<AuthValue>(() => ({ session, user, profile, loading, configured: isSupabaseConfigured, refreshProfile, signOut, localSignIn }), [session, user, profile, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
