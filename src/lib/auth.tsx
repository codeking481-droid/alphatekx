import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabase'
import { hydrateCredits } from './creditStore'
import { userEmail } from './adminAccess'
import { clearAgentCache } from './agents/agentStore'
import { startPayment } from './paystack'

type LocalUser = { id: string; email: string; name?: string }
type AuthUser = User | LocalUser

type Profile = { id: string; email: string; credits: number; plan: string; revenue: number; display_name?: string }
type ProfileRow = {
  id: string
  email: string
  credits: number
  plan: string
  revenue: number
  display_name?: string | null
}
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
const CURRENT_USER_KEY = 'alphatekx:current-user-id'
const PROFILE_TIMEOUT_MS = 10_000

function clearUserArtifacts() {
  try {
    for (const key of ['alphatekx:connected-platforms', 'alphatekx:running-automation', 'alphatekx:mature-wizard', 'alphatekx:mature-wizard-done', CURRENT_USER_KEY]) {
      localStorage.removeItem(key)
    }
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith('alphatekx:connected-platforms:')) localStorage.removeItem(key)
    }
  } catch {}
  clearAgentCache()
}

const DEVICE_ID_KEY = 'deviceId'
const GOOGLE_SIGNUP_PENDING_KEY = 'alphatekx:pending-google-signup'
const GOOGLE_SIGNUP_PLAN_KEY = 'alphatekx:pending-google-signup-plan'
const GOOGLE_SIGNUP_PENDING_TTL_MS = 10 * 60 * 1000
const GOOGLE_SIGNUP_STATE_EVENT = 'alphatekx:google-signup-state'
let googleSignupLaunchInFlight = false
let googleSignupCompletionInFlight = false

export function isGoogleSignupPending() {
  try {
    const value = localStorage.getItem(GOOGLE_SIGNUP_PENDING_KEY)
    if (!value) return false
    const startedAt = Number(value)
    if (!Number.isFinite(startedAt) || Date.now() - startedAt > GOOGLE_SIGNUP_PENDING_TTL_MS) {
      clearGoogleSignupPending()
      return false
    }
    return true
  } catch {
    return false
  }
}

export function clearGoogleSignupPending() {
  try {
    localStorage.removeItem(GOOGLE_SIGNUP_PENDING_KEY)
    localStorage.removeItem(GOOGLE_SIGNUP_PLAN_KEY)
  } catch {}
  googleSignupLaunchInFlight = false
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GOOGLE_SIGNUP_STATE_EVENT))
}

export const googleSignupStateEvent = GOOGLE_SIGNUP_STATE_EVENT

function getOrCreateDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  const generated = btoa(`${navigator.userAgent}${screen.width}x${screen.height}${Date.now()}`)
  localStorage.setItem(DEVICE_ID_KEY, generated)
  return generated
}

export async function instantGoogleSignup(plan?: string) {
  if (!supabase) throw new Error('Google signup is not available.')
  if (googleSignupLaunchInFlight) throw new Error('Google signup is already in progress.')
  googleSignupLaunchInFlight = true

  try {
    localStorage.setItem(GOOGLE_SIGNUP_PENDING_KEY, String(Date.now()))
    if (plan) localStorage.setItem(GOOGLE_SIGNUP_PLAN_KEY, plan)
  } catch {
    // ignore localStorage failures
  }

  // Return directly to the chat workspace. The /chat route loads the AuthProvider
  // inline, so it must receive the OAuth callback hash fragment before any
  // redirect strips it. /dashboard immediately redirects to /chat which would
  // lose the fragment tokens, so we target /chat directly.
  const redirectTo = `${window.location.origin}/chat?oauth=google`
  let data
  try {
    const result = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (result.error) throw result.error
    data = result.data
  } catch (error) {
    clearGoogleSignupPending()
    throw error
  }

  if (!data?.url) {
    clearGoogleSignupPending()
    throw new Error('Google did not return a sign-in URL.')
  }

  // Complete PKCE in the same tab that created the verifier. A separate tab
  // can lose that verifier and return "OAuth state not found or expired".
  window.location.assign(data.url)
}

export async function completeInstantGoogleSignup(session: Session | null) {
  if (!supabase || !session?.access_token || !session.user) return
  const pending = localStorage.getItem(GOOGLE_SIGNUP_PENDING_KEY)
  if (!pending || googleSignupCompletionInFlight) return

  googleSignupCompletionInFlight = true
  const plan = localStorage.getItem(GOOGLE_SIGNUP_PLAN_KEY)

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12_000)

  try {
    const deviceId = getOrCreateDeviceId()
    const fingerprint = `${navigator.userAgent}${screen.width}x${screen.height}${Intl.DateTimeFormat().resolvedOptions().timeZone}`
    const response = await fetch('/api/verify-bonus', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email: session.user.email || '',
        uid: session.user.id,
        deviceId,
        fingerprint,
      }),
    })

    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(String(body.error || 'Google signup verification failed.'))
    }

    // Clear pending state only after successful verify
    clearGoogleSignupPending()

    if (plan === 'early_founder_19') {
      await startPayment(19, 'early_founder_19')
      return
    }
  } catch {
    // Even if verify fails, clear pending state — the user IS authenticated.
    // The bonus provisioning is non-critical.
    clearGoogleSignupPending()
  } finally {
    window.clearTimeout(timeout)
    googleSignupCompletionInFlight = false
  }
}

function readLocalUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LocalUser
  } catch { return null }
}

async function recoverOAuthSessionFromFragment(): Promise<Session | null> {
  if (!supabase || typeof window === 'undefined' || !window.location.hash.includes('access_token=')) return null
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const accessToken = fragment.get('access_token')
  const refreshToken = fragment.get('refresh_token')
  if (!accessToken || !refreshToken) return null

  const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (error) throw error
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`)
  return data.session
}

async function withTimeout<T>(work: PromiseLike<T>, label: string, timeoutMs = PROFILE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} took too long. Please refresh and try again.`)), timeoutMs)
  })
  try { return await Promise.race([Promise.resolve(work), timeout]) }
  finally { if (timer) clearTimeout(timer) }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [localUser, setLocalUser] = useState<LocalUser | null>(readLocalUser())
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const activeUserId = useRef<string | null>(null)

  const refreshProfile = useCallback(async () => {
    if (!supabase) return
    let authUser: User | null = null
    try {
      const { data: auth } = await withTimeout(supabase.auth.getUser(), 'Authentication check')
      authUser = auth.user
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
      let profileRow: ProfileRow | null = null
      const profileQuery = supabase.from('profiles').select('id,email,credits,plan,revenue,display_name').eq('id', auth.user.id).maybeSingle<ProfileRow>()
      const profileResponse = await withTimeout(profileQuery, 'Profile load')
      profileRow = profileResponse.data
      if (!profileRow) {
        await withTimeout(supabase.rpc('ensure_user_profile'), 'Profile setup')
        const reloadResponse = await withTimeout(
          supabase.from('profiles').select('id,email,credits,plan,revenue,display_name').eq('id', auth.user.id).maybeSingle<ProfileRow>(),
          'Profile reload'
        )
        profileRow = reloadResponse.data
      }
      let nextProfile = (profileRow || fallback) as Profile
      try {
        const billingResponse = await fetch('/api/billing', { headers: { Authorization: `Bearer ${authUser.access_token ?? ''}` } })
        if (billingResponse.ok) {
          const billing = await billingResponse.json().catch(() => null)
          if (billing && typeof billing.plan === 'string' && billing.plan.trim()) {
            nextProfile = { ...nextProfile, plan: billing.plan, credits: Number(billing.credits ?? nextProfile.credits) }
            try { localStorage.setItem('alphatekx_plan', billing.plan) } catch {}
          }
        }
      } catch {}
      const balance = await hydrateCredits().catch(() => Number.NaN)
      if (Number.isFinite(balance)) nextProfile = { ...nextProfile, credits: balance }
      setProfile(nextProfile)
    } catch (error) {
      console.warn('[AlphaTekx] profile refresh failed:', error)
      // Authentication succeeded even if a profile migration or transient database
      // request failed. Keep the user signed in and preserve any profile already read.
      if (authUser) {
        setProfile(current => current || { id: authUser!.id, email: userEmail(authUser), credits: 0, plan: 'free', revenue: 0 })
      }
    }
  }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let restoreComplete = false

    const restoreSession = async () => {
      let restored: Session | null = null

      // Step 1: Try recovering from OAuth redirect fragment (implicit flow)
      try {
        restored = await recoverOAuthSessionFromFragment()
      } catch (err) {
        console.warn('[AlphaTekx] fragment recovery failed:', err)
      }

      // Step 2: Try getting existing session from localStorage (PKCE / persisted)
      if (!restored) {
        try {
          restored = (await supabase.auth.getSession()).data.session
        } catch (err) {
          console.warn('[AlphaTekx] getSession failed:', err)
        }
      }

      // Step 3: Retry once after a short delay — onAuthStateChange may not have
      // fired yet, or the Supabase client may still be initializing.
      if (!restored) {
        await new Promise(r => setTimeout(r, 800))
        try {
          restored = (await supabase.auth.getSession()).data.session
        } catch (err) {
          console.warn('[AlphaTekx] session retry failed:', err)
        }
      }

      // Step 4: One more retry at 2s — some mobile browsers need extra time
      if (!restored && isGoogleSignupPending()) {
        await new Promise(r => setTimeout(r, 1200))
        try {
          restored = (await supabase.auth.getSession()).data.session
        } catch (err) {
          console.warn('[AlphaTekx] final session retry failed:', err)
        }
      }

      // Proactive token refresh: if the access token is expired or near-expiry,
      // refresh it immediately so subsequent API calls don't fail with 401.
      if (restored?.access_token) {
        const expiresIn = (restored.expires_at ?? 0) * 1000 - Date.now()
        if (expiresIn < 300_000) {
          try {
            const { data: refreshed } = await supabase.auth.refreshSession()
            if (refreshed.session) {
              restored = refreshed.session
            }
          } catch (err) {
            console.warn('[AlphaTekx] proactive token refresh failed:', err)
          }
        }
      }

      restoreComplete = true

      if (restored?.user?.id && activeUserId.current && restored.user.id !== activeUserId.current) {
        clearUserArtifacts()
      }
      activeUserId.current = restored?.user?.id || null
      setSession(restored)
      setLoading(false)
      if (restored) {
        localStorage.removeItem(LOCAL_USER_KEY)
        setLocalUser(null)
        void refreshProfile()
      }
    }
    void restoreSession().catch(error => {
      console.warn('[AlphaTekx] session restore failed:', error)
      // Don't immediately log user out on network errors — keep existing session
      // if one exists, and let onAuthStateChange handle any real auth failures.
      restoreComplete = true
      setLoading(false)
    })

    // onAuthStateChange listener — Supabase fires INITIAL_SESSION (often with
    // null) before restoreSession completes. We must NOT set loading=false
    // from this initial null event, because the restore is still in progress.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      const changedUser = Boolean(activeUserId.current && next?.user?.id && activeUserId.current !== next.user.id)
      if (!next || changedUser) clearUserArtifacts()
      activeUserId.current = next?.user?.id || null
      if (next?.user?.id) {
        try { localStorage.setItem(CURRENT_USER_KEY, next.user.id) } catch {}
      }
      // If restoreSession hasn't finished yet and this is a null session
      // (INITIAL_SESSION), don't update state — let restoreSession handle it.
      if (!restoreComplete && !next) return

      setSession(next)
      setLoading(false)
      if (next) {
        clearGoogleSignupPending()
        localStorage.removeItem(LOCAL_USER_KEY)
        setLocalUser(null)
        void refreshProfile()
      } else {
        clearUserArtifacts()
        setProfile(null)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [refreshProfile])

  const user: AuthUser | null = useMemo(() => {
    return session?.user ?? localUser
  }, [session, localUser])

  const localSignIn = async (name: string, email: string) => {
    const normalizedEmail = email.trim().toLowerCase()
    const existing = readLocalUser()
    const value: LocalUser = { id: (existing?.email === normalizedEmail ? existing.id : crypto.randomUUID()), email: normalizedEmail, name: name.trim() }
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(value))
    try { localStorage.setItem(CURRENT_USER_KEY, value.id) } catch {}
    setLocalUser(value)
  }

  const signOut = async () => {
    try { await supabase?.auth.signOut({ scope: 'local' }) } catch {}
    clearUserArtifacts()
    localStorage.removeItem(LOCAL_USER_KEY)
    localStorage.removeItem(CURRENT_USER_KEY)
    setSession(null)
    setLocalUser(null)
    setProfile(null)
    if (typeof window !== 'undefined') {
      window.location.replace('/')
    }
  }

  const value = useMemo<AuthValue>(() => ({ session, user, profile, loading, configured: isSupabaseConfigured, refreshProfile, signOut, localSignIn }), [session, user, profile, loading, refreshProfile])

  useEffect(() => {
    if (!supabase || !session?.user) return
    void completeInstantGoogleSignup(session).catch(() => {
      // Authentication is independent from bonus provisioning. The signed-in
      // user can continue while the dashboard/profile recovery path retries.
    })
  }, [session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

export function useAuthOptional() {
  return useContext(AuthContext)
}
