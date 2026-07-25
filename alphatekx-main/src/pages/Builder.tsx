import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Bot, Check, CheckCircle2, ChevronDown, Code2, Copy, Download, ExternalLink, Eye, FileCode, FileText, Folder, Globe, LayoutGrid, Library, LoaderCircle, Maximize, MessageCircle, Monitor, Plus, RefreshCw, Redo2, Rocket, RotateCcw, ShoppingBag, Smartphone, Square, Tablet, Terminal, Undo2, UploadCloud, Wallet } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { buildFromMission, buildFromPlan, planMission, refineFromMission } from '../lib/alphaBuilder'
import { getCredits, spendCredits } from '../lib/creditStore'
import { addArchitectureMemory, addProjectMemory } from '../lib/companyMemory'
import { createAgentFromNL, suggestedAgentsForMission } from '../lib/agents/agentParser'
import { saveAgent } from '../lib/agents/agentStore'
import type { Agent } from '../lib/agents/types'
import { connectors, getConnector } from '../lib/agents/connectorRegistry'
import { ConnectorIcon } from '../components/agents/ConnectorIcon'
import { getIntegrationStatus, getLocalUser, type IntegrationStatus } from '../lib/integrations'
import { useAuth } from '../lib/auth'
import { addMessage, buildMemoryContext, getActivities, getCreationForMission, getMissionById, redoCreation, subscribeStore, undoCreation, updateMission } from '../lib/missionStore'
import type { Activity, Creation, Mission, StoreItem } from '../lib/types'
import { fetchStoreItems, itemIcon } from '../lib/store'
import { findMentionedWorker, updateWorkerMemory } from '../lib/workerStore'
import ActivityFeedPanel from '../components/mission/ActivityFeedPanel'
import MentorPanel from '../components/mission/MentorPanel'
import { isMentorMission } from '../lib/mentorStore'
import { postJson } from '../lib/apiClient'
import { supabase } from '../lib/supabase'
import { checkNameAvailability, deployPastedHtml, publishCreationPath, slugifyCreation, type AvailabilityResult } from '../lib/deployCreation'
import { exportCreationZip } from '../lib/exportCreation'

function extractArchitecture(code: string): string[] {
  const lower = code.toLowerCase()
  const terms: string[] = []
  if (lower.includes('usestate')) terms.push('React state')
  if (lower.includes('useeffect')) terms.push('Side effects')
  if (lower.includes('localstorage')) terms.push('Local persistence')
  if (lower.includes('payment') || lower.includes('paystack')) terms.push('Payments')
  if (lower.includes('dashboard')) terms.push('Dashboard')
  if (lower.includes('auth')) terms.push('Authentication')
  if (lower.includes('api')) terms.push('API integration')
  if (lower.includes('chart') || lower.includes('recharts')) terms.push('Data visualization')
  return terms.slice(0, 8)
}

const tabs = [
  { id: 'preview', label: 'Preview', icon: Eye },
  { id: 'store', label: 'Store', icon: Library },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'logs', label: 'Logs', icon: Terminal },
  { id: 'deploy', label: 'Deploy', icon: Rocket },
] as const

type Tab = typeof tabs[number]['id']

export default function Builder() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const autoBuildStarted = useRef(false)
  const [mission, setMission] = useState<Mission | null>(() => getMissionById(id))
  const [activities, setActivities] = useState<Activity[]>(() => getActivities(id))
  const [creation, setCreation] = useState<Creation | null>(() => getCreationForMission(id))
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [building, setBuilding] = useState(false)
  const [tab, setTab] = useState<Tab>('preview')
  const [notice, setNotice] = useState('')
  const [mobileView, setMobileView] = useState<'chat' | 'preview'>('chat')
  const [deploySlug, setDeploySlug] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<{ url: string; subdomainUrl: string } | null>(null)
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [previewMode, setPreviewMode] = useState<'auto' | 'desktop' | 'tablet' | 'phone'>('auto')
  const [storeItems, setStoreItems] = useState<StoreItem[]>([])
  const [storeLoading, setStoreLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [pagesOpen, setPagesOpen] = useState(false)
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const { user } = useAuth()
  const isAdmin = user?.email?.toLowerCase() === 'iamdan4live@gmail.com'
  const [aiInput, setAiInput] = useState('')
  const [aiDraft, setAiDraft] = useState<Agent | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNotice, setAiNotice] = useState('')
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null)
  const [pasteMode, setPasteMode] = useState(false)
  const [paste, setPaste] = useState({ title: '', slug: '', html: '' })
  const [pasteAvailability, setPasteAvailability] = useState<AvailabilityResult | null>(null)
  const [pasteChecking, setPasteChecking] = useState(false)
  const [pasteResult, setPasteResult] = useState<{ subdomainUrl: string; url: string } | null>(null)

  const [previewUrl, setPreviewUrl] = useState(() => getCreationForMission(id)?.previewUrl || '')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewKey, setPreviewKey] = useState(0)
  const [previewLogs, setPreviewLogs] = useState('')
  const [previewSteps, setPreviewSteps] = useState<{ stage: string; ok: boolean; ms: number; summary?: string }[]>([])
  const [leftWidth, setLeftWidth] = useState(420)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const resizingRef = useRef(false)

  const fileList = useMemo(() => creation?.files ?? [], [creation])
  const filePages = useMemo(() => {
    return fileList
      .filter(f => /pages\//i.test(f.path) && /\.(jsx?|tsx?)$/i.test(f.path))
      .map(f => ({ name: f.path.replace(/^.*\//, '').replace(/\.(jsx?|tsx?)$/i, ''), path: f.path }))
  }, [fileList])

  useEffect(() => subscribeStore(() => { setMission(getMissionById(id)); setActivities(getActivities(id)); setCreation(getCreationForMission(id)) }), [id])

  useEffect(() => {
    if (creation?.title) {
      setDeploySlug(slugifyCreation(creation.title))
      setAvailability(null)
      const arch = extractArchitecture(creation.code)
      if (arch.length) addArchitectureMemory(arch)
      setSelectedFile(null)
      if (creation.previewUrl) setPreviewUrl(creation.previewUrl)
      if (creation.previewLogs) setPreviewLogs(creation.previewLogs)
      if (creation.previewSteps) setPreviewSteps(creation.previewSteps)
    }
  }, [creation?.id])

  useEffect(() => {
    if (tab !== 'store') return
    setStoreLoading(true)
    fetchStoreItems({ sort: 'most_used' }).then(d => setStoreItems(d.items || [])).catch(() => setStoreItems([])).finally(() => setStoreLoading(false))
  }, [tab])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.source !== 'alphatekx-preview') return
      if (event.data?.type === 'alphatekx:preview-runtime-error') {
        setPreviewError(`Preview runtime error: ${event.data.detail}.`)
        setPreviewLoading(false)
      }
      if (event.data?.type === 'alphatekx:preview-mounted') {
        setPreviewLoading(false)
      }
      if (event.data?.type === 'alpha-preview-error') {
        setNotice(`Preview error: ${event.data.message}. Try refining with "fix the rendering error".`)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  useEffect(() => {
    if (tab !== 'ai') return
    let cancelled = false
    getIntegrationStatus().then(s => { if (!cancelled) setIntegrationStatus(s) }).catch(() => {})
    return () => { cancelled = true }
  }, [tab])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    const onMove = (e: MouseEvent) => { if (resizingRef.current) setLeftWidth(Math.max(280, Math.min(800, e.clientX))) }
    const onUp = () => { if (resizingRef.current) { resizingRef.current = false; document.body.style.userSelect = ''; document.body.style.cursor = '' } }
    window.addEventListener('resize', onResize)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  useEffect(() => {
    if (!pasteMode || !paste.slug) { setPasteAvailability(null); return }
    let ignore = false
    setPasteChecking(true)
    const timer = setTimeout(() => {
      checkNameAvailability(paste.slug)
        .then(r => { if (!ignore) setPasteAvailability(r) })
        .catch(() => { if (!ignore) setPasteAvailability(null) })
        .finally(() => { if (!ignore) setPasteChecking(false) })
    }, 500)
    return () => { ignore = true; clearTimeout(timer); setPasteChecking(false) }
  }, [paste.slug, pasteMode])

  const suggestions = useMemo(() => mission?.goal ? suggestedAgentsForMission(mission.goal) : [], [mission?.goal])

  const planAgent = async () => {
    if (!aiInput.trim() || aiBusy || !mission) return
    setAiBusy(true); setAiNotice('')
    try {
      let agent: Agent | null = null
      try {
        const res = await fetch('/api/agents/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: aiInput.trim(), missionId: mission.id }) })
        if (res.ok) { const data = await res.json(); agent = data.agent as Agent }
      } catch {}
      if (!agent) {
        const authUser = user ? { id: user.id, email: user.email } : getLocalUser() || undefined
        agent = createAgentFromNL(aiInput.trim(), mission.id, authUser)
      }
      setAiDraft(agent)
    } catch (error) { setAiNotice(error instanceof Error ? error.message : 'Could not plan agent') }
    finally { setAiBusy(false) }
  }

  const approveAndSaveAgent = async () => {
    if (!aiDraft) return
    const cost = aiDraft.creditsNeeded || aiDraft.creditsPerRun || 1
    const balance = getCredits()
    if (!isAdmin && balance < cost) {
      setAiNotice(`This agent needs ${cost} credits. You have ${balance}. Buy credits to continue.`)
      return
    }
    if (!isAdmin) {
      const ok = await spendCredits(cost)
      if (!ok) { setAiNotice('Not enough credits. Buy credits to continue.'); return }
    }
    await saveAgent(aiDraft)
    setAiNotice(`Agent "${aiDraft.name}" created and running.`)
    setAiInput(''); setAiDraft(null)
  }

  const publishPasted = async () => {
    if (!paste.title.trim() || !paste.html.trim() || pasteChecking || pasteAvailability?.available !== true) return
    setDeploying(true); setNotice('')
    try {
      const result = await deployPastedHtml({ title: paste.title, slug: paste.slug, html: paste.html })
      setPasteResult(result)
      setNotice(`Live at ${result.url || result.pathUrl || result.subdomainUrl}`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Deployment failed.') }
    finally { setDeploying(false) }
  }

  const savePreview = async (next: Creation | null) => {
    if (!next?.code || !mission?.id) return
    setPreviewLoading(true); setPreviewError(''); setPreviewLogs(''); setPreviewSteps([])
    try {
      const result = await postJson<{ url: string; ok: boolean; logs?: string }>(`/api/previews/${mission.id}`, { title: next.title, code: next.code, files: next.files }, { timeoutMs: 180_000 })
      setPreviewUrl(result.url)
      if (result.logs) setPreviewLogs(result.logs)
      if ((result as any).steps) setPreviewSteps((result as any).steps)
      setPreviewKey(k => k + 1)
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Preview upload failed.')
    }
    finally { setPreviewLoading(false) }
  }

  const refreshPreview = () => { if (creation) void savePreview(creation) }
  const restartPreview = () => { setPreviewKey(k => k + 1); setPreviewError('') }
  const openNewTab = () => { if (previewUrl) window.open(previewUrl, '_blank') }
  const openFullscreen = () => { previewIframeRef.current?.requestFullscreen?.() }

  useEffect(() => { if (creation?.code && mission?.id) { void savePreview(creation) } }, [creation?.code, mission?.id])

  const runBuild = async () => {
    if (building) return
    let current = getMissionById(id)
    if (!current) return
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setBuilding(true); setNotice(''); setTab('logs')
    try {
      if (!current.plan) {
        await planMission(current, controller.signal)
        current = getMissionById(id)
        if (!current?.plan) throw new Error('Could not create a plan')
      }
      if (current.planStatus !== 'approved') {
        updateMission(current.id, { planStatus: 'approved' })
      }
      const built = await buildFromPlan(current, controller.signal)
      setCreation(built)
      setTab('preview')
      addProjectMemory({ id: current.id, title: built.title || current.title, goal: current.goal, category: 'web-app', systems: ['React', 'Tailwind', 'Alpha OS'], installedLibraries: built.dependencies || [], goals: [current.goal], createdAt: new Date().toISOString() })
    }
    catch (error) {
      if (error instanceof Error && error.message === 'ABORTED') { setNotice('Build stopped by user.') }
      else { setNotice(error instanceof Error && error.message === 'LOW_CREDITS' ? 'You need 10 credits to build this mission.' : `Build stopped: ${error instanceof Error ? error.message : 'Unknown generation error'}`) }
    }
    finally { setBuilding(false); abortControllerRef.current = null }
  }

  const stopBuild = () => { abortControllerRef.current?.abort(); abortControllerRef.current = null }
  const undoBuild = () => { const restored = undoCreation(creation?.id || ''); if (restored) setCreation(restored) }
  const redoBuild = () => { const restored = redoCreation(creation?.id || ''); if (restored) setCreation(restored) }

  useEffect(() => {
    if (searchParams.get('build') === '1' && mission && !creation && !autoBuildStarted.current) {
      autoBuildStarted.current = true
      void runBuild()
    }
  // The query flag intentionally triggers one build per page load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission?.id, creation?.id])

  const isBuildCommand = (content: string) => /\b(build|create|generate|make the app|start building|rebuild|make new)\b/i.test(content)

  const send = async (override?: string) => {
    const content = (override ?? input).trim()
    if (!content || pending || !mission) return
    if (!input.trim() && override) setInput(override)
    const build = isBuildCommand(content)
    const refine = !!creation && !build
    if (!build && !refine) { if (!await spendCredits(1)) { setNotice('You need at least 1 credit to chat.'); return } }
    setInput(''); setPending(true); setNotice('')
    addMessage(id, { role: 'user', content, type: 'chat' })
    try {
      if (build) {
        await runBuild()
        addMessage(id, { role: 'assistant', content: creation ? 'Built a fresh version. Switch to Preview to test it.' : 'I planned the architecture and built the first version. Check the Preview tab.', type: 'chat' })
      } else if (refine) {
        abortControllerRef.current?.abort()
        const controller = new AbortController()
        abortControllerRef.current = controller
        try {
          const refined = await refineFromMission(mission, creation, content, controller.signal)
          setCreation(refined)
          setTab('preview')
          addMessage(id, { role: 'assistant', content: `Updated the app: "${content}". Preview refreshed.`, type: 'chat' })
        } finally { abortControllerRef.current = null }
      } else {
        const worker = findMentionedWorker(content)
        const memory = buildMemoryContext(id)
        const mentor = /\blearn|teach|course|study\b/i.test(mission.goal) ? 'Teacher mode: explain step-by-step and end with a short quiz.' : ''
        const session = worker && supabase ? (await supabase.auth.getSession()).data.session : null
        const data = worker
          ? await postJson<{ text?: string; memory?: string[] }>('/api/workers/run', { workerId: worker.id, prompt: `Mission: ${mission.goal}. ${mentor} User: ${content}` }, { token: session?.access_token })
          : await postJson<{ text?: string; response?: string }>('/api/alpha', { mode: 'chat', missionId: id, prompt: `Mission goal: ${mission.goal}. User memory: ${memory} Adapt accordingly. ${mentor} User message: ${content}` })
        if (worker && data.memory) updateWorkerMemory(worker.id, data.memory)
        addMessage(id, { role: 'assistant', content: String(data.text || data.response || 'Alpha completed the request.'), type: 'chat', workerId: worker?.id })
      }
    } catch (error) { addMessage(id, { role: 'assistant', content: error instanceof Error ? error.message : 'Alpha could not connect right now. Your message is saved, so you can try again.', type: 'chat' }) }
    finally { setPending(false) }
  }

  const publish = async () => {
    if (!creation || deploying || !canPublish) return
    setDeploying(true); setNotice('')
    try {
      const result = await publishCreationPath(creation, deploySlug)
      setDeployResult(result)
      setNotice(`Live at ${result.url || result.subdomainUrl}`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Publication failed.') }
    finally { setDeploying(false) }
  }

  const canPublish = useMemo(() => !!creation && !!deploySlug && !checking && availability?.available === true, [creation, deploySlug, checking, availability])

  useEffect(() => {
    if (!deploySlug) { setAvailability(null); return }
    let ignore = false
    setChecking(true); setAvailabilityError('')
    const timer = setTimeout(() => {
      checkNameAvailability(deploySlug)
        .then(r => { if (!ignore) { setAvailability(r); setAvailabilityError('') } })
        .catch(e => { if (!ignore) { setAvailability(null); setAvailabilityError(e instanceof Error ? e.message : 'Check failed') } })
        .finally(() => { if (!ignore) setChecking(false) })
    }, 500)
    return () => { ignore = true; clearTimeout(timer); setChecking(false) }
  }, [deploySlug])

  const autoAppLike = useMemo(() => /\b(app|calculator|tool|todo|tracker|clock|timer|converter|mobile|utility)\b/i.test(mission?.goal || '') && !/\b(website|landing|site|portfolio|blog|webpage|page|platform|academy)\b/i.test(mission?.goal || ''), [mission?.goal])
  const appLike = previewMode === 'phone' || (previewMode === 'auto' && autoAppLike)
  const previewFrameClass = previewMode === 'phone' ? 'w-full max-w-[414px]' : previewMode === 'tablet' ? 'w-full max-w-[820px]' : 'w-full'
  const chats = mission?.messages.filter(message => message.type === 'chat') ?? []
  if (!mission) return <div className="grid min-h-screen place-items-center bg-background p-6 text-center"><div><h1 className="text-xl font-semibold">Mission not found</h1><Link to="/workspace" className="mt-5 inline-flex rounded-lg bg-white px-5 py-3 text-sm text-black transition-all hover:bg-zinc-100">Return to dashboard</Link></div></div>

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-white/[.12] bg-white/[0.04] px-5 py-3 ">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-30" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{mission.title}</h1>
            <p className="text-xs text-white/55">{building ? (mission.currentStage || 'Alpha is engineering your reality') : `${mission.progress}% complete`}</p>
          </div>
        </div>
        <div className="flex max-w-full flex-1 items-center justify-end gap-2 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all ${tab === t.id ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]'}`}
            >
              <t.icon size={14} className="sm:mr-1.5" /> <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
          {building && (
            <button onClick={stopBuild} title="Stop generation" className="flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-lg bg-red-500/20 px-3 text-xs font-semibold text-red-300 transition-all hover:bg-red-500/30">
              <Square size={14} className="fill-current" /> <span className="hidden sm:inline">Stop</span>
            </button>
          )}
          {creation && !building && (
            <>
              <button onClick={undoBuild} disabled={!creation.versions || creation.versions.length < 2 || (creation.versionIndex ?? creation.versions.length - 1) === 0} title="Undo last change" className="flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-300 transition-all hover:bg-white/[0.08] disabled:opacity-40"><Undo2 size={14}/> <span className="hidden sm:inline">Undo</span></button>
              <button onClick={redoBuild} disabled={!creation.versions || (creation.versionIndex ?? creation.versions.length - 1) >= creation.versions.length - 1} title="Redo" className="flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-300 transition-all hover:bg-white/[0.08] disabled:opacity-40"><Redo2 size={14}/> <span className="hidden sm:inline">Redo</span></button>
            </>
          )}
          <button onClick={() => void runBuild()} disabled={building} className="flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-lg bg-white px-4 text-xs font-semibold text-black transition-all hover:bg-zinc-100 disabled:opacity-50">
            {building ? <LoaderCircle className="animate-spin" size={14}/> : <Rocket size={14}/>} <span className="hidden sm:inline">{building ? 'Engineering...' : 'Build'}</span>
          </button>
        </div>
      </header>

      {notice && <div className="border-b border-white/[.12] bg-white/[0.04] px-5 py-3 text-center text-sm text-white/80">{notice}</div>}

      <div className="grid grid-cols-2 border-b border-white/[.12] bg-white/[0.04] p-2 lg:hidden">
        <button onClick={() => setMobileView('chat')} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm ${mobileView === 'chat' ? 'bg-white text-black' : 'text-white/55'}`}><MessageCircle size={16}/> Alpha Log</button>
        <button onClick={() => setMobileView('preview')} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm ${mobileView === 'preview' ? 'bg-white text-black' : 'text-white/55'}`}><Eye size={16}/> Workspace</button>
      </div>

      <div className="grid min-h-0 flex-1 min-w-0 grid-cols-1 md:grid-cols-[minmax(0,420px)_4px_minmax(0,1fr)] lg:grid-cols-[minmax(0,420px)_4px_minmax(0,1fr)]" style={{ gridTemplateColumns: isMobile ? undefined : `minmax(0, ${leftWidth}px) 4px minmax(0, 1fr)` }}>
        <section className={`${mobileView === 'chat' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col border-b border-white/[.12] bg-background md:flex md:border-b-0`}>
          <div className="flex-1 space-y-5 overflow-y-auto p-5 md:p-6">
            <AssistantMessage>
              I understand: <strong className="text-white">{mission.goal}</strong><br />
              <span className="text-white/60">Tell me what to change, or say “build” when you are ready.</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {['Make it blue', 'Add dark mode toggle', 'Add a contact form', 'Add charts and analytics'].map(s => (
                  <button key={s} onClick={() => void send(s)} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-zinc-300 transition-all hover:border-indigo-400/40 hover:bg-white/[0.10] hover:text-white">{s}</button>
                ))}
              </div>
            </AssistantMessage>
            {chats.map(message => (
              <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {message.role === 'assistant' && (
                  <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 text-white"><Bot size={14} /></div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-7 ${message.role === 'user' ? 'bg-white/[0.12] text-white' : 'border border-white/[.08] bg-white/[0.04] text-white/90 '}`}>
                  {message.content}
                </div>
              </div>
            ))}
            {pending && <div className="flex items-center gap-2 text-sm text-white/55"><LoaderCircle className="animate-spin" size={16}/> Alpha is responding...</div>}
          </div>
          <div className="border-t border-white/[.12] bg-white/[0.04] p-4">
            <div className="rounded-xl border border-white/[.15] bg-white/[0.04] p-2 focus-within:border-white/30">
              <textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} className="h-20 w-full resize-none bg-transparent px-2 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none" placeholder="Message Alpha..." />
              <div className="flex justify-end"><button onClick={() => void send()} disabled={pending || !input.trim()} className="grid size-11 place-items-center rounded-lg bg-white text-black transition-all hover:bg-zinc-100 disabled:opacity-30" aria-label="Send"><ArrowUp size={18}/></button></div>
            </div>
          </div>
          <div className="border-t border-white/[.12] bg-white/[0.04]"><button onClick={() => {}} className="flex min-h-12 w-full items-center justify-between px-5 text-sm font-medium"><span>Build progress</span><span className="text-xs text-white/55">{activities.length} updates</span></button><ActivityFeedPanel activities={activities} building={building} /> {isMentorMission(mission.goal) && <MentorPanel mission={mission} />}</div>
        </section>

        <div
          onMouseDown={() => { resizingRef.current = true; document.body.style.userSelect = 'none'; document.body.style.cursor = 'col-resize' }}
          className="hidden cursor-col-resize bg-white/5 hover:bg-white/10 active:bg-white/20 md:block"
          style={{ width: 4 }}
          aria-label="Resize panels"
        />

        <section className={`${mobileView === 'preview' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col bg-background p-3 sm:p-4 md:p-6 md:flex`}>
          {tab === 'preview' && (
            <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/[.12] bg-white/[0.04] p-3 ">
              <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-t-xl border-b border-white/[.12] px-4 pb-3">
                <span className="flex gap-1.5"><i className="size-2.5 rounded-full bg-red-500/80" /><i className="size-2.5 rounded-full bg-amber-500/80" /><i className="size-2.5 rounded-full bg-emerald-500/80" /></span>
                <div className="min-w-0 flex-1 truncate rounded-lg border border-white/[.10] bg-white/[0.04] px-3 py-1.5 text-center text-xs text-white/60">{previewUrl ? previewUrl.replace(/^.*\/preview\//, 'preview/') : (appLike ? 'phone.alphatekx.app' : 'preview.alphatekx.app')}</div>
                <div className="flex items-center gap-1 rounded-lg border border-white/[.10] bg-white/[0.04] p-0.5">
                  <button onClick={() => setPreviewMode('desktop')} title="Desktop" className={`grid size-7 place-items-center rounded-md ${previewMode === 'desktop' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}><Monitor size={14} /></button>
                  <button onClick={() => setPreviewMode('tablet')} title="Tablet" className={`grid size-7 place-items-center rounded-md ${previewMode === 'tablet' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}><Tablet size={14} /></button>
                  <button onClick={() => setPreviewMode('phone')} title="Phone" className={`grid size-7 place-items-center rounded-md ${previewMode === 'phone' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}><Smartphone size={14} /></button>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-white/[.10] bg-white/[0.04] p-0.5">
                  <button onClick={refreshPreview} disabled={!creation || previewLoading} title="Refresh preview" className="grid size-7 place-items-center rounded-md text-white/60 hover:text-white disabled:opacity-40"><RefreshCw size={14} className={previewLoading ? 'animate-spin' : ''} /></button>
                  <button onClick={restartPreview} title="Restart preview" className="grid size-7 place-items-center rounded-md text-white/60 hover:text-white"><RotateCcw size={14} /></button>
                  <button onClick={openNewTab} disabled={!previewUrl} title="Open in new tab" className="grid size-7 place-items-center rounded-md text-white/60 hover:text-white disabled:opacity-40"><ExternalLink size={14} /></button>
                  <button onClick={openFullscreen} disabled={!previewUrl} title="Fullscreen" className="grid size-7 place-items-center rounded-md text-white/60 hover:text-white disabled:opacity-40"><Maximize size={14} /></button>
                </div>
                {creation && (
                  <div className="relative">
                    <button onClick={() => setPagesOpen(v => !v)} className="flex min-h-7 items-center gap-1.5 rounded-lg border border-white/[.10] bg-white/[0.04] px-2 text-xs text-white/70 hover:bg-white/[0.08]">
                      <LayoutGrid size={12}/> {filePages.length ? `${filePages.length} pages` : `${fileList.length} files`} <ChevronDown size={12} className={`transition-transform ${pagesOpen ? 'rotate-180' : ''}`}/>
                    </button>
                    {pagesOpen && (
                      <div className="absolute right-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-white/[.12] bg-[#151515] p-1 shadow-xl">
                        {filePages.length ? filePages.map(p => (
                          <button key={p.path} onClick={() => { setPagesOpen(false); previewIframeRef.current?.contentWindow?.postMessage({ type: 'alpha-navigate', view: p.name.toLowerCase() }, '*') }} className="w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.08]">{p.name}</button>
                        )) : (
                          <div className="px-3 py-2 text-xs text-white/40">No pages detected</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {creation && !previewLoading && !previewError && <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400"><Check size={12} /> Ready</span>}
                {previewLoading && <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-400"><LoaderCircle size={12} className="animate-spin" /> Loading</span>}
                {previewError && <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-400">Error</span>}
              </div>
              <div className={`relative min-h-0 flex-1 rounded-b-xl border border-white/[.12] bg-black/30 ${previewMode === 'phone' || previewMode === 'tablet' ? 'flex justify-center' : ''}`}>
                {previewError && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-b-xl bg-black/80 p-6 text-center">
                    <p className="text-sm text-red-300">Preview failed to load</p>
                    <p className="max-w-md text-xs text-zinc-400">{previewError}</p>
                    <button onClick={refreshPreview} className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-zinc-100">Try again</button>
                  </div>
                )}
                {previewLoading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-b-xl bg-black/60">
                    <LoaderCircle size={24} className="animate-spin text-emerald-400" />
                    <span className="text-xs text-zinc-300">Starting preview server...</span>
                  </div>
                )}
                {previewUrl ? (
                  <iframe key={previewKey} ref={previewIframeRef} title="Generated application" src={previewUrl} onLoad={() => setPreviewLoading(false)} onError={() => { setPreviewLoading(false); setPreviewError('Could not load preview frame.') }} sandbox="allow-scripts allow-forms allow-modals allow-same-origin allow-popups" className={`h-full ${previewFrameClass} ${previewMode === 'phone' ? 'rounded-b-xl border-x border-white/[0.08] bg-black' : 'rounded-b-xl'}`} />
                ) : mission?.plan ? (
                  <PlanPanel mission={mission} building={building} onBuild={() => void runBuild()} />
                ) : <EmptyPreview building={building} onBuild={() => void runBuild()} />}
              </div>
            </div>
          )}

          {tab === 'store' && (
            <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/[.12] bg-white/[0.04] p-4 ">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Store</h2>
                  <p className="text-xs text-white/55">Click an item to drop it into the prompt.</p>
                </div>
                <Link to="/store" className="text-xs text-indigo-300 hover:underline">Open store</Link>
              </div>
              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {storeLoading ? (
                  <div className="flex items-center gap-2 text-sm text-white/55"><LoaderCircle className="animate-spin" size={16}/> Loading...</div>
                ) : storeItems.length ? storeItems.map(item => (
                  <button key={item.id} onClick={() => setInput(prev => prev ? `${prev}\n${item.content}` : item.content)} className="w-full rounded-xl border border-white/[.08] bg-white/[.04] p-3 text-left transition-colors hover:bg-white/[.08]">
                    <div className="flex items-center gap-2 text-sm font-medium">{itemIcon(item.type)} {item.title}</div>
                    <p className="mt-1 line-clamp-2 text-xs text-white/55">{item.content}</p>
                  </button>
                )) : <p className="text-sm text-white/55">Your store is empty. Save snippets, prompts and ideas from <Link to="/store" className="text-indigo-300 underline">/store</Link>.</p>}
              </div>
            </div>
          )}

          {tab === 'code' && (
            <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/[.12] bg-white/[0.04] p-4 ">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Project code</h2>
                  <p className="text-xs text-white/55">{fileList.length} files generated — {filePages.length || 1} page{filePages.length !== 1 ? 's' : ''} — Multi-route full app</p>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 px-2 py-1 text-[10px] font-semibold text-white">🔥 Full App</span>
                {creation && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => navigator.clipboard.writeText(creation.code)} className="flex min-h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-xs transition-all hover:bg-white/[0.08]"><Copy size={13} /> Copy entry</button>
                    <button onClick={() => void exportCreationZip(creation)} className="flex min-h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-xs transition-all hover:bg-white/[0.08]"><Download size={13} /> Project ZIP</button>
                  </div>
                )}
              </div>
              <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-white/[.12] bg-[#111] flex">
                <div className="w-52 border-r border-white/[.12] overflow-y-auto p-2">
                  {fileList.map((file) => {
                    const isFolder = file.path.endsWith('/')
                    const isCode = /\.(jsx?|tsx?|jsx|tsx)$/i.test(file.path)
                    const Icon = isFolder ? Folder : isCode ? FileCode : FileText
                    return (
                      <button
                        key={file.path}
                        onClick={() => setSelectedFile(file.path)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${selectedFile === file.path ? 'bg-white/[0.10] text-white' : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200'}`}
                      >
                        <Icon size={12}/> {file.path}
                      </button>
                    )
                  })}
                </div>
                <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-6 text-gray-200">{selectedFile ? (fileList.find(f => f.path === selectedFile)?.code ?? '// Select a file') : (creation?.code || '// No code yet. Click Build to generate working software.')}</pre>
              </div>
            </div>
          )}

          {tab === 'logs' && (
            <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/[.12] bg-white/[0.04] p-4 ">
              <h2 className="text-lg font-semibold">Alpha log</h2>
              {previewSteps.length > 0 && (
                <div className="mt-3 space-y-1 rounded-xl bg-black/30 p-3">
                  {previewSteps.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className={`inline-block h-2 w-2 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span className="font-medium text-white/80">{s.stage}</span>
                      <span className="ml-auto text-xs text-white/50">{s.ms}ms</span>
                      {s.summary && <span className="text-xs text-white/40">— {s.summary}</span>}
                    </div>
                  ))}
                </div>
              )}
              <details className="mt-3 flex-1 overflow-y-auto rounded-xl bg-black/30 p-4">
                <summary className="cursor-pointer text-sm text-white/60">Technical logs</summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-5 text-white/70">{previewLogs || 'No build logs yet.'}</pre>
              </details>
              <div className="mt-3 flex-1 overflow-y-auto rounded-xl bg-black/30 p-4">
                <ActivityFeedPanel activities={activities} building={building} />
              </div>
            </div>
          )}

          {tab === 'ai' && (
            <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/[.12] bg-white/[0.04] p-5 ">
              <h2 className="text-lg font-semibold">AI</h2>
              <p className="text-sm text-white/55">Turn this mission into an automation. Connect apps and let Alpha work for you.</p>

              {aiNotice && <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{aiNotice}</div>}

              <div className="mt-4 rounded-xl border border-white/[.12] bg-white/[0.04] p-3">
                <textarea
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void planAgent() } }}
                  placeholder="Every morning at 8 AM post an AI tip to Facebook, LinkedIn and X for 1 week..."
                  className="h-28 w-full resize-none bg-transparent px-2 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
                />
                <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-white/40">{getCredits()} credits available. Each run costs 1 credit.</div>
                  <button onClick={() => void planAgent()} disabled={!aiInput.trim() || aiBusy} className="flex min-h-10 items-center gap-2 rounded-lg btn-alpha px-5 text-sm text-white disabled:opacity-30">
                    {aiBusy ? <LoaderCircle className="animate-spin" size={16}/> : <Bot size={16}/>} Plan agent
                  </button>
                </div>
              </div>

              {suggestions.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {suggestions.map(s => (
                    <button key={s.title} onClick={() => { setAiInput(s.description); void planAgent() }} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-zinc-300 transition-all hover:border-indigo-400/40 hover:bg-white/[0.10] hover:text-white">
                      {s.title}
                    </button>
                  ))}
                </div>
              )}

              {aiDraft && (
                <div className="mt-6 rounded-xl border border-white/[.12] bg-white/[0.04] p-4">
                  <div className="flex items-center gap-2">
                    <Bot size={16} className="text-indigo-300" />
                    <h3 className="font-semibold">{aiDraft.name}</h3>
                  </div>
                  <p className="mt-1 text-sm text-white/55">{aiDraft.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/55">
                    <span className="rounded-lg bg-white/[.05] px-2 py-1">Trigger: {aiDraft.trigger.type === 'schedule' ? (aiDraft.trigger.cron || 'Daily') : aiDraft.trigger.type}</span>
                    <span className="rounded-lg bg-white/[.05] px-2 py-1">Cost: {aiDraft.creditsNeeded || aiDraft.creditsPerRun || 1} credit(s)</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {aiDraft.actions.map((a, i) => {
                      const c = getConnector(a.connector)
                      return (
                        <div key={i} className="flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[0.03] p-3 text-sm">
                          {c ? <ConnectorIcon connector={c} /> : <Bot size={16} />}
                          <span className="flex-1">{a.label || a.action}</span>
                          {integrationStatus && (integrationStatus[a.connector]?.connected || integrationStatus[a.connector]?.ready) && <CheckCircle2 size={14} className="text-emerald-400" />}
                        </div>
                      )
                    })}
                  </div>
                  {aiDraft.actions.some(a => !integrationStatus?.[a.connector]?.connected && !integrationStatus?.[a.connector]?.ready) && (
                    <p className="mt-3 text-xs text-amber-300">Some actions need a connector. <Link to="/connectors" className="underline">Connect them first</Link> or the agent will pause.</p>
                  )}
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => void approveAndSaveAgent()} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-black transition-all hover:bg-zinc-100">
                      <Plus size={16}/> Create & run
                    </button>
                    <button onClick={() => setAiDraft(null)} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/[.15] px-4 text-sm text-white transition-all hover:bg-white/5">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!aiDraft && (
                <div className="mt-6 rounded-xl border border-white/[.12] bg-white/[0.04] p-4">
                  <h3 className="text-sm font-semibold">Connected services</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {connectors.filter(c => c.id !== 'calendar').map(c => {
                      const status = integrationStatus?.[c.id] || { connected: false, ready: false }
                      return (
                        <Link key={c.id} to={`/connectors?service=${c.id}`} className="rounded-xl border border-white/[.08] bg-white/[0.03] p-3 transition-all hover:bg-white/[0.05]">
                          <div className="flex items-center gap-2">
                            <ConnectorIcon connector={c} />
                            <span className="text-xs font-medium">{c.name}</span>
                          </div>
                          <div className="mt-2 text-[10px] text-white/40">{status.connected ? 'Connected' : status.ready ? 'Ready' : 'Not connected'}</div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'deploy' && (
            <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/[.12] bg-white/[0.04] p-5 ">
              <h2 className="text-lg font-semibold">Deploy</h2>
              <p className="text-sm text-white/55">Choose a unique app address and publish to the world.</p>

              {creation ? (
                <div className="mt-6 rounded-xl border border-white/[.12] bg-white/[0.04] p-4">
                  <label className="block text-xs font-medium text-white/70" htmlFor="deploy-slug">App address</label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <div className={`flex min-h-11 min-w-0 flex-1 items-center rounded-lg border bg-white/[0.04] px-3 text-sm ${availability?.available === false ? 'border-red-500/50' : availability?.available === true ? 'border-emerald-500/50' : 'border-white/[.15]'}`}>
                      <span className="hidden text-white/45 sm:inline">https://</span>
                      <input id="deploy-slug" value={deploySlug} onChange={e => { setDeploySlug(slugifyCreation(e.target.value)); setAvailability(null) }} className="min-w-0 flex-1 bg-transparent outline-none" />
                      <span className="hidden text-white/45 sm:inline">.alphatekx.name.ng</span>
                    </div>
                    <button onClick={() => void publish()} disabled={deploying || !canPublish} className="flex min-h-11 items-center justify-center gap-2 rounded-lg btn-alpha px-5 text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-50">
                      {deploying ? <LoaderCircle className="animate-spin" size={14}/> : <UploadCloud size={14}/>} {deployResult ? 'Republish' : 'Publish'}
                    </button>
                  </div>

                  <div className="mt-3 min-h-[1.5rem] text-xs">
                    {checking && <span className="flex items-center gap-1.5 text-white/55"><LoaderCircle size={12} className="animate-spin" /> Checking global availability...</span>}
                    {!checking && availability?.available === true && <span className="text-emerald-400">✅ alphatekx.name.ng/app/{availability.name} is available.</span>}
                    {!checking && availability?.available === false && (
                      <span className="text-red-300">
                        ❌ {availability.reserved ? 'Reserved name' : 'Taken'}: {availability.reason || 'Choose another name.'}
                        {availability.suggestions && availability.suggestions.length > 0 && (
                          <span className="ml-2">
                            Try:{availability.suggestions.map(s => (
                              <button key={s} onClick={() => setDeploySlug(s)} className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-emerald-300 hover:bg-white/15">{s}</button>
                            ))}
                          </span>
                        )}
                      </span>
                    )}
                    {!checking && availabilityError && <span className="text-red-300">{availabilityError}</span>}
                    {!checking && !availability && !availabilityError && deploySlug && <span className="text-white/45">We will check if alphatekx.name.ng/app/{deploySlug} is available as you type.</span>}
                  </div>

                  {deploySlug && (
                    <div className="mt-4 rounded-lg border border-white/[.08] bg-white/[0.03] p-3 text-xs text-white/70">
                      <p>Your app will be live at:</p>
                      <p className="mt-1 font-mono text-emerald-300">https://alphatekx.name.ng/app/{deploySlug}</p>
                      <p className="mt-1 font-mono text-white/55">https://{deploySlug}.alphatekx.name.ng</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-dashed border-white/[.15] p-8 text-center text-sm text-white/55">Build the mission first to unlock deploy.</div>
              )}

              <div className="mt-6 rounded-xl border border-white/[.12] bg-white/[0.04] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Deploy pasted code</h3>
                    <p className="text-xs text-white/55">Paste any complete HTML page and get a alphatekx.name.ng/app/... link.</p>
                  </div>
                  <button onClick={() => { setPasteMode(v => !v); setPasteResult(null); setNotice('') }} className="rounded-lg border border-white/[.15] px-3 py-1.5 text-xs text-white transition-all hover:bg-white/5">
                    {pasteMode ? 'Hide' : 'Paste code'}
                  </button>
                </div>
                {pasteMode && (
                  <div className="mt-4 space-y-3">
                    <input value={paste.title} onChange={e => setPaste(p => ({ ...p, title: e.target.value }))} className="w-full rounded-lg border border-white/[.15] bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500" placeholder="App name" />
                    <div className={`flex min-h-11 min-w-0 items-center rounded-lg border bg-white/[0.04] px-3 text-sm ${pasteAvailability?.available === false ? 'border-red-500/50' : pasteAvailability?.available === true ? 'border-emerald-500/50' : 'border-white/[.15]'}`}>
                      <span className="hidden text-white/45 sm:inline">https://</span>
                      <input value={paste.slug} onChange={e => setPaste(p => ({ ...p, slug: slugifyCreation(e.target.value) }))} className="min-w-0 flex-1 bg-transparent outline-none" placeholder="my-app" />
                      <span className="hidden text-white/45 sm:inline">.alphatekx.name.ng</span>
                    </div>
                    <textarea value={paste.html} onChange={e => setPaste(p => ({ ...p, html: e.target.value }))} className="h-48 w-full rounded-lg border border-white/[.15] bg-white/[0.04] p-3 text-xs font-mono text-zinc-100 outline-none placeholder:text-zinc-500" placeholder="<!DOCTYPE html>..." />
                    <div className="min-h-[1.5rem] text-xs">
                      {pasteChecking && <span className="flex items-center gap-1.5 text-white/55"><LoaderCircle size={12} className="animate-spin" /> Checking global availability...</span>}
                      {!pasteChecking && pasteAvailability?.available === true && <span className="text-emerald-400">✅ alphatekx.name.ng/app/{pasteAvailability.name} is available.</span>}
                      {!pasteChecking && pasteAvailability?.available === false && <span className="text-red-300">❌ {pasteAvailability.reserved ? 'Reserved' : 'Taken'}: {pasteAvailability.reason || 'Choose another name.'}</span>}
                    </div>
                    <button onClick={() => void publishPasted()} disabled={deploying || !paste.title.trim() || !paste.html.trim() || pasteChecking || pasteAvailability?.available !== true} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg btn-alpha px-5 text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-50">
                      {deploying ? <LoaderCircle className="animate-spin" size={14}/> : <UploadCloud size={14}/>} Deploy code
                    </button>
                  </div>
                )}
                {pasteResult && (
                  <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-100"><Globe size={16} /> Your app is live</div>
                    <a href={pasteResult.url || pasteResult.pathUrl || pasteResult.subdomainUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sm text-emerald-300 underline underline-offset-4">{pasteResult.url || pasteResult.pathUrl || pasteResult.subdomainUrl}</a>
                    <button onClick={() => navigator.clipboard.writeText(pasteResult.url || pasteResult.pathUrl || pasteResult.subdomainUrl)} className="mt-2 flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-medium text-black transition-all hover:bg-zinc-100"><Copy size={13} /> Copy URL</button>
                  </div>
                )}
              </div>

              {deployResult && (
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-100"><Globe size={16} /> Your app is live</div>
                  <a href={deployResult.url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sm text-emerald-300 underline underline-offset-4">{deployResult.url}</a>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => navigator.clipboard.writeText(deployResult.url)} className="flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-medium text-black transition-all hover:bg-zinc-100"><Copy size={13} /> Copy URL</button>
                    <Link to={`/marketplace/new?previewUrl=${encodeURIComponent(deployResult.url)}&title=${encodeURIComponent(creation?.title || 'My AlphaTekX creation')}`} className="flex min-h-9 items-center gap-2 rounded-lg border border-white/[.15] bg-white/[0.06] px-3 text-xs font-medium text-white transition-all hover:bg-white/[0.10]"><ShoppingBag size={13} /> List for sale</Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function AssistantMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 text-white"><Bot size={14} /></div>
      <div className="max-w-[85%] rounded-2xl border border-white/[.08] bg-white/[0.04] px-5 py-3 text-sm leading-7 text-white/90 ">
        {children}
      </div>
    </div>
  )
}

function EmptyPreview({ building, onBuild }: { building: boolean; onBuild?: () => void }) {
  return (
    <div className="grid h-full min-h-0 place-items-center p-8 text-center">
      <div>
        {building ? <LoaderCircle className="mx-auto animate-spin text-white/70" size={32}/> : <Code2 className="mx-auto text-white/35" size={32}/>}
        <h2 className="mt-4 text-xl font-semibold">{building ? 'Engineering your app...' : 'Your app will appear here'}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-white/55">{building ? 'Alpha is writing, testing, and refining your software.' : 'Click Build and Alpha will plan the architecture, then build it automatically.'}</p>
        {!building && onBuild && (
          <button onClick={onBuild} className="mt-5 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition-all hover:bg-zinc-100">Build</button>
        )}
      </div>
    </div>
  )
}

function PlanPanel({ mission, building, onBuild }: { mission: Mission; building: boolean; onBuild: () => void }) {
  const plan = mission.plan
  if (!plan) return null
  return (
    <div className="grid h-full min-h-0 place-items-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-white/[.12] bg-white/[0.04] p-6 ">
        <h2 className="text-lg font-semibold">{plan.title}</h2>
        <p className="mt-1 text-sm text-white/55">{plan.description}</p>
        <div className="mt-4 space-y-2">
          {plan.modules.map((m, i) => (
            <div key={m.id} className="flex items-start gap-3 rounded-xl border border-white/[.08] bg-white/[0.03] p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{i + 1}</span>
              <div>
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-white/55">{m.purpose}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <button onClick={onBuild} disabled={building} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-black transition-all hover:bg-zinc-100 disabled:opacity-50">
            {building ? <LoaderCircle className="animate-spin" size={14}/> : <Rocket size={14}/>} Build from this plan
          </button>
        </div>
      </div>
    </div>
  )
}


