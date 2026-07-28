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

  return <div className="flex min-h-[100dvh] flex-col overflow-hidden bg-white text-slate-900">
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 shadow-[0_8px_25px_rgba(15,23,42,.08)] backdrop-blur-xl">
      <button onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm" aria-label="Open menu"><Menu size={20}/></button>
      <NavLink to="/dashboard" className="text-sm font-black tracking-[.14em]">ALPHATEKX</NavLink>
      <button onClick={() => navigate('/settings?tab=billing')} className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2 text-sm font-black text-[#6D28D9] shadow-sm transition hover:bg-violet-100">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#6D28D9]" />
        <span className={!isAdmin && needsCreditTopUp(credits) ? 'text-amber-700' : 'text-[#6D28D9]'}>{isAdmin ? 'Admin' : `${credits} Credits`}</span>
      </button>
    </header>
    {open && <button className="fixed inset-0 z-40 bg-slate-950/30" onClick={() => setOpen(false)} aria-label="Close menu"/>}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[88vw] flex-col border-r border-slate-200 bg-white shadow-[20px_0_50px_rgba(15,23,42,.12)] transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5"><span className="text-sm font-black tracking-[.14em]">ALPHATEKX</span><button onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-xl hover:bg-slate-100" aria-label="Close menu"><X size={19}/></button></div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {primary.map(([label, to, Icon]) => <NavLink key={label} to={to} title={label} onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold ${isActive ? 'bg-violet-100 text-[#6D28D9]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}><Icon size={18}/>{label}{label === 'Running Automations' && running > 0 && <span className="ml-auto flex h-2 w-2 rounded-full bg-emerald-500" />}</NavLink>)}
        <div className="my-3 border-t border-slate-200" />
        {secondary.map(([label, to, Icon]) => <NavLink key={label} to={to} title={label} onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold ${isActive ? 'bg-violet-100 text-[#6D28D9]' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={18}/>{label}</NavLink>)}
        {isAdmin && <NavLink to="/admin" title="Admin" onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold ${isActive ? 'bg-violet-100 text-[#6D28D9]' : 'text-[#6D28D9] hover:bg-violet-50'}`}><ShieldCheck size={18}/>Admin</NavLink>}
        <div className="my-3 border-t border-slate-200" />
        <button onClick={() => void signOut()} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100"><LogOut size={18}/>Logout</button>
      </nav>
      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-[#6D28D9] text-xs font-black text-white">{user?.email?.[0]?.toUpperCase() ?? 'A'}</span><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-500">{user?.email}</div><span className="inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-[#6D28D9]">{getPlan(plan).name}</span></div></div>
      </div>
    </aside>

    <main className="flex-1 min-h-0 overflow-y-auto pt-16 pb-16 lg:pb-0">
      {isHome && show && (
        <div className="mx-auto max-w-3xl px-4 pt-6">
          <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_15px_40px_rgba(15,23,42,.08)]">
            <button onClick={dismiss} className="absolute right-3 top-3 text-slate-400 hover:text-slate-900"><X size={16} /></button>
            <div className="flex items-center gap-2 text-sm font-black text-slate-900"><Sparkles size={16} className="text-[#6D28D9]" /> How Alpha works</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black text-[#6D28D9]">1. Type your idea</div>
                <p className="mt-1 text-xs font-semibold text-slate-500">Describe what you want automated in plain language.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black text-[#6D28D9]">2. Chat with AI</div>
                <p className="mt-1 text-xs font-semibold text-slate-500">Alpha asks missing details and builds the plan.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black text-[#6D28D9]">3. Publish and launch</div>
                <p className="mt-1 text-xs font-semibold text-slate-500">Approve the automation and Alpha runs it for you.</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {children}
    </main>

    <nav className="fixed bottom-0 left-0 right-0 z-30 flex min-h-16 items-center gap-1 overflow-x-auto border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_25px_rgba(15,23,42,.08)] backdrop-blur-xl scrollbar-hide lg:hidden">
      {mobileNav.map(([label, to, Icon]) => (
        <NavLink key={label} to={to} title={label} className={({ isActive }) => `flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-black ${isActive ? 'text-[#6D28D9]' : 'text-slate-400'}`}>
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  </div>
}

