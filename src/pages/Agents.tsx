import { useEffect, useRef, useState } from 'react'
import { isAdminUser } from '../lib/adminAccess'
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Edit3, LoaderCircle, Send, Sparkles, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import CampaignPreview from '../components/agents/CampaignPreview'
import WorkflowPlan from '../components/agents/WorkflowPlan'
import { getAgents, setCache, useAgents } from '../lib/agents/agentStore'
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
type CreationSuccess = { id: string; name: string; message?: string }

const CONVERSATION_KEY = 'alphatekx:planning-conversation:v2'
const PROMPT_KEY = 'alphatekx:planning-prompt:v2'
const SUCCESS_KEY = 'alphatekx:creation-success:v2'
const PENDING_KEY = 'alphatekx:pending-agent:v2'
const PLANNING_OWNER_KEY = 'alphatekx:planning-owner:v2'
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
  const [pendingAgent, setPendingAgent] = useState<Agent | null>(() => readStored(PENDING_KEY))
  const [success, setSuccess] = useState<CreationSuccess | null>(() => readStored(SUCCESS_KEY))
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>({})
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')
  const composer = useRef<HTMLTextAreaElement>(null)
  const isAdmin = isAdminUser(user)

  const authHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {}
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    const local = getLocalUser()
    if (!session?.access_token && local) { headers['x-local-user-id'] = local.id; headers['x-local-user-email'] = local.email }
    return headers
  }

  const refreshConnections = async () => {
    try { setIntegrationStatus(await getIntegrationStatus(session?.access_token)) } catch {}
  }

  useEffect(() => {
    void refreshConnections()
    const refresh = () => void refreshConnections()
    const timer = window.setInterval(refresh, 5_000)
    window.addEventListener('focus', refresh)
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [session?.access_token])
  useEffect(() => {
    if (!user?.id) return
    const owner = sessionStorage.getItem(PLANNING_OWNER_KEY)
    if (owner && owner !== user.id) {
      clearPlanning()
      setSuccess(null)
    }
    sessionStorage.setItem(PLANNING_OWNER_KEY, user.id)
  }, [user?.id])
  useEffect(() => {
    for (const key of ['alphatekx:planning-conversation', 'alphatekx:planning-prompt', 'alphatekx:creation-success', 'alphatekx:pending-agent']) sessionStorage.removeItem(key)
  }, [])
  useEffect(() => {
    if (conversation) sessionStorage.setItem(CONVERSATION_KEY, JSON.stringify(conversation))
    else sessionStorage.removeItem(CONVERSATION_KEY)
  }, [conversation])
  useEffect(() => {
    if (pendingAgent) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pendingAgent))
    else sessionStorage.removeItem(PENDING_KEY)
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
    sessionStorage.removeItem(PENDING_KEY)
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

  const send = async (overrideMessage?: string) => {
    const message = String(overrideMessage ?? input).trim()
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
      const next = (data.conversation || data) as AlphaConversation
      if (next.conversationStage === 'created' && next.automationDraft) {
        const agent = next.automationDraft
        setCache([agent, ...getAgents().filter(item => item.id !== agent.id)])
        created(agent)
      } else {
        acceptConversation(data)
      }
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
    if (!conversation?.id || creating) return
    setCreating(true)
    setNotice('')
    try {
      const whatsappAction = agent.actions.find(action => action.connector === 'whatsapp' && action.action === 'send_message')
      if (whatsappAction) {
        const response = await fetchWithTimeout('/api/connectors/whatsapp/test-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ recipient: whatsappAction.params.to || whatsappAction.params.phone, approved: true, idempotencyKey: `${conversation.id}:whatsapp-first-message` }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data.ok) throw new Error(data.message || data.error || 'WhatsApp could not send this test message. Your credits were not charged.')
        clearPlanning()
        setSuccess({ id: '', name: 'WhatsApp first message', message: 'Message accepted by WhatsApp.' })
        return
      }
      const response = await fetchWithTimeout(`/api/alpha/conversation/${encodeURIComponent(conversation.id)}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({}),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.agent) throw new Error(data.error || 'We could not create this automation. Please try again. Your credits were not charged.')
      const saved = data.agent as Agent
      setCache([saved, ...getAgents().filter(item => item.id !== saved.id)])
      created(saved)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'We could not create this automation. Please try again. Your credits were not charged.')
    } finally {
      setCreating(false)
    }
  }

  const needsConnection = conversation?.pendingConnections?.[0] || pendingAgent?.missing?.find(item => item.field === 'connection')?.connector
  const guidedPlatform = searchParams.get('platform')

  if (!conversation && !pendingAgent && !success && guidedPlatform) {
    return <GuidedCommandCentre platform={guidedPlatform} creating={creating} notice={notice} onComplete={message => void send(message)} onBack={() => navigate('/dashboard')} />
  }

  return <main className="flex min-h-[calc(100dvh-8rem)] w-full flex-col px-3 py-5 sm:px-6 lg:min-h-[calc(100dvh-4rem)] lg:py-8">
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
      <header className="shrink-0 py-4 text-center sm:py-7">
        <p className="text-xs font-medium uppercase tracking-[.24em] text-violet-300">Run your automations 24/7</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Turn Your Ideas Into Reality</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/58 sm:text-base">Tell Alpha what you want done. It will plan an automation that keeps working even when you are offline.</p>
      </header>

      {success && !conversation ? <section className="my-auto rounded-3xl border border-emerald-400/20 bg-emerald-500/[.08] p-7 text-center sm:p-10" aria-live="polite">
        <CheckCircle2 className="mx-auto text-emerald-300" size={34}/>
        <h2 className="mt-4 text-xl font-semibold">{success.message || 'Automation created successfully.'}</h2>
        {success.id && <button onClick={() => navigate(`/active-automations/${success.id}`)} className="mx-auto mt-6 flex min-h-12 items-center justify-center gap-2 rounded-xl btn-alpha px-5 text-sm">Visit Automation<ArrowRight size={16}/></button>}
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

type GuidedPlan = {
  platform: string
  days: string
  time: string
  duration: string
  topic: string
}

function GuidedCommandCentre({ platform, creating, notice, onComplete, onBack }: { platform: string; creating: boolean; notice: string; onComplete: (message: string) => void; onBack: () => void }) {
  const platformName = platform === 'x' ? 'Twitter / X' : platform.charAt(0).toUpperCase() + platform.slice(1)
  const [step, setStep] = useState(0)
  const [plan, setPlan] = useState<GuidedPlan>({ platform: platformName, days: '', time: '', duration: '', topic: '' })
  const [custom, setCustom] = useState('')
  const [editing, setEditing] = useState(false)

  const questions = [
    { title: 'What platform did you connect?', subtitle: 'I will build this job only for the account you just connected.' },
    { title: 'What days should it run?', subtitle: 'For consistent growth, weekdays are a strong place to start.' },
    { title: 'What time should it run?', subtitle: platform === 'linkedin' ? '9am is often effective for professional audiences. Use it?' : '9am keeps a simple, predictable publishing rhythm. Use it?' },
    { title: 'How long should Alpha run this job?', subtitle: 'Choose a clear duration. You can extend it later.' },
    { title: 'What should the content be about?', subtitle: 'Give Alpha a topic, offer, audience, or goal. Alpha will create fresh captions.' },
  ]

  const choose = (field: keyof GuidedPlan, value: string) => {
    setPlan(current => ({ ...current, [field]: value }))
    setCustom('')
    setStep(current => Math.min(5, current + 1))
  }

  const scheduleDays = plan.days === 'Every day' ? 7 : plan.days === 'Mon–Fri' ? 5 : Math.max(1, plan.days.split(',').length)
  const durationNumber = Number.parseInt(plan.duration, 10) || (plan.duration.includes('month') ? 30 : 7)
  const totalPosts = Math.max(1, Math.ceil(durationNumber / 7) * scheduleDays)
  const estimatedCredits = totalPosts * 2
  const topic = plan.topic || 'your business'
  const sampleCaptions = [
    `A better result starts with one clear decision. Here is what ${topic} can make possible this week.`,
    `Most people overcomplicate ${topic}. Start with the outcome, keep the process simple, and improve consistently.`,
  ]

  const submitCustom = () => {
    if (!custom.trim()) return
    const field = step === 2 ? 'time' : step === 3 ? 'duration' : step === 4 ? 'topic' : 'days'
    choose(field, custom.trim())
  }

  const approve = () => {
    const message = `Create one ${platformName} content automation. Run it on ${plan.days} at ${plan.time} for ${plan.duration}. The topic is: ${plan.topic}. Generate a unique caption for every scheduled post, compare against the last 10 published posts, never repeat a caption, and require my explicit approval before scheduling. Expected total posts: ${totalPosts}.`
    onComplete(message)
  }

  return (
    <main className="min-h-[calc(100dvh-8rem)] bg-white px-4 py-8 sm:px-6 lg:min-h-[calc(100dvh-4rem)] lg:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-[#6D28D9]">Command Centre</p><h1 className="mt-3 text-4xl font-black tracking-[-.05em] text-slate-900 sm:text-6xl">Plan with Alpha</h1><p className="mx-auto mt-4 max-w-2xl text-base font-semibold text-slate-500">One question at a time. Nothing runs until you approve the complete plan.</p></header>

        {step < 5 ? (
          <section className="mx-auto mt-10 max-w-3xl rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_30px_75px_rgba(15,23,42,.14)] sm:p-9">
            <div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-[.16em] text-[#6D28D9]">Question {step + 1} of 5</span><span className="text-xs font-black text-slate-400">{Math.round(((step + 1) / 5) * 100)}%</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#6D28D9] transition-all" style={{ width: `${((step + 1) / 5) * 100}%` }}/></div>
            <h2 className="mt-8 text-2xl font-black tracking-[-.03em] text-slate-900 sm:text-3xl">{questions[step].title}</h2>
            <p className="mt-3 font-semibold leading-7 text-slate-500">{questions[step].subtitle}</p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {step === 0 && <button onClick={() => choose('platform', platformName)} className="col-span-full flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#6D28D9] font-black text-white shadow-lg shadow-violet-200"><CheckCircle2 size={18}/>{platformName} is connected</button>}
              {step === 1 && ['Mon–Fri', 'Every day', 'Custom'].map(value => <button key={value} onClick={() => value === 'Custom' ? setCustom('') : choose('days', value)} className="min-h-14 rounded-xl border-2 border-slate-200 bg-white font-black text-slate-800 transition hover:border-violet-300 hover:bg-violet-50">{value}{value === 'Mon–Fri' && <span className="ml-2 text-xs text-[#6D28D9]">Suggested</span>}</button>)}
              {step === 2 && <><button onClick={() => choose('time', '9:00 AM')} className="min-h-14 rounded-xl bg-[#6D28D9] font-black text-white shadow-lg shadow-violet-200">Yes, use 9am</button><button onClick={() => setCustom('')} className="min-h-14 rounded-xl border-2 border-slate-200 bg-white font-black text-slate-800">Choose different</button></>}
              {step === 3 && ['7 days', '14 days', '30 days', 'Custom'].map(value => <button key={value} onClick={() => value === 'Custom' ? setCustom('') : choose('duration', value)} className="min-h-14 rounded-xl border-2 border-slate-200 bg-white font-black text-slate-800 transition hover:border-violet-300 hover:bg-violet-50">{value}</button>)}
              {step === 4 && <><button onClick={() => setCustom('AlphaTekx, intelligent automation, and helping small businesses save time')} className="col-span-full min-h-14 rounded-xl border-2 border-violet-200 bg-violet-50 px-4 text-left font-black text-[#6D28D9]">Suggest a strong content direction for me</button></>}
            </div>

            {((step === 1 && !plan.days) || step === 2 || step === 3 || step === 4) && (
              <div className="mt-5 flex gap-2"><input value={custom} onChange={event => setCustom(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitCustom()} placeholder={step === 2 ? 'e.g. 2:30 PM' : step === 3 ? 'e.g. 2 months' : step === 4 ? 'Describe your topic or audience' : 'e.g. Monday, Wednesday, Friday'} className="min-h-14 flex-1 rounded-xl border-2 border-slate-200 px-4 font-bold text-slate-900 outline-none focus:border-[#6D28D9] focus:ring-4 focus:ring-violet-100"/><button onClick={submitCustom} disabled={!custom.trim()} className="rounded-xl bg-[#6D28D9] px-5 font-black text-white disabled:opacity-40"><ArrowRight/></button></div>
            )}
            <button onClick={() => step === 0 ? onBack() : setStep(value => value - 1)} className="mt-7 text-sm font-black text-slate-400 hover:text-[#6D28D9]">← Back</button>
          </section>
        ) : (
          <section className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_30px_75px_rgba(15,23,42,.14)]">
            <div className="bg-[#6D28D9] p-7 text-white sm:p-9"><p className="text-xs font-black uppercase tracking-[.18em] text-violet-200">Plan preview</p><h2 className="mt-3 text-3xl font-black tracking-[-.04em]">Your automation is ready to review.</h2></div>
            <div className="grid gap-7 p-6 sm:p-9 lg:grid-cols-[.85fr_1.15fr]">
              <div className="grid content-start gap-3">
                {[['Platform', plan.platform], ['Days', plan.days], ['Time', plan.time], ['Duration', plan.duration], ['Total posts', String(totalPosts)], ['Estimated cost', `${estimatedCredits} credits`]].map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-sm font-bold text-slate-500">{label}</span><span className="text-sm font-black text-slate-900">{value}</span></div>)}
              </div>
              <div><p className="text-xs font-black uppercase tracking-[.16em] text-[#6D28D9]">Two sample directions</p><div className="mt-3 space-y-3">{sampleCaptions.map((caption, index) => <div key={caption} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-black text-violet-400">SAMPLE {index + 1}</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{caption}</p></div>)}</div><p className="mt-3 text-xs font-bold text-slate-400">Alpha checks the last 10 posts before generating each live caption.</p></div>
            </div>
            {notice && <p className="mx-6 mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700 sm:mx-9">{notice}</p>}
            <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 p-6 sm:flex-row sm:justify-end sm:p-7"><button onClick={() => { setStep(0); setEditing(!editing) }} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-6 font-black text-slate-800"><Edit3 size={17}/>Edit</button><button onClick={approve} disabled={creating} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-[#6D28D9] px-7 font-black text-white shadow-[0_14px_32px_rgba(109,40,217,.28)] disabled:opacity-50">{creating ? <LoaderCircle className="animate-spin" size={18}/> : <><CalendarDays size={18}/>Approve & Schedule</>}</button></div>
          </section>
        )}
        <div className="mt-7 flex items-center justify-center gap-5 text-xs font-bold text-slate-400"><span className="flex items-center gap-1.5"><Clock3 size={14}/>Alpha never chooses your schedule</span><span className="flex items-center gap-1.5"><CheckCircle2 size={14}/>Approval required</span></div>
      </div>
    </main>
  )
}

