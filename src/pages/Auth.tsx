import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Chrome, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getDeviceFingerprint } from '../lib/fingerprint'
import { supabase } from '../lib/supabase'

const SITE_URL_HELP = 'Auth is blocked by the Supabase Site URL setting. Set Supabase Site URL to https://alphatekx.name.ng and add https://alphatekx.name.ng/auth as an allowed redirect URL.'
const OAUTH_STATE_HELP = 'Google sign-in expired or was started from an old tab. Close old AlphaTekx login tabs, then try Continue with Google again.'

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

function clearStaleOAuthState() {
  const shouldRemove = (key: string) => /supabase|sb-|pkce|oauth|auth-token/i.test(key)
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean) as string[]
      for (const key of keys) if (shouldRemove(key)) storage.removeItem(key)
    } catch {}
  }
}

function authMessage(message: string) {
  const text = String(message || '')
  return /site url|redirect/i.test(text) ? SITE_URL_HELP : text || 'Authentication failed. Please try again.'
}

export default function Auth() {
  const { user, session, configured, refreshProfile } = useAuth()
  const [pending, setPending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [notice, setNotice] = useState('')
  const [result, setResult] = useState<VerificationResult | null>(null)
  const welcomeCreditStarted = useRef(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const code = query.get('error_code') || ''
    const description = query.get('error_description') || query.get('error') || ''
    if (!code && !description) return
    const text = `${code} ${description}`
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
        setResult({ ...welcomeBody, success: false, reason: 'google_credit_ready' })
        await refreshProfile()
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Your Google signup credit could not be activated.')
      } finally {
        setPending(false)
      }
    })()
  }, [refreshProfile, session?.access_token, user])

  const verifyHuman = async () => {
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
  }

  const google = async () => {
    if (!supabase) return
    setPending(true)
    setNotice('')
    try {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
      clearStaleOAuthState()
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: authRedirectUrl(),
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      })
      if (error) setNotice(authMessage(error.message))
      else if (!data.url) setNotice('Google did not return a fresh sign-in URL. Please try again.')
      else window.location.replace(data.url)
    } catch (error) {
      setNotice(authMessage(error instanceof Error ? error.message : 'Google sign-in failed.'))
    } finally {
      setPending(false)
    }
  }

  const blocked = !configured || pending || Boolean(user)
  const bonusMessage = result?.reason === 'google_credit_ready'
    ? 'Google sign-in complete. Your 1 credit is ready.'
    : result?.isAdmin
    ? 'Welcome Boss! 10 credits unlocked 🔓'
    : result?.claimed
      ? 'Human verified! 10 credits unlocked 🎉'
    : result?.reason === 'device_already_claimed' || result?.reason === 'already_claimed'
      ? 'This device already claimed the 10-credit bonus. One bonus per human.'
      : 'This Google account already claimed the bonus. You have 1 credit.'

  return (
    <main className="grid min-h-screen place-items-center bg-[#0A0F1E] p-5 text-white">
      <div className="w-full max-w-md rounded-[1.75rem] border border-white/[.10] bg-white/[.04] p-7 shadow-[0_30px_80px_rgba(15,23,42,.12)] sm:p-9">
        <Link to="/" className="flex items-center justify-center gap-2 text-sm font-black tracking-[.14em] text-white">
          <span className="grid size-9 place-items-center rounded-xl bg-[#6D28D9] text-white shadow-lg shadow-violet-200"><Sparkles size={17}/></span>
          ALPHATEKX
        </Link>

        <h1 className="mt-7 text-center text-3xl font-black tracking-[-.04em] text-white">Join AlphaTekx</h1>
        <p className="mt-2 text-center text-sm font-bold text-slate-400">Choose how you want to get started.</p>

        <section className="mt-8 rounded-2xl border-2 border-white/[.10] bg-white/[.04] p-4 shadow-[0_10px_25px_rgba(15,23,42,.07)]">
          <h2 className="font-black text-white">Google signup · 1 credit</h2>
          <p className="mt-1 text-sm font-semibold text-slate-400">Sign in and get one credit to run your first automation.</p>
        <button onClick={() => void google()} disabled={blocked} className="mt-4 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border-2 border-white/[.10] bg-white/[.04] px-4 font-black text-white shadow-[0_10px_25px_rgba(15,23,42,.07)] transition hover:border-violet-300 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? <LoaderCircle className="animate-spin" size={18}/> : <><Chrome size={19} className="text-violet-300"/> Sign in with Google <span className="text-xs text-slate-400">— 1 credit</span></>}
        </button>
        </section>

        <section className="relative mt-4 rounded-2xl border-2 border-violet-200 bg-violet-500/10 p-4 shadow-[0_15px_35px_rgba(109,40,217,.14)]">
          <h2 className="font-black text-white">Human verification · 10 credits</h2>
          <p className="mt-1 text-sm font-semibold text-slate-400">After Google sign-in, choose this option to verify and unlock ten credits.</p>
        <button onClick={() => user ? void verifyHuman() : void google()} disabled={!configured || pending || verifying} className="relative mt-3 flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-[#6D28D9] px-4 font-black text-white shadow-[0_15px_35px_rgba(109,40,217,.3)] transition hover:-translate-y-0.5 hover:bg-[#5B21B6] disabled:cursor-not-allowed disabled:opacity-60">
          {verifying ? <LoaderCircle className="animate-spin" size={20}/> : <ShieldCheck size={20}/>}
          {verifying ? "Verifying you're human…" : user ? 'Verify human & unlock 10 credits' : 'Sign in & verify human — 10 credits'}
          <span className="absolute -right-2 -top-2 rounded-full bg-violet-500/10 px-2.5 py-1 text-[9px] font-black tracking-wide text-[#5B21B6]">RECOMMENDED</span>
        </button>
        {!user && <p className="mt-3 text-center text-xs font-bold text-slate-400">Sign in with Google first. Human verification starts only when you click this button.</p>}
        </section>

        {!configured && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-xs font-bold text-amber-300">Authentication needs the public Supabase values configured.</p>}
        {notice && <p role="alert" className="mt-4 rounded-xl border border-violet-200 bg-violet-500/10 p-3 text-sm font-bold text-white">{notice}</p>}

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
    </main>
  )
}
