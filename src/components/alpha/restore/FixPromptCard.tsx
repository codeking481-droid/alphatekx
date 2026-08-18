import { motion } from 'framer-motion'
import { Wrench, AlertTriangle, Zap } from 'lucide-react'

export default function FixPromptCard({
  scanId, url, errorsFound, severity, summary, onFixNow,
}: {
  scanId: string
  url: string
  errorsFound: number
  severity?: string
  summary?: string
  onFixNow: () => void
}) {
  const severityColor =
    severity === 'critical' ? 'text-red-400' :
    severity === 'high' ? 'text-orange-400' :
    severity === 'medium' ? 'text-yellow-400' : 'text-[#D6FF00]'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-[#D6FF00]/20 bg-gradient-to-br from-[#D6FF00]/[0.06] via-[#0A0A0A] to-[#0A0A0A]"
    >
      <div className="px-3 py-4 sm:px-5 sm:py-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[#D6FF00]/10 shrink-0">
            {errorsFound > 0 ? (
              <AlertTriangle size={18} className={severityColor} />
            ) : (
              <Zap size={18} className="text-[#D6FF00]" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-[13px] sm:text-sm font-black uppercase tracking-wide text-white">
              {errorsFound > 0 ? `Found ${errorsFound} issue${errorsFound !== 1 ? 's' : ''}` : 'Scan Complete'}
            </h4>
            <p className="mt-0.5 text-[11px] sm:text-[12px] text-white/40 truncate">{summary || 'Analysis finished'}</p>
          </div>
        </div>

        {errorsFound > 0 && (
          <p className="mb-4 text-[12px] sm:text-[13px] text-white/60 leading-relaxed">
            I found <span className={`font-bold ${severityColor}`}>{errorsFound} problem{errorsFound !== 1 ? 's' : ''}</span> with your website.
            {severity === 'critical' && ' Some are critical and could be affecting your users right now.'}
            {' '}Would you like me to fix them?
          </p>
        )}

        {errorsFound === 0 && (
          <p className="mb-4 text-[12px] sm:text-[13px] text-white/60 leading-relaxed">
            Your website looks healthy! No critical issues detected. Would you like me to run a deeper performance audit?
          </p>
        )}

        <button
          onClick={onFixNow}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6FF00] px-4 py-3 text-[13px] sm:text-[14px] font-bold text-black transition hover:bg-[#C2E600] active:scale-[0.98]"
        >
          <Wrench size={15} />
          {errorsFound > 0 ? 'Fix My Site Now' : 'Run Deep Audit'}
        </button>

        <p className="mt-2 text-center text-[10px] sm:text-[11px] text-white/20">
          This will scan deeper, generate fixes, and show you the results before pushing to GitHub
        </p>
      </div>
    </motion.div>
  )
}
