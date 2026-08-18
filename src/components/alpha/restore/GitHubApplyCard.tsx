import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { GitBranch, GitPullRequest, ExternalLink, RotateCcw, Loader2, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react'

type Repo = {
  full_name: string
  default_branch: string
  private: boolean
  description: string
  updated_at: string
  html_url: string
}

type ApplyLog = {
  text: string
  ts: number
}

type ApplyResult = {
  backupBranch?: string
  backupUrl?: string
  mainUrl?: string
  commitSha?: string
  liveUrl?: string
  filesChanged?: number
  noChanges?: boolean
  protected?: boolean
  error?: boolean
}

export default function GitHubApplyCard({ scanId }: { scanId: string }) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [user, setUser] = useState<{ login: string; avatar_url: string } | null>(null)
  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [applying, setApplying] = useState(false)
  const [logs, setLogs] = useState<ApplyLog[]>([])
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Check GitHub connection on mount
  useEffect(() => {
    fetch('/api/github/status', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setConnected(data.connected)
        if (data.user) setUser(data.user)
      })
      .catch(() => setConnected(false))
  }, [])

  // Fetch repos when connected
  const fetchRepos = useCallback(async () => {
    if (!connected) return
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
  }, [connected])

  useEffect(() => {
    if (connected) fetchRepos()
  }, [connected, fetchRepos])

  const handleConnect = () => {
    window.location.href = '/api/auth/github'
  }

  const handleSelectRepo = (repo: Repo) => {
    setSelectedRepo(repo.full_name)
    setSelectedBranch(repo.default_branch)
    setRepoDropdownOpen(false)
  }

  const handleApplyFix = async () => {
    if (!selectedRepo) return
    setApplying(true)
    setLogs([])
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/github/apply-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ repoFullName: selectedRepo, scanId }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

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
                setLogs(prev => [...prev, { text: event.text, ts: Date.now() }])
              } else if (event.type === 'error') {
                setError(event.message)
              } else if (event.type === 'done') {
                setResult(event.data)
                setApplying(false)
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Apply fix failed')
      setApplying(false)
    }
  }

  const handleRollback = async () => {
    if (!selectedRepo || !result?.backupBranch) return
    setApplying(true)
    setError(null)

    try {
      const res = await fetch('/api/github/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ repoFullName: selectedRepo, backupBranch: result.backupBranch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Rollback failed')
      setResult(prev => ({ ...prev, ...data }))
    } catch (err: any) {
      setError(err.message || 'Rollback failed')
    } finally {
      setApplying(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <div className="grid size-8 place-items-center rounded-lg bg-[#D6FF00]/10">
          <GitBranch size={14} className="text-[#D6FF00]" />
        </div>
        <div className="flex-1">
          <h4 className="text-[13px] font-bold text-white">Push Fix to GitHub</h4>
          <p className="mt-0.5 text-[11px] text-white/30">Connect your repo and push the fix directly to main</p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Not connected */}
        {connected === false && (
          <div className="text-center space-y-3">
            <p className="text-[12px] text-white/50">Connect your GitHub account to push fixes directly to your repository.</p>
            <button
              onClick={handleConnect}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D6FF00] px-4 py-2 text-[13px] font-bold text-black transition hover:bg-[#C2E600]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              Connect GitHub
            </button>
          </div>
        )}

        {/* Loading */}
        {connected === null && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 size={14} className="animate-spin text-white/40" />
            <span className="text-[12px] text-white/40">Checking connection...</span>
          </div>
        )}

        {/* Connected — repo selector */}
        {connected && (
          <>
            {/* User badge */}
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
              {user?.avatar_url && (
                <img src={user.avatar_url} alt="" className="size-6 rounded-full" />
              )}
              <span className="text-[12px] text-white/70">{user?.login || 'Connected'}</span>
              <CheckCircle2 size={12} className="ml-auto text-green-400" />
            </div>

            {/* Repo dropdown */}
            <div className="relative">
              <label className="mb-1 block text-[11px] font-medium text-white/40">Repository</label>
              <button
                onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
                disabled={loadingRepos || applying}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/70 transition hover:border-white/[0.15] disabled:opacity-50"
              >
                {loadingRepos ? (
                  <span className="flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading repos...</span>
                ) : selectedRepo ? (
                  <span className="flex items-center gap-2 font-mono text-white/90">{selectedRepo}</span>
                ) : (
                  <span className="text-white/30">Select a repository</span>
                )}
                <ChevronDown size={14} className={`shrink-0 text-white/30 transition ${repoDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {repoDropdownOpen && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-white/[0.1] bg-[#1A1A1A] shadow-2xl">
                  {repos.map(repo => (
                    <button
                      key={repo.full_name}
                      onClick={() => handleSelectRepo(repo)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.05] ${selectedRepo === repo.full_name ? 'bg-[#D6FF00]/[0.06]' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-[12px] text-white/80">{repo.full_name}</span>
                          {repo.private && <span className="shrink-0 rounded bg-white/[0.08] px-1.5 py-0.5 text-[9px] text-white/40">private</span>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/30">
                          <span>branch: {repo.default_branch}</span>
                          {repo.description && <span className="truncate">— {repo.description}</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                  {repos.length === 0 && !loadingRepos && (
                    <div className="px-3 py-4 text-center text-[12px] text-white/30">No repositories found</div>
                  )}
                </div>
              )}
            </div>

            {/* Branch indicator */}
            {selectedRepo && selectedBranch && (
              <div className="flex items-center gap-2 rounded-xl border border-[#D6FF00]/10 bg-[#D6FF00]/[0.03] px-3 py-2">
                <GitBranch size={12} className="text-[#D6FF00]/60" />
                <span className="text-[11px] text-[#D6FF00]/70">Will push to: <strong className="text-[#D6FF00]">{selectedBranch}</strong></span>
              </div>
            )}

            {/* Warning */}
            {selectedRepo && !result && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/10 bg-amber-500/[0.03] px-3 py-2.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400/70" />
                <p className="text-[11px] leading-relaxed text-amber-200/60">
                  We will push the fix <strong className="text-amber-200">directly to {selectedBranch}</strong> — your site will redeploy automatically. A backup branch will be created so you can roll back anytime.
                </p>
              </div>
            )}

            {/* Apply button */}
            {selectedRepo && !result && (
              <button
                onClick={handleApplyFix}
                disabled={applying}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6FF00] px-4 py-2.5 text-[13px] font-bold text-black transition hover:bg-[#C2E600] disabled:opacity-50"
              >
                {applying ? (
                  <><Loader2 size={14} className="animate-spin" /> Applying fix...</>
                ) : (
                  <><GitPullRequest size={14} /> Fix My Site Now — Push to {selectedBranch}</>
                )}
              </button>
            )}

            {/* SSE Logs */}
            {logs.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/50 max-h-48 overflow-y-auto space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="shrink-0 text-white/20">{String(i + 1).padStart(2, ' ')}</span>
                    <span className={
                      log.text.includes('error') || log.text.includes('Error') || log.text.includes('protected')
                        ? 'text-red-400'
                        : log.text.includes('complete') || log.text.includes('Done') || log.text.includes('Push complete')
                          ? 'text-green-400'
                          : 'text-white/50'
                    }>{log.text}</span>
                  </div>
                ))}
                {applying && (
                  <div className="flex gap-2">
                    <Loader2 size={10} className="mt-1 animate-spin text-[#D6FF00]" />
                    <span className="text-[#D6FF00]/60">working...</span>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-500/15 bg-red-500/[0.04] px-3 py-2.5">
                <p className="text-[11px] text-red-400/80">{error}</p>
              </div>
            )}

            {/* Success result */}
            {result && !result.error && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-xl border border-green-500/15 bg-green-500/[0.04] px-3 py-2.5">
                  <CheckCircle2 size={14} className="text-green-400" />
                  <span className="text-[12px] font-bold text-green-400">
                    {result.noChanges ? 'No changes needed — files already up to date' : `Fix pushed! ${result.filesChanged} file(s) updated`}
                  </span>
                </div>

                {!result.noChanges && (
                  <div className="flex flex-wrap gap-2">
                    {result.backupUrl && (
                      <a
                        href={result.backupUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60 transition hover:border-white/[0.15] hover:text-white/80"
                      >
                        <ExternalLink size={10} /> Backup branch
                      </a>
                    )}
                    {result.mainUrl && (
                      <a
                        href={result.mainUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60 transition hover:border-white/[0.15] hover:text-white/80"
                      >
                        <ExternalLink size={10} /> View commit
                      </a>
                    )}
                    {result.liveUrl && (
                      <a
                        href={result.liveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#D6FF00]/[0.08] border border-[#D6FF00]/15 px-3 py-1.5 text-[11px] text-[#D6FF00]/80 transition hover:bg-[#D6FF00]/[0.12]"
                      >
                        <ExternalLink size={10} /> Live site
                      </a>
                    )}
                  </div>
                )}

                {!result.noChanges && result.backupBranch && (
                  <button
                    onClick={handleRollback}
                    disabled={applying}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/50 transition hover:border-red-400/20 hover:text-red-400/70 disabled:opacity-50"
                  >
                    {applying ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                    Rollback
                  </button>
                )}
              </div>
            )}

            {/* Protected branch error */}
            {result?.protected && (
              <div className="space-y-2">
                <p className="text-[11px] text-amber-300/60">
                  Branch is protected. Go to GitHub Settings → Branches → remove protection rules, then try again.
                </p>
                {result.backupUrl && (
                  <a
                    href={result.backupUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60 transition hover:border-white/[0.15] hover:text-white/80"
                  >
                    <ExternalLink size={10} /> View backup branch
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
