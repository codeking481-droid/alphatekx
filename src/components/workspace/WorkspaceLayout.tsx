import { useEffect, useState, type PropsWithChildren } from 'react'
import { Bot, Boxes, CreditCard, KeyRound, LogOut, Menu, MessageCircle, Rocket, Shapes, Sparkles, UserRound, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { getCredits, hydrateCredits, subscribeCredits } from '../../lib/creditStore'
import { useAuth } from '../../lib/auth'

const links = [
  ['General chat', '/workspace', MessageCircle],
  ['Builder', '/builder', Sparkles],
  ['App Vault', '/vault', Boxes],
  ['Marketplace', '/marketplace', Shapes],
  ['Deploy', '/launch', Rocket],
  ['AI Workers', '/workspace?workers=1', Bot],
  ['API Keys', '/settings/api-keys', KeyRound],
  ['Account', '/account', UserRound],
] as const

export const onboardingSteps = ['Type your idea', 'Chat with AI', 'Publish and launch']
export const needsCreditTopUp = (credits: number) => credits < 5

export default function WorkspaceLayout({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false)
  const [credits, setCredits] = useState(getCredits())
  const { user, profile, signOut } = useAuth()

  useEffect(() => subscribeCredits(() => setCredits(getCredits())), [])
  useEffect(() => { void hydrateCredits() }, [user?.id])
  useEffect(() => { if (profile) setCredits(profile.credits) }, [profile])

  return <div className="min-h-screen bg-white text-[#111]">
    <button onClick={() => setOpen(true)} className="fixed left-4 top-4 z-40 grid size-11 place-items-center rounded-full border border-gray-200 bg-white shadow-sm" aria-label="Open menu"><Menu size={20}/></button>
    {open && <button className="fixed inset-0 z-40 bg-black/25" onClick={() => setOpen(false)} aria-label="Close menu"/>}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[88vw] flex-col border-r border-gray-200 bg-white transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-16 items-center justify-between border-b border-gray-100 px-5"><NavLink to="/workspace" onClick={() => setOpen(false)} className="text-sm font-semibold tracking-[.14em]">ALPHATEKX</NavLink><button onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full hover:bg-gray-100" aria-label="Close menu"><X size={19}/></button></div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">{links.map(([label, to, Icon]) => <NavLink key={label} to={to} onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-lg px-4 text-sm ${isActive ? 'bg-gray-100 font-medium text-black' : 'text-gray-600 hover:bg-gray-50'}`}><Icon size={18}/>{label}</NavLink>)}</nav>
      <div className="border-t border-gray-200 p-4"><div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-3 text-sm"><span className="flex items-center gap-2"><CreditCard size={16}/>Credits</span><strong>{credits}</strong></div>{needsCreditTopUp(credits)&&<p className="mt-2 text-xs text-gray-500">Low credits. Open Account to add more.</p>}<div className="mt-3 flex items-center gap-2"><span className="grid size-9 place-items-center rounded-full bg-black text-xs text-white">{user?.email?.[0]?.toUpperCase() ?? 'A'}</span><span className="min-w-0 flex-1 truncate text-xs text-gray-500">{user?.email}</span><button onClick={() => void signOut()} className="grid size-10 place-items-center" aria-label="Sign out"><LogOut size={17}/></button></div></div>
    </aside>
    <main className="min-h-screen">{children}</main>
  </div>
}
