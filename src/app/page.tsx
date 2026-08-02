"use client"

import { type ReactNode } from "react"
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitBranch,
  Mail,
  PanelsTopLeft,
  ShieldCheck,
  Sparkles,
  Table2,
  Workflow,
} from "lucide-react"

const pillars = [
  {
    title: "Official LinkedIn API",
    body: "Your account stays protected. No cookie hacks, no ban risk, no fragile shortcuts.",
  },
  {
    title: "Voice trained on your world",
    body: "We learn from your docs, Gmail, and working patterns so the output sounds like you.",
  },
  {
    title: "Six matured platforms",
    body: "LinkedIn, Gmail, Discord, GitHub, Google Docs, and Google Sheets all work as one OS.",
  },
]

const steps = [
  {
    title: "Connect the systems",
    body: "OAuth handles the setup. You connect once, and AlphaTekX OS manages the rest.",
  },
  {
    title: "Generate the month",
    body: "Sheets creates 30 topics, posts, and image directions with Groq and Pollinations.",
  },
  {
    title: "Approve and autopost",
    body: "You approve YES or NO in the sheet and your Second You publishes with your voice.",
  },
]

const platforms = [
  { name: "LinkedIn Native", icon: <PanelsTopLeft className="h-5 w-5" /> },
  { name: "Gmail", icon: <Mail className="h-5 w-5" /> },
  { name: "Discord", icon: <Workflow className="h-5 w-5" /> },
  { name: "GitHub", icon: <GitBranch className="h-5 w-5" /> },
  { name: "Google Docs", icon: <FileText className="h-5 w-5" /> },
  { name: "Google Sheets", icon: <Table2 className="h-5 w-5" /> },
]

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="mb-4 text-[11px] font-black uppercase tracking-[0.36em] text-[#06FFA5]">{eyebrow}</p>
      <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-4xl">{title}</h2>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">{subtitle}</p>
    </div>
  )
}

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl ${className}`}>{children}</div>
}

export default function Page() {
  return (
    <main id="top" className="min-h-screen overflow-x-hidden bg-[#0A0A0F] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0A0A0F]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="text-[11px] font-black uppercase tracking-[0.34em] text-slate-400">AlphaTekX Technologies</div>
            <span className="rounded-full border border-[#3B82F6]/30 bg-[#3B82F6]/12 px-3 py-1 text-[11px] font-black uppercase tracking-[0.3em] text-[#3B82F6]">AlphaTekX OS</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-400 md:flex">
            <a href="#how-it-works" className="transition hover:text-white">How it Works</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
          </nav>
          <a href="#pricing" className="rounded-full bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2563EB] sm:px-5">
            Access OS
          </a>
        </div>
      </header>

      <section className="relative isolate overflow-hidden px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pt-24">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.23),transparent_45%),radial-gradient(circle_at_80%_20%,_rgba(139,92,246,0.2),transparent_32%)]" />
        <div className="mx-auto flex max-w-7xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#06FFA5]/25 bg-[#06FFA5]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.38em] text-[#06FFA5]">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure • Encrypted • Always On
          </span>
          <h1 className="mt-6 max-w-5xl text-[2.35rem] font-black leading-[0.95] tracking-[-0.03em] text-white sm:text-5xl lg:text-7xl">
            YOUR SECOND YOU WORKS WHILE YOU SLEEP
          </h1>
          <p className="mt-6 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base sm:leading-8 lg:text-lg">
            Not another scheduler. Your Second You posts to LinkedIn, replies Gmail, ships Discord, commits GitHub, and updates docs in your voice. One Google Sheet, 30 days, autopilot.
          </p>
          <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
            <a href="#pricing" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FFD000] px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-[#ffe04d] sm:w-auto">
              Access AlphaTekX OS Now
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-400">Early Bird $19/mo = ₦25,922 • First 100 only</p>

          <div className="mt-12 w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0F1118]/90 shadow-[0_32px_120px_rgba(0,0,0,0.45)]">
            <div className="grid lg:grid-cols-[0.7fr_1.3fr]">
              <div className="border-b border-white/10 bg-[#090B12] p-5 sm:p-6 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
                  <span>Workspace</span>
                  <span className="text-[#06FFA5]">Live</span>
                </div>
                <div className="mt-6 space-y-3">
                  {[
                    ["AlphaTekX OS", "Secure"],
                    ["Growth Loop", "Ready"],
                    ["Approval Queue", "3 items"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                      <div className="text-slate-400">{label}</div>
                      <div className="mt-1 font-semibold text-white">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-[1.25rem] border border-[#3B82F6]/20 bg-[#3B82F6]/10 p-4 text-left">
                  <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#3B82F6]">Prompt</p>
                  <p className="mt-2 text-sm leading-7 text-slate-300">Draft one post, one reply, and one image concept from the same voice.</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-[#0F172A]/90 via-[#0B1020] to-[#111827] p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Campaign Preview</p>
                    <p className="mt-1 text-lg font-semibold text-white">30-day engine is already assembled</p>
                  </div>
                  <span className="rounded-full border border-[#06FFA5]/25 bg-[#06FFA5]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-[#06FFA5]">Auto Drafted</span>
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-[1.25rem] border border-white/10 bg-[#090B12] p-4">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
                      <span>LinkedIn</span>
                      <span className="text-[#3B82F6]">Ready</span>
                    </div>
                    <div className="mt-4 rounded-[1rem] border border-white/10 bg-white/[0.04] p-4 text-left">
                      <p className="text-sm font-semibold text-white">The system is already shaping the month.</p>
                      <p className="mt-2 text-sm leading-7 text-slate-400">One post in your voice. One follow-up in Gmail. One approval in Sheets.</p>
                    </div>
                    <div className="mt-4 h-2 w-3/4 rounded-full bg-white/10" />
                    <div className="mt-2 h-2 w-2/3 rounded-full bg-white/10" />
                    <div className="mt-2 h-2 w-1/2 rounded-full bg-white/10" />
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[1.25rem] border border-[#06FFA5]/20 bg-[#06FFA5]/10 p-4">
                      <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.28em] text-[#06FFA5]">
                        <span>Approval</span>
                        <span>YES</span>
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-slate-300">
                        <div className="rounded-xl border border-white/10 bg-[#0A0A0F]/70 px-3 py-2">Founder thought → publish</div>
                        <div className="rounded-xl border border-white/10 bg-[#0A0A0F]/70 px-3 py-2">Customer insight → queue</div>
                      </div>
                    </div>
                    <div className="rounded-[1.25rem] border border-white/10 bg-[#090B12] p-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Channels</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {['LinkedIn', 'Gmail', 'Discord', 'GitHub'].map((channel) => (
                          <span key={channel} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-slate-300">{channel}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="modern-slavery" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <GlassCard className="border-[#FFD000]/20 bg-[linear-gradient(135deg,rgba(255,208,0,0.12),rgba(139,92,246,0.12))]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#FFD000]">Modern slavery</p>
              <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">Posting by hand is the old game. The new edge is a system that thinks, creates, and ships without you grinding.</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm font-semibold text-slate-300">No empty space. No dead sections. Every panel earns its place.</div>
          </div>
        </GlassCard>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#FFD000]">How AlphaTekX Becomes You</p>
            <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">Your standards stay. The repetitive execution disappears.</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400 sm:text-base">The system learns from your docs, Gmail, GitHub, and past posts so the output lands like you, not like a generic bot.</p>
          </div>
          <div className="space-y-4">
            {[
              {
                title: "AI LEARNS",
                body: "Voice training from your docs, Gmail, GitHub, and prior posts so the language stays personal, sharp, and grounded.",
              },
              {
                title: "AI CREATES",
                body: "Original hooks, scripts, captions, and image concepts shaped around your voice instead of recycled filler.",
              },
              {
                title: "AI GROWS",
                body: "Posts to four mature platforms with real momentum, weekly reach, and a full 30-day content engine.",
              },
            ].map((card, index) => (
              <GlassCard key={card.title} className="border-white/10 bg-[#10131A]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFD000]/12 text-sm font-black text-[#FFD000]">0{index + 1}</div>
                  <h3 className="text-lg font-black text-white">{card.title}</h3>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-400">{card.body}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      <section id="shift" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div className="rounded-[2rem] border border-[#FFD000]/20 bg-[linear-gradient(135deg,rgba(255,208,0,0.12),rgba(139,92,246,0.12))] p-6 sm:p-8">
            <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#FFD000]">See the shift</p>
            <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">Your content engine is visible from day one.</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                ["2,400", "Reach"],
                ["30", "Posts"],
                ["4", "Platforms"],
                ["30", "Days"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-[1.25rem] border border-white/10 bg-black/30 p-4">
                  <div className="text-3xl font-black text-white">{value}</div>
                  <div className="mt-1 text-sm uppercase tracking-[0.24em] text-slate-400">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <GlassCard className="border-white/10 bg-[#10131A]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#FFD000]">Alpha overview</p>
                <h3 className="mt-2 text-2xl font-black text-white">One sheet. Four channels. 30-day momentum.</h3>
              </div>
              <span className="rounded-full border border-[#FFD000]/20 bg-[#FFD000]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-[#FFD000]">Live</span>
            </div>
            <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-[#0A0A0F] p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-sm font-semibold text-slate-400">Reach</span>
                <span className="text-xl font-black text-white">2,400</span>
              </div>
              <div className="mt-4 flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-sm font-semibold text-slate-400">Posts</span>
                <span className="text-xl font-black text-white">30</span>
              </div>
              <div className="mt-4 flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-sm font-semibold text-slate-400">Platforms</span>
                <span className="text-xl font-black text-white">4</span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-400">Engine</span>
                <span className="text-xl font-black text-white">30 Days</span>
              </div>
            </div>
          </GlassCard>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <SectionTitle eyebrow="Platforms" title="Only six matured platforms. No Meta. No X. No Snapchat." subtitle="The stack is focused on LinkedIn Native, Gmail, Discord, GitHub, Google Docs, and Google Sheets." />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {platforms.map((platform) => (
            <div key={platform.name} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-3 text-[#FFD000]">{platform.icon}<h3 className="text-lg font-semibold text-white">{platform.name}</h3></div>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <SectionTitle eyebrow="Pricing" title="Early Bird $19/mo = ₦25,922 • First 100 only." subtitle="Taplio is $39 for one platform. AlphaTekX is $19 for six matured platforms and one full operating layer." />
        <div className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <GlassCard className="border-[#FFD000]/25 bg-[linear-gradient(135deg,rgba(255,208,0,0.12),rgba(139,92,246,0.12))]">
            <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#FFD000]">Early Bird</p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <span className="text-5xl font-black text-white">$19/mo</span>
              <span className="text-lg font-semibold text-slate-400">= ₦25,922</span>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-400">First 100 locked forever. Includes six platforms, unlimited AI, voice training, Sheets OS, and Pollinations images.</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-[#FFD000]" /> Six platforms, one workflow</li>
              <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-[#FFD000]" /> Unlimited AI generation</li>
              <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-[#FFD000]" /> Voice training from your records</li>
            </ul>
            <a href="#top" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#FFD000] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#ffe04d]">
              Access AlphaTekX OS Now
              <ArrowRight className="h-4 w-4" />
            </a>
          </GlassCard>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-300"><ChevronRight className="h-4 w-4 text-[#FFD000]" /> Taplio $39 = one platform, zero AI credits</div>
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-300"><ChevronRight className="h-4 w-4 text-[#FFD000]" /> AlphaTekX $19 = six platforms, unlimited output</div>
            <div className="mt-8 rounded-[1.25rem] border border-white/10 bg-[#090B12] p-5 text-sm leading-7 text-slate-400">
              The difference is not just price. It is where your operating system starts: inside one voice, one sheet, one serious motion.
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-center sm:text-left md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.36em] text-slate-500">AlphaTekX Technologies</p>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">Built for founders who will never be poor. AlphaTekX OS is the enterprise AI operating system for modern builders.</p>
          </div>
          <div className="text-sm text-slate-500">
            <p>alphatekx.name.ng locked till 2031</p>
            <p className="mt-2">© 2026 AlphaTekX OS has evolved</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
