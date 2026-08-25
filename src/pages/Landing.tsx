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
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleCheckBig,
  Gauge,
  History,
  Link2,
  LockKeyhole,
  Menu,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wand2,
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
  const [authError, setAuthError] = useState('')
  const navigate = useNavigate()
  const links = [
    ['Product', '#product'],
    ['How it works', '#how-it-works'],
    ['Use cases', '#use-cases'],
    ['Rescue', '/rescue'],
    ['Pricing', '#pricing'],
    ['FAQ', '#faq'],
  ]
  const handleAuth = async () => {
    setAuthError('')
    try {
      await instantGoogleSignup()
    } catch (e: any) {
      const msg = String(e?.message || e)
      // If Supabase not configured or OAuth fails, fallback to /auth page for email + manual flow
      if (/not available|not configured|supabase/i.test(msg)) {
        navigate('/auth')
        setAuthError('Opening sign-in page…')
      } else {
        setAuthError(msg.slice(0, 180))
        setTimeout(() => setAuthError(''), 4000)
      }
    }
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.08] bg-black/75 backdrop-blur-2xl supports-[backdrop-filter]:bg-black/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 pt-[env(safe-area-inset-top)]">
        <a href="#top" className="flex items-center gap-2.5 text-white">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#FFD700] to-[#6B21A8] text-black shadow-[0_0_28px_rgba(255,215,0,.22)]">
            <Sparkles size={18} />
          </span>
          <span className="font-black tracking-[.14em]">ALPHATEKX</span>
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="text-sm font-semibold text-white/60 transition hover:text-white">
              {label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <Link
              to="/dashboard"
              className="inline-flex h-10 items-center rounded-full bg-[#FFD700] px-5 text-sm font-black text-black transition hover:brightness-110"
            >
              Open studio
            </Link>
          ) : (
            <>
              <button type="button" onClick={() => void handleAuth()} className="nav-login inline-flex h-10 items-center rounded-full border border-white/15 px-5 text-sm font-bold text-white transition hover:bg-white/10">
                Login
              </button>
              <button type="button" onClick={() => void handleAuth()} className="nav-signup inline-flex h-10 items-center rounded-full bg-[#FFD700] px-5 text-sm font-black text-black transition hover:brightness-110">
                Sign Up
              </button>
            </>
          )}
        </div>
        {authError && <div className="hidden md:block text-xs text-amber-300">{authError}</div>}

        <button
          aria-label="Toggle navigation"
          onClick={() => setOpen((value) => !value)}
          className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white md:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <motion.nav
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="grid gap-1 border-t border-white/10 bg-black/95 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
        >
          {links.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-3.5 text-[15px] font-bold text-white/70 active:bg-white/5 active:text-white"
            >
              {label}
            </a>
          ))}
          {user ? (
            <Link to="/dashboard" onClick={() => setOpen(false)} className="mt-2 rounded-xl bg-[#FFD700] px-4 py-3 text-center font-black text-black">
              Open studio
            </Link>
          ) : (
            <>
              <button type="button" onClick={() => { setOpen(false); void handleAuth() }} className="mt-2 w-full rounded-xl border border-white/15 px-4 py-3 text-center font-bold text-white">
                Login
              </button>
              <button type="button" onClick={() => { setOpen(false); void handleAuth() }} className="mt-2 w-full rounded-xl bg-[#FFD700] px-4 py-3 text-center font-black text-black">
                Sign Up
              </button>
            </>
          )}
          {authError && <p className="mt-2 text-center text-xs text-amber-300">{authError}</p>}
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
                ['27', 'Issues fixed'],
                ['100', 'Health score'],
                ['8', 'Pages healed'],
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
                  <p className="text-xs font-black text-white">Restoration engine</p>
                  <p className="text-[9px] text-white/35">Live session</p>
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
                <p className="text-xs font-black text-white">Site restored at 9:00 AM</p>
                <p className="text-[9px] text-white/35">Verified · behavior tests passed</p>
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
          Restoration complete <span className="text-[#FFD700]">✓</span>
        </p>
      </motion.div>
    </div>
  )
}

function Hero() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const handleHeroAuth = async () => {
    try { await instantGoogleSignup() } catch (e: any) {
      if (/not available|not configured|supabase/i.test(String(e?.message))) navigate('/auth')
    }
  }

  return (
    <section id="top" className="relative isolate min-h-[100dvh] overflow-x-clip overflow-y-visible bg-black px-4 pb-12 pt-24 sm:px-6 sm:pb-24 sm:pt-28 lg:flex lg:min-h-screen lg:items-center lg:pt-20">
      <div className="pointer-events-none absolute -left-48 top-12 size-[520px] rounded-full bg-[#6B21A8]/25 blur-[130px] max-sm:left-1/2 max-sm:-translate-x-1/2 max-sm:top-0 max-sm:size-[380px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 size-[420px] rounded-full bg-[#FFD700]/[.06] blur-[120px] max-sm:hidden" />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 sm:gap-14 lg:grid-cols-[.92fr_1.08fr]">
        <div className="mx-auto w-full max-w-[560px] text-center lg:mx-0 lg:max-w-none lg:text-left">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 rounded-full border border-[#FFD700]/25 bg-[#FFD700]/[.06] px-3 py-2 text-[11px] font-black uppercase tracking-[.16em] text-[#FFD700]"
          >
            <i className="size-2 animate-pulse rounded-full bg-[#FFD700]" />
            RESTORATION ECONOMY
          </motion.div>

          <h1 className="mt-7 font-['Space_Grotesk',Inter,sans-serif] text-[clamp(32px,9vw,52px)] font-black leading-[.94] tracking-[-.06em] text-white text-balance sm:text-6xl lg:text-[78px] xl:text-[88px]">
            <WordReveal text="WE DON'T BUILD WEBSITES, WE RESTORE." />
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75 }}
            className="mx-auto mt-5 max-w-[32ch] text-[15px] font-medium leading-7 text-white/60 text-pretty sm:mt-7 sm:max-w-2xl sm:text-lg sm:leading-8 lg:mx-0 lg:text-xl"
          >
            Paste your broken link or broken video. We heal it to world-class. Builders create new. We restore hope.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1 }}
            className="mx-auto mt-5 max-w-lg lg:mx-0"
          >
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[11px] font-bold text-white/55 sm:justify-start lg:text-xs">
              <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"><Check size={12} className="text-emerald-400" /> Read-only scan</span>
              <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"><Check size={12} className="text-emerald-400" /> World-class healing</span>
              <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"><Check size={12} className="text-emerald-400" /> Market-ready restore</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="mt-9 flex flex-col items-center gap-4 sm:flex-row lg:items-start"
          >
            <div className="hero-buttons flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              {user ? (
                <Link
                  to="/dashboard"
                  className="btn-primary group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#FFD700] px-7 font-black text-black shadow-[0_0_42px_rgba(107,33,168,.55)] transition hover:-translate-y-1 hover:shadow-[0_0_55px_rgba(255,215,0,.28)] sm:w-auto"
                >
                  Get Started — Free
                  <ArrowRight className="transition group-hover:translate-x-1" size={19} />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleHeroAuth()}
                  className="btn-primary group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#FFD700] px-7 font-black text-black shadow-[0_0_42px_rgba(107,33,168,.55)] transition hover:-translate-y-1 hover:shadow-[0_0_55px_rgba(255,215,0,.28)] sm:w-auto"
                >
                  Get Started — Free
                  <ArrowRight className="transition group-hover:translate-x-1" size={19} />
                </button>
              )}
              <a
                href="#video"
                className="btn-secondary inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 font-bold text-white backdrop-blur transition hover:bg-white/10 sm:w-auto"
              >
                <Play size={18} /> Watch How It Works
              </a>
            </div>
          </motion.div>
        </div>

        <DashboardMockup />
      </div>
    </section>
  )
}

function TrustBar() {
  return (
    <section className="border-y border-white/[0.06] bg-[#050507] px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-6 sm:justify-between sm:gap-8">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-white/25">Trusted by founders who ship</span>
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-bold tracking-wide text-white/35 sm:gap-8">
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-400" /> Vercel</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#FFD700]" /> Netlify</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-violet-400" /> GitHub</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-white/40" /> Render</span>
        </div>
        <span className="hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-[11px] font-black text-emerald-300 sm:flex">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> 2,400+ sites restored
        </span>
      </div>
    </section>
  )
}

function VideoSection() {
  return (
    <section id="video" className="video-section border-y border-white/10 bg-black px-4 py-16 sm:px-6 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-5xl text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FFD700]">Live restoration</p>
        <h2 className="mt-3 text-[28px] font-black tracking-[-.04em] text-white text-balance sm:text-5xl">🎬 See Alpha in action</h2>
        <p className="mx-auto mt-3 max-w-[32ch] text-[15px] leading-6 text-white/50 text-pretty sm:mt-4 sm:max-w-2xl sm:text-lg sm:leading-7">Watch how we fix a broken site in 60 seconds.</p>
        <div className="video-container mx-auto mt-8 overflow-hidden rounded-[20px] border border-white/10 bg-[#09090C] shadow-[0_30px_90px_rgba(107,33,168,.25)] sm:mt-10 sm:rounded-[24px]">
          <div className="relative grid aspect-video w-full place-items-center bg-gradient-to-br from-[#0B0215] via-[#1a0b2e] to-black p-6 sm:p-8">
            <div className="text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/[0.06] text-[#FFD700] ring-1 ring-white/10 sm:size-16">🎬</div>
              <p className="mt-4 text-xl font-black tracking-tight text-white sm:text-2xl">Coming Soon</p>
              <p className="mt-1.5 text-[13px] leading-5 text-white/40 sm:text-sm">Demo video is being prepared — check back shortly.</p>
              <span className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold tracking-widest text-white/30">PREMIERE SOON</span>
            </div>
          </div>
        </div>
        <p className="mt-5 text-[13px] italic leading-5 text-white/30 sm:text-sm">&ldquo;Alpha fixed my site in seconds. I didn&apos;t touch a single line of code.&rdquo; — Daniel Thompson</p>
      </div>
    </section>
  )
}

function DownloadAppSection() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [canInstall, setCanInstall] = useState(false)

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setCanInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const installPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === 'accepted') console.log('✅ Alpha installed')
      setDeferredPrompt(null)
      setCanInstall(false)
    } else {
      // Fallback: instruct manual add
      alert('To install: open browser menu → Add to Home Screen / Install App')
    }
  }

  return (
    <section className="download-section mx-auto my-8 max-w-[800px] rounded-[2rem] bg-gradient-to-br from-[#0B0215] to-[#1a0a2e] px-8 py-16 text-center sm:px-8 sm:py-16">
      <div className="download-container">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FFD700]">Install once. Restore anywhere.</p>
        <h2 className="mt-3 text-[28px] font-black tracking-[-.04em] text-white text-balance sm:text-5xl">📱 Take Alpha with you</h2>
        <p className="mt-3 text-[15px] leading-6 text-white/50 sm:text-lg">Fix sites. Restore hope. Anywhere.</p>
        <div className="download-button-wrapper mt-8 flex flex-col items-center">
          <button
            id="installAppBtn"
            onClick={installPWA}
            className="btn-download-premium inline-flex min-h-[56px] items-center justify-center rounded-full bg-gradient-to-br from-[#FFD700] to-[#F59E0B] px-12 py-5 text-[1.5rem] font-bold uppercase tracking-[1px] text-[#0B0215] shadow-[0_8px_32px_rgba(255,215,0,0.3)] transition-all duration-300 hover:scale-[1.05] hover:shadow-[0_12px_48px_rgba(255,215,0,0.5)] active:scale-[0.95] max-sm:w-full max-sm:text-[1.15rem] max-sm:px-8"
          >
            📲 Download AlphaTekX App
          </button>
          <p className="platform-note mt-4 text-[11px] font-semibold tracking-widest text-white/35 sm:text-xs">Works on Android · iOS · Web · No account needed to try.</p>
        </div>
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
  const bullets = index === 0 ? ['App link or video', 'Style ref optional', 'Zero setup'] : index === 1 ? ['27+ checks', 'Secrets redacted', 'No breakage'] : ['Health 0→96', 'PR or ZIP', 'Sell (10% fee)']

  return (
    <motion.article
      style={{ y, scale, opacity, zIndex: index + 1 }}
      className={`absolute inset-x-0 top-0 min-h-[390px] overflow-hidden rounded-[28px] border bg-[#0A0A0D] p-7 shadow-[0_24px_64px_rgba(0,0,0,.4)] sm:p-8 ${card.border} ${card.glow}`}
    >
      <div className="absolute -right-24 -top-24 size-72 rounded-full bg-[#6B21A8]/15 blur-[80px]" />
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent" />
      <div className="relative flex h-full min-h-[320px] flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <span className="rounded-full border border-[#FFD700]/20 bg-[#FFD700]/10 px-2.5 py-1 text-[11px] font-black tracking-[.14em] text-[#FFD700]">0{index + 1} • {card.label}</span>
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[#FFD700] shadow-inner">
            <Icon size={20} />
          </span>
        </div>
        <div>
          <p className="mt-6 max-w-xl text-[15px] leading-6 text-white/55 sm:text-[16px]">{card.copy}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {bullets.map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] font-bold text-white/50"><Check size={12} className="text-emerald-400" />{b}</span>
            ))}
          </div>
        </div>
      </div>
    </motion.article>
  )
}

function HowItWorks() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })

  return (
    <section id="how-it-works" ref={ref} className="relative h-[260vh] overflow-hidden bg-black px-4 sm:px-6 max-md:h-auto max-md:py-16 sm:max-md:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_0%,rgba(107,33,168,.13),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="sticky top-0 mx-auto flex h-screen max-w-7xl items-center gap-12 max-md:static max-md:block max-md:h-auto">
        <div className="w-[36%] max-md:w-full">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#FFD700]">How it works</p>
          <h2 className="mt-3 font-['Space_Grotesk',Inter,sans-serif] text-[28px] font-black tracking-[-.04em] text-white text-balance sm:mt-5 sm:text-4xl lg:text-5xl">
            How Alpha restores <span className="bg-gradient-to-r from-[#FFD700] to-[#8B3FC7] bg-clip-text text-transparent">broken things</span>
          </h2>
          <p className="mt-4 max-w-sm text-[14px] leading-6 text-white/45 sm:text-[15px] sm:leading-7">
            Three steps. No rebuild. Your link and footage become world-class — verified in a live browser, with full rollback.
          </p>
          <div className="mt-6 hidden items-center gap-2 text-xs font-bold text-white/30 lg:flex">
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-400" /> Read-only</span>
            <span className="text-white/10">•</span>
            <span>Scroll to see shift</span>
          </div>
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
    'Read-only scan',
    'Issue map',
    'Secrets redacted',
    'Broken links',
    'Dead scripts',
    'CSS repair',
    'Memory recall',
    'Strategy plan',
    'Surgical fix 1',
    'Surgical fix 2',
    'Surgical fix 3',
    'Behavior test',
    'Git snapshot',
    'Re-verify',
    'Mobile check',
    'A11y pass',
    'SEO tags',
    'Console clean',
    'Zero errors',
    'Score 96',
    'Report ready',
    'Rollback point',
    'Watch mode on',
    'Final audit',
    'Handoff',
    'Site live',
    'Monitoring',
    'Restored ✓',
  ]

  useEffect(() => {
    const unsubscribe = progress.on('change', (value) => {
      const active = Math.max(0, Math.min(cells.length, Math.floor(((value - 0.25) / 0.35) * cells.length)))
      setFilled(active)
    })

    return () => unsubscribe()
  }, [cells.length, progress])

  const progressPct = `${Math.round((filled / cells.length) * 100)}%`
  const displayLabel = filled > 0 ? `Step ${filled}: ${cells[filled - 1]}` : 'Step 1: Read-only scan'

  return (
    <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#09090C] p-4 shadow-[0_40px_120px_rgba(107,33,168,.2)] sm:p-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <p className="text-xs font-black text-white">ALPHA OVERVIEW</p>
          <p className="text-[10px] text-white/40">0 → 100 health score today</p>
        </div>
        <span className="flex items-center gap-2 text-[10px] font-bold text-emerald-300">
          <i className="size-2 rounded-full bg-emerald-400" />
          RESTORING
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4">
          <motion.p className="text-2xl font-black text-white">
            <AnimatedCounter value={96} />
          </motion.p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/30">Health score</p>
        </div>

        {[
          ['Repairs', '12 applied'],
          ['Pages', '4 healed'],
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
            <p className="text-[10px] font-bold text-white/40">Restoration timeline</p>
            <p className="text-[10px] text-white/30">Every step lands as Alpha heals your site</p>
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
        {['SCAN', 'FIX', 'TEST', 'LIVE'].map((icon, index) => (
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
    ['Your dashboard begins with a broken link.', 'Paste it. Alpha takes it from there.'],
    ['One scan. Every issue surfaced.', 'Exposed keys, dead scripts, broken layouts — mapped before a single edit.'],
    ['Repairs happen while you watch.', 'Every change stays surgical, reviewable, and reversible.'],
    ['Verified in a live browser.', 'Behavior tests must pass before anything ships.'],
    ['Memory compounds across visits.', 'Alpha remembers your site and watches for future breakage.'],
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

const outcomeExamples = [
  {
    label: 'Rescue my store',
    prompt: 'My e-commerce site is down and checkout is broken. Scan it and bring it back to life.',
    result: '27 issues found · exposed keys redacted · cart verified working',
  },
  {
    label: 'Heal my portfolio',
    prompt: 'Half my styles stopped loading and images are missing. Restore it to world-class.',
    result: 'CSS repaired · assets re-linked · health score 0 → 96',
  },
  {
    label: 'Watch my SaaS',
    prompt: 'Keep watch on my app every night and repair anything that breaks before users wake up.',
    result: 'Nightly scans · auto-repair · full rollback history kept',
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

function RoiAngle() {
  const lines = [
    ['Lost sales while down', '$500/hour', 'Every minute offline, customers buy from someone else.'],
    ['Developer fix', '$150/hour', 'If you can even find one at 2 AM.'],
    ['Alpha', '$19/month', 'Paste the link. Fixed in minutes, verified in a live browser.'],
  ]

  return (
    <section className="border-y border-white/10 bg-[#050505] px-4 py-24 sm:px-6 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[.22em] text-[#FFD700]">The math is brutal</p>
          <h2 className="mx-auto mt-5 max-w-4xl text-4xl font-black tracking-[-.045em] text-white sm:text-6xl">
            Fix Your Site for Less Than <span className="text-[#FFD700]">One Developer Hour.</span>
          </h2>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease }}
          className="mx-auto mt-12 max-w-3xl rounded-[30px] border border-[#FFD700]/25 bg-white/[.03] p-7 sm:p-9"
        >
          <p className="text-xs font-black uppercase tracking-[.18em] text-white/40">Scenario: Your e-commerce site is down</p>
          <div className="mt-7 space-y-4">
            {lines.map(([label, price, copy], index) => (
              <div
                key={label}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5 ${
                  index === 2 ? 'border-[#FFD700]/40 bg-[#FFD700]/[.06]' : 'border-white/10 bg-black/40'
                }`}
              >
                <div>
                  <p className={`text-sm font-black ${index === 2 ? 'text-[#FFD700]' : 'text-white'}`}>{label}</p>
                  <p className="mt-1 text-xs leading-5 text-white/40">{copy}</p>
                </div>
                <span className={`text-xl font-black sm:text-2xl ${index === 2 ? 'text-[#FFD700]' : 'text-white/70'}`}>{price}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl bg-black/60 p-5 text-center text-sm font-bold leading-7 text-white/75 sm:text-base">
            Your site is down <span className="text-[#FFD700]">→</span> You call Alpha <span className="text-[#FFD700]">→</span> Fixed in 5 minutes{' '}
            <span className="text-[#FFD700]">→</span> <span className="text-emerald-300">$0 lost sales</span>
          </div>
        </motion.div>
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
              <div><p className="text-sm font-black text-white">Restoration execution</p><p className="text-xs text-white/35">AlphaTekx rescue · today</p></div>
              <span className="flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black text-emerald-300"><i className="size-2 animate-pulse rounded-full bg-emerald-400" /> LIVE</span>
            </div>
            <div className="mt-5 space-y-3">
              {[
                ['Read-only scan', '27 issues mapped', '09:02'],
                ['Exposed keys redacted', 'Secrets safe', '09:04'],
                ['Surgical repairs applied', '12 diffs · zero rebuilds', '09:06'],
                ['Behavior tests passed', '9 of 9 verified live', '09:08'],
              ].map(([title, status, time], index) => (
                <div key={title} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-2xl bg-white/[.03] p-4">
                  <span className="grid size-9 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check size={16} /></span>
                  <div><p className="text-sm font-black text-white">{title}</p><p className="text-xs text-white/35">{status}</p></div>
                  <span className="font-mono text-[10px] text-white/30">{time}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-[#FFD700]/20 bg-[#FFD700]/[.05] p-4 text-sm font-bold text-white/70">1 confirmed result · 0 destructive edits · rollback saved</div>
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
    { id: 'healer_lite', name: 'HEALER LITE', price: 9, annualPrice: 90, details: '1 site · 5 fixes/month · Read-only scans, full heals + PDF audit report', featured: false },
    { id: 'healer_starter', name: 'HEALER STARTER', price: 19, annualPrice: 190, details: '3 sites · 15 fixes/month · App scans + reports + video restorations (MrBeast style)', featured: false },
    { id: 'healer_pro', name: 'HEALER PRO', price: 49, annualPrice: 490, details: '10 sites · Unlimited fixes · Full app restorations + all styles + sell restored items (10% fee)', featured: true },
    { id: 'healer_business', name: 'HEALER BUSINESS', price: 99, annualPrice: 990, details: '25 sites · Priority healing queue · Everything in Pro, faster + white-label reports', featured: false },
    { id: 'healer_enterprise', name: 'HEALER ENTERPRISE', price: 199, annualPrice: 1990, details: 'Unlimited sites & fixes · Everything unlocked · API access + dedicated support', featured: false },
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

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
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
  const navigate = useNavigate()
  const handleFinalAuth = async () => {
    try { await instantGoogleSignup() } catch (e: any) {
      if (/not available|not configured|supabase/i.test(String(e?.message))) navigate('/auth')
    }
  }

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
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {user ? (
            <Link to="/dashboard" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-white px-8 font-black text-black shadow-[0_0_50px_rgba(107,33,168,.5)] transition hover:-translate-y-1" style={{ background: '#FFFFFF', color: '#000000', height: '48px', borderRadius: '12px', fontWeight: 600 }}>
              Get Started — Free <ArrowRight size={19} />
            </Link>
          ) : (
            <button type="button" onClick={() => void handleFinalAuth()} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-white px-8 font-black text-black shadow-[0_0_50px_rgba(107,33,168,.5)] transition hover:-translate-y-1" style={{ background: '#FFFFFF', color: '#000000', height: '48px', borderRadius: '12px', fontWeight: 600 }}>
              Get Started — Free <ArrowRight size={19} />
            </button>
          )}
          <a href="#video" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-8 font-bold text-white backdrop-blur transition hover:bg-white/10">
            <Play size={18} /> Watch How It Works
          </a>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-black tracking-[.12em] text-white">ALPHATEKX</span>
          <nav className="flex flex-wrap gap-5 text-sm text-white/60">
            <a href="#product" className="hover:text-white">Product</a>
            <a href="#how-it-works" className="hover:text-white">How it works</a>
            <a href="#use-cases" className="hover:text-white">Use cases</a>
            <a href="/rescue" className="hover:text-white">Rescue</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/terms" className="hover:text-white">Terms</Link>
          </nav>
        </div>
        <div className="mt-6 flex flex-col gap-1 border-t border-white/10 pt-6 text-sm text-white/35 sm:flex-row sm:justify-between">
          <span>© 2026 AlphaTekX. All rights reserved. Founded and owned by Daniel Thompson</span>
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
    <div className="min-h-[100dvh] overflow-x-hidden bg-black pb-[max(100px,env(safe-area-inset-bottom))] font-['Inter',sans-serif] text-white antialiased [text-rendering:optimizeLegibility]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-[#FFD700] focus:px-4 focus:py-2 focus:text-sm focus:font-black focus:text-black">Skip to content</a>
      <SEO title="AlphaTekX — We Don't Build Websites, We Restore" description="Paste your broken link or broken video. We heal it to world-class." />
      <motion.div style={{ scaleX }} className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-[#6B21A8] to-[#FFD700]" />
      <Header />
      <main id="main" role="main" className="overflow-x-clip overflow-y-visible [contain:layout_style]">
        <Hero />
        <TrustBar />
        <VideoSection />
        <DownloadAppSection />
        <InteractiveOutcomeDemo />
        <Problem />
        <RoiAngle />
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