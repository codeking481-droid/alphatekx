import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Plus, Rocket, ShoppingBag, Sparkles, TrendingUp } from 'lucide-react'
import OnboardingModal, { useOnboarding } from '../components/OnboardingModal'
import { useAuth } from '../lib/auth'
import { getCreations } from '../lib/missionStore'
import { getJson } from '../lib/apiClient'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const onboarding = useOnboarding()
  const [insights, setInsights] = useState<{ id: string; title: string; description: string; severity: string }[]>([])

  useEffect(() => { void getJson<{ predictions: { id: string; title: string; description: string; severity: string }[] }>('/api/brain/predictions').then(d => setInsights(d.predictions || [])).catch(() => {}) }, [])

  const creations = getCreations().slice(0, 6)
  const emailFirstName = user?.email ? user.email.split('@')[0].split('.')[0].replace(/^./, c => c.toUpperCase()) : 'Builder'
  const displayName = (user && ('name' in user ? user.name : (user as { user_metadata?: { name?: string } }).user_metadata?.name)) || emailFirstName

  const actions = [
    { label: 'Build an app', sub: 'Website, tool, or platform', icon: Rocket, to: '/builder' },
    { label: 'Create an automation', sub: 'Let Alpha work for you', icon: Bot, to: '/agents' },
    { label: 'Check your brain', sub: 'Memory, goals, insights', icon: Sparkles, to: '/brain' },
    { label: 'Sell something', sub: 'Marketplace or your store', icon: ShoppingBag, to: '/marketplace' },
  ]

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-2 text-sm text-white/55">Hello, {displayName}</div>
        <h1 className="text-2xl font-bold md:text-3xl">What do you want to do today?</h1>
        <p className="mt-1 text-sm text-white/55">Pick one. Alpha handles the rest.</p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map(a => (
            <button key={a.label} onClick={() => navigate(a.to)} className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition-all hover:border-indigo-500/40 hover:bg-white/[0.08]">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg"><a.icon size={20} /></span>
              <h3 className="mt-4 text-base font-semibold">{a.label}</h3>
              <p className="mt-1 text-xs text-zinc-400">{a.sub}</p>
            </button>
          ))}
        </div>

        {insights.length > 0 && (
          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><TrendingUp size={16} className="text-indigo-300"/>Alpha Insights</div>
            <div className="space-y-2">
              {insights.slice(0, 3).map(p => (
                <div key={p.id} className={`rounded-xl border p-3 text-sm ${p.severity === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'}`}>
                  <div className="font-medium">{p.title}</div>
                  <p className="mt-0.5 text-xs opacity-80">{p.description}</p>
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/brain')} className="mt-3 text-xs font-medium text-indigo-300 hover:text-indigo-200">Open Brain →</button>
          </div>
        )}

        {creations.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold">Your projects</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {creations.map(c => (
                <button key={c.id} onClick={() => navigate(`/mission/${c.missionId}`)} className="group rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-left transition-all hover:border-indigo-400/30 hover:bg-white/[0.05]">
                  <h3 className="text-base font-semibold text-zinc-100">{c.title || 'Untitled project'}</h3>
                  <p className="mt-1 truncate text-sm text-zinc-500">{c.slug ? `${c.slug}.alphatekx.name.ng` : 'Draft'}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {creations.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/[0.06]"><Plus size={22} className="text-zinc-400" /></div>
            <h3 className="mt-3 text-base font-semibold">No projects yet</h3>
            <p className="mt-1 text-sm text-zinc-400">Tap “Build an app” and describe your idea. Alpha will build it.</p>
            <button onClick={() => navigate('/builder')} className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"><Plus size={16} /> Start building</button>
          </div>
        )}
      </div>
      <OnboardingModal open={onboarding.open} onComplete={onboarding.finish} onClose={onboarding.close} />
    </div>
  )
}
