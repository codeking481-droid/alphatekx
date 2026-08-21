import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Github,
  Globe,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'

type Phase = 'scan' | 'fix' | 'options' | 'delivery' | 'verify' | 'done'
type OptionKind = 'github' | 'download' | 'copy' | 'deploy'
type Severity = 'critical' | 'high' | 'medium' | 'low'

type Finding = { id: string; type: string; severity: Severity; description: string; count: number }
type Summary = { issues_found: number; issues_fixed: number; files_modified: number; before_score: number; after_score: number }

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function localUserHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('alphatekx:local-user')
    if (!raw) return {}
    const u = JSON.parse(raw)
    if (u?.id && u?.email) return { 'x-local-user-id': String(u.id), 'x-local-user-email': String(u.email) }
  } catch {}
  return {}
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
}

const severityStyle: Record<Severity, string> = {
  critical: 'border-red-400/30 bg-red-500/10 text-red-300',
  high: 'border-orange-400/30 bg-orange-500/10 text-orange-300',
  medium: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  low: 'border-sky-400/30 bg-sky-500/10 text-sky-300',
}

const options: Array<{ kind: OptionKind; label: string; icon: typeof Github }> = [
  { kind: 'github', label: 'GitHub', icon: Github },
  { kind: 'download', label: 'Download', icon: Download },
  { kind: 'copy', label: 'Copy Code', icon: Copy },
  { kind: 'deploy', label: 'Deploy', icon: Globe },
]

export default function RestoreEngineChat({ url }: { url: string }) {
  const [phase, setPhase] = useState<Phase>('scan')
  const [lines, setLines] = useState<string[]>([`🔗 ${url}`])
  const [findings, setFindings] = useState<Finding[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [option, setOption] = useState<OptionKind | null>(null)
  const [actionDone, setActionDone] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  const [repo, setRepo] = useState('')
  const [prUrl, setPrUrl] = useState('')
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [siteName, setSiteName] = useState('')
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [deployUrl, setDeployUrl] = useState('')
  const [utf8Clean, setUtf8Clean] = useState<boolean | null>(null)

  const [sessionId, setSessionId] = useState('')

  const push = useCallback((line: string) => setLines(prev => [...prev, line]), [])

  const api = useCallback(async (path: string, body?: unknown) => {
    const res = await fetch(`/api/engine/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...localUserHeaders() },
      body: JSON.stringify(body ?? {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.step === 'error') throw new Error(data.error || `Engine request failed (${res.status}).`)
    return data
  }, [])

  const getState = useCallback(async (sid: string) => {
    return fetch(`/api/engine/state?sessionId=${encodeURIComponent(sid)}`).then(r => r.json())
  }, [])

  const run = useCallback(async () => {
    setError('')
    setActionDone(false)
    setOption(null)
    setSummary(null)
    setFindings([])
    setPrUrl('')
    setDeployUrl('')
    setCopied(false)
    setNameMsg(null)
    setUtf8Clean(null)
    setBusy(true)
    try {
      setPhase('scan')
      setLines([`🔗 ${url}`, '✅ Site reachable', '🔍 Checking for issues...'])
      const session = await api('session')
      setSessionId(session.sessionId)
      await sleep(400)
      await api('scan', { sessionId: session.sessionId, url })
      const scanned = await getState(session.sessionId)
      const found: Finding[] = scanned.findings || []
      setFindings(found)
      const total = found.reduce((n, f) => n + (f.count || 1), 0)
      push(`✅ Scan complete! Found ${total} issue${total === 1 ? '' : 's'} · Score: ${scanned.score ?? '--'}/100`)
      await sleep(350)
      setPhase('fix')
      push('🔧 Generating fixes...')
      await api('fix', { sessionId: session.sessionId })
      push('🛠️ Applying fixes...')
      await api('approve', { sessionId: session.sessionId, approved: true })
      const done = await getState(session.sessionId)
      setSummary(done.summary || null)
      push(`✅ All ${done.summary?.issues_fixed ?? 0} issues fixed! Score: ${done.summary?.before_score ?? '--'} → ${done.summary?.after_score ?? '--'}`)
      setPhase('options')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }, [api, getState, push, url])

  useEffect(() => { void run() }, [run])

  const choose = async (kind: OptionKind) => {
    setBusy(true)
    setError('')
    try {
      await api('delivery', { sessionId, option: kind })
      setOption(kind)
      setPhase('delivery')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not select that option.')
    } finally {
      setBusy(false)
    }
  }

  const connectGithub = async () => {
    if (!repo.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      push('🔗 Creating branch and applying fixes...')
      const r = await api('github', { sessionId, repo: repo.trim() })
      setPrUrl(r.actions?.[0]?.url || '')
      push('✅ Pull Request created!')
      setActionDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'GitHub request failed.')
    } finally {
      setBusy(false)
    }
  }

  const downloadZip = () => {
    window.open(`/api/engine/download?sessionId=${encodeURIComponent(sessionId)}`, '_blank')
    push('✅ restored.zip downloaded')
    void api('action-complete', { sessionId, action: 'download' }).catch(() => {})
    setActionDone(true)
  }

  useEffect(() => {
    if (phase === 'delivery' && option === 'copy' && sessionId && !code) {
      void fetch(`/api/engine/code?sessionId=${encodeURIComponent(sessionId)}`).then(r => r.text()).then(setCode).catch(() => {})
    }
  }, [phase, option, sessionId, code])

  const copyCode = async () => {
    if (busy || copied) return
    setBusy(true)
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      push('✅ Copied to clipboard!')
      await api('action-complete', { sessionId, action: 'copy' })
      setActionDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not copy the code.')
    } finally {
      setBusy(false)
    }
  }

  const checkName = async () => {
    const slug = slugify(siteName)
    if (slug.length < 3) {
      setNameMsg({ ok: false, text: 'Use at least 3 characters.' })
      return false
    }
    const r = await fetch(`/api/check-availability?name=${encodeURIComponent(slug)}`, { headers: localUserHeaders() }).then(res => res.json())
    setNameMsg({ ok: Boolean(r.available || r.owned), text: String(r.message || '') })
    return Boolean(r.available || r.owned)
  }

  const deploySite = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const ok = await checkName()
      if (!ok) return
      push('🚀 Deploying your restored site...')
      const r = await api('deploy', { sessionId, name: slugify(siteName) })
      setDeployUrl(r.actions?.[0]?.url || '')
      push('✅ Deployed successfully!')
      setActionDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deploy failed.')
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (busy || !actionDone) return
    setBusy(true)
    setPhase('verify')
    setError('')
    try {
      push('🔄 Verifying your restoration...')
      await api('verify', { sessionId })
      const st = await getState(sessionId)
      setSummary(st.summary || null)
      setUtf8Clean(st.verifyResult?.utf8Clean ?? null)
      push('✅ Verification complete!')
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-xl rounded-2xl border border-[#D6FF00]/15 bg-[#0D0D0D] p-4 text-white">
      {/* Conversation log */}
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <p key={i} className="text-[13px] leading-relaxed text-white/75">{line}</p>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-[13px] text-[#D6FF00]">
            <Loader2 size={13} className="animate-spin" /> Working...
          </p>
        )}
      </div>

      {/* Findings breakdown */}
      {findings.length > 0 && phase !== 'done' && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {findings.map(f => (
            <span key={f.id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${severityStyle[f.severity]}`}>
              {f.severity}: {f.count}
            </span>
          ))}
        </div>
      )}

      {/* Before / After */}
      {summary && (phase === 'options' || phase === 'delivery' || phase === 'verify' || phase === 'done') && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-red-400/20 bg-red-500/[0.06] p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Before</p>
            <p className="mt-1 text-2xl font-black text-red-300">{summary.before_score}/100</p>
            <p className="text-[10px] text-white/35">{summary.issues_found} issues</p>
          </div>
          <div className="rounded-xl border border-[#D6FF00]/25 bg-[#D6FF00]/[0.06] p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">After</p>
            <p className="mt-1 text-2xl font-black text-[#D6FF00]">{summary.after_score}/100</p>
            <p className="text-[10px] text-white/35">{summary.issues_fixed} fixed</p>
          </div>
        </div>
      )}

      {/* Step: pick an option */}
      {phase === 'options' && (
        <div className="mt-4">
          <p className="text-[12px] font-bold text-white/60">Choose how to get your fixed code:</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {options.map(({ kind, label, icon: Icon }) => (
              <button
                key={kind}
                onClick={() => void choose(kind)}
                disabled={busy}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] font-bold text-white transition hover:border-[#D6FF00]/40 hover:bg-[#D6FF00]/[0.08] hover:text-[#D6FF00] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: complete the chosen action */}
      {phase === 'delivery' && option === 'github' && (
        <div className="mt-4 space-y-2">
          <p className="text-[12px] text-white/60">Your GitHub repo (owner/name) — it should contain your website files:</p>
          <div className="flex gap-2">
            <input
              value={repo}
              onChange={e => setRepo(e.target.value)}
              placeholder="username/website"
              className="min-h-10 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-white outline-none focus:border-[#D6FF00]/50"
            />
            <button onClick={() => void connectGithub()} disabled={busy || !repo.trim()} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-[#D6FF00] px-4 text-[12px] font-black text-black transition hover:bg-[#C2E600] disabled:opacity-30">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Github size={13} />} Create PR
            </button>
          </div>
          {prUrl && (
            <a href={prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#D6FF00] hover:underline">
              Open Pull Request <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {phase === 'delivery' && option === 'download' && (
        <div className="mt-4">
          <button onClick={downloadZip} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-[13px] font-bold text-white transition hover:border-[#D6FF00]/40 hover:text-[#D6FF00]">
            <Download size={14} /> Download restored.zip
          </button>
        </div>
      )}

      {phase === 'delivery' && option === 'copy' && (
        <div className="mt-4 space-y-2">
          <pre className="max-h-40 overflow-auto rounded-xl border border-white/[0.08] bg-black/40 p-3 font-mono text-[10px] leading-4 text-white/60">{code ? `${code.slice(0, 1200)}${code.length > 1200 ? '\n...' : ''}` : 'Loading your fixed code...'}</pre>
          <button onClick={() => void copyCode()} disabled={busy || !code} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-[13px] font-bold text-white transition hover:border-[#D6FF00]/40 hover:text-[#D6FF00] disabled:opacity-40">
            <Copy size={14} /> {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
        </div>
      )}

      {phase === 'delivery' && option === 'deploy' && (
        <div className="mt-4 space-y-2">
          <p className="text-[12px] text-white/60">Pick a name for your live site:</p>
          <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3">
            <span className="shrink-0 text-[11px] text-white/35">alphatekx.name.ng/app/</span>
            <input
              value={siteName}
              onChange={e => { setSiteName(e.target.value); setNameMsg(null) }}
              placeholder="my-site"
              className="min-h-10 min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none"
            />
            <button onClick={() => void deploySite()} disabled={busy || !siteName.trim()} className="my-1.5 flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#D6FF00] px-3 text-[11px] font-black text-black transition hover:bg-[#C2E600] disabled:opacity-30">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />} Deploy
            </button>
          </div>
          {nameMsg && <p className={`text-[11px] font-bold ${nameMsg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{nameMsg.text}</p>}
          {deployUrl && (
            <a href={deployUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#D6FF00] hover:underline">
              Open your live site <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {/* Continue gate */}
      {phase === 'delivery' && (
        <button
          onClick={() => void verify()}
          disabled={!actionDone || busy}
          title={!actionDone ? 'Complete your selected option first' : undefined}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D6FF00] px-4 text-[13px] font-black text-black transition hover:bg-[#C2E600] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Continue
        </button>
      )}

      {/* Done */}
      {phase === 'done' && (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl border border-[#D6FF00]/25 bg-[#D6FF00]/[0.06] p-3 text-[13px] font-bold text-[#D6FF00]">
            🎉 Your site is fully restored — clean, secure, and fast.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {utf8Clean !== null && (utf8Clean ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 font-bold text-emerald-300"><CheckCircle2 size={11} /> UTF-8 Clean</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 font-bold text-amber-300"><AlertTriangle size={11} /> Encoding needs review</span>
            ))}
            {deployUrl && <a href={deployUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-bold text-white/70 hover:text-white"><ExternalLink size={11} /> Live site</a>}
            {prUrl && <a href={prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-bold text-white/70 hover:text-white"><ExternalLink size={11} /> Pull request</a>}
          </div>
          <button onClick={() => void run()} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-[12px] font-bold text-white transition hover:border-[#D6FF00]/40 hover:text-[#D6FF00]">
            <RotateCcw size={13} /> Restore Another Site
          </button>
        </div>
      )}

      {/* Errors */}
      {error && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-3">
          <p className="text-[12px] font-bold text-red-300">⚠️ {error}</p>
          <button onClick={() => void run()} className="shrink-0 rounded-lg border border-red-400/30 px-2.5 py-1 text-[11px] font-bold text-red-200 hover:bg-red-500/20">Retry</button>
        </div>
      )}
    </div>
  )
}
