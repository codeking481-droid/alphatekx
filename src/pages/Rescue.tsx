import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, FileWarning, KeyRound, LoaderCircle, MonitorX, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import SEO from '../components/SEO'
import { instantGoogleSignup, useAuth } from '../lib/auth'

const GOLD = '#FFD700'
const ease = [0.22, 1, 0.36, 1] as const

const symptoms = [
  { icon: LoaderCircle, title: 'Stuck on "Loading…"', copy: 'The generated app fetches data that never arrives. The spinner is the whole product.' },
  { icon: FileWarning, title: 'Dead buttons everywhere', copy: 'Checkout, submit, save — the handlers were never wired or crashed on boot.' },
  { icon: KeyRound, title: 'Exposed API keys', copy: 'Stripe, Supabase and OpenAI keys sitting in plain sight in the client bundle.' },
  { icon: MonitorX, title: 'Blank white screen', copy: 'One syntax error in the bundle took down the entire render tree.' },
]

const steps = [
  ['Paste the broken URL', 'Any deployed app from Lovable, Bolt, Base44, Replit or your own hosting. Read-only scan — nothing gets touched.'],
  ['Alpha diagnoses & repairs', 'Every issue mapped, secrets redacted, scripts reconstructed, styles healed — surgical diffs only, no rebuild.'],
  ['Verified in a live browser', 'Behavior tests must pass before delivery. You get the restored site, a report, git history and rollback.'],
]

export default function Rescue() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-black font-['Inter',sans-serif] text-white">
      <SEO title="AlphaTekX Rescue — Your AI-built app broke. We restore it." description="Stuck loader, dead checkout, exposed keys? Alpha restores broken Lovable, Bolt and Replit apps surgically — verified in a live browser." />

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 text-white">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#FFD700] to-[#6B21A8] text-black shadow-[0_0_28px_rgba(255,215,0,.22)]">
              <Sparkles size={18} />
            </span>
            <span className="font-black tracking-[.14em]">ALPHATEKX</span>
          </Link>
          {user ? (
            <Link to="/chat" className="inline-flex h-10 items-center rounded-full bg-[#FFD700] px-5 text-sm font-black text-black transition hover:brightness-110">
              Open studio
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void instantGoogleSignup()}
              className="inline-flex h-10 items-center rounded-full bg-[#FFD700] px-5 text-sm font-black text-black transition hover:brightness-110"
            >
              Rescue now
            </button>
          )}
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:pt-40">
          <div className="pointer-events-none absolute -left-48 top-12 size-[520px] rounded-full bg-[#6B21A8]/25 blur-[130px]" />
          <div className="pointer-events-none absolute bottom-0 right-0 size-[420px] rounded-full bg-[#FFD700]/[.06] blur-[120px]" />
          <div className="relative mx-auto max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 rounded-full border border-[#FFD700]/25 bg-[#FFD700]/[.06] px-3 py-2 text-[11px] font-black uppercase tracking-[.16em] text-[#FFD700]"
            >
              <i className="size-2 animate-pulse rounded-full bg-[#FFD700]" />
              Vibe-coder rescue · No rebuilds
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.8, ease }}
              className="mt-7 font-['Space_Grotesk',Inter,sans-serif] text-5xl font-black leading-[.98] tracking-[-.05em] sm:text-7xl"
            >
              Built by AI.
              <br />
              Broken by AI.
              <br />
              <span className="bg-gradient-to-r from-[#FFD700] to-[#8B3FC7] bg-clip-text text-transparent">Rescued by Alpha.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className="mx-auto mt-7 max-w-2xl text-lg font-medium leading-8 text-white/60 sm:text-xl"
            >
              Lovable, Bolt, Base44 and Replit build fast — and sometimes ship broken. A stuck loader, a dead checkout,
              an exposed Stripe key at 2 AM. Don&apos;t regenerate and pray. Paste the link. Alpha restores what you already have.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75 }}
              className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row"
            >
              {user ? (
                <Link
                  to="/chat"
                  className="group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#FFD700] px-8 font-black text-black shadow-[0_0_42px_rgba(107,33,168,.55)] transition hover:-translate-y-1 sm:w-auto"
                >
                  Rescue My App Now
                  <ArrowRight className="transition group-hover:translate-x-1" size={19} />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void instantGoogleSignup()}
                  className="group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#FFD700] px-8 font-black text-black shadow-[0_0_42px_rgba(107,33,168,.55)] transition hover:-translate-y-1 sm:w-auto"
                >
                  Rescue My App Now
                  <ArrowRight className="transition group-hover:translate-x-1" size={19} />
                </button>
              )}
              <Link to="/" className="inline-flex min-h-14 items-center gap-2 px-4 text-sm font-bold text-white/50 transition hover:text-white">
                <ArrowLeft size={16} />
                Back to restoration studio
              </Link>
            </motion.div>
          </div>
        </section>

        {/* SYMPTOMS */}
        <section className="border-y border-white/10 bg-[#050505] px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center text-3xl font-black tracking-[-.04em] text-white sm:text-5xl">
              Sound familiar?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg leading-8 text-white/50">
              These are the four most common ways generated apps break. Alpha fixes every one of them — without starting over.
            </p>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {symptoms.map(({ icon: Icon, title, copy }, index) => (
                <motion.article
                  key={title}
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08, duration: 0.6, ease }}
                  className="rounded-3xl border border-white/10 bg-white/[.025] p-6"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-[#FFD700]/10 text-[#FFD700]">
                    <Icon size={20} />
                  </span>
                  <h3 className="mt-5 text-lg font-black text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/45">{copy}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* HOW RESCUE WORKS */}
        <section className="bg-black px-4 py-20 sm:px-6 lg:py-28">
          <div className="mx-auto max-w-5xl">
            <p className="text-xs font-black uppercase tracking-[.22em] text-[#FFD700]">How the rescue works</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-.04em] text-white sm:text-5xl">
              Three steps. Zero panic.
            </h2>
            <div className="mt-12 space-y-4">
              {steps.map(([title, copy], index) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, x: -18 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.6, ease }}
                  className="flex gap-5 rounded-3xl border border-white/10 bg-[#09090C] p-6 sm:p-8"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#FFD700] to-[#6B21A8] text-lg font-black text-black">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-xl font-black text-white">{title}</h3>
                    <p className="mt-2 leading-7 text-white/45">{copy}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {['Read-only scan first — never breaks the live link', 'Surgical diffs — fix the leak, not the house', 'Full rollback history kept'].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-semibold text-white/65">
                  <Check size={16} className="shrink-0 text-[#FFD700]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="relative overflow-hidden border-t border-white/10 bg-black px-4 py-24 text-center sm:px-6">
          <div className="absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6B21A8]/25 blur-[140px]" />
          <div className="relative mx-auto max-w-3xl">
            <Zap className="mx-auto text-[#FFD700]" />
            <h2 className="mt-6 text-4xl font-black tracking-[-.05em] text-white sm:text-6xl">
              Your app isn&apos;t dead.
              <br />
              It&apos;s waiting for <span className="bg-gradient-to-r from-[#FFD700] to-[#8B3FC7] bg-clip-text text-transparent">rescue.</span>
            </h2>
            <p className="mt-5 text-lg text-white/45">Fixed in minutes. Verified in a real browser. Cheaper than one developer hour.</p>
            <button
              type="button"
              onClick={() => void instantGoogleSignup()}
              style={{ background: '#FFFFFF', color: '#000000' }}
              className="mt-9 inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-white px-8 font-black text-black shadow-[0_0_50px_rgba(107,33,168,.5)] transition hover:-translate-y-1"
            >
              Start the rescue
              <ArrowRight size={19} />
            </button>
            <p className="mt-6 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-white/30">
              <ShieldCheck size={14} className="text-emerald-400" />
              Read-only scan · Secrets redacted · Behavior verified
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-white/35 sm:flex-row">
          <span className="font-black tracking-[.12em] text-white">ALPHATEKX</span>
          <div className="flex gap-5">
            <Link to="/" className="transition hover:text-white/70">Home</Link>
            <Link to="/privacy" className="transition hover:text-white/70">Privacy</Link>
            <Link to="/terms" className="transition hover:text-white/70">Terms</Link>
          </div>
          <span>AlphaTekX — Where Broken Things Are Restored.</span>
        </div>
      </footer>
    </div>
  )
}
