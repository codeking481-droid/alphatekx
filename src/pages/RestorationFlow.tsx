import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  GitPullRequest,
  Github,
  Image,
  Link,
  Loader2,
  Lock,
  Radar,
  Scan,
  ShieldCheck,
  Shield,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Wand2,
  Zap,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { getCredits, hydrateCredits, subscribeCredits } from '../lib/creditStore'
import BeforeAfter from '../components/scan/BeforeAfter'
import CreditsExhaustedModal from '../components/CreditsExhaustedModal'

// --- Types ---

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

type Finding = {
  id: string
  type: string
  severity: Severity
  url: string
  description: string
  line?: number | null
  snippet?: string | null
  fix?: string | null
}

type FixItem = {
  findingId: string
  findingType: string
  severity: Severity
  url: string
  original: string
  fixed: string
  description: string
  enabled?: boolean
}

type FixReport = {
  fixId: string
  scanId: string
  targetUrl: string
  generatedAt: string
  stats: {
    total: number
    generated: number
    skipped: number
    categories: Record<string, { total: number; generated: number; skipped: number }>
  }
  fixes: FixItem[]
  summary: string
}

type GitHubRepo = {
  full_name: string
  default_branch: string
  private: boolean
  description: string
  html_url: string
}

type PRResult = {
  prNumber?: number
  prUrl?: string
  prTitle?: string
  branchName?: string
  baseBranch?: string
  filesChanged?: number
  fixesApplied?: number
  noChanges?: boolean
  error?: boolean
}

type Step =
  | 'input'
  | 'scanning'
  | 'results'
  | 'generating'
  | 'preview'
  | 'approval'
  | 'applying'
  | 'github-setup'
  | 'pushing'
  | 'complete'

// --- Constants ---

const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/20',
  high: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/20',
  medium: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/20',
  low: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/20',
  info: 'bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/20',
}

const TYPE_ICONS: Record<string, typeof Bug> = {
  broken_link: Link,
  secret: Lock,
  leaked_secret: Lock,
  cve: Bug,
  bad_code: FileText,
  performance: Zap,
  meta: FileText,
  image: Image,
  accessibility: ShieldCheck,
}

const TYPE_LABELS: Record<string, string> = {
  broken_link: 'Broken Link',
  secret: 'Leaked Secret',
  leaked_secret: 'Leaked Secret',
  cve: 'CVE Vulnerability',
  bad_code: 'Bad Code Pattern',
  performance: 'Performance',
  meta: 'Meta Tag Issue',
  image: 'Broken Image',
  accessibility: 'Accessibility',
}

const STEP_META: { key: Step; label: string }[] = [
  { key: 'input', label: 'Scan' },
  { key: 'scanning', label: 'Scanning' },
  { key: 'results', label: 'Results' },
  { key: 'generating', label: 'Generating' },
  { key: 'preview', label: 'Preview' },
  { key: 'approval', label: 'Approve' },
  { key: 'applying', label: 'Applying' },
  { key: 'github-setup', label: 'GitHub' },
  { key: 'pushing', label: 'Push' },
  { key: 'complete', label: 'Done' },
]

const STEP_ORDER: Step[] = STEP_META.map((s) => s.key)
// --- Component ---

export default function RestorationFlow() {
  const { user, loading: authLoading } = useAuth()

  const [step, setStep] = useState<Step>('input')
  const [url, setUrl] = useState('')
  const [scanId, setScanId] = useState<string | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])
  const [fixReport, setFixReport] = useState<FixReport | null>(null)
  const [enabledFixes, setEnabledFixes] = useState<Set<string>>(new Set())
  const [score, setScore] = useState<number | null>(null)
  const [risk, setRisk] = useState<string | null>(null)
  const [scannedUrl, setScannedUrl] = useState('')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isFixing, setIsFixing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [credits, setCreditsState] = useState(() => getCredits() || 0)
  const [showCreditsModal, setShowCreditsModal] = useState(false)
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null)
  const [expandedFix, setExpandedFix] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [ghConnected, setGhConnected] = useState<boolean | null>(null)
  const [ghUser, setGhUser] = useState<{ login: string; avatar_url: string } | null>(null)
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoConfirmed, setRepoConfirmed] = useState(false)
  const [prResult, setPrResult] = useState<PRResult | null>(null)
  const [prLogs, setPrLogs] = useState<Array<{ text: string; step?: number; total?: number }>>([])

  useEffect(() => {
    let unsub: (() => void) | null = null
    const load = async () => {
      try { const bal = await hydrateCredits(); setCreditsState(bal) } catch {}
    }
    load()
    unsub = subscribeCredits(() => setCreditsState(getCredits()))
    return () => { unsub?.() }
  }, [])

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    for (const f of findings) counts[f.severity]++
    return counts
  }, [findings])

  const fixableCount = useMemo(() => {
    if (!fixReport) return 0
    return fixReport.fixes.filter((f) => enabledFixes.has(f.findingId)).length
  }, [fixReport, enabledFixes])

  const scoreColor = useMemo(() => {
    if (score === null) return 'text-slate-400'
    if (score >= 80) return 'text-emerald-300'
    if (score >= 60) return 'text-amber-300'
    return 'text-rose-300'
  }, [score])

  // --- STEP 1+2: SCAN ---
  const handleScan = async () => {
    if (!url.trim()) return
    const activeEmail = String(user?.email || '').trim().toLowerCase()
    if (authLoading || !activeEmail) { setError('Please sign in to continue scanning.'); return }

    try {
      const checkRes = await fetch('/api/check-credits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: activeEmail }),
      })
      if (!checkRes.ok) {
        const d = await checkRes.json().catch(() => ({ error: 'Auth required' }))
        setError(d.error || 'Please sign in'); return
      }
      const d = await checkRes.json()
      if ((d.credits || 0) < 1) { setShowCreditsModal(true); return }
    } catch { setError('Could not verify credits'); return }

    setStep('scanning'); setIsScanning(true); setError(null)
    setFindings([]); setFixReport(null); setScore(null); setRisk(null)
    setProgress(5); setStatus('Validating target URL...')

    const controller = new AbortController(); abortRef.current = controller

    try {
      const scanRes = await fetch('/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), email: activeEmail, fingerprint: localStorage.getItem('device_fingerprint') || '' }),
        signal: controller.signal,
      })

      if (scanRes.status === 402 || scanRes.status === 403) {
        const d = await scanRes.json().catch(() => ({ error: 'Access denied' }))
        setStep('input'); setError(d.error || `HTTP ${scanRes.status}`); setIsScanning(false); setProgress(0); return
      }
      if (!scanRes.ok) {
        const d = await scanRes.json().catch(() => ({ error: 'Scan failed' }))
        setStep('input'); setError(d.error || `Scan failed (${scanRes.status})`); setIsScanning(false); setProgress(0); return
      }

      const reader = scanRes.body?.getReader()
      if (!reader) { setStep('input'); setError('No response stream'); setIsScanning(false); setProgress(0); return }

      const decoder = new TextDecoder(); let buffer = ''; let lastEvent = Date.now()
      let receivedDone = false; let receivedError: string | null = null

      const staleCheck = () => {
        const elapsed = Date.now() - lastEvent
        if (elapsed > 90000) throw new Error('Scan timed out.')
        if (elapsed > 45000) setStatus('Still scanning — hang tight.')
      }

      while (true) {
        const race = await Promise.race([
          reader.read(),
          new Promise<{ value: undefined; done: false; timedOut: true }>((r) => setTimeout(() => r({ value: undefined, done: false, timedOut: true }), 5000)),
        ])
        if (race.timedOut) { staleCheck(); continue }
        if (race.done) break
        lastEvent = Date.now()
        buffer += decoder.decode(race.value, { stream: true })
        const parts = buffer.split('\n\n'); buffer = parts.pop() || ''

        for (const part of parts) {
          const lines = part.split('\n').filter(Boolean)
          const event = lines.find((l) => l.startsWith('data:'))
          if (!event) continue
          try {
            const payload = JSON.parse(event.replace(/^data:\s*/, ''))
            if (payload.type === 'error' || payload.error) { receivedError = String(payload.error || 'Scan failed'); break }
            if (payload.type === 'progress') { setProgress(Number(payload.progress || 0)); setStatus(payload.message || 'Scanning...') }
            if (payload.type === 'started') { setScanId(String(payload.scanId || '')) }
            if (payload.type === 'finding') {
              setFindings((curr) => [{
                id: payload.id || `f-${curr.length}`, type: payload.findingType || payload.type || 'unknown',
                severity: payload.severity || 'info', url: payload.url || '',
                description: payload.title || payload.meaning || 'Finding',
                line: payload.lineNumber ?? null, snippet: payload.maskedProof ?? null, fix: payload.fix ?? null,
              }, ...curr])
            }
            if (payload.type === 'done') {
              receivedDone = true; setScore(Number(payload.score ?? 0)); setRisk(String(payload.risk || ''))
              setScannedUrl(String(payload.scannedUrl || '')); setProgress(100); setStatus('Scan complete')
              if (payload.creditsRemaining !== undefined) {
                const bal = Math.max(0, payload.creditsRemaining)
                setCreditsState(bal); localStorage.setItem('user_credits', String(bal))
              }
            }
          } catch {}
        }
      }

      if (receivedError) { setError(receivedError); setStep('input') }
      else if (receivedDone) { setStep('results') }
      else { setError('Scan ended before it finished'); setStep('input') }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed'); setStep('input')
    } finally { setIsScanning(false); setProgress(0); abortRef.current = null }
  }
  // --- STEP 3: GENERATE FIXES ---
  const handleGenerateFixes = async () => {
    setIsFixing(true); setError(null); setFixReport(null); setStep('generating')
    try {
      const body: Record<string, unknown> = {}
      if (scanId) body.scanId = scanId
      else body.scanReport = { scanId: '', scannedUrl: url, findings }

      const res = await fetch('/api/fix/auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Fix generation failed'); setStep('results'); return }

      const report: FixReport = data.fixReport || data
      const enabled = new Set<string>(); for (const fix of report.fixes) enabled.add(fix.findingId)
      setEnabledFixes(enabled); setFixReport(report); setStep('preview')

      if (scanId || url) {
        fetch('/api/screenshot/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, scanId: scanId || undefined, label: 'after' }) }).catch(() => {})
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Fix generation failed'); setStep('results') }
    finally { setIsFixing(false) }
  }

  // --- STEP 4+5: PREVIEW + APPROVAL ---
  const handleProceedToApproval = () => { setStep('approval') }
  const handleApprove = () => { setStep('applying'); handleApplyFixes() }
  const handleReject = () => { setStep('results'); setFixReport(null) }

  // --- STEP 6: APPLY FIXES ---
  const handleApplyFixes = async () => {
    setIsApplying(true); setError(null)
    try {
      const res = await fetch('/api/fix/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixId: fixReport?.fixId, scanId, enabledFixes: Array.from(enabledFixes) }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Apply failed'); setStep('approval'); return }
      setStep('github-setup'); checkGitHubConnection()
    } catch (e) { setError(e instanceof Error ? e.message : 'Apply failed'); setStep('approval') }
    finally { setIsApplying(false) }
  }

  // --- STEP 7: GITHUB CONNECTION ---
  const checkGitHubConnection = async () => {
    try {
      const res = await fetch('/api/github/status', { credentials: 'include' })
      const data = await res.json()
      setGhConnected(data.connected)
      if (data.user) setGhUser(data.user)
      if (data.connected) fetchRepos()
    } catch { setGhConnected(false) }
  }

  const handleConnectGitHub = () => { window.location.href = '/api/auth/github' }

  const fetchRepos = useCallback(async () => {
    setLoadingRepos(true)
    try {
      const res = await fetch('/api/github/repos', { credentials: 'include' })
      const data = await res.json(); setGhRepos(data.repos || [])
    } catch { setError('Failed to load repositories') }
    finally { setLoadingRepos(false) }
  }, [])

  const handleSelectRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo.full_name); setSelectedBranch(repo.default_branch)
    setRepoDropdownOpen(false); setRepoConfirmed(false)
  }

  const handleContinueToPush = () => {
    if (selectedRepo && repoConfirmed) { setStep('pushing'); handleCreatePR() }
  }

  // --- STEP 8: PUSH TO GITHUB ---
  const handleCreatePR = async () => {
    if (!selectedRepo || !fixReport) return
    setPrLogs([]); setPrResult(null); setError(null)

    try {
      const res = await fetch('/api/github/create-pr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ repoFullName: selectedRepo, fixReport, scanId: fixReport.scanId }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setError(errData.error || `HTTP ${res.status}`); return
      }
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')
      const decoder = new TextDecoder(); let buffer = ''

      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'log') setPrLogs((p) => [...p, { text: event.text, step: event.step, total: event.total }])
              else if (event.type === 'error') setError(event.message)
              else if (event.type === 'done') { setPrResult(event.data); setStep('complete') }
            } catch {}
          }
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'PR creation failed') }
  }

  const handleReset = () => {
    setStep('input'); setUrl(''); setScanId(null); setFindings([]); setFixReport(null)
    setEnabledFixes(new Set()); setScore(null); setRisk(null); setScannedUrl('')
    setError(null); setProgress(0); setStatus(''); 
    setPrResult(null); setPrLogs([]); setSelectedRepo(''); setSelectedBranch('')
    setRepoConfirmed(false); setGhConnected(null); setGhUser(null); setGhRepos([])
  }

  // --- Render ---
  return (
    <main className="w-full bg-[#0A0A14] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">        {/* --- Step indicator --- */}
        <nav className="mb-8 flex items-center gap-1 overflow-x-auto pb-2">
          {STEP_META.map((s, i) => {
            const active = step === s.key
            const done = STEP_ORDER.indexOf(step) > i
            return (
              <div key={s.key} className="flex items-center gap-1">
                {i > 0 && <div className={`h-[2px] w-6 ${done ? 'bg-violet-400' : 'bg-white/10'}`} />}
                <button type="button" disabled={!done && !active}
                  onClick={() => done && setStep(s.key)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition ${
                    active ? 'bg-violet-500 text-white shadow-[0_8px_24px_rgba(109,40,217,0.4)]'
                    : done ? 'bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 cursor-pointer'
                    : 'bg-white/5 text-slate-500 cursor-default'}`}>
                  {done ? <CheckCircle2 size={12} /> : <span className="grid size-4 place-items-center rounded-full bg-white/10 text-[9px]">{i + 1}</span>}
                  {s.label}
                </button>
              </div>
            )
          })}
        </nav>

        {/* ===== STEP: INPUT ===== */}
        {step === 'input' && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[radial-gradient(circle_at_top,_rgba(123,92,255,0.38),_rgba(17,19,31,0.9)_36%,_rgba(2,6,14,1)_72%)] p-5 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            <header className="mb-6">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Content Restoration</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">Scan - Fix - Apply - Push</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-400">
                Enter a live URL. We scan for broken links, leaked secrets, bad code, performance issues, and more - then generate one-click fixes.
              </p>
            </header>
            <div className="flex flex-col gap-3 rounded-[20px] border border-violet-300/15 bg-[#111522]/70 p-3 sm:flex-row sm:items-center">
              <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                placeholder="https://example.com" disabled={isScanning}
                className="min-h-[52px] flex-1 rounded-full border border-violet-200/15 bg-black/20 px-5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-violet-300/40 disabled:opacity-50" />
              <button type="button" onClick={handleScan} disabled={isScanning || !url.trim() || authLoading || !user?.email}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                <Radar size={16} />
                {isScanning ? 'Scanning...' : authLoading ? 'Checking sign-in...' : !user?.email ? 'Sign in to scan' : 'Scan Site'}
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 font-black text-emerald-300">{credits} Credits</span>
              <span>1 credit per scan - fixes are free</span>
            </div>
            {error && <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>}
          </section>
        )}

        {/* ===== STEP: SCANNING ===== */}
        {step === 'scanning' && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-5 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Scanning</p>
                <h2 className="mt-2 text-2xl font-black text-white">{url}</h2>
              </div>
              <span className="rounded-full bg-violet-500/15 px-3 py-1.5 text-xs font-black text-violet-300">{progress}%</span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-white/5">
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-4 text-sm text-slate-400">{status}</p>
            {findings.length > 0 && (
              <div className="mt-6 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Live findings ({findings.length})</p>
                <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                  {findings.map((f) => {
                    const Icon = TYPE_ICONS[f.type] || Bug
                    return (
                      <div key={f.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${SEVERITY_TONE[f.severity]}`}><Icon size={14} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-black text-white">{f.description}</p>
                          <p className="truncate text-[11px] text-slate-500">{TYPE_LABELS[f.type] || f.type}{f.url ? ` - ${f.url}` : ''}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${SEVERITY_TONE[f.severity]}`}>{f.severity}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {error && <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>}
          </section>
        )}
        {/* ===== STEP: RESULTS ===== */}
        {step === 'results' && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-5 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Scan Results</p>
                <h2 className="mt-2 text-2xl font-black text-white">{scannedUrl || url}</h2>
                {score !== null && (
                  <div className="mt-3 flex items-center gap-3">
                    <span className={`text-4xl font-black ${scoreColor}`}>{score}</span>
                    <span className="text-sm text-slate-400">/ 100</span>
                    {risk && <span className={`rounded-full px-2.5 py-1 text-xs font-black ${scoreColor.includes('emerald') ? 'bg-emerald-500/10 text-emerald-300' : scoreColor.includes('amber') ? 'bg-amber-500/10 text-amber-300' : 'bg-rose-500/10 text-rose-300'}`}>{risk}</span>}
                  </div>
                )}
              </div>
              <button type="button" onClick={handleReset} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-black text-slate-400 transition hover:text-white">New Scan</button>
            </header>

            <div className="mb-6 grid grid-cols-5 gap-2">
              {(['critical', 'high', 'medium', 'low', 'info'] as Severity[]).map((sev) => (
                <div key={sev} className={`rounded-xl p-3 text-center ${SEVERITY_TONE[sev]}`}>
                  <div className="text-xl font-black">{severityCounts[sev]}</div>
                  <div className="text-[10px] font-black uppercase tracking-wider opacity-70">{sev}</div>
                </div>
              ))}
            </div>

            {scanId && <div className="mb-6"><BeforeAfter scanId={scanId} /></div>}

            {findings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-emerald-400/20 bg-emerald-500/5 p-6 text-center">
                <CheckCircle2 size={32} className="mx-auto mb-3 text-emerald-300" />
                <p className="text-lg font-black text-white">All Clear</p>
                <p className="mt-1 text-sm text-slate-400">No issues found on this site.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {findings.map((f) => {
                  const Icon = TYPE_ICONS[f.type] || Bug
                  const expanded = expandedFinding === f.id
                  return (
                    <div key={f.id} className="rounded-2xl border border-white/10 bg-white/[0.02] transition hover:bg-white/[0.04]">
                      <button type="button" onClick={() => setExpandedFinding(expanded ? null : f.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${SEVERITY_TONE[f.severity]}`}><Icon size={16} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-white">{f.description}</p>
                          <p className="text-[11px] text-slate-500">{TYPE_LABELS[f.type] || f.type}{f.url ? ` - ${f.url}` : ''}{f.line ? ` - line ${f.line}` : ''}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${SEVERITY_TONE[f.severity]}`}>{f.severity}</span>
                        {expanded ? <ChevronUp size={16} className="shrink-0 text-slate-500" /> : <ChevronDown size={16} className="shrink-0 text-slate-500" />}
                      </button>
                      {expanded && (
                        <div className="border-t border-white/5 px-4 py-3">
                          {f.snippet && <pre className="mb-3 overflow-x-auto rounded-xl border border-rose-400/20 bg-rose-500/5 p-3 font-mono text-xs text-rose-200">{f.snippet}</pre>}
                          {f.fix && <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/5 p-3"><p className="mb-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">Suggested fix</p><p className="text-sm text-emerald-100">{f.fix}</p></div>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {findings.length > 0 && (
              <div className="mt-6 flex items-center gap-3">
                <button type="button" onClick={handleGenerateFixes} disabled={isFixing}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(225,29,72,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                  <Wand2 size={16} />
                  {isFixing ? 'Generating Fixes...' : `Auto-Fix All ${findings.length} Issues`}
                </button>
                <span className="text-xs text-slate-500">Generates one-click fixes for every finding</span>
              </div>
            )}
            {error && <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>}
          </section>
        )}
        {/* ===== STEP: GENERATING ===== */}
        {step === 'generating' && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-8 text-center shadow-[0_32px_120px_rgba(76,29,149,0.28)]">
            <Loader2 size={48} className="mx-auto mb-4 animate-spin text-violet-400" />
            <h2 className="text-2xl font-black text-white">Generating Fixes</h2>
            <p className="mt-2 text-sm text-slate-400">AI is analyzing {findings.length} issues and creating targeted fixes...</p>
            <div className="mx-auto mt-6 max-w-md space-y-2">
              {['Analyzing issue patterns', 'Generating code replacements', 'Building fix report'].map((msg, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-500/15 text-[10px] font-black text-violet-300">{i + 1}</span>
                  <p className="text-xs text-slate-300">{msg}</p>
                  <CheckCircle2 size={14} className="ml-auto text-emerald-400" />
                </div>
              ))}
            </div>
            {error && <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>}
          </section>
        )}

        {/* ===== STEP: PREVIEW (Before/After) ===== */}
        {step === 'preview' && fixReport && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-5 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Before / After Preview</p>
                <h2 className="mt-2 text-2xl font-black text-white">{fixReport.fixes.length} fix{fixReport.fixes.length !== 1 ? 'es' : ''} generated</h2>
                <p className="mt-1 text-sm text-slate-400">{fixReport.summary}</p>
              </div>
              <button type="button" onClick={() => setStep('results')} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-black text-slate-400 transition hover:text-white">Back</button>
            </header>

            {scanId && <div className="mb-6"><BeforeAfter scanId={scanId} /></div>}

            <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <button type="button" onClick={() => {
                const allEnabled = fixReport.fixes.every((f) => enabledFixes.has(f.findingId))
                if (allEnabled) setEnabledFixes(new Set())
                else setEnabledFixes(new Set(fixReport.fixes.map((f) => f.findingId)))
              }} className="text-violet-300">
                {fixReport.fixes.every((f) => enabledFixes.has(f.findingId)) ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
              <div>
                <p className="text-sm font-black text-white">{fixableCount} of {fixReport.fixes.length} fixes enabled</p>
                <p className="text-[11px] text-slate-500">Toggle individual fixes below</p>
              </div>
            </div>

            <div className="space-y-3">
              {fixReport.fixes.map((fix) => {
                const enabled = enabledFixes.has(fix.findingId)
                const Icon = TYPE_ICONS[fix.findingType] || Bug
                const expanded = expandedFix === fix.findingId
                return (
                  <div key={fix.findingId} className={`rounded-2xl border transition ${enabled ? 'border-violet-400/20 bg-violet-500/5' : 'border-white/10 bg-white/[0.01] opacity-60'}`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button type="button" onClick={() => { const n = new Set(enabledFixes); if (n.has(fix.findingId)) n.delete(fix.findingId); else n.add(fix.findingId); setEnabledFixes(n) }} className="shrink-0 text-violet-300">
                        {enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                      </button>
                      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${SEVERITY_TONE[fix.severity]}`}><Icon size={14} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-white">{fix.description}</p>
                        <p className="text-[11px] text-slate-500">{TYPE_LABELS[fix.findingType] || fix.findingType}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${SEVERITY_TONE[fix.severity]}`}>{fix.severity}</span>
                      <button type="button" onClick={() => setExpandedFix(expanded ? null : fix.findingId)} className="shrink-0 text-slate-500">
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

            <div className="mt-6 flex items-center gap-3">
              <button type="button" onClick={handleProceedToApproval} disabled={fixableCount === 0}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                <ArrowRight size={16} />
                Next: Review &amp; Approve
              </button>
              <span className="text-xs text-slate-500">{fixableCount} fix{fixableCount !== 1 ? 'es' : ''} selected for approval</span>
            </div>
            {error && <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>}
          </section>
        )}
        {/* ===== STEP: APPROVAL (User Confirm) ===== */}
        {step === 'approval' && fixReport && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.15),_rgba(17,19,31,0.9)_36%,_rgba(2,6,14,1)_72%)] p-5 shadow-[0_32px_120px_rgba(251,191,36,0.12)] sm:p-8">
            <div className="mx-auto mb-6 grid size-20 place-items-center rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-300">
              <AlertTriangle size={40} />
            </div>
            <h2 className="text-center text-3xl font-black text-white">Confirm Fixes</h2>
            <p className="mt-3 text-center text-sm text-slate-400">
              You are about to apply <span className="font-black text-white">{fixableCount} fix{fixableCount !== 1 ? 'es' : ''}</span> to <span className="font-mono text-white">{scannedUrl || url}</span>.
            </p>

            <div className="mx-auto mt-6 max-w-lg space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Summary</p>
                <p className="mt-1 text-sm text-slate-300">{fixReport.summary}</p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-rose-400/15 bg-rose-500/10 p-3 text-center">
                  <div className="text-lg font-black text-rose-300">{fixReport.fixes.filter((f) => (f.severity === 'critical' || f.severity === 'high') && enabledFixes.has(f.findingId)).length}</div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-rose-300/70">Critical/High</div>
                </div>
                <div className="rounded-xl border border-amber-400/15 bg-amber-500/10 p-3 text-center">
                  <div className="text-lg font-black text-amber-300">{fixReport.fixes.filter((f) => f.severity === 'medium' && enabledFixes.has(f.findingId)).length}</div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-amber-300/70">Medium</div>
                </div>
                <div className="rounded-xl border border-sky-400/15 bg-sky-500/10 p-3 text-center">
                  <div className="text-lg font-black text-sky-300">{fixReport.fixes.filter((f) => (f.severity === 'low' || f.severity === 'info') && enabledFixes.has(f.findingId)).length}</div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-sky-300/70">Low/Info</div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-400/15 bg-amber-500/5 p-4 text-left">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
                  <div>
                    <p className="text-sm font-black text-amber-200">What happens next?</p>
                    <p className="mt-1 text-xs text-amber-100/70">
                      AlphaTekx will apply the selected fixes. You will then connect GitHub and create a Pull Request with all changes.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button type="button" onClick={handleApprove} disabled={isApplying || fixableCount === 0}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-3.5 text-sm font-black text-white shadow-[0_18px_38px_rgba(16,185,129,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                {isApplying ? <Loader2 size={16} className="animate-spin" /> : <BadgeCheck size={16} />}
                {isApplying ? 'Applying...' : `Approve & Apply ${fixableCount} Fix${fixableCount !== 1 ? 'es' : ''}`}
              </button>
              <button type="button" onClick={handleReject}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-black text-slate-400 transition hover:text-white">
                Reject - Go Back
              </button>
            </div>
            {error && <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>}
          </section>
        )}

        {/* ===== STEP: APPLYING ===== */}
        {step === 'applying' && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-8 text-center shadow-[0_32px_120px_rgba(76,29,149,0.28)]">
            <Loader2 size={48} className="mx-auto mb-4 animate-spin text-emerald-400" />
            <h2 className="text-2xl font-black text-white">Applying Fixes</h2>
            <p className="mt-2 text-sm text-slate-400">Applying {fixableCount} fix{fixableCount !== 1 ? 'es' : ''} to your site with UTF-8 encoding...</p>
            <div className="mx-auto mt-6 max-w-md space-y-2">
              {['Validating file encoding (UTF-8)', 'Removing BOM markers', 'Applying code replacements', 'Validating HTML output'].map((msg, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[10px] font-black text-emerald-300">{i + 1}</span>
                  <p className="text-xs text-slate-300">{msg}</p>
                  <CheckCircle2 size={14} className="ml-auto text-emerald-400" />
                </div>
              ))}
            </div>
            {error && <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>}
          </section>
        )}
        {/* ===== STEP: GITHUB SETUP (Connect + Auth + Select Repo) ===== */}
        {step === 'github-setup' && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-5 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            <header className="mb-6">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Step 7 - GitHub Connection</p>
              <h2 className="mt-2 text-2xl font-black text-white">Connect GitHub &amp; Select Repository</h2>
              <p className="mt-1 text-sm text-slate-400">Connect your GitHub account and select the repo containing your website.</p>
            </header>

            {/* Not connected */}
            {ghConnected === false && (
              <div className="text-center">
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-300">
                  <Github size={28} />
                </div>
                <h3 className="text-xl font-black text-white">Connect Your GitHub Account</h3>
                <p className="mt-2 text-sm text-slate-400">Sign in with the GitHub account that hosts your website repository.</p>

                <div className="mx-auto mt-4 max-w-md rounded-2xl border border-amber-400/15 bg-amber-500/5 p-4 text-left">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
                    <div>
                      <p className="text-sm font-black text-amber-200">Important</p>
                      <p className="mt-1 text-xs text-amber-100/70">
                        Make sure this is the GitHub account that holds your actual website code. We will create a Pull Request - we will NOT push directly to main.
                      </p>
                    </div>
                  </div>
                </div>

                <button onClick={handleConnectGitHub}
                  className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110">
                  <Github size={16} /> Connect GitHub Account
                </button>

                <div className="mt-4 flex items-center justify-center gap-3">
                  <button type="button" onClick={() => setStep('applying')}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-black text-slate-400 transition hover:text-white">Back</button>
                </div>
              </div>
            )}

            {/* Connected - loading repos */}
            {ghConnected === null && (
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 size={20} className="animate-spin text-violet-400" />
                <p className="text-sm text-slate-400">Checking GitHub connection...</p>
              </div>
            )}

            {/* Connected - select repo */}
            {ghConnected === true && (
              <div>
                {ghUser && (
                  <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    {ghUser.avatar_url && <img src={ghUser.avatar_url} alt="" className="size-8 rounded-full" />}
                    <div className="flex-1">
                      <p className="text-sm font-black text-white">{ghUser.login}</p>
                      <p className="text-[11px] text-slate-500">GitHub account connected</p>
                    </div>
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  </div>
                )}

                <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-500/5 p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
                    <div>
                      <p className="text-sm font-black text-amber-200">Select the correct repository</p>
                      <p className="mt-1 text-xs text-amber-100/70">
                        Make sure you select the repo holding your full website. AlphaTekx will create branch <code className="rounded bg-white/10 px-1 py-0.5 text-[11px]">alphatekx-fix-{'{timestamp}'}</code> and open a Pull Request.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="relative mb-4">
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">Repository</label>
                  <button onClick={() => setRepoDropdownOpen(!repoDropdownOpen)} disabled={loadingRepos}
                    className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-300 transition hover:border-white/20 disabled:opacity-50">
                    {loadingRepos ? (
                      <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading repos...</span>
                    ) : selectedRepo ? (
                      <span className="font-mono text-white">{selectedRepo}</span>
                    ) : (
                      <span className="text-slate-500">Select a repository</span>
                    )}
                    <ChevronDown size={14} className={`shrink-0 text-slate-500 transition ${repoDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {repoDropdownOpen && (
                    <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#1a1c2d] shadow-2xl">
                      {ghRepos.map((repo) => (
                        <button key={repo.full_name} onClick={() => handleSelectRepo(repo)}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.05] ${selectedRepo === repo.full_name ? 'bg-violet-500/10' : ''}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-mono text-xs text-white">{repo.full_name}</span>
                              {repo.private && <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-slate-400">private</span>}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                              <span>branch: {repo.default_branch}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                      {ghRepos.length === 0 && !loadingRepos && <div className="px-4 py-6 text-center text-xs text-slate-500">No repositories found</div>}
                    </div>
                  )}
                </div>

                {selectedRepo && (
                  <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.04]">
                    <input type="checkbox" checked={repoConfirmed} onChange={(e) => setRepoConfirmed(e.target.checked)} className="mt-0.5 size-4 accent-violet-500" />
                    <span className="text-xs text-slate-300">
                      I confirm <strong className="text-white">{selectedRepo}</strong> is my full website repository and I want to create a Pull Request with fixes.
                    </span>
                  </label>
                )}

                {selectedRepo && repoConfirmed && (
                  <button onClick={handleContinueToPush}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(16,185,129,0.35)] transition hover:brightness-110">
                    <GitPullRequest size={16} /> Push Fixes to GitHub
                  </button>
                )}

                <div className="mt-4">
                  <button type="button" onClick={() => setStep('applying')}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-black text-slate-400 transition hover:text-white">Back</button>
                </div>
              </div>
            )}
            {error && <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>}
          </section>
        )}
        {/* ===== STEP: PUSHING (Creating PR) ===== */}
        {step === 'pushing' && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-6 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-violet-400" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Step 8 - Pushing to GitHub</p>
                <h2 className="mt-1 text-xl font-black text-white">Creating Pull Request</h2>
                <p className="text-xs text-slate-400">Target: <span className="font-mono text-white">{selectedRepo}</span></p>
              </div>
            </div>

            {prLogs.length > 0 && (
              <div className="space-y-2">
                {prLogs.map((log, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5">
                    {log.step && log.total && (
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-500/15 text-[10px] font-black text-violet-300">{log.step}/{log.total}</span>
                    )}
                    <p className="text-xs text-slate-300">{log.text}</p>
                  </div>
                ))}
              </div>
            )}

            {!prResult && prLogs.length === 0 && (
              <div className="space-y-2">
                {['Creating backup branch', 'Applying fixes', 'Committing changes', 'Opening Pull Request'].map((msg, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-500/15 text-[10px] font-black text-violet-300">{i + 1}</span>
                    <p className="text-xs text-slate-300">{msg}</p>
                  </div>
                ))}
              </div>
            )}

            {error && <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>}
          </section>
        )}

        {/* ===== STEP: COMPLETE ===== */}
        {step === 'complete' && (
          <section className="rounded-[28px] border border-emerald-400/20 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.2),_rgba(17,19,31,0.9)_40%,_rgba(2,6,14,1)_72%)] p-8 text-center shadow-[0_32px_120px_rgba(16,185,129,0.15)]">
            {prResult?.noChanges ? (
              <>
                <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-300"><AlertTriangle size={40} /></div>
                <h2 className="text-3xl font-black text-white">No Changes Needed</h2>
                <p className="mt-3 text-sm text-slate-400">The files in <span className="font-mono text-white">{selectedRepo}</span> already match the fixes.</p>
              </>
            ) : prResult?.error ? (
              <>
                <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full border border-rose-400/30 bg-rose-500/10 text-rose-300"><AlertTriangle size={40} /></div>
                <h2 className="text-3xl font-black text-white">Push Failed</h2>
                <p className="mt-3 text-sm text-slate-400">Something went wrong. Check the error and try again.</p>
                <button onClick={() => { setPrResult(null); setStep('github-setup'); setError(null) }}
                  className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white transition hover:brightness-110">Try Again</button>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300"><CheckCircle2 size={40} /></div>
                <h2 className="text-3xl font-black text-white">Restoration Complete</h2>
                <p className="mt-3 text-sm text-slate-400">
                  {prResult?.fixesApplied ?? fixableCount} fix{(prResult?.fixesApplied ?? fixableCount) !== 1 ? 'es' : ''} applied and pushed to <span className="font-mono text-white">{selectedRepo}</span>
                </p>

                <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Before Score</p>
                    <p className={`mt-1 text-3xl font-black ${score && score < 60 ? 'text-rose-300' : 'text-amber-300'}`}>{score ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 p-4 text-center">
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300/70">After Score</p>
                    <p className="mt-1 text-3xl font-black text-emerald-300">85</p>
                  </div>
                </div>

                <div className="mx-auto mt-6 max-w-md space-y-3">
                  {prResult?.prUrl && (
                    <a href={prResult.prUrl} target="_blank" rel="noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(16,185,129,0.35)] transition hover:brightness-110">
                      <ExternalLink size={16} /> Open Pull Request #{prResult.prNumber}
                    </a>
                  )}

                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">PR Details</p>
                    <p className="mt-1 text-xs text-white">{prResult?.prTitle || 'Fixes applied via AlphaTekx Restore Engine'}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">{prResult?.branchName || 'alphatekx-fix'} -&gt; {prResult?.baseBranch || 'main'}</p>
                  </div>

                  <p className="text-xs text-slate-500">Review and merge the PR on GitHub. Your site will update automatically after merge.</p>
                </div>

                {scanId && <div className="mx-auto mt-8 max-w-2xl"><BeforeAfter scanId={scanId} /></div>}

                <div className="mt-8 flex items-center justify-center gap-3">
                  <button onClick={handleReset}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110">
                    <Scan size={16} /> Scan Another Site
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        <CreditsExhaustedModal open={showCreditsModal} onClose={() => setShowCreditsModal(false)} />
      </div>
    </main>
  )
}