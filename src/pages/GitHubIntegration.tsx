import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  Github,
  GitPullRequest,
  Loader2,
  Shield,
} from 'lucide-react'
import BeforeAfter from '../components/scan/BeforeAfter'

type Repo = {
  full_name: string
  default_branch: string
  private: boolean
  description: string
  updated_at: string
  html_url: string
}

type FixReport = {
  fixId: string
  scanId: string
  targetUrl: string
  generatedAt: string
  stats: { total: number; generated: number; skipped: number }
  fixes: Array<{
    findingId: string
    findingType: string
    severity: string
    url: string
    original: string
    fixed: string
    description: string
  }>
  summary: string | object
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

type Step = 'connect' | 'select-repo' | 'review-fixes' | 'creating' | 'done'

export default function GitHubIntegration() {
  // Connection state
  const [connected, setConnected] = useState<boolean | null>(null)
  const [configured, setConfigured] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)
  const [ghUser, setGhUser] = useState<{ login: string; avatar_url: string } | null>(null)

  // Repo state
  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoConfirmed, setRepoConfirmed] = useState(false)

  // Fix report state
  const [fixReport, setFixReport] = useState<FixReport | null>(null)
  const [fixReportInput, setFixReportInput] = useState('')
  const [loadingReport, setLoadingReport] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [enabledFixes, setEnabledFixes] = useState<Set<string>>(new Set())

  // PR creation state
  const [creating, setCreating] = useState(false)
  const [logs, setLogs] = useState<Array<{ text: string; step?: number; total?: number }>>([])
  const [prResult, setPrResult] = useState<PRResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Current step
  const step: Step = prResult ? 'done' : creating ? 'creating' : fixReport ? 'review-fixes' : connected && selectedRepo ? 'select-repo' : connected ? 'select-repo' : 'connect'

  // ─── Check GitHub connection on mount ────────────────────────────────────

  useEffect(() => {
    fetch('/api/github/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setConnected(data.connected)
        setConfigured(data.configured !== false)
        if (data.error) setConfigError(data.error)
        if (data.user) setGhUser(data.user)
        if (data.connected) fetchRepos()
      })
      .catch(() => setConnected(false))
  }, [])

  // ─── Fetch repos ─────────────────────────────────────────────────────────

  const fetchRepos = useCallback(async () => {
    setLoadingRepos(true)
    try {
      const res = await fetch('/api/github/repos', { credentials: 'include' })
      const data = await res.json()
      setRepos(data.repos || [])
    } catch {
      setError('Failed to load repositories')
    } finally {
      setLoadingRepos(false)
    }
  }, [])

  // ─── Connect to GitHub ───────────────────────────────────────────────────

  const handleConnect = () => {
    window.location.href = '/api/auth/github'
  }

  // ─── Select repo ─────────────────────────────────────────────────────────

  const handleSelectRepo = (repo: Repo) => {
    setSelectedRepo(repo.full_name)
    setSelectedBranch(repo.default_branch)
    setRepoDropdownOpen(false)
    setRepoConfirmed(false)
  }

  // ─── Load fix report ─────────────────────────────────────────────────────

  const handleLoadReport = async () => {
    if (!fixReportInput.trim()) return
    setLoadingReport(true)
    setReportError(null)
    setFixReport(null)

    try {
      const body: Record<string, unknown> = {}
      if (fixReportInput.startsWith('fix_')) {
        body.fixId = fixReportInput.trim()
      } else {
        body.scanId = fixReportInput.trim()
      }

      const res = await fetch('/api/fix/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setReportError(data.error || 'Failed to load fix report')
        return
      }

      const report: FixReport = data.fixReport || data
      setFixReport(report)
      const enabled = new Set<string>()
      for (const fix of report.fixes) enabled.add(fix.findingId)
      setEnabledFixes(enabled)
    } catch (e) {
      setReportError(e instanceof Error ? e.message : 'Failed to load fix report')
    } finally {
      setLoadingReport(false)
    }
  }

  // ─── Toggle fix ──────────────────────────────────────────────────────────

  const toggleFix = (findingId: string) => {
    setEnabledFixes((prev) => {
      const next = new Set(prev)
      if (next.has(findingId)) next.delete(findingId)
      else next.add(findingId)
      return next
    })
  }

  // ─── Create PR ───────────────────────────────────────────────────────────

  const handleCreatePR = async () => {
    if (!selectedRepo || !fixReport) return
    setCreating(true)
    setLogs([])
    setPrResult(null)
    setError(null)

    // Capture "after" screenshot before PR creation (non-blocking)
    if (fixReport.scanId || fixReport.targetUrl) {
      fetch('/api/screenshot/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: fixReport.targetUrl,
          scanId: fixReport.scanId || undefined,
          label: 'after',
        }),
      }).catch(() => {})
    }

    try {
      const res = await fetch('/api/github/create-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          repoFullName: selectedRepo,
          fixReport,
          scanId: fixReport.scanId,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setError(errData.error || `HTTP ${res.status}`)
        setCreating(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'log') {
                setLogs((prev) => [...prev, { text: event.text, step: event.step, total: event.total }])
              } else if (event.type === 'error') {
                setError(event.message)
              } else if (event.type === 'done') {
                setPrResult(event.data)
                setCreating(false)
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PR creation failed')
      setCreating(false)
    }
  }

  // ─── Download fixes as JSON ──────────────────────────────────────────────

  const handleDownloadFixes = () => {
    if (!fixReport) return
    const blob = new Blob([JSON.stringify(fixReport, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `alphatekx-fixes-${fixReport.fixId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <main className="w-full bg-[#0A0A14] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[900px]">
        {/* Header */}
        <header className="mb-8">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">GitHub Integration</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">Connect → Fix → Pull Request</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            Connect your GitHub account, select your website repo, and AlphaTekx will create a Pull Request with all fixes applied.
          </p>
        </header>

        {/* Step indicator */}
        <nav className="mb-8 flex items-center gap-1 overflow-x-auto pb-2">
          {(['connect', 'select-repo', 'review-fixes', 'creating', 'done'] as Step[]).map((s, i) => {
            const active = step === s
            const steps: Step[] = ['connect', 'select-repo', 'review-fixes', 'creating', 'done']
            const done = steps.indexOf(step) > i
            return (
              <div key={s} className="flex items-center gap-1">
                {i > 0 && <div className={`h-[2px] w-6 ${done || active ? 'bg-violet-400' : 'bg-white/10'}`} />}
                <span
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition ${
                    active
                      ? 'bg-violet-500 text-white shadow-[0_8px_24px_rgba(109,40,217,0.4)]'
                        : done
                          ? 'bg-violet-500/15 text-violet-300'
                          : 'bg-white/5 text-slate-500'
                  }`}
                >
                  {done ? <CheckCircle2 size={12} /> : <span className="grid size-4 place-items-center rounded-full bg-white/10 text-[9px]">{i + 1}</span>}
                  {s === 'connect' ? 'Connect' : s === 'select-repo' ? 'Repo' : s === 'review-fixes' ? 'Review' : s === 'creating' ? 'Creating' : 'Done'}
                </span>
              </div>
            )
          })}
        </nav>

        {/* ─── Step: Connect GitHub ──────────────────────────────────────── */}
        {step === 'connect' && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[radial-gradient(circle_at_top,_rgba(123,92,255,0.38),_rgba(17,19,31,0.9)_36%,_rgba(2,6,14,1)_72%)] p-6 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            {configured === false ? (
              <div className="text-center">
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-300">
                  <AlertTriangle size={28} />
                </div>
                <h2 className="text-xl font-black text-white">GitHub Not Configured</h2>
                <p className="mt-2 text-sm text-slate-400">{configError || 'GitHub OAuth is not configured on this server.'}</p>
                <p className="mt-2 text-xs text-slate-500">Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-300">
                  <Github size={28} />
                </div>
                <h2 className="text-xl font-black text-white">Connect Your GitHub Account</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Sign in with the GitHub account that hosts your website repository.
                </p>

                <div className="mx-auto mt-4 max-w-md rounded-2xl border border-amber-400/15 bg-amber-500/5 p-4 text-left">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
                    <div>
                      <p className="text-sm font-black text-amber-200">Important</p>
                      <p className="mt-1 text-xs text-amber-100/70">
                        Make sure this is the GitHub account that holds your <strong>actual website code</strong>.
                        We will create a new branch and open a Pull Request — we will NOT push directly to main.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleConnect}
                  className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110"
                >
                  <Github size={16} />
                  Connect GitHub Account
                </button>
              </div>
            )}
          </section>
        )}

        {/* ─── Step: Select Repo ────────────────────────────────────────── */}
        {step === 'select-repo' && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-6 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            {/* User badge */}
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

            {/* Warning */}
            <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-500/5 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
                <div>
                  <p className="text-sm font-black text-amber-200">Select the correct repository</p>
                  <p className="mt-1 text-xs text-amber-100/70">
                    Make sure you select the repo holding your <strong>full website</strong> — not just a component or API folder.
                    AlphaTekx will create branch <code className="rounded bg-white/10 px-1 py-0.5 text-[11px]">alphatekx-fix-{'{timestamp}'}</code> and open a Pull Request.
                  </p>
                </div>
              </div>
            </div>

            {/* Repo selector */}
            <div className="relative mb-4">
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Repository</label>
              <button
                onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
                disabled={loadingRepos}
                className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-300 transition hover:border-white/20 disabled:opacity-50"
              >
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
                  {repos.map((repo) => (
                    <button
                      key={repo.full_name}
                      onClick={() => handleSelectRepo(repo)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.05] ${selectedRepo === repo.full_name ? 'bg-violet-500/10' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-xs text-white">{repo.full_name}</span>
                          {repo.private && <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-slate-400">private</span>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                          <span>branch: {repo.default_branch}</span>
                          {repo.description && <span className="truncate">— {repo.description}</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                  {repos.length === 0 && !loadingRepos && (
                    <div className="px-4 py-6 text-center text-xs text-slate-500">No repositories found</div>
                  )}
                </div>
              )}
            </div>

            {/* Confirmation checkbox */}
            {selectedRepo && (
              <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.04]">
                <input
                  type="checkbox"
                  checked={repoConfirmed}
                  onChange={(e) => setRepoConfirmed(e.target.checked)}
                  className="mt-0.5 size-4 accent-violet-500"
                />
                <span className="text-xs text-slate-300">
                  I confirm <strong className="text-white">{selectedRepo}</strong> is my full website repository and I want to create a Pull Request with fixes.
                </span>
              </label>
            )}

            {/* Proceed button */}
            {selectedRepo && repoConfirmed && (
              <button
                onClick={() => setRepoConfirmed(true)}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110"
              >
                <Shield size={16} />
                Continue to Fix Review
              </button>
            )}
          </section>
        )}

        {/* ─── Step: Review Fixes ───────────────────────────────────────── */}
        {step === 'review-fixes' && fixReport && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-6 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            <header className="mb-6">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Fix Report</p>
              <h2 className="mt-2 text-2xl font-black text-white">
                {fixReport.fixes.length} fix{fixReport.fixes.length !== 1 ? 'es' : ''} ready for PR
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Target: <span className="font-mono text-white">{fixReport.targetUrl}</span>
              </p>
            </header>

            {/* Stats */}
            <div className="mb-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-rose-400/15 bg-rose-500/10 p-3 text-center">
                <div className="text-xl font-black text-rose-300">{fixReport.fixes.filter((f) => f.severity === 'critical' || f.severity === 'high').length}</div>
                <div className="text-[10px] font-black uppercase tracking-wider text-rose-300/70">Critical/High</div>
              </div>
              <div className="rounded-xl border border-amber-400/15 bg-amber-500/10 p-3 text-center">
                <div className="text-xl font-black text-amber-300">{fixReport.fixes.filter((f) => f.severity === 'medium').length}</div>
                <div className="text-[10px] font-black uppercase tracking-wider text-amber-300/70">Medium</div>
              </div>
              <div className="rounded-xl border border-sky-400/15 bg-sky-500/10 p-3 text-center">
                <div className="text-xl font-black text-sky-300">{fixReport.fixes.filter((f) => f.severity === 'low' || f.severity === 'info').length}</div>
                <div className="text-[10px] font-black uppercase tracking-wider text-sky-300/70">Low/Info</div>
              </div>
            </div>

            {/* Repo target */}
            <div className="mb-4 rounded-xl border border-violet-400/15 bg-violet-500/5 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-violet-300">Pull Request Target</p>
              <p className="mt-1 font-mono text-sm text-white">{selectedRepo}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Branch: alphatekx-fix-{'{timestamp}'} → {selectedBranch}</p>
            </div>

            {/* Fix list */}
            <div className="mb-4 max-h-[400px] space-y-2 overflow-y-auto pr-1">
              {fixReport.fixes.map((fix) => {
                const enabled = enabledFixes.has(fix.findingId)
                return (
                  <div
                    key={fix.findingId}
                    className={`rounded-xl border transition ${enabled ? 'border-violet-400/20 bg-violet-500/5' : 'border-white/10 bg-white/[0.01] opacity-50'}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleFix(fix.findingId)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <div className={`size-2 shrink-0 rounded-full ${enabled ? 'bg-violet-400' : 'bg-slate-600'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-white">{fix.description}</p>
                        <p className="text-[10px] text-slate-500">{fix.findingType} · {fix.url || 'N/A'}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                        fix.severity === 'critical' ? 'bg-rose-500/15 text-rose-300' :
                        fix.severity === 'high' ? 'bg-orange-500/15 text-orange-300' :
                        fix.severity === 'medium' ? 'bg-amber-500/15 text-amber-300' :
                        'bg-sky-500/15 text-sky-300'
                      }`}>
                        {fix.severity}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleCreatePR}
                disabled={creating || enabledFixes.size === 0}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(16,185,129,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <GitPullRequest size={16} />
                Create Pull Request ({enabledFixes.size} fixes)
              </button>
              <button
                onClick={handleDownloadFixes}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black text-slate-400 transition hover:text-white"
              >
                <Download size={14} />
                Download Fixes
              </button>
              <button
                onClick={() => { setFixReport(null); setFixReportInput(''); }}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black text-slate-400 transition hover:text-white"
              >
                Back
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>
            )}
          </section>
        )}

        {/* ─── Step: Review Fixes (no report loaded yet) ────────────────── */}
        {step === 'review-fixes' && !fixReport && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-6 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            <header className="mb-6">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Load Fix Report</p>
              <h2 className="mt-2 text-2xl font-black text-white">Enter a Scan ID or Fix ID</h2>
              <p className="mt-1 text-sm text-slate-400">
                Enter the scan ID from a previous scan, or a fix ID from the auto-fix engine.
              </p>
            </header>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={fixReportInput}
                onChange={(e) => setFixReportInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLoadReport()}
                placeholder="scan_xxxxx or fix_xxxxx"
                className="min-h-[52px] flex-1 rounded-full border border-violet-200/15 bg-black/20 px-5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-violet-300/40"
              />
              <button
                onClick={handleLoadReport}
                disabled={loadingReport || !fixReportInput.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingReport ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                {loadingReport ? 'Loading...' : 'Load Fix Report'}
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => { setFixReport(null); setFixReportInput(''); setSelectedRepo(''); setRepoConfirmed(false); setConnected(null); }}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black text-slate-400 transition hover:text-white"
              >
                Back to Repo Selection
              </button>
            </div>

            {reportError && (
              <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{reportError}</div>
            )}
          </section>
        )}

        {/* ─── Step: Creating PR ────────────────────────────────────────── */}
        {step === 'creating' && (
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-6 shadow-[0_32px_120px_rgba(76,29,149,0.28)] sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-violet-400" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Creating Pull Request</p>
                <h2 className="mt-1 text-xl font-black text-white">{selectedRepo}</h2>
              </div>
            </div>

            {logs.length > 0 && (
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5">
                    {log.step && log.total && (
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-500/15 text-[10px] font-black text-violet-300">
                        {log.step}/{log.total}
                      </span>
                    )}
                    <p className="text-xs text-slate-300">{log.text}</p>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">{error}</div>
            )}
          </section>
        )}

        {/* ─── Step: Done ───────────────────────────────────────────────── */}
        {step === 'done' && prResult && (
          <section className="rounded-[28px] border border-emerald-400/20 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.2),_rgba(17,19,31,0.9)_40%,_rgba(2,6,14,1)_72%)] p-8 text-center shadow-[0_32px_120px_rgba(16,185,129,0.15)]">
            {prResult.noChanges ? (
              <>
                <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-300">
                  <AlertTriangle size={40} />
                </div>
                <h2 className="text-3xl font-black text-white">No Changes Needed</h2>
                <p className="mt-3 text-sm text-slate-400">
                  The files in <span className="font-mono text-white">{selectedRepo}</span> already match the fixes.
                </p>
              </>
            ) : prResult.error ? (
              <>
                <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full border border-rose-400/30 bg-rose-500/10 text-rose-300">
                  <AlertTriangle size={40} />
                </div>
                <h2 className="text-3xl font-black text-white">PR Creation Failed</h2>
                <p className="mt-3 text-sm text-slate-400">Something went wrong. Check the error and try again.</p>
                <button
                  onClick={() => { setPrResult(null); setCreating(false); setError(null); }}
                  className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110"
                >
                  Try Again
                </button>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                  <CheckCircle2 size={40} />
                </div>
                <h2 className="text-3xl font-black text-white">Pull Request Created</h2>
                <p className="mt-3 text-sm text-slate-400">
                  {prResult.fixesApplied} fix{prResult.fixesApplied !== 1 ? 'es' : ''} applied across {prResult.filesChanged} file{prResult.filesChanged !== 1 ? 's' : ''} in <span className="font-mono text-white">{selectedRepo}</span>
                </p>

                <div className="mx-auto mt-6 max-w-md space-y-3">
                  <a
                    href={prResult.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(16,185,129,0.35)] transition hover:brightness-110"
                  >
                    <ExternalLink size={16} />
                    Open Pull Request #{prResult.prNumber}
                  </a>

                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">PR Details</p>
                    <p className="mt-1 text-xs text-white">{prResult.prTitle}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">{prResult.branchName} → {prResult.baseBranch}</p>
                  </div>

                  <p className="text-xs text-slate-500">
                    Review and merge the PR on GitHub. If you have auto-deploy enabled, your site will update automatically after merge.
                  </p>

                  <button
                    onClick={() => { setPrResult(null); setFixReport(null); setFixReportInput(''); setSelectedRepo(''); setRepoConfirmed(false); setCreating(false); setLogs([]); setError(null); }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-black text-slate-400 transition hover:text-white"
                  >
                    Create Another PR
                  </button>
                </div>

                {/* Screenshot comparison */}
                {fixReport?.scanId && (
                  <div className="mx-auto mt-8 max-w-2xl">
                    <BeforeAfter scanId={fixReport.scanId} />
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ─── Fix Report Input (shown when connected but no repo selected yet) ─── */}
        {step === 'connect' && connected && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setRepoConfirmed(false)}
              className="text-xs text-violet-300 hover:text-violet-200"
            >
              Continue →
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
