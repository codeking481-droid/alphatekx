import { useEffect, useState, type PropsWithChildren } from 'react'
import { Atom, FolderOpen, HelpCircle, History, LogOut, Menu, Settings, ShieldCheck, Sparkles, X } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { getCredits, hydrateCredits, subscribeCredits } from '../../lib/creditStore'
import { useAuth } from '../../lib/auth'
import { runningAgentsCount, subscribeAgents } from '../../lib/agents/agentStore'
import { getPlan } from '../../lib/billing'
import { isAdminUser } from '../../lib/adminAccess'
import { useAgentExecutor } from '../../lib/agents/useAgentExecutor'

const ONBOARDING_KEY = 'alphatekx:workspace-onboarding'

const primary = [
  ['Agen', '/agen', Atom],
  ['History', '/history', History],
  ['Media Library', '/media-library', FolderOpen],
  ['Market', '/market', FolderOpen],
] as const

const secondary = [
  ['Settings', '/settings', Settings],
  ['Help', '/help', HelpCircle],
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
  // Wake the durable scheduler whenever an authenticated workspace is open.
  // This catches overdue work after a sleeping web service starts again.
  useAgentExecutor()
  const [open, setOpen] = useState(false)
  const [credits, setCredits] = useState(getCredits())
  const [plan, setPlan] = useState('free')
  const [running, setRunning] = useState(runningAgentsCount())
  const { session, user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { show, dismiss } = useShowOnboarding()
  const isAdmin = isAdminUser(user)

  useEffect(() => {
    const syncSidebar = () => {
      setOpen(false)
    }
    syncSidebar()
    window.addEventListener('resize', syncSidebar)

    const unsubscribeCredits = subscribeCredits(() => setCredits(getCredits()))
    const unsubscribeAgents = subscribeAgents(() => setRunning(runningAgentsCount()))
    return () => {
      window.removeEventListener('resize', syncSidebar)
      unsubscribeCredits()
      unsubscribeAgents()
    }
  }, [])
  useEffect(() => { void hydrateCredits() }, [user?.id])
  useEffect(() => {
    const storedPlan = (() => {
      try { return localStorage.getItem('alphatekx_plan') || 'free' } catch { return 'free' }
    })()
    if (profile) {
      setCredits(profile.credits)
      setPlan(profile.plan || storedPlan || 'free')
      return
    }
    setPlan(storedPlan)
  }, [profile])
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

  const isHome = location.pathname === '/agen' || location.pathname === '/dashboard' || location.pathname === '/onboarding'
  const toggleSidebar = () => setOpen((prev) => !prev)

  return <div className="workspace-living-bg relative flex h-[100dvh] w-full min-h-0 flex-col overflow-hidden text-white">
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-[#111214]/90 px-4 backdrop-blur-2xl">
      <button onClick={toggleSidebar} className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.02] text-white transition hover:bg-white/[0.04]" aria-label={open ? 'Close menu' : 'Open menu'}><Menu size={18}/></button>
      <NavLink to="/agen" className="text-sm font-black tracking-[.14em] text-white">ALPHATEKX</NavLink>
      <button onClick={() => navigate('/settings?tab=billing')} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.04]">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#F5C518]" />
        <span className={!isAdmin && needsCreditTopUp(credits) ? 'text-[#F5C518]' : 'text-white'}>{isAdmin ? 'Admin' : `${credits} Credits`}</span>
      </button>
    </header>
    {open && <button className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 backdrop-blur-[1px] lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"/>}
    {!open && <button className="fixed left-4 top-[86px] z-40 grid size-11 place-items-center rounded-xl border border-white/10 bg-[#111214]/90 text-white shadow-lg transition hover:bg-white/[0.04] lg:left-5" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18}/></button>}
    <aside className={`fixed inset-y-0 left-0 z-50 flex max-w-[82vw] flex-col border-r border-white/10 bg-[#111214]/95 text-white shadow-[0_12px_45px_rgba(0,0,0,0.42)] backdrop-blur-2xl transition-all duration-200 ease-out ${open ? 'w-[284px] translate-x-0' : '-translate-x-full w-[284px]'}`}>
      <div className="flex h-[72px] items-center justify-between px-3">
        <NavLink to="/agen" onClick={() => setOpen(false)} className="flex items-center gap-3 overflow-hidden">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-sm font-black text-[#0B0B0C]">A</span>
          {open && <span><strong className="block text-sm font-black tracking-[.12em]">ALPHATEKX</strong><small className="block text-[10px] font-medium text-[#8A8A93]">Alpha restoration</small></span>}
        </NavLink>
        <button onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-xl text-[#8A8A93] transition hover:bg-white/5 hover:text-white lg:hidden" aria-label="Close menu"><X size={18}/></button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        <p className={`mb-2 px-3 pt-4 text-[10px] font-black uppercase tracking-[.18em] text-[#8A8A93] ${!open ? 'hidden' : ''}`}>Workspace</p>
        <div className="space-y-1">
          {primary.map(([label, to, Icon]) => <NavLink key={label} to={to} title={label} onClick={() => setOpen(false)} className={({ isActive }) => `group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition ${isActive ? 'bg-white/[0.04] text-white' : 'text-[#8A8A93] hover:bg-white/[.02] hover:text-white'} ${!open ? 'justify-center px-2' : ''}`}><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${location.pathname.startsWith(to) ? 'bg-white/[0.06] text-white' : 'text-[#8A8A93] group-hover:text-white'}`}><Icon size={17}/></span>{open && <span className="min-w-0 flex-1 truncate">{label}</span>}{location.pathname.startsWith(to) && open && <i className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-white"/>}</NavLink>)}
        </div>
        <p className={`mb-2 mt-6 px-3 text-[10px] font-black uppercase tracking-[.18em] text-[#8A8A93] ${!open ? 'hidden' : ''}`}>Account</p>
        <div className="space-y-1">
          {secondary.map(([label, to, Icon]) => <NavLink key={label} to={to} title={label} onClick={() => setOpen(false)} className={({ isActive }) => `group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition ${isActive ? 'bg-white/[0.04] text-white' : 'text-[#8A8A93] hover:bg-white/[.02] hover:text-white'} ${!open ? 'justify-center px-2' : ''}`}><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${location.pathname.startsWith(to) ? 'bg-white/[0.06] text-white' : 'text-[#8A8A93] group-hover:text-white'}`}><Icon size={17}/></span>{open && label}{open && location.pathname.startsWith(to) && <i className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-white"/>}</NavLink>)}
          {isAdmin && <NavLink to="/admin" title="Admin" onClick={() => setOpen(false)} className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-[#8A8A93] hover:bg-white/[.02] hover:text-white ${!open ? 'justify-center px-2' : ''}`}><span className="grid size-8 place-items-center rounded-lg text-[#8A8A93]"><ShieldCheck size={17}/></span>{open && 'Admin'}</NavLink>}
        </div>
      </nav>
      <div className="border-t border-white/10 p-3">
        <button onClick={() => { setOpen(false); void signOut() }} className="group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-[#8A8A93] transition hover:bg-white/[.02] hover:text-white">
          <span className="grid size-8 place-items-center rounded-lg text-[#8A8A93] group-hover:text-white"><LogOut size={17}/></span>
          Sign Out
        </button>
      </div>
      <div className="p-3 pt-0">
        <button onClick={() => { setOpen(false); navigate('/settings') }} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.04]">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-xs font-black text-[#0B0B0C]">{user?.email?.[0]?.toUpperCase() ?? 'A'}</span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-xs font-bold text-white">{user?.email}</strong><small className="mt-0.5 block text-[10px] font-black uppercase tracking-wide text-[#8A8A93]">{getPlan(plan).name} plan</small></span>
        </button>
      </div>
    </aside>

    <main
      id="workspace-scroll-root"
      className={`relative z-10 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain scroll-smooth pt-16 transition-[padding] duration-200 [-webkit-overflow-scrolling:touch] ${open ? 'lg:pl-[284px]' : 'lg:pl-0'}`}
    >
      {isHome && show && (
        <div className="mx-auto w-full max-w-[430px] px-4 pt-6 sm:max-w-3xl">
          <div className="relative rounded-2xl border border-white/10 bg-[#111214] p-5">
            <button onClick={dismiss} className="absolute right-3 top-3 text-[#8A8A93] hover:text-white"><X size={16} /></button>
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles size={16} className="text-white" /> How Alpha works</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-xs font-black uppercase tracking-[0.12em] text-white">1. Type</div>
                <p className="mt-1 text-xs font-medium text-[#8A8A93]">Describe what you want automated in plain language.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-xs font-black uppercase tracking-[0.12em] text-white">2. Review</div>
                <p className="mt-1 text-xs font-medium text-[#8A8A93]">Alpha maps the missing details and builds the plan.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-xs font-black uppercase tracking-[0.12em] text-white">3. Launch</div>
                <p className="mt-1 text-xs font-medium text-[#8A8A93]">Approve and let the automation run for you.</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {children}
    </main>
  </div>
}

