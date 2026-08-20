import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Image,
  Link,
  Lock,
  Radar,
  Scan,
  ShieldCheck,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Wand2,
  Zap,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { getCredits, setCredits, hydrateCredits, subscribeCredits } from '../lib/creditStore'
import BeforeAfter from '../components/scan/BeforeAfter'
import CreditsExhaustedModal from '../components/CreditsExhaustedModal'

// ─── Types ──────────────────────────────────────────────────────────────────

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

type Step = 'input' | 'scanning' | 'results' | 'fixing' | 'comparing' | 'done'

// ─── Constants ──────────────────────────────────────────────────────────────

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
  cve: 'CVE Vulnerability',
  bad_code: 'Bad Code Pattern',
  performance: 'Performance',
  meta: 'Meta Tag Issue',
  image: 'Broken Image',
  accessibility: 'Accessibility',
}

const STEP_ORDER: Step[] = ['input', 'scanning', 'results', 'fixing', 'comparing', 'done']

// ─── Component ──────────────────────────────────────────────────────────────

export default function RestorationFlow() {
  const { user, loading: authLoading } = useAuth()

  // Core state
  const [step, setStep] = useState<Step>('input')
  const [url, setUrl] = useState('')
  const [scanId, setScanId] = useState<string | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])
  const [fixReport, setFixReport] = useState<FixReport | null>(null)
  const [enabledFixes, setEnabledFixes] = useState<Set<string>>(new Set())
  const [score, setScore] = useState<number | null>(null)
  const [risk, setRisk] = useState<string | null>(null)
  const [scannedUrl, setScannedUrl] = useState('')

  // UI state
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

  // ─── Credits ────────────────────────────────────────────────────────────

  useEffect(() => {
    let unsub: (() => void) | null = null
    const load = async () => {
      try {
        const bal = await hydrateCredits()
        setCreditsState(bal)
      } catch { /* ignore */ }
    }
    load()
    unsub = subscribeCredits(() => setCreditsState(getCredits()))
    return () => { unsub?.() }
  }, [])

  // ─── Severity counts ───────────────────────────────────────────────────

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    for (const f of findings) counts[f.severity]++
    return counts
  }, [findings])

  const fixableCount = useMemo(() => {
    if (!fixReport) return 0
    return fixReport.fixes.filter((f) => enabledFixes.has(f.findingId)).length
  }, [fixReport, enabledFixes])

  // ─── Scan ───────────────────────────────────────────────────────────────

  const handleScan = async () => {
    if (!url.trim()) return
    const activeEmail = String(user?.email || '').trim().toLowerCase()
    if (authLoading || !activeEmail) {
      setError('Please sign in to continue scanning.')
      return
    }

    // Check credits
    try {
      const checkRes = await fetch('/api/check-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: activeEmail }),
      })
      if (!checkRes.ok) {
        const d = await checkRes.json().catch(() => ({ error: 'Auth required' }))
        setError(d.error || 'Please sign in')
        return
      }
      const d = await checkRes.json()
      if ((d.credits || 0) < 1) {
        setShowCreditsModal(true)
        return
      }
    } catch (e) {
      setError('Could not verify credits')
      return
    }

    // Start scan
    setStep('scanning')
    setIsScanning(true)
    setError(null)
    setFindings([])
    setFixReport(null)
    setScore(null)
    setRisk(null)
    setProgress(5)
    setStatus('Validating target URL...')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const scanRes = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          email: activeEmail,
          fingerprint: localStorage.getItem('device_fingerprint') || '',
        }),
        signal: controller.signal,
      })

      if (scanRes.status === 402) {
        const d = await scanRes.json().catch(() => ({ error: 'Insufficient credits' }))
        setStep('input')
        setError(d.error || 'Insufficient credits')
        setIsScanning(false)
        setProgress(0)
        return
      }
      if (scanRes.status === 403) {
        const d = await scanRes.json().catch(() => ({ error: 'Access denied' }))
        setStep('input')
        setError(d.error || 'Free trial used')
        setIsScanning(false)
        setProgress(0)
        return
      }
      if (!scanRes.ok) {
        const d = await scanRes.json().catch(() => ({ error: 'Scan failed' }))
        setStep('input')
        setError(d.error || `Scan failed (${scanRes.status})`)
        setIsScanning(false)
        setProgress(0)
        return
      }

      const reader = scanRes.body?.getReader()
      if (!reader) {
        setStep('input')
        setError('No response stream')
        setIsScanning(false)
        setProgress(0)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let lastEvent = Date.now()
      let receivedDone = false
      let receivedError: string | null = null

      const staleCheck = () => {
        const elapsed = Date.now() - lastEvent
        if (elapsed > 90000) throw new Error('Scan timed out — site may be blocking automated scanning.')
        if (elapsed > 45000) setStatus('Still scanning — hang tight (up to ~75s).')
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
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          const lines = part.split('\n').filter(Boolean)
          const event = lines.find((l) => l.startsWith('data:'))
          if (!event) continue

          try {
            const payload = JSON.parse(event.replace(/^data:\s*/, ''))

            if (payload.type === 'error' || payload.error) {
              receivedError = String(payload.error || 'Scan failed')
              break
            }
            if (payload.type === 'progress') {
              setProgress(Number(payload.progress || 0))
              setStatus(payload.message || 'Scanning...')
            }
            if (payload.type === 'started') {
              setScanId(String(payload.scanId || ''))
            }
            if (payload.type === 'finding') {
              setFindings((curr) => [
                {
                  id: payload.id || `f-${curr.length}`,
                  type: payload.findingType || payload.type || 'unknown',
                  severity: payload.severity || 'info',
                  url: payload.url || '',
                  description: payload.title || payload.meaning || 'Finding',
                  line: payload.lineNumber ?? null,
                  snippet: payload.maskedProof ?? null,
                  fix: payload.fix ?? null,
                },
                ...curr,
              ])
            }
            if (payload.type === 'done') {
              receivedDone = true
              setScore(Number(payload.score ?? 0))
              setRisk(String(payload.risk || ''))
              setScannedUrl(String(payload.scannedUrl || ''))
              setProgress(100)
              setStatus('Scan complete')
              if (payload.creditsRemaining !== undefined) {
                const bal = Math.max(0, payload.creditsRemaining)
                setCreditsState(bal)
                localStorage.setItem('user_credits', String(bal))
              }
            }
          } catch { /* skip malformed */ }
        }
      }

      if (receivedError) {
        setError(receivedError)
        setStep('input')
      } else if (receivedDone) {
        setStep('results')
      } else {
        setError('Scan ended before it finished')
        setStep('input')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Scan failed'
      setError(msg)
      setStep('input')
    } finally {
      setIsScanning(false)
      setProgress(0)
      abortRef.current = null
    }
  }

  // ─── Generate Fixes ────────────────────────────────────────────────────

  const handleGenerateFixes = async () => {
    setIsFixing(true)
    setError(null)
    setFixReport(null)

    try {
      const body: Record<string, unknown> = {}
      if (scanId) body.scanId = scanId
      else body.scanReport = { scanId: '', scannedUrl: url, findings }

      const res = await fetch('/api/fix/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Fix generation failed')
        setStep('results')
        return
      }

      const report: FixReport = data.fixReport || data
      // Mark all fixes enabled by default
      const enabled = new Set<string>()
      for (const fix of report.fixes) enabled.add(fix.findingId)
      setEnabledFixes(enabled)
      setFixReport(report)
      setStep('comparing')

      // Capture "after" screenshot for comparison (non-blocking)
      if (scanId || url) {
        fetch('/api/screenshot/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, scanId: scanId || undefined, label: 'after' }),
        }).catch(() => {})
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fix generation failed')
      setStep('results')
    } finally {
      setIsFixing(false)
    }
  }

  // ─── Toggle Fix ────────────────────────────────────────────────────────

  const toggleFix = (findingId: string) => {
    setEnabledFixes((prev) => {
      const next = new Set(prev)
      if (next.has(findingId)) next.delete(findingId)
      else next.add(findingId)
      return next
    })
  }

  const toggleAllFixes = () => {
    if (!fixReport) return
    const allEnabled = fixReport.fixes.every((f) => enabledFixes.has(f.findingId))
    if (allEnabled) {
      setEnabledFixes(new Set())
    } else {
      setEnabledFixes(new Set(fixReport.fixes.map((f) => f.findingId)))
    }
  }

  // ─── Apply Fixes ───────────────────────────────────────────────────────

  const handleApplyFixes = async () => {
    setIsApplying(true)
    setError(null)

    try {
      const res = await fetch('/api/fix/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixId: fixReport?.fixId,
          scanId,
          enabledFixes: Array.from(enabledFixes),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Apply failed')
        return
      }
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setIsApplying(false)
    }
  }

  // ─── Reset ─────────────────────────────────────────────────────────────

  const handleReset = () => {
    setStep('input')
    setUrl('')
    setScanId(null)
    setFindings([])
    setFixReport(null)
    setEnabledFixes(new Set())
    setScore(null)
    setRisk(null)
    setScannedUrl('')
    setError(null)
    setProgress(0)
    setStatus('')
  }

  // ─── Score colour ──────────────────────────────────────────────────────

  const scoreColor = useMemo(() => {
    if (score === null) return 'text-slate-400'
    if (score >= 80) return 'text-emerald-300'
    if (score >= 60) return 'text-amber-300'
    return 'text-rose-300'
  }, [score])

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <main className="w-full bg-[#0A0A14] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        {/* ─── Step indicator ────────────────────────────────────────────── */}
        <nav className="mb-8 flex items-center gap-1 overflow-x-auto pb-2">
          {(['input', 'scanning', 'results', 'fixing', 'comparing', 'done'] as Step[]).map((s, i) => {
            const active = step === s
            const done = STEP_ORDER.indexOf(step) > i
            return (
              <div key={s} className="flex items-center gap-1">
                {i > 0 && <div className={`h-[2px] w-6 ${done ? 'bg-violet-400' : 'bg-white/10'}`} />}
                <button
                  type="button"
                  disabled={!done && !active}
                  onClick={() => done && setStep(s)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition ${
                    active
                      ? 'bg-violet-500 text-white shadow-[0_8px_24px_rgba(109,40,217,0.4)]'
                      : done
                        ? 'bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 cursor-pointer'
                        : 'bg-white/5 text-slate-500 cursor-default'
                  }`}
                >
                  {done ? <CheckCircle2 size={12} /> : <span className="grid size-4 place-items-center rounded-full bg-white/10 text-[9px]">{i + 1}</span>}
                  {s === 'input' ? 'Scan' : s === 'scanning' ? 'Scanning' : s === 'results' ? 'Results' : s === 'fixing' ? 'Generating' : s === 'comparing' ? 'Compare' : 'Done'}
                </button>
              </div>
            )
          })}
        </nav>

        {/* ─── STEP: Input ──────────────────────────────────────────────── */}
        {step === 'input' && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[radial-gradient(circle_at_top,_rgba(123,92,255,0.38),_rgba(17,19,31,0.9)_36%,_rgba(2,6,14,1)_72%)] p-5 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            <header className="mb-6">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Content Restoration</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">Scan → Fix → Apply</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-400">
                Enter a live URL. We scan for broken links, leaked secrets, bad code, performance issues, and more — then generate one-click fixes.
              </p>
            </header>

            <div className="flex flex-col gap-3 rounded-[20px] border border-violet-300/15 bg-[#111522]/70 p-3 sm:flex-row sm:items-center">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                placeholder="https://example.com"
                disabled={isScanning}
                className="min-h-[52px] flex-1 rounded-full border border-violet-200/15 bg-black/20 px-5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-violet-300/40 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleScan}
                disabled={isScanning || !url.trim() || authLoading || !user?.email}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Radar size={16} />
                {isScanning ? 'Scanning...' : authLoading ? 'Checking sign-in...' : !user?.email ? 'Sign in to scan' : 'Scan Site'}
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 font-black text-emerald-300">{credits} Credits</span>
              <span>1 credit per scan · fixes are free</span>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">
                {error}
              </div>
            )}
          </section>
        )}

        {/* ─── STEP: Scanning ───────────────────────────────────────────── */}
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
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="mt-4 text-sm text-slate-400">{status}</p>

            {/* Live findings stream */}
            {findings.length > 0 && (
              <div className="mt-6 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Live findings ({findings.length})</p>
                <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                  {findings.map((f) => {
                    const Icon = TYPE_ICONS[f.type] || Bug
                    return (
                      <div key={f.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${SEVERITY_TONE[f.severity]}`}>
                          <Icon size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-black text-white">{f.description}</p>
                          <p className="truncate text-[11px] text-slate-500">{TYPE_LABELS[f.type] || f.type}{f.url ? ` · ${f.url}` : ''}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${SEVERITY_TONE[f.severity]}`}>
                          {f.severity}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>
            )}
          </section>
        )}

        {/* ─── STEP: Results ────────────────────────────────────────────── */}
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
                    {risk && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${scoreColor.includes('emerald') ? 'bg-emerald-500/10 text-emerald-300' : scoreColor.includes('amber') ? 'bg-amber-500/10 text-amber-300' : 'bg-rose-500/10 text-rose-300'}`}>
                        {risk}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-black text-slate-400 transition hover:text-white"
              >
                New Scan
              </button>
            </header>

            {/* Severity breakdown */}
            <div className="mb-6 grid grid-cols-5 gap-2">
              {(['critical', 'high', 'medium', 'low', 'info'] as Severity[]).map((sev) => (
                <div key={sev} className={`rounded-xl p-3 text-center ${SEVERITY_TONE[sev]}`}>
                  <div className="text-xl font-black">{severityCounts[sev]}</div>
                  <div className="text-[10px] font-black uppercase tracking-wider opacity-70">{sev}</div>
                </div>
              ))}
            </div>

            {/* Screenshot comparison */}
            {scanId && (
              <div className="mb-6">
                <BeforeAfter scanId={scanId} />
              </div>
            )}

            {/* Findings list */}
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
                      <button
                        type="button"
                        onClick={() => setExpandedFinding(expanded ? null : f.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      >
                        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${SEVERITY_TONE[f.severity]}`}>
                          <Icon size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-white">{f.description}</p>
                          <p className="text-[11px] text-slate-500">
                            {TYPE_LABELS[f.type] || f.type}
                            {f.url ? ` · ${f.url}` : ''}
                            {f.line ? ` · line ${f.line}` : ''}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${SEVERITY_TONE[f.severity]}`}>
                          {f.severity}
                        </span>
                        {expanded ? <ChevronUp size={16} className="shrink-0 text-slate-500" /> : <ChevronDown size={16} className="shrink-0 text-slate-500" />}
                      </button>
                      {expanded && (
                        <div className="border-t border-white/5 px-4 py-3">
                          {f.snippet && (
                            <pre className="mb-3 overflow-x-auto rounded-xl border border-rose-400/20 bg-rose-500/5 p-3 font-mono text-xs text-rose-200">
                              {f.snippet}
                            </pre>
                          )}
                          {f.fix && (
                            <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/5 p-3">
                              <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">Suggested fix</p>
                              <p className="text-sm text-emerald-100">{f.fix}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Generate fixes button */}
            {findings.length > 0 && (
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleGenerateFixes}
                  disabled={isFixing}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(225,29,72,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Wand2 size={16} />
                  {isFixing ? 'Generating Fixes...' : `Auto-Fix All ${findings.length} Issues`}
                </button>
                <span className="text-xs text-slate-500">Generates one-click fixes for every finding</span>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>
            )}
          </section>
        )}

        {/* ─── STEP: Comparing (Before/After) ──────────────────────────── */}
        {step === 'comparing' && fixReport && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-5 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Before / After</p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  {fixReport.fixes.length} fix{fixReport.fixes.length !== 1 ? 'es' : ''} generated
                </h2>
                <p className="mt-1 text-sm text-slate-400">{fixReport.summary}</p>
              </div>
              <div className="flex items-center gap-2 self-start">
                <button
                  type="button"
                  onClick={() => setStep('results')}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-black text-slate-400 transition hover:text-white"
                >
                  Back
                </button>
              </div>
            </header>

            {/* Screenshot comparison */}
            {scanId && (
              <div className="mb-6">
                <BeforeAfter scanId={scanId} />
              </div>
            )}

            {/* Toggle all */}
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <button type="button" onClick={toggleAllFixes} className="text-violet-300">
                {fixReport.fixes.every((f) => enabledFixes.has(f.findingId)) ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
              <div>
                <p className="text-sm font-black text-white">
                  {fixableCount} of {fixReport.fixes.length} fixes enabled
                </p>
                <p className="text-[11px] text-slate-500">Toggle individual fixes below</p>
              </div>
            </div>

            {/* Fix cards */}
            <div className="space-y-3">
              {fixReport.fixes.map((fix) => {
                const enabled = enabledFixes.has(fix.findingId)
                const Icon = TYPE_ICONS[fix.findingType] || Bug
                const expanded = expandedFix === fix.findingId
                return (
                  <div
                    key={fix.findingId}
                    className={`rounded-2xl border transition ${enabled ? 'border-violet-400/20 bg-violet-500/5' : 'border-white/10 bg-white/[0.01] opacity-60'}`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button type="button" onClick={() => toggleFix(fix.findingId)} className="shrink-0 text-violet-300">
                        {enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                      </button>
                      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${SEVERITY_TONE[fix.severity]}`}>
                        <Icon size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-white">{fix.description}</p>
                        <p className="text-[11px] text-slate-500">{TYPE_LABELS[fix.findingType] || fix.findingType}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${SEVERITY_TONE[fix.severity]}`}>
                        {fix.severity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedFix(expanded ? null : fix.findingId)}
                        className="shrink-0 text-slate-500"
                      >
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                    {expanded && (
                      <div className="grid gap-3 border-t border-white/5 px-4 py-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-rose-300">Before</p>
                          <pre className="overflow-x-auto rounded-xl border border-rose-400/20 bg-rose-500/5 p-3 font-mono text-xs leading-5 text-rose-200">
                            {fix.original}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-emerald-300">After</p>
                          <pre className="overflow-x-auto rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3 font-mono text-xs leading-5 text-emerald-200">
                            {fix.fixed}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Apply button */}
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={handleApplyFixes}
                disabled={isApplying || fixableCount === 0}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(16,185,129,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BadgeCheck size={16} />
                {isApplying ? 'Applying...' : `Apply ${fixableCount} Fix${fixableCount !== 1 ? 'es' : ''}`}
              </button>
              <span className="text-xs text-slate-500">Apply the selected fixes to your site</span>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>
            )}
          </section>
        )}

        {/* ─── STEP: Done ───────────────────────────────────────────────── */}
        {step === 'done' && (
          <section className="rounded-[28px] border border-emerald-400/20 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.2),_rgba(17,19,31,0.9)_40%,_rgba(2,6,14,1)_72%)] p-8 text-center shadow-[0_32px_120px_rgba(16,185,129,0.15)]">
            <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
              <CheckCircle2 size={40} />
            </div>
            <h2 className="text-3xl font-black text-white">Fixes Applied</h2>
            <p className="mt-3 text-sm text-slate-400">
              {fixableCount} fix{fixableCount !== 1 ? 'es' : ''} applied to <span className="font-mono text-white">{scannedUrl || url}</span>
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110"
              >
                <Scan size={16} />
                Scan Another Site
              </button>
            </div>
          </section>
        )}

        {/* Credits modal */}
        <CreditsExhaustedModal open={showCreditsModal} onClose={() => setShowCreditsModal(false)} />
      </div>
    </main>
  )
}
