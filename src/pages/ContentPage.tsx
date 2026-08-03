import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MessageSquareText, ShieldCheck, Zap } from 'lucide-react'
import SEO from '../components/SEO'
import { ContactForm } from '../components/ContactUs'

interface PageData {
  title: string
  body: React.ReactNode
}

function StatusBody() {
  const [health, setHealth] = useState<{ ok?: boolean; timestamp?: string; uptimeSeconds?: number } | null>(null)
  useEffect(() => {
    fetch('/api/health').then(r => r.json().catch(() => ({}))).then(setHealth).catch(() => setHealth({}))
  }, [])
  const healthy = health?.ok === true
  return (
    <>
      <p className="text-white/70">Current platform health.</p>
      <div className="mt-6 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${healthy ? 'bg-emerald-500' : 'bg-amber-500'} shadow-[0_0_8px_currentColor]`} />
          <span className="font-semibold text-white">{healthy ? 'All systems operational' : 'Checking status...'}</span>
        </div>
        {health?.timestamp && <p className="mt-2 text-sm text-white/55">Last check: {new Date(health.timestamp).toLocaleString()}</p>}
      </div>
    </>
  )
}

const PAGES: Record<string, PageData> = {
  contact: {
    title: 'Contact',
    body: (
      <>
        <p className="text-white/70">If you paid and your credit or plan didn’t show up, do not panic. Send the reference and we will fix it in under a minute.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
            <MessageSquareText className="text-violet-300" size={18} />
            <p className="mt-3 font-medium text-white">Fast response</p>
            <p className="mt-1 text-sm text-white/60">Reply in 1 minute for payment support issues.</p>
          </div>
          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
            <ShieldCheck className="text-violet-300" size={18} />
            <p className="mt-3 font-medium text-white">Verified fix</p>
            <p className="mt-1 text-sm text-white/60">We confirm the reference and add the correct credit or plan.</p>
          </div>
          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
            <Zap className="text-violet-300" size={18} />
            <p className="mt-3 font-medium text-white">No silent failure</p>
            <p className="mt-1 text-sm text-white/60">If the payment was blocked or delayed, we resolve it without leaving you hanging.</p>
          </div>
        </div>
        <div className="mt-8 rounded-2xl border border-violet-400/20 bg-[#12131A] p-6">
          <ContactForm />
        </div>
        <div className="mt-6 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-6 backdrop-blur-xl">
          <p className="font-medium text-white">Need a direct line?</p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <a href="mailto:support@alphatekx.name.ng" className="text-violet-300 hover:underline">support@alphatekx.name.ng</a>
            <a href="https://wa.me/2349046802069" target="_blank" rel="noreferrer" className="text-violet-300 hover:underline">WhatsApp</a>
          </div>
          <p className="mt-4 text-sm text-white/55">AlphaTekx is built and owned by Daniel Thompson.</p>
        </div>
      </>
    ),
  },
  help: {
    title: 'Help',
    body: (
      <>
        <p className="text-white/70">Quick answers to common questions. For more, contact us.</p>
        <ul className="mt-6 space-y-4 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-6 backdrop-blur-xl text-white/70">
          <li><strong className="text-white">Do I need to code?</strong> No. AlphaTekx is designed to be used in plain English.</li>
          <li><strong className="text-white">Can I stop an automation?</strong> Yes. Every automation can be paused, resumed, edited, or deleted.</li>
          <li><strong className="text-white">How do credits work?</strong> Credits are consumed when an automation runs actions or uses AI features.</li>
          <li><strong className="text-white">Is my data safe?</strong> OAuth tokens are stored server-side, and we ask before sensitive actions.</li>
        </ul>
      </>
    ),
  },
  status: {
    title: 'Status',
    body: <StatusBody />,
  },
  'cookie-policy': {
    title: 'Cookie Policy',
    body: (
      <>
        <p className="text-white/70">AlphaTekx uses cookies and similar technologies only where needed for core functionality.</p>
        <div className="mt-6 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-6 backdrop-blur-xl space-y-4 text-white/70">
          <p><strong className="text-white">Essential cookies</strong> are required for authentication and session management.</p>
          <p><strong className="text-white">Analytics</strong> are not used unless explicitly enabled.</p>
          <p>You can clear your browser cookies at any time. Some features may require cookies to be enabled.</p>
        </div>
      </>
    ),
  },
  updates: {
    title: 'Updates',
    body: (
      <>
        <p className="text-white/70">The latest changes and improvements to AlphaTekx.</p>
        <ul className="mt-6 space-y-4 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-6 backdrop-blur-xl text-white/70">
          <li><strong className="text-white">Phase 2</strong> — The automation brain is live. Create automations conversationally, review plans, and run them on a server-side scheduler.</li>
          <li><strong className="text-white">Phase 1</strong> — Product pivot to an AI Agentic Automation Platform with a new landing and home experience.</li>
          <li><strong className="text-white">Coming soon</strong> — More integrations, marketplace templates, and advanced scheduling.</li>
        </ul>
      </>
    ),
  },
}

export default function ContentPage({ slug: propSlug, workspace = false }: { slug?: string; workspace?: boolean }) {
  const params = useParams<{ slug?: string }>()
  const slug = propSlug || params.slug || ''
  const page = PAGES[slug] || { title: 'Page Not Found', body: <p className="text-white/70">This page does not exist yet.</p> }
  const content = (
    <main className={`mx-auto w-full max-w-3xl px-4 sm:px-6 ${workspace ? 'pb-28 pt-8 sm:py-12' : 'py-12 sm:py-16'}`}>
      <h1 className="break-words text-3xl font-bold tracking-tight text-white md:text-4xl">{page.title}</h1>
      <div className="mt-6 break-words text-white/80 leading-relaxed sm:mt-8">{page.body}</div>
    </main>
  )
  if (workspace) return content
  return (
    <div className="min-h-screen bg-[#0B0215] text-white">
      <SEO title={page.title} description={`${page.title} — AlphaTekx`} />
      <header className="sticky top-0 z-50 border-b border-violet-400/20 bg-[#0B0215]/70 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm font-bold tracking-wide text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white">A</span>
            {' '}AlphaTekx
          </Link>
          <Link to="/" className="flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white"><ArrowLeft size={16}/> Back home</Link>
        </div>
      </header>
      {content}
    </div>
  )
}
