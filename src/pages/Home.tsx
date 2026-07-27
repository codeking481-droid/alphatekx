import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, ChevronDown, Instagram, Linkedin, LoaderCircle, Mail, Plug, Sparkles, Twitter, Youtube } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getConnectedApps } from '../lib/connectors/connectorApi'
import { getIntegrationStatus } from '../lib/integrations'

const platforms = [
  { id: 'x', label: 'Twitter / X', icon: Twitter, soon: false },
  { id: 'instagram', label: 'Instagram', icon: Instagram, soon: false },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, soon: false },
  { id: 'gmail', label: 'Gmail', icon: Mail, soon: false },
  { id: 'youtube', label: 'YouTube', icon: Youtube, soon: true },
]

export default function Home() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selected, setSelected] = useState(searchParams.get('platform') || '')
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      const [native, composio] = await Promise.all([
        getIntegrationStatus(session?.access_token),
        getConnectedApps(session?.access_token).catch(() => ({ providers: [], executions: [] })),
      ])
      const ready = new Set<string>()
      for (const [id, state] of Object.entries(native)) {
        if (id === '_access') continue
        if ('connected' in state && state.connected && state.ready) ready.add(id)
      }
      for (const provider of composio.providers) {
        if (provider.connected) ready.add(provider.provider === 'twitter' ? 'x' : provider.provider)
      }
      if (ready.has('google')) ready.add('gmail')
      setConnected(ready)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not verify connected apps.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [session?.access_token])
  useEffect(() => {
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [session?.access_token])

  const platform = useMemo(() => platforms.find(item => item.id === selected), [selected])
  const isConnected = selected ? connected.has(selected) : false

  const connect = () => {
    if (!platform || platform.soon) return
    navigate(`/connected-apps?platform=${encodeURIComponent(platform.id)}&returnTo=${encodeURIComponent(`/dashboard?platform=${platform.id}`)}`)
  }

  return (
    <section className="min-h-full bg-white px-4 py-12 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-[820px]">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#6D28D9] text-white shadow-[0_18px_40px_rgba(109,40,217,.3)]"><Sparkles size={29}/></span>
          <p className="mt-7 text-xs font-black uppercase tracking-[.2em] text-[#6D28D9]">Welcome to AlphaTekx</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-.05em] text-slate-900 sm:text-6xl">What do you want to automate today?</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg font-semibold leading-8 text-slate-600">Ask Alpha anything about automation. Choose the platform for your first job, and Alpha will guide you one clear decision at a time.</p>
        </div>

        <div className="mx-auto mt-12 max-w-2xl rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_28px_70px_rgba(15,23,42,.14)] sm:p-8">
          <label htmlFor="platform" className="text-xs font-black uppercase tracking-[.16em] text-slate-600">Select Platform</label>
          <div className="relative mt-3">
            <select id="platform" value={selected} onChange={event => { setSelected(event.target.value); setNotice('') }} className="min-h-16 w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-5 pr-12 text-base font-black text-slate-900 outline-none transition focus:border-[#6D28D9] focus:ring-4 focus:ring-violet-100">
              <option value="">Choose a platform</option>
              {platforms.map(item => <option key={item.id} value={item.id} disabled={item.soon}>{item.label}{item.soon ? ' — Coming Soon' : ''}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[#6D28D9]" />
          </div>

          {platform && (
            <div className={`mt-5 flex items-center gap-4 rounded-2xl border p-4 ${platform.soon ? 'border-amber-200 bg-amber-50' : isConnected ? 'border-emerald-200 bg-emerald-50' : 'border-violet-200 bg-violet-50'}`}>
              <span className={`grid size-12 place-items-center rounded-xl ${isConnected ? 'bg-emerald-600 text-white' : 'bg-white text-[#6D28D9] shadow-sm'}`}>{isConnected ? <CheckCircle2/> : <platform.icon/>}</span>
              <div className="min-w-0 flex-1"><p className="font-black text-slate-900">{platform.label}</p><p className="mt-0.5 text-sm font-bold text-slate-500">{platform.soon ? 'Coming Soon' : isConnected ? 'Connected securely to AlphaTekx' : 'Connect securely to continue'}</p></div>
              {platform.soon && <span className="rounded-full bg-amber-200 px-3 py-1 text-[10px] font-black text-amber-900">COMING SOON</span>}
            </div>
          )}

          {loading && <p className="mt-5 flex items-center justify-center gap-2 text-sm font-bold text-slate-500"><LoaderCircle size={16} className="animate-spin"/>Checking your apps…</p>}
          {notice && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{notice}</p>}

          {!isConnected ? (
            <button onClick={connect} disabled={!platform || platform.soon || loading} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#6D28D9] font-black text-white shadow-[0_15px_35px_rgba(109,40,217,.28)] transition hover:-translate-y-0.5 hover:bg-[#5B21B6] disabled:translate-y-0 disabled:opacity-40"><Plug size={19}/>Connect {platform?.label || 'platform'}</button>
          ) : (
            <button onClick={() => navigate(`/automations?platform=${encodeURIComponent(selected)}`)} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#6D28D9] font-black text-white shadow-[0_15px_35px_rgba(109,40,217,.28)] transition hover:-translate-y-0.5 hover:bg-[#5B21B6]">Go to Command Centre <ArrowRight size={19}/></button>
          )}
          <p className="mt-4 text-center text-xs font-bold text-slate-400">Connections are powered securely behind AlphaTekx. Your provider credentials never appear here.</p>
        </div>
      </div>
    </section>
  )
}
