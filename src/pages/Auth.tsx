import { useEffect, useState } from 'react'
import { CheckCircle2, Chrome, LoaderCircle, Mail, ShieldCheck, Sparkles, User, Lock } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { clearGoogleSignupPending, googleSignupStateEvent, instantGoogleSignup, isGoogleSignupPending, useAuth } from '../lib/auth'
import { getDeviceFingerprint } from '../lib/fingerprint'
import { startPayment } from '../lib/paystack'
import { supabase } from '../lib/supabase'

const SITE_URL_HELP = 'Auth is blocked by the Supabase Site URL setting. Set Supabase Site URL to https://alphatekx.name.ng and add https://alphatekx.name.ng/auth as an allowed redirect URL.'
const OAUTH_STATE_HELP = 'That Google sign-in attempt expired. Continue with Google again to start a fresh secure sign-in.'

type VerificationResult = {
  ok?: boolean
  success?: boolean
  claimed?: boolean
  credits?: number
  creditsAdded?: number
  reason?: string
  error?: string
  isAdmin?: boolean
}

function authMessage(message: string) {
  const text = String(message || '')
  return /site url|redirect/i.test(text) ? SITE_URL_HELP : text || 'Authentication failed. Please try again.'
}

export default function Auth() {
  const { user, session, configured, refreshProfile } = useAuth()
  const [pending, setPending] = useState(false)
  const [googleSignupPending, setGoogleSignupPending] = useState(() => isGoogleSignupPending())
  const [verifying, setVerifying] = useState(false)
  const [notice, setNotice] = useState('')
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabase || session?.access_token || !window.location.hash.includes('access_token=')) return
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = fragment.get('access_token')
    const refreshToken = fragment.get('refresh_token')
    if (!accessToken || !refreshToken) {
      clearGoogleSignupPending()
      setGoogleSignupPending(false)
      setNotice('Google returned an incomplete session. Please try signing in again.')
      window.history.replaceState({}, document.title, `${location.pathname}${location.search}`)
      return
    }

    let active = true
    setPending(true)
    setNotice('Completing your secure Google sign-in…')
    // Do not depend only on detectSessionInUrl. Some browsers leave the
    // implicit-flow tokens in the fragment without completing the session.
    void supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data.session) throw error || new Error('Google session was not created.')
        clearGoogleSignupPending()
        setGoogleSignupPending(false)
        window.history.replaceState({}, document.title, `${location.pathname}${location.search}`)
        window.location.replace('/dashboard')
      })
      .catch((error) => {
        if (!active) return
        clearGoogleSignupPending()
        setGoogleSignupPending(false)
        setPending(false)
        window.history.replaceState({}, document.title, `${location.pathname}${location.search}`)
        setNotice(authMessage(error instanceof Error ? error.message : 'Google sign-in could not be completed.'))
      })

    return () => { active = false }
  }, [location.pathname, location.search, session?.access_token])

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const code = query.get('error_code') || ''
    const description = query.get('error_description') || query.get('error') || ''
    if (!code && !description) return
    const text = `${code} ${description}`
    clearGoogleSignupPending()
    setGoogleSignupPending(false)
    setPending(false)
    setNotice(/bad_oauth_state|state.*expired|state.*not.*found/i.test(text) ? OAUTH_STATE_HELP : authMessage(description || code))
    navigate(location.pathname, { replace: true })
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    if (!session?.access_token || !(location.pathname === '/auth' || location.pathname === '/login' || location.pathname === '/signup')) return

    const params = new URLSearchParams(location.search)
    const pendingPlan = params.get('plan')
    if (pendingPlan) {
      const pendingAmount = Number(params.get('amount') || '19')
      const timer = window.setTimeout(() => {
        void startPayment(pendingAmount, pendingPlan).catch((error) => {
          console.error('Payment failed', error)
        })
      }, 1500)
      return () => window.clearTimeout(timer)
    }

    clearGoogleSignupPending()
    setGoogleSignupPending(false)
    if (window.location.hash) window.history.replaceState({}, document.title, `${location.pathname}${location.search}`)
    const timer = window.setTimeout(() => window.location.replace('/dashboard'), 0)
    return () => window.clearTimeout(timer)
  }, [location.pathname, location.search, session?.access_token])

  const startGoogleSignup = async () => {
    if (pending || googleSignupPending || isGoogleSignupPending()) return
    setPending(true)
    setGoogleSignupPending(true)
    setNotice('')
    try {
      await instantGoogleSignup()
    } catch (error) {
      clearGoogleSignupPending()
      setNotice(error instanceof Error ? error.message : 'Google signup could not start. Please try again.')
      setPending(false)
      setGoogleSignupPending(false)
    }
  }

  useEffect(() => {
    setGoogleSignupPending(isGoogleSignupPending())
    const sync = () => setGoogleSignupPending(isGoogleSignupPending())
    window.addEventListener(googleSignupStateEvent, sync)
    return () => window.removeEventListener(googleSignupStateEvent, sync)
  }, [])

  useEffect(() => {
    if (!session?.access_token) return
    // Supabase normally consumes the implicit-flow fragment. Remove it
    // defensively so tokens are never left visible in the address bar.
    if (window.location.hash.includes('access_token=')) {
      window.history.replaceState({}, document.title, `${location.pathname}${location.search}`)
    }
  }, [location.pathname, location.search, session?.access_token])

  useEffect(() => {
    if (!user || pending || googleSignupPending) return
    const query = new URLSearchParams(location.search)
    const auto = query.get('auto')
    if (auto !== 'google') return
    if (location.pathname !== '/auth' && location.pathname !== '/login' && location.pathname !== '/signup') return
    void startGoogleSignup()
  }, [user, pending, googleSignupPending, location.pathname, location.search])

  useEffect(() => {
    if (!session?.access_token) return
    setVerifying(true)
    void refreshProfile().finally(() => setVerifying(false))
  }, [refreshProfile, session?.access_token])

  const emailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || pending || !supabase) return
    setPending(true)
    setNotice('')
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setNotice(authMessage(error.message))
        setPending(false)
      }
    } catch (error) {
      setNotice(authMessage(error instanceof Error ? error.message : 'Email sign-in failed.'))
      setPending(false)
    }
  }

  const blocked = !configured || pending || googleSignupPending || Boolean(user)
  const bonusMessage = result?.isAdmin
    ? 'Administrator access is active.'
    : result?.reason === 'bonus_unlocked' || result?.reason === 'google_credit_ready'
      ? 'Welcome! Your 10 free credits are ready.'
      : result?.claimed
        ? 'Welcome! 10 free credits unlocked.'
        : result?.reason === 'device_already_claimed' || result?.reason === 'already_claimed'
          ? 'This device already claimed the 10-credit bonus. One bonus per human.'
          : 'Your signup is being finalized.'

  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-auto bg-[#0A0A0F] px-3 py-7 text-white sm:px-6 sm:py-10">
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-[30rem] rounded-full bg-[#FFD700]/[.055] blur-3xl"/>
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-40 size-[34rem] rounded-full bg-[#6C5CE7]/10 blur-3xl"/>

      <div className="relative w-full max-w-2xl overflow-hidden p-4 sm:p-7 lg:p-8">
        <div className="rounded-[1.5rem] border border-white/8 bg-[#0D1020]/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] sm:p-6">
          <Link to="/" className="flex items-center justify-center gap-2 text-sm font-black tracking-[.14em] text-white">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#FFD700] to-[#6C5CE7] text-[#0A0A0F] shadow-[0_8px_24px_rgba(255,215,0,.18)]"><Sparkles size={17}/></span>
            ALPHATEKX
          </Link>

          <div className="mt-6 space-y-3 text-center">
            <h1 className="text-3xl font-black tracking-[-.05em] text-white sm:text-4xl">Welcome to your command centre</h1>
            <p className="mx-auto max-w-md text-sm font-semibold leading-6 text-slate-300 sm:text-base">
              Sign in with Google or email to get started with 10 free credits.
            </p>
          </div>

          <div className="mt-7 space-y-4">
            <button
              onClick={() => void startGoogleSignup()}
              disabled={blocked}
              className="flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl border-2 border-violet-400/20 bg-violet-500/10 px-4 font-black text-white shadow-[0_10px_25px_rgba(15,23,42,.07)] transition hover:border-violet-300 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? <LoaderCircle className="animate-spin" size={18}/> : <><Chrome size={19} className="text-violet-300"/> Sign in with Google <span className="text-xs text-slate-400">— 10 free credits</span></>}
            </button>

            <div className="relative">
              <div className="absolute inset-x-0 top-1/2 h-px bg-white/10"></div>
              <div className="relative flex justify-center">
                <span className="bg-[#0D1020] px-4 text-xs font-bold text-slate-400">or continue with email</span>
              </div>
            </div>

            <form onSubmit={emailSignIn} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  disabled={blocked}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-10 py-3 text-sm font-semibold text-white placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={blocked}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-10 py-3 text-sm font-semibold text-white placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={blocked || !email || !password}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#FFD700] px-4 font-black text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? <LoaderCircle className="animate-spin" size={18}/> : 'Continue'}
              </button>
            </form>
          </div>

          {!configured && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-500/10 p-3 text-center text-xs font-bold text-amber-300">Authentication needs the public Supabase values configured.</p>}
          {notice && <p role="alert" className="mt-5 rounded-xl border border-violet-200 bg-violet-500/10 p-3 text-sm font-bold text-white">{notice}</p>}

          {(verifying || result) && (
            <div role="status" aria-live="polite" className="mt-5 rounded-2xl border border-violet-200 bg-[#0A0F1E] p-5 text-center shadow-[0_12px_35px_rgba(109,40,217,.10)]">
              {verifying ? <LoaderCircle className="mx-auto animate-spin text-violet-300" size={28}/> : <CheckCircle2 className="mx-auto text-emerald-600" size={30}/>}
              <p className="mt-3 font-black text-white">{verifying ? "Verifying you're human…" : bonusMessage}</p>
              {result && <p className="mt-1 text-xs font-bold text-slate-400">Balance: {result.credits ?? 1} credits{result.success ? ' · Opening your Command Centre…' : ''}</p>}
              {result && !result.success && <button onClick={() => navigate('/dashboard', { replace: true })} className="mt-4 min-h-11 rounded-xl bg-[#6D28D9] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(109,40,217,.22)]">Continue to dashboard</button>}
            </div>
          )}

          <p className="mt-7 text-center text-[11px] font-semibold leading-5 text-slate-400">
            One 10-credit signup bonus per device or Google identity.
          </p>
        </div>
      </div>
    </main>
  )
}
