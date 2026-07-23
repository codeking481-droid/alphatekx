import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, LoaderCircle, Send, Sparkles, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import CampaignPreview from '../components/agents/CampaignPreview'
import WorkflowPlan from '../components/agents/WorkflowPlan'
import { saveAgent, useAgents } from '../lib/agents/agentStore'
import type { Agent } from '../lib/agents/types'
import { useAuth } from '../lib/auth'
import { getCredits } from '../lib/creditStore'
import { getIntegrationStatus, getLocalUser, type IntegrationStatus } from '../lib/integrations'

type ConversationMessage = { role: 'user' | 'alpha' | 'system'; text: string; ts: string; generatedCount?: number; totalCredits?: number }
type AlphaConversation = {
  id: string
  messages: ConversationMessage[]
  conversationStage: string
  knownFields: Record<string, unknown>
  missingFields: { field: string; question: string; reason: string; required: boolean }[]
  pendingConnections: string[]
  automationDraft: Agent | null
}
type CreationSuccess = { id: string; name: string }

const CONVERSATION_KEY = 'alphatekx:planning-conversation'
const PROMPT_KEY = 'alphatekx:planning-prompt'
const SUCCESS_KEY = 'alphatekx:creation-success'
const examples = [
  'Post useful Python content on LinkedIn every Monday.',
  'Send me my calendar every morning.',
  'Publish educational content three times every week.',
]

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 90_000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try { return await fetch(input, { ...init, signal: controller.signal }) }
  finally { window.clearTimeout(timer) }
}

function readStored<T>(key: string): T | null {
  try { const value = sessionStorage.getItem(key); return value ? JSON.parse(value) as T : null } catch { return null }
}

export default function Agents() {
  const { user, session } = useAuth()
  const agents = useAgents()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [input, setInput] = useState(() => sessionStorage.getItem(PROMPT_KEY) || '')
  const [conversation, setConversation] = useState<AlphaConversation | null>(() => readStored(CONVERSATION_KEY))
  const [pendingAgent, setPendingAgent] = useState<Agent | null>(() => readStored('alphatekx:pending-agent'))
  const [success, setSuccess] = useState<CreationSuccess | null>(() => readStored(SUCCESS_KEY))
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>({})
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')
  const composer = useRef<HTMLTextAreaElement>(null)
  const isAdmin = user?.email?.toLowerCase() === 'iamdan4live@gmail.com'

  const authHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {}
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    const local = getLocalUser()
    if (local) { headers['x-local-user-id'] = local.id; headers['x-local-user-email'] = local.email }
    return headers
  }

  const refreshConnections = async () => {
    try { setIntegrationStatus(await getIntegrationStatus(session?.access_token)) } catch {}
  }

  useEffect(() => { void refreshConnections() }, [session?.access_token])
  useEffect(() => {
    if (conversation) sessionStorage.setItem(CONVERSATION_KEY, JSON.stringify(conversation))
    else sessionStorage.removeItem(CONVERSATION_KEY)
  }, [conversation])
  useEffect(() => {
    if (pendingAgent) sessionStorage.setItem('alphatekx:pending-agent', JSON.stringify(pendingAgent))
    else sessionStorage.removeItem('alphatekx:pending-agent')
  }, [pendingAgent])
  useEffect(() => {
    if (success) sessionStorage.setItem(SUCCESS_KEY, JSON.stringify(success))
    else sessionStorage.removeItem(SUCCESS_KEY)
  }, [success])
  useEffect(() => { sessionStorage.setItem(PROMPT_KEY, input) }, [input])
  useEffect(() => {
    const prompt = searchParams.get('prompt')
    const automationId = searchParams.get('id')
    if (automationId) {
      const existing = agents.find(agent => agent.id === automationId)
      if (existing) setPendingAgent(existing)
    }
    if (prompt && !conversation) { setInput(prompt); composer.current?.focus() }
    if (searchParams.get('connected')) { void refreshConnections(); setNotice('Connection restored. Your planning conversation is still here.') }
  }, [searchParams, agents])

  const clearPlanning = () => {
    setConversation(null)
    setPendingAgent(null)
    setInput('')
    sessionStorage.removeItem(CONVERSATION_KEY)
    sessionStorage.removeItem('alphatekx:pending-agent')
    sessionStorage.removeItem(PROMPT_KEY)
  }

  const startNew = () => {
    clearPlanning()
    setSuccess(null)
    setNotice('')
    window.setTimeout(() => composer.current?.focus(), 0)
  }

  const acceptConversation = (data: Record<string, unknown>) => {
    const next = (data.conversation || data) as AlphaConversation
    setConversation(next)
    setPendingAgent((next.automationDraft || data.agent || null) as Agent | null)
  }

  const send = async () => {
    const message = input.trim()
    if (!message || creating) return
    setCreating(true)
    setNotice('')
    setInput('')
    try {
      const endpoint = conversation?.id ? `/api/alpha/conversation/${encodeURIComponent(conversation.id)}` : '/api/alpha/conversation'
      const body = conversation?.id ? { message } : { prompt: message }
      const response = await fetchWithTimeout(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Alpha could not continue the plan.')
      acceptConversation(data)
    } catch (error) {
      setInput(message)
      setNotice(error instanceof DOMException && error.name === 'AbortError' ? 'Alpha took too long to respond. Your message is saved—please retry.' : error instanceof Error ? error.message : 'Could not reach Alpha.')
    } finally { setCreating(false) }
  }

  const created = (agent: Agent) => {
    const result = { id: agent.id, name: agent.name || 'Automation' }
    clearPlanning()
    setSuccess(result)
    setNotice('')
  }

  const approveGeneral = async (agent: Agent) => {
    await saveAgent(agent)
    created(agent)
  }

  const needsConnection = conversation?.pendingConnections?.[0] || pendingAgent?.missing?.find(item => item.field === 'connection')?.connector

  return <main className="flex min-h-[calc(100dvh-8rem)] w-full flex-col px-3 py-5 sm:px-6 lg:min-h-[calc(100dvh-4rem)] lg:py-8">
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
      <header className="shrink-0 py-4 text-center sm:py-7">
        <p className="text-xs font-medium uppercase tracking-[.24em] text-violet-300">Run your automations 24/7</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Turn Your Ideas Into Reality</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/58 sm:text-base">Tell Alpha what you want done. It will plan an automation that keeps working even when you are offline.</p>
      </header>

      {success && !conversation ? <section className="my-auto rounded-3xl border border-emerald-400/20 bg-emerald-500/[.08] p-7 text-center sm:p-10" aria-live="polite">
        <CheckCircle2 className="mx-auto text-emerald-300" size={34}/>
        <h2 className="mt-4 text-xl font-semibold">Automation created successfully.</h2>
        <p className="mt-2 text-sm text-white/60">Your automation is now available in Active Automations.</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><button onClick={() => navigate(`/active-automations/${success.id}`)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl btn-alpha px-5 text-sm">View Automation<ArrowRight size={16}/></button><button onClick={startNew} className="min-h-12 rounded-xl border border-white/10 px-5 text-sm hover:bg-white/[.05]">Start another automation</button></div>
      </section> : <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-white/[.09] bg-white/[.035] shadow-2xl shadow-violet-950/20">
        <div className="flex items-center justify-between border-b border-white/[.07] px-4 py-3 sm:px-6"><div className="flex items-center gap-2 text-sm font-medium"><span className="grid size-8 place-items-center rounded-full bg-violet-500/15"><Sparkles size={16} className="text-violet-300"/></span>Plan with Alpha</div>{conversation && <button onClick={startNew} className="rounded-lg px-3 py-2 text-xs text-white/50 hover:bg-white/[.05]">New automation</button>}</div>
        <div className="min-h-[260px] flex-1 overflow-y-auto px-4 py-6 sm:px-7" aria-live="polite">
          {!conversation ? <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center py-8 text-center"><h2 className="text-xl font-medium sm:text-2xl">What would you like Alpha to automate?</h2><p className="mt-3 text-sm text-white/50">{agents.length === 0 ? 'No automations yet. Describe the result you want and Alpha will ask only what is missing.' : 'Describe the result you want. Alpha will ask only what is missing.'}</p><div className="mt-7 grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">{examples.map(example => <button key={example} onClick={() => { setInput(example); composer.current?.focus() }} className="rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-3 text-left text-sm text-white/65 transition hover:border-violet-400/30 hover:bg-white/[.055]">{example}</button>)}</div></div> : <div className="space-y-5">{conversation.messages?.map((message, index) => <div key={`${message.ts}-${index}`} className={message.role === 'user' ? 'ml-auto max-w-[88%]' : 'max-w-[92%]'}><div className={message.role === 'user' ? 'rounded-2xl rounded-br-md bg-violet-500 px-4 py-3 text-sm leading-6' : 'text-sm leading-7 text-white/82'}>{message.role === 'alpha' && <p className="mb-1 text-xs font-medium text-violet-300">Alpha</p>}<p className="whitespace-pre-wrap">{message.text}</p></div></div>)}{creating && <div className="flex items-center gap-2 text-sm text-white/45"><LoaderCircle className="animate-spin" size={16}/>Alpha is preparing the next step…</div>}</div>}
        </div>
        {needsConnection && <div className="mx-4 mb-3 rounded-xl border border-amber-400/20 bg-amber-500/[.08] p-4 text-sm sm:mx-6"><p className="text-amber-100">{needsConnection} needs to be connected before Alpha can publish.</p><Link to={`/connected-apps?platform=${encodeURIComponent(needsConnection)}&returnTo=${encodeURIComponent(`/automations?resume=${conversation?.id || ''}`)}`} className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-amber-300 px-4 text-xs font-medium text-zinc-950">Connect {needsConnection}</Link></div>}
        {notice && <div role="alert" className="mx-4 mb-3 flex items-start justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100 sm:mx-6"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss error"><X size={16}/></button></div>}
        <div className="border-t border-white/[.07] p-3 sm:p-4"><label htmlFor="automation-request" className="sr-only">{conversation ? 'Answer Alpha' : 'Describe what you want Alpha to automate'}</label><div className="flex items-end gap-2 rounded-2xl border border-white/[.1] bg-black/10 p-2 focus-within:border-violet-400/45"><textarea id="automation-request" ref={composer} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} rows={2} maxLength={10000} placeholder={conversation ? 'Answer Alpha…' : 'Tell Alpha what you want done…'} className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-6 outline-none placeholder:text-white/30"/><button onClick={() => void send()} disabled={!input.trim() || creating} className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-500 text-white transition hover:bg-violet-400 disabled:opacity-35" aria-label="Send request">{creating ? <LoaderCircle className="animate-spin" size={18}/> : <Send size={18}/>}</button></div><p className="mt-2 px-2 text-[11px] text-white/35">Press Enter to send. Shift + Enter adds a new line.</p></div>
      </section>}
    </div>

    {pendingAgent?.type === 'campaign' && <CampaignPreview agent={pendingAgent} integrationStatus={integrationStatus} credits={getCredits()} isAdmin={isAdmin} authHeaders={authHeaders} onClose={() => setPendingAgent(null)} onActivated={created}/>}
    {pendingAgent && pendingAgent.type !== 'campaign' && <WorkflowPlan agent={pendingAgent} integrationStatus={integrationStatus} credits={getCredits()} isAdmin={isAdmin} onClose={() => setPendingAgent(null)} onApprove={approveGeneral}/>}
  </main>
}
