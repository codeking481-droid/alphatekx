import { useState } from 'react'
import { Chrome, LoaderCircle, Sparkles } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const SITE_URL_HELP = 'Auth is blocked by the Supabase Site URL setting. Set Supabase Site URL to https://alphatekx.name.ng and add https://alphatekx.name.ng/auth as an allowed redirect URL.'

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

export default function Auth() {
  const { user, configured, localSignIn } = useAuth()
  const [dev, setDev] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const destination = (location.state as {from?:string}|null)?.from || '/home'

  if (user) return <Navigate to={destination} replace/>

  const authMessage = (message: string) => {
    const text = String(message || '')
    return /site url|redirect/i.test(text) ? SITE_URL_HELP : text || 'Authentication failed. Please try again.'
  }

  const google = async () => {
    if (!supabase) return
    setPending(true); setNotice('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: authRedirectUrl() } })
      if (error) setNotice(authMessage(error.message))
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

  return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <div className="liquid-glass w-full max-w-md rounded-2xl p-8">
        <Link to="/" className="flex items-center justify-center gap-2 text-sm font-semibold tracking-[.12em] text-white/80">
          <Sparkles size={18} className="text-violet-400"/> ALPHATEKX
        </Link>
        <h1 className="mt-6 text-center text-2xl font-semibold">{mode === 'signin' ? 'Sign in to AlphaTekX' : 'Create your AlphaTekX account'}</h1>
        <p className="mt-2 text-center text-sm text-white/55">Use Google or email to start automating.</p>

        <button onClick={()=>void google()} disabled={pending || !configured} className="btn-alpha mt-8 flex min-h-12 w-full items-center justify-center gap-3 rounded-full font-medium text-white disabled:opacity-40">
          {pending ? <LoaderCircle className="animate-spin" size={18}/> : <><Chrome size={18}/> Continue with Google</>}
        </button>

        {configured && (
          <div className="mt-5 space-y-3">
            {mode === 'signup' && <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && void submitEmail()} className="field" placeholder="Full name" />}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && void submitEmail()} className="field" placeholder="Email" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && void submitEmail()} className="field" placeholder={mode === 'signup' ? 'Password - at least 6 characters' : 'Password'} />
            <button onClick={() => void submitEmail()} disabled={pending || !email.trim() || !password || (mode === 'signup' && password.length < 6)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.07] text-sm text-white transition-all hover:bg-white/[0.12] disabled:opacity-40">
              {pending ? <LoaderCircle className="animate-spin" size={16}/> : mode === 'signin' ? 'Sign in with email' : 'Create account with email'}
            </button>
            <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setNotice('') }} className="w-full text-xs text-violet-200/80 hover:text-violet-100">
              {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </button>
          </div>
        )}

        {!configured && <p className="mt-4 rounded-lg border border-white/[.12] bg-white/[.04] p-3 text-center text-xs text-white/60">Google sign-in needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY configured.</p>}

        {notice && <p className="mt-4 rounded-lg border border-white/[.12] bg-white/[.04] p-3 text-sm">{notice}</p>}

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
