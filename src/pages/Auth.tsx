import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Chrome, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getDeviceFingerprint } from '../lib/fingerprint'
import { supabase } from '../lib/supabase'

const SITE_URL_HELP = 'Auth is blocked by the Supabase Site URL setting. Set Supabase Site URL to https://alphatekx.name.ng and add https://alphatekx.name.ng/auth as an allowed redirect URL.'
const OAUTH_STATE_HELP = 'That Google sign-in attempt expired. Continue with Google again to start a fresh secure sign-in.'
const SIGNUP_CHOICE_KEY = 'alphatekx:signup-choice'
const HUMAN_VERIFICATION_CHOICE = 'human-verification'

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

function authRedirectUrl() {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  const origin = configured || window.location.origin
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') url.protocol = 'https:'
    url.pathname = '/auth'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return 'https://alphatekx.name.ng/auth'
  }
}

function authMessage(message: string) {
  const text = String(message || '')
  return /site url|redirect/i.test(text) ? SITE_URL_HELP : text || 'Authentication failed. Please try again.'
}

function rememberSignupChoice(choice: string | null) {
  try {
    if (choice) sessionStorage.setItem(SIGNUP_CHOICE_KEY, choice)
    else sessionStorage.removeItem(SIGNUP_CHOICE_KEY)
  } catch {}
}

function pendingSignupChoice() {
  try {
    return sessionStorage.getItem(SIGNUP_CHOICE_KEY)
  } catch {
    return null
  }
}

export default function Auth() {
  const { user, session, configured, refreshProfile } = useAuth()
  const [pending, setPending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [notice, setNotice] = useState('')
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [welcomeSettled, setWelcomeSettled] = useState(false)
  const welcomeCreditStarted = useRef(false)
  const oauthStartInFlight = useRef(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const code = query.get('error_code') || ''
    const description = query.get('error_description') || query.get('error') || ''
    if (!code && !description) return
    const text = `${code} ${description}`
    rememberSignupChoice(null)
    setNotice(/bad_oauth_state|state.*expired|state.*not.*found/i.test(text) ? OAUTH_STATE_HELP : authMessage(description || code))
    navigate(location.pathname, { replace: true })
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    if (!user || !session?.access_token || welcomeCreditStarted.current) return
    welcomeCreditStarted.current = true
    setPending(true)
    setNotice('')

    void (async () => {
      try {
        const welcomeResponse = await fetch('/api/auth/welcome-credit/google', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const welcomeBody = await welcomeResponse.json().catch(() => ({})) as VerificationResult
        if (!welcomeResponse.ok) throw new Error(welcomeBody.error || 'Your Google signup credit could not be activated.')
        setResult({ ...welcomeBody, success: false, reason: welcomeBody.isAdmin ? 'supervisor_bypass' : 'google_credit_ready' })
        await refreshProfile()
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Your Google signup credit could not be activated.')
      } finally {
        setPending(false)
        setWelcomeSettled(true)
      }
    })()
  }, [refreshProfile, session?.access_token, user])

  const verifyHuman = useCallback(async () => {
    if (!user || !session?.access_token || verifying) return
    setVerifying(true)
    setNotice('')
    try {
      const fingerprint = await getDeviceFingerprint()
      const response = await fetch('/api/verify-bonus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ fingerprintHash: fingerprint }),
      })
      const body = await response.json().catch(() => ({})) as VerificationResult
      if (!response.ok) throw new Error(body.error || 'Human verification could not be completed.')
      setResult(body)
      await refreshProfile()
      if (body.success) window.setTimeout(() => navigate('/onboarding', { replace: true }), 1_350)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Human verification could not be completed.')
    } finally {
      setVerifying(false)
    }
  }, [navigate, refreshProfile, session?.access_token, user, verifying])

  useEffect(() => {
    if (!user || !session?.access_token || !welcomeSettled || verifying) return
    if (pendingSignupChoice() !== HUMAN_VERIFICATION_CHOICE) return
    // Consume before starting so React Strict Mode or a refresh cannot submit twice.
    rememberSignupChoice(null)
    void verifyHuman()
  }, [session?.access_token, user, verifyHuman, verifying, welcomeSettled])

  const google = async (verifyAfterSignIn = false) => {
    if (!supabase || oauthStartInFlight.current) return
    oauthStartInFlight.current = true
    rememberSignupChoice(verifyAfterSignIn ? HUMAN_VERIFICATION_CHOICE : null)
    setPending(true)
    setNotice('')
    let redirectStarted = false
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: authRedirectUrl(),
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      })
      if (error) {
        rememberSignupChoice(null)
        setNotice(authMessage(error.message))
      }
      else if (!data.url) {
        rememberSignupChoice(null)
        setNotice('Google did not return a fresh sign-in URL. Please try again.')
      }
      else {
        redirectStarted = true
        window.location.assign(data.url)
      }
    } catch (error) {
      rememberSignupChoice(null)
      setNotice(authMessage(error instanceof Error ? error.message : 'Google sign-in failed.'))
    } finally {
      if (!redirectStarted) {
        oauthStartInFlight.current = false
        setPending(false)
      }
    }
  }

  const blocked = !configured || pending || Boolean(user)
  const bonusMessage = result?.isAdmin
    ? 'Administrator access is active.'
    : result?.reason === 'google_credit_ready'
    ? 'Google sign-in complete. Your 1 credit is ready.'
    : result?.claimed
      ? 'Human verified! 10 credits unlocked.'
    : result?.reason === 'device_already_claimed' || result?.reason === 'already_claimed'
      ? 'This device already claimed the 10-credit bonus. One bonus per human.'
      : 'This Google account already claimed the bonus. You have 1 credit.'

  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[#0A0A0F] px-3 py-5 text-white sm:px-6 sm:py-7">
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-[30rem] rounded-full bg-[#FFD700]/[.055] blur-3xl"/>
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-40 size-[34rem] rounded-full bg-[#6C5CE7]/10 blur-3xl"/>

      <div className="luxury-card relative w-full max-w-2xl overflow-hidden p-4 sm:p-7 lg:p-8">
        <div className="rounded-[1.5rem] border border-white/8 bg-[#0D1020]/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] sm:p-6">
          <Link to="/" className="flex items-center justify-center gap-2 text-sm font-black tracking-[.14em] text-white">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#FFD700] to-[#6C5CE7] text-[#0A0A0F] shadow-[0_8px_24px_rgba(255,215,0,.18)]"><Sparkles size={17}/></span>
            ALPHATEKX
          </Link>

          <div className="mt-6 space-y-3 text-center">
            <h1 className="text-3xl font-black tracking-[-.05em] text-white sm:text-4xl">Welcome to your command centre</h1>
            <p className="mx-auto max-w-md text-sm font-semibold leading-6 text-slate-300 sm:text-base">
              Start with a Google sign-in or unlock a full onboarding boost with one human verification pass.
            </p>
          </div>

          <div className="mt-7 space-y-4">
            <section className="rounded-2xl border border-white/10 bg-white/[.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] sm:p-5">
              <h2 className="font-black text-white">Google signup · 1 credit</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-400">Quick access to your workspace and 1 credit to run your first automation.</p>
              <button onClick={() => void google(false)} disabled={blocked} className="mt-4 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border-2 border-violet-400/20 bg-violet-500/10 px-4 font-black text-white shadow-[0_10px_25px_rgba(15,23,42,.07)] transition hover:border-violet-300 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                {pending ? <LoaderCircle className="animate-spin" size={18}/> : <><Chrome size={19} className="text-violet-300"/> Sign in with Google <span className="text-xs text-slate-400">— 1 credit</span></>}
              </button>
            </section>

            <section className="relative rounded-2xl border border-[#FFD700]/20 bg-gradient-to-br from-[#FFD700]/[.065] to-[#6C5CE7]/10 p-4 shadow-2xl sm:p-5">
              <h2 className="font-black text-white">Human verification · 10 credits</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-400">After Google sign-in, verify once to unlock a stronger welcome bonus and better momentum.</p>
              <button onClick={() => user ? void verifyHuman() : void google(true)} disabled={!configured || pending || verifying} className="solar-action relative mt-4 flex min-h-16 w-full items-center justify-center gap-3 rounded-xl px-4 disabled:cursor-not-allowed disabled:opacity-60">
                {verifying ? <LoaderCircle className="animate-spin" size={20}/> : <ShieldCheck size={20}/>}
                {verifying ? "Verifying you're human…" : user ? 'Verify human & unlock 10 credits' : 'Sign in & verify human — 10 credits'}
                <span className="absolute -right-2 -top-2 rounded-full border border-[#FFD700]/20 bg-[#15151F] px-2.5 py-1 text-[9px] font-black tracking-wide text-[#FFD700]">RECOMMENDED</span>
              </button>
              {!user && <p className="mt-3 text-center text-xs font-bold text-slate-400">Sign in with Google first. Human verification starts only when you click this button.</p>}
            </section>
          </div>

          {!configured && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-500/10 p-3 text-center text-xs font-bold text-amber-300">Authentication needs the public Supabase values configured.</p>}
          {notice && <p role="alert" className="mt-5 rounded-xl border border-violet-200 bg-violet-500/10 p-3 text-sm font-bold text-white">{notice}</p>}

          {(verifying || result) && (
            <div role="status" aria-live="polite" className="mt-5 rounded-2xl border border-violet-200 bg-[#0A0F1E] p-5 text-center shadow-[0_12px_35px_rgba(109,40,217,.10)]">
              {verifying ? <LoaderCircle className="mx-auto animate-spin text-violet-300" size={28}/> : <CheckCircle2 className="mx-auto text-emerald-600" size={30}/>}
              <p className="mt-3 font-black text-white">{verifying ? "Verifying you're human…" : bonusMessage}</p>
              {result && <p className="mt-1 text-xs font-bold text-slate-400">Balance: {result.credits ?? 1} credits{result.success ? ' · Opening your Command Centre…' : ''}</p>}
              {result && !result.success && <button onClick={() => navigate('/onboarding', { replace: true })} className="mt-4 min-h-11 rounded-xl bg-[#6D28D9] px-5 text-sm font-black text-white shadow-[0_10px_24px_rgba(109,40,217,.22)]">Continue with 1 credit</button>}
            </div>
          )}

          <p className="mt-7 text-center text-[11px] font-semibold leading-5 text-slate-400">
            One 10-credit human-verification bonus per device or Google identity.
          </p>
        </div>
      </div>
    </main>
  )
}
