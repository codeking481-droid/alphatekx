import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  Lock,
  Radar,
  RotateCcw,
  Send,
  ShieldCheck,
} from 'lucide-react'

type Severity = 'critical' | 'high' | 'medium' | 'low'

type Finding = {
  id: string
  type: string
  severity: Severity
  description: string
  count: number
  evidence: string
}

type FixItem = {
  findingId: string
  type: string
  severity: Severity
  description: string
  original: string
  fixed: string
}

type Summary = {
  issues_found: number
  issues_fixed: number
  files_modified: number
  before_score: number | null
  after_score: number | null
}

type ApiSuccess = {
  step: string
  status: 'success'
  state?: string
  sessionId?: string
  summary?: Summary
  message: string
  actions?: Array<{ id: string; label: string; url?: string }>
}

type DeliveryOption = 'github' | 'download' | 'code' | 'deploy'

const STEPS = [
  'Enter URL',
  'Scanning',
  'Results',
  'Generating',
  'Fixes Ready',
  'Applying',
  'Restored',
  'Delivery',
  'Verifying',
  'Done',
]

const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/25',
  high: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/25',
  medium: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25',
  low: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/25',
}

const TYPE_ICONS: Record<string, typeof FileText> = {
  corrupted_encoding: FileText,
  leaked_secret: Lock,
  mixed_content: Globe,
  missing_charset: FileText,
  missing_viewport: Globe,
  missing_title: FileText,
  missing_lang: FileText,
  missing_description: FileText,
  img_missing_alt: ImageIcon,
}

const DELIVERY_CARDS: { id: DeliveryOption; label: string; description: string; icon: typeof Github; accent: string }[] = [
  { id: 'github', label: 'GitHub Pull Request', description: 'Push fixes as a PR to your repository', icon: GitPullRequestIcon, accent: 'from-violet-500 to-indigo-500' },
  { id: 'download', label: 'Download ZIP', description: 'Get restored.zip with the fixed files', icon: Download, accent: 'from-blue-500 to-cyan-500' },
  { id: 'code', label: 'Copy Fixed Code', description: 'Copy the fixed HTML to your clipboard', icon: Code, accent: 'from-emerald-500 to-teal-500' },
  { id: 'deploy', label: 'Deploy Live', description: 'Publish to alphatekx.name.ng/app/{name}', icon: Send, accent: 'from-lime-400 to-emerald-500' },
]

function GitPullRequestIcon(props: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={props.size || 24} height={props.size || 24} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  )
}

function Github(props: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={props.size || 24} height={props.size || 24} fill="currentColor" className={props.className}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.02 1.76 2.69 1.25 3.35.96.1-.75.4-1.26.72-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.14c0 .3.21.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

async function enginePost<T extends ApiSuccess>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({ step: 'error', error: `Request failed (${res.status})`, action_required: 'retry', retry: true }))
  if (!res.ok || data.step === 'error') {
    const err = new Error(String(data.error || `Request failed (${res.status})`)) as Error & { actionRequired?: string }
    err.actionRequired = String(data.action_required || '')
    throw err
  }
  return data as T
}

export default function RestoreEngine() {
  const [uiStep, setUiStep] = useState(1)
  const [sessionId, setSessionId] = useState('')
  const [url, setUrl] = useState('')
  const [findings, setFindings] = useState<Finding[]>([])
  const [fixes, setFixes] = useState<FixItem[]>([])
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set())
  const [summary, setSummary] = useState<Summary>({ issues_found: 0, issues_fixed: 0, files_modified: 0, before_score: null, after_score: null })
  const [busy, setBusy] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorAction, setErrorAction] = useState('')
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null)
  const [expandedFix, setExpandedFix] = useState<string | null>(null)

  const [option, setOption] = useState<DeliveryOption | null>(null)
  const [actionCompleted, setActionCompleted] = useState(false)
  const [deliveryBusy, setDeliveryBusy] = useState(false)
  const [deliveryMessage, setDeliveryMessage] = useState('')
  const [prUrl, setPrUrl] = useState('')
  const [ghRepo, setGhRepo] = useState('')
  const [deployUrl, setDeployUrl] = useState('')
  const [deployName, setDeployName] = useState('')
  const [nameStatus, setNameStatus] = useState<{ checking: boolean; available: boolean | null; message: string; suggestions: string[] }>({ checking: false, available: null, message: '', suggestions: [] })
  const [copied, setCopied] = useState(false)

  const [verifyResult, setVerifyResult] = useState<{ target: string; degraded: boolean; remainingIssues: number; utf8Clean: boolean; remaining: Finding[] } | null>(null)

  const progressTimer = useRef<number | null>(null)
  const [progress, setProgress] = useState(0)

  const startFakeProgress = useCallback((label: string) => {
    setStatusText(label)
    setProgress(6)
    if (progressTimer.current) window.clearInterval(progressTimer.current)
    progressTimer.current = window.setInterval(() => {
      setProgress((p) => (p < 92 ? p + Math.max(1, Math.round((92 - p) * 0.06)) : p))
    }, 350)
  }, [])

  const stopFakeProgress = useCallback(() => {
    if (progressTimer.current) window.clearInterval(progressTimer.current)
    progressTimer.current = null
    setProgress(100)
  }, [])

  useEffect(() => () => { if (progressTimer.current) window.clearInterval(progressTimer.current) }, [])

  const fail = useCallback((err: unknown) => {
    const e = err as Error & { actionRequired?: string }
    setError(e.message || 'Something went wrong')
    setErrorAction(e.actionRequired || '')
  }, [])

  const resetAll = useCallback(() => {
    setUiStep(1); setSessionId(''); setUrl(''); setFindings([]); setFixes([])
    setEnabledIds(new Set()); setSummary({ issues_found: 0, issues_fixed: 0, files_modified: 0, before_score: null, after_score: null })
    setBusy(false); setStatusText(''); setError(null); setErrorAction('')
    setOption(null); setActionCompleted(false); setDeliveryBusy(false); setDeliveryMessage('')
    setPrUrl(''); setDeployUrl(''); setDeployName(''); setCopied(false); setVerifyResult(null); setProgress(0)
    setNameStatus({ checking: false, available: null, message: '', suggestions: [] })
  }, [])

  const handleStartScan = async () => {
    if (!url.trim() || busy) return
    setBusy(true); setError(null); setErrorAction(''); setFindings([]); setFixes([]); setUiStep(2)
    startFakeProgress(`Scanning ${url.trim()}...`)
    try {
      const session = await enginePost<ApiSuccess & { sessionId: string }>('/api/engine/session', {})
      setSessionId(session.sessionId)
      const scanned = await enginePost('/api/engine/scan', { sessionId: session.sessionId, url: url.trim() })
      stopFakeProgress()
      const stateRes = await fetch(`/api/engine/state?sessionId=${session.sessionId}`).then((r) => r.json())
      setFindings(stateRes.findings || [])
      setSummary(stateRes.summary || scanned.summary || summary)
      setUiStep(3)
    } catch (err) {
      stopFakeProgress(); fail(err); setUiStep(1)
    } finally { setBusy(false) }
  }

  const handleGenerateFixes = async () => {
    if (!sessionId || busy) return
    setBusy(true); setError(null); setUiStep(4)
    startFakeProgress('Generating deterministic fixes...')
    try {
      const result = await enginePost('/api/engine/fix', { sessionId })
      stopFakeProgress()
      const stateRes = await fetch(`/api/engine/state?sessionId=${sessionId}`).then((r) => r.json())
      setFixes(stateRes.fixes || [])
      setEnabledIds(new Set((stateRes.fixes || []).map((f: FixItem) => f.findingId)))
      setSummary(result.summary || summary)
      setUiStep(5)
    } catch (err) {
      stopFakeProgress(); fail(err); setUiStep(3)
    } finally { setBusy(false) }
  }

  const handleApplyFixes = async () => {
    if (!sessionId || busy) return
    setBusy(true); setError(null); setUiStep(6)
    startFakeProgress('Applying fixes with UTF-8 enforcement...')
    try {
      const disabled = fixes.filter((f) => !enabledIds.has(f.findingId)).map((f) => f.findingId)
      const result = await enginePost('/api/engine/approve', { sessionId, approved: true, disabled })
      stopFakeProgress()
      setSummary(result.summary || summary)
      setUiStep(7)
    } catch (err) {
      stopFakeProgress(); fail(err); setUiStep(5)
    } finally { setBusy(false) }
  }

  const handleSelectOption = async (next: DeliveryOption) => {
    if (!sessionId || busy) return
    setError(null); setOption(next); setActionCompleted(false); setDeliveryMessage(''); setCopied(false)
    try { await enginePost('/api/engine/delivery', { sessionId, option: next }); setUiStep(8) }
    catch (err) { fail(err) }
  }

  const handleGithubPush = async () => {
    if (!sessionId || deliveryBusy) return
    setDeliveryBusy(true); setError(null); setDeliveryMessage('')
    try {
      const result = await enginePost('/api/engine/github', { sessionId, repo: ghRepo })
      setPrUrl(result.actions?.find((a) => a.id === 'open_pr')?.url || '')
      setDeliveryMessage(result.message)
      setActionCompleted(true)
    } catch (err) { fail(err) } finally { setDeliveryBusy(false) }
  }

  const handleDownloadZip = () => {
    if (!sessionId) return
    const a = document.createElement('a')
    a.href = `/api/engine/download?sessionId=${sessionId}`
    a.download = 'restored.zip'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setDeliveryMessage('ZIP download started.')
    setActionCompleted(true)
  }

  const handleCopyCode = async () => {
    if (!sessionId || copied) return
    setError(null)
    try {
      const res = await fetch(`/api/engine/code?sessionId=${sessionId}`)
      const text = await res.text()
      await navigator.clipboard.writeText(text)
      await enginePost('/api/engine/action-complete', { sessionId })
      setCopied(true)
      setDeliveryMessage('Fixed code copied to clipboard.')
      setActionCompleted(true)
    } catch (err) { fail(err) }
  }

  const checkName = useCallback(async (raw: string) => {
    const slug = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    if (!slug || slug.length < 3) { setNameStatus({ checking: false, available: null, message: slug ? 'Name too short (min 3 characters).' : '', suggestions: [] }); return }
    setNameStatus((s) => ({ ...s, checking: true }))
    try {
      const res = await fetch(`/api/check-availability?name=${encodeURIComponent(slug)}`)
      const data = await res.json()
      setNameStatus({ checking: false, available: !!data.available, message: String(data.message || ''), suggestions: Array.isArray(data.suggestions) ? data.suggestions : [] })
    } catch {
      setNameStatus({ checking: false, available: null, message: 'Could not check name.', suggestions: [] })
    }
  }, [])

  useEffect(() => {
    if (option !== 'deploy') return
    const t = window.setTimeout(() => { void checkName(deployName) }, 400)
    return () => window.clearTimeout(t)
  }, [deployName, option, checkName])

  const handleDeployLive = async () => {
    if (!sessionId || deliveryBusy || nameStatus.available !== true) return
    setDeliveryBusy(true); setError(null); setDeliveryMessage('')
    try {
      const result = await enginePost('/api/engine/deploy', { sessionId, name: deployName.trim() })
      setDeployUrl(result.actions?.find((a) => a.id === 'open_site')?.url || '')
      setDeliveryMessage(result.message)
      setActionCompleted(true)
    } catch (err) { fail(err) } finally { setDeliveryBusy(false) }
  }

  const handleVerify = async () => {
    if (!sessionId || busy) return
    setBusy(true); setError(null); setUiStep(9)
    startFakeProgress(`Re-scanning ${deployUrl || url} to verify restoration...`)
    try {
      const result = await enginePost('/api/engine/verify', { sessionId })
      stopFakeProgress()
      setSummary(result.summary || summary)
      const stateRes = await fetch(`/api/engine/state?sessionId=${sessionId}`).then((r) => r.json())
      setVerifyResult(stateRes.verifyResult || null)
      setUiStep(10)
    } catch (err) {
      stopFakeProgress(); fail(err); setUiStep(8)
    } finally { setBusy(false) }
  }

  const scoreTone = (score: number | null) => {
    if (score === null) return 'text-slate-400'
    if (score >= 80) return 'text-lime-300'
    if (score >= 60) return 'text-amber-300'
    return 'text-rose-300'
  }

  const severityCounts = (items: Finding[]) => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const f of items) counts[f.severity] = (counts[f.severity] || 0) + 1
    return counts
  }

  const renderFindings = (items: Finding[], keyPrefix: string) => (
    <div className="space-y-2">
      {items.map((f) => {
        const Icon = TYPE_ICONS[f.type] || FileText
        const expanded = expandedFinding === `${keyPrefix}-${f.id}`
        return (
          <div key={`${keyPrefix}-${f.id}`} className="rounded-2xl border border-white/10 bg-white/[0.02]">
            <button type="button" onClick={() => setExpandedFinding(expanded ? null : `${keyPrefix}-${f.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${SEVERITY_TONE[f.severity]}`}><Icon size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">{f.description}</p>
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">{f.type}{f.count > 1 ? ` x${f.count}` : ''}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${SEVERITY_TONE[f.severity]}`}>{f.severity}</span>
              {expanded ? <ChevronUp size={16} className="shrink-0 text-zinc-500" /> : <ChevronDown size={16} className="shrink-0 text-zinc-500" />}
            </button>
            {expanded && f.evidence && (
              <div className="border-t border-white/5 px-4 py-3">
                <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-zinc-300">{f.evidence}</pre>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <main className="min-h-screen w-full bg-[#0D0D0D] px-4 pb-16 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        <nav className="mb-8 flex flex-wrap items-center gap-1.5">
          {STEPS.map((label, i) => {
            const num = i + 1
            const active = uiStep === num
            const done = uiStep > num
            return (
              <div key={label} className="flex items-center gap-1.5">
                {i > 0 && <div className={`h-[2px] w-4 sm:w-6 ${done ? 'bg-[#D6FF00]' : 'bg-white/10'}`} />}
                <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider ${
                  active ? 'bg-[#D6FF00] text-black shadow-[0_8px_24px_rgba(214,255,0,0.35)]' : done ? 'bg-[#D6FF00]/15 text-[#D6FF00]' : 'bg-white/5 text-zinc-500'}`}>
                  {done ? <CheckCircle2 size={12} /> : <span className="grid size-4 place-items-center rounded-full bg-black/20 text-[9px]">{num}</span>}
                  <span className="hidden sm:inline">{label}</span>
                </div>
              </div>
            )
          })}
        </nav>

        {error && uiStep !== 8 && (
          <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-500/5 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-300" />
              <div>
                <p className="text-sm text-rose-100">{error}</p>
                {errorAction && <p className="mt-1 text-xs text-rose-300/70">Action required: {errorAction.replace(/_/g, ' ')}</p>}
              </div>
              <button type="button" onClick={() => { setError(null); setErrorAction('') }} className="ml-auto text-xs text-zinc-500 hover:text-white">Dismiss</button>
            </div>
          </div>
        )}

        {uiStep === 1 && (
          <section className="rounded-[28px] border border-[#D6FF00]/20 bg-[radial-gradient(circle_at_top,_rgba(214,255,0,0.12),_rgba(13,13,13,0.95)_40%)] p-6 sm:p-10">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D6FF00]">AlphaTekX Restoration Engine</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Restore any website.<br />Step by step.</h1>
            <p className="mt-4 max-w-xl text-sm text-zinc-400">
              Enter a live URL. The engine scans for encoding corruption, leaked secrets, broken meta tags, and more — applies UTF-8-safe fixes, and delivers them your way.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleStartScan()}
                placeholder="https://example.com" disabled={busy}
                className="min-h-[56px] flex-1 rounded-2xl border border-white/10 bg-black/40 px-5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-[#D6FF00]/50" />
              <button type="button" onClick={handleStartScan} disabled={busy || !url.trim()}
                className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-[#D6FF00] px-8 text-sm font-black text-black shadow-[0_18px_38px_rgba(214,255,0,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
                <Radar size={16} /> Start Scan
              </button>
            </div>
          </section>
        )}

        {(uiStep === 2 || uiStep === 4 || uiStep === 6 || uiStep === 9) && (
          <section className="rounded-[28px] border border-white/10 bg-[#111111] p-6 sm:p-10">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-black sm:text-2xl">{statusText || 'Working...'}</h2>
              <span className="rounded-full bg-[#D6FF00]/15 px-3 py-1.5 text-xs font-black text-[#D6FF00]">{progress}%</span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-white/5">
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#D6FF00] to-emerald-400 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-6 space-y-2">
              {(uiStep === 6
                ? ['Stripping BOM and null bytes', 'Enforcing UTF-8 encoding', 'Validating restored HTML', 'Writing restored files']
                : uiStep === 9
                  ? ['Fetching live page', 'Re-running issue detection', 'Comparing before/after scores']
                  : ['Connecting to target', 'Analyzing page source', 'Compiling report']
              ).map((msg, i) => (
                <div key={msg} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5">
                  <Loader2 size={13} className="animate-spin text-[#D6FF00]" style={{ animationDelay: `${i * 150}ms` }} />
                  <p className="text-xs text-zinc-300">{msg}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {uiStep === 3 && (
          <section className="rounded-[28px] border border-white/10 bg-[#111111] p-6 sm:p-10">
            <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D6FF00]">Step 3 — Scan Results</p>
                <h2 className="mt-2 break-all text-2xl font-black">{url}</h2>
                <div className="mt-3 flex items-center gap-3">
                  <span className={`text-4xl font-black ${scoreTone(summary.before_score)}`}>{summary.before_score ?? '--'}</span>
                  <span className="text-sm text-zinc-500">/ 100 health score</span>
                </div>
              </div>
              <button type="button" onClick={resetAll} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-zinc-400 hover:text-white"><RotateCcw size={12} className="mr-1 inline" />New Scan</button>
            </header>

            <div className="mb-6 grid grid-cols-4 gap-2">
              {(['critical', 'high', 'medium', 'low'] as Severity[]).map((sev) => (
                <div key={sev} className={`rounded-xl p-3 text-center ${SEVERITY_TONE[sev]}`}>
                  <div className="text-xl font-black">{severityCounts(findings)[sev]}</div>
                  <div className="text-[10px] font-black uppercase tracking-wider opacity-70">{sev}</div>
                </div>
              ))}
            </div>

            {findings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#D6FF00]/30 bg-[#D6FF00]/5 p-8 text-center">
                <CheckCircle2 size={32} className="mx-auto mb-3 text-[#D6FF00]" />
                <p className="text-lg font-black">All Clear</p>
                <p className="mt-1 text-sm text-zinc-400">No issues found on this site.</p>
              </div>
            ) : renderFindings(findings, 'scan')}

            {findings.length > 0 && (
              <button type="button" onClick={handleGenerateFixes} disabled={busy}
                className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-[#D6FF00] px-8 py-3.5 text-sm font-black text-black shadow-[0_18px_38px_rgba(214,255,0,0.25)] transition hover:brightness-110 disabled:opacity-40">
                Generate Fixes <ArrowRight size={16} />
              </button>
            )}
          </section>
        )}

        {uiStep === 5 && (
          <section className="rounded-[28px] border border-white/10 bg-[#111111] p-6 sm:p-10">
            <header className="mb-6">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D6FF00]">Step 5 — Fixes Ready</p>
              <h2 className="mt-2 text-2xl font-black">{fixes.length} fix{fixes.length !== 1 ? 'es' : ''} generated</h2>
              <p className="mt-1 text-sm text-zinc-400">Toggle individual fixes, then approve to apply.</p>
            </header>

            <div className="space-y-3">
              {fixes.map((fix) => {
                const Icon = TYPE_ICONS[fix.type] || FileText
                const enabled = enabledIds.has(fix.findingId)
                const expanded = expandedFix === fix.findingId
                return (
                  <div key={fix.findingId} className={`rounded-2xl border transition ${enabled ? 'border-[#D6FF00]/30 bg-[#D6FF00]/[0.04]' : 'border-white/10 bg-white/[0.01] opacity-60'}`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button type="button" onClick={() => setEnabledIds((prev) => { const n = new Set(prev); if (n.has(fix.findingId)) n.delete(fix.findingId); else n.add(fix.findingId); return n })}
                        className={`grid size-5 shrink-0 place-items-center rounded-md border transition ${enabled ? 'border-[#D6FF00] bg-[#D6FF00] text-black' : 'border-white/20'}`}>
                        {enabled && <Check size={13} />}
                      </button>
                      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${SEVERITY_TONE[fix.severity]}`}><Icon size={14} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white">{fix.description}</p>
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500">{fix.type}</p>
                      </div>
                      <button type="button" onClick={() => setExpandedFix(expanded ? null : fix.findingId)} className="shrink-0 text-zinc-500">
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                    {expanded && (
                      <div className="grid gap-3 border-t border-white/5 px-4 py-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-rose-300">Before</p>
                          <pre className="overflow-x-auto rounded-xl border border-rose-400/20 bg-rose-500/5 p-3 font-mono text-xs leading-5 text-rose-200">{fix.original}</pre>
                        </div>
                        <div>
                          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-emerald-300">After</p>
                          <pre className="overflow-x-auto rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3 font-mono text-xs leading-5 text-emerald-200">{fix.fixed}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <button type="button" onClick={handleApplyFixes} disabled={busy || enabledIds.size === 0}
              className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-[#D6FF00] px-8 py-3.5 text-sm font-black text-black shadow-[0_18px_38px_rgba(214,255,0,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
              Approve & Apply {enabledIds.size} Fix{enabledIds.size !== 1 ? 'es' : ''} <ArrowRight size={16} />
            </button>
          </section>
        )}

        {uiStep === 7 && (
          <section className="rounded-[28px] border border-[#D6FF00]/25 bg-[radial-gradient(circle_at_top,_rgba(214,255,0,0.1),_rgba(13,13,13,0.95)_45%)] p-6 text-center sm:p-10">
            <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full border border-[#D6FF00]/30 bg-[#D6FF00]/10 text-[#D6FF00]"><ShieldCheck size={40} /></div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D6FF00]">Step 7 — Restoration Complete</p>
            <h2 className="mt-2 text-3xl font-black">Your site has been restored</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-zinc-400">
              {summary.issues_fixed} fix{summary.issues_fixed !== 1 ? 'es' : ''} applied with strict UTF-8 enforcement (BOM-free, null-byte-free, no corrupted characters).
            </p>
            <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Issues Fixed</p>
                <p className="mt-1 text-2xl font-black text-[#D6FF00]">{summary.issues_fixed}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Files Modified</p>
                <p className="mt-1 text-2xl font-black text-white">{summary.files_modified}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Before Score</p>
                <p className={`mt-1 text-2xl font-black ${scoreTone(summary.before_score)}`}>{summary.before_score ?? '--'}</p>
              </div>
            </div>

            <p className="mt-10 text-sm font-black text-zinc-300">How would you like to receive your fixes?</p>
            <div className="mx-auto mt-4 grid max-w-3xl gap-4 sm:grid-cols-2">
              {DELIVERY_CARDS.map((card) => {
                const Icon = card.icon
                return (
                  <button key={card.id} type="button" onClick={() => handleSelectOption(card.id)}
                    className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-left transition hover:border-[#D6FF00]/40 hover:bg-[#D6FF00]/[0.04]">
                    <div className={`mb-4 grid size-12 place-items-center rounded-xl bg-gradient-to-br ${card.accent} text-white shadow-lg`}><Icon size={22} /></div>
                    <h3 className="text-base font-black group-hover:text-[#D6FF00]">{card.label}</h3>
                    <p className="mt-1 text-xs text-zinc-400">{card.description}</p>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {uiStep === 8 && option && (
          <section className="rounded-[28px] border border-white/10 bg-[#111111] p-6 sm:p-10">
            <header className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D6FF00]">Step 8 — {DELIVERY_CARDS.find((c) => c.id === option)?.label}</p>
                <h2 className="mt-2 text-2xl font-black">Complete the action to continue</h2>
              </div>
              <button type="button" onClick={() => { setOption(null); setUiStep(7); setActionCompleted(false) }} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-zinc-400 hover:text-white">Change</button>
            </header>

            {error && (
              <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-500/5 p-4">
                <p className="text-sm text-rose-100">{error}</p>
                {errorAction === 'connect_github' && (
                  <a href="/api/auth/github" className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/20"><Github size={14} /> Connect GitHub Account</a>
                )}
              </div>
            )}

            {option === 'github' && (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-zinc-500">Repository (owner/repo)</span>
                  <input value={ghRepo} onChange={(e) => setGhRepo(e.target.value)}
                    placeholder="your-name/your-repo"
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm outline-none focus:border-[#D6FF00]/50" />
                </label>
                <button type="button" onClick={handleGithubPush} disabled={deliveryBusy || !ghRepo.trim()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white transition hover:brightness-110 disabled:opacity-40">
                  {deliveryBusy ? <Loader2 size={16} className="animate-spin" /> : <GitPullRequestIcon size={16} />}
                  {deliveryBusy ? 'Creating PR...' : 'Create Pull Request'}
                </button>
                {deliveryMessage && (
                  <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                    <span>{deliveryMessage}</span>
                    {prUrl && <a href={prUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-black text-emerald-300 underline">Open PR <ExternalLink size={12} /></a>}
                  </div>
                )}
              </div>
            )}

            {option === 'download' && (
              <div className="rounded-2xl border border-blue-400/15 bg-blue-500/5 p-6 text-center">
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full border border-blue-400/30 bg-blue-500/10 text-blue-300"><Download size={28} /></div>
                <h3 className="text-xl font-black">Download restored.zip</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">Contains index.html (fixed), README.txt, and the full restore report.</p>
                <button type="button" onClick={handleDownloadZip}
                  className="mx-auto mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-3 text-sm font-black text-white transition hover:brightness-110">
                  <Download size={16} /> Download ZIP
                </button>
                {deliveryMessage && <p className="mt-4 text-sm text-emerald-300">{deliveryMessage}</p>}
              </div>
            )}

            {option === 'code' && (
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 p-6 text-center">
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300"><Code size={28} /></div>
                <h3 className="text-xl font-black">Copy the fixed HTML</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">The complete restored file will be copied to your clipboard, ready to paste into your editor.</p>
                <button type="button" onClick={handleCopyCode} disabled={copied}
                  className="mx-auto mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-black text-white transition hover:brightness-110 disabled:opacity-60">
                  {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />} {copied ? 'Copied!' : 'Copy Fixed Code'}
                </button>
                {deliveryMessage && <p className="mt-4 text-sm text-emerald-300">{deliveryMessage}</p>}
              </div>
            )}

            {option === 'deploy' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Deploy URL format</p>
                  <p className="mt-1 font-mono text-xs text-[#D6FF00]">https://alphatekx.name.ng/app/{deployName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || '{name}'}</p>
                  <label className="mt-4 block">
                    <span className="mb-1 block text-[11px] font-medium text-zinc-500">Site name</span>
                    <input value={deployName} onChange={(e) => setDeployName(e.target.value)}
                      placeholder="my-restored-site"
                      className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm outline-none focus:border-[#D6FF00]/50" />
                  </label>
                  {nameStatus.checking && <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500"><Loader2 size={12} className="animate-spin" /> Checking availability...</p>}
                  {!nameStatus.checking && nameStatus.message && (
                    <p className={`mt-2 text-xs font-bold ${nameStatus.available ? 'text-emerald-300' : nameStatus.available === false ? 'text-rose-300' : 'text-zinc-500'}`}>{nameStatus.message}</p>
                  )}
                  {!nameStatus.checking && nameStatus.suggestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {nameStatus.suggestions.map((s) => (
                        <button key={s} type="button" onClick={() => setDeployName(s)} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-zinc-300 hover:border-[#D6FF00]/40">{s}</button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" onClick={handleDeployLive} disabled={deliveryBusy || nameStatus.available !== true}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-lime-400 to-emerald-500 px-6 py-3 text-sm font-black text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
                  {deliveryBusy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {deliveryBusy ? 'Deploying...' : 'Deploy Now'}
                </button>
                {deliveryMessage && (
                  <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                    <span>{deliveryMessage}</span>
                    {deployUrl && <a href={deployUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-black text-emerald-300 underline">Open Site <ExternalLink size={12} /></a>}
                  </div>
                )}
              </div>
            )}

            <div className="mt-10 border-t border-white/5 pt-6">
              <button type="button" onClick={handleVerify} disabled={!actionCompleted || busy}
                title={actionCompleted ? 'Verify the restoration' : 'Complete the action above first'}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#D6FF00] px-8 py-3.5 text-sm font-black text-black shadow-[0_18px_38px_rgba(214,255,0,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30">
                Continue: Verify Restoration <ArrowRight size={16} />
              </button>
              {!actionCompleted && <p className="mt-2 text-xs text-zinc-500">Complete the action above to unlock verification.</p>}
            </div>
          </section>
        )}

        {uiStep === 10 && (
          <section className="rounded-[28px] border border-[#D6FF00]/25 bg-[radial-gradient(circle_at_top,_rgba(214,255,0,0.1),_rgba(13,13,13,0.95)_45%)] p-6 text-center sm:p-10">
            <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full border border-[#D6FF00]/30 bg-[#D6FF00]/10 text-[#D6FF00]"><CheckCircle2 size={40} /></div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D6FF00]">Step 10 — Verification Complete</p>
            <h2 className="mt-2 text-3xl font-black">Restoration verified</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-zinc-400">
              {verifyResult?.degraded
                ? 'Verified against the locally restored code (live re-fetch was unavailable).'
                : `Re-scanned ${verifyResult?.target || url} — ${verifyResult?.remainingIssues ?? 0} remaining issue${(verifyResult?.remainingIssues ?? 0) === 1 ? '' : 's'}.`}
            </p>

            <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Before Score</p>
                <p className={`mt-2 text-4xl font-black ${scoreTone(summary.before_score)}`}>{summary.before_score ?? '--'}</p>
              </div>
              <div className="rounded-2xl border border-[#D6FF00]/25 bg-[#D6FF00]/5 p-6">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#D6FF00]/70">After Score</p>
                <p className={`mt-2 text-4xl font-black ${scoreTone(summary.after_score)}`}>{summary.after_score ?? '--'}</p>
              </div>
            </div>

            <div className="mx-auto mt-4 flex max-w-md items-center justify-center gap-2 text-xs">
              {verifyResult?.utf8Clean ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 font-black text-emerald-300"><CheckCircle2 size={12} /> UTF-8 Clean</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 font-black text-amber-300"><AlertTriangle size={12} /> Encoding needs review</span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-black text-zinc-300">{summary.issues_found} found / {summary.issues_fixed} fixed</span>
            </div>

            <div className="mx-auto mt-8 flex max-w-md flex-col gap-3">
              {prUrl && <a href={prUrl} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white transition hover:brightness-110"><ExternalLink size={16} /> Open Pull Request</a>}
              {deployUrl && <a href={deployUrl} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-lime-400 to-emerald-500 px-6 py-3 text-sm font-black text-black transition hover:brightness-110"><ExternalLink size={16} /> Open Live Site</a>}
              <a href="/chat" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-black text-white transition hover:bg-white/[0.07]"><LayoutDashboard size={16} /> Back to Dashboard</a>
              <button type="button" onClick={resetAll} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6FF00] px-6 py-3 text-sm font-black text-black shadow-[0_18px_38px_rgba(214,255,0,0.25)] transition hover:brightness-110"><Radar size={16} /> Restore Another Site</button>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
