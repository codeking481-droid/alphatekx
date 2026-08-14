import { ArrowRight, Menu, Link2, Store, Wand2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const cards = [
  {
    id: 'scan',
    label: 'SCAN',
    title: 'SCAN MY LINK',
    subtitle: 'Report Only',
    description: 'Security review for exposed secrets, API leaks, and broken frontend risks.',
    button: 'Scan, Don\'t Touch',
    route: '/scan',
    gradient: 'from-violet-500/20 via-indigo-500/5 to-transparent',
    icon: Link2,
    iconGradient: 'from-violet-500/25 to-violet-300/20',
    border: 'border-violet-300/30',
    glow: 'shadow-[0_0_40px_rgba(168,85,247,0.22)]',
  },
  {
    id: 'restore',
    label: 'RESTORE',
    title: 'RESTORE MY VIDEO',
    subtitle: 'Heal My Broken Video',
    description: 'Fix damaged footage into polished, high-quality output with a premium finish.',
    button: 'Restore to World-Class',
    route: '/restore',
    gradient: 'from-violet-500/20 via-indigo-500/5 to-transparent',
    icon: Wand2,
    iconGradient: 'from-violet-500/25 to-violet-300/20',
    border: 'border-violet-300/30',
    glow: 'shadow-[0_0_40px_rgba(168,85,247,0.22)]',
  },
  {
    id: 'market',
    label: 'SELL',
    title: 'SELL MY WORK',
    subtitle: 'Market',
    description: 'Monetize your restored work, templates, and digital products with a premium storefront.',
    button: 'Put For Sale',
    route: '/market',
    gradient: 'from-violet-500/20 via-indigo-500/5 to-transparent',
    icon: Store,
    iconGradient: 'from-violet-500/25 to-violet-300/20',
    border: 'border-violet-300/30',
    glow: 'shadow-[0_0_40px_rgba(168,85,247,0.22)]',
  },
] as const

export default function Home() {
  const navigate = useNavigate()

  return (
    <main className="min-h-screen bg-[#020610] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1220px] rounded-[28px] border border-violet-300/20 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.28),_rgba(15,23,42,0.92)_38%,_rgba(2,6,16,1)_68%)] p-3 shadow-[0_30px_100px_rgba(76,29,149,0.35)] ring-1 ring-white/5 backdrop-blur-sm sm:p-5">
        <header className="flex items-center justify-between gap-4 rounded-[22px] border border-violet-300/20 bg-[#1a1b2e]/80 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label="Open menu"
              className="grid size-10 place-items-center rounded-xl border border-violet-300/20 bg-white/5 text-white/80 transition hover:bg-white/10"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-3">
              <div className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-violet-400 via-indigo-400 to-fuchsia-400 text-[11px] font-black text-[#0b1020] shadow-[0_0_25px_rgba(147,51,234,0.6)]">
                A
              </div>
              <div className="text-2xl font-black tracking-[-0.06em] text-white">AlphaTekX</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-violet-300/20 bg-white/5 px-3 py-1.5 text-sm font-semibold text-violet-100 sm:flex sm:items-center sm:gap-2">
              <span className="inline-block size-2 rounded-full bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,0.9)]" />
              Credits: <span className="font-black text-white">1,250</span>
            </div>
            <button
              type="button"
              className="rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-sm font-black text-white shadow-[0_20px_40px_rgba(109,40,217,0.45)] transition hover:brightness-110"
            >
              Upgrade to Pro
            </button>
          </div>
        </header>

        <section className="px-3 pb-4 pt-7 sm:px-8 sm:pb-8 sm:pt-10">
          <div className="mx-auto max-w-5xl text-center">
            <h1 className="text-4xl font-black tracking-[-0.07em] text-white sm:text-[4rem]">Where Broken Things Are Restored</h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg text-slate-200/80 sm:text-2xl">
              Powerful restoration tools — fast, secure, and professional
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3 md:gap-7">
            {cards.map((card) => {
              const Icon = card.icon
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => navigate(card.route)}
                  className={`group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[26px] border bg-gradient-to-br p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] ${card.border} ${card.glow} ${card.gradient}`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_32%)]" />
                  <div className="relative z-10 flex items-center justify-center pt-2">
                    <div className={`grid size-20 place-items-center rounded-[24px] border border-violet-300/30 bg-gradient-to-br ${card.iconGradient} text-white shadow-[0_0_35px_rgba(147,51,234,0.35)]`}>
                      <Icon size={52} strokeWidth={1.8} />
                    </div>
                  </div>

                  <div className="relative z-10 mt-6 text-center">
                    <h2 className="text-[2rem] font-black tracking-[-0.06em] text-white">{card.title}</h2>
                    <p className="mt-2 text-base font-medium text-violet-100/80">{card.subtitle}</p>
                  </div>

                  <div className="relative z-10 mt-2 flex items-center justify-center">
                    <span className="text-sm font-semibold text-violet-100/80">{card.button}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
