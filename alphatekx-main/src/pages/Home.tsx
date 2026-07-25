import { useEffect, useMemo, useState } from 'react'
import { ArrowUp, Bot, CreditCard, Plus, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getCredits, subscribeCredits } from '../lib/creditStore'
import { useAgents } from '../lib/agents/agentStore'
import type { Agent } from '../lib/agents/types'

const rotatingExamples = [
  'Post on Facebook every day for one week.',
  'Upload YouTube videos every Monday.',
  'Reply to customer emails.',
  'Send today\'s calendar to Telegram every morning.',
  'Save invoice attachments to Google Drive.',
]

const helpAnswers: { pattern: RegExp; answer: string }[] = [
  { pattern: /what can (alphatekx|you|it) automate/i, answer: 'AlphaTekx can automate tasks across Gmail, Google Calendar, Google Sheets, and Telegram. Examples: daily calendar emails, Gmail summaries to Telegram, spreadsheet updates, scheduled alerts, and reminders.' },
  { pattern: /how do credits work/i, answer: 'Credits are consumed when an automation runs actions. The cost is estimated before you approve the automation. You can buy more credits in Settings.' },
  { pattern: /which apps (are supported|do you support)/i, answer: 'Gmail, Google Calendar, Google Sheets, and Telegram are supported today. Facebook, YouTube, Instagram, LinkedIn, X, WhatsApp, Slack, Notion, and Paystack are coming soon.' },
  { pattern: /why did my automation fail/i, answer: 'Open the automation and check the History tab. Failures usually mean a disconnected app, expired permissions, or insufficient credits.' },
  { pattern: /help me create an automation/i, answer: 'Describe the result you want in the box above. For example: "Send me a summary of my calendar every morning at 8 AM."' },
  { pattern: /suggest useful automations/i, answer: 'Try: "Email me my daily calendar every morning", "Summarize my unread emails and send them to Telegram", or "Record new payments in a Google Sheet".' },
]

function formatTime(iso: string) {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

export default function Home() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const agents = useAgents()
  const [input, setInput] = useState('')
  const [exampleIndex, setExampleIndex] = useState(0)
  const [shake, setShake] = useState(false)
  const [credits, setCredits] = useState(getCredits())
  const [help, setHelp] = useState<string | null>(null)

  useEffect(() => subscribeCredits(() => setCredits(getCredits())), [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setExampleIndex(i => (i + 1) % rotatingExamples.length)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [])

  const submit = () => {
    const prompt = input.trim()
    if (!prompt) {
      setShake(true)
      window.setTimeout(() => setShake(false), 400)
      return
    }
    const matched = helpAnswers.find(h => h.pattern.test(prompt))
    const isQuestion = /\?$|^(what|how|why|which|can|do|is|will|are|should|where|when)\b/i.test(prompt)
    if (matched || isQuestion) {
      setHelp(matched?.answer ?? 'I can help with your automations. Try asking what AlphaTekx can automate, how credits work, or which apps are supported. You can also describe a task you want to automate.')
      return
    }
    navigate(`/automations?prompt=${encodeURIComponent(prompt)}&s=${Date.now()}`)
  }

  const keydown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const running = useMemo(() => agents.filter(a => a.status === 'running' || a.status === 'active'), [agents])
  const recent = useMemo(() => [...agents].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 3), [agents])
  const lowCredits = credits < 5 && user?.email?.toLowerCase() !== 'iamdan4live@gmail.com'

  return (
    <section className="min-h-full px-4 py-10 text-center">
      <div className="mx-auto w-full max-w-[820px]">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/20">
          <Sparkles size={28} className="text-white" />
        </div>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-white md:text-5xl">
          What do you want to automate?
        </h1>
        <p className="mt-3 text-sm text-white/55 md:text-base">
          You can also ask Alpha for help with your automations.
        </p>

        <div className={`mx-auto mt-8 rounded-3xl border border-white/[0.12] bg-white/[0.04] p-3 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-[24px] transition-all ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
          <textarea
            value={input}
            onChange={e => { setInput(e.target.value); setHelp(null) }}
            onKeyDown={keydown}
            placeholder={`e.g. ${rotatingExamples[exampleIndex]}`}
            className="min-h-[120px] w-full resize-none bg-transparent p-5 text-base text-white outline-none placeholder:text-white/40"
          />
          <div className="flex flex-col items-center justify-between gap-3 px-2 pb-2 sm:flex-row">
            <span className="text-xs text-white/50">Press Enter to start</span>
            <button
              onClick={submit}
              disabled={!input.trim()}
              className="btn-alpha flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white disabled:opacity-40 sm:w-auto"
            >
              <ArrowUp size={18} /> Start Automation
            </button>
          </div>
        </div>

        {help && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-5 text-left">
            <p className="text-sm leading-relaxed text-white/80">{help}</p>
            <button onClick={() => setHelp(null)} className="mt-3 text-sm font-medium text-violet-300 hover:text-violet-200">Close</button>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {rotatingExamples.map(ex => (
            <button
              key={ex}
              onClick={() => { setInput(ex); setHelp(null) }}
              className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-white/60 transition-all hover:border-violet-400/40 hover:bg-white/[0.08] hover:text-white"
            >
              {ex.replace(/\.$/, '')}
            </button>
          ))}
        </div>

        {lowCredits && (
          <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-left">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-200"><CreditCard size={16}/> Low credits</div>
            <p className="mt-1 text-sm text-white/70">You have {credits} credits left. Buy more in Settings to keep automations running.</p>
            <button onClick={() => navigate('/settings?tab=billing')} className="mt-3 text-sm font-semibold text-violet-300 hover:text-violet-200">Buy Credits →</button>
          </div>
        )}

        {running.length > 0 && (
          <div className="mt-8 text-left">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/55">Running automations</h2>
            <div className="mt-3 space-y-3">
              {running.slice(0, 2).map(a => <AutomationCard key={a.id} agent={a} onClick={() => navigate(`/automations?id=${a.id}`)} />)}
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div className="mt-8 text-left">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white/55">Recent automations</h2>
              <button onClick={() => navigate('/automations')} className="text-xs font-medium text-violet-300 hover:text-violet-200">View all</button>
            </div>
            <div className="mt-3 space-y-3">
              {recent.map(a => <AutomationCard key={a.id} agent={a} onClick={() => navigate(`/automations?id=${a.id}`)} />)}
            </div>
          </div>
        )}

        {running.length === 0 && recent.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-white/10 p-8">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/[0.06]"><Plus size={22} className="text-white/50" /></div>
            <p className="mt-3 text-sm text-white/70">Ask Alpha anything. No automations yet — describe one above and Alpha will build it for you.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function AutomationCard({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const status = agent.status
  const statusColor = status === 'running' || status === 'active' ? 'text-emerald-400' : status === 'paused' ? 'text-amber-400' : 'text-white/60'
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-left transition-colors hover:bg-white/[0.08]">
      <div className="flex items-center gap-3">
        <Bot size={18} className="text-violet-400" />
        <div>
          <p className="text-sm font-medium text-white">{agent.name || 'Automation'}</p>
          <p className="text-xs text-white/50">{agent.nextRunAt ? `Next run ${formatTime(agent.nextRunAt)}` : `Updated ${formatTime(agent.updatedAt || agent.createdAt)}`}</p>
        </div>
      </div>
      <span className={`text-xs font-semibold ${statusColor}`}>{status}</span>
    </button>
  )
}
