import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { formatCurrency, PLANS, CREDIT_PACKS } from '../lib/billing'
import SEO from '../components/SEO'
import ConnectedAppsDropdown from '../components/ConnectedAppsDropdown'
import {
  ArrowRight,
  BarChart3,
  Brain,
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Download,
  Facebook,
  FileText,
  GraduationCap,
  Instagram,
  Layers,
  Layout,
  Linkedin,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  MoreHorizontal,
  NotebookPen,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  Rocket,
  Shield,
  ShoppingCart,
  Slack,
  Smartphone,
  Sparkles,
  Sun,
  Send,
  Trash2,
  Twitter,
  Users,
  X,
  Wallet,
  Youtube,
  Zap,
} from 'lucide-react'

const examplePrompts = [
  'Post on Facebook every day for one week.',
  'Summarize my Gmail every morning.',
  'Upload my YouTube videos automatically.',
  'Send Telegram notifications whenever I receive a payment.',
  'Email me my calendar every morning at 8 AM.',
]

const navLinks = [
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Automations', href: '#automations' },
  { label: 'Connected Apps', href: '#connected-apps' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Security', href: '#security' },
  { label: 'FAQ', href: '#faq' },
]

const liveDemoCards = [
  {
    title: 'Gmail Summary',
    status: 'Completed',
    statusColor: 'violet',
    next: '12 emails summarized',
    progress: 'Sent to: Telegram',
    icon: Mail,
  },
  {
    title: 'Google Calendar Briefing',
    status: 'Scheduled',
    statusColor: 'amber',
    next: 'Next run: Tomorrow at 8:00 AM',
    progress: 'Daily summary email',
    icon: Calendar,
  },
  {
    title: 'Google Sheets Update',
    status: 'Running',
    statusColor: 'emerald',
    next: '8 new records added',
    progress: 'Auto-append row',
    icon: FileText,
  },
  {
    title: 'Social Content Plan',
    status: 'Awaiting Approval',
    statusColor: 'violet',
    next: '7 original posts generated',
    progress: 'Review before publishing',
    icon: Sparkles,
  },
]

const problemCards = [
  'Posting content manually every day',
  'Replying to the same emails repeatedly',
  'Copying information into spreadsheets',
  'Checking calendars every morning',
  'Sending reminders manually',
  'Following up with customers',
  'Moving information between apps',
  'Forgetting important repeated tasks',
]

const howItWorks = [
  {
    step: '01',
    title: 'Describe the Result',
    text: 'Describe the result you want in plain English. No nodes, no workflows, no technical setup.',
    example: 'Send me my calendar every morning.',
  },
  {
    step: '02',
    title: 'Alpha Understands',
    text: 'It identifies the task, the apps needed, the schedule, and any missing details.',
  },
  {
    step: '03',
    title: 'Alpha Asks',
    text: 'Only the details it truly needs. One question at a time, conversationally.',
    example: 'What time should I send it?',
  },
  {
    step: '04',
    title: 'Alpha Generates What Is Needed',
    text: 'Alpha can create posts, titles, emails, reports, summaries, and other original content based on your information.',
  },
  {
    step: '05',
    title: 'Review the Plan',
    text: 'You see the task, schedule, duration, connected apps, and estimated credit cost before anything runs.',
  },
  {
    step: '06',
    title: 'Approve and Run',
    text: 'One click. The automation starts working on the server immediately.',
  },
  {
    step: '07',
    title: 'Monitor and Control',
    text: 'Pause, resume, edit, run now, view history, or delete at any time.',
  },
]

const automationCategories = [
  {
    title: 'Social Media',
    soon: false,
    items: ['Schedule Facebook posts', 'Publish uploaded YouTube videos', 'Post content at selected times', 'Manage posting schedules', 'Receive posting reports'],
  },
  {
    title: 'Email',
    soon: false,
    items: ['Summarize unread emails', 'Send scheduled emails', 'Reply using approved instructions', 'Save attachments', 'Notify users about important emails'],
  },
  {
    title: 'Calendar',
    soon: false,
    items: ['Send daily schedule summaries', 'Remind users about meetings', 'Create recurring updates', 'Send upcoming event reports'],
  },
  {
    title: 'Google Sheets',
    soon: false,
    items: ['Record payments', 'Add new leads', 'Track orders', 'Update business data', 'Create daily summaries'],
  },
  {
    title: 'Telegram',
    soon: false,
    items: ['Send alerts', 'Send daily reports', 'Send automation results', 'Notify users when something fails'],
  },
  {
    title: 'Business Operations',
    soon: false,
    items: ['Follow up with customers', 'Send reminders', 'Create reports', 'Record new transactions', 'Move information between apps'],
  },
]

const integrationCards = [
  { name: 'Gmail', status: 'available', icon: Mail },
  { name: 'Google Calendar', status: 'available', icon: Calendar },
  { name: 'Google Sheets', status: 'available', icon: FileText },
  { name: 'Telegram', status: 'available', icon: Send },
  { name: 'Facebook', status: 'coming-soon', icon: Facebook },
  { name: 'YouTube', status: 'coming-soon', icon: Youtube },
  { name: 'Instagram', status: 'coming-soon', icon: Instagram },
  { name: 'LinkedIn', status: 'coming-soon', icon: Linkedin },
  { name: 'X', status: 'coming-soon', icon: Twitter },
  { name: 'WhatsApp Business', status: 'coming-soon', icon: Smartphone },
  { name: 'Slack', status: 'coming-soon', icon: Slack },
  { name: 'Notion', status: 'coming-soon', icon: NotebookPen },
  { name: 'Paystack', status: 'coming-soon', icon: CreditCard },
]

const pricingPlans = [
  { ...PLANS.free, name: 'Free', description: 'For individuals exploring automation.', cta: 'Get Started', featured: false },
  { ...PLANS.pro_early_access, name: 'Pro Early Access', description: 'For creators and small businesses.', cta: 'Join Early Access', featured: true },
]

const comparisonRows = [
  { label: 'Setup', traditional: 'Workflow builders, triggers, and nodes', alpha: 'Describe the result' },
  { label: 'Skills needed', traditional: 'Technical or automation experience', alpha: 'Plain English' },
  { label: 'Approvals', traditional: 'Hidden or manual', alpha: 'Shown before every sensitive action' },
  { label: 'Monitoring', traditional: 'Complex logs', alpha: 'Clear run history and status' },
  { label: 'Cost', traditional: 'Unclear until after execution', alpha: 'Estimated before activation' },
]

const trustCards = [
  { title: 'Approval First', text: 'Automations do not start until you review and approve the plan.', icon: Check },
  { title: 'Review Public Content', text: 'Emails, posts, and other public content can be reviewed before they go out.', icon: Monitor },
  { title: 'Pause or Delete', text: 'Every automation can be paused, resumed, edited, or deleted at any time.', icon: Pause },
  { title: 'Transparent Credits', text: 'Cost estimates are shown before activation.', icon: CreditCard },
  { title: 'Sensitive Actions', text: 'Emails, posts, and purchases require explicit confirmation.', icon: Shield },
  { title: 'Disconnect Anytime', text: 'Connected apps can be removed from your account.', icon: Trash2 },
  { title: 'Clear History', text: 'Every run is logged with a human-readable status and error message.', icon: Clock },
  { title: 'Honest Failures', text: 'Failures are shown honestly. Alpha never claims success without confirmation.', icon: X },
]

const useCases = [
  { title: 'Content Creators', text: 'Schedule content, upload prepared videos, organize titles, and receive publishing reports.', icon: Monitor },
  { title: 'Small Businesses', text: 'Send follow-ups, track customer information, record transactions, and create reports.', icon: Briefcase },
  { title: 'Freelancers', text: 'Manage reminders, update clients, organize tasks, and track work.', icon: Layers },
  { title: 'Students', text: 'Receive schedule reminders, organize deadlines, and send study summaries.', icon: GraduationCap },
  { title: 'Teams', text: 'Share reports, receive alerts, and automate repeated internal tasks.', icon: Users },
  { title: 'Online Sellers', text: 'Track orders, update sheets, notify customers, and send payment alerts.', icon: ShoppingCart },
]

const faqs = [
  { q: 'What is AlphaTekx?', a: 'AlphaTekx is an intelligent AI automation platform that understands what users want, asks the required questions, generates content when needed, and creates automations to complete repeated work.' },
  { q: 'Do I need coding experience?', a: 'No. You describe what you want in plain English.' },
  { q: 'Is Alpha a general chatbot?', a: 'Alpha can explain, plan, generate content, and help with automations, but its primary purpose is completing and automating work.' },
  { q: 'Can Alpha create content?', a: 'Yes. Alpha can generate posts, titles, descriptions, emails, replies, reports, and other content based on your information.' },
  { q: 'Can I stop an automation?', a: 'Yes. Automations can be paused, resumed, edited, or deleted.' },
  { q: 'How do credits work?', a: 'Credits are used when an automation performs actions or uses AI capabilities. Costs are estimated before activation.' },
  { q: 'Will AlphaTekx ask questions?', a: 'Yes. It asks for any missing information required to complete the task correctly.' },
  { q: 'Does AlphaTekx support every app?', a: 'No. Supported apps are displayed clearly, and more will be added over time.' },
  { q: 'Will it run when my browser is closed?', a: 'Scheduled automations run on the server, so they continue even when your browser is closed.' },
  { q: 'Is the builder gone?', a: 'The builder is paused. The current AlphaTekx product is fully focused on intelligent automation.' },
]

const footerLinks = {
  Product: [
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Automations', href: '#automations' },
    { label: 'Connected Apps', href: '#connected-apps' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Updates', to: '/updates' },
  ],
  Company: [
    { label: 'About', to: '/about' },
    { label: 'Contact', to: '/contact' },
    { label: 'Help', to: '/help' },
    { label: 'Status', to: '/status' },
  ],
  Legal: [
    { label: 'Privacy Policy', to: '/privacy' },
    { label: 'Terms of Service', to: '/terms' },
    { label: 'Cookie Policy', to: '/cookie-policy' },
  ],
  Account: [
    { label: 'Sign In', to: '/auth' },
    { label: 'Sign Up', to: '/auth' },
    { label: 'Settings', to: '/settings' },
  ],
}

const keyframes = `
@keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes pulse-soft { 0%,100% { opacity: 1; } 50% { opacity: .7; } }
@keyframes bar { from { width: 0; } to { width: 100%; } }
@keyframes typing { 0% { width: 0; } 100% { width: 100%; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }
`

function classNames(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

function StatusBadge({ status, color }: { status: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    violet: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  }
  return (
    <span className={classNames('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', colorMap[color])}>
      <span className={classNames('h-1.5 w-1.5 rounded-full', color === 'emerald' ? 'bg-emerald-500' : color === 'violet' ? 'bg-violet-500' : 'bg-amber-500')} />
      {status}
    </span>
  )
}

function RotatingPrompt() {
  const [index, setIndex] = useState(0)
  const [display, setDisplay] = useState('')
  const [phase, setPhase] = useState<'typing' | 'waiting' | 'deleting'>('waiting')

  useEffect(() => {
    const full = examplePrompts[index]
    let timer: number
    if (phase === 'waiting') {
      timer = window.setTimeout(() => setPhase('typing'), 1200)
    } else if (phase === 'typing') {
      if (display.length < full.length) {
        timer = window.setTimeout(() => setDisplay(full.slice(0, display.length + 1)), 45)
      } else {
        timer = window.setTimeout(() => setPhase('deleting'), 2000)
      }
    } else if (phase === 'deleting') {
      if (display.length > 0) {
        timer = window.setTimeout(() => setDisplay(display.slice(0, -1)), 25)
      } else {
        setIndex((i) => (i + 1) % examplePrompts.length)
        setPhase('waiting')
      }
    }
    return () => window.clearTimeout(timer)
  }, [index, display, phase])

  return <span className="text-white/70">{display || ' '}</span>
}

function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleNav = (href: string) => {
    setMobileOpen(false)
    if (href.startsWith('#')) {
      const el = document.querySelector(href)
      el?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <header className={classNames('fixed top-0 left-0 right-0 z-50 transition-all duration-300', scrolled ? 'bg-[#120822]/85 backdrop-blur-2xl border-b border-white/10' : 'bg-[#120822]/60 backdrop-blur-xl border-b border-white/5')}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <Link to="/" className="flex items-center gap-2.5 text-sm font-bold tracking-wide text-white">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25">A</span>
          {' '}AlphaTekx
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium text-white/70 md:flex">
          {navLinks.map((item) => (
            <button key={item.label} onClick={() => handleNav(item.href)} className="hover:text-violet-300 transition-colors">{item.label}</button>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link to="/auth" className="rounded-full px-5 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.15] hover:text-violet-300">Sign In</Link>
          <Link to={user ? '/dashboard' : '/auth'} className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-transform hover:scale-[1.03]">Get Started</Link>
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-white/80 md:hidden border border-white/10 backdrop-blur-xl">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 bg-[#0B0215]/90 px-5 py-4 backdrop-blur-2xl md:hidden">
          <nav className="flex flex-col gap-3 text-sm font-medium text-white/80">
            {navLinks.map((item) => (
              <button key={item.label} onClick={() => handleNav(item.href)} className="text-left hover:text-violet-300">{item.label}</button>
            ))}
            <Link to="/auth" onClick={() => setMobileOpen(false)} className="mt-2 rounded-xl px-4 py-3 text-left font-medium text-white/80 hover:bg-white/10">Sign In</Link>
            <Link to={user ? '/dashboard' : '/auth'} onClick={() => setMobileOpen(false)} className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-left font-semibold text-white">Get Started</Link>
          </nav>
        </div>
      )}
    </header>
  )
}

function Hero() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const scrollTo = (id: string) => document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <section className="relative overflow-hidden px-5 pt-32 pb-20 md:pt-40 md:pb-28">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute right-1/4 bottom-0 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-600/20 blur-[100px]" />
      </div>

      <div className="mx-auto max-w-5xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-xs font-semibold text-violet-300 shadow-sm backdrop-blur-xl">
          <Sparkles size={13} /> AI Agentic Automation
        </div>
        <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-white md:text-6xl">
          Turn Your Ideas Into <span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">Reality</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70 md:text-xl">
          Tell AlphaTekx what you want done. It understands your goal, asks the right questions, connects to your apps, and runs the work for you.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm font-medium text-violet-300">
          No coding. No confusing workflows. No technical setup.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link to={user ? '/dashboard' : '/auth'} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-8 py-3.5 text-sm font-semibold text-white shadow-xl shadow-violet-500/25 transition-transform hover:scale-[1.03]">
            Start Automating <ArrowRight size={18} />
          </Link>
          <button onClick={() => scrollTo('#how-it-works')} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-8 py-3.5 text-sm font-semibold text-white/80 backdrop-blur-xl transition-all hover:bg-white/[0.12]">
            See How It Works <ChevronDown size={18} />
          </button>
        </div>

        <div className="mx-auto mt-14 max-w-3xl rounded-3xl border border-white/10 bg-white/[0.05] p-2 shadow-2xl shadow-violet-500/10 backdrop-blur-2xl">
          <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-5 text-left shadow-inner">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-300">
              <Sparkles size={14} /> Try an example
            </div>
            <div className="mt-4 flex min-h-[3.5rem] items-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm">
              <RotatingPrompt />
            </div>
            <div className="mt-4 rounded-xl border-l-4 border-violet-500 bg-violet-900/30 p-4 text-left">
              <p className="text-sm font-semibold text-white">AlphaTekx</p>
              <p className="mt-1 text-sm text-white/70">I can do that. What time should I post, and where should I get the content?</p>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-white/[0.08]">
                <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
              </div>
              <span className="text-xs text-white/55">Automation preview ready</span>
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-white/45">Live demo preview. Sign up to create a real automation.</p>
      </div>
    </section>
  )
}

function LiveActivity() {
  return (
    <section className="relative overflow-hidden px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-400">Live Product Demo</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">AlphaTekx at Work</h2>
          <p className="mt-3 text-white/70">See example automations running in real time.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {liveDemoCards.map((card) => (
            <div key={card.title} className="group rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-lg shadow-violet-500/10 backdrop-blur-xl transition-transform hover:-translate-y-1">
              <div className="flex items-start justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-900/40 to-fuchsia-900/40 text-violet-300">
                  <card.icon size={20} />
                </div>
                <StatusBadge status={card.status} color={card.statusColor} />
              </div>
              <h3 className="mt-4 font-semibold text-white">{card.title}</h3>
              <p className="mt-1 text-sm text-white/55">{card.next}</p>
              <div className="mt-4 text-xs font-medium text-violet-300">{card.progress}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProblemSection() {
  return (
    <section id="problem" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Repetitive Work Is Stealing Your Time</h2>
          <p className="mt-4 text-white/70">Small tasks add up. AlphaTekx handles them so you can focus on what matters.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {problemCards.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-sm backdrop-blur-xl">
              <div className="mt-0.5 text-violet-400"><Clock size={18} /></div>
              <p className="text-sm font-medium text-white/80">{item}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-lg font-medium text-white">AlphaTekx handles the repeated work so you can focus on what actually matters.</p>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">From One Sentence to a Working Automation</h2>
          <p className="mt-4 text-white/70">Describe the result. AlphaTekx does the rest.</p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {howItWorks.map((step) => (
            <div key={step.title} className="relative rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-lg shadow-violet-500/10 backdrop-blur-xl">
              <span className="text-3xl font-black text-violet-400/20">{step.step}</span>
              <h3 className="mt-2 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm text-white/70 leading-relaxed">{step.text}</p>
              {step.example && <p className="mt-3 rounded-lg bg-violet-900/30 p-3 text-sm italic text-violet-300 border border-white/10">“{step.example}”</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AutomationCategories() {
  return (
    <section id="automations" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Automate the Work You Do Every Day</h2>
          <p className="mt-4 text-white/70">Start with the tasks that repeat. More capabilities are added regularly.</p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {automationCategories.map((cat) => (
            <div key={cat.title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-lg shadow-violet-500/10 backdrop-blur-xl">
              <h3 className="text-lg font-semibold text-white">{cat.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {cat.items.map((i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                    <Check size={16} className="mt-0.5 shrink-0 text-violet-400" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-white/55">More integrations and capabilities will continue to be added.</p>
      </div>
    </section>
  )
}

function OneAgent() {
  return (
    <section className="relative overflow-hidden px-5 py-20">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/3 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-violet-700/20 blur-[100px]" />
        <div className="absolute right-1/3 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-fuchsia-700/20 blur-[100px]" />
      </div>
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">One AI. One Conversation. Many Possibilities.</h2>
        <p className="mt-4 text-white/70">You do not need to choose between dozens of agents or build complicated workflows. You speak to Alpha, and Alpha chooses the correct tools behind the scenes.</p>
        <div className="mt-12 flex flex-wrap justify-center gap-4">
          {['Gmail', 'Google Calendar', 'Google Sheets', 'Telegram', 'Facebook', 'YouTube'].map((app) => (
            <div key={app} className={classNames('rounded-2xl border px-5 py-4 text-sm font-medium backdrop-blur-xl', ['Facebook', 'YouTube'].includes(app) ? 'border-white/10 bg-white/[0.04] text-white/45' : 'border-white/10 bg-white/[0.06] text-white/80 shadow-sm')}>
              {app}
              {['Facebook', 'YouTube'].includes(app) && <span className="ml-2 rounded-full bg-white/[0.15] px-2 py-0.5 text-[10px] text-white/55">Coming Soon</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SmartQuestions() {
  const conversation = [
    { from: 'user', text: 'Upload my YouTube videos every day.' },
    { from: 'alpha', text: 'How many videos should I upload each day?' },
    { from: 'user', text: 'One.' },
    { from: 'alpha', text: 'What time should I upload them?' },
    { from: 'user', text: '5:00 PM.' },
    { from: 'alpha', text: 'How many days should this run?' },
    { from: 'user', text: '30 days.' },
    { from: 'alpha', text: 'Your automation is ready for review.' },
  ]

  return (
    <section className="px-5 py-20">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">It Does Not Guess. It Asks.</h2>
          <p className="mt-4 text-white/70">AlphaTekx gathers the information it needs before creating an automation. This reduces errors and helps it complete tasks correctly.</p>
        </div>
        <div className="mt-12 space-y-3 rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-violet-500/10 backdrop-blur-2xl">
          {conversation.map((msg, i) => (
            <div key={i} className={classNames('flex', msg.from === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={classNames('max-w-[85%] rounded-2xl px-5 py-3 text-sm', msg.from === 'user' ? 'rounded-br-none bg-violet-600 text-white' : 'rounded-bl-none border border-white/10 bg-white/[0.08] text-white/80')}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function RealContentGeneration() {
  const contentTypes = [
    'Facebook posts',
    'Instagram captions',
    'X posts',
    'LinkedIn posts',
    'YouTube titles',
    'YouTube descriptions',
    'Email subjects and bodies',
    'Customer replies',
    'Telegram messages',
    'Reports',
    'Summaries',
    'Announcements',
    'Product descriptions',
  ]
  return (
    <section className="px-5 py-20">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Alpha Can Create the Work Too</h2>
        <p className="mt-4 text-white/70">Alpha can generate real, original content based on your information. You can review, edit, regenerate, approve, or reject anything it creates.</p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {contentTypes.map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
              <p className="text-sm font-medium text-white">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AutomationPreview() {
  return (
    <section className="px-5 py-20">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Automation Preview</h2>
          <p className="mt-4 text-white/70">Every automation gets a clear summary before it is created.</p>
        </div>
        <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl shadow-violet-500/10 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-900/40 to-fuchsia-900/40 text-violet-300"><Facebook size={20} /></div>
            <h3 className="text-lg font-semibold text-white">Facebook Content Automation</h3>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs text-white/55">Task</p><p className="font-medium text-white">Generate and publish one original Facebook post each day.</p></div>
            <div><p className="text-xs text-white/55">Audience</p><p className="font-medium text-white">Small Nigerian business owners.</p></div>
            <div><p className="text-xs text-white/55">Tone</p><p className="font-medium text-white">Friendly and persuasive.</p></div>
            <div><p className="text-xs text-white/55">Schedule</p><p className="font-medium text-white">Every day at 9:00 AM.</p></div>
            <div><p className="text-xs text-white/55">Duration</p><p className="font-medium text-white">7 days.</p></div>
            <div><p className="text-xs text-white/55">Approval</p><p className="font-medium text-white">Review all posts before publishing.</p></div>
            <div><p className="text-xs text-white/55">Failure handling</p><p className="font-medium text-white">Retry twice, then notify the user.</p></div>
            <div><p className="text-xs text-white/55">Estimated credits</p><p className="font-medium text-violet-300">70 credits</p></div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <button className="rounded-full border border-white/10 bg-white/[0.08] px-6 py-2.5 text-sm font-semibold text-white">Edit Plan</button>
            <button className="rounded-full border border-white/10 bg-white/[0.08] px-6 py-2.5 text-sm font-semibold text-white">Generate Content</button>
            <button className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20">Approve Automation</button>
          </div>
          <p className="mt-4 text-xs text-white/45">Demo preview. Real automation approval happens inside the app.</p>
        </div>
      </div>
    </section>
  )
}

function DashboardPreview() {
  const cards = [
    { name: 'Daily Gmail Summary', status: 'Running', last: 'Today, 8:01 AM', next: 'Tomorrow, 8:00 AM', credits: '12', success: '28', failed: '1' },
    { name: 'Calendar Briefing', status: 'Paused', last: 'Yesterday, 8:00 AM', next: '—', credits: '6', success: '14', failed: '0' },
  ]
  return (
    <section className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">See Everything Your Agent Is Doing</h2>
          <p className="mt-4 text-white/70">A clean dashboard for monitoring, controlling, and improving your automations.</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {cards.map((c) => (
            <div key={c.name} className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-xl shadow-violet-500/10 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{c.name}</h3>
                <span className={classNames('rounded-full px-2.5 py-1 text-xs font-semibold', c.status === 'Running' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400')}>{c.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-white/55">Last run</p><p className="font-medium text-white">{c.last}</p></div>
                <div><p className="text-white/55">Next run</p><p className="font-medium text-white">{c.next}</p></div>
                <div><p className="text-white/55">Credits used</p><p className="font-medium text-white">{c.credits}</p></div>
                <div><p className="text-white/55">Success / Failed</p><p className="font-medium text-white">{c.success} / {c.failed}</p></div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {['Pause', 'Resume', 'Edit', 'Run Now', 'History', 'Delete'].map((a) => (
                  <span key={a} className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-xs font-medium text-white/70">{a}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ConnectedApps() {
  const items = integrationCards.map((app) => ({ id: app.name, name: app.name, icon: <app.icon size={18} />, status: app.status }))
  return (
    <section id="connected-apps" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <ConnectedAppsDropdown
          title="Connect the Apps You Already Use"
          subtitle="Select platforms to connect. Save your selection as a dashboard default."
          items={items}
        />
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="px-5 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Simple Pricing</h2>
          <p className="mt-4 text-white/70">Subscribe for access, then top up credits as automations run.</p>
        </div>
        <div className="mt-12 mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
          {pricingPlans.map((plan: any) => (
            <div key={plan.name} className={classNames('relative rounded-3xl border p-7 backdrop-blur-xl', plan.featured ? 'border-violet-500/40 bg-gradient-to-b from-violet-900/40 to-fuchsia-900/40 shadow-xl shadow-violet-500/10' : 'border-white/10 bg-white/[0.06] shadow-lg shadow-violet-500/10')}>
              {plan.featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3 py-1 text-xs font-semibold text-white shadow-lg">Most Popular</span>}
              <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              <p className="mt-2 text-sm text-white/70">{plan.description}</p>
              <div className="mt-6 text-center text-2xl font-bold text-white">{plan.priceKobo === 0 ? 'Free' : `${formatCurrency(plan.priceKobo)} / month`}</div>
              <ul className="mt-6 space-y-2 text-sm text-white/70">
                {plan.features.map((feature: string) => (
                  <li key={feature} className="flex items-center gap-2"><Check size={16} className="text-violet-400" /> {feature}</li>
                ))}
              </ul>
              <Link to="/auth" className={classNames('mt-6 block w-full rounded-full py-3 text-center text-sm font-semibold', plan.featured ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20' : 'border border-white/10 bg-white/[0.08] text-white')}>{plan.cta}</Link>
            </div>
          ))}
        </div>
        <div className="mt-12">
          <h3 className="text-center text-xl font-semibold text-white">Credit Packs</h3>
          <p className="mt-2 text-center text-sm text-white/55">Purchased credits never expire and are used when your monthly credits run out.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CREDIT_PACKS.map((pack) => (
              <div key={pack.id} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-xl">
                <p className="font-semibold text-white">{pack.label}</p>
                <p className="mt-2 text-2xl font-bold text-white">{formatCurrency(pack.amountKobo)}</p>
                <p className="mt-1 text-xs text-white/55">{pack.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Different() {
  return (
    <section className="px-5 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Automation Without the Complexity</h2>
          <p className="mt-4 text-white/70">An honest comparison with traditional automation platforms.</p>
        </div>
        <div className="mt-12 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] shadow-xl shadow-violet-500/10 backdrop-blur-xl">
          <div className="grid grid-cols-3 gap-4 border-b border-white/10 bg-white/[0.05] p-4 text-sm font-semibold text-white/80">
            <span>Feature</span>
            <span>Traditional Platforms</span>
            <span>AlphaTekx</span>
          </div>
          {comparisonRows.map((row) => (
            <div key={row.label} className="grid grid-cols-3 gap-4 border-b border-white/[0.08] p-4 text-sm last:border-0">
              <span className="font-medium text-white">{row.label}</span>
              <span className="text-white/55">{row.traditional}</span>
              <span className="font-medium text-violet-300">{row.alpha}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Trust() {
  return (
    <section id="security" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">You Stay in Control</h2>
          <p className="mt-4 text-white/70">Designed with permission, transparency, and user control in mind.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trustCards.map((card) => (
            <div key={card.title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-lg shadow-violet-500/10 backdrop-blur-xl">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-900/40 text-violet-300">
                <card.icon size={20} />
              </div>
              <h3 className="mt-4 font-semibold text-white">{card.title}</h3>
              <p className="mt-2 text-sm text-white/70">{card.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function UseCases() {
  return (
    <section className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Built for Real People Doing Real Work</h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-lg shadow-violet-500/10 backdrop-blur-xl">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-900/40 to-fuchsia-900/40 text-violet-300">
                <item.icon size={20} />
              </div>
              <h3 className="mt-4 font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-white/70">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="px-5 py-20">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Frequently Asked Questions</h2>
        </div>
        <div className="mt-12 space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.06] shadow-sm backdrop-blur-xl overflow-hidden">
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between px-6 py-4 text-left">
                <span className="font-medium text-white">{faq.q}</span>
                {open === i ? <ChevronDown size={18} className="text-white/55" /> : <ChevronRight size={18} className="text-white/55" />}
              </button>
              {open === i && <div className="px-6 pb-4 text-sm text-white/70 leading-relaxed">{faq.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTA() {
  const { user } = useAuth()
  return (
    <section className="px-5 py-20">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-gradient-to-br from-violet-900/40 to-fuchsia-900/30 p-12 text-center shadow-2xl shadow-violet-500/10 backdrop-blur-2xl">
        <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Stop Repeating Work. Start Delegating It.</h2>
        <p className="mt-4 text-white/70">Tell AlphaTekx what you want done and turn your idea into a working automation.</p>
        <Link to={user ? '/dashboard' : '/auth'} className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-8 py-3.5 text-sm font-semibold text-white shadow-xl shadow-violet-500/25 transition-transform hover:scale-[1.03]">
          Start Automating <ArrowRight size={18} />
        </Link>
        <p className="mt-3 text-xs text-white/55">Create your account and build your first automation.</p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#120822]/70 px-5 py-14 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Link to="/" className="flex items-center gap-2 text-sm font-bold tracking-wide text-white">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white">A</span>
              {' '}AlphaTekx
            </Link>
            <p className="mt-3 text-sm text-white/55">Turn your ideas into working automations through conversation.</p>
          </div>
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-sm font-semibold text-white">{title}</h4>
              <ul className="mt-4 space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link to={link.to} className="text-sm text-white/70 hover:text-violet-300">{link.label}</Link>
                    ) : (
                      <a href={link.href} className="text-sm text-white/70 hover:text-violet-300">{link.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-sm text-white/55 md:flex-row">
          <p>© 2026 AlphaTekx. All rights reserved.</p>
          <p className="text-xs">Founded and owned by Daniel Thompson.</p>
        </div>
      </div>
    </footer>
  )
}

export default function Landing() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#120822] text-white">
      <SEO />
      <style dangerouslySetInnerHTML={{ __html: keyframes }} />
      <Header />
      <main className={classNames('transition-opacity duration-500', mounted ? 'opacity-100' : 'opacity-0')}>
        <Hero />
        <LiveActivity />
        <ProblemSection />
        <HowItWorks />
        <AutomationCategories />
        <OneAgent />
        <SmartQuestions />
        <RealContentGeneration />
        <AutomationPreview />
        <DashboardPreview />
        <ConnectedApps />
        <Pricing />
        <Different />
        <Trust />
        <UseCases />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
