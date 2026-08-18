import { Activity, AlertTriangle, Bug, Camera, CheckCircle2, Download, FileText, Hammer, Loader2, Lock, QrCode, Radar, RefreshCw, ShieldCheck, Sparkles, Wrench } from 'lucide-react'

const STEPS = ['Scanning', 'Fear', 'Fixing', 'Proving', 'Watching']

const SEVERITY_CHIP: Record<string, string> = {
  CRITICAL: 'bg-rose-500/15 text-rose-300',
  HIGH: 'bg-orange-500/15 text-orange-300',
  MEDIUM: 'bg-amber-500/15 text-amber-300',
  LOW: 'bg-sky-500/15 text-sky-300',
  HEALTHY: 'bg-emerald-500/15 text-emerald-300',
}

function StepDots({ activeStep, doneSteps }: { activeStep: number; doneSteps: Set<number> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STEPS.map((label, index) => {
        const active = index === activeStep
        const done = doneSteps.has(index)
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] transition ${
                active
                  ? 'bg-violet-500 text-white shadow-[0_10px_24px_rgba(109,40,217,0.4)]'
                  : done
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-white/[0.04] text-slate-500'
              }`}
            >
              {done ? <CheckCircle2 size={12} /> : <span className="size-1.5 rounded-full bg-current" />}
              {label}
            </div>
            {index < STEPS.length - 1 && <span className="text-slate-600">›</span>}
          </div>
        )
      })}
    </div>
  )
}

export default function RestoreEngineWizard({
  scan,
  scanId,
  isScanning,
  progress,
  status,
  plan,
  watching,
  onRunFix,
  isFixing,
  fixResult,
  onVerify,
  isVerifying,
  verifyResult,
  watcherStatus,
  onEnableWatcher,
}: {
  scan: any
  scanId: string | null
  isScanning: boolean
  progress: number
  status: string
  plan: any
  watching: any
  onRunFix: () => void
  isFixing: boolean
  fixResult: any
  onVerify: () => void
  isVerifying: boolean
  verifyResult: any
  watcherStatus: any
  onEnableWatcher: () => void
}) {
  const risk = scan?.risk
  const liveSecrets = (scan?.liveSecrets || []).filter((secret: any) => secret.isLive)
  const exposedPaths = scan?.exposedPaths || []
  const secrets = scan?.secrets || []
  const git = scan?.gitHistory || {}
  const aiBuild = scan?.aiBuild || {}
  const fixPlan = scan?.fixPlan || {}

  const activeStep = isScanning ? 0 : fixResult ? 3 : scan ? 1 : 0
  const doneSteps = new Set<number>()
  if (scan) doneSteps.add(0)
  if (scan) doneSteps.add(1)
  if (fixResult || isFixing) doneSteps.add(2)
  if (verifyResult || scan?.proof) doneSteps.add(3)
  if (watcherStatus || watching) doneSteps.add(4)

  return (
    <section className="mt-8 rounded-[30px] border border-violet-200/20 bg-[#0c0e15]/80 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Restore Engine — 5 steps</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-white">Scan → Fear → Fix → Prove → Watch</h2>
        </div>
        <StepDots activeStep={activeStep} doneSteps={doneSteps} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        {/* ---- STEP 1: SCANNING ---- */}
        {isScanning && (
          <div className="xl:col-span-2 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-5">
            <div className="flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-violet-300" />
              <p className="text-sm font-black text-white">{status || 'Scanning with a real browser...'}</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/30">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all duration-300" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-400">{Math.round(Math.min(progress, 100))}% — 25 sensitive paths, JS bundles, git history, live-key checks</p>
          </div>
        )}

        {/* ---- STEP 2: FEAR ---- */}
        {scan && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <AlertTriangle size={16} className="text-rose-300" /> Fear — what is actually wrong
            </div>
            {risk && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-4xl font-black text-white">{risk.score}</span>
                <div className="space-y-0.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${SEVERITY_CHIP[risk.grade] || SEVERITY_CHIP.MEDIUM}`}>
                    Grade {risk.grade}
                  </span>
                  <div className="text-xs font-black text-rose-300">{risk.verdict}</div>
                </div>
              </div>
            )}
            {risk?.consequences?.length > 0 && (
              <ul className="mt-4 space-y-2">
                {risk.consequences.map((consequence: string, index: number) => (
                  <li key={index} className="flex items-start gap-2 text-xs text-slate-300">
                    <Bug size={13} className="mt-0.5 shrink-0 text-rose-300" />
                    <span>{consequence}</span>
                  </li>
                ))}
              </ul>
            )}
            {scan.maskedValue && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-400/20 bg-black/30 px-3 py-2">
                <Lock size={14} className="shrink-0 text-rose-300" />
                <code className="truncate font-mono text-xs text-rose-200">{scan.maskedValue}</code>
              </div>
            )}
            {liveSecrets.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Live right now ({liveSecrets.length})</p>
                <div className="mt-2 space-y-1.5">
                  {liveSecrets.slice(0, 6).map((secret: any, index: number) => (
                    <div key={`${secret.kind}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-rose-500/5 px-2.5 py-1.5">
                      <span className="truncate text-xs text-slate-200">{secret.provider || secret.kind}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <code className="font-mono text-[10px] text-amber-300">{secret.maskedValue}</code>
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-black text-rose-300">LIVE</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- STEP 2b: FEAR — findings detail ---- */}
        {scan && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <Radar size={16} className="text-violet-300" /> Evidence
            </div>
            {exposedPaths.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Sensitive files returning HTTP 200 ({exposedPaths.length})</p>
                <div className="mt-2 space-y-1.5">
                  {exposedPaths.slice(0, 8).map((path: any) => (
                    <div key={path.path} className="flex items-center justify-between gap-2 rounded-lg bg-rose-500/5 px-2.5 py-1.5">
                      <code className="truncate font-mono text-xs text-slate-200">{path.path}</code>
                      <div className="flex shrink-0 items-center gap-2">
                        {path.maskedValue && <code className="hidden truncate font-mono text-[10px] text-rose-300/80 sm:inline">{path.maskedValue}</code>}
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-black text-rose-300">HTTP {path.statusCode}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {secrets.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Secrets in bundles ({secrets.length})</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {secrets.slice(0, 10).map((secret: any, index: number) => (
                    <span key={`${secret.kind}-${index}`} className="rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-200">
                      {secret.maskedValue}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Git history</p>
                <p className="mt-1 text-xs text-slate-200">
                  {git.localGitExposed ? 'Live .git exposed' : 'No live .git'}
                  {git.deletedSecretFiles?.length ? ` · ${git.deletedSecretFiles.length} deleted secret files` : ''}
                  {git.repoOwner ? ` · ${git.repoOwner}/${git.repoName}` : ''}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">AI builder</p>
                <p className="mt-1 text-xs text-slate-200">
                  {aiBuild.builder === 'unknown' ? 'No builder fingerprint' : aiBuild.builder}
                  {aiBuild.usesSupabase ? ' · Supabase' : ''}
                  {aiBuild.usesVercel ? ' · Vercel' : ''}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">{scan.summary}</p>
          </div>
        )}

        {/* ---- STEP 3: FIXING ---- */}
        {scan && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <Hammer size={16} className="text-emerald-300" /> Fixing — paid-plan action
            </div>
            {fixPlan?.steps?.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {fixPlan.steps.map((step: any) => (
                  <div key={step.id} className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                    <span className={`mt-0.5 size-1.5 shrink-0 rounded-full ${step.status === 'done' ? 'bg-emerald-400' : step.status === 'ready' ? 'bg-violet-400' : 'bg-slate-500'}`} />
                    <div>
                      <p className="text-xs font-black text-slate-200">{step.label}</p>
                      <p className="text-[11px] text-slate-400">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onRunFix}
                disabled={isFixing || Boolean(fixResult)}
                className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-black text-white shadow-[0_18px_38px_rgba(16,185,129,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isFixing ? <><Loader2 size={14} className="mr-2 inline animate-spin" />Fixing...</> : fixResult ? 'Fix ran' : <><Wrench size={14} className="mr-2 inline" />Run the Fix Engine</>}
              </button>
              {plan && <span className="text-[11px] text-slate-400">Gated to {plan.name} plan</span>}
            </div>
            {fixResult && (
              <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-3 py-2">
                <p className="text-xs font-black text-emerald-300">Status: {fixResult.status}</p>
                {fixResult.error && <p className="mt-1 text-[11px] text-amber-200">{fixResult.error}</p>}
                {fixResult.backupBranch && <p className="mt-1 font-mono text-[11px] text-slate-300">Backup: {fixResult.backupBranch}</p>}
                <div className="mt-2 space-y-1">
                  {(fixResult.steps || []).filter((step: any) => step.status === 'done').map((step: any) => (
                    <p key={step.id} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                      <CheckCircle2 size={12} className="text-emerald-400" /> {step.description}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- STEP 4: PROVING ---- */}
        {scan && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <Camera size={16} className="text-amber-300" /> Proving — tamper-evident proof
            </div>
            {scan.proof?.proofBefore && (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <a href={scan.proof.proofBefore} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-white/10">
                  <div className="flex h-24 items-center justify-center bg-black/30 text-[10px] font-black text-slate-400 group-hover:text-white"><FileText size={20} /></div>
                  <div className="bg-white/[0.03] px-2 py-1.5 text-[10px] font-black text-slate-300">BEFORE</div>
                </a>
                <a href={scan.proof.proofAfter} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-white/10">
                  <div className="flex h-24 items-center justify-center bg-black/30 text-[10px] font-black text-slate-400 group-hover:text-white"><ShieldCheck size={20} /></div>
                  <div className="bg-white/[0.03] px-2 py-1.5 text-[10px] font-black text-slate-300">AFTER</div>
                </a>
                <a href={scan.proof.proofDiff} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-white/10">
                  <div className="flex h-24 items-center justify-center bg-black/30 text-[10px] font-black text-slate-400 group-hover:text-white"><Sparkles size={20} /></div>
                  <div className="bg-white/[0.03] px-2 py-1.5 text-[10px] font-black text-slate-300">DIFF</div>
                </a>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onVerify}
                disabled={isVerifying}
                className="rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-black text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isVerifying ? <><Loader2 size={14} className="mr-2 inline animate-spin" />Re-scanning...</> : <><RefreshCw size={14} className="mr-2 inline" />Re-verify now</>}
              </button>
              {scan.proof?.proofQr && (
                <a href={scan.proof.proofQr} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-black text-white transition hover:bg-white/[0.06]">
                  <QrCode size={14} className="text-violet-300" /> Verify QR
                </a>
              )}
            </div>
            {verifyResult && (
              <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/5 px-3 py-2">
                <p className="text-xs font-black text-amber-200">
                  Re-scan: {verifyResult.verdict} — before {verifyResult.before?.score}/100 → after {verifyResult.after?.score}/100
                </p>
                {verifyResult.after?.screenshot && (
                  <img src={verifyResult.after.screenshot} alt="After screenshot" className="mt-2 h-40 w-full rounded-lg object-cover object-top" />
                )}
              </div>
            )}
          </div>
        )}

        {/* ---- STEP 5: WATCHING ---- */}
        {scan && (
          <div className="xl:col-span-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-black text-white">
                <Activity size={16} className="text-emerald-300" /> Watching — GUARDIAN
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {watcherStatus ? (
                  <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-black text-emerald-300">
                    {watcherStatus.ok ? `Watching · next run ${new Date(watcherStatus.nextRun).toLocaleString()}` : 'Locked'}
                  </span>
                ) : watching?.available ? (
                  <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-black text-emerald-300">Active — re-scans every 6h</span>
                ) : (
                  <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-black text-amber-300">Locked</span>
                )}
                <button
                  type="button"
                  onClick={onEnableWatcher}
                  className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-black text-white shadow-[0_18px_38px_rgba(16,185,129,0.35)] transition hover:brightness-110"
                >
                  Enable Watching
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {watcherStatus?.paywall
                ? watcherStatus.reason
                : watching?.paywall
                  ? watching.reason
                  : 'GUARDIAN re-scans your site every 6 hours, alerts you the moment a secret leaks, and can auto-trigger the fix.'}
            </p>
            {scanId && <p className="mt-2 font-mono text-[11px] text-slate-500">Scan ID: {scanId}</p>}
          </div>
        )}
      </div>
    </section>
  )
}
