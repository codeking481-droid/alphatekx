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
  claimed?: boolean
  credits?: number
  creditsAdded?: number
  reason?: string
  error?: string
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
  const verificationStarted = useRef(false)
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
    if (!user || !session?.access_token || verificationStarted.current) return
    verificationStarted.current = true
    setVerifying(true)
    setNotice('')

    void (async () => {
      const startedAt = Date.now()
      try {
        const fingerprint = await getDeviceFingerprint()
        const response = await fetch('/api/verify-bonus', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ fingerprint }),
        })
        const body = await response.json().catch(() => ({})) as VerificationResult
        if (!response.ok) throw new Error(body.error || 'Human verification could not be completed.')
        const remaining = Math.max(0, 1_200 - (Date.now() - startedAt))
        if (remaining) await new Promise(resolve => window.setTimeout(resolve, remaining))
        setResult(body)
        await refreshProfile()
        window.setTimeout(() => navigate('/onboarding', { replace: true }), 1_350)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Human verification could not be completed.')
      } finally {
        setVerifying(false)
      }
    })()
  }, [navigate, refreshProfile, session?.access_token, user])

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
  const bonusMessage = result?.claimed
    ? 'Human verified! 10 credits unlocked 🎉'
    : result?.reason === 'device_already_claimed'
      ? 'This device already claimed the 10-credit bonus. One bonus per human.'
      : 'Your Google account was already verified. Your credits are safe.'

  return (
    <main className="grid min-h-screen place-items-center bg-[#FAFBFF] p-5 text-[#0B0F19]">
      <div className="w-full max-w-md rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_30px_80px_rgba(15,23,42,.12)] sm:p-9">
        <Link to="/" className="flex items-center justify-center gap-2 text-sm font-black tracking-[.14em] text-[#0B0F19]">
          <span className="grid size-9 place-items-center rounded-xl bg-[#6D28D9] text-white shadow-lg shadow-violet-200"><Sparkles size={17}/></span>
          ALPHATEKX
        </Link>

        <h1 className="mt-7 text-center text-3xl font-black tracking-[-.04em] text-[#0B0F19]">Join AlphaTekx</h1>
        <p className="mt-2 text-center text-sm font-bold text-slate-600">Get 10 credits free</p>

        <button onClick={() => void google()} disabled={blocked} className="mt-8 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 font-black text-[#0B0F19] shadow-[0_10px_25px_rgba(15,23,42,.07)] transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? <LoaderCircle className="animate-spin" size={18}/> : <><Chrome size={19} className="text-[#6D28D9]"/> Sign in with Google <span className="text-xs text-slate-600">— 1 credit</span></>}
        </button>

        <button disabled={!user || verifying} className="relative mt-3 flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-[#6D28D9] px-4 font-black text-white shadow-[0_15px_35px_rgba(109,40,217,.3)] disabled:cursor-not-allowed disabled:opacity-45">
          {verifying ? <LoaderCircle className="animate-spin" size={20}/> : <ShieldCheck size={20}/>}
          {verifying ? "Verifying you're human…" : 'Verify human & unlock 10 credits'}
          <span className="absolute -right-2 -top-2 rounded-full bg-violet-100 px-2.5 py-1 text-[9px] font-black tracking-wide text-[#5B21B6]">RECOMMENDED</span>
        </button>
        {!user && <p className="mt-3 text-center text-xs font-bold text-slate-500">Sign in with Google first. Human verification then runs automatically.</p>}

        {!configured && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-xs font-bold text-amber-900">Authentication needs the public Supabase values configured.</p>}
        {notice && <p role="alert" className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm font-bold text-[#0B0F19]">{notice}</p>}

        {(verifying || result) && (
          <div role="status" aria-live="polite" className="mt-5 rounded-2xl border border-violet-200 bg-[#FAFBFF] p-5 text-center shadow-[0_12px_35px_rgba(109,40,217,.10)]">
            {verifying ? <LoaderCircle className="mx-auto animate-spin text-[#6D28D9]" size={28}/> : <CheckCircle2 className="mx-auto text-emerald-600" size={30}/>}
            <p className="mt-3 font-black text-[#0B0F19]">{verifying ? "Verifying you're human…" : bonusMessage}</p>
            {result && <p className="mt-1 text-xs font-bold text-slate-600">Balance: {result.credits ?? 1} credits · Opening your Command Centre…</p>}
          </div>
        )}

        <p className="mt-7 text-center text-[11px] font-semibold leading-5 text-slate-500">
          One 10-credit human-verification bonus per device or Google identity.
        </p>
      </div>
    </main>
  )
}
