import { ArrowRight, Link2, Store, Wand2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const cards = [
  {
    id: 'scan',
    label: 'SCAN',
    title: 'SCAN MY LINK — Report Only',
    description: 'Paste link, get PDF of API leak, secret, broken env — report only, no touch.',
    button: 'Scan, Don\'t Touch',
    route: '/scan',
    gradient: 'from-cyan-500/25 via-cyan-500/8 to-sky-500/5',
    icon: Link2,
    iconGradient: 'from-cyan-400 to-sky-500',
    border: 'border-cyan-400/30',
    shadow: 'shadow-[0_24px_70px_rgba(34,211,238,0.12)]',
  },
  {
    id: 'restore',
    label: 'RESTORE',
    title: 'RESTORE MY VIDEO — Heal My Broken Video',
    description: 'Upload shaky or unfinished footage and restore it to world-class quality — short to long, long to short.',
    button: 'Restore to World-Class',
    route: '/restore',
    gradient: 'from-violet-500/25 via-fuchsia-500/8 to-rose-500/5',
    icon: Wand2,
    iconGradient: 'from-violet-400 to-pink-500',
    border: 'border-violet-400/30',
    shadow: 'shadow-[0_24px_70px_rgba(168,85,247,0.12)]',
  },
  {
    id: 'market',
    label: 'SELL',
    title: 'SELL MY WORK — Market',
    description: 'Put restored video, app, or template for sale from $19 / $49 / $99 and chat with owners.',
    button: 'Put For Sale',
    route: '/market',
    gradient: 'from-emerald-500/25 via-lime-500/8 to-yellow-500/5',
    icon: Store,
    iconGradient: 'from-emerald-400 to-yellow-400',
    border: 'border-emerald-400/30',
    shadow: 'shadow-[0_24px_70px_rgba(16,185,129,0.12)]',
  },
] as const

export default function Home() {
  const navigate = useNavigate()

  return (
    <main className="min-h-full bg-[#0A0A0A] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 text-left sm:mb-10">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-300">Alpha Restoration HQ</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.06em] text-white sm:text-5xl">AGEN — Alpha Restoration HQ</h1>
        </header>

        <section className="grid gap-8 lg:grid-cols-3 lg:gap-8">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => navigate(card.route)}
                className={`group relative flex min-h-[315px] w-full flex-col justify-between overflow-hidden rounded-[28px] border bg-gradient-to-br p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-2xl ${card.border} ${card.shadow} ${card.gradient}`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_30%)]" />
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div className={`grid size-14 place-items-center rounded-2xl bg-gradient-to-br ${card.iconGradient} text-black shadow-lg`}>
                    <Icon size={24} />
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-white/85">
                    {card.label}
                  </span>
                </div>

                <div className="relative z-10 mt-6">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">Alpha</p>
                  <h2 className="mt-3 text-2xl font-black leading-tight tracking-[-0.05em] text-white">{card.title}</h2>
                  <p className="mt-4 max-w-md text-sm leading-6 text-slate-200/85">{card.description}</p>
                </div>

                <div className="relative z-10 mt-6 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white/80">{card.button}</span>
                  <span className="grid size-10 place-items-center rounded-full border border-white/10 bg-black/20 text-white transition group-hover:translate-x-1">
                    <ArrowRight size={18} />
                  </span>
                </div>
              </button>
            )
          })}
        </section>
      </div>
    </main>
  )
}
