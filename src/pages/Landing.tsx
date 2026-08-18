import { useEffect, useRef, useState, type MouseEvent } from 'react'
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleCheckBig,
  FileText,
  Gauge,
  Github,
  History,
  Linkedin,
  LockKeyhole,
  Mail,
  Menu,
  MessageSquare,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  Table2,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'
import SEO from '../components/SEO'
import { instantGoogleSignup, useAuth } from '../lib/auth'

const GOLD = '#FFD700'
const PURPLE = '#6B21A8'
const ease = [0.22, 1, 0.36, 1] as const

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })

  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (progress) => {
      if (progress > 0.3 && progress < 0.8) {
        const normalized = (progress - 0.3) / 0.5
        setDisplay(Math.round(normalized * value))
      } else if (progress >= 0.8) {
        setDisplay(value)
      }
    })

    return () => unsubscribe()
  }, [scrollYProgress, value])

  return <span ref={ref}>{display.toLocaleString()}{suffix}</span>
}

function Header() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const links = [
    ['Product', '#product'],
    ['How it works', '#how-it-works'],
    ['Use cases', '#use-cases'],
    ['Pricing', '#pricing'],
    ['FAQ', '#faq'],
  ]

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5 text-white">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#FFD700] to-[#6B21A8] text-black shadow-[0_0_28px_rgba(255,215,0,.22)]">
            <Sparkles size={18} />
          </span>
          <span className="font-black tracking-[.14em]">ALPHATEKX</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="text-sm font-semibold text-white/60 transition hover:text-white">
              {label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          {user ? (
            <Link
              to="/dashboard"
              className="inline-flex h-10 items-center rounded-full bg-[#FFD700] px-5 text-sm font-black text-black transition hover:brightness-110"
            >
              Open studio
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void instantGoogleSignup()}
              className="inline-flex h-10 items-center rounded-full bg-[#FFD700] px-5 text-sm font-black text-black transition hover:brightness-110"
            >
              Restore now
            </button>
          )}
        </div>

        <button
          aria-label="Toggle navigation"
          onClick={() => setOpen((value) => !value)}
          className="grid size-10 place-items-center rounded-xl border border-white/10 text-white md:hidden"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <motion.nav
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="grid gap-1 border-t border-white/10 bg-black px-4 py-4 md:hidden"
        >
          {links.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-3 font-bold text-white/70"
            >
              {label}
            </a>
          ))}
          {user ? (
            <Link
              to="/dashboard"
              className="mt-2 rounded-xl bg-[#FFD700] px-4 py-3 text-center font-black text-black"
            >
              Restore My Broken Thing
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void instantGoogleSignup()}
              className="mt-2 rounded-xl bg-[#FFD700] px-4 py-3 text-center font-black text-black"
            >
              Restore My Broken Thing
            </button>
          )}
        </motion.nav>
      )}
    </header>
  )
}

function WordReveal({ text }: { text: string }) {
  const reduced = useReducedMotion()

  return (
    <>
      {text.split(' ').map((word, index) => (
        <span key={`${word}-${index}`} className="mr-[.2em] inline-block overflow-hidden align-bottom last:mr-0">
          <motion.span
            initial={reduced ? false : { y: '110%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.1 + index * 0.09, ease }}
            className="inline-block"
          >
            {word}
          </motion.span>
        </span>
      ))}
    </>
  )
}

function DashboardMockup() {
  const reduced = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [5, -5]), { stiffness: 130, damping: 24 })
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-7, 7]), { stiffness: 130, damping: 24 })

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    if (reduced) return
    const bounds = event.currentTarget.getBoundingClientRect()
    x.set((event.clientX - bounds.left) / bounds.width - 0.5)
    y.set((event.clientY - bounds.top) / bounds.height - 0.5)
  }

  return (
    <div className="relative mx-auto w-full max-w-[620px] py-12" onMouseMove={onMove} onMouseLeave={() => { x.set(0); y.set(0) }}>
      <div className="absolute inset-[12%] rounded-full bg-[#6B21A8]/40 blur-[90px]" />
      <motion.div
        style={reduced ? undefined : { rotateX, rotateY, transformPerspective: 1100 }}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.35, ease }}
        className="relative overflow-hidden rounded-[26px] border border-white/15 bg-[#0B0B0F]/95 p-3 shadow-[0_40px_120px_rgba(107,33,168,.32)]"
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-3 pb-3">
          <i className="size-2.5 rounded-full bg-[#FF5F57]" />
          <i className="size-2.5 rounded-full bg-[#FEBC2E]" />
          <i className="size-2.5 rounded-full bg-[#28C840]" />
          <span className="ml-auto rounded-full border border-white/10 px-3 py-1 text-[9px] font-bold text-white/40">
            ALPHA COMMAND
          </span>
        </div>

        <div className="grid min-h-[330px] grid-cols-[62px_1fr] gap-3 pt-3 sm:grid-cols-[92px_1fr]">
          <aside className="rounded-2xl border border-white/10 bg-white/[.03] p-2">
            <div className="mx-auto grid size-9 place-items-center rounded-xl bg-[#FFD700] text-black">
              <Sparkles size={16} />
            </div>
            <div className="mt-5 space-y-2">
              {[1, 2, 3, 4].map((item) => (
                <i key={item} className={`mx-auto block h-8 rounded-lg ${item === 1 ? 'bg-[#6B21A8]/60' : 'bg-white/[.04]'}`} />
              ))}
            </div>
          </aside>

          <main className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                ['84', 'Reach'],
                ['4', 'Posts'],
                ['4', 'Platforms'],
              ].map(([value, label], index) => (
                <div
                  key={label}
                  className={`rounded-xl border p-3 ${
                    index === 1 ? 'border-[#FFD700]/35 bg-[#FFD700]/[.07]' : 'border-white/10 bg-white/[.035]'
                  }`}
                >
                  <p className="text-lg font-black text-white sm:text-2xl">{value}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">{label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-white">Growth engine</p>
                  <p className="text-[9px] text-white/35">Last 30 days</p>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-bold text-emerald-300">
                  LIVE
                </span>
              </div>
              <div className="mt-7 flex h-28 items-end gap-2">
                {[32, 48, 42, 67, 58, 82, 96].map((height, index) => (
                  <motion.i
                    key={index}
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ delay: 0.8 + index * 0.08, duration: 0.6, ease }}
                    className="flex-1 rounded-t bg-gradient-to-t from-[#6B21A8] to-[#FFD700]"
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-[#FFD700]/20 bg-[#FFD700]/[.05] p-3">
              <span className="grid size-9 place-items-center rounded-xl bg-[#FFD700] text-black">
                <Check size={17} />
              </span>
              <div>
                <p className="text-xs font-black text-white">LinkedIn posted at 9:00 AM</p>
                <p className="text-[9px] text-white/35">Confirmed · 1 credit across all platforms</p>
              </div>
            </div>
          </main>
        </div>
      </motion.div>

      <motion.div
        animate={reduced ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -left-2 top-3 rounded-2xl border border-[#FFD700]/25 bg-black/70 px-4 py-3 shadow-2xl backdrop-blur-xl sm:-left-10"
      >
        <p className="text-[10px] font-bold text-white/40">TODAY</p>
        <p className="mt-1 text-xs font-black text-white">
          4 posts confirmed <span className="text-[#FFD700]">✓</span>
        </p>
      </motion.div>
    </div>
  )
}

function Hero() {
  const { user } = useAuth()

  return (
    <section id="top" className="relative min-h-screen overflow-hidden bg-black px-4 pb-24 pt-28 sm:px-6 lg:flex lg:items-center lg:pt-20">
      <div className="pointer-events-none absolute -left-48 top-12 size-[520px] rounded-full bg-[#6B21A8]/25 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 size-[420px] rounded-full bg-[#FFD700]/[.06] blur-[120px]" />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 lg:grid-cols-[.92fr_1.08fr]">
        <div className="text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 rounded-full border border-[#FFD700]/25 bg-[#FFD700]/[.06] px-3 py-2 text-[11px] font-black uppercase tracking-[.16em] text-[#FFD700]"
          >
            <i className="size-2 animate-pulse rounded-full bg-[#FFD700]" />
            RESTORATION ECONOMY
          </motion.div>

          <h1 className="mt-7 font-['Space_Grotesk',Inter,sans-serif] text-[52px] font-black leading-[.94] tracking-[-.06em] text-white sm:text-7xl lg:text-[88px] xl:text-[96px]">
            <WordReveal text="WE DON'T BUILD WEBSITES, WE RESTORE." />
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75 }}
            className="mx-auto mt-7 max-w-2xl text-lg font-medium leading-8 text-white/60 sm:text-xl lg:mx-0"
          >
            Paste your broken link or broken video. We heal it to world-class. Builders create new. We restore hope.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1 }}
            className="mx-auto mt-6 max-w-lg lg:mx-0"
          >
            <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] font-bold text-white/50 sm:justify-start lg:text-xs">
              <span className="flex items-center gap-1.5"><Check size={12} className="text-emerald-400" /> Read-only scan</span>
              <span className="flex items-center gap-1.5"><Check size={12} className="text-emerald-400" /> World-class healing</span>
              <span className="flex items-center gap-1.5"><Check size={12} className="text-emerald-400" /> Market-ready restore</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="mt-9 flex flex-col items-center gap-4 sm:flex-row lg:items-start"
          >
            {user ? (
              <Link
                to="/dashboard"
                className="group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#FFD700] px-7 font-black text-black shadow-[0_0_42px_rgba(107,33,168,.55)] transition hover:-translate-y-1 hover:shadow-[0_0_55px_rgba(255,215,0,.28)] sm:w-auto"
              >
                Restore My Broken Thing Now
                <ArrowRight className="transition group-hover:translate-x-1" size={19} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void instantGoogleSignup()}
                className="group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#FFD700] px-7 font-black text-black shadow-[0_0_42px_rgba(107,33,168,.55)] transition hover:-translate-y-1 hover:shadow-[0_0_55px_rgba(255,215,0,.28)] sm:w-auto"
              >
                Restore My Broken Thing Now
                <ArrowRight className="transition group-hover:translate-x-1" size={19} />
              </button>
            )}
          </motion.div>
        </div>

        <DashboardMockup />
      </div>
    </section>
  )
}

function Problem() {
  const cards = [
    ['App recovery', 'Broken deployments are not dead — they are opportunities. Alpha scans read-only and restores the stack without touching your live product blindly.'],
    ['Video healing', 'Raw footage, weak pacing, and missing style are fixed into world-class edits that feel like the creators you admire.'],
    ['Market value', 'After restoration, your repaired app or video can be listed for sale and monetized through the Alpha market.'],
  ]

  return (
    <section className="border-y border-white/10 bg-[#050505] px-4 py-24 sm:px-6 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-4xl text-center font-['Space_Grotesk',Inter,sans-serif] text-4xl font-black tracking-[-.045em] text-white sm:text-6xl"
        >
          Builders Are Many. <span className="text-[#FFD700]">Restorers Are Few.</span>
        </motion.h2>

        <p className="mx-auto mt-6 max-w-3xl text-center text-lg leading-8 text-white/50">
          Lovable, Bolt, Base44 already built everything. What the world needs now is restoration — where broken deployments, boring videos become MrBeast-level.
        </p>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {cards.map(([title, copy], index) => (
            <motion.article
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.14, duration: 0.7, ease }}
              key={title}
              className="rounded-3xl border border-white/10 bg-white/[.025] p-7"
            >
              <span className="font-mono text-xs text-[#FFD700]">0{index + 1}</span>
              <h3 className="mt-12 text-2xl font-black text-white">{title}</h3>
              <p className="mt-3 leading-7 text-white/40">{copy}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}

const stackCards = [
  {
    label: 'STEP 1',
    copy: 'Paste Broken Thing (App link or raw video + MrBeast link)',
    icon: BrainCircuit,
    border: 'border-white/10',
    glow: 'shadow-black',
  },
  {
    label: 'STEP 2',
    copy: 'Alpha Scans & Learns The Style (Read-only scan, no breaking your link)',
    icon: Rocket,
    border: 'border-[#FFD700]/45',
    glow: 'shadow-[0_30px_90px_rgba(255,215,0,.10)]',
  },
  {
    label: 'STEP 3',
    copy: 'Get Healed, World-Class Version Back + Sell It',
    icon: BarChart3,
    border: 'border-[#6B21A8]',
    glow: 'shadow-[0_30px_100px_rgba(107,33,168,.28)]',
  },
]

function StackCard({ card, index, progress }: { card: (typeof stackCards)[number]; index: number; progress: MotionValue<number> }) {
  const start = index * 0.2
  const y = useTransform(progress, [start, Math.min(start + 0.35, 1)], [index ? 170 : 0, index * 26])
  const scale = useTransform(progress, [start, Math.min(start + 0.35, 1)], [0.95, 1 - index * 0.015])
  const opacity = useTransform(progress, [start, Math.min(start + 0.16, 1)], [index ? 0.15 : 1, 1])
  const Icon = card.icon

  return (
    <motion.article
      style={{ y, scale, opacity, zIndex: index + 1 }}
      className={`absolute inset-x-0 top-0 min-h-[390px] overflow-hidden rounded-[32px] border bg-[#0A0A0D] p-7 sm:p-10 ${card.border} ${card.glow}`}
    >
      <div className="absolute -right-24 -top-24 size-72 rounded-full bg-[#6B21A8]/20 blur-[90px]" />
      <div className="relative flex h-full min-h-[320px] flex-col justify-between">
        <div className="flex items-start justify-between">
          <span className="text-xs font-black tracking-[.2em] text-[#FFD700]">0{index + 1}</span>
          <span className="grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/[.04] text-[#FFD700]">
            <Icon size={25} />
          </span>
        </div>
        <div>
          <h3 className="font-['Space_Grotesk',Inter,sans-serif] text-4xl font-black tracking-[-.04em] text-white sm:text-6xl">
            {card.label}
          </h3>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/45 sm:text-lg">{card.copy}</p>
        </div>
      </div>
    </motion.article>
  )
}

function HowItWorks() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })

  return (
    <section id="how-it-works" ref={ref} className="relative h-[260vh] bg-black px-4 sm:px-6 max-md:h-auto max-md:py-24">
      <div className="sticky top-0 mx-auto flex h-screen max-w-7xl items-center gap-12 max-md:static max-md:block max-md:h-auto">
        <div className="w-[36%] max-md:w-full">
          <p className="text-xs font-black uppercase tracking-[.2em] text-[#FFD700]">How it works</p>
          <h2 className="mt-5 text-4xl font-black tracking-[-.045em] text-white sm:text-5xl">
            How Alpha Restores
            <br />
            Broken Things
          </h2>
          <p className="mt-5 max-w-sm leading-7 text-white/40">
            Broken links and rough footage are healed into world-class assets, then monetized.
          </p>
        </div>

        <div className="relative h-[430px] flex-1 max-md:mt-12 max-md:grid max-md:h-auto max-md:gap-5">
          {stackCards.map((card, index) => (
            <div key={card.label} className="max-md:relative max-md:h-[390px]">
              <StackCard card={card} index={index} progress={scrollYProgress} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function DemoDashboard({ progress }: { progress: MotionValue<number> }) {
  const [filled, setFilled] = useState(0)
  const cells = [
    'Founder story',
    'Algorithm pulse',
    'Hook test',
    'Post prep',
    'Review cycle',
    'LinkedIn live',
    'Caption swap',
    'Distribution',
    'Engagement day',
    'Story hook',
    'Trend check',
    'Founder story',
    'Network push',
    'Headline refresh',
    'Content edit',
    'Platform sync',
    'A/B caption',
    'CTA refresh',
    'Boost prompt',
    'Hashtag lab',
    'DM flow',
    'Analytics check',
    'Weekend burst',
    'Niche angle',
    'Follow-up post',
    'Repurpose clip',
    'Momentum reset',
    'Live test',
  ]

  useEffect(() => {
    const unsubscribe = progress.on('change', (value) => {
      const active = Math.max(0, Math.min(cells.length, Math.floor(((value - 0.25) / 0.35) * cells.length)))
      setFilled(active)
    })

    return () => unsubscribe()
  }, [cells.length, progress])

  const progressPct = `${Math.round((filled / cells.length) * 100)}%`
  const displayLabel = filled > 0 ? `Day ${filled}: ${cells[filled - 1]}` : 'Day 1: Founder story'

  return (
    <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#09090C] p-4 shadow-[0_40px_120px_rgba(107,33,168,.2)] sm:p-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <p className="text-xs font-black text-white">ALPHA OVERVIEW</p>
          <p className="text-[10px] text-white/40">84 impressions on launch day</p>
        </div>
        <span className="flex items-center gap-2 text-[10px] font-bold text-emerald-300">
          <i className="size-2 rounded-full bg-emerald-400" />
          EXECUTING
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4">
          <motion.p className="text-2xl font-black text-white">
            <AnimatedCounter value={84} />
          </motion.p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/30">Impressions</p>
        </div>

        {[
          ['Posts', '4 tested'],
          ['Platforms', '4'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[.035] p-4">
            <p className="text-2xl font-black text-white">{value}</p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/30">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.025] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold text-white/40">30-day content engine</p>
            <p className="text-[10px] text-white/30">Live grid fills with every execution day</p>
          </div>
          <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-semibold text-white/60">
            {displayLabel}
          </span>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#6B21A8] to-[#FFD700]"
            style={{ width: progressPct }}
          />
        </div>

        <div className="mt-5 grid grid-cols-7 gap-1.5">
          {cells.map((label, index) => {
            const active = index < filled
            return (
              <motion.div
                key={`${label}-${index}`}
                whileHover={{ scale: 1.05 }}
                className={`group relative aspect-square rounded-md border ${
                  active ? 'border-[#FFD700] bg-[#FFD700]/20 shadow-[0_0_30px_rgba(255,215,0,.08)]' : 'border-white/10 bg-white/[.03]'
                }`}
                title={`Day ${index + 1}: ${label}`}
              >
                <span
                  className={`absolute inset-x-0 top-2 text-center text-[9px] font-bold uppercase tracking-[.2em] ${
                    active ? 'text-white' : 'text-white/30'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[9px] text-white/25 opacity-0 group-hover:opacity-100">
                  {label}
                </span>
              </motion.div>
            )
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {['in', 'f', '𝕏', '◎'].map((icon, index) => (
          <PlatformTile key={icon} icon={icon} index={index} progress={progress} />
        ))}
      </div>
    </div>
  )
}

function PlatformTile({ icon, index, progress }: { icon: string; index: number; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.48 + index * 0.05, 0.62 + index * 0.05], [0.15, 1])

  return (
    <motion.div
      style={{ opacity }}
      className="grid h-12 place-items-center rounded-xl border border-white/10 bg-white/[.03] font-black text-[#FFD700]"
    >
      {icon}
    </motion.div>
  )
}

function ScrollDemo() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const stages = [
    ['Your dashboard begins with an outcome.', 'Tell Alpha what growth looks like.'],
    ['1 Credit = Post to ALL platforms.', 'One unit of work. No per-channel punishment.'],
    ['Thirty days, created in moments.', 'Every post stays reviewable before execution.'],
    ['Approved work goes live.', 'Connected platforms light up only after confirmation.'],
    ['Work compounds while you live.', 'Reach, followers, and engagement keep moving.'],
  ]
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (value) => {
      setStage(Math.min(4, Math.floor(value * 5)))
    })
    return () => unsubscribe()
  }, [scrollYProgress])

  return (
    <section id="demo" ref={ref} className="relative h-[250vh] bg-[#050505] px-4 sm:px-6 max-md:h-auto max-md:py-24">
      <div className="sticky top-0 mx-auto grid h-screen max-w-7xl items-center gap-12 lg:grid-cols-[.75fr_1.25fr] max-md:static max-md:h-auto">
        <div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-[#FFD700]">See the shift</p>

          <div className="hidden md:block">
            <motion.div
              key={stage}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease }}
            >
              <h2 className="mt-5 text-4xl font-black tracking-[-.045em] text-white sm:text-5xl">
                {stages[stage][0]}
              </h2>
              <p className="mt-5 max-w-md leading-7 text-white/40">{stages[stage][1]}</p>
            </motion.div>

            <div className="mt-9 flex gap-2">
              {stages.map((_, index) => (
                <span
                  key={index}
                  className={`h-1.5 rounded-full transition-all ${
                    index === stage ? 'w-10 bg-[#FFD700]' : 'w-4 bg-white/15'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mt-7 space-y-4 md:hidden">
            {stages.map(([title, copy], index) => (
              <motion.article
                key={title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="rounded-2xl border border-white/10 bg-white/[.03] p-5"
              >
                <span className="text-[10px] font-black text-[#FFD700]">0{index + 1}</span>
                <h2 className="mt-3 text-2xl font-black tracking-[-.035em] text-white">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-white/40">{copy}</p>
              </motion.article>
            ))}
          </div>
        </div>

        <div className="max-md:mt-8">
          <DemoDashboard progress={scrollYProgress} />
        </div>
      </div>
    </section>
  )
}

const connectedTools = [
  { name: 'LinkedIn', detail: 'Native publishing', icon: Linkedin },
  { name: 'Gmail', detail: 'Inbox workflows', icon: Mail },
  { name: 'GitHub', detail: 'Repository workflows', icon: Github },
  { name: 'Google Docs', detail: 'Documents and briefs', icon: FileText },
  { name: 'Google Sheets', detail: 'Structured operations', icon: Table2 },
  { name: 'Discord', detail: 'Team communication', icon: MessageSquare },
]

const outcomeExamples = [
  {
    label: 'Launch a campaign',
    prompt: 'Create a one-week LinkedIn launch campaign and prepare the supporting brief in Google Docs.',
    result: '7 tailored posts · launch brief · review required',
  },
  {
    label: 'Run my inbox',
    prompt: 'Every morning, summarize urgent customer emails and prepare replies for my approval.',
    result: 'Daily inbox brief · priority routing · replies in draft',
  },
  {
    label: 'Organize operations',
    prompt: 'Record new orders in Google Sheets and send my team a clear daily update.',
    result: 'Order capture · sheet update · team notification',
  },
]

function InteractiveOutcomeDemo() {
  const [active, setActive] = useState(0)
  const example = outcomeExamples[active]
  const steps = [
    ['Scans', 'The broken app or video is examined read-only to find leaks, errors, weak structure, and style gaps'],
    ['Learns', 'Alpha studies the target style and defines the exact restoration path'],
    ['Heals', 'The app or video is brought back to world-class quality without a rebuild from scratch'],
    ['Sells', 'After restoration, the repaired asset can be listed and monetized in the market'],
  ]

  return (
    <section id="product" className="relative overflow-hidden bg-black px-4 py-24 sm:px-6 lg:py-36">
      <div className="pointer-events-none absolute right-0 top-1/3 size-[520px] rounded-full bg-[#6B21A8]/20 blur-[140px]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-black uppercase tracking-[.22em] text-[#FFD700]">Try the thinking model</p>
          <h2 className="mt-5 text-4xl font-black tracking-[-.05em] text-white sm:text-6xl lg:text-7xl">
            Start with a result, not a workflow diagram.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/50">
            Alpha scans broken apps and raw videos, learns the style you want, and returns a healed version that looks world-class.
          </p>
        </div>

        <div className="mt-12 grid overflow-hidden rounded-[32px] border border-white/10 bg-[#09090C] shadow-[0_40px_120px_rgba(107,33,168,.18)] lg:grid-cols-[.9fr_1.1fr]">
          <div className="border-b border-white/10 p-5 sm:p-8 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-white/35">
              <WandSparkles size={15} className="text-[#FFD700]" /> Tell Alpha what needs healing
            </div>
            <div className="mt-5 min-h-44 rounded-2xl border border-white/10 bg-black p-5 text-lg font-semibold leading-8 text-white sm:text-xl">
              Paste a broken deployed app link or upload a raw video and tell Alpha the style you want restored.
              <span className="ml-1 inline-block h-5 w-0.5 animate-pulse bg-[#FFD700] align-middle" />
            </div>
            <div className="mt-4 flex snap-x gap-2 overflow-x-auto pb-2">
              {outcomeExamples.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setActive(index)}
                  className={`min-h-11 shrink-0 snap-start rounded-full px-4 text-xs font-black transition ${index === active ? 'bg-[#FFD700] text-black' : 'border border-white/10 bg-white/[.035] text-white/55 hover:text-white'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[#FFD700]/20 bg-[#FFD700]/[.055] p-4">
              <div><p className="text-[10px] font-black uppercase tracking-wider text-[#FFD700]">Prepared restoration</p><p className="mt-1 text-sm font-bold text-white/70">Broken link or video analyzed · style learned · world-class version ready</p></div>
              <Play size={20} className="shrink-0 text-[#FFD700]" fill="currentColor" />
            </div>
          </div>

          <div className="p-5 sm:p-8">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-white/35">What happens next</p>
            <div className="mt-5 space-y-3">
              {steps.map(([title, copy], index) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, x: 14 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08 }}
                  className="flex gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 sm:p-5"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#6B21A8]/25 text-xs font-black text-[#FFD700]">0{index + 1}</span>
                  <div><h3 className="font-black text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-white/40">{copy}</p></div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function IntegrationsStrip() {
  return (
    <section className="border-y border-white/10 bg-[#070709] px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.22em] text-[#FFD700]">One restoration studio</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-[-.045em] text-white sm:text-6xl">
              Broken links and weak videos get restored with precision.
            </h2>
          </div>
          <p className="max-w-md text-base leading-7 text-white/50">
            We scan read-only, learn the style, and heal your broken asset into a polished, market-ready version without starting from zero.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4">
          {connectedTools.map(({ name, detail, icon: Icon }, index) => (
            <motion.article
              key={name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className="group min-h-36 rounded-2xl border border-white/10 bg-white/[.025] p-5 transition hover:-translate-y-1 hover:border-[#FFD700]/35 hover:bg-white/[.045]"
            >
              <Icon className="text-[#FFD700]" size={23} strokeWidth={1.7} />
              <h3 className="mt-6 text-base font-black text-white sm:text-lg">{name}</h3>
              <p className="mt-1 text-xs leading-5 text-white/40">{detail}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}

function UseCases() {
  const cases = [
    {
      eyebrow: 'For founders',
      title: 'Turn broken launches into restored revenue engines.',
      copy: 'A deployed app with leaks, weak performance, or environment issues gets a read-only scan and a full restoration back to world-class health.',
      metric: 'Diagnose → restore → monetize',
    },
    {
      eyebrow: 'For creators',
      title: 'Turn weak raw footage into MrBeast-level cuts and pacing.',
      copy: 'Upload raw video, paste the style reference, and Alpha restores the edit to the energy, rhythm, captions, and sound design you want.',
      metric: 'Raw → healed → sold',
    },
    {
      eyebrow: 'For sellers',
      title: 'List repaired assets and convert restoration into income.',
      copy: 'After healing, restored apps and videos can go live in the market so the work earns back value with a 10% fee on sales.',
      metric: 'Repair → list → profit',
    },
  ]

  return (
    <section id="use-cases" className="bg-black px-4 py-24 sm:px-6 lg:py-36">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[.22em] text-[#FFD700]">Built around repair</p>
          <h2 className="mt-5 text-4xl font-black tracking-[-.05em] text-white sm:text-6xl lg:text-7xl">
            Less noise. More restoration. More value.
          </h2>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {cases.map((item, index) => (
            <motion.article
              key={item.eyebrow}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.65, ease }}
              className="flex min-h-[410px] flex-col rounded-[30px] border border-white/10 bg-gradient-to-b from-white/[.055] to-white/[.018] p-7 sm:p-8"
            >
              <p className="text-xs font-black uppercase tracking-[.18em] text-[#FFD700]">{item.eyebrow}</p>
              <h3 className="mt-8 text-3xl font-black leading-tight tracking-[-.035em] text-white">{item.title}</h3>
              <p className="mt-5 leading-7 text-white/45">{item.copy}</p>
              <div className="mt-auto border-t border-white/10 pt-6 text-sm font-black text-white">{item.metric}</div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}

function TrustSection() {
  const safeguards = [
    ['Read-only first', 'Alpha scans the broken app without touching the production link, so the risk is visible before healing begins.', ShieldCheck],
    ['Style is learned, not guessed', 'A broken video gets matched to the style you want, including pacing, zooms, captions, and sound design.', CircleCheckBig],
    ['Repair is transparent', 'You get a clear result from the audit or edit, and the restored asset is ready to sell when it is healed.', LockKeyhole],
  ]

  return (
    <section className="relative overflow-hidden bg-[#070709] px-4 py-24 sm:px-6 lg:py-36">
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6B21A8]/15 blur-[150px]" />
      <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[.22em] text-[#FFD700]">Repair, without panic</p>
          <h2 className="mt-5 text-4xl font-black tracking-[-.05em] text-white sm:text-6xl">
            Healed output, not blind rebuilds.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-8 text-white/50">
            Alpha starts with the truth: what is broken, what is exposed, and what the style should become before the restoration begins.
          </p>
        </div>

        <div className="space-y-4">
          {safeguards.map(([title, copy, Icon], index) => (
            <motion.article
              key={title as string}
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="flex gap-5 rounded-3xl border border-white/10 bg-black/60 p-6 sm:p-7"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#FFD700]/10 text-[#FFD700]">
                <Icon size={22} />
              </span>
              <div>
                <h3 className="text-xl font-black text-white">{title as string}</h3>
                <p className="mt-2 leading-7 text-white/45">{copy as string}</p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ExecutionProof() {
  const proof = [
    { icon: Gauge, title: 'Scan report', copy: 'Alpha identifies exposed keys, broken envs, slow performance, and weak structures before any healing step.' },
    { icon: History, title: 'Restoration history', copy: 'Every repair keeps its findings, style match, and healed output so the result is transparent and trackable.' },
    { icon: ShieldCheck, title: 'Safe healing', copy: 'We restore without a destructive rebuild, no random edits, and no guessing on what actually broke.' },
  ]

  return (
    <section className="border-y border-white/10 bg-black px-4 py-24 sm:px-6 lg:py-36">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[.22em] text-[#FFD700]">Proof, not promises</p>
            <h2 className="mt-5 text-4xl font-black tracking-[-.05em] text-white sm:text-6xl">Watch the repair move from broken to restored.</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/50">A serious restoration workflow needs an audit trail. Alpha keeps the scan, the fix, and the final result visible instead of hiding the damage.</p>
            <div className="mt-9 space-y-3">
              {proof.map(({ icon: Icon, title, copy }) => (
                <div key={title} className="flex gap-4 rounded-2xl border border-white/[.07] p-5">
                  <Icon className="mt-0.5 shrink-0 text-[#FFD700]" size={21} />
                  <div><h3 className="font-black text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-white/40">{copy}</p></div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-[#09090C] p-4 shadow-[0_35px_100px_rgba(255,215,0,.07)] sm:p-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div><p className="text-sm font-black text-white">Campaign execution</p><p className="text-xs text-white/35">AlphaTekx launch · today</p></div>
              <span className="flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black text-emerald-300"><i className="size-2 animate-pulse rounded-full bg-emerald-400" /> LIVE</span>
            </div>
            <div className="mt-5 space-y-3">
              {[
                ['Content prepared', 'Reviewed', '09:02'],
                ['Approval received', 'Confirmed', '09:06'],
                ['LinkedIn publication', 'Post ID saved', '09:07'],
                ['Execution history', 'Written', '09:07'],
              ].map(([title, status, time], index) => (
                <div key={title} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-2xl bg-white/[.03] p-4">
                  <span className="grid size-9 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check size={16} /></span>
                  <div><p className="text-sm font-black text-white">{title}</p><p className="text-xs text-white/35">{status}</p></div>
                  <span className="font-mono text-[10px] text-white/30">{time}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-[#FFD700]/20 bg-[#FFD700]/[.05] p-4 text-sm font-bold text-white/70">1 confirmed result · 1 credit charged · 0 duplicates</div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Comparison() {
  const rows = [
    ['Paste a broken app link or raw video', true, false],
    ['Learn the required style before editing', true, false],
    ['Repair with a read-only scan first', true, false],
    ['Deliver a world-class healed version', true, false],
    ['List the restored asset for sale', true, false],
  ]

  return (
    <section className="bg-black px-4 py-24 sm:px-6 lg:py-36">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[.22em] text-[#FFD700]">A different operating model</p>
          <h2 className="mt-5 text-4xl font-black tracking-[-.05em] text-white sm:text-6xl">Not another builder. A dedicated restorer.</h2>
          <p className="mx-auto mt-5 max-w-2xl leading-7 text-white/45">Builders create new things. We restore broken things to world-class quality, faster and smarter.</p>
        </div>

        <div className="mt-12 overflow-hidden rounded-[28px] border border-white/10 bg-[#09090C]">
          <div className="grid grid-cols-[1fr_90px_90px] border-b border-white/10 px-4 py-4 text-[10px] font-black uppercase tracking-wider text-white/40 sm:grid-cols-[1fr_160px_160px] sm:px-7">
            <span>Capability</span><span className="text-center text-[#FFD700]">AlphaTekx</span><span className="text-center">Typical tool</span>
          </div>
          {rows.map(([label, alpha, typical]) => (
            <div key={label as string} className="grid min-h-16 grid-cols-[1fr_90px_90px] items-center border-b border-white/[.06] px-4 last:border-0 sm:grid-cols-[1fr_160px_160px] sm:px-7">
              <span className="pr-3 text-sm font-semibold text-white/70 sm:text-base">{label as string}</span>
              <span className="mx-auto grid size-7 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check size={15} /></span>
              <span className="mx-auto text-sm text-white/30">{typical ? 'Available' : 'Manual'}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQ() {
  const items = [
    ['What does Alpha restore?', 'Alpha restores broken deployed apps and broken raw videos. We scan for leaks, errors, weak performance, and style gaps, then heal the asset to world-class quality.'],
    ['Does Alpha touch my live app?', 'No. App restoration starts with a read-only scan. We report issues first and never break your link or production deployment.'],
    ['Can Alpha match a style like MrBeast or IShowSpeed?', 'Yes. Upload the broken video and paste the reference link, and Alpha learns the pacing, cuts, captions, zooms, and sound design before restoring it.'],
    ['Can I sell restored work after healing?', 'Yes. Once a restored app or video is ready, it can be listed in the market and we take a 10% fee on the sale.'],
    ['Do I need to build from scratch?', 'No. We do not build new apps or videos from zero. We restore what is broken into a world-class version.'],
  ]

  return (
    <section id="faq" className="bg-[#070709] px-4 py-24 sm:px-6 lg:py-36">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.7fr_1.3fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[.22em] text-[#FFD700]">Questions, answered</p>
          <h2 className="mt-5 text-4xl font-black tracking-[-.05em] text-white sm:text-6xl">Know what happens before Alpha works.</h2>
        </div>
        <div className="divide-y divide-white/10 border-y border-white/10">
          {items.map(([question, answer]) => (
            <details key={question} className="group py-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-lg font-black text-white sm:text-xl">
                {question}<span className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 text-[#FFD700] transition group-open:rotate-45">+</span>
              </summary>
              <p className="max-w-2xl pt-4 leading-7 text-white/45">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  const { user } = useAuth()
  const [yearly, setYearly] = useState(false)
  const plans = [
    { id: 'healer_starter', name: 'HEALER STARTER', price: 19, annualPrice: 190, details: '10 App Scans (report only, no touch) + 3 Video Restorations (MrBeast style) + PDF Audit Report', featured: false },
    { id: 'healer_pro', name: 'HEALER PRO', price: 49, annualPrice: 490, details: '50 Full App Restorations (we heal, not just report) + 25 Video Restorations (MrBeast, IShowSpeed, Malva styles) + List 5 Restored Items For Sale (10% fee)', featured: true },
    { id: 'healer_empire', name: 'HEALER EMPIRE', price: 99, annualPrice: 990, details: 'UNLIMITED Restorations + All Styles + Unlimited Market Listings + API Access + Priority Healing + White-label Reports', featured: false },
  ]

  return (
    <section id="pricing" className="bg-black px-4 py-24 sm:px-6 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[.2em] text-[#FFD700]">Simple by design</p>
          <h2 className="mt-5 text-4xl font-black tracking-[-.045em] text-white sm:text-6xl">
            Heal What’s Broken. Sell What’s Restored.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl leading-7 text-white/40">
            We do not build from scratch. We restore broken apps, broken videos, and broken opportunities into world-class value.
          </p>

          <div className="mx-auto mt-8 flex w-fit rounded-full border border-white/10 bg-white/[.04] p-1">
            <button
              onClick={() => setYearly(false)}
              className={`rounded-full px-5 py-2.5 text-sm font-bold ${!yearly ? 'bg-white text-black' : 'text-white/40'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`rounded-full px-5 py-2.5 text-sm font-bold ${yearly ? 'bg-[#FFD700] text-black' : 'text-white/40'}`}
            >
              Annual <span className="ml-1 text-[10px]">2 months free</span>
            </button>
          </div>
          <p className="mt-4 text-sm text-white/45">Annual billing saves 2 months.</p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <motion.article
              whileHover={{ y: -6 }}
              key={plan.id}
              className={`relative rounded-[28px] border bg-[#09090C] p-7 ${
                plan.featured ? 'border-[#FFD700] shadow-[0_0_60px_rgba(255,215,0,.10)]' : 'border-[#FFD700]/20'
              }`}
            >
              {plan.featured && (
                <span className="absolute right-5 top-5 rounded-full bg-[#FFD700] px-3 py-1 text-[9px] font-black uppercase text-black">
                  Most Popular
                </span>
              )}

              <p className="text-xs font-black uppercase tracking-[.16em] text-[#FFD700]">{plan.name}</p>
              <p className="mt-7 text-5xl font-black text-white">
                ${yearly ? plan.annualPrice : plan.price}
                <span className="text-sm font-semibold text-white/30">/mo</span>
              </p>
              <p className="mt-2 text-xs font-semibold text-white/45">{yearly ? `Billed at $${plan.annualPrice} yearly` : 'Monthly billing'}</p>
              <p className="mt-2 text-sm text-white/60">{plan.details}</p>
              <div className="my-7 h-px bg-white/10" />

              {['Read-only app scan protection', 'World-class restoration workflow', 'Market-ready output'].map((item) => (
                <div key={item} className="mt-3 flex items-center gap-2 text-sm font-semibold text-white/65">
                  <Check size={16} className="text-[#FFD700]" />
                  {item}
                </div>
              ))}

              <button
                type="button"
                onClick={() => void instantGoogleSignup()}
                className={`mt-8 inline-flex min-h-[48px] w-full items-center justify-center rounded-full px-4 font-black ${
                  plan.featured ? 'bg-[#FFD700] text-black' : 'border border-white/15 text-white'
                }`}>
                {plan.featured ? 'Choose HEALER PRO' : `Choose ${plan.name}`}
              </button>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  const { user } = useAuth()

  const handleEarlyFounderDeal = () => {
    void instantGoogleSignup('early_founder_19')
  }

  return (
    <section className="relative overflow-hidden border-t border-white/10 bg-black px-4 py-28 text-center sm:px-6">
      <div className="absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6B21A8]/25 blur-[140px]" />
      <div className="relative mx-auto max-w-4xl">
        <Zap className="mx-auto text-[#FFD700]" />
        <h2 className="mt-6 text-5xl font-black tracking-[-.055em] text-white sm:text-7xl">
          Don’t Build New.
          <br />
          <span className="bg-gradient-to-r from-[#FFD700] to-[#8B3FC7] bg-clip-text text-transparent">
            Restore It.
          </span>
        </h2>
        <p className="mt-6 text-lg text-white/45">Your broken app or video deserves a second life.</p>
        <button
          type="button"
          onClick={() => void instantGoogleSignup()}
          style={{ background: '#FFFFFF', color: '#000000', height: '48px', borderRadius: '12px', fontWeight: 600 }}
          className="mt-9 inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#FFD700] px-8 font-black text-black shadow-[0_0_50px_rgba(107,33,168,.5)]"
        >
          Restore My Broken Thing Now
          <ArrowRight size={19} />
        </button>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-white/35 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-black tracking-[.12em] text-white">ALPHATEKX</span>
        <div className="flex gap-5">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span>Annual billing saves 2 months.</span>
          <span>AlphaTekX - Where Broken Things Are Restored.</span>
        </div>
      </div>
    </footer>
  )
}

function MobileCTA() {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  const { scrollYProgress } = useScroll()

  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (progress) => {
      setVisible(progress > 0.5)
    })
    return () => unsubscribe()
  }, [scrollYProgress])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-4 md:hidden">
      <button
        type="button"
        onClick={() => void instantGoogleSignup('early_founder_19')}
        className="flex h-[56px] max-h-[56px] items-center justify-center gap-2 rounded-full bg-[#FFD700] px-5 text-sm font-black text-black shadow-[0_18px_40px_rgba(0,0,0,.25)]"
      >
        Claim New Deal $19 →
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

export default function Landing() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 130, damping: 28 })

  return (
    <div className="min-h-screen overflow-x-hidden bg-black pb-[100px] font-['Inter',sans-serif] text-white">
      <SEO title="AlphaTekX — We Don't Build Websites, We Restore" description="Paste your broken link or broken video. We heal it to world-class." />
      <motion.div style={{ scaleX }} className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-[#6B21A8] to-[#FFD700]" />
      <Header />
      <main className="overflow-x-clip overflow-y-visible">
        <Hero />
        <IntegrationsStrip />
        <InteractiveOutcomeDemo />
        <Problem />
        <UseCases />
        <HowItWorks />
        <ScrollDemo />
        <TrustSection />
        <ExecutionProof />
        <Comparison />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <MobileCTA />    </div>
  )
} 