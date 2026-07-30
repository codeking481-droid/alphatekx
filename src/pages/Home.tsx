import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Instagram, Linkedin, Mail, Plug, Sparkles, Twitter, Youtube } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getConnectedApps } from '../lib/connectors/connectorApi'
import { getIntegrationStatus } from '../lib/integrations'
import AutomationSetupWizard, { useSetupWizard } from '../components/automation/AutomationSetupWizard'

const platforms = [
  { id: 'x', label: 'Twitter / X', description: 'Posts and threads', icon: Twitter, soon: false },
  { id: 'instagram', label: 'Instagram', description: 'Posts, reels and stories', icon: Instagram, soon: false },
  { id: 'linkedin', label: 'LinkedIn', description: 'Professional publishing', icon: Linkedin, soon: false },
  { id: 'gmail', label: 'Gmail', description: 'Email and attachments', icon: Mail, soon: false },
  { id: 'youtube', label: 'YouTube', description: 'Videos and channel actions', icon: Youtube, soon: false },
]

export default function Home() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selected, setSelected] = useState(searchParams.get('platform') || '')
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState('')
  const wizard = useSetupWizard()

  // Auto-popup setup wizard 1 second after landing
  useEffect(() => {
    const cleanup = wizard.checkAndOpen()
    return () => { if (typeof cleanup === 'function') cleanup() }
  }, [wizard.checkAndOpen])

  const refresh = async () => {
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
    }
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
    navigate(`/connected-apps?platform=${encodeURIComponent(platform.id)}&autostart=1&returnTo=${encodeURIComponent(`/dashboard?platform=${platform.id}`)}`)
  }

  return (
    <section className="min-h-full bg-violet-500/10 px-4 py-12 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-[820px]">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#6D28D9] text-white shadow-[0_18px_40px_rgba(109,40,217,.3)]"><Sparkles size={29}/></span>
          <p className="mt-7 text-xs font-black uppercase tracking-[.2em] text-violet-300">Welcome to AlphaTekx</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-.05em] text-white sm:text-6xl">What do you want to automate today?</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg font-semibold leading-8 text-slate-400">Ask Alpha anything about automation. Choose the platform for your first job, and Alpha will guide you one clear decision at a time.</p>
        </div>

        <div className="mx-auto mt-12 max-w-2xl rounded-[1.75rem] border border-violet-400/20 bg-violet-500/10 p-6 shadow-[0_28px_70px_rgba(15,23,42,.14)] sm:p-8">
          <fieldset>
            <legend className="text-xs font-black uppercase tracking-[.16em] text-slate-300">Choose your platform</legend>
            <p id="platform-help" className="mt-2 text-sm font-semibold text-slate-400">Select one app to connect or continue to its Command Centre.</p>
            <div role="radiogroup" aria-describedby="platform-help" className="mt-5 grid gap-3 sm:grid-cols-2">
              {platforms.map((item, index) => {
                const active = selected === item.id
                const ready = connected.has(item.id)
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={item.soon}
                    onClick={() => { setSelected(item.id); setNotice('') }}
                    className={`group relative flex min-h-[92px] items-center gap-4 overflow-hidden rounded-2xl border p-4 text-left transition duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-400/25 ${index === platforms.length - 1 ? 'sm:col-span-2' : ''} ${active ? 'border-violet-400 bg-violet-500/20 shadow-[0_14px_35px_rgba(109,40,217,.25),inset_0_1px_0_rgba(255,255,255,.14)]' : 'border-white/10 bg-white/[.045] shadow-[inset_0_1px_0_rgba(255,255,255,.07)] hover:-translate-y-0.5 hover:border-violet-400/45 hover:bg-white/[.075]'}`}
                  >
                    <span className={`grid size-12 shrink-0 place-items-center rounded-xl border transition ${active ? 'border-violet-300/40 bg-violet-500 text-white shadow-lg shadow-violet-950/30' : 'border-white/10 bg-white/[.06] text-violet-300 group-hover:text-white'}`}><Icon size={22}/></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-black text-white">{item.label}</span>
                      <span className="mt-1 block text-xs font-semibold text-slate-400">{item.description}</span>
                      <span className={`mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.08em] ${ready ? 'text-emerald-300' : 'text-slate-400'}`}>
                        <span className={`size-1.5 rounded-full ${ready ? 'bg-emerald-400' : 'bg-slate-500'}`}/>
                        {item.soon ? 'Coming soon' : ready ? 'Connected' : 'Ready to connect'}
                      </span>
                    </span>
                    {active && <CheckCircle2 aria-hidden="true" className="absolute right-3 top-3 text-violet-300" size={19}/>}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {notice && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-500/10 p-3 text-sm font-bold text-rose-300">{notice}</p>}

          {!isConnected ? (
            <button onClick={connect} disabled={!platform || platform.soon} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#6D28D9] font-black text-white shadow-[0_15px_35px_rgba(109,40,217,.28)] transition hover:-translate-y-0.5 hover:bg-[#5B21B6] disabled:translate-y-0 disabled:opacity-40"><Plug size={19}/>Connect {platform?.label || 'platform'}</button>
          ) : (
            <button onClick={() => navigate(`/automations?platform=${encodeURIComponent(selected)}`)} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#6D28D9] font-black text-white shadow-[0_15px_35px_rgba(109,40,217,.28)] transition hover:-translate-y-0.5 hover:bg-[#5B21B6]">Go to Command Centre <ArrowRight size={19}/></button>
          )}
          <p className="mt-4 text-center text-xs font-bold text-slate-400">Connections are powered securely behind AlphaTekx. Your provider credentials never appear here.</p>
        </div>
      </div>
      <AutomationSetupWizard open={wizard.open} onComplete={wizard.close} />
    </section>
  )
}
