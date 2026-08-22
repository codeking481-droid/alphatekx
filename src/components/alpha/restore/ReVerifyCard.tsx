import { motion } from 'framer-motion'
import { ShieldCheck, ShieldAlert, Loader2, Wrench, ExternalLink } from 'lucide-react'

export type ReVerifyState = {
  running?: boolean
  done?: boolean
  score?: number | null
  issueCount?: number | null
  criticalCount?: number | null
  screenshotUrl?: string | null
  baselineScore?: number | null
  baselineIssues?: number | null
}

export default function ReVerifyCard({
  state,
  onFixAgain,
}: {
  state: ReVerifyState
  onFixAgain?: () => void
}) {
  const resolvedAll = (state.issueCount ?? 0) === 0
  const improved =
    state.score != null && state.baselineScore != null ? state.score >= state.baselineScore : null
  const success = state.done && (resolvedAll || improved === true)

  if (!state.done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3"
      >
        <Loader2 size={15} className="animate-spin text-[#D6FF00]" />
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-white">Re-verifying your live site…</p>
          <p className="mt-0.5 text-[11px] text-white/40">
            Fresh scan in progress — confirming every fix actually went live
          </p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`overflow-hidden rounded-2xl border ${
        success ? 'border-green-500/25 bg-green-500/[0.03]' : 'border-amber-500/25 bg-amber-500/[0.03]'
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        {success ? (
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-green-400" />
        ) : (
          <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-400" />
        )}
        <div className="min-w-0 flex-1">
          <h4 className={`text-[14px] font-black ${success ? 'text-green-400' : 'text-amber-300'}`}>
            {success ? 'Verified live — your site is fixed' : 'Re-scan complete — some issues remain'}
          </h4>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/30">Health score</p>
              <p className="mt-0.5 text-[16px] font-black text-white">
                {state.score ?? '—'}
                <span className="text-[11px] font-bold text-white/40">/100</span>
              </p>
              {state.baselineScore != null && (
                <p className="text-[10px] text-white/35">was {state.baselineScore}/100 before the fix</p>
              )}
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/30">Issues on live site</p>
              <p className="mt-0.5 text-[16px] font-black text-white">{state.issueCount ?? '—'}</p>
              {state.baselineIssues != null && (
                <p className="text-[10px] text-white/35">was {state.baselineIssues} before the fix</p>
              )}
            </div>
          </div>

          {(state.criticalCount ?? 0) > 0 && (
            <p className="mt-2 text-[11px] font-bold text-red-400/80">
              {state.criticalCount} critical issue(s) still detected on the live URL.
            </p>
          )}

          {!success && (
            <>
              <p className="mt-2 text-[12px] leading-relaxed text-white/50">
                The fixes were generated and delivered, but the live URL still shows issues — they may not have
                been applied yet. Apply the fix (download → replace your files / push via GitHub), then re-verify.
              </p>
              {onFixAgain && (
                <button
                  onClick={onFixAgain}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#D6FF00] px-4 py-2.5 text-[13px] font-bold text-black transition hover:bg-[#C2E600] active:scale-[0.98]"
                >
                  <Wrench size={14} />
                  Fix remaining issues now
                </button>
              )}
            </>
          )}

          {success && state.screenshotUrl && (
            <a
              href={state.screenshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60 transition hover:border-white/[0.18] hover:text-white/90"
            >
              <ExternalLink size={10} /> View fresh live screenshot
            </a>
          )}
        </div>
      </div>
    </motion.div>
  )
}
