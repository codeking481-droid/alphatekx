import { useState } from 'react'
import { Chrome, LoaderCircle, Sparkles } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const { user, configured, localSignIn } = useAuth()
  const [dev, setDev] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const destination = (location.state as {from?:string}|null)?.from || '/home'

  if (user) return <Navigate to={destination} replace/>

  const google = async () => {
    if (!supabase) return
    setPending(true); setNotice('')
    const { error } = await supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:`${window.location.origin}/auth` } })
    if (error) { setNotice(error.message); setPending(false) }
  }

  const emailSignIn = async () => {
    if (!supabase || !email.trim() || !password) return
    setPending(true); setNotice('')
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (result.error) { setNotice(result.error.message); setPending(false) }
    else navigate(destination)
  }

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
        <h1 className="mt-6 text-center text-2xl font-semibold">Sign in to AlphaTekX</h1>
        <p className="mt-2 text-center text-sm text-white/55">Use your Google account to start automating.</p>

        <button onClick={()=>void google()} disabled={pending || !configured} className="btn-alpha mt-8 flex min-h-12 w-full items-center justify-center gap-3 rounded-full font-medium text-white disabled:opacity-40">
          {pending ? <LoaderCircle className="animate-spin" size={18}/> : <><Chrome size={18}/> Continue with Google</>}
        </button>

        {configured && (
          <div className="mt-5 space-y-3">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && void emailSignIn()} className="field" placeholder="Email" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && void emailSignIn()} className="field" placeholder="Password" />
            <button onClick={() => void emailSignIn()} disabled={pending || !email.trim() || !password} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.07] text-sm text-white transition-all hover:bg-white/[0.12] disabled:opacity-40">
              {pending ? <LoaderCircle className="animate-spin" size={16}/> : 'Sign in with email'}
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
