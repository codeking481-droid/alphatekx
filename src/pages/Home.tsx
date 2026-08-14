import { ArrowRight, Link2, Store, Wand2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const cards = [
  {
    id: 'scan',
    title: 'SCAN MY LINK',
    subtitle: 'Report Only',
    description: 'Scan, Don\'t Touch',
    route: '/scan',
    icon: Link2,
    accent: 'from-violet-200/90 to-violet-300/70',
  },
  {
    id: 'restore',
    title: 'RESTORE MY VIDEO',
    subtitle: 'Heal My Broken Video',
    description: 'Restore to World-Class',
    route: '/restore',
    icon: Wand2,
    accent: 'from-violet-200/90 to-violet-300/70',
  },
  {
    id: 'market',
    title: 'SELL MY WORK',
    subtitle: 'Market',
    description: 'Put For Sale',
    route: '/market',
    icon: Store,
    accent: 'from-violet-200/90 to-violet-300/70',
  },
] as const

export default function Home() {
  const navigate = useNavigate()

  return (
    <main className="min-h-[calc(100dvh-64px)] w-full bg-[#03070e] px-4 pb-10 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1500px] rounded-[28px] border border-violet-300/20 bg-[radial-gradient(circle_at_top,_rgba(123,92,255,0.42),_rgba(20,22,38,0.96)_37%,_rgba(3,7,14,1)_72%)] p-3 shadow-[0_30px_120px_rgba(76,29,149,0.35)] ring-1 ring-white/5 backdrop-blur-sm sm:p-5">
        <header className="flex items-center justify-between gap-4 rounded-[18px] border border-violet-300/20 bg-[#1a1b2e]/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-7">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-violet-400 via-indigo-400 to-fuchsia-400 text-[11px] font-black text-[#0a0d1a] shadow-[0_0_25px_rgba(147,51,234,0.6)]">
              A
            </div>
            <div className="text-[1.8rem] font-black tracking-[-0.08em] text-white sm:text-[2.1rem]">AlphaTekX</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-violet-300/20 bg-white/5 px-3 py-1.5 text-sm font-semibold text-violet-100 md:flex">
              <span className="inline-block size-2 rounded-full bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,0.9)]" />
              Credits: <span className="font-black text-white">1,250</span>
            </div>
            <button
              type="button"
              className="rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110"
            >
              Upgrade to Pro
            </button>
          </div>
        </header>

        <section className="px-2 pb-4 pt-8 sm:px-4 sm:pt-10">
          <div className="mx-auto max-w-5xl text-center">
            <h1 className="text-4xl font-black tracking-[-0.08em] text-white sm:text-6xl lg:text-[4.3rem]">
              Where Broken Things Are Restored
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-lg text-slate-200/80 sm:text-2xl">
              Powerful restoration tools — fast, secure, and professional
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {cards.map((card) => {
              const Icon = card.icon
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => navigate(card.route)}
                  className="group relative flex min-h-[260px] flex-col justify-center overflow-hidden rounded-[24px] border border-violet-200/25 bg-[linear-gradient(180deg,rgba(153,126,255,0.17),rgba(57,60,90,0.16))] p-5 text-center transition-all duration-200 hover:-translate-y-1 hover:border-violet-200/40 hover:shadow-[0_18px_40px_rgba(168,85,247,0.18)]"
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.15),_transparent_35%)]" />
                  <div className="relative z-10 flex items-center justify-center">
                    <div className={`grid size-24 place-items-center rounded-[22px] border border-violet-200/30 bg-gradient-to-br ${card.accent} text-white shadow-[0_0_30px_rgba(147,51,234,0.28)]`}>
                      <Icon size={58} strokeWidth={1.8} />
                    </div>
                  </div>

                  <div className="relative z-10 mt-6 text-center">
                    <h2 className="text-[2rem] font-black tracking-[-0.06em] text-white">{card.title}</h2>
                    <p className="mt-2 text-base font-medium text-violet-100/80">{card.subtitle}</p>
                  </div>

                  <div className="relative z-10 mt-5 flex items-center justify-center gap-3 text-violet-100/90">
                    <span className="text-sm font-semibold">{card.description}</span>
                    <span className="grid size-8 place-items-center rounded-full border border-violet-200/30 bg-white/5 text-white transition group-hover:translate-x-1">
                      <ArrowRight size={16} />
                    </span>
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
