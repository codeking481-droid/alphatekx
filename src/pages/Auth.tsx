import { useEffect, useState } from 'react'
import { Chrome, LoaderCircle, Phone, Sparkles } from 'lucide-react'
import type { ConfirmationResult } from 'firebase/auth'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { finishFirebasePhoneSignIn, firebasePhoneConfigured, sendFirebasePhoneCode } from '../lib/firebasePhone'

const SITE_URL_HELP = 'Auth is blocked by the Supabase Site URL setting. Set Supabase Site URL to https://alphatekx.name.ng and add https://alphatekx.name.ng/auth as an allowed redirect URL.'
const OAUTH_STATE_HELP = 'Google sign-in expired or was started from an old tab. Close old AlphaTekx login tabs, sign out of the stuck session if needed, then try Continue with Google again.'

function authRedirectUrl() {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  const origin = configured || window.location.origin
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      url.protocol = 'https:'
    }
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

export default function Auth() {
  const { user, configured, localSignIn } = useAuth()
  const [dev, setDev] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [phoneMode, setPhoneMode] = useState(false)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const destination = (location.state as {from?:string}|null)?.from || '/home'

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const code = query.get('error_code') || ''
    const description = query.get('error_description') || query.get('error') || ''
    if (!code && !description) return
    const text = `${code} ${description}`
    setNotice(/bad_oauth_state|state.*expired|state.*not.*found/i.test(text) ? OAUTH_STATE_HELP : authMessage(description || code))
    navigate(location.pathname, { replace: true })
  }, [location.search])

  if (user) return <Navigate to={destination} replace/>

  const authMessage = (message: string) => {
    const text = String(message || '')
    return /site url|redirect/i.test(text) ? SITE_URL_HELP : text || 'Authentication failed. Please try again.'
  }

  const google = async () => {
    if (!supabase) return
    setPending(true); setNotice('')
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
      const message = error instanceof Error ? error.message : 'Google sign-in failed.'
      setNotice(authMessage(message))
    } finally {
      setPending(false)
    }
  }

  const emailSignIn = async () => {
    if (!supabase || !email.trim() || !password) return
    setPending(true); setNotice('')
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (result.error) setNotice(authMessage(result.error.message))
      else navigate(destination)
    } catch (error) {
      setNotice(authMessage(error instanceof Error ? error.message : 'Sign in failed. Please try again.'))
    } finally {
      setPending(false)
    }
  }

  const emailSignUp = async () => {
    if (!supabase || !email.trim() || !password) return
    setPending(true); setNotice('')
    try {
      const result = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: authRedirectUrl(),
          data: { full_name: name.trim() || email.trim().split('@')[0] },
        },
      })
      if (result.error) setNotice(authMessage(result.error.message))
      else if (result.data.session) navigate(destination)
      else setNotice('Account created. Check your email to confirm your account, then sign in.')
    } catch (error) {
      setNotice(authMessage(error instanceof Error ? error.message : 'Sign up failed. Please try again.'))
    } finally {
      setPending(false)
    }
  }

  const submitEmail = () => mode === 'signin' ? emailSignIn() : emailSignUp()

  const submitLocal = async () => {
    if (!name.trim() || !email.trim()) return
    setPending(true); setNotice('')
    await localSignIn(name.trim(), email.trim())
    setPending(false)
  }

  const sendPhoneOtp = async () => {
    if (!phone.trim()) return
    setPending(true); setNotice('')
    try {
      const result = await sendFirebasePhoneCode(phone.trim())
      setConfirmation(result)
      setNotice('Verification code sent. Enter the 6-digit code from your phone.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send the verification code.')
    } finally { setPending(false) }
  }

  const verifyPhoneOtp = async () => {
    if (!confirmation || otp.trim().length < 6 || !supabase) return
    setPending(true); setNotice('')
    try {
      const idToken = await finishFirebasePhoneSignIn(confirmation, otp.trim())
      const response = await fetch('/api/auth/firebase-phone/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.tokenHash) throw new Error(body.error || 'Phone sign-in could not be completed.')
      const signedIn = await supabase.auth.verifyOtp({ token_hash: body.tokenHash, type: 'magiclink' })
      if (signedIn.error) throw signedIn.error
      navigate(destination)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Phone verification failed.')
    } finally { setPending(false) }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-white p-5">
      <div className="w-full max-w-md rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_30px_80px_rgba(15,23,42,.15)] sm:p-9">
        <Link to="/" className="flex items-center justify-center gap-2 text-sm font-black tracking-[.14em] text-slate-900">
          <span className="grid size-9 place-items-center rounded-xl bg-[#6D28D9] text-white shadow-lg shadow-violet-200"><Sparkles size={17}/></span> ALPHATEKX
        </Link>
        <h1 className="mt-7 text-center text-3xl font-black tracking-[-.04em] text-slate-900">{mode === 'signin' ? 'Welcome back' : 'Start with Alpha'}</h1>
        <p className="mt-2 text-center text-sm font-semibold text-slate-500">{mode === 'signin' ? 'Sign in and continue your work.' : 'Choose your secure signup method.'}</p>

        <button onClick={()=>void google()} disabled={pending || !configured} className="mt-8 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border-2 border-slate-200 bg-white font-black text-slate-800 shadow-[0_10px_25px_rgba(15,23,42,.07)] transition hover:border-violet-300 hover:bg-violet-50 disabled:opacity-40">
          {pending && !phoneMode ? <LoaderCircle className="animate-spin" size={18}/> : <><Chrome size={19} className="text-[#6D28D9]"/> Sign up with Google <span className="text-xs text-slate-500">— 1 credit</span></>}
        </button>

        <button onClick={() => { setPhoneMode(value => !value); setNotice('') }} disabled={pending || !configured || !firebasePhoneConfigured} className="relative mt-3 flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-[#6D28D9] px-4 font-black text-white shadow-[0_15px_35px_rgba(109,40,217,.3)] transition hover:-translate-y-0.5 hover:bg-[#5B21B6] disabled:opacity-40">
          <Phone size={20}/> Sign up with WhatsApp <span className="text-xs text-violet-100">— 10 credits</span>
          <span className="absolute -right-2 -top-2 rounded-full bg-amber-300 px-2.5 py-1 text-[9px] font-black tracking-wide text-slate-900">RECOMMENDED</span>
        </button>

        {phoneMode && (
          <div className="mt-5 space-y-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
            {!confirmation ? (
              <>
                <label className="block text-xs font-black uppercase tracking-[.12em] text-slate-600">WhatsApp phone number</label>
                <input value={phone} onChange={event => setPhone(event.target.value)} placeholder="+2348012345678" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-bold text-slate-900 outline-none focus:border-[#6D28D9] focus:ring-4 focus:ring-violet-100" />
                <button onClick={() => void sendPhoneOtp()} disabled={pending || !phone.trim()} className="min-h-12 w-full rounded-xl bg-[#6D28D9] font-black text-white disabled:opacity-40">{pending ? <LoaderCircle className="mx-auto animate-spin" size={18}/> : 'Send verification code'}</button>
              </>
            ) : (
              <>
                <label className="block text-xs font-black uppercase tracking-[.12em] text-slate-600">6-digit verification code</label>
                <input inputMode="numeric" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="123456" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-xl font-black tracking-[.35em] text-slate-900 outline-none focus:border-[#6D28D9] focus:ring-4 focus:ring-violet-100" />
                <button onClick={() => void verifyPhoneOtp()} disabled={pending || otp.length !== 6} className="min-h-12 w-full rounded-xl bg-[#6D28D9] font-black text-white disabled:opacity-40">{pending ? <LoaderCircle className="mx-auto animate-spin" size={18}/> : 'Verify & create account'}</button>
                <button onClick={() => { setConfirmation(null); setOtp('') }} className="w-full text-xs font-black text-[#6D28D9]">Use a different number</button>
              </>
            )}
          </div>
        )}
        <div id="firebase-recaptcha" />

        {configured && (
          <details className="mt-6 border-t border-slate-200 pt-5">
            <summary className="cursor-pointer text-center text-xs font-black text-slate-500">Use email instead</summary>
            <div className="mt-4 space-y-3">
              {mode === 'signup' && <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && void submitEmail()} className="min-h-12 w-full rounded-xl border border-slate-300 px-4 font-bold text-slate-900 outline-none focus:border-[#6D28D9]" placeholder="Full name" />}
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && void submitEmail()} className="min-h-12 w-full rounded-xl border border-slate-300 px-4 font-bold text-slate-900 outline-none focus:border-[#6D28D9]" placeholder="Email" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && void submitEmail()} className="min-h-12 w-full rounded-xl border border-slate-300 px-4 font-bold text-slate-900 outline-none focus:border-[#6D28D9]" placeholder={mode === 'signup' ? 'Password — at least 6 characters' : 'Password'} />
              <button onClick={() => void submitEmail()} disabled={pending || !email.trim() || !password || (mode === 'signup' && password.length < 6)} className="min-h-12 w-full rounded-xl border-2 border-slate-200 bg-white text-sm font-black text-slate-800 disabled:opacity-40">{pending ? <LoaderCircle className="mx-auto animate-spin" size={16}/> : mode === 'signin' ? 'Sign in with email' : 'Create account with email'}</button>
              <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setNotice('') }} className="w-full text-xs font-black text-[#6D28D9]">{mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
            </div>
          </details>
        )}

        {!configured && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-xs font-bold text-amber-800">Authentication needs the public Supabase values configured.</p>}
        {configured && !firebasePhoneConfigured && <p className="mt-3 text-center text-[11px] font-bold text-slate-400">Phone signup becomes available when the public Firebase configuration is added.</p>}

        {notice && <p className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm font-bold text-slate-700">{notice}</p>}

        {!configured && (
          <div className="mt-8 border-t border-white/10 pt-6">
            <button onClick={() => setDev(v => !v)} className="w-full text-xs text-white/40 hover:text-white/70">
              {dev ? 'Hide local dev sign in' : 'Local development sign in'}
            </button>
            {dev && (
              <div className="mt-4 space-y-3">
                <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && void submitLocal()} className="field" placeholder="Your name" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && void submitLocal()} className="field" placeholder="Your email" />
                <button onClick={() => void submitLocal()} disabled={pending || !name.trim() || !email.trim()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.07] text-sm text-white transition-all hover:bg-white/[0.12] disabled:opacity-40">
                  {pending ? <LoaderCircle className="animate-spin" size={16}/> : 'Continue locally'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
