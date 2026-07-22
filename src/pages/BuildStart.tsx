import { useEffect, useState } from 'react'
import { ArrowRight, Calculator, GraduationCap, LayoutTemplate, Newspaper, ShoppingBag, Sparkles, Store, UserSquare2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createMission } from '../lib/missionStore'
import BookAnimation from '../components/BookAnimation'

const templates = [
  { type: 'App', icon: GraduationCap, name: 'Learning Platform', prompt: 'Build a full AlphaLearn-style learning platform with dark sidebar, dashboard, course library with real courses and lessons, lesson player, interactive quiz with scoring, notes, progress tracking, printable certificate, profile and theme toggle. Persist everything to localStorage.' },
  { type: 'Store', icon: Store, name: 'E-commerce Shop', prompt: 'Build a full e-commerce shop website with landing hero, product grid with real products, cart drawer, checkout with receipt, order history and dark theme. Persist cart and orders to localStorage.' },
  { type: 'App', icon: Calculator, name: 'Calculator', prompt: 'Build a beautiful calculator app with history, memory, scientific mode, tip/split and dark theme' },
  { type: 'App', icon: LayoutTemplate, name: 'To-Do', prompt: 'Build a to-do app with categories, progress, dark mode and local storage' },
  { type: 'Website', icon: Newspaper, name: 'Blog', prompt: 'Build a modern blog website with featured post, category filter, search, single article view and newsletter signup with real sample posts' },
  { type: 'Website', icon: UserSquare2, name: 'Portfolio', prompt: 'Build a designer portfolio website with sticky nav, hero, about, skills, 6 real project cards, services, testimonials, contact form and theme toggle' },
  { type: 'Dashboard', icon: ShoppingBag, name: 'SaaS Dashboard', prompt: 'Build a SaaS dashboard with sidebar navigation, stats cards, chart and recent activity' },
]

const projectTypes = ['All', 'Website', 'App', 'Dashboard', 'Store']

export default function BuildStart() {
  const [searchParams] = useSearchParams()
  const [idea, setIdea] = useState(decodeURIComponent(searchParams.get('prompt') || ''))
  const [selectedType, setSelectedType] = useState('All')
  const navigate = useNavigate()
  const filteredTemplates = selectedType === 'All' ? templates : templates.filter(t => t.type === selectedType)
  useEffect(() => {
    const prompt = searchParams.get('prompt')
    if (prompt) setIdea(decodeURIComponent(prompt))
  }, [searchParams])
  const start = (prompt?: string) => {
    const chosen = (prompt ?? idea).trim()
    if (!chosen) return
    const mission = createMission(chosen)
    navigate(`/mission/${mission.id}?build=1`)
  }
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-12">
      <div className="mt-8 text-center">
        <BookAnimation />
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.05] px-4 py-1.5 text-xs font-medium text-zinc-300 shadow-premium backdrop-blur-md">
          <Sparkles size={13} className="text-indigo-400" /> Alpha Creation OS
        </div>
        <h1 className="text-4xl font-extrabold leading-tight tracking-[-0.02em] md:text-5xl">
          Turn your ideas into <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">reality.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-zinc-400">
          Describe what you want to build. Alpha understands, plans, codes, and previews it step by step.
        </p>
      </div>

      <div className="mx-auto mt-8 w-full max-w-2xl">
        <div className="rounded-3xl border border-white/[0.12] bg-white/[0.04] p-3 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-[24px]">
          <textarea
            autoFocus
            value={idea}
            onChange={event => setIdea(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); start() } }}
            className="h-28 w-full resize-none bg-transparent p-4 text-base text-zinc-100 outline-none placeholder:text-zinc-500"
            placeholder="For example: a barber booking app with services and WhatsApp confirmation"
          />
          <div className="flex justify-end px-2 pb-2">
            <button
              onClick={() => start()}
              disabled={!idea.trim()}
              className="btn-alpha flex min-h-12 items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Generate my app <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-2">
        {projectTypes.map(type => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${selectedType === type ? 'bg-white text-black' : 'border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-white'}`}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredTemplates.map(t => (
          <button
            key={t.name}
            onClick={() => start(t.prompt)}
            className="group flex flex-col items-start rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-left transition-all hover:scale-[1.02] hover:border-indigo-400/30 hover:bg-white/[0.06] hover:shadow-glow-indigo"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg">
              <t.icon size={20} />
            </span>
            <h3 className="mt-4 text-base font-semibold">{t.name}</h3>
            <p className="mt-1 text-sm text-zinc-500">Tap to start with this idea.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-indigo-300 group-hover:text-indigo-200">Build with this prompt <ArrowRight size={12} /></span>
          </button>
        ))}
      </div>

      <div className="mt-12 text-center text-sm text-zinc-500">
        Tip: the more details you give, the better Alpha builds.
      </div>
    </div>
  )
}
