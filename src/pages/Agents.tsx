import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Download, Edit3, ExternalLink, Image, Linkedin, LoaderCircle, Mic, MicOff, Plug, Send, Sparkles, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { getAgents, setCache, useAgents } from '../lib/agents/agentStore'
import type { Agent } from '../lib/agents/types'
import { useAuth } from '../lib/auth'
import { getIntegrationStatus, startLinkedInAuth, type IntegrationStatus } from '../lib/integrations'
import { getConnectedApps } from '../lib/connectors/connectorApi'
import { getJson, postJson } from '../lib/apiClient'
import VideoBuildGlassContainer from '../components/VideoBuildGlassContainer'

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
type SpeechResultEvent = { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }
type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((event: SpeechResultEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null }

const CONVERSATION_KEY = 'alphatekx:planning-conversation:v2'
const PROMPT_KEY = 'alphatekx:planning-prompt:v2'
const SUCCESS_KEY = 'alphatekx:creation-success:v2'
const PENDING_KEY = 'alphatekx:pending-agent:v2'
const PLANNING_OWNER_KEY = 'alphatekx:planning-owner:v2'
const examples = [
  { title: 'Publish one professional post', prompt: 'Create one professional LinkedIn post with a matched image. Show me the post and image for review before publishing.' },
  { title: 'Launch a social campaign', prompt: 'Promote my business on LinkedIn with unique posts and matched images. Ask me for the schedule and show everything for review.' },
  { title: 'Create a premium image', prompt: 'Create a premium professional image for my business and save it to my Media Library.' },
  { title: 'Build a weekly schedule', prompt: 'Create a weekly social media schedule for my business. Ask me which platforms, days, time, audience, and tone.' },
  { title: 'Send a useful email', prompt: 'Help me create and send a professional email. Ask for the recipient, subject, and message before sending.' },
  { title: 'Summarize my calendar', prompt: 'Send me a useful summary of my connected calendar every morning. Ask me what time to use.' },
]

const socialConnections = [
  { id: 'linkedin', name: 'LinkedIn Native', icon: 'linkedin' },
  { id: 'gmail', name: 'Gmail', icon: 'gmail' },
  { id: 'discord', name: 'Discord', icon: 'discord' },
  { id: 'github', name: 'GitHub', icon: 'github' },
  { id: 'googledocs', name: 'Google Docs', icon: 'docs' },
  { id: 'googlesheets', name: 'Google Sheets', icon: 'sheets' },
] as const

function noticeClasses(notice: string) {
  const isProgress = /\b(queued|reviewing|continuing|processing|thinking|working|preparing)\b/i.test(notice)
  return isProgress
    ? 'border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-100 shadow-[0_10px_30px_rgba(16,185,129,0.08)]'
    : 'border-red-500/30 bg-red-500/[0.04] text-red-200'
}

function readStored<T>(key: string): T | null {
  try { const value = sessionStorage.getItem(key); return value ? JSON.parse(value) as T : null } catch { return null }
}

export default function Agents() {
  const { user, session } = useAuth()
  const agents = useAgents()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [input, setInput] = useState(() => sessionStorage.getItem(PROMPT_KEY) || '')
  const [conversation, setConversation] = useState<AlphaConversation | null>(() => readStored(CONVERSATION_KEY))
  const [pendingAgent, setPendingAgent] = useState<Agent | null>(() => readStored(PENDING_KEY))
  const [success, setSuccess] = useState<CreationSuccess | null>(() => readStored(SUCCESS_KEY))
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>({} as IntegrationStatus)
  const [creating, setCreating] = useState(false)
  const [jobId, setJobId] = useState<string | null>(() => sessionStorage.getItem('alphatekx:planning-job'))
  const [notice, setNotice] = useState('')
  const [listening, setListening] = useState(false)
  const [videoPrompt, setVideoPrompt] = useState('')
  const composer = useRef<HTMLTextAreaElement>(null)
  const speech = useRef<SpeechRecognitionLike | null>(null)
  const messageEnd = useRef<HTMLDivElement>(null)
  const linkedIn = integrationStatus.linkedin && 'connected' in integrationStatus.linkedin ? integrationStatus.linkedin : undefined
  const linkedInReady = linkedIn?.connected === true && linkedIn?.ready === true

  const refreshConnections = async () => {
    const [legacyResult, connectedAppsResult] = await Promise.allSettled([
      getIntegrationStatus(session?.access_token),
      getConnectedApps(session?.access_token),
    ])
    const merged = legacyResult.status === 'fulfilled'
      ? { ...legacyResult.value }
      : ({} as IntegrationStatus)

    if (connectedAppsResult.status === 'fulfilled') {
      for (const provider of connectedAppsResult.value.providers || []) {
        const id = provider.provider
        const previous = merged[id]
        merged[id] = {
          ...(previous && 'connected' in previous ? previous : { connected: false }),
          connected: provider.connected === true,
          ready: provider.ready === true || provider.status === 'connected' || provider.status === 'active',
        }
      }
    }
    setIntegrationStatus(merged)
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
    if (jobId) sessionStorage.setItem('alphatekx:planning-job', jobId)
    else sessionStorage.removeItem('alphatekx:planning-job')
  }, [jobId])
  useEffect(() => {
    if (success) sessionStorage.setItem(SUCCESS_KEY, JSON.stringify(success))
    else sessionStorage.removeItem(SUCCESS_KEY)
  }, [success])
  useEffect(() => { sessionStorage.setItem(PROMPT_KEY, input) }, [input])
  useEffect(() => { messageEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [conversation?.messages?.length, creating])
  useEffect(() => {
    if (searchParams.get('linkedin') === 'connected') {
      setNotice('LinkedIn connected')
      const next = new URLSearchParams(searchParams)
      next.delete('linkedin')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

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
    if (composer.current) composer.current.style.height = 'auto'
    setJobId(null)
    sessionStorage.removeItem(CONVERSATION_KEY)
    sessionStorage.removeItem(PENDING_KEY)
    sessionStorage.removeItem(PROMPT_KEY)
    sessionStorage.removeItem('alphatekx:planning-job')
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
    if (/\b(?:create|generate|make)\s+(?:a\s+)?(?:\d+\s*(?:min|minute)\s+)?(?:mrbeast[-\s]style\s+)?video\b/i.test(message)) {
      setVideoPrompt(message)
      setInput('')
      if (composer.current) composer.current.style.height = 'auto'
      setNotice('Glass Studio is building your video server-side.')
      return
    }
    setCreating(true)
    setNotice(conversation?.id ? 'Alpha is continuing your plan…' : 'Alpha is reviewing your request…')
    setInput('')
    if (composer.current) composer.current.style.height = 'auto'
    try {
      const action = conversation?.id ? 'continue' : 'start'
      const body = {
        action,
        prompt: conversation?.id ? undefined : message,
        message: conversation?.id ? message : undefined,
        conversationId: conversation?.id,
      }
      const data = await postJson<Record<string, unknown>>('/api/alpha/jobs', body)
      if (data.immediate === true || data.conversation) {
        acceptConversation(data)
        setCreating(false)
        setNotice('')
        return
      }
      const job = data.job as { jobId: string }
      if (job?.jobId) {
        setJobId(job.jobId)
      }
    } catch (error) {
      setInput(message)
      setNotice(error instanceof Error ? error.message : 'Could not reach Alpha.')
      setCreating(false)
    }
  }

  const toggleVoice = () => {
    if (listening) { speech.current?.stop(); return }
    const browser = window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition
    if (!Recognition) { setNotice('Voice input is not supported by this browser. You can still type your request.'); return }
    const recognition = new Recognition()
    recognition.lang = navigator.language || 'en-NG'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.onresult = event => {
      const spoken = Array.from(event.results).map(result => result[0]?.transcript || '').join(' ').trim()
      setInput(spoken)
      const final = Array.from(event.results).every(result => result.isFinal)
      if (final && spoken) { recognition.stop(); void send(spoken) }
    }
    recognition.onerror = () => { setListening(false); setNotice('Alpha could not hear clearly. Tap the microphone and try again.') }
    recognition.onend = () => setListening(false)
    speech.current = recognition
    setListening(true)
    setNotice('Listening… Speak naturally. Alpha will send when you finish.')
    recognition.start()
  }

  const created = (agent: Agent) => {
    const result = { id: agent.id, name: agent.name || 'Automation' }
    clearPlanning()
    setSuccess(result)
    setNotice('')
  }

  useEffect(() => {
    if (!jobId) return
    let active = true
    const interval = window.setInterval(async () => {
      try {
        const data = await getJson<Record<string, unknown>>(`/api/alpha/jobs/${encodeURIComponent(jobId)}`)
        const job = data.job as { status: string; result?: Record<string, unknown>; error?: string; warning?: string }
        if (!active || !job) return
        setNotice(job.warning || (job.status === 'running' ? 'Alpha is processing your request…' : job.status === 'queued' ? 'Alpha has queued your request.' : ''))
        if (job.status === 'completed' || job.status === 'failed') {
          window.clearInterval(interval)
          setJobId(null)
          setCreating(false)
          if (job.status === 'failed') {
            setNotice(job.error || 'Alpha planning failed. Please try again.')
            return
          }
          const result = job.result || {}
          const next = (result.conversation || result) as AlphaConversation
          if (next?.conversationStage === 'created' && next.automationDraft) {
            const agent = next.automationDraft
            setCache([agent, ...getAgents().filter(item => item.id !== agent.id)])
            created(agent)
          } else {
            acceptConversation(result)
          }
        }
      } catch (error) {
        window.clearInterval(interval)
        setJobId(null)
        setCreating(false)
        setNotice(error instanceof Error ? error.message : 'Could not poll Alpha job status.')
      }
    }, 2000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [jobId])

  const needsConnection = conversation?.pendingConnections?.[0] || pendingAgent?.missing?.find(item => item.field === 'connection')?.connector
  const guidedPlatform = searchParams.get('platform')

  if (!conversation && !pendingAgent && !success && guidedPlatform) {
    return <GuidedCommandCentre platform={guidedPlatform} creating={creating} notice={notice} onComplete={message => void send(message)} onBack={() => navigate('/dashboard')} />
  }

  return <main className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_-20%,rgba(109,40,217,.10),transparent_38%),#0A0A0B]">
    <div className="mx-auto flex h-full min-h-0 w-full max-w-none flex-1 flex-col px-0 sm:max-w-6xl sm:px-4 sm:py-3 lg:px-6">
      <header className="hidden">
        <p className="text-xs font-medium uppercase tracking-[.24em] text-white/60">Run your automations 24/7</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Turn Your Ideas Into Reality</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#8A8A93] sm:text-base">Tell Alpha what you want done. It will plan an automation that keeps working even when you are offline.</p>
      </header>

      {success && !conversation ? <section className="my-auto rounded-none border-0 bg-[#111214] p-6 text-center shadow-none sm:rounded-[1.75rem] sm:border sm:border-white/10 sm:p-10 sm:shadow-[0_30px_90px_rgba(0,0,0,0.35)]" aria-live="polite">
        <CheckCircle2 className="mx-auto text-[#1CE783]" size={34}/>
        <h2 className="mt-4 text-xl font-semibold text-white">{success.message || 'Automation created successfully.'}</h2>
        <div className="mx-auto mt-6 flex max-w-xl flex-col justify-center gap-2 sm:flex-row">
          {success.id && <button onClick={() => navigate(`/active-automations/${success.id}`)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl btn-primary px-5 text-sm">Visit Automation<ArrowRight size={16}/></button>}
          <button onClick={startNew} className="min-h-12 rounded-xl border border-white/10 px-5 text-sm font-semibold text-white">Create another</button>
          <Link to="/connected-apps" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/10 px-5 text-sm font-semibold text-white"><Plug size={16}/>Connected Apps</Link>
        </div>
      </section> : <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-none bg-[#0D0E11]/95 sm:rounded-[1.75rem] sm:border sm:border-white/[0.07] sm:shadow-[0_24px_80px_rgba(0,0,0,.30)]">
        <div className="absolute right-3 top-3 z-20 sm:right-6">{conversation && <button onClick={startNew} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-[#8A8A93] hover:text-white">New chat</button>}</div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-smooth px-3 py-3 [scrollbar-gutter:stable] sm:px-6 sm:py-6" aria-live="polite">
          {videoPrompt && <div className="mx-auto w-full max-w-3xl"><VideoBuildGlassContainer prompt={videoPrompt} duration={600} onClose={() => { setVideoPrompt(''); setNotice('') }}/></div>}
          {!conversation ? (
            <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center px-2 py-6 text-center">
              <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.02] text-white"><Sparkles size={22}/></span>
              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-[#8A8A93]">Command centre</p>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white sm:text-4xl">What do you want Alpha to do?</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#8A8A93]">{agents.length === 0 ? 'Describe an outcome. Alpha will build the plan, ask only the missing details, and wait for your approval.' : 'Ask for a post, a campaign, or a premium visual. Keep it simple and specific.'}</p>

              <div className="mt-6 w-full max-w-3xl rounded-[1.5rem] border border-white/10 bg-[#17171B] p-4 text-left sm:p-5">
                <div className={`flex items-center gap-3 rounded-2xl border p-3 ${linkedInReady ? 'border-[#1CE783]/30 bg-[#1CE783]/[0.04]' : 'border-[#F5C518]/30 bg-[#F5C518]/[0.04]'}`}>
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#0A66C2] text-white"><Linkedin size={21}/></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-white">LinkedIn <span className="ml-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/70">Native</span></p>
                    <p className={`mt-0.5 text-xs font-medium ${linkedInReady ? 'text-[#1CE783]' : 'text-[#F5C518]'}`}>{linkedInReady ? 'Connected · Publishing ready' : linkedIn?.connected ? 'Reconnect required for publishing access' : 'Not connected yet'}</p>
                  </div>
                  {linkedInReady ? <CheckCircle2 className="shrink-0 text-[#1CE783]" size={19}/> : <button onClick={() => void startLinkedInAuth(session?.access_token, '/dashboard?linkedin=connected').catch(error => setNotice(error instanceof Error ? error.message : 'LinkedIn connection failed'))} className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white">Connect <ExternalLink size={13}/></button>}
                </div>
              </div>

              <div className="mt-5 flex w-full max-w-3xl snap-x gap-2 overflow-x-auto px-1 pb-2 sm:flex-wrap sm:justify-center sm:overflow-visible" aria-label="Suggested prompts">
                {examples.slice(0, 3).map(example => (
                  <button key={example.title} onClick={() => { setInput(example.prompt); window.setTimeout(() => composer.current?.focus(), 0) }} className="group inline-flex shrink-0 snap-start items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-white/[0.05]">
                    {example.title.includes('image') ? <Image size={14} className="text-white"/> : <Sparkles size={14} className="text-white"/>}
                    {example.title}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-7 px-1 pb-4 sm:px-2">
              {conversation.messages?.map((message, index) => <div key={`${message.ts}-${index}`} className={message.role === 'user' ? 'ml-auto max-w-[88%] sm:max-w-[75%]' : 'max-w-full'}>
                <div className={message.role === 'user' ? 'rounded-3xl rounded-br-lg bg-white px-4 py-3 text-sm leading-6 text-[#0B0B0C] sm:px-5' : 'text-sm leading-7 text-white'}>
                  {message.role === 'alpha' && <p className="mb-1.5 text-xs font-black uppercase tracking-[.12em] text-[#8A8A93]">Alpha</p>}
                  <ReactMarkdown components={{ img: props => <figure className="mt-3"><img {...props} className="max-h-[420px] w-full rounded-2xl border border-white/10 object-contain" loading="lazy"/>{props.src&&<a href={props.src} download="alphatekx-image" target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 text-xs font-semibold text-white"><Download size={14}/>Save image</a>}</figure>, p: props => <p {...props} className="whitespace-pre-wrap"/> }}>{message.text}</ReactMarkdown>
                </div>
              </div>)}
              {creating && <div className="flex items-center gap-2 text-sm text-[#8A8A93]"><LoaderCircle className="animate-spin" size={16}/>Alpha is thinking…</div>}
              {pendingAgent && conversation && ['awaiting_content_review', 'awaiting_approval', 'ready_to_create'].includes(conversation.conversationStage) && <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5" aria-label="Automation approval in chat">
                <p className="text-xs font-black uppercase tracking-[.16em] text-[#8A8A93]">Plan ready in chat</p>
                <p className="mt-2 text-sm font-bold text-white">{pendingAgent.name || 'Your automation'}</p>
                <p className="mt-1 text-xs leading-5 text-[#8A8A93]">Review Alpha's messages above. One approval publishes an immediate post or activates the confirmed schedule.</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={() => void send('approve')} disabled={creating} className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl btn-primary px-5 text-sm disabled:opacity-50">
                    {creating ? <><LoaderCircle className="animate-spin" size={16}/> Working…</> : (pendingAgent.campaign?.meta?.publishingMode === 'once_now' ? 'Approve & publish now' : 'Approve & activate')}
                  </button>
                  {conversation.conversationStage === 'awaiting_content_review' && <button type="button" onClick={() => void send('regenerate')} disabled={creating} className="min-h-11 inline-flex items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-white disabled:opacity-50">{creating ? <><LoaderCircle className="animate-spin" size={16}/> Working…</> : 'Regenerate in chat'}</button>}
                </div>
              </div>}
              <div ref={messageEnd}/>
            </div>
          )}
        </div>
        {needsConnection && <div className="mx-4 mb-3 rounded-xl border border-[#F5C518]/30 bg-[#F5C518]/[0.04] p-4 text-sm sm:mx-6"><p className="text-white">{needsConnection} needs to be connected before Alpha can publish.</p><Link to={`/connected-apps?platform=${encodeURIComponent(needsConnection)}&returnTo=${encodeURIComponent(`/automations?resume=${conversation?.id || ''}`)}`} className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-white px-4 text-xs font-semibold text-[#0B0B0C]">Connect {needsConnection}</Link></div>}
        {notice && <div role="status" aria-live="polite" className={`mx-4 mb-3 flex items-center justify-between gap-3 rounded-xl border p-3 text-sm font-semibold sm:mx-6 ${noticeClasses(notice)}`}><span className="flex items-center gap-2">{/\b(queued|reviewing|continuing|processing|thinking|working|preparing)\b/i.test(notice) && <span className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.9)]"/>}{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
        <div className="shrink-0 border-t border-white/[0.06] bg-[#0D0E11]/95 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-2xl sm:px-6 sm:pb-5">
          <label htmlFor="automation-request" className="sr-only">{conversation ? 'Answer Alpha' : 'Message Alpha'}</label>
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[1.65rem] border border-white/[0.08] bg-[#18191E] p-2.5 shadow-[0_14px_40px_rgba(0,0,0,0.38)] focus-within:border-white/15">
            <button type="button" onClick={toggleVoice} disabled={creating} className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border transition ${listening ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200 shadow-[0_0_24px_rgba(52,211,153,.18)]' : 'border-white/10 bg-white/[.04] text-white/70 hover:bg-white/[.08] hover:text-white'} disabled:opacity-40`} aria-label={listening ? 'Stop voice input' : 'Speak to Alpha'} title={listening ? 'Stop listening' : 'Speak to Alpha'}>
              {listening ? <MicOff size={19}/> : <Mic size={19}/>}
            </button>
            <textarea
              id="automation-request"
              ref={composer}
              value={input}
              onChange={event => {
                setInput(event.target.value)
                event.currentTarget.style.height = 'auto'
                event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void send()
                }
              }}
              rows={1}
              maxLength={10000}
              placeholder="Message Alpha…"
              className="max-h-40 min-h-[48px] w-full resize-none overflow-y-auto rounded-2xl border-none bg-transparent px-3 py-3 text-base leading-6 text-white outline-none placeholder:text-[#8A8A93] focus:ring-0"
            />
            <button
              onClick={() => void send()}
              disabled={!input.trim() || creating}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[#0B0B0C] transition hover:bg-[#F0F0F0] disabled:bg-white/10 disabled:text-[#8A8A93]"
              aria-label="Send request"
            >
              {creating ? <LoaderCircle className="animate-spin" size={18}/> : <Send size={18}/>}            
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] font-semibold text-[#8A8A93]">Review every plan before approval.</p>
        </div>
      </section>}
    </div>

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
  const platformName = platform.charAt(0).toUpperCase() + platform.slice(1)
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
    <main className="min-h-[calc(100dvh-8rem)] bg-violet-500/10 px-4 py-8 sm:px-6 lg:min-h-[calc(100dvh-4rem)] lg:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-violet-300">Command Centre</p><h1 className="mt-3 text-4xl font-black tracking-[-.05em] text-white sm:text-6xl">Plan with Alpha</h1><p className="mx-auto mt-4 max-w-2xl text-base font-semibold text-slate-400">One question at a time. Nothing runs until you approve the complete plan.</p></header>

        {step < 5 ? (
          <section className="mx-auto mt-10 max-w-3xl rounded-[1.75rem] border border-violet-400/20 bg-violet-500/10 p-6 shadow-[0_30px_75px_rgba(15,23,42,.14)] sm:p-9">
            <div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-[.16em] text-violet-300">Question {step + 1} of 5</span><span className="text-xs font-black text-slate-400">{Math.round(((step + 1) / 5) * 100)}%</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-500/10"><div className="h-full rounded-full bg-[#6D28D9] transition-all" style={{ width: `${((step + 1) / 5) * 100}%` }}/></div>
            <h2 className="mt-8 text-2xl font-black tracking-[-.03em] text-white sm:text-3xl">{questions[step].title}</h2>
            <p className="mt-3 font-semibold leading-7 text-slate-400">{questions[step].subtitle}</p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {step === 0 && <button onClick={() => choose('platform', platformName)} className="col-span-full flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#6D28D9] font-black text-white shadow-lg shadow-violet-200"><CheckCircle2 size={18}/>{platformName} is connected</button>}
              {step === 1 && ['Mon–Fri', 'Every day', 'Custom'].map(value => <button key={value} onClick={() => value === 'Custom' ? setCustom('') : choose('days', value)} className="min-h-14 rounded-xl border-2 border-violet-400/20 bg-violet-500/10 font-black text-white transition hover:border-violet-300 hover:bg-violet-500/10">{value}{value === 'Mon–Fri' && <span className="ml-2 text-xs text-violet-300">Suggested</span>}</button>)}
              {step === 2 && <><button onClick={() => choose('time', '9:00 AM')} className="min-h-14 rounded-xl bg-[#6D28D9] font-black text-white shadow-lg shadow-violet-200">Yes, use 9am</button><button onClick={() => setCustom('')} className="min-h-14 rounded-xl border-2 border-violet-400/20 bg-violet-500/10 font-black text-white">Choose different</button></>}
              {step === 3 && ['7 days', '14 days', '30 days', 'Custom'].map(value => <button key={value} onClick={() => value === 'Custom' ? setCustom('') : choose('duration', value)} className="min-h-14 rounded-xl border-2 border-violet-400/20 bg-violet-500/10 font-black text-white transition hover:border-violet-300 hover:bg-violet-500/10">{value}</button>)}
              {step === 4 && <><button onClick={() => setCustom('AlphaTekx, intelligent automation, and helping small businesses save time')} className="col-span-full min-h-14 rounded-xl border-2 border-violet-200 bg-violet-500/10 px-4 text-left font-black text-violet-300">Suggest a strong content direction for me</button></>}
            </div>

            {((step === 1 && !plan.days) || step === 2 || step === 3 || step === 4) && (
              <div className="mt-5 flex gap-2"><input value={custom} onChange={event => setCustom(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitCustom()} placeholder={step === 2 ? 'e.g. 2:30 PM' : step === 3 ? 'e.g. 2 months' : step === 4 ? 'Describe your topic or audience' : 'e.g. Monday, Wednesday, Friday'} className="min-h-14 flex-1 rounded-xl border-2 border-violet-400/20 px-4 font-bold text-white outline-none focus:border-[#6D28D9] focus:ring-4 focus:ring-violet-100"/><button onClick={submitCustom} disabled={!custom.trim()} className="rounded-xl bg-[#6D28D9] px-5 font-black text-white disabled:opacity-40"><ArrowRight/></button></div>
            )}
            <button onClick={() => step === 0 ? onBack() : setStep(value => value - 1)} className="mt-7 text-sm font-black text-slate-400 hover:text-violet-300">← Back</button>
          </section>
        ) : (
          <section className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-[1.75rem] border border-violet-400/20 bg-violet-500/10 shadow-[0_30px_75px_rgba(15,23,42,.14)]">
            <div className="bg-[#6D28D9] p-7 text-white sm:p-9"><p className="text-xs font-black uppercase tracking-[.18em] text-violet-200">Plan preview</p><h2 className="mt-3 text-3xl font-black tracking-[-.04em]">Your automation is ready to review.</h2></div>
            <div className="grid gap-7 p-6 sm:p-9 lg:grid-cols-[.85fr_1.15fr]">
              <div className="grid content-start gap-3">
                {[['Platform', plan.platform], ['Days', plan.days], ['Time', plan.time], ['Duration', plan.duration], ['Total posts', String(totalPosts)], ['Estimated cost', `${estimatedCredits} credits`]].map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-xl bg-blue-500/10 px-4 py-3"><span className="text-sm font-bold text-slate-400">{label}</span><span className="text-sm font-black text-white">{value}</span></div>)}
              </div>
              <div><p className="text-xs font-black uppercase tracking-[.16em] text-violet-300">Two sample directions</p><div className="mt-3 space-y-3">{sampleCaptions.map((caption, index) => <div key={caption} className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-4 shadow-sm"><p className="text-xs font-black text-violet-400">SAMPLE {index + 1}</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{caption}</p></div>)}</div><p className="mt-3 text-xs font-bold text-slate-400">Alpha checks the last 10 posts before generating each live caption.</p></div>
            </div>
            {notice && <p role="status" aria-live="polite" className={`mx-6 mb-4 rounded-xl border p-3 text-sm font-bold sm:mx-9 ${noticeClasses(notice)}`}>{notice}</p>}
            <div className="flex flex-col gap-3 border-t border-violet-400/20 bg-blue-500/10 p-6 sm:flex-row sm:justify-end sm:p-7"><button onClick={() => { setStep(0); setEditing(!editing) }} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border-2 border-violet-400/20 bg-violet-500/10 px-6 font-black text-white"><Edit3 size={17}/>Edit</button><button onClick={approve} disabled={creating} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-[#6D28D9] px-7 font-black text-white shadow-[0_14px_32px_rgba(109,40,217,.28)] disabled:opacity-50">{creating ? <LoaderCircle className="animate-spin" size={18}/> : <><CalendarDays size={18}/>Approve & Schedule</>}</button></div>
          </section>
        )}
        <div className="mt-7 flex items-center justify-center gap-5 text-xs font-bold text-slate-400"><span className="flex items-center gap-1.5"><Clock3 size={14}/>Alpha never chooses your schedule</span><span className="flex items-center gap-1.5"><CheckCircle2 size={14}/>Approval required</span></div>
      </div>
    </main>
  )
}

