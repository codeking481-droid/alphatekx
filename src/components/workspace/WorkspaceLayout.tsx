import { useEffect, useState, type PropsWithChildren } from 'react'
import { Bot, FolderOpen, HandCoins, HelpCircle, History, ListChecks, LogOut, Menu, Plug, Settings, ShieldCheck, Sparkles, X } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { getCredits, hydrateCredits, subscribeCredits } from '../../lib/creditStore'
import { useAuth } from '../../lib/auth'
import { runningAgentsCount, subscribeAgents } from '../../lib/agents/agentStore'
import { getPlan } from '../../lib/billing'
import { isAdminUser } from '../../lib/adminAccess'

const ONBOARDING_KEY = 'alphatekx:workspace-onboarding'

const primary = [
  ['Automate', '/automations', Sparkles],
  ['Running Automations', '/active-automations', ListChecks],
  ['History', '/history', History],
  ['Media Library', '/media-library', FolderOpen],
  ['Money Loop', '/leads', HandCoins],
  ['Connected Apps', '/connected-apps', Plug],
] as const

const secondary = [
  ['Settings', '/settings', Settings],
  ['Help', '/help', HelpCircle],
] as const

const mobileNav = [
  ['Automate', '/automations', Sparkles],
  ['Active', '/active-automations', Bot],
  ['History', '/history', History],
  ['Apps', '/connected-apps', Plug],
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
  const navigate = useNavigate()
  const location = useLocation()
  const { show, dismiss } = useShowOnboarding()
  const isAdmin = isAdminUser(user)

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

  return <div className="workspace-living-bg relative flex min-h-[100dvh] flex-col overflow-hidden text-white">
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-violet-400/20 bg-[#0A0F1E]/85 px-4 shadow-[0_8px_25px_rgba(3,7,18,.28)] backdrop-blur-xl">
      <button onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-white shadow-sm" aria-label="Open menu"><Menu size={20}/></button>
      <NavLink to="/dashboard" className="text-sm font-black tracking-[.14em] text-white">ALPHATEKX</NavLink>
      <button onClick={() => navigate('/settings?tab=billing')} className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-500/10 px-3.5 py-2 text-sm font-black text-violet-300 shadow-sm transition hover:bg-violet-500/10">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#6D28D9]" />
        <span className={!isAdmin && needsCreditTopUp(credits) ? 'text-amber-300' : 'text-violet-300'}>{isAdmin ? 'Admin' : `${credits} Credits`}</span>
      </button>
    </header>
    {open && <button className="fixed inset-0 z-40 bg-slate-950/30" onClick={() => setOpen(false)} aria-label="Close menu"/>}
    <aside className={`liquid-glass fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[88vw] flex-col border-r border-violet-400/20 text-white shadow-[20px_0_50px_rgba(3,7,18,.35)] transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-16 items-center justify-between border-b border-violet-400/20 px-5"><span className="text-sm font-black tracking-[.14em]">ALPHATEKX</span><button onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-xl hover:bg-violet-500/10" aria-label="Close menu"><X size={19}/></button></div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {primary.map(([label, to, Icon]) => <NavLink key={label} to={to} title={label} onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold ${isActive ? 'bg-violet-500/10 text-violet-300' : 'text-slate-400 hover:bg-blue-500/10 hover:text-white'}`}><Icon size={18}/>{label}{label === 'Running Automations' && running > 0 && <span className="ml-auto flex h-2 w-2 rounded-full bg-emerald-500" />}</NavLink>)}
        <div className="my-3 border-t border-violet-400/20" />
        {secondary.map(([label, to, Icon]) => <NavLink key={label} to={to} title={label} onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold ${isActive ? 'bg-violet-500/10 text-violet-300' : 'text-slate-400 hover:bg-blue-500/10'}`}><Icon size={18}/>{label}</NavLink>)}
        {isAdmin && <NavLink to="/admin" title="Admin" onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold ${isActive ? 'bg-violet-500/10 text-violet-300' : 'text-violet-300 hover:bg-violet-500/10'}`}><ShieldCheck size={18}/>Admin</NavLink>}
        <div className="my-3 border-t border-violet-400/20" />
        <button onClick={() => void signOut()} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-sm font-bold text-slate-400 hover:bg-blue-500/10"><LogOut size={18}/>Logout</button>
      </nav>
      <div className="border-t border-violet-400/20 p-4">
        <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-[#6D28D9] text-xs font-black text-white">{user?.email?.[0]?.toUpperCase() ?? 'A'}</span><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-400">{user?.email}</div><span className="inline-block rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-violet-300">{getPlan(plan).name}</span></div></div>
      </div>
    </aside>

    <main className="relative z-10 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] pt-16 lg:pb-0">
      {isHome && show && (
        <div className="mx-auto max-w-3xl px-4 pt-6">
          <div className="relative rounded-2xl border border-violet-400/20 bg-violet-500/10 p-5 shadow-[0_15px_40px_rgba(15,23,42,.08)]">
            <button onClick={dismiss} className="absolute right-3 top-3 text-slate-400 hover:text-white"><X size={16} /></button>
            <div className="flex items-center gap-2 text-sm font-black text-white"><Sparkles size={16} className="text-violet-300" /> How Alpha works</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-violet-400/20 bg-blue-500/10 p-4">
                <div className="text-xs font-black text-violet-300">1. Type your idea</div>
                <p className="mt-1 text-xs font-semibold text-slate-400">Describe what you want automated in plain language.</p>
              </div>
              <div className="rounded-xl border border-violet-400/20 bg-blue-500/10 p-4">
                <div className="text-xs font-black text-violet-300">2. Chat with AI</div>
                <p className="mt-1 text-xs font-semibold text-slate-400">Alpha asks missing details and builds the plan.</p>
              </div>
              <div className="rounded-xl border border-violet-400/20 bg-blue-500/10 p-4">
                <div className="text-xs font-black text-violet-300">3. Publish and launch</div>
                <p className="mt-1 text-xs font-semibold text-slate-400">Approve the automation and Alpha runs it for you.</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {children}
    </main>

    <nav className="fixed bottom-0 left-0 right-0 z-30 grid min-h-16 grid-cols-5 items-center border-t border-violet-400/20 bg-[#0A0F1E]/90 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_25px_rgba(3,7,18,.3)] backdrop-blur-xl lg:hidden">
      {mobileNav.map(([label, to, Icon]) => (
        <NavLink key={label} to={to} title={label} className={({ isActive }) => `flex min-w-0 flex-col items-center justify-center gap-1 rounded-full px-0.5 py-2 text-[9px] font-black min-[380px]:text-[10px] ${isActive ? 'bg-[#7C3AED] text-white' : 'text-slate-400'}`}>
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  </div>
}

