"use client"

import { type ReactNode } from "react"
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitBranch,
  Lock,
  Mail,
  PanelsTopLeft,
  ShieldCheck,
  Sparkles,
  Table2,
  Workflow,
} from "lucide-react"

const pillars = [
  {
    title: "Voice lost",
    body: "Generic AI trained on the internet writes like everyone else. Your audience feels the difference immediately.",
  },
  {
    title: "Time tax",
    body: "Two hours a day to stay consistent is a tax you did not sign up for when you built the company.",
  },
  {
    title: "Compounding broken",
    body: "Growth dies the moment you pause. A system that stops when you stop is not a system at all.",
  },
]

const steps = [
  {
    title: "Learn your voice",
    body: "Ingests Docs, Gmail, and GitHub to build a model of your tone, ideas, and standards.",
  },
  {
    title: "Create the month",
    body: "Groq and Pollinations generate 30 hooks, scripts, image directions, and post variants into Sheets.",
  },
  {
    title: "Approve and grow",
    body: "You keep control in the Sheet. Yes/No approvals trigger LinkedIn posts, Gmail replies, Discord updates, and GitHub actions.",
  },
]

const platforms = [
  { name: "LinkedIn Native", note: "Official API • not a cookie hack", icon: <PanelsTopLeft className="h-5 w-5" /> },
  { name: "Gmail", note: "Official API", icon: <Mail className="h-5 w-5" /> },
  { name: "Discord", note: "Official API", icon: <Workflow className="h-5 w-5" /> },
  { name: "GitHub", note: "Official API", icon: <GitBranch className="h-5 w-5" /> },
  { name: "Google Docs", note: "Official API", icon: <FileText className="h-5 w-5" /> },
  { name: "Google Sheets", note: "Official API", icon: <Table2 className="h-5 w-5" /> },
]

const proofPoints = [
  { value: "2,400", label: "executions today" },
  { value: "30", label: "days of content" },
  { value: "6", label: "matured platforms" },
]

const heroStats = [
  { value: "100%", label: "your voice" },
  { value: "6", label: "platforms" },
  { value: "1", label: "approval sheet" },
  { value: "24/7", label: "operating layer" },
]

const comparisonRows = [
  { feature: "Platform count", manual: "1 platform", alpha: "6 matured platforms" },
  { feature: "Execution", manual: "Manual queue", alpha: "Auto-operating layer" },
  { feature: "Voice", manual: "Generic AI", alpha: "Your real voice" },
  { feature: "Approval", manual: "Chaos", alpha: "Yes/No in Sheets" },
]

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: ReactNode; subtitle: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="mb-4 text-[11px] font-black uppercase tracking-[0.36em] text-[#0A84FF]">{eyebrow}</p>
      <h2 className="text-2xl font-black tracking-tight text-[#FAFAF9] sm:text-3xl lg:text-4xl">{title}</h2>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#71717A] sm:text-base">{subtitle}</p>
    </div>
  )
}

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[1.4rem] border border-[#1E1E20] bg-[#121214] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.24)] sm:p-6 ${className}`}>{children}</div>
}

export default function Page() {
  return (
    <main id="top" className="min-h-screen overflow-x-hidden bg-[#08080A] text-[#FAFAF9]">
      <header className="sticky top-0 z-50 border-b border-[#1E1E20] bg-[#08080A]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.34em] text-[#FAFAF9]">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#0A84FF]/30 bg-[linear-gradient(135deg,#0A84FF_0%,#7C3AED_100%)] text-sm font-black text-white">A</span>
            <span>ALPHATEKX</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-[#71717A] md:flex">
            <a href="#how-it-works" className="transition hover:text-white">How it works</a>
            <a href="#demo" className="transition hover:text-white">Demo</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
          </nav>
          <a href="#pricing" className="rounded-full border border-[#1E1E20] bg-[#121214] px-5 py-2.5 text-sm font-black text-white transition hover:border-[#0A84FF]/40">Open dashboard</a>
        </div>
      </header>

      <section className="px-4 pb-6 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <div className="mx-auto grid max-w-7xl gap-6 rounded-[2rem] border border-[#1E1E20] bg-[radial-gradient(circle_at_top_left,_rgba(10,132,255,0.18),transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(124,58,237,0.18),transparent_24%),linear-gradient(135deg,#0A0A0D_0%,#101014_100%)] p-6 sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:p-10">
          <div className="flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#1E1E20] bg-[#121214] px-3 py-2 text-[10px] font-black uppercase tracking-[0.32em] text-[#0A84FF]">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span>ALPHA OS • LIVE • 2,400 EXECUTIONS TODAY</span>
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[0.9] tracking-[-0.03em] text-[#FAFAF9] sm:text-5xl lg:text-7xl" style={{ fontFamily: "var(--font-headline)" }}>
                The operating layer for founders who are done doing content by hand.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-[#71717A] sm:text-lg">
                AlphaTekX learns your voice from Docs, Gmail, and GitHub, then turns your standards into publish-ready posts, replies, and updates across six platforms without slowing you down.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#pricing" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FAFAF9] px-6 py-3.5 text-base font-black text-[#08080A] transition hover:scale-[1.01]">
                  Launch My Second You
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a href="#how-it-works" className="inline-flex items-center justify-center rounded-full border border-[#1E1E20] bg-[#121214] px-6 py-3.5 text-base font-semibold text-[#FAFAF9] transition hover:border-[#0A84FF]/40">
                  See the operating system
                </a>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-[#71717A]">
                <div className="flex items-center gap-2 rounded-full border border-[#1E1E20] bg-[#121214] px-3 py-2">
                  <Lock className="h-4 w-4 text-[#0A84FF]" />
                  <span>Approval stays yours</span>
                </div>
                <div className="rounded-full border border-[#1E1E20] bg-[#121214] px-3 py-2">No schedule hacks • no generic posts</div>
              </div>
            </div>
          </div>

          <GlassCard className="border-[#1E1E20] bg-[#121214]">
            <div className="rounded-[1.25rem] border border-[#1E1E20] bg-[#0A0A0D] p-4">
              <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-[#71717A]">
                <span>Operating layer</span>
                <span className="text-[#0A84FF]">LIVE</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {heroStats.map((stat) => (
                  <div key={stat.label} className="rounded-[1rem] border border-[#1E1E20] bg-[#121214] p-3">
                    <div className="text-2xl font-black text-[#FAFAF9]">{stat.value}</div>
                    <div className="mt-1 text-[11px] font-black uppercase tracking-[0.28em] text-[#71717A]">{stat.label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-[1rem] border border-[#1E1E20] bg-[#121214] p-4">
                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.28em] text-[#71717A]">
                  <span>Pipeline</span>
                  <span className="text-emerald-400">Ready</span>
                </div>
                <div className="mt-3 space-y-3">
                  {[
                    ["Learn the voice", "Docs • Gmail • GitHub"],
                    ["Create the month", "30 drafts • 6 channels"],
                    ["Approve and publish", "One Sheet • one click"],
                  ].map(([title, body]) => (
                    <div key={title} className="rounded-[0.9rem] border border-[#1E1E20] bg-[#0A0A0D] px-3 py-3">
                      <div className="text-sm font-black text-[#FAFAF9]">{title}</div>
                      <div className="mt-1 text-sm text-[#71717A]">{body}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <GlassCard className="border-[#0A84FF]/25 bg-[linear-gradient(135deg,rgba(10,132,255,0.12),rgba(124,58,237,0.12))]">
            <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#0A84FF]">Your taste. Automated.</p>
            <h3 className="mt-3 text-2xl font-black text-[#FAFAF9] sm:text-3xl">The old model was built for attention. This one is built for standards.</h3>
            <p className="mt-4 text-sm leading-8 text-[#71717A] sm:text-base">
              Generic AI writes like everyone else. AlphaTekX writes like you, with your voice, your judgment, and your operating rhythm.
            </p>
          </GlassCard>
          <div className="grid gap-4 md:grid-cols-2">
            {pillars.map((pillar) => (
              <GlassCard key={pillar.title} className="transition hover:border-[#0A84FF]/35">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#0A84FF_0%,#7C3AED_100%)] text-white">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-xl font-black text-[#FAFAF9]">{pillar.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#71717A]">{pillar.body}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="grid gap-6 lg:grid-cols-[0.38fr_0.62fr]">
          <GlassCard className="border-[#0A84FF]/25 bg-[linear-gradient(135deg,rgba(10,132,255,0.12),rgba(124,58,237,0.12))]">
            <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#0A84FF]">The OS</p>
            <h3 className="mt-3 text-2xl font-black text-[#FAFAF9] sm:text-3xl">The operating layer that learns your world from Docs, Gmail, and GitHub.</h3>
            <p className="mt-4 text-sm leading-8 text-[#71717A] sm:text-base">
              Not internet strangers. Not generic training data. Your own voice model, your own standards, your own motion.
            </p>
          </GlassCard>
          <div className="grid gap-4 md:grid-cols-2">
            {steps.map((step, index) => (
              <GlassCard key={step.title} className={`transition hover:border-[#0A84FF]/35 ${index === 2 ? "md:col-span-2 border-[#0A84FF]/30 bg-[linear-gradient(135deg,rgba(10,132,255,0.12),rgba(124,58,237,0.12))]" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#0A84FF_0%,#7C3AED_100%)] text-sm font-black text-white">0{index + 1}</div>
                  <div>
                    <h4 className="text-lg font-black text-[#FAFAF9]">{step.title}</h4>
                    <p className="mt-2 text-sm leading-7 text-[#71717A]">{step.body}</p>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <SectionTitle eyebrow="Legit matured platforms only" title="Six platforms. Zero cheap shortcuts." subtitle="LinkedIn Native, Gmail, Discord, GitHub, Google Docs, and Google Sheets. Nothing else." />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {platforms.map((platform) => (
            <GlassCard key={platform.name} className="transition hover:border-[#0A84FF]/35">
              <div className="flex items-center gap-3 text-[#0A84FF]">
                {platform.icon}
                <h3 className="text-lg font-semibold text-[#FAFAF9]">{platform.name}</h3>
              </div>
              <p className="mt-3 text-sm leading-7 text-[#71717A]">{platform.note}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-[1.8rem] border border-[#1E1E20] bg-[#121214] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E1E20] pb-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#0A84FF]">Compare</p>
              <h2 className="mt-2 text-2xl font-black text-[#FAFAF9] sm:text-3xl">Taplio is a single-platform shortcut. AlphaTekX is an operating layer.</h2>
            </div>
            <div className="rounded-full border border-[#0A84FF]/25 bg-[#0A84FF]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.32em] text-[#0A84FF]">10x better</div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm text-[#71717A]">
              <thead>
                <tr className="border-b border-[#1E1E20] text-[11px] uppercase tracking-[0.3em] text-[#FAFAF9]">
                  <th className="px-3 py-3 font-black">Area</th>
                  <th className="px-3 py-3 font-black">Taplio</th>
                  <th className="px-3 py-3 font-black text-[#0A84FF]">AlphaTekX</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.feature} className="border-b border-[#1E1E20] last:border-b-0">
                    <td className="px-3 py-3 font-semibold text-[#FAFAF9]">{row.feature}</td>
                    <td className="px-3 py-3">{row.manual}</td>
                    <td className="px-3 py-3 text-[#0A84FF]">{row.alpha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-[1.9rem] border border-[#1E1E20] bg-[linear-gradient(135deg,rgba(10,132,255,0.16),rgba(124,58,237,0.16))] p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#0A84FF]">Early founders • first 100 locked forever</p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <span className="text-5xl font-black text-[#FAFAF9] sm:text-6xl">$19/mo</span>
                <span className="text-2xl font-semibold text-[#71717A] line-through">$59/mo</span>
                <span className="text-lg font-black text-[#FAFAF9]">= ₦25,922</span>
              </div>
              <p className="mt-5 text-sm leading-8 text-[#71717A] sm:text-base">
                Compare that to a single-platform shortcut at $39 and zero credits. AlphaTekX gives you six matured platforms, official APIs, unlimited output, and one operating system.
              </p>
              <a href="#top" className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[#FAFAF9] px-6 py-3.5 text-base font-black text-[#08080A] transition hover:scale-[1.01]">
                Become unpoor
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="w-full max-w-md rounded-[1.25rem] border border-[#1E1E20] bg-[#121214] p-5">
              <div className="space-y-3">
                {[
                  { title: "100 users", body: "₦2.5M/mo at $19 each" },
                  { title: "Official APIs", body: "No ban risk, no cookie hacks" },
                  { title: "Built to scale", body: "One month of content becomes a repeatable engine" },
                ].map((item) => (
                  <div key={item.title} className="rounded-[1rem] border border-[#1E1E20] bg-[#0A0A0D] p-4">
                    <div className="text-sm font-black uppercase tracking-[0.24em] text-[#FAFAF9]">{item.title}</div>
                    <div className="mt-2 text-sm leading-7 text-[#71717A]">{item.body}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-[#1E1E20] bg-[#121214] px-4 py-4 text-sm text-[#71717A]">
            <div className="flex items-center gap-2 text-[#0A84FF]">
              <ShieldCheck className="h-4 w-4" />
              <span>Built for founders who will never be poor.</span>
            </div>
            <div className="ml-auto flex items-center gap-2 rounded-full border border-[#1E1E20] bg-[#0A0A0D] px-3 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-[#FAFAF9]">
              <ChevronRight className="h-4 w-4 text-[#0A84FF]" />
              <span>alphatekx.name.ng locked till 2031</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#1E1E20] bg-[#08080A] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-center sm:text-left md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.36em] text-[#0A84FF]">ALPHATEKX TECHNOLOGIES</p>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[#71717A]">Built for founders who will never be poor. AlphaTekX is the operating layer for modern builders who want consistency, speed, and a stronger public voice without losing their life to publishing.</p>
          </div>
          <div className="text-sm text-[#71717A]">
            <p className="font-mono">alphatekx.name.ng</p>
            <div className="mt-3 flex flex-wrap justify-center gap-4 sm:justify-start">
              {['Privacy', 'Terms', 'Status', 'Contact'].map((link) => (
                <a key={link} href="#top" className="transition hover:text-[#FAFAF9]">{link}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
