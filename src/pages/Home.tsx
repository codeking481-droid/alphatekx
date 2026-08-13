import { useState } from 'react'
import { ArrowRight, CheckCircle2, FileText, ImageUp, Link2, ShieldAlert, Sparkles, Video } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const cards = [
  {
    title: 'SCAN MY LINK',
    subtitle: 'Report Only',
    icon: Link2,
    accent: 'from-violet-600 to-purple-500',
    description: 'Paste a broken app link and get a PDF report covering API leaks, secret keys, broken envs, and performance issues — no live-touch, no silent rebuilds.',
    button: 'Scan, Don\'t Touch',
    inputLabel: 'Paste link',
    output: 'PDF report of API leak, secret key, broken env, performance — report only, no touch link — more control',
  },
  {
    title: 'RESTORE MY VIDEO',
    subtitle: 'Heal My Broken Video',
    icon: Video,
    accent: 'from-cyan-500 to-blue-500',
    description: 'Upload unedited, broken, or shaky footage. Alpha rebuilds the edit into polished world-class output with voice-over, trimming, pacing, and long-to-short or short-to-long conversion.',
    button: 'Restore to World-Class',
    inputLabel: 'Upload unedited / broken / shaky video',
    output: 'Editor heals the cut, adds voice-over, and restores quality to MrBeast / IShowSpeed / Malva level without learning your style the slow way.',
  },
  {
    title: 'SELL MY WORK',
    subtitle: 'Market',
    icon: ImageUp,
    accent: 'from-amber-400 to-orange-500',
    description: 'Upload a restored app, edited video, or template and list it for sale. Set a price and publish to the marketplace for buyers.',
    button: 'Put For Sale',
    inputLabel: 'Upload app, video, or template',
    output: 'List for sale at $19 / $49 pricing and grow the restoration economy without a generic builder workflow.',
  },
] as const

export default function Home() {
  const navigate = useNavigate()
  const [active, setActive] = useState<string | null>(null)

  return (
    <section className="min-h-full bg-violet-500/10 px-4 py-12 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#6D28D9] text-white shadow-[0_18px_40px_rgba(109,40,217,.3)]"><Sparkles size={29}/></span>
          <p className="mt-7 text-xs font-black uppercase tracking-[.2em] text-violet-300">Welcome to Alpha</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-.05em] text-white sm:text-6xl">Where Broken Things Are Restored, Not Built</h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg font-semibold leading-8 text-slate-400">No style-learning, only restoration — heal broken to world-class.</p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon
            const isActive = active === card.title
            return (
              <div key={card.title} className={`rounded-[28px] border border-violet-400/20 bg-[#101114] p-5 shadow-[0_22px_60px_rgba(15,23,42,.18)] transition-all ${isActive ? 'ring-2 ring-violet-400/50' : ''}`}>
                <div className={`inline-flex rounded-full bg-gradient-to-r ${card.accent} p-3 text-white`}>
                  <Icon size={22} />
                </div>
                <div className="mt-5">
                  <p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-300">{card.title}</p>
                  <h2 className="mt-2 text-2xl font-black text-white">{card.subtitle}</h2>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-300">{card.description}</p>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.02] p-3">
                  <label className="block text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{card.inputLabel}</label>
                  <div className="mt-2 min-h-[64px] rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-500">
                    {card.title === 'SCAN MY LINK' ? 'https://example-app.com' : card.title === 'RESTORE MY VIDEO' ? 'video-file.mp4' : 'app-or-template.zip'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { setActive(card.title); navigate('/automations') }}
                  className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#6D28D9] px-4 text-sm font-black text-white shadow-[0_15px_35px_rgba(109,40,217,.28)] transition hover:-translate-y-0.5 hover:bg-[#5B21B6]"
                >
                  {card.button}
                  <ArrowRight size={17} />
                </button>

                <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-100">
                  <div className="mb-1 flex items-center gap-2 font-black uppercase tracking-[.12em] text-emerald-300"><CheckCircle2 size={14} /> Output</div>
                  {card.output}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-8 rounded-[28px] border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 shrink-0 text-amber-300" size={18} />
            <div>
              <p className="font-black uppercase tracking-[.12em] text-amber-300">Anti-abuse protection</p>
              <p className="mt-2 leading-6 text-amber-100/90">Free tier: 1 free scan, 1 free video restore with watermark and 720p, 3 history saves. Paid $49 removes watermark, unlocks 1080p/4K, unlimited history, and sell access. No credits = no restore. Free users are limited to 3 video restores per hour and must add a card to continue restoring.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center text-xs font-black uppercase tracking-[.18em] text-slate-400">
          <FileText className="mr-2 text-violet-300" size={14} />
          Trusted restoration workflow — not a generic platform dump
        </div>
      </div>
    </section>
  )
}
