import { ArrowLeft, Clock3, GitCommitHorizontal, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

const milestones = [
  ['The first commit', 'An idea became a repository and a promise to keep building.'],
  ['The first white label', 'The connection screen finally said ALPHATEKX.'],
  ['Atomic credits', 'Confirmed work became billable exactly once, without sacrificing trust.'],
  ['The Money Loop', 'Publishing evolved into measurable, consent-aware revenue intelligence.'],
]

export default function FoundersLegacy() {
  return <main className="min-h-screen bg-violet-500/10 px-4 py-8 text-white sm:px-6 lg:py-16">
    <div className="mx-auto max-w-4xl">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-black text-violet-300"><ArrowLeft size={16}/>Back to AlphaTekx</Link>
      <section className="mt-8 overflow-hidden rounded-[32px] border border-violet-400/20 bg-[#0A0F1E] p-6 shadow-[0_30px_80px_rgba(15,23,42,.12)] sm:p-10 lg:p-14">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-violet-300"><Clock3 size={16}/>Founder’s legacy</div>
        <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">Built at 6:53AM on 28/07/2026 when mates were sleeping.</h1>
        <p className="mt-7 max-w-3xl text-lg font-semibold leading-8 text-slate-400">Daniel “codeking481” Thompson started AlphaTekx with one laptop, a stubborn white-screen bug, difficult integrations, and a refusal to stop. The first white-label connection showed “ALPHATEKX wants to connect” at 6:53AM. The platform grew an atomic credit system, an offline content vault for people with unreliable data, and a Money Loop designed to turn confirmed work into measurable opportunity.</p>
        <p className="mt-5 text-lg font-black text-white">This page is proof that grind wins.</p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">{milestones.map(([title, copy], index) => <article key={title} className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-5 shadow-sm"><span className="grid size-10 place-items-center rounded-xl bg-violet-500/10 font-black text-violet-300">{index + 1}</span><h2 className="mt-4 text-lg font-black">{title}</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{copy}</p></article>)}</div>

        <div className="mt-10 rounded-2xl border border-violet-200 bg-violet-500/10 p-6"><div className="flex items-center gap-2 font-black text-violet-300"><GitCommitHorizontal size={18}/>A permanent marker</div><code className="mt-3 block break-all text-sm font-bold text-slate-400">9f78c3f569ae5ea8416b2f6a89634ce7cb008009</code></div>

        <blockquote className="mt-10 rounded-3xl bg-[#6D28D9] p-7 text-white shadow-xl sm:p-9"><Sparkles className="text-violet-200"/><p className="mt-5 text-2xl font-black leading-9">“For Daniel — the night you chose work over enjoyment, you built the future.”</p><footer className="mt-4 text-sm font-bold text-violet-100">A marker for the AlphaTekx journey · 2026</footer></blockquote>
        <div className="mt-8 flex items-center gap-2 text-xs font-bold text-slate-400"><ShieldCheck size={15}/>Founder: Daniel Thompson · AlphaTekx</div>
      </section>
    </div>
  </main>
}
