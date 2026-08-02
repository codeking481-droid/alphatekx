"use client"

import { useEffect, useState, type ReactNode } from "react"
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitBranch,
  Lock,
  Mail,
  Menu,
  PanelsTopLeft,
  ShieldCheck,
  Sparkles,
  Table2,
  TrendingUp,
  Workflow,
  X,
} from "lucide-react"

const platforms = [
  { name: "LinkedIn (Official API)", note: "No ban risk", icon: <PanelsTopLeft className="h-5 w-5" /> },
  { name: "Gmail (Google API)", note: "Official API", icon: <Mail className="h-5 w-5" /> },
  { name: "Discord (Bot API)", note: "Official API", icon: <Workflow className="h-5 w-5" /> },
  { name: "GitHub (REST / GraphQL API)", note: "Official API", icon: <GitBranch className="h-5 w-5" /> },
  { name: "Google Docs (Drive API)", note: "Official API", icon: <FileText className="h-5 w-5" /> },
  { name: "Google Sheets (Sheets API)", note: "Official API", icon: <Table2 className="h-5 w-5" /> },
]

const problemCards = [
  { icon: "🔥", title: "Burnout", body: "Your attention was not designed to be a publishing queue." },
  { icon: "📉", title: "Inconsistency", body: "Growth dies when life interrupts the content calendar." },
  { icon: "🚫", title: "Zero growth", body: "Manual posting keeps you busy, not compounding." },
]

const flowCards = [
  {
    title: "01 AI LEARNS",
    body: "Reads your Docs, Gmail, and GitHub, then learns your voice, not generic AI from a stranger's dataset.",
    badge: "Official API",
    icon: "📖",
  },
  {
    title: "02 AI CREATES",
    body: "Creates hooks, scripts, captions, and campaign ideas shaped around your voice. Thirty days of content flows into Sheets in one click.",
    badge: "Unlimited",
    icon: "✍️",
  },
  {
    title: "03 AI GROWS",
    body: "Auto-posts to LinkedIn, Gmail, Discord, and GitHub while replying in your voice. Pollinations images and Groq run at a lean cost.",
    badge: "Live 24/7",
    icon: "📈",
  },
]

const comparisonRows = [
  {
    feature: "Platforms",
    taplio: "1 platform with ban risk",
    alpha: "6 official APIs across LinkedIn, Gmail, Discord, GitHub, Docs, and Sheets",
  },
  {
    feature: "AI credits",
    taplio: "Zero included",
    alpha: "Unlimited included",
  },
  {
    feature: "Voice model",
    taplio: "Generic data",
    alpha: "Your voice trained on your Docs, Gmail, and GitHub",
  },
  {
    feature: "Sheets OS",
    taplio: "No",
    alpha: "Yes",
  },
  {
    feature: "Support",
    taplio: "Email, slow",
    alpha: "Priority in-app",
  },
]

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: ReactNode; subtitle: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="mb-4 text-[11px] font-black uppercase tracking-[0.36em] text-[#FFD60A]">{eyebrow}</p>
      <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-4xl">{title}</h2>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#888888] sm:text-base">{subtitle}</p>
    </div>
  )
}

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[1.4rem] border border-[#1A1A1A] bg-[#0A0A0A] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.2)] backdrop-blur-xl sm:p-6 ${className}`}>{children}</div>
}

export default function Page() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [counter, setCounter] = useState(0)
  const [barsReady, setBarsReady] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    onScroll()
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setBarsReady(true), 120)
    let frame = 0
    let started = 0

    const tick = (timestamp: number) => {
      if (!started) started = timestamp
      const progress = Math.min(1, (timestamp - started) / 1000)
      setCounter(Math.round(progress * 200))
      if (progress < 1) frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)
    return () => {
      window.clearTimeout(timer)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <main id="top" className="min-h-screen overflow-x-hidden bg-[#000000] text-white">
      <header className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-all duration-300 ${scrolled ? "border-[#FFD60A]/60 bg-[#0A0A0A]/90" : "border-[#1A1A1A] bg-[#000000]/70"}`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.34em] text-white" aria-label="AlphaTekX home">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#FFD60A]/25 bg-[#FFD60A] text-sm font-black text-black">⚡</span>
            <span>ALPHATEKX</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-[#888888] md:flex" aria-label="Primary navigation">
            <a href="#how-it-works" className="transition hover:text-white">How it works</a>
            <a href="#comparison" className="transition hover:text-white">Demo</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
          </nav>
          <a href="#pricing" className="rounded-lg bg-[linear-gradient(90deg,#FFD60A_0%,#FFB800_100%)] px-5 py-2.5 text-sm font-black text-black transition hover:scale-[1.03]" aria-label="Open dashboard">
            Open dashboard
          </a>
          <button className="rounded-lg border border-[#1A1A1A] p-2 text-[#FFD60A] md:hidden" onClick={() => setMenuOpen((prev) => !prev)} aria-label="Toggle navigation menu" aria-expanded={menuOpen}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        <div className={`overflow-hidden border-t border-[#1A1A1A] bg-[#0A0A0A]/95 px-4 transition-all duration-300 md:hidden ${menuOpen ? "max-h-48 py-4" : "max-h-0 py-0"}`}>
          <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm font-semibold text-[#888888]">
            <a href="#how-it-works" className="transition hover:text-white" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="#comparison" className="transition hover:text-white" onClick={() => setMenuOpen(false)}>Demo</a>
            <a href="#pricing" className="transition hover:text-white" onClick={() => setMenuOpen(false)}>Pricing</a>
          </div>
        </div>
      </header>

      <section className="px-4 pb-6 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <div className="mx-auto grid max-w-7xl gap-6 rounded-[2rem] border border-[#1A1A1A] bg-[radial-gradient(circle_at_top_left,_rgba(255,214,10,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.16),transparent_28%),linear-gradient(135deg,#050505_0%,#0A0A0A_100%)] p-6 sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:p-10">
          <div className="flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-3 rounded-full border border-[#1A1A1A] bg-[#0A0A0A] px-4 py-2 text-[10px] font-black uppercase tracking-[0.34em] text-black">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#FFD60A] motion-safe:animate-[pulse_1.8s_ease-in-out_infinite]" />
                <span className="text-[#FFD60A]">Your AI employee is ready</span>
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[0.95] tracking-[-0.03em] text-white sm:text-5xl lg:text-7xl">
                Your Second You <span className="bg-gradient-to-r from-[#FFD60A] via-[#FFB800] to-[#A855F7] bg-clip-text text-transparent">That Never Sleeps</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-[#888888] sm:text-lg">
                AI creates, posts, and grows your socials while you live your real life.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#pricing" className="inline-flex items-center justify-center gap-2 rounded-[0.9rem] bg-[linear-gradient(90deg,#FFD60A_0%,#FFB800_100%)] px-6 py-3.5 text-base font-black text-black transition hover:scale-[1.01]" aria-label="Launch my second you">
                  Launch My Second You
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a href="#how-it-works" className="inline-flex items-center justify-center rounded-[0.9rem] border border-[#1A1A1A] bg-[#0A0A0A] px-6 py-3.5 text-base font-semibold text-white transition hover:border-[#FFD60A]/40" aria-label="See how it works">
                  See how it works
                </a>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-[#888888]">
                <div className="flex items-center gap-2 rounded-full border border-[#1A1A1A] bg-[#0A0A0A] px-3 py-2">
                  <Lock className="h-4 w-4 text-[#FFD60A]" />
                  <span>Start free • Approval stays yours</span>
                </div>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-4 rounded-[1rem] border border-[#1A1A1A] bg-[#0A0A0A] px-4 py-3 text-sm text-[#888888]">
                <div className="flex items-center gap-2 text-[#FFD60A]">
                  <span>★★★★★</span>
                  <span className="text-[#888888]">{counter}+ founders already automated</span>
                </div>
                <span className="rounded-full border border-[#FFD60A]/25 bg-[#FFD60A]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-[#FFD60A]">Live</span>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[#1A1A1A] bg-[#0A0A0A] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#FFD60A]/25 bg-[#FFD60A] px-3 py-1 text-[10px] font-black uppercase tracking-[0.32em] text-black">Today</div>
              <div className="text-sm text-[#888888]">4 posts confirmed <span className="text-[#FFD60A]">✓</span></div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-[#FFD60A]/25 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.3em] text-[#FFD60A]">ALPHA COMMAND</span>
              <span className="text-sm text-[#888888]">Active • 28 posts</span>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                { label: "28 posts", note: "4 platforms" },
                { label: "+38% growth", note: "Upside" },
                { label: "1 credit", note: "Across all" },
              ].map((stat, index) => (
                <div key={stat.label} className="rounded-[1rem] border border-[#1A1A1A] bg-[#000000] p-3 transition hover:border-[#FFD60A]/35">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-[#888888]">
                    <span>{index === 1 ? "Growth" : "Flow"}</span>
                    {index === 1 ? <TrendingUp className="h-3.5 w-3.5 text-[#FFD60A]" /> : <Sparkles className="h-3.5 w-3.5 text-[#FFD60A]" />}
                  </div>
                  <div className="mt-3 text-xl font-black text-white">{stat.label}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-[#888888]">{stat.note}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-[1.2rem] border border-[#1A1A1A] bg-[#000000] p-4">
              <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-[#888888]">
                <span>Growth engine</span>
                <span className="text-[#FFD60A]">Live</span>
              </div>
              <div className="flex h-36 items-end gap-2">
                {[24, 40, 68, 56, 82, 72, 90, 64].map((height) => (
                  <div key={height} className="flex-1 rounded-t-[0.7rem] bg-gradient-to-t from-[#FFB800] to-[#FFD60A] transition-all duration-700" style={{ height: barsReady ? `${height}%` : "0%" }} />
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-[1.2rem] border border-[#1A1A1A] bg-[#000000] p-4">
              <div className="flex items-center justify-between text-sm text-[#888888]">
                <span>LinkedIn posted at 9:00 AM</span>
                <span className="font-semibold text-[#FFD60A]">Confirmed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <SectionTitle eyebrow="The problem" title={<><span className="text-[#FFD60A]">Modern slavery</span> is the old game.</>} subtitle="Manual posting is expensive in attention, trust, and momentum." />
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {problemCards.map((card) => (
            <GlassCard key={card.title} className="transition hover:border-[#FFD60A]/40">
              <div className="text-3xl">{card.icon}</div>
              <h3 className="mt-4 text-xl font-black text-white">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#888888]">{card.body}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <GlassCard className="border-[#FFD60A]/20 bg-[linear-gradient(135deg,rgba(255,214,10,0.12),rgba(168,85,247,0.16))]">
            <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#FFD60A]">What changes</p>
            <h3 className="mt-3 text-2xl font-black text-white sm:text-3xl">You stop doing the work that should be automated.</h3>
            <p className="mt-4 text-sm leading-8 text-[#888888] sm:text-base">
              AlphaTekX becomes your operating layer for content, replies, approvals, and publishing. It does not replace your judgment; it removes the repetitive layer between your idea and your public output.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                { title: "One approval layer", body: "You approve once and the engine handles the rest." },
                { title: "One voice model", body: "Your words, your tone, your standards—every output stays aligned." },
                { title: "One growth engine", body: "Posts, replies, and distribution stay consistent even when you are offline." },
                { title: "One operating system", body: "Your Docs, Gmail, GitHub, and Sheets all feed the same motion." },
              ].map((item) => (
                <div key={item.title} className="rounded-[1rem] border border-[#1A1A1A] bg-[#0A0A0A] p-4">
                  <h4 className="text-sm font-black uppercase tracking-[0.24em] text-white">{item.title}</h4>
                  <p className="mt-2 text-sm leading-7 text-[#888888]">{item.body}</p>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="border-[#1A1A1A] bg-[#0A0A0A]">
            <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#FFD60A]">Built for founders</p>
            <div className="mt-4 space-y-3">
              {[
                ["Voice trained on your real work", "From docs, emails, and GitHub history."],
                ["Approval stays under your control", "One click, no chaos, no blind autopilot."],
                ["Publishing happens on time", "Even when you are in deep work or asleep."],
              ].map(([title, body]) => (
                <div key={title} className="rounded-[1rem] border border-[#1A1A1A] bg-[#000000] p-4">
                  <div className="text-sm font-black uppercase tracking-[0.24em] text-white">{title}</div>
                  <div className="mt-2 text-sm leading-7 text-[#888888]">{body}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-[1rem] border border-[#FFD60A]/20 bg-[#FFD60A]/10 p-4 text-sm leading-8 text-[#FDE68A]">
              “The system does not replace your judgment. It removes the friction between your idea and your audience.”
            </div>
          </GlassCard>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="grid gap-8 lg:grid-cols-[0.35fr_0.65fr]">
          <div className="lg:sticky lg:top-24">
            <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#FFD60A]">How it works</p>
            <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">How AlphaTekX becomes you.</h2>
            <p className="mt-4 text-sm leading-7 text-[#888888] sm:text-base">
              Your standards stay. The repetitive execution disappears. Your voice, not generic AI.
            </p>
            <div className="mt-6 rounded-[1.2rem] border border-[#1A1A1A] bg-[#0A0A0A] p-5">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-[#FFD60A]" />
                <div className="h-px flex-1 bg-[#1A1A1A]" />
                <div className="h-3 w-3 rounded-full bg-[#FFD60A]" />
                <div className="h-px flex-1 bg-[#1A1A1A]" />
                <div className="h-3 w-3 rounded-full bg-[#FFD60A]" />
              </div>
              <div className="mt-4 text-sm leading-7 text-[#888888]">
                The flow is simple: learn from your work, create from your voice, and grow without you carrying the burden.
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {flowCards.map((card) => (
              <GlassCard key={card.title} className="transition hover:border-[#FFD60A]/35">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{card.icon}</div>
                    <h3 className="text-lg font-black text-white">{card.title}</h3>
                  </div>
                  <span className="rounded-full border border-[#FFD60A]/25 bg-[#FFD60A]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-[#FFD60A]">{card.badge}</span>
                </div>
                <p className="mt-4 text-sm leading-7 text-[#888888]">{card.body}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      <section id="comparison" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-[1.6rem] border border-[#1A1A1A] bg-[#0A0A0A] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1A1A1A] pb-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#FFD60A]">Why AlphaTekX is 10x better</p>
              <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">The difference is obvious.</h2>
            </div>
            <div className="rounded-full border border-[#FFD60A]/25 bg-[#FFD60A]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.32em] text-[#FFD60A]">10x better</div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm text-[#888888]">
              <thead>
                <tr className="border-b border-[#1A1A1A] text-[11px] uppercase tracking-[0.3em] text-white">
                  <th className="px-3 py-3 font-black">Feature</th>
                  <th className="px-3 py-3 font-black">Taplio ($39/mo)</th>
                  <th className="px-3 py-3 font-black text-[#FFD60A]">AlphaTekX ($19/mo = ₦25,922)</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.feature} className="border-b border-[#1A1A1A] last:border-b-0">
                    <td className="px-3 py-3 font-semibold text-white">{row.feature}</td>
                    <td className="px-3 py-3">{row.taplio}</td>
                    <td className="px-3 py-3 text-[#FFD60A]">{row.alpha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-[#888888]">Based on an independent feature audit, March 2026.</p>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-[1.8rem] border border-[#1A1A1A] bg-[linear-gradient(135deg,rgba(255,214,10,0.16),rgba(168,85,247,0.16))] p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#FFD60A]">🔥 Early bird • first 100 locked forever</p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <span className="text-5xl font-black text-white sm:text-6xl">$19/mo</span>
                <span className="text-2xl font-semibold text-[#888888] line-through">$59/mo</span>
                <span className="text-lg font-black text-white">= ₦25,922</span>
              </div>
              <p className="mt-5 text-sm leading-8 text-[#888888] sm:text-base">
                Includes all 6 platforms, unlimited AI voice generation, Sheets OS, official API access, and zero ban risk. Your second you sleeps while your business grows.
              </p>
              <a href="#top" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[0.95rem] bg-[linear-gradient(90deg,#FFD60A_0%,#FFB800_100%)] px-6 py-3.5 text-base font-black text-black transition hover:scale-[1.01] sm:w-auto" aria-label="Launch my second you pricing">
                Launch My Second You
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="w-full max-w-md rounded-[1.2rem] border border-[#1A1A1A] bg-[#0A0A0A] p-5">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {[
                  { value: "97%", label: "Margin for you, not us" },
                  { value: "20k", label: "Composio calls for first 100" },
                  { value: "14 days", label: "Money-back guarantee" },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1rem] border border-[#1A1A1A] bg-[#000000] p-4">
                    <div className="text-2xl font-black text-white">{item.value}</div>
                    <div className="mt-2 text-sm text-[#888888]">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[1.2rem] border border-[#1A1A1A] bg-[#0A0A0A] px-4 py-4 text-sm text-[#888888]">
            <div className="flex items-center gap-2 text-[#FFD60A]">
              <ShieldCheck className="h-4 w-4" />
              <span>Trusted by 200+ founders from YC, a16z, and Sequoia</span>
            </div>
            <div className="ml-auto flex -space-x-2">
              {['A', 'B', 'C', 'D'].map((letter) => (
                <div key={letter} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1A1A1A] bg-[#000000] text-xs font-black text-[#FFD60A]">{letter}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#1A1A1A] bg-[#000000] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-center sm:text-left md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.36em] text-[#FFD60A]">ALPHATEKX TECHNOLOGIES ©2026</p>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[#888888]">Built for founders who will never be poor. Your second you is the operating layer for modern builders.</p>
          </div>
          <div className="text-sm text-[#888888]">
            <p className="font-mono">alphatekx.name.ng</p>
            <div className="mt-3 flex flex-wrap justify-center gap-4 sm:justify-start">
              {['Privacy', 'Terms', 'Status', 'Contact'].map((link) => (
                <a key={link} href="#top" className="transition hover:text-[#FFD60A]" aria-label={link}>{link}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
