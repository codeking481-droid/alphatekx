import { useState } from 'react'
import { motion } from 'framer-motion'
import { Wrench, AlertTriangle, Zap, Download, Github } from 'lucide-react'

export default function FixPromptCard({
  scanId, url, errorsFound, severity, summary, onFixNow, onFixAndPush, isNonGithub,
}: {
  scanId: string
  url: string
  errorsFound: number
  severity?: string
  summary?: string
  onFixNow: () => void
  onFixAndPush?: (scanId: string, url: string, repoUrl: string) => void
  isNonGithub?: boolean
}) {
  const [pushRepoUrl, setPushRepoUrl] = useState('')
  const [showPushInput, setShowPushInput] = useState(false)

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
            {' '}
            {isNonGithub
              ? 'This is a live website, not a GitHub repository. I can fix the issues and you can download the result.'
              : 'Would you like me to fix them?'}
          </p>
        )}

        {errorsFound === 0 && (
          <p className="mb-4 text-[12px] sm:text-[13px] text-white/60 leading-relaxed">
            Your website looks healthy! No critical issues detected. Would you like me to run a deeper performance audit?
          </p>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onFixNow}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#D6FF00] px-4 py-3 text-[13px] sm:text-[14px] font-bold text-black transition hover:bg-[#C2E600] active:scale-[0.98]"
          >
            <Download size={15} />
            {errorsFound > 0 ? 'Fix & Download' : 'Run Deep Audit'}
          </button>
          {isNonGithub && onFixAndPush && (
            <button
              onClick={() => setShowPushInput(!showPushInput)}
              className="flex items-center justify-center gap-2 rounded-xl border border-[#D6FF00]/30 bg-[#D6FF00]/[0.06] px-4 py-3 text-[13px] sm:text-[14px] font-bold text-[#D6FF00] transition hover:bg-[#D6FF00]/[0.12] active:scale-[0.98]"
            >
              <Github size={15} />
              Push to GitHub
            </button>
          )}
        </div>

        {/* GitHub repo URL input */}
        {showPushInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 overflow-hidden"
          >
            <label className="mb-1.5 block text-[11px] sm:text-[12px] font-medium text-white/40">
              Paste your GitHub repo URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={pushRepoUrl}
                onChange={(e) => setPushRepoUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/20 focus:border-[#D6FF00]/30 transition"
              />
              <button
                onClick={() => {
                  if (pushRepoUrl.trim() && onFixAndPush) {
                    onFixAndPush(scanId, url, pushRepoUrl.trim())
                  }
                }}
                disabled={!pushRepoUrl.trim()}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-[#D6FF00] px-3 py-2.5 text-[12px] font-bold text-black transition hover:bg-[#C2E600] disabled:opacity-20 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                <Github size={13} />
                Push
              </button>
            </div>
          </motion.div>
        )}

        <p className="mt-2 text-center text-[10px] sm:text-[11px] text-white/20">
          {isNonGithub
            ? 'Fix & Download gives you a ZIP with the corrected files. Push to GitHub deploys the fix to your repo.'
            : 'This will scan deeper, generate fixes, and show you the results before pushing to GitHub'}
        </p>
      </div>
    </motion.div>
  )
}
