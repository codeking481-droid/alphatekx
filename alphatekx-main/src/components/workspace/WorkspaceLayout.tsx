import { useEffect, useState, type PropsWithChildren } from 'react'
import { Bot, HelpCircle, History, LayoutDashboard, LogOut, Menu, Plug, Settings, Sparkles, X } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { getCredits, hydrateCredits, subscribeCredits } from '../../lib/creditStore'
import { useAuth } from '../../lib/auth'
import { runningAgentsCount, subscribeAgents } from '../../lib/agents/agentStore'
import { getPlan } from '../../lib/billing'

const ONBOARDING_KEY = 'alphatekx:workspace-onboarding'

const primary = [
  ['Dashboard', '/dashboard', LayoutDashboard],
  ['My Automations', '/automations', Bot],
  ['History', '/history', History],
  ['Connected Apps', '/connected-apps', Plug],
] as const

const secondary = [
  ['Settings', '/settings', Settings],
  ['Help', '/help', HelpCircle],
] as const

const mobileNav = [
  ['Dashboard', '/dashboard', LayoutDashboard],
  ['Auto', '/automations', Bot],
  ['Connect', '/connected-apps', Plug],
  ['History', '/history', History],
  ['Settings', '/settings', Settings],
] as const

const needsCreditTopUp = (credits: number) => credits < 5

function useShowOnboarding() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try { setShow(localStorage.getItem(ONBOARDING_KEY) !== 'dismissed') } catch { setShow(true) }
  }, [])
  const dismiss = () => {
    try { localStorage.setItem(ONBOARDING_KEY, 'dismissed') } catch {}
    setShow(false)
  }
  return { show, dismiss }
}

export default function WorkspaceLayout({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false)
  const [credits, setCredits] = useState(getCredits())
  const [plan, setPlan] = useState('free')
  const [running, setRunning] = useState(runningAgentsCount())
  const { session, user, profile, signOut } = useAuth()
  const isAdmin = user?.email?.toLowerCase() === 'iamdan4live@gmail.com'
  const navigate = useNavigate()
  const location = useLocation()
  const { show, dismiss } = useShowOnboarding()

  useEffect(() => subscribeCredits(() => setCredits(getCredits())), [])
  useEffect(() => subscribeAgents(() => setRunning(runningAgentsCount())), [])
  useEffect(() => { void hydrateCredits() }, [user?.id])
  useEffect(() => { if (profile) { setCredits(profile.credits); setPlan(profile.plan || 'free') } }, [profile])
  useEffect(() => {
    if (!user) return
    const body = JSON.stringify({ user: { id: user.id, email: user.email, name: ('name' in user ? user.name : undefined), credits: getCredits() } })
    const ping = () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      void fetch('/api/activity/ping', { method: 'POST', headers, body })
    }
    ping(); const timer = window.setInterval(ping, 60_000); return () => window.clearInterval(timer)
  }, [user, session?.access_token])

  const isHome = location.pathname === '/dashboard'

  return <div className="flex min-h-[100dvh] flex-col overflow-hidden liquid-glass text-white">
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/[0.08] bg-[#0B0215]/60 px-4 backdrop-blur-xl">
      <button onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-full border border-white/[.12] liquid-glass shadow-sm" aria-label="Open menu"><Menu size={20}/></button>
      <NavLink to="/dashboard" className="text-sm font-semibold tracking-[.14em]">ALPHATEKX</NavLink>
      <button onClick={() => navigate('/settings?tab=billing')} className="flex items-center gap-1.5 rounded-full border border-white/[.12] bg-white/[0.05] px-3 py-1.5 text-sm shadow-sm transition-colors hover:bg-white/[0.08]">
        <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
        <span className={needsCreditTopUp(credits) && !isAdmin ? 'text-amber-300' : 'text-white'}>{isAdmin ? '∞' : credits} Credits</span>
      </button>
    </header>
    {open && <button className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} aria-label="Close menu"/>}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[88vw] flex-col border-r border-white/[.12] liquid-glass transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5"><span className="text-sm font-semibold tracking-[.14em]">ALPHATEKX</span><button onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full hover:bg-white/[.08]" aria-label="Close menu"><X size={19}/></button></div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {primary.map(([label, to, Icon]) => <NavLink key={label} to={to} title={label} onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-lg px-4 text-sm ${isActive ? 'bg-white/[.08] font-medium text-white' : 'text-white/70 hover:bg-white/[.04]'}`}><Icon size={18}/>{label}{label === 'My Automations' && running > 0 && <span className="ml-auto flex h-2 w-2 rounded-full bg-emerald-500" />}</NavLink>)}
        <div className="my-3 border-t border-white/[0.08]" />
        {secondary.map(([label, to, Icon]) => <NavLink key={label} to={to} title={label} onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-lg px-4 text-sm ${isActive ? 'bg-white/[.08] font-medium text-white' : 'text-white/70 hover:bg-white/[.04]'}`}><Icon size={18}/>{label}</NavLink>)}
        <div className="my-3 border-t border-white/[0.08]" />
        <button onClick={() => void signOut()} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-sm text-white/70 hover:bg-white/[.04]"><LogOut size={18}/>Logout</button>
      </nav>
      <div className="border-t border-white/[.12] p-4">
        <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-full btn-alpha text-xs text-white">{user?.email?.[0]?.toUpperCase() ?? 'A'}</span><div className="min-w-0 flex-1"><div className="truncate text-xs text-white/55">{user?.email}</div><span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${getPlan(plan).badge ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white' : 'border border-white/15 bg-white/[0.05] text-zinc-300'}`}>{getPlan(plan).name}</span></div></div>
      </div>
    </aside>

    <main className="flex-1 min-h-0 overflow-y-auto pt-16 pb-16 lg:pb-0">
      {isHome && show && (
        <div className="mx-auto max-w-3xl px-4 pt-6">
          <div className="relative rounded-2xl border border-white/[.12] bg-white/[0.05] p-5">
            <button onClick={dismiss} className="absolute right-3 top-3 text-white/40 hover:text-white"><X size={16} /></button>
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles size={16} className="text-violet-400" /> How Alpha works</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/[.08] bg-white/[0.04] p-4">
                <div className="text-xs font-medium text-violet-300">1. Type your idea</div>
                <p className="mt-1 text-xs text-white/55">Describe what you want automated in plain language.</p>
              </div>
              <div className="rounded-xl border border-white/[.08] bg-white/[0.04] p-4">
                <div className="text-xs font-medium text-violet-300">2. Chat with AI</div>
                <p className="mt-1 text-xs text-white/55">Alpha asks missing details and builds the plan.</p>
              </div>
              <div className="rounded-xl border border-white/[.08] bg-white/[0.04] p-4">
                <div className="text-xs font-medium text-violet-300">3. Publish and launch</div>
                <p className="mt-1 text-xs text-white/55">Approve the automation and Alpha runs it for you.</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {children}
    </main>

    <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center gap-1 overflow-x-auto border-t border-white/[0.08] bg-background/80 px-2 backdrop-blur-xl scrollbar-hide lg:hidden">
      {mobileNav.map(([label, to, Icon]) => (
        <NavLink key={label} to={to} title={label} className={({ isActive }) => `flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium ${isActive ? 'text-violet-300' : 'text-zinc-500'}`}>
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  </div>
}
