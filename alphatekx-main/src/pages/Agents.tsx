import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wallet,
  Webhook,
  X,
  Zap,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { connectors, getConnector } from '../lib/agents/connectorRegistry'
import { createAgentFromNL } from '../lib/agents/agentParser'
import {
  addExecution,
  deleteAgent,
  getAgents,
  saveAgent,
  updateAgent,
  useAgents,
} from '../lib/agents/agentStore'
import type { Agent, AgentExecution, AgentStatus } from '../lib/agents/types'
import { ConnectorIcon } from '../components/agents/ConnectorIcon'
import WorkflowPlan from '../components/agents/WorkflowPlan'
import CampaignPreview from '../components/agents/CampaignPreview'
import { getIntegrationStatus, getLocalUser, type IntegrationStatus } from '../lib/integrations'
import { randomUUID } from '../lib/utils'
import { useAuth } from '../lib/auth'
import { getCredits as getCreditBalance, setCredits as saveCredits, subscribeCredits } from '../lib/creditStore'
import { CREDIT_PACKS, formatCurrency, getCreditPack, getPlan, PLANS } from '../lib/billing'
import { initializeCheckout, verifyCheckout, type PaymentItem } from '../lib/payment'

function formatRelative(iso: string) {
  const date = new Date(iso)
  const diff = date.getTime() - Date.now()
  const min = Math.round(diff / 60000)
  if (min < 1 && min > -1) return 'now'
  if (Math.abs(min) < 60) return min > 0 ? `in ${min} min` : `${Math.abs(min)} min ago`
  return date.toLocaleString()
}

type ConversationMessage = { role: 'user' | 'alpha' | 'system'; text: string; ts: string; field?: string; generatedCount?: number; totalCredits?: number }
type AlphaConversation = Agent & {
  messages: ConversationMessage[]
  conversationStage: string
  knownFields: Record<string, unknown>
  missingFields: { field: string; question: string; reason: string; required: boolean }[]
  askedFields: string[]
  generatedContent: unknown[]
  selectedCapabilities: string[]
  requiredIntegrations: string[]
  pendingConnections: string[]
  approvalRequired: boolean
  automationDraft: Agent | null
  lastQuestion: string
}

const googleProviderIds = new Set(['gmail', 'google_sheets', 'google_calendar', 'google_drive', 'calendar'])
function providerForConnectorId(id: string) {
  if (googleProviderIds.has(id)) return 'google'
  return id
}

function statusDot(status: AgentStatus) {
  if (status === 'running' || status === 'active') return <span className="relative flex h-2.5 w-2.5">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
  </span>
  if (status === 'warning' || status === 'failed' || status === 'error') return <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
  if (status === 'paused' || status === 'completed' || status === 'deleted') return <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
  if (status === 'pending' || status === 'awaiting_information' || status === 'awaiting_connection' || status === 'awaiting_approval' || status === 'draft') return <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
  return <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
}

export default function Agents() {
  const { user, session, refreshProfile } = useAuth()
  const isAdmin = user?.email?.toLowerCase() === 'iamdan4live@gmail.com'
  const agents = useAgents()
  const [searchParams, setSearchParams] = useSearchParams()
  const [input, setInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Agent | null>(null)
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>(() => ({
    google: { connected: false, email: null, scopes: [] },
    gmail: { connected: false, email: null },
    sheets: { connected: false, email: null },
    calendar: { connected: false, email: null },
    drive: { connected: false, email: null },
    google_sheets: { connected: false, email: null },
    google_calendar: { connected: false, email: null },
    google_drive: { connected: false, email: null },
  }))
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState('')
  const [credits, setCredits] = useState<number>(getCreditBalance())
  const [buying, setBuying] = useState(false)
  const [pendingPayment, setPendingPayment] = useState<{ reference: string; credits: number; amount: number } | null>(null)
  const [pendingAgent, setPendingAgent] = useState<Agent | null>(null)
  const [conversation, setConversation] = useState<AlphaConversation | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState('')
  const [selectedPayment, setSelectedPayment] = useState<PaymentItem | null>(null)
  const promptStartedRef = useRef(false)

  const refreshStatus = async () => {
    try { setIntegrationStatus(await getIntegrationStatus(session?.access_token)) } catch {}
  }

  const authHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {}
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`
    const local = getLocalUser()
    if (local) { h['x-local-user-id'] = local.id; h['x-local-user-email'] = local.email }
    return h
  }

  const refreshCredits = async () => {
    try {
      const res = await fetch('/api/credits/balance', { headers: authHeaders() })
      if (res.ok) { const data = await res.json(); const balance = Number(data.credits) || 0; setCredits(balance); saveCredits(balance) }
    } catch {}
    try { await refreshProfile() } catch {}
  }

  const PENDING_PROMPT_KEY = 'alphatekx:pending-prompt'
  const PENDING_AGENT_KEY = 'alphatekx:pending-agent'
  const CONSUMED_PROMPT_NONCE_KEY = 'alphatekx:prompt-nonce'
  const PENDING_CONVERSATION_KEY = 'alphatekx:pending-conversation'

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(PENDING_AGENT_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Agent
        if (parsed?.id) setPendingAgent(parsed)
      }
      const pendingPrompt = sessionStorage.getItem(PENDING_PROMPT_KEY)
      if (pendingPrompt) setInput(pendingPrompt)
      const storedConversation = sessionStorage.getItem(PENDING_CONVERSATION_KEY)
      if (storedConversation) {
        const parsed = JSON.parse(storedConversation) as AlphaConversation
        if (parsed?.id) setConversation(parsed)
      }
    } catch {}
  }, [])

  useEffect(() => {
    const prompt = searchParams.get('prompt')
    const nonce = searchParams.get('s') || prompt || ''
    const id = searchParams.get('id')
    if (id) {
      const found = agents.find(a => a.id === id)
      if (found) setSelected(found)
    }
    if (!prompt) return
    const decoded = decodeURIComponent(prompt)
    try { sessionStorage.setItem(PENDING_PROMPT_KEY, decoded) } catch {}
    const consumed = (() => { try { return sessionStorage.getItem(CONSUMED_PROMPT_NONCE_KEY) } catch { return null } })()
    if (consumed === nonce) {
      setInput(decoded)
      return
    }
    try { sessionStorage.setItem(CONSUMED_PROMPT_NONCE_KEY, nonce) } catch {}
    setInput(decoded)
    promptStartedRef.current = true
    void create(decoded)
  }, [searchParams])

  useEffect(() => {
    if (pendingAgent) {
      try { sessionStorage.setItem(PENDING_AGENT_KEY, JSON.stringify(pendingAgent)) } catch {}
    } else {
      try { sessionStorage.removeItem(PENDING_AGENT_KEY) } catch {}
    }
  }, [pendingAgent])

  useEffect(() => {
    if (conversation) {
      try { sessionStorage.setItem(PENDING_CONVERSATION_KEY, JSON.stringify(conversation)) } catch {}
    } else {
      try { sessionStorage.removeItem(PENDING_CONVERSATION_KEY) } catch {}
    }
  }, [conversation])

  useEffect(() => subscribeCredits(() => setCredits(getCreditBalance())), [])

  useEffect(() => {
    refreshStatus()
    refreshCredits()
    const interval = window.setInterval(() => { refreshStatus(); refreshCredits() }, 10_000)
    return () => window.clearInterval(interval)
  }, [session?.access_token, selected, agents.length])

  useEffect(() => {
    if (pendingAgent) refreshStatus()
  }, [pendingAgent])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const email = searchParams.get('email')
    const reason = searchParams.get('reason')
    if (connected === 'google' || connected === 'gmail') {
      setNotice(`Google connected${email ? ` as ${email}` : ''}. Gmail, Sheets, Calendar, and Drive are now enabled.`)
      window.history.replaceState({}, '', '/automations')
    } else if (connected === 'error') {
      setNotice(reason ? `Google connection failed: ${reason}` : 'Google connection failed.')
      window.history.replaceState({}, '', '/automations')
    }
  }, [searchParams])

  const running = agents.filter(a => a.status === 'running' || a.status === 'active' || a.status === 'warning').length
  const paused = agents.filter(a => a.status === 'paused').length
  const pending = agents.filter(a => a.status === 'pending' || a.status === 'awaiting_information' || a.status === 'awaiting_connection' || a.status === 'awaiting_approval' || a.status === 'draft').length
  const today = agents.flatMap(a => a.executionHistory || []).filter(e => new Date(e.at).toDateString() === new Date().toDateString()).length
  const successRate = useMemo(() => {
    const all = agents.flatMap(a => a.executionHistory || [])
    return all.length ? Math.round((all.filter(e => e.status === 'success').length / all.length) * 100) : 100
  }, [agents])

  const recentExecutions = useMemo(() => {
    return agents
      .flatMap(a => (a.executionHistory || []).map(e => ({ ...e, agentName: a.name })))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 20)
  }, [agents])

  const saveParsedAgent = async (agent: Agent) => {
    try {
      await saveAgent(agent)
      setInput('')
      setPendingAgent(null)
      setConversation(null)
      try {
        sessionStorage.removeItem(PENDING_PROMPT_KEY)
        sessionStorage.removeItem(CONSUMED_PROMPT_NONCE_KEY)
        sessionStorage.removeItem(PENDING_CONVERSATION_KEY)
      } catch {}
      setNotice(`Agent "${agent.name}" is running. Cost: ${agent.creditsPerRun || 1} credit per run.`)
    } catch (error) {
      const err = error as Error & { code?: string; plan?: string }
      if (err.code === 'PLAN_LIMIT') {
        setUpgradeMessage(err.message || `Your plan supports only ${getPlan(err.plan || 'free').maxActiveAutomations} active automation${getPlan(err.plan || 'free').maxActiveAutomations === 1 ? '' : 's'}.`)
        setUpgradeOpen(true)
      } else {
        setNotice(err.message || 'Could not activate automation.')
      }
    }
  }

  const approveAgent = async (agent: Agent) => {
    await saveParsedAgent(agent)
  }

  const bestPackForCredits = (target: number) => CREDIT_PACKS.find(p => p.credits >= target) || CREDIT_PACKS[0]
  const getPackPrice = (item: PaymentItem) => {
    if (item.type === 'subscription') return getPlan(item.planId).priceKobo
    const pack = getCreditPack(item.packId)
    return pack ? pack.amountKobo : 0
  }

  const startNewConversation = () => {
    setConversation(null)
    setPendingAgent(null)
    setInput('')
    try {
      sessionStorage.removeItem(PENDING_CONVERSATION_KEY)
      sessionStorage.removeItem(PENDING_AGENT_KEY)
      sessionStorage.removeItem(PENDING_PROMPT_KEY)
      sessionStorage.removeItem(CONSUMED_PROMPT_NONCE_KEY)
    } catch {}
  }

  const create = async (seedPrompt?: string) => {
    const raw = (typeof seedPrompt === 'string' ? seedPrompt : input).trim()
    if (!raw) return
    setCreating(true)
    setNotice('')
    setInput('')
    try {
      const res = await fetch('/api/alpha/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ prompt: raw }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice(data.error || 'Alpha could not start the conversation. Check that an AI provider is configured.')
        // Fallback to legacy parse
        const fallback = await fetch('/api/agents/parse', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ prompt: raw }) })
        if (fallback.ok) {
          const fb = await fallback.json()
          if (fb.agent) setPendingAgent(fb.agent as Agent)
        } else {
          const authUser = user ? { id: user.id, email: user.email } : getLocalUser()
          setPendingAgent(createAgentFromNL(raw, undefined, authUser || undefined))
        }
        return
      }
      const conv = (data.conversation || data) as AlphaConversation
      setConversation(conv)
      const draft = conv.automationDraft || data.agent || null
      if (conv.conversationStage === 'created' || data.created) {
        setNotice(`Automation ${conv.automationDraft?.name || ''} is active.`)
        startNewConversation()
      } else if (draft) {
        setPendingAgent(draft as Agent)
      } else {
        setPendingAgent(null)
      }
    } finally { setCreating(false) }
  }

  const sendReply = async () => {
    if (!conversation?.id || !input.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`/api/alpha/conversation/${encodeURIComponent(conversation.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ message: input.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setNotice(data.error || 'Could not continue conversation.'); return }
      const conv = (data.conversation || data) as AlphaConversation
      setConversation(conv)
      setInput('')
      const draft = conv.automationDraft || data.agent || null
      if (conv.conversationStage === 'created' || data.created) {
        setNotice(`Automation ${conv.automationDraft?.name || ''} is active.`)
        startNewConversation()
      } else if (draft) {
        setPendingAgent(draft as Agent)
      } else {
        setPendingAgent(null)
      }
    } finally { setCreating(false) }
  }

  const startPayment = async (item: PaymentItem) => {
    setBuying(true)
    try {
      const data = await initializeCheckout('paystack', item)
      setPendingPayment({ reference: data.reference, credits: data.credits, amount: data.amount })
      window.open(data.authorization_url, '_blank')
      let checks = 0
      const timer = window.setInterval(async () => {
        checks++
        await refreshCredits()
        if (checks > 24) window.clearInterval(timer)
      }, 5000)
      window.setTimeout(() => window.clearInterval(timer), 130_000)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Payment start failed')
    } finally { setBuying(false) }
  }

  const verifyPendingPayment = async () => {
    if (!pendingPayment) return
    try {
      await verifyCheckout('paystack', pendingPayment.reference)
      await refreshCredits()
      setPendingPayment(null)
      setNotice('Credits added! Create your automation again.')
    } catch { setNotice('Payment not verified yet. If you just paid, wait a moment and retry.') }
  }

  const toggle = (agent: Agent) => {
    const active = agent.status === 'running' || agent.status === 'active' || agent.status === 'warning'
    updateAgent(agent.id, { status: active ? 'paused' : 'running' })
  }

  const runNow = async (agent: Agent) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const local = getLocalUser()
      if (local) { headers['x-local-user-id'] = local.id; headers['x-local-user-email'] = local.email }
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/run`, { method: 'POST', headers, credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.message || `Run failed (${res.status})`)
      if (data.execution) addExecution(agent.id, data.execution)
      else addExecution(agent.id, { id: randomUUID(), agentId: agent.id, at: new Date().toISOString(), status: 'success', duration: 0, log: 'Agent ran successfully.' })
    } catch (error) {
      addExecution(agent.id, {
        id: randomUUID(),
        agentId: agent.id,
        at: new Date().toISOString(),
        status: 'error',
        duration: 0,
        log: `Run failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }


  const copyWebhook = (id: string) => {
    const url = `${window.location.origin}/api/agents/webhook/${id}`
    navigator.clipboard.writeText(url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) })
  }

  return <div className="min-h-screen bg-background px-5 py-24 text-white md:px-8">
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[.22em] text-white/45">My Automations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Automations that work for you 24/7</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Describe a task. Alpha plans it, connects your apps, and runs it automatically.</p>
        </div>
        <Link to="/connected-apps" className="rounded-xl border border-white/[.12] liquid-glass px-4 py-3 text-sm hover:bg-white/[.08]">Manage connected apps</Link>
      </header>

      {notice && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="liquid-glass rounded-2xl p-5">
          <div className="text-xs text-white/55">Running</div>
          <div className="mt-1 text-2xl font-semibold">{running}</div>
        </div>
        <div className="liquid-glass rounded-2xl p-5">
          <div className="text-xs text-white/55">Pending</div>
          <div className="mt-1 text-2xl font-semibold">{pending}</div>
        </div>
        <div className="liquid-glass rounded-2xl p-5">
          <div className="text-xs text-white/55">Paused</div>
          <div className="mt-1 text-2xl font-semibold">{paused}</div>
        </div>
        <div className="liquid-glass rounded-2xl p-5">
          <div className="text-xs text-white/55">Executions today</div>
          <div className="mt-1 text-2xl font-semibold">{today}</div>
        </div>
        <div className="liquid-glass rounded-2xl p-5">
          <div className="text-xs text-white/55">Success rate</div>
          <div className="mt-1 text-2xl font-semibold">{successRate}%</div>
        </div>
        <div className="liquid-glass rounded-2xl p-5">
          <div className="flex items-center gap-2 text-xs text-white/55"><Wallet size={12}/> Credits</div>
          <div className="mt-1 text-2xl font-semibold">{isAdmin ? '∞' : (credits ?? '—')}</div>
        </div>
      </section>

      {conversation && (
        <section className="mt-8">
          <div className="rounded-2xl border border-white/[.08] bg-white/[.03] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-400"><MessageSquare size={14}/> Conversation with Alpha</div>
              <button onClick={startNewConversation} className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white/60 hover:bg-white/[.05]">New automation</button>
            </div>
            <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1">
              {conversation.messages?.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${m.role === 'user' ? 'rounded-tr-none bg-indigo-500 text-white' : 'rounded-tl-none border border-white/[.08] bg-white/[.06] text-white/90'}`}>
                    {m.role === 'alpha' && <div className="mb-1 text-[10px] font-medium text-indigo-300">Alpha</div>}
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.generatedCount !== undefined && m.totalCredits !== undefined && <p className="mt-1 text-[10px] text-white/50">{m.generatedCount} posts · {m.totalCredits} credits estimated</p>}
                  </div>
                </div>
              ))}
              {creating && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-none border border-white/[.08] bg-white/[.06] px-4 py-2 text-sm text-white/60">
                    <LoaderCircle className="animate-spin" size={16}/>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="liquid-glass rounded-2xl p-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); conversation ? sendReply() : create() } }}
            placeholder={conversation ? "Reply to Alpha..." : "Every morning at 8 AM post an AI tip to Facebook, LinkedIn and X... or Every 5 minutes send 'Hello from Alpha' to my Telegram"}
            className="h-32 w-full resize-none bg-transparent px-2 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
          />
          <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:justify-between">
            {selectedPayment ? (
              <div className="flex w-full flex-wrap items-center gap-2 text-xs text-amber-300">
                <span>{notice}</span>
                <button onClick={() => selectedPayment && startPayment(selectedPayment)} disabled={buying} className="rounded-lg bg-indigo-500 px-3 py-1.5 text-white hover:bg-indigo-400 disabled:opacity-50">
                  {buying ? <LoaderCircle className="animate-spin" size={12}/> : `Pay ${formatCurrency(getPackPrice(selectedPayment))}`}
                </button>
                <button onClick={() => setSelectedPayment(null)} className="rounded-lg border border-white/20 px-3 py-1.5 text-white hover:bg-white/5">Cancel</button>
                {pendingPayment && <button onClick={verifyPendingPayment} className="rounded-lg border border-white/20 px-3 py-1.5 text-white hover:bg-white/5">Verify payment</button>}
              </div>
            ) : <div className="text-xs text-white/40">{conversation ? 'Reply with the information Alpha asked for.' : 'Each execution costs credits based on the actions. The estimate is shown before approval.'}</div>}
            <button
              type="button"
              onClick={() => conversation ? sendReply() : create()}
              disabled={!input.trim() || creating}
              className="flex min-h-11 items-center gap-2 rounded-lg btn-alpha px-5 text-sm text-white disabled:opacity-30"
            >
              {creating ? <LoaderCircle className="animate-spin" size={16}/> : conversation ? <MessageSquare size={16}/> : <Bot size={16}/>}
              {conversation ? 'Send reply' : 'Create Automation'}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          <h2 className="text-lg font-semibold">My automations</h2>
          <div className="mt-4 space-y-3">
            {agents.filter(a => a.type !== 'conversation').length === 0 && <p className="text-sm text-white/50">No automations yet. Describe one above.</p>}
            {agents.filter(a => a.type !== 'conversation').map(agent => (
              <div key={agent.id} className="liquid-glass rounded-2xl p-4 transition hover:border-indigo-500/50">
                <div className="flex items-start justify-between gap-3">
                  <button onClick={() => setSelected(agent)} className="flex-1 text-left">
                    <div className="flex items-center gap-3">
                      {statusDot(agent.status)}
                      <span className="font-semibold">{agent.name}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-white/55">{agent.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/55">
                      <span className="flex items-center gap-1.5 rounded-lg bg-white/[.05] px-2 py-1">
                        {agent.trigger.type === 'campaign' ? <Zap size={12}/> : agent.trigger.type === 'schedule' ? <CalendarClock size={12}/> : <Webhook size={12}/>}
                        {agent.trigger.type === 'campaign' ? 'Campaign' : agent.trigger.type === 'schedule' ? (agent.trigger.cron || 'Daily') : 'Webhook'}
                      </span>
                      {agent.status === 'running' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"/> Live</span>}
                      {(agent.trigger.type === 'schedule' || agent.trigger.type === 'campaign') && <span className="flex items-center gap-1.5 rounded-lg bg-white/[.05] px-2 py-1"><Clock size={12}/> Next: {formatRelative(agent.trigger.nextRun || '')}</span>}
                      {agent.lastRun && <span className="flex items-center gap-1.5 rounded-lg bg-white/[.05] px-2 py-1"><RefreshCw size={12}/> Last: {formatRelative(agent.lastRun)}</span>}
                      <span className="flex items-center gap-1.5 rounded-lg bg-white/[.05] px-2 py-1"><CheckCircle2 size={12}/> {agent.executionsDone || 0} posts</span>
                      <span className="flex items-center gap-1.5 rounded-lg bg-white/[.05] px-2 py-1">{agent.successRate ?? 100}% success</span>
                      {agent.trigger.type === 'webhook' && <span className="flex items-center gap-1.5 rounded-lg bg-white/[.05] px-2 py-1"><CheckCircle2 size={12}/> Listening</span>}
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggle(agent)} className="rounded-lg p-2 hover:bg-white/[.08]" title={agent.status === 'running' ? 'Pause' : 'Resume'}>
                      {agent.status === 'running' ? <Pause size={16}/> : <Play size={16}/>}
                    </button>
                    <button onClick={() => runNow(agent)} className="rounded-lg p-2 hover:bg-white/[.08]" title="Run now"><RefreshCw size={16}/></button>
                    <button onClick={() => deleteAgent(agent.id)} className="rounded-lg p-2 text-red-400 hover:bg-white/[.08]" title="Delete"><Trash2 size={16}/></button>
                    <button onClick={() => setSelected(agent)} className="rounded-lg p-2 hover:bg-white/[.08]" title="Edit"><MoreHorizontal size={16}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="liquid-glass rounded-2xl p-5">
            <h2 className="text-sm font-semibold">Recent executions</h2>
            <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {recentExecutions.length === 0 && <p className="text-xs text-white/45">No executions yet.</p>}
              {recentExecutions.map(exec => (
                <div key={exec.id} className="flex gap-3 rounded-xl border border-white/[.08] bg-white/[.04] p-3 text-xs">
                  {exec.status === 'success' ? <CheckCircle2 size={14} className="text-emerald-400"/> : exec.status === 'skipped' ? <Pause size={14} className="text-amber-400"/> : <X size={14} className="text-red-400"/>}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{exec.agentName}</p>
                    <p className="mt-0.5 truncate text-white/55">{exec.log}</p>
                    <p className="mt-1 text-white/40">{new Date(exec.at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="liquid-glass rounded-2xl p-5">
            <h2 className="text-sm font-semibold">Connected services</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {connectors.filter(c => c.id !== 'calendar').map(c => {
                const status = integrationStatus[c.id] || integrationStatus[providerForConnectorId(c.id)] || { connected: false, email: null }
                const isGoogle = googleProviderIds.has(c.id)
                return (
                  <div key={c.id} className="rounded-xl border border-white/[.08] bg-white/[.04] p-3">
                    <div className="flex items-center gap-2">
                      <ConnectorIcon connector={c}/>
                      <span className="text-xs font-medium">{c.name}</span>
                    </div>
                    {status.connected ? (
                      <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 size={10}/> {status.email || 'Connected'}</span>
                    ) : status.ready ? (
                      <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-sky-300"><CheckCircle2 size={10}/> Ready</span>
                    ) : (
                      <span className="mt-2 text-[10px] text-white/40">{isGoogle ? <Link to={`/connectors?service=${c.id}`} className="text-indigo-400 hover:underline">Connect</Link> : <Link to={`/connectors?service=${c.id}`} className="text-indigo-400 hover:underline">Add key</Link>}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
      </section>
    </div>

    {selected && selected.type !== 'campaign' && <AgentModal agent={selected} onClose={() => setSelected(null)} onRun={() => runNow(selected)} onToggle={() => toggle(selected)} onDelete={() => { if (window.confirm('Delete this automation? It will stop all future runs.')) { deleteAgent(selected.id); setSelected(null) } }} onCopy={() => copyWebhook(selected.id)} copied={copied}/>}
    {selected && selected.type === 'campaign' && <CampaignPreview agent={selected} integrationStatus={integrationStatus} credits={credits} isAdmin={isAdmin} authHeaders={authHeaders} onClose={() => setSelected(null)} onActivated={(agent) => { saveAgent(agent); setSelected(null); setConversation(null); try { sessionStorage.removeItem(PENDING_CONVERSATION_KEY) } catch {} }} />}
    {pendingAgent && pendingAgent.type !== 'campaign' && <WorkflowPlan agent={pendingAgent} integrationStatus={integrationStatus} credits={credits} isAdmin={isAdmin} onClose={() => setPendingAgent(null)} onApprove={approveAgent} />}
    {pendingAgent && pendingAgent.type === 'campaign' && <CampaignPreview agent={pendingAgent} integrationStatus={integrationStatus} credits={credits} isAdmin={isAdmin} authHeaders={authHeaders} onClose={() => setPendingAgent(null)} onActivated={(agent) => { saveAgent(agent); setPendingAgent(null); setConversation(null); try { sessionStorage.removeItem(PENDING_CONVERSATION_KEY) } catch {} }} />}
    {upgradeOpen && <UpgradeModal message={upgradeMessage} onUpgrade={() => startPayment({ type: 'subscription', planId: 'pro_early_access' })} onBuyCredits={() => { setUpgradeOpen(false); setSelectedPayment({ type: 'credits', packId: bestPackForCredits(100).id }) }} onCancel={() => setUpgradeOpen(false)} buying={buying} />}
  </div>
}

type AgentLog = { id: string; agentId: string; connectorType: string; content?: string; status: 'success' | 'failed'; response?: string; error?: string; createdAt: string }

function AgentModal({ agent, onClose, onRun, onToggle, onDelete, onCopy, copied }: { agent: Agent; onClose: () => void; onRun: () => void; onToggle: () => void; onDelete: () => void; onCopy: () => void; copied: boolean }) {
  const [tab, setTab] = useState<'overview' | 'logs' | 'executions' | 'settings'>('overview')
  const [logs, setLogs] = useState<AgentLog[]>([])
  const permissions = agent.actions.flatMap(a => {
    const c = getConnector(a.connector)
    return c ? [c.name] : []
  })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/agents/logs?agentId=${encodeURIComponent(agent.id)}&limit=50`)
        const data = await res.json().catch(() => ({}))
        if (!cancelled) setLogs(Array.isArray(data.logs) ? data.logs : [])
      } catch {}
    }
    load()
    const t = window.setInterval(load, 10_000)
    return () => { cancelled = true; window.clearInterval(t) }
  }, [agent.id])

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/[.12] bg-background p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{agent.name}</h2>
          <p className="mt-1 text-sm text-white/55">{agent.description}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/[.08]"><X size={18}/></button>
      </div>

      <div className="mt-5 flex gap-2 border-b border-white/[.1] pb-1">
        {(['overview', 'logs', 'executions', 'settings'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === t ? 'text-white' : 'text-white/50 hover:text-white'}`}>{t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>

      <div className="mt-5">
        {tab === 'overview' && <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/[.08] bg-white/[.04] p-4">
              <div className="text-xs text-white/45">Trigger</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                {agent.trigger.type === 'schedule' ? <CalendarClock size={16}/> : <Webhook size={16}/>}
                {agent.trigger.type === 'schedule' ? agent.trigger.cron || 'Daily' : 'Webhook'}
              </div>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.04] p-4">
              <div className="text-xs text-white/45">Next run</div>
              <div className="mt-1 text-sm font-medium">{agent.trigger.type === 'schedule' ? (formatRelative(agent.trigger.nextRun || '') || 'Scheduler active') : 'On external event'}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/[.08] bg-white/[.04] p-4">
              <div className="text-xs text-white/45">Total posts</div>
              <div className="mt-1 text-xl font-semibold">{agent.executionsDone || 0}</div>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.04] p-4">
              <div className="text-xs text-white/45">Success rate</div>
              <div className="mt-1 text-xl font-semibold">{agent.successRate ?? 100}%</div>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.04] p-4">
              <div className="text-xs text-white/45">Status</div>
              <div className={`mt-1 text-sm font-semibold ${agent.status === 'running' || agent.status === 'active' ? 'text-emerald-400' : agent.status === 'warning' || agent.status === 'failed' || agent.status === 'error' ? 'text-amber-400' : agent.status === 'pending' || agent.status === 'awaiting_information' || agent.status === 'awaiting_connection' || agent.status === 'awaiting_approval' || agent.status === 'draft' ? 'text-sky-400' : 'text-white'}`}>{agent.status}</div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Actions</h3>
            <div className="mt-3 space-y-2">
              {agent.actions.map((action, i) => {
                const c = getConnector(action.connector)
                return <div key={i} className="flex items-center gap-3 rounded-xl border border-white/[.08] bg-white/[.04] p-3">
                  {c ? <ConnectorIcon connector={c}/> : <Zap size={18}/>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{action.label || action.action}</p>
                    <p className="text-xs text-white/45">{c?.name || action.connector}</p>
                  </div>
                </div>
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Permissions</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {permissions.length ? permissions.map((p, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-white/[.1] bg-white/[.05] px-3 py-1 text-xs"><ShieldCheck size={12}/> {p}</span>) : <span className="text-sm text-white/45">No permissions requested.</span>}
            </div>
          </div>

          {agent.trigger.type === 'webhook' && <div className="rounded-xl border border-dashed border-white/[.15] bg-white/[.04] p-4">
            <div className="text-xs text-white/45">Webhook URL</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-3 py-2 text-xs">{`${window.location.origin}/api/agents/webhook/${agent.id}`}</code>
              <button onClick={onCopy} className="rounded-lg bg-white/[.08] px-3 py-2 text-xs hover:bg-white/[.12]">{copied ? 'Copied' : <Copy size={14}/>}</button>
            </div>
          </div>}
        </div>}

        {tab === 'logs' && <div className="max-h-[420px] overflow-y-auto pr-1">
          {logs.length === 0 && <p className="text-sm text-white/45">{agent.trigger.type === 'schedule' ? `Agent will run ${agent.trigger.nextRun ? formatRelative(agent.trigger.nextRun) : 'soon'} — Scheduler active` : 'No logs yet. Trigger the webhook to run.'}</p>}
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-3 rounded-xl border border-white/[.08] bg-white/[.04] p-3 text-xs">
                {log.status === 'success' ? <CheckCircle2 size={14} className="text-emerald-400"/> : <X size={14} className="text-red-400"/>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="font-medium uppercase">{log.connectorType}</span><span className="text-white/40">{new Date(log.createdAt).toLocaleString()}</span></div>
                  <p className="mt-0.5 text-white/70 line-clamp-2">{log.content || 'No content'}</p>
                  {log.error && <p className="mt-1 text-red-300">{log.error}</p>}
                  {log.response && <p className="mt-1 text-emerald-300">{log.response}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>}

        {tab === 'executions' && <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {agent.executionHistory.length === 0 && <p className="text-sm text-white/45">No executions yet.</p>}
          {agent.executionHistory.map(exec => (
            <div key={exec.id} className="flex items-start gap-3 rounded-xl border border-white/[.08] bg-white/[.04] p-3 text-xs">
              {exec.status === 'success' ? <CheckCircle2 size={14} className="text-emerald-400"/> : exec.status === 'skipped' ? <Pause size={14} className="text-amber-400"/> : <X size={14} className="text-red-400"/>}
              <div>
                <p className="font-medium">{new Date(exec.at).toLocaleString()}</p>
                <p className="mt-0.5 text-white/55">{exec.log}</p>
                <p className="mt-1 text-white/40">Duration: {exec.duration}ms</p>
              </div>
            </div>
          ))}
        </div>}

        {tab === 'settings' && <div className="space-y-3">
          <button onClick={onToggle} className="flex w-full items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.04] px-4 py-3 text-left text-sm hover:bg-white/[.08]">
            {agent.status === 'running' || agent.status === 'active' || agent.status === 'warning' ? <Pause size={16}/> : <Play size={16}/>}
            {agent.status === 'running' || agent.status === 'active' || agent.status === 'warning' ? 'Pause agent' : 'Resume agent'}
          </button>
          <button onClick={onRun} className="flex w-full items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.04] px-4 py-3 text-left text-sm hover:bg-white/[.08]"><RefreshCw size={16}/> Run now</button>
          <button onClick={() => { const copy = { ...agent, id: randomUUID(), name: agent.name + ' copy', status: 'running', createdAt: new Date().toISOString(), executionHistory: [], successRate: 100 }; saveAgent(copy); onClose() }} className="flex w-full items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.04] px-4 py-3 text-left text-sm hover:bg-white/[.08]"><Plus size={16}/> Duplicate</button>
          <button onClick={onDelete} className="flex w-full items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-sm text-red-400 hover:bg-red-500/20"><Trash2 size={16}/> Delete agent</button>
        </div>}
      </div>
    </div>
  </div>
}

function UpgradeModal({ message, onUpgrade, onBuyCredits, onCancel, buying }: { message: string; onUpgrade: () => void; onBuyCredits: () => void; onCancel: () => void; buying: boolean }) {
  const pro = getPlan('pro_early_access')
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onCancel}>
    <div className="w-full max-w-md rounded-3xl border border-white/[.12] bg-background p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">You've reached your plan limit</h2>
          <p className="mt-1 text-sm text-white/55">{message}</p>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-violet-400"/> {pro.name} <span className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-0.5 text-[10px] text-black">Most Popular</span></div>
        <p className="mt-2 text-2xl font-semibold">{formatCurrency(pro.priceKobo)}<span className="text-sm font-normal text-white/55">/month</span></p>
        <ul className="mt-2 space-y-1 text-xs text-white/55">
          {pro.features.map((f, i) => <li key={i} className="flex items-start gap-1.5"><CheckCircle2 size={12} className="mt-0.5 text-violet-400"/> {f}</li>)}
        </ul>
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <button onClick={onUpgrade} disabled={buying} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl btn-alpha px-4 text-sm font-medium text-white transition-all disabled:opacity-50">{buying ? <LoaderCircle className="animate-spin" size={16}/> : <Zap size={16}/>} Upgrade to Pro Early Access</button>
        <button onClick={onBuyCredits} disabled={buying} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[.12] bg-white/[.04] px-4 text-sm font-medium text-white transition-all hover:bg-white/[.08]">Buy Credits</button>
        <button onClick={onCancel} className="min-h-11 rounded-xl border border-white/[.12] bg-transparent px-4 text-sm font-medium text-white/70 transition-all hover:bg-white/[.04]">Cancel</button>
      </div>
    </div>
  </div>
}
