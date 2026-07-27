import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Bot, CalendarDays, Check, CheckCircle2, ChevronDown, CirclePlay,
  Clock3, Instagram, Linkedin, Mail, Menu, Pause, ShieldCheck, Sparkles,
  Star, TimerReset, Twitter, X, Zap,
} from 'lucide-react'
import SEO from '../components/SEO'
import { useAuth } from '../lib/auth'

const nav = [['How it works', '#how-it-works'], ['Automations', '#automations'], ['Connected apps', '#connected-apps'], ['Pricing', '#pricing']]
const platforms = [
  { name: 'X', icon: Twitter }, { name: 'LinkedIn', icon: Linkedin }, { name: 'Instagram', icon: Instagram },
  { name: 'Gmail', icon: Mail }, { name: 'YouTube', icon: CirclePlay },
]
const gallery = [
  ['LinkedIn Growth', 'Original posts with a fresh hook every time.', '2.4k runs', Linkedin],
  ['Twitter Thread Engine', 'Turn one idea into a clear, useful thread.', '1.8k runs', Twitter],
  ['Instagram Repurpose', 'Adapt approved ideas into native captions.', '3.1k runs', Instagram],
  ['Gmail Auto-Reply', 'Keep important replies moving while you focus.', '4.7k runs', Mail],
] as const
const features = [
  ['Unique captions', 'Checks recent content so the same caption never publishes twice.', Sparkles],
  ['Edit date and time free', 'Move approved work without paying for the edit.', Clock3],
  ['Pause anytime', 'Stop future runs instantly and resume when you are ready.', Pause],
  ['Calendar view', 'See every upcoming execution in one calm view.', CalendarDays],
  ['Approval first', 'Alpha waits for explicit approval before public actions.', ShieldCheck],
  ['Credits after execution', 'A failed or unconfirmed action never consumes credits.', CheckCircle2],
] as const
const faqs = [
  ['What does one credit cover?', 'Credits measure completed work. Alpha always shows the expected cost before you approve a plan.'],
  ['When are credits deducted?', 'Only after an approved action is confirmed successful. Planning, editing a date, and failed executions are not charged.'],
  ['Can Alpha publish without me?', 'Only after you approve the complete plan and publishing settings. You can pause or delete the automation at any time.'],
  ['Can I edit the schedule for free?', 'Yes. Changing the date or time is free because no new work has been executed.'],
  ['Will captions repeat?', 'Alpha compares new content with recent publication memory and blocks duplicate or near-duplicate captions.'],
  ['Which apps can I connect?', 'The current command centre supports released connectors such as LinkedIn, X, Instagram, and Gmail. Availability is verified by the backend.'],
  ['Does it keep running after I close the browser?', 'Yes. Approved schedules are persisted and executed by the server-side scheduler.'],
  ['Can I cancel a subscription?', 'Yes. Billing remains under your control, and purchased credit history remains visible in your workspace.'],
] as const

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 90, damping: 20 } },
}

function Logo() {
  return <Link to="/" className="flex items-center gap-3 text-lg font-black tracking-[-.03em] text-[#0B0F19]"><span className="grid size-10 place-items-center rounded-xl bg-[#6941C6] text-base font-black text-white shadow-[0_10px_24px_rgba(105,65,198,.22)]">A</span>ALPHATEKX</Link>
}

function Header() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  return <header className="fixed inset-x-0 top-0 z-50 border-b border-[#E4E7EC] bg-white/85 backdrop-blur-xl">
    <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      <Logo />
      <nav className="hidden items-center gap-7 lg:flex">{nav.map(([label, href]) => <a key={href} href={href} className="text-sm font-semibold text-[#475467] transition hover:text-[#6941C6]">{label}</a>)}</nav>
      <div className="hidden items-center gap-2 md:flex"><Link to="/auth" className="min-h-11 rounded-xl px-5 py-3 text-sm font-semibold text-[#0B0F19] hover:bg-[#F9FAFB]">Sign in</Link><Link to={user ? '/dashboard' : '/auth'} className="min-h-11 rounded-xl bg-[#6941C6] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(105,65,198,.22)] transition hover:-translate-y-0.5 hover:bg-[#5635A8]">Start automating</Link></div>
      <button onClick={() => setOpen(value => !value)} className="grid size-11 place-items-center rounded-xl border border-[#E4E7EC] text-[#0B0F19] md:hidden" aria-label="Toggle navigation">{open ? <X size={20}/> : <Menu size={20}/>}</button>
    </div>
    <AnimatePresence>{open && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-[#E4E7EC] bg-white md:hidden"><nav className="grid gap-1 px-4 py-4">{nav.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)} className="min-h-11 rounded-xl px-4 py-3 font-semibold text-[#344054] hover:bg-[#F4F3FF]">{label}</a>)}<Link to="/auth" className="mt-2 min-h-11 rounded-xl bg-[#6941C6] px-4 py-3 text-center font-semibold text-white">Start automating</Link></nav></motion.div>}</AnimatePresence>
  </header>
}

function DotGrid() {
  return <div aria-hidden className="perspective-grid-shell pointer-events-none absolute inset-x-0 bottom-0 h-[72%] overflow-hidden"><div className="premium-grid perspective-grid-plane absolute inset-[-30%] opacity-55" /></div>
}

function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: .001 })
  return <motion.div aria-hidden style={{ scaleX }} className="fixed inset-x-0 top-0 z-[70] h-[3px] origin-left bg-gradient-to-r from-[#9E77ED] via-[#6941C6] to-[#2E90FA]"/>
}

function AvatarStack() {
  return <div className="flex -space-x-2">{['DA','MK','SN','AO'].map((initials, index) => <span key={initials} className="grid size-8 place-items-center rounded-full border-2 border-white text-[10px] font-black text-white" style={{ background: ['#6941C6','#1570EF','#039855','#DC6803'][index] }}>{initials}</span>)}</div>
}

function LiveBuilderCount() {
  const reduce = useReducedMotion()
  const [count, setCount] = useState(2147)
  useEffect(() => {
    if (reduce) return
    const timer = window.setInterval(() => setCount(value => value >= 2199 ? 2147 : value + 1), 2400)
    return () => window.clearInterval(timer)
  }, [reduce])
  return <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 text-center text-xs font-bold leading-5 text-[#475467] lg:justify-start lg:text-left"><i className="relative flex size-2.5 shrink-0"><i className="absolute inline-flex size-full animate-ping rounded-full bg-[#32D583] opacity-60"/><i className="relative inline-flex size-2.5 rounded-full bg-[#12B76A]"/></i>Alpha is working for <motion.strong key={count} initial={{ y: -4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-black tabular-nums text-[#0B0F19]">{count.toLocaleString()}</motion.strong> builders right now</span>
}

function RevealLine({ words, delay = 0, inline = false }: { words: string[]; delay?: number; inline?: boolean }) {
  const reduce = useReducedMotion()
  return <span className={`${inline ? 'inline' : 'block'} overflow-hidden pb-[.08em]`}>{words.map((word, index) => <span key={`${word}-${index}`} className="mr-[.24em] inline-block overflow-hidden align-bottom last:mr-0"><motion.span initial={reduce ? false : { y: '115%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: delay + index * .1, duration: .72, ease: [0.22, 1, 0.36, 1] }} className="inline-block">{word}</motion.span></span>)}</span>
}

function FloatingHeroSignals() {
  const reduce = useReducedMotion()
  const cards = [
    { className: 'left-[2%] top-[31%] hidden xl:flex', icon: Twitter, text: 'Twitter: Posted @9am', meta: 'Confirmed ✓', delay: 0 },
    { className: 'left-[34%] top-[12%] hidden 2xl:flex', icon: Linkedin, text: 'LinkedIn: 3.2k views', meta: '+28% this week', delay: .8 },
  ]
  return <>{cards.map(({ className, icon: Icon, text, meta, delay }) => <motion.div key={text} animate={reduce ? undefined : { y: [0, -4, 0] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay }} className={`absolute z-[2] items-center gap-3 rounded-2xl border border-white/70 bg-white/45 px-4 py-3 shadow-[0_16px_45px_rgba(16,24,40,.10)] backdrop-blur-xl ${className}`}><span className="grid size-9 place-items-center rounded-xl bg-white/80 text-[#6941C6]"><Icon size={17}/></span><span><strong className="block text-xs font-black text-[#0B0F19]">{text}</strong><small className="mt-0.5 block text-[10px] font-bold text-[#039855]">{meta}</small></span></motion.div>)}</>
}

function BrainWave() {
  const reduce = useReducedMotion()
  return <svg viewBox="0 0 300 54" className="h-12 w-full overflow-visible" aria-label="Alpha listening waveform">
    <motion.path d="M0 27 C18 27 20 8 38 8 S58 46 76 46 96 18 114 18 132 34 150 34 168 9 186 9 204 43 222 43 240 20 258 20 276 27 300 27" fill="none" stroke="url(#wave)" strokeWidth="4" strokeLinecap="round" animate={reduce ? undefined : { d: ['M0 27 C18 27 20 8 38 8 S58 46 76 46 96 18 114 18 132 34 150 34 168 9 186 9 204 43 222 43 240 20 258 20 276 27 300 27','M0 27 C18 27 20 42 38 42 S58 12 76 12 96 38 114 38 132 15 150 15 168 40 186 40 204 11 222 11 240 35 258 35 276 27 300 27','M0 27 C18 27 20 8 38 8 S58 46 76 46 96 18 114 18 132 34 150 34 168 9 186 9 204 43 222 43 240 20 258 20 276 27 300 27'] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />
    <defs><linearGradient id="wave"><stop stopColor="#9E77ED"/><stop offset=".5" stopColor="#6941C6"/><stop offset="1" stopColor="#2E90FA"/></linearGradient></defs>
  </svg>
}

function FutureOrbit() {
  const reduce = useReducedMotion()
  return <div aria-hidden className="future-orbit pointer-events-none absolute -right-28 -top-32 size-[430px] opacity-70 sm:-right-16">
    <motion.div animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 34, repeat: Infinity, ease: 'linear' }} className="absolute inset-0 rounded-full border border-[#D6BBFB]/70">
      <i className="absolute left-1/2 top-[-5px] size-3 -translate-x-1/2 rounded-full bg-[#6941C6] shadow-[0_8px_24px_rgba(105,65,198,.45)]"/>
      <i className="absolute bottom-[16%] left-[5%] size-2 rounded-full bg-[#2E90FA] shadow-[0_8px_18px_rgba(46,144,250,.35)]"/>
    </motion.div>
    <motion.div animate={reduce ? undefined : { rotate: -360 }} transition={{ duration: 24, repeat: Infinity, ease: 'linear' }} className="absolute inset-[18%] rounded-full border border-[#B2DDFF]/80"><i className="absolute right-[10%] top-[9%] size-2.5 rounded-full bg-[#9E77ED]"/></motion.div>
    <div className="absolute inset-[37%] rounded-full bg-white shadow-[0_18px_70px_rgba(105,65,198,.18)]"/>
  </div>
}

function CommandMockup() {
  const reduce = useReducedMotion()
  const questions = ['What platform should Alpha use?', 'What days should it run?', 'What time works best for you?']
  const [question, setQuestion] = useState(0)
  const [typed, setTyped] = useState(reduce ? questions[0] : '')
  useEffect(() => {
    if (reduce) return
    let position = 0
    setTyped('')
    const timer = window.setInterval(() => {
      position += 1
      setTyped(questions[question].slice(0, position))
      if (position >= questions[question].length) {
        window.clearInterval(timer)
        window.setTimeout(() => setQuestion(value => (value + 1) % questions.length), 1100)
      }
    }, 48)
    return () => window.clearInterval(timer)
  }, [question, reduce])
  return <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25, type: 'spring', stiffness: 80 }} className="relative mx-auto w-full max-w-[590px]">
    <div className="rounded-[24px] border border-[#D0D5DD] bg-white p-3 shadow-[0_32px_80px_rgba(16,24,40,.16)] sm:p-4">
      <div className="overflow-hidden rounded-[18px] border border-[#EAECF0] bg-[#F9FAFB]">
        <motion.i aria-hidden animate={reduce ? undefined : { x: ['-120%', '620%'] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }} className="pointer-events-none absolute inset-y-4 z-20 w-16 skew-x-[-12deg] bg-gradient-to-r from-transparent via-[#B692F6]/15 to-transparent blur-sm"/>
        <div className="flex items-center justify-between border-b border-[#EAECF0] bg-white px-4 py-4 sm:px-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#6941C6] text-white"><Bot size={18}/></span><div><p className="text-xs font-bold text-[#6941C6]">COMMAND CENTRE</p><p className="text-sm font-black text-[#0B0F19]">Plan with Alpha</p></div></div><span className="flex items-center gap-2 rounded-lg border border-[#EAECF0] bg-[#F9FAFB] px-2.5 py-1.5 text-[10px] font-black text-[#667085]"><kbd>⌘</kbd><kbd>K</kbd></span></div>
        <div className="p-4 sm:p-6">
          <div className="rounded-2xl border border-[#EAECF0] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.05)]">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold text-[#6941C6]"><Sparkles size={14}/>ALPHA IS ASKING</div>
            <p className="min-h-14 text-lg font-black leading-7 text-[#0B0F19]">{typed}<motion.span animate={reduce ? undefined : { opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: .8 }} className="ml-1 inline-block h-5 w-0.5 bg-[#6941C6] align-middle"/></p>
            <div className="mt-4 flex flex-wrap gap-2">{question === 0 ? ['LinkedIn','X','Instagram'].map(item => <span key={item} className="rounded-xl border border-[#D6BBFB] bg-[#F4F3FF] px-3 py-2 text-xs font-bold text-[#6941C6]">{item}</span>) : question === 1 ? ['Mon–Fri','Every day','Custom'].map(item => <span key={item} className="rounded-xl border border-[#EAECF0] bg-white px-3 py-2 text-xs font-bold text-[#344054]">{item}</span>) : ['Yes, 9am','Choose different'].map(item => <span key={item} className="rounded-xl border border-[#EAECF0] bg-white px-3 py-2 text-xs font-bold text-[#344054]">{item}</span>)}</div>
          </div>
          <div className="mt-4 rounded-2xl border border-[#EAECF0] bg-white px-5 py-3"><BrainWave/></div>
        </div>
      </div>
    </div>
    <motion.div animate={reduce ? undefined : { y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }} className="absolute -bottom-8 -left-2 rounded-2xl border border-[#D0D5DD] bg-white p-4 shadow-[0_16px_40px_rgba(16,24,40,.14)] sm:-left-12"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#667085]">Credits</p><div className="mt-1 flex items-center gap-2"><span className="text-xl font-black text-[#0B0F19]">30</span><span className="rounded-full bg-[#ECFDF3] px-2 py-1 text-[10px] font-bold text-[#027A48]">Not charged yet</span></div></motion.div>
    <motion.div animate={reduce ? undefined : { y: [0, 8, 0] }} transition={{ duration: 3.5, repeat: Infinity }} className="absolute -right-2 -top-8 hidden rounded-2xl border border-[#D0D5DD] bg-white p-4 shadow-[0_16px_40px_rgba(16,24,40,.14)] sm:block"><p className="flex items-center gap-2 text-xs font-black text-[#027A48]"><i className="size-2 rounded-full bg-[#12B76A]"/>Automation live</p><p className="mt-1 text-xs font-semibold text-[#667085]">12/30 completed</p><div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-[#EAECF0]"><motion.i initial={{ width: 0 }} animate={{ width: '40%' }} transition={{ delay: .8, duration: 1 }} className="block h-full rounded-full bg-[#6941C6]"/></div></motion.div>
  </motion.div>
}

function Hero() {
  const { user } = useAuth()
  return <section id="hero" className="relative overflow-hidden bg-[#FAFBFF] px-4 pb-28 pt-32 sm:px-6 lg:pb-36 lg:pt-40">
    <DotGrid/><div className="future-mesh pointer-events-none absolute inset-0"/><FloatingHeroSignals/><div className="pointer-events-none absolute left-[8%] top-28 size-[360px] rounded-full bg-[#D6BBFB]/35 blur-[110px]"/><div className="pointer-events-none absolute right-[5%] top-44 size-[280px] rounded-full bg-[#B2DDFF]/30 blur-[100px]"/>
    <div className="relative mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.02fr_.98fr]">
      <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: .09 } } }} className="text-center lg:text-left">
        <motion.div variants={fadeUp} className="inline-flex flex-wrap items-center justify-center gap-3 rounded-full border border-[#EAECF0] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(16,24,40,.05)] lg:justify-start"><AvatarStack/><span className="text-xs font-bold text-[#344054]">Trusted by 2,000+ builders</span><span className="hidden h-4 w-px bg-[#D0D5DD] sm:block"/><span className="flex items-center gap-1 text-xs font-black text-[#344054]"><Star size={13} fill="#FDB022" stroke="#FDB022"/>4.9</span></motion.div>
        <motion.h1 variants={fadeUp} className="mt-7 text-[36px] font-black leading-[1.02] tracking-[-.045em] text-[#0B0F19] sm:text-6xl lg:text-[72px]"><RevealLine words={['Delegate','the','work.']}/><span className="block"><RevealLine words={['Turn','Your','Idea','Into']} delay={.2} inline/> <span className="reality-underline relative inline-block whitespace-nowrap overflow-visible"><RevealLine words={['Reality']} delay={.6} inline/></span></span></motion.h1>
        <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-xl text-base font-medium leading-7 text-[#475467] sm:text-lg lg:mx-0">Your AI Employee that asks, plans, waits for approval, and executes while you sleep.</motion.p>
        <motion.div variants={fadeUp} className="mt-5 flex justify-center lg:justify-start"><LiveBuilderCount/></motion.div>
        <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start"><Link to={user ? '/dashboard' : '/auth'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0B0F19] px-5 font-semibold text-white shadow-[0_10px_24px_rgba(11,15,25,.18)] transition hover:-translate-y-0.5 hover:bg-[#1D2939]">Start Automating — It&apos;s Free <ArrowRight size={18}/></Link><a href="#live-demo" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#D0D5DD] bg-white px-5 font-semibold text-[#344054] shadow-sm transition hover:border-[#B692F6] hover:text-[#6941C6]"><CirclePlay size={18}/>Watch 45s Demo</a></motion.div>
        <motion.div variants={fadeUp} className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-semibold text-[#475467] lg:justify-start">{['No workflow builder','Approval before action','Runs while you sleep'].map(item => <span key={item} className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-[#6941C6]"/>{item}</span>)}</motion.div>
      </motion.div>
      <CommandMockup/>
    </div>
  </section>
}

function SectionHeading({ eyebrow, title, copy, align = 'center' }: { eyebrow: string; title: string; copy: string; align?: 'center' | 'left' }) {
  return <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}><p className="text-xs font-black uppercase tracking-[.18em] text-[#6941C6]">{eyebrow}</p><h2 className="mt-4 text-3xl font-black tracking-[-.035em] text-[#0B0F19] sm:text-5xl">{title}</h2><p className="mt-5 text-base font-medium leading-8 text-[#475467] sm:text-lg">{copy}</p></div>
}

function LogoMarquee() {
  const reduce = useReducedMotion()
  const items = [...platforms, ...platforms]
  return <section className="overflow-hidden border-y border-[#EAECF0] bg-white py-7"><p className="mb-6 text-center text-xs font-bold uppercase tracking-[.14em] text-[#98A2B3]">Automating for builders at</p><div className="relative mx-auto max-w-6xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"><motion.div className="flex w-max items-center gap-14" animate={reduce ? undefined : { x: ['0%', '-50%'] }} transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}>{items.map(({ name, icon: Icon }, index) => <div key={`${name}-${index}`} className="flex min-w-36 items-center justify-center gap-2 grayscale opacity-55"><Icon size={23}/><span className="font-black text-[#344054]">{name}</span></div>)}</motion.div></div></section>
}

function ProblemSolution() {
  const cards = [
    ['10 hours disappear', 'You plan, write, post, check, and repeat the same work every week.', 'Alpha turns one approved outcome into a reliable operating rhythm.'],
    ['Tools create more work', 'Traditional builders expose triggers, nodes, and confusing technical settings.', 'Alpha asks one clear question at a time and handles the system underneath.'],
    ['Automation feels risky', 'Black-box tools act too early and leave you unsure what actually happened.', 'Alpha shows the plan, waits for approval, and reports only confirmed results.'],
  ]
  return <section className="bg-[#F9FAFB] px-4 py-24 sm:px-6 lg:py-32"><div className="mx-auto max-w-7xl"><SectionHeading eyebrow="From busywork to leverage" title="Your time is too valuable for repeat work." copy="The future is not another complicated dashboard. It is a trusted employee that understands the outcome."/><div className="mt-14 grid gap-5 lg:grid-cols-3">{cards.map(([title, problem, solution], index) => <motion.article whileHover={{ y: -6 }} key={title} className="rounded-2xl border border-[#EAECF0] bg-white p-7 shadow-[0_1px_2px_rgba(16,24,40,.05)]"><span className="grid size-11 place-items-center rounded-xl bg-[#F4F3FF] text-lg font-black text-[#6941C6]">0{index + 1}</span><h3 className="mt-6 text-xl font-black text-[#0B0F19]">{title}</h3><p className="mt-3 leading-7 text-[#667085]">{problem}</p><div className="my-5 h-px bg-[#EAECF0]"/><p className="flex gap-2 font-semibold leading-7 text-[#344054]"><CheckCircle2 className="mt-1 shrink-0 text-[#12B76A]" size={18}/>{solution}</p></motion.article>)}</div></div></section>
}

function HowItWorks() {
  const steps = [
    ['1','Tell the outcome','Describe the result in plain English. No technical setup.'],
    ['2','Alpha asks and shows the plan','Answer one question at a time, then review schedule, content, and cost.'],
    ['3','Approve and sleep','Alpha executes on schedule and records only confirmed work.'],
  ]
  return <section id="how-it-works" className="bg-white px-4 py-24 sm:px-6 lg:py-32"><div className="mx-auto max-w-7xl"><SectionHeading eyebrow="How it works" title="Three steps between idea and execution." copy="Simple on the surface. Durable, accountable automation underneath."/><div className="relative mt-16 grid gap-7 lg:grid-cols-3"><motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.1 }} className="absolute left-[15%] right-[15%] top-7 hidden h-px origin-left bg-gradient-to-r from-[#D6BBFB] via-[#6941C6] to-[#D6BBFB] lg:block"/>{steps.map(([number,title,copy]) => <article key={number} className="relative"><span className="relative z-10 mx-auto grid size-14 place-items-center rounded-full border-4 border-white bg-[#6941C6] text-lg font-black text-white shadow-[0_8px_24px_rgba(105,65,198,.25)]">{number}</span><div className="mt-7 rounded-2xl border border-[#EAECF0] bg-white p-5 shadow-[0_12px_32px_rgba(16,24,40,.08)]"><div className="aspect-video rounded-xl border border-[#EAECF0] bg-[#F9FAFB] p-4"><div className="flex gap-1.5"><i className="size-2 rounded-full bg-[#F97066]"/><i className="size-2 rounded-full bg-[#FDB022]"/><i className="size-2 rounded-full bg-[#32D583]"/></div><div className="mt-5 space-y-2"><i className="block h-2 w-4/5 rounded bg-[#E9D7FE]"/><i className="block h-2 w-3/5 rounded bg-[#EAECF0]"/><i className="block h-8 w-24 rounded-lg bg-[#6941C6]/90"/></div></div><h3 className="mt-6 text-xl font-black text-[#0B0F19]">{title}</h3><p className="mt-3 leading-7 text-[#667085]">{copy}</p></div></article>)}</div></div></section>
}

function InteractiveDemo() {
  const choices = [
    { question: 'Which platform should Alpha use?', answers: ['LinkedIn','X','Instagram'], result: 'LinkedIn selected' },
    { question: 'What days should it run?', answers: ['Mon–Fri','Every day','Custom'], result: 'Mon–Fri selected' },
    { question: '9am performs well for professional audiences. Use it?', answers: ['Yes, 9am','Choose different'], result: '9am selected' },
  ]
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [thinking, setThinking] = useState(false)
  const [thoughtComplete, setThoughtComplete] = useState(false)
  const choose = (answer: string) => {
    if (thinking) return
    setThinking(true)
    setThoughtComplete(false)
    window.setTimeout(() => {
      setThoughtComplete(true)
      window.setTimeout(() => {
        setAnswers(current => [...current, answer])
        setStep(value => Math.min(value + 1, choices.length))
        setThinking(false)
        setThoughtComplete(false)
      }, 420)
    }, 760)
  }
  const reset = () => { setStep(0); setAnswers([]); setThinking(false); setThoughtComplete(false) }
  return <section id="live-demo" className="relative overflow-hidden bg-[#FAFBFF] px-4 py-24 sm:px-6 lg:py-32"><div className="future-mesh pointer-events-none absolute inset-0 opacity-55"/><FutureOrbit/><div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[.85fr_1.15fr]"><SectionHeading align="left" eyebrow="Live demo" title="Feel how calm automation can be." copy="Click through the miniature Command Centre. Alpha asks for one decision, waits, then moves forward."/><div className="rounded-[24px] border border-[#D6BBFB] bg-white/75 p-3 shadow-[0_30px_80px_rgba(105,65,198,.14)] backdrop-blur-xl"><div className="relative min-h-[420px] overflow-hidden rounded-[18px] border border-[#EAECF0] bg-white p-5 text-[#0B0F19] sm:p-8">
    <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-black text-[#6941C6]"><Bot size={17}/>ALPHA COMMAND PALETTE</span><span className="rounded-lg border border-[#EAECF0] bg-[#F9FAFB] px-2 py-1 text-[10px] font-black text-[#667085]">⌘ K</span></div>
    <div className="mt-4 rounded-xl border border-[#EAECF0] bg-[#F9FAFB] px-4 py-3 text-xs font-bold text-[#98A2B3]">Ask Alpha to automate anything…</div>
    <div className="mt-6 space-y-3">{answers.map((answer,index) => <div key={`${answer}-${index}`} className="flex justify-end"><span className="rounded-2xl rounded-br-sm bg-[#6941C6] px-4 py-3 text-sm font-semibold text-white">{answer}</span></div>)}</div>
    <AnimatePresence mode="wait">{thinking ? <motion.div key="thinking" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .9 }} className="mt-6 flex items-center gap-3 text-sm font-black text-[#6941C6]">{thoughtComplete ? <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} className="grid size-8 place-items-center rounded-full bg-[#ECFDF3] text-[#039855]"><Check size={17}/></motion.span> : <span className="flex h-8 items-center gap-1 rounded-full bg-[#F4F3FF] px-3">{[0,1,2].map(dot => <motion.i key={dot} animate={{ scale: [1, 1.7, 1], opacity: [.35, 1, .35] }} transition={{ duration: .8, repeat: Infinity, delay: dot * .14 }} className="size-1.5 rounded-full bg-[#6941C6]"/>)}</span>}<span>{thoughtComplete ? 'Ready' : 'Thinking…'}</span></motion.div> : step < choices.length ? <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-6"><p className="max-w-md text-xl font-black leading-8">{choices[step].question}</p><div className="mt-3 max-w-sm"><BrainWave/></div><div className="mt-4 flex flex-wrap gap-2">{choices[step].answers.map(answer => <button key={answer} onClick={() => choose(answer)} className="min-h-11 rounded-xl border border-[#D6BBFB] bg-[#F4F3FF] px-4 text-sm font-bold text-[#6941C6] transition hover:bg-[#E9D7FE]">{answer}</button>)}</div></motion.div> : <motion.div initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 rounded-2xl border border-[#ABEFC6] bg-[#ECFDF3] p-5"><p className="flex items-center gap-2 font-black text-[#027A48]"><CheckCircle2 size={19}/>Plan ready for your approval</p><p className="mt-2 text-sm font-medium text-[#475467]">LinkedIn · Mon–Fri · 9am · Credits charged only after confirmed posts.</p></motion.div>}</AnimatePresence>
    <button onClick={reset} className="mt-5 flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-[#667085] hover:bg-[#F9FAFB]"><TimerReset size={15}/>Restart demo</button>
  </div></div></div></section>
}

function AutomationGallery() {
  return <section id="automations" className="overflow-hidden bg-[#FAFBFF] px-4 py-24 sm:px-6 lg:py-32"><div className="mx-auto max-w-7xl"><SectionHeading eyebrow="Automation gallery" title="Start with a job worth delegating." copy="Focused systems for content, growth, and customer operations."/><div className="mt-14 grid gap-5 md:grid-cols-2">{gallery.map(([title,copy,runs,Icon], index) => <motion.article initial={{ opacity: 0, x: index % 2 ? 30 : -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 75 }} whileHover={{ y: -5 }} key={title} className="rounded-2xl border border-[#EAECF0] bg-white p-7 shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:shadow-[0_12px_32px_rgba(16,24,40,.08)]"><div className="flex items-start justify-between"><span className="grid size-12 place-items-center rounded-xl bg-[#F4F3FF] text-[#6941C6]"><Icon size={23}/></span><span className="rounded-full bg-[#F9FAFB] px-3 py-1 text-xs font-bold text-[#667085]">{runs}</span></div><h3 className="mt-7 text-2xl font-black text-[#0B0F19]">{title}</h3><p className="mt-3 leading-7 text-[#667085]">{copy}</p><div className="mt-6 flex items-center gap-2 text-sm font-bold text-[#027A48]"><i className="size-2 animate-pulse rounded-full bg-[#12B76A]"/>Ready to run</div></motion.article>)}</div></div></section>
}

function ActivityRail() {
  const reduce = useReducedMotion()
  const events = ['X: Posted at 9:00am ✓','LinkedIn: Scheduled for tomorrow','Gmail: 4 attachments saved ✓','Instagram: Caption approved','LinkedIn: Post confirmed ✓']
  return <div className="overflow-hidden border-y border-[#EAECF0] bg-white py-4"><motion.div className="flex w-max gap-3" animate={reduce ? undefined : { x: ['0%', '-50%'] }} transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}>{[...events,...events].map((event,index) => <span key={`${event}-${index}`} className="rounded-full border border-[#EAECF0] bg-[#F9FAFB] px-5 py-2.5 text-sm font-semibold text-[#475467] shadow-sm">{event}</span>)}</motion.div></div>
}

function ConnectedApps() {
  return <section id="connected-apps" className="bg-white px-4 py-24 sm:px-6 lg:py-32"><div className="mx-auto max-w-7xl rounded-[28px] border border-[#EAECF0] bg-[#FAFBFF] p-6 shadow-[0_12px_32px_rgba(16,24,40,.08)] sm:p-12"><div className="grid items-center gap-12 lg:grid-cols-[1fr_.9fr]"><div><SectionHeading align="left" eyebrow="Connected apps" title="Your tools. AlphaTekx intelligence." copy="Connect through AlphaTekx, approve the job, and keep every credential server-side and revocable."/><div className="mt-7 flex flex-wrap gap-3">{['Verified backend state','Encrypted credentials','Disconnect anytime'].map(item => <span key={item} className="flex items-center gap-2 text-sm font-bold text-[#344054]"><CheckCircle2 size={17} className="text-[#12B76A]"/>{item}</span>)}</div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{platforms.map(({ name, icon: Icon }) => <motion.div whileHover={{ y: -4, scale: 1.02 }} key={name} className="rounded-2xl border border-[#EAECF0] bg-white p-5 text-center shadow-sm"><Icon className="mx-auto text-[#6941C6]" size={24}/><p className="mt-3 font-black text-[#0B0F19]">{name}</p><p className="mt-1 text-[10px] font-bold uppercase text-[#039855]">Ready</p></motion.div>)}</div></div></div></section>
}

function FeatureDeepDive() {
  return <section className="bg-[#F9FAFB] px-4 py-24 sm:px-6 lg:py-32"><div className="mx-auto max-w-7xl"><SectionHeading eyebrow="Built for trust" title="Control at every important moment." copy="The safeguards are part of the product, not an afterthought."/><div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(([title,copy,Icon]) => <article key={title} className="rounded-2xl border border-[#EAECF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,.05)]"><span className="grid size-11 place-items-center rounded-xl bg-[#F4F3FF] text-[#6941C6]"><Icon size={21}/></span><h3 className="mt-5 text-lg font-black text-[#0B0F19]">{title}</h3><p className="mt-2 leading-7 text-[#667085]">{copy}</p></article>)}</div></div></section>
}

function Stats() {
  const timeline = [
    ['2024','Manual posting','Every channel depended on your time.'],
    ['2025','AI captions','Tools helped write, but you still operated everything.'],
    ['2026','AlphaTekx AI Employee','You are here — outcomes become approved execution.'],
    ['2030','Autonomous business','AI employees coordinate reliable business operations.'],
  ]
  return <section className="bg-white px-4 py-24 sm:px-6 lg:py-32"><div className="mx-auto max-w-7xl">
    <motion.div initial={{ opacity: 0, scale: .98 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="future-stat-panel relative overflow-hidden rounded-[28px] border border-[#D6BBFB] bg-[#FAFBFF] px-6 py-14 text-[#0B0F19] shadow-[0_24px_70px_rgba(105,65,198,.14)] sm:px-12">
      <div className="future-mesh pointer-events-none absolute inset-0 opacity-70"/><FutureOrbit/><div className="relative"><p className="text-center text-sm font-bold uppercase tracking-[.18em] text-[#6941C6]">Backed by the future</p><h2 className="mx-auto mt-5 max-w-3xl text-center text-3xl font-black tracking-[-.04em] text-[#0B0F19] sm:text-5xl">The next operating system for work is already arriving.</h2><div className="mt-12 grid gap-4 md:grid-cols-3">{[['$1.77T','AI market by 2032'],['$1.2T','Automation opportunity'],['Now','You are early']].map(([value,label]) => <motion.div whileHover={{ y: -5, scale: 1.015 }} key={value} className="rounded-2xl border border-[#EAECF0] bg-white/80 p-6 text-center shadow-[0_12px_32px_rgba(105,65,198,.08)] backdrop-blur-xl"><p className="text-4xl font-black text-[#0B0F19]">{value}</p><p className="mt-2 text-sm font-semibold text-[#667085]">{label}</p></motion.div>)}</div></div>
    </motion.div>
    <div className="relative mt-16 grid gap-5 lg:grid-cols-4"><motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} className="absolute left-[8%] right-[8%] top-4 hidden h-px origin-left bg-gradient-to-r from-[#D6BBFB] via-[#6941C6] to-[#B2DDFF] lg:block"/>{timeline.map(([year,title,copy], index) => <motion.article initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * .1 }} key={year} className={`relative rounded-2xl border p-6 ${year === '2026' ? 'border-[#6941C6] bg-[#F4F3FF] shadow-[0_16px_40px_rgba(105,65,198,.14)]' : 'border-[#EAECF0] bg-white'}`}><span className={`absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-black ${year === '2026' ? 'bg-[#6941C6] text-white' : 'border border-[#EAECF0] bg-white text-[#667085]'}`}>{year}</span><h3 className="mt-5 text-lg font-black text-[#0B0F19]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#667085]">{copy}</p>{year === '2026' && <span className="mt-4 inline-flex items-center gap-2 text-xs font-black text-[#6941C6]"><i className="size-2 animate-pulse rounded-full bg-[#6941C6]"/>YOU ARE HERE</span>}</motion.article>)}</div>
  </div></section>
}

function Testimonials() {
  const quotes = [
    ['AlphaTekx kept our publishing rhythm moving while I focused on closing clients.','Dara','Startup founder'],
    ['I described the outcome once. Alpha asked the missing questions and gave me a plan I could actually trust.','Maya','Independent creator'],
    ['The approval step changes everything. I stay in control without becoming the bottleneck.','Sam','Small business owner'],
  ]
  return <section className="bg-[#FAFBFF] px-4 py-24 sm:px-6 lg:py-32"><div className="mx-auto max-w-7xl"><SectionHeading eyebrow="Built for operators" title="More momentum. Less operational drag." copy="Early builders use AlphaTekx to create repeatable execution without adding complexity."/><div className="mt-14 grid gap-5 lg:grid-cols-3">{quotes.map(([quote,name,role],index) => <article key={name} className="rounded-2xl border border-[#EAECF0] bg-white p-7 shadow-[0_12px_32px_rgba(16,24,40,.08)]"><div className="flex gap-1">{[1,2,3,4,5].map(star => <Star key={star} size={16} fill="#FDB022" stroke="#FDB022"/>)}</div><blockquote className="mt-5 text-lg font-semibold leading-8 text-[#344054]">“{quote}”</blockquote><div className="mt-7 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-[#F4F3FF] font-black text-[#6941C6]">{name[0]}{index + 1}</span><div><p className="font-black text-[#0B0F19]">{name}</p><p className="text-sm text-[#667085]">{role}</p></div></div></article>)}</div></div></section>
}

function TiltCard({ children, featured = false }: { children: ReactNode; featured?: boolean }) {
  const reduce = useReducedMotion()
  return <motion.article whileHover={reduce ? undefined : { y: -8, rotateX: 2, rotateY: -2, scale: 1.015 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }} style={{ transformPerspective: 900 }} className={`relative min-w-[82vw] snap-center rounded-2xl border bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,.05)] transition-shadow hover:shadow-[0_20px_45px_rgba(16,24,40,.13)] md:min-w-0 ${featured ? 'border-2 border-[#6941C6]' : 'border-[#EAECF0]'}`}>{children}</motion.article>
}

function Pricing() {
  const [yearly, setYearly] = useState(false)
  const packs = [['Spark','$1','5 credits'],['Creator','$3','20 credits'],['Builder','$5','40 credits']]
  const plans = [
    ['Starter',15,150,'2 automations · Basic support'],
    ['Growth',29,400,'10 automations · Priority support'],
    ['Scale',79,1200,'Unlimited automations · Dedicated success · API'],
  ] as const
  return <section id="pricing" className="bg-white px-4 py-24 sm:px-6 lg:py-32"><div className="mx-auto max-w-7xl"><SectionHeading eyebrow="Simple pricing" title="Start small. Scale to millions." copy="Planning is free. Pay only when Alpha works."/>
    <div className="mx-auto mt-8 flex w-fit rounded-xl border border-[#EAECF0] bg-[#F9FAFB] p-1"><button onClick={() => setYearly(false)} className={`min-h-11 rounded-lg px-5 text-sm font-bold ${!yearly ? 'bg-white text-[#0B0F19] shadow-sm' : 'text-[#667085]'}`}>Monthly</button><button onClick={() => setYearly(true)} className={`min-h-11 rounded-lg px-5 text-sm font-bold ${yearly ? 'bg-white text-[#0B0F19] shadow-sm' : 'text-[#667085]'}`}>Yearly <span className="text-[#039855]">−20%</span></button></div>
    <div className="mt-12"><p className="mb-5 text-center text-sm font-black uppercase tracking-[.14em] text-[#667085]">Small packs for testers</p><div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-5 md:grid md:grid-cols-3 md:overflow-visible md:pb-0">{packs.map(([name,price,credits],index) => <TiltCard key={name} featured={index === 1}>{index === 1 && <span className="absolute right-4 top-4 rounded-full bg-[#F4F3FF] px-3 py-1 text-[10px] font-black uppercase text-[#6941C6]">Most popular</span>}<p className="text-sm font-black uppercase tracking-[.14em] text-[#6941C6]">{name}</p><p className="mt-5 text-4xl font-black text-[#0B0F19]">{price}</p><p className="mt-2 font-semibold text-[#667085]">{credits}</p><Link to="/auth" className="mt-6 block min-h-11 rounded-xl bg-[#6941C6] px-5 py-3 text-center text-sm font-semibold text-white shadow-[0_10px_24px_rgba(105,65,198,.18)]">Buy credits</Link></TiltCard>)}</div></div>
    <div className="mt-16"><p className="mb-5 text-center text-sm font-black uppercase tracking-[.14em] text-[#667085]">Monthly credits for business</p><div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-5 lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0">{plans.map(([name,monthly,credits,benefits],index) => { const price = yearly ? Math.round(monthly * .8) : monthly; return <TiltCard key={name} featured={index === 1}>{index === 1 && <span className="absolute right-4 top-4 rounded-full bg-[#6941C6] px-3 py-1 text-[10px] font-black uppercase text-white">Recommended</span>}<p className="text-sm font-black uppercase tracking-[.14em] text-[#6941C6]">{name}</p><p className="mt-5 text-4xl font-black text-[#0B0F19]">${price}<span className="text-base font-semibold text-[#667085]">/mo</span></p>{yearly && <p className="mt-1 text-xs font-bold text-[#039855]">Billed yearly · save 20%</p>}<p className="mt-5 text-lg font-black text-[#344054]">{credits} credits/month</p><p className="mt-3 min-h-12 text-sm leading-6 text-[#667085]">{benefits}</p><Link to="/auth" className="mt-6 block min-h-11 rounded-xl bg-[#6941C6] px-5 py-3 text-center text-sm font-semibold text-white shadow-[0_10px_24px_rgba(105,65,198,.18)]">Choose {name}</Link></TiltCard>})}</div></div>
    <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2 rounded-full border border-[#EAECF0] bg-[#F9FAFB] px-5 py-3 text-center text-xs font-bold text-[#475467]"><span>Google signup = 1 tester credit</span><span className="text-[#D0D5DD]">•</span><span>Phone verification = 10 credits, recommended, one time</span></div>
  </div></section>
}

function FAQ() {
  const [open, setOpen] = useState(0)
  return <section className="bg-[#F9FAFB] px-4 py-24 sm:px-6 lg:py-32"><div className="mx-auto max-w-3xl"><SectionHeading eyebrow="Questions" title="Everything important, answered." copy="Clear rules before Alpha acts."/><div className="mt-12 space-y-3">{faqs.map(([question,answer],index) => <article key={question} className="overflow-hidden rounded-2xl border border-[#EAECF0] bg-white shadow-sm"><button onClick={() => setOpen(open === index ? -1 : index)} className="flex min-h-14 w-full items-center justify-between gap-4 p-5 text-left font-black text-[#0B0F19]">{question}<ChevronDown className={`shrink-0 text-[#6941C6] transition-transform ${open === index ? 'rotate-180' : ''}`}/></button><AnimatePresence initial={false}>{open === index && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}><p className="px-5 pb-5 leading-7 text-[#667085]">{answer}</p></motion.div>}</AnimatePresence></article>)}</div></div></section>
}

function FinalCTA() {
  return <section className="bg-white px-4 py-20 sm:px-6"><div className="relative mx-auto max-w-7xl overflow-hidden rounded-[28px] border border-[#D6BBFB] bg-[#FAFBFF] px-6 py-16 text-center shadow-[0_24px_60px_rgba(105,65,198,.14)] sm:px-12"><div className="future-mesh pointer-events-none absolute inset-0"/><FutureOrbit/><div className="relative"><Zap className="mx-auto text-[#6941C6]" size={32}/><h2 className="mt-5 text-4xl font-black tracking-[-.04em] text-[#0B0F19] sm:text-6xl">Ready to delegate?</h2><p className="mx-auto mt-5 max-w-xl text-lg text-[#667085]">Give Alpha the outcome. Keep the approval. Get your time back.</p><Link to="/auth" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#6941C6] px-6 font-semibold text-white shadow-[0_10px_25px_rgba(105,65,198,.25)]">Start automating <ArrowRight size={18}/></Link><p className="mt-4 text-xs font-semibold text-[#98A2B3]">No credit card required for planning</p></div></div></section>
}

function Footer() {
  return <footer className="border-t border-[#EAECF0] bg-[#FAFBFF] px-4 pb-24 pt-10 sm:px-6 md:pb-10"><div className="mx-auto flex max-w-7xl flex-col gap-8"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-center"><Logo/><nav className="flex flex-wrap gap-5 text-sm font-semibold text-[#475467]"><a href="#how-it-works">How it works</a><a href="#pricing">Pricing</a><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href="https://twitter.com" aria-label="AlphaTekx on X"><Twitter size={18}/></a><a href="https://linkedin.com" aria-label="AlphaTekx on LinkedIn"><Linkedin size={18}/></a></nav></div><div className="h-px bg-[#EAECF0]"/><p className="text-sm font-medium text-[#667085]">© 2026 AlphaTekx. Built for real work.</p></div></footer>
}

function MobileStickyCTA() {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const hero = document.getElementById('hero')
    if (!hero) return
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: .08 })
    observer.observe(hero)
    return () => observer.disconnect()
  }, [])
  return <AnimatePresence>{visible && <motion.div initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 24 }} className="fixed inset-x-0 bottom-0 z-40 border-t border-white/60 bg-white/75 p-3 backdrop-blur-2xl md:hidden"><Link to={user ? '/dashboard' : '/auth'} className="mx-auto flex min-h-12 max-w-sm items-center justify-center gap-2 rounded-full bg-[#6941C6] px-6 font-black text-white shadow-[0_14px_35px_rgba(105,65,198,.28)]">Start Automating — Free <ArrowRight size={17}/></Link></motion.div>}</AnimatePresence>
}

export default function Landing() {
  return <div className="min-h-screen overflow-x-hidden bg-white font-sans text-[#0B0F19]">
    <SEO title="AlphaTekx — Delegate the work. Turn Your Idea Into Reality" description="Your AI Employee that asks, plans, waits for approval, and executes while you sleep."/>
    <div aria-hidden className="premium-noise pointer-events-none fixed inset-0 z-[60] opacity-[.02]"/>
    <ScrollProgress/><Header/><main><Hero/><LogoMarquee/><ProblemSolution/><HowItWorks/><InteractiveDemo/><AutomationGallery/><ActivityRail/><ConnectedApps/><FeatureDeepDive/><Stats/><Testimonials/><Pricing/><FAQ/><FinalCTA/></main><Footer/><MobileStickyCTA/>
  </div>
}
