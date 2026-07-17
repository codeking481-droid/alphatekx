import { useEffect, useState } from 'react'
import { ArrowRight, Chrome, LoaderCircle } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const { user, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login'|'signup'>('login')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const destination = (location.state as {from?:string}|null)?.from || '/workspace'

  useEffect(() => { if (user) navigate(destination, { replace:true }) }, [user, destination, navigate])
  if (user) return <Navigate to={destination} replace/>

  const google = async () => {
    setPending(true); setNotice('')
    const { error } = await supabase!.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:`${window.location.origin}/auth` } })
    if (error) { setNotice(error.message); setPending(false) }
  }
  const submit = async () => {
    if(!email||!password)return
    setPending(true);setNotice('')
    const result = mode==='signup' ? await supabase!.auth.signUp({email,password,options:{emailRedirectTo:`${window.location.origin}/auth`}}) : await supabase!.auth.signInWithPassword({email,password})
    if(result.error)setNotice(result.error.message); else if(mode==='signup'&&!result.data.session)setNotice('Check your email to confirm your account. Your profile will begin with 100 credits.')
    setPending(false)
  }

  return <main className="grid min-h-screen place-items-center bg-[#0A0A0A] p-5"><div className="liquid-glass w-full max-w-md rounded-xl p-6"><p className="text-sm font-semibold tracking-[.12em]">ALPHATEKX</p><h1 className="mt-5 text-xl font-semibold">{mode==='login'?'Welcome back':'Create your account'}</h1><p className="mt-2 text-sm text-white/55">Access your missions and creations.</p>{!configured&&<p className="mt-5 rounded-lg border border-white/[.12] bg-white/[.04] p-3 text-sm">Supabase is not configured.</p>}<button onClick={()=>void google()} disabled={!configured||pending} className="liquid-glass mt-6 flex min-h-12 w-full items-center justify-center gap-3 rounded-lg font-medium disabled:opacity-40"><Chrome size={18}/>Continue with Google</button><div className="my-5 flex items-center gap-3 text-xs text-white/45"><span className="h-px flex-1 bg-white/10"/>or email<span className="h-px flex-1 bg-white/10"/></div><div className="space-y-3"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="field" placeholder="Email"/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void submit()} className="field" placeholder="Password"/></div>{notice&&<p className="mt-4 rounded-lg border border-white/[.12] bg-white/[.04] p-3 text-sm">{notice}</p>}<button onClick={()=>void submit()} disabled={!configured||pending||!email||!password} className="btn-alpha mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg font-medium text-white disabled:opacity-40">{pending?<LoaderCircle className="animate-spin" size={17}/>:<>{mode==='login'?'Log in':'Sign up'}<ArrowRight size={17}/></>}</button><button onClick={()=>setMode(mode==='login'?'signup':'login')} className="mt-5 w-full text-sm text-white/55 hover:text-[#E56B2D]">{mode==='login'?'New to AlphaTekx? Create an account':'Already have an account? Log in'}</button></div></main>
}
