import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Bot, CalendarClock, Check, ChevronDown, CirclePlay, Clock3,
  Instagram, Linkedin, Mail, Menu, ShieldCheck, Sparkles, Twitter, X, Zap,
} from 'lucide-react'
import SEO from '../components/SEO'
import { useAuth } from '../lib/auth'

const nav = [
  ['How it works', '#how-it-works'],
  ['Automations', '#automations'],
  ['Connected apps', '#connected-apps'],
  ['Pricing', '#pricing'],
]

const jobs = [
  { icon: Linkedin, name: 'LinkedIn publishing', detail: 'Original posts, reviewed and scheduled' },
  { icon: Twitter, name: 'X content', detail: 'Fresh ideas delivered on your schedule' },
  { icon: Instagram, name: 'Instagram planning', detail: 'Captions that stay useful and unique' },
  { icon: Mail, name: 'Gmail workflows', detail: 'Important work handled without busywork' },
]

const steps = [
  ['01', 'Tell Alpha the result', 'Use plain English. No nodes, triggers, or technical setup.'],
  ['02', 'Answer one question at a time', 'Alpha asks only for details needed to do the job safely.'],
  ['03', 'Review the complete plan', 'See the schedule, duration, content samples, and credit estimate.'],
  ['04', 'Approve and let Alpha work', 'Your automation continues securely, even after you close the browser.'],
]

const faqs = [
  ['What is AlphaTekx?', 'AlphaTekx is an AI Employee that plans approved work, executes it, and reports confirmed results.'],
  ['Do I need automation experience?', 'No. Describe the result you want and Alpha guides you one decision at a time.'],
  ['Can I review content first?', 'Yes. Public content stays reviewable and requires explicit approval before scheduling or publishing.'],
  ['Can I pause an automation?', 'Yes. Running automations can be paused, edited, resumed, or deleted from one clear workspace.'],
]

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3 text-lg font-black tracking-[-0.03em] text-slate-900">
      <span className="grid size-10 place-items-center rounded-xl bg-[#6D28D9] text-base font-black text-white shadow-[0_10px_24px_rgba(109,40,217,.28)]">A</span>
      ALPHATEKX
    </Link>
  )
}

function Header() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-[0_8px_30px_rgba(15,23,42,.08)] backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex">
          {nav.map(([label, href]) => <a key={href} href={href} className="text-sm font-extrabold text-slate-600 transition hover:text-[#6D28D9]">{label}</a>)}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link to="/auth" className="rounded-xl px-5 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-100">Sign in</Link>
          <Link to={user ? '/dashboard' : '/auth'} className="rounded-xl bg-[#6D28D9] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(109,40,217,.28)] transition hover:-translate-y-0.5 hover:bg-[#5B21B6]">
            Start automating
          </Link>
        </div>
        <button onClick={() => setOpen(!open)} className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-900 md:hidden" aria-label="Toggle navigation">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-200 bg-white px-5 py-5 shadow-xl md:hidden">
          <nav className="grid gap-2">
            {nav.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 font-extrabold text-slate-700 hover:bg-violet-50 hover:text-[#6D28D9]">{label}</a>)}
            <Link to="/auth" className="mt-2 rounded-xl bg-[#6D28D9] px-4 py-3 text-center font-black text-white">Start automating</Link>
          </nav>
        </div>
      )}
    </header>
  )
}

function Hero() {
  const { user } = useAuth()
  return (
    <section className="relative overflow-hidden bg-white px-5 pb-24 pt-36 lg:pb-32 lg:pt-44">
      <div className="pointer-events-none absolute left-1/2 top-16 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-violet-100/70 blur-3xl" />
      <div className="relative mx-auto max-w-7xl">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#6D28D9] shadow-[0_8px_25px_rgba(109,40,217,.12)]">
            <Sparkles size={15} /> Your intelligent AI employee
          </span>
          <h1 className="mt-7 text-5xl font-black leading-[.98] tracking-[-0.055em] text-slate-900 sm:text-6xl lg:text-8xl">
            Delegate the work.<br />
            <span className="mt-3 inline-block rounded-2xl bg-[#6D28D9] px-5 py-3 text-white shadow-[0_22px_55px_rgba(109,40,217,.3)]">Turn Your Idea Into Reality</span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg font-semibold leading-8 text-slate-600 sm:text-xl">
            Tell AlphaTekx the outcome you want. It asks the right questions, prepares the plan, waits for approval, and gets the job done.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to={user ? '/dashboard' : '/auth'} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#6D28D9] px-8 text-base font-black text-white shadow-[0_16px_35px_rgba(109,40,217,.3)] transition hover:-translate-y-1 hover:bg-[#5B21B6]">
              Start with Alpha <ArrowRight size={19} />
            </Link>
            <a href="#how-it-works" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-8 text-base font-black text-slate-900 shadow-[0_10px_28px_rgba(15,23,42,.08)] transition hover:-translate-y-1 hover:border-violet-300">
              <CirclePlay size={19} className="text-[#6D28D9]" /> See how it works
            </a>
          </div>
          <div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-bold text-slate-500">
            {['No workflow builder', 'Approval before action', 'Runs while you sleep'].map(item => <span key={item} className="flex items-center gap-2"><Check size={16} className="text-[#6D28D9]" />{item}</span>)}
          </div>
        </div>

        <div className="relative mx-auto mt-16 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-3 shadow-[0_35px_90px_rgba(30,41,59,.18)]">
          <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-5 sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-5">
              <div><p className="text-xs font-black uppercase tracking-[.18em] text-[#6D28D9]">Command Centre</p><h2 className="mt-1 text-xl font-black text-slate-900">Plan with Alpha</h2></div>
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-700">Alpha is ready</span>
            </div>
            <div className="grid gap-5 py-6 lg:grid-cols-[1.2fr_.8fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,.07)]">
                <div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-[#6D28D9]"><Bot size={20}/></span><div><p className="font-black text-slate-900">What days should your LinkedIn posts run?</p><p className="mt-1 text-sm font-semibold text-slate-500">Most professional audiences respond well Monday to Friday.</p></div></div>
                <div className="mt-5 flex flex-wrap gap-2">{['Mon–Fri', 'Every day', 'Custom'].map((item, index) => <button key={item} className={`rounded-xl px-4 py-2.5 text-sm font-black ${index === 0 ? 'bg-[#6D28D9] text-white shadow-lg shadow-violet-200' : 'border border-slate-200 bg-white text-slate-700'}`}>{item}</button>)}</div>
              </div>
              <div className="rounded-2xl bg-[#6D28D9] p-5 text-white shadow-[0_18px_40px_rgba(109,40,217,.24)]">
                <p className="text-xs font-black uppercase tracking-[.15em] text-violet-200">Plan preview</p>
                <div className="mt-4 grid gap-3 text-sm font-bold"><p className="flex justify-between"><span className="text-violet-200">Platform</span> LinkedIn</p><p className="flex justify-between"><span className="text-violet-200">Schedule</span> Mon–Fri, 9am</p><p className="flex justify-between"><span className="text-violet-200">Duration</span> 30 days</p><p className="flex justify-between"><span className="text-violet-200">Estimated</span> 22 posts</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <div className="mx-auto max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-[#6D28D9]">{eyebrow}</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] text-slate-900 sm:text-5xl">{title}</h2><p className="mx-auto mt-5 max-w-2xl text-lg font-semibold leading-8 text-slate-600">{copy}</p></div>
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-slate-200 bg-slate-50 px-5 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="Simple by design" title="One conversation. A complete job." copy="Alpha handles the complexity behind a calm, guided experience." />
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map(([number, title, copy]) => <article key={number} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_18px_45px_rgba(15,23,42,.09)]"><span className="text-4xl font-black text-violet-200">{number}</span><h3 className="mt-8 text-xl font-black text-slate-900">{title}</h3><p className="mt-3 font-semibold leading-7 text-slate-600">{copy}</p></article>)}
        </div>
      </div>
    </section>
  )
}

function Automations() {
  return (
    <section id="automations" className="bg-white px-5 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="Work Alpha can own" title="Built for the work that keeps repeating." copy="Start with a focused automation, review the plan, and stay in control." />
        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {jobs.map(({ icon: Icon, name, detail }) => <article key={name} className="group flex items-center gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,.08)] transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-[0_24px_55px_rgba(109,40,217,.14)]"><span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-violet-100 text-[#6D28D9]"><Icon size={26}/></span><div><h3 className="text-xl font-black text-slate-900">{name}</h3><p className="mt-1 font-semibold text-slate-500">{detail}</p></div><ArrowRight className="ml-auto text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#6D28D9]" /></article>)}
        </div>
      </div>
    </section>
  )
}

function ConnectedApps() {
  const apps = [['X', Twitter], ['Instagram', Instagram], ['LinkedIn', Linkedin], ['Gmail', Mail]]
  return (
    <section id="connected-apps" className="bg-violet-50 px-5 py-24">
      <div className="mx-auto max-w-6xl rounded-[2rem] border border-violet-200 bg-white p-8 shadow-[0_30px_70px_rgba(109,40,217,.14)] sm:p-12">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_.9fr]">
          <div><p className="text-xs font-black uppercase tracking-[.2em] text-[#6D28D9]">Connected apps</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] text-slate-900">Your tools. One intelligent command centre.</h2><p className="mt-5 text-lg font-semibold leading-8 text-slate-600">Connect once. Alpha quietly handles authentication, planning, scheduling, and confirmed execution.</p><div className="mt-7 flex items-center gap-2 text-sm font-black text-slate-700"><ShieldCheck className="text-[#6D28D9]"/> Secure, revocable connections</div></div>
          <div className="grid grid-cols-2 gap-4">{apps.map(([name, Icon]) => { const AppIcon = Icon as typeof Twitter; return <div key={name as string} className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-[0_12px_30px_rgba(15,23,42,.07)]"><AppIcon className="mx-auto text-[#6D28D9]" /><p className="mt-3 font-black text-slate-900">{name as string}</p><p className="mt-1 text-xs font-bold text-emerald-600">Ready to connect</p></div> })}</div>
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="bg-white px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="Clear credits" title="Start small. Pay for real work." copy="Planning is free. Alpha shows the expected cost before you approve an automation." />
        <div className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-3">
          {[['Spark', '5 credits', '$1'], ['Creator', '20 credits', '$3'], ['Builder', '40 credits', '$5']].map(([name, credits, price], index) => <article key={name} className={`rounded-2xl p-7 ${index === 1 ? 'bg-[#6D28D9] text-white shadow-[0_24px_55px_rgba(109,40,217,.3)]' : 'border border-slate-200 bg-white text-slate-900 shadow-[0_18px_45px_rgba(15,23,42,.08)]'}`}><p className={`text-sm font-black uppercase tracking-[.16em] ${index === 1 ? 'text-violet-200' : 'text-[#6D28D9]'}`}>{name}</p><p className="mt-5 text-4xl font-black">{price}</p><p className={`mt-2 font-bold ${index === 1 ? 'text-violet-100' : 'text-slate-500'}`}>{credits}</p><Link to="/auth" className={`mt-7 block rounded-xl py-3 text-center text-sm font-black ${index === 1 ? 'bg-white text-[#6D28D9]' : 'bg-violet-100 text-[#6D28D9]'}`}>Get started</Link></article>)}
        </div>
      </div>
    </section>
  )
}

function FAQ() {
  const [open, setOpen] = useState(0)
  return (
    <section className="border-t border-slate-200 bg-slate-50 px-5 py-24">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="Questions" title="Simple answers." copy="Everything important stays clear before Alpha acts." />
        <div className="mt-12 space-y-3">{faqs.map(([question, answer], index) => <div key={question} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,.06)]"><button onClick={() => setOpen(open === index ? -1 : index)} className="flex w-full items-center justify-between p-5 text-left text-base font-black text-slate-900">{question}<ChevronDown className={`text-[#6D28D9] transition ${open === index ? 'rotate-180' : ''}`}/></button>{open === index && <p className="px-5 pb-5 font-semibold leading-7 text-slate-600">{answer}</p>}</div>)}</div>
      </div>
    </section>
  )
}

function CTA() {
  return (
    <section className="bg-white px-5 py-24">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#6D28D9] px-7 py-16 text-center text-white shadow-[0_32px_80px_rgba(109,40,217,.32)] sm:px-12">
        <Zap className="mx-auto text-violet-200" size={34}/><h2 className="mx-auto mt-5 max-w-3xl text-4xl font-black tracking-[-.04em] sm:text-5xl">Stop repeating work. Start delegating it.</h2><p className="mx-auto mt-5 max-w-2xl text-lg font-semibold text-violet-100">Tell AlphaTekx the result you want. Watch Alpha get it done.</p><Link to="/auth" className="mt-8 inline-flex min-h-14 items-center gap-2 rounded-xl bg-white px-8 font-black text-[#6D28D9] shadow-xl">Build your first automation <ArrowRight size={18}/></Link>
      </div>
    </section>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SEO title="AlphaTekx — Turn Your Idea Into Reality" description="Delegate repeated work to your intelligent AI employee." />
      <Header />
      <main><Hero /><HowItWorks /><Automations /><ConnectedApps /><Pricing /><FAQ /><CTA /></main>
      <footer className="border-t border-slate-200 bg-white px-5 py-10"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 sm:flex-row"><Logo/><p className="text-sm font-bold text-slate-500">© {new Date().getFullYear()} AlphaTekx. Built for real work.</p><div className="flex gap-5 text-sm font-extrabold text-slate-600"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div></div></footer>
    </div>
  )
}
