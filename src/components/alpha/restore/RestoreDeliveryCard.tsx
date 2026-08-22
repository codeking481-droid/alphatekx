import { useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Copy, CheckCircle2, GitBranch, Loader2, ShieldCheck } from 'lucide-react'
import GitHubApplyCard from './GitHubApplyCard'

export default function RestoreDeliveryCard({
  restorationId,
  downloadRestored,
  onVerify,
}: {
  restorationId: string
  downloadRestored?: string
  onVerify?: () => void
}) {
  const [copied, setCopied] = useState<null | 'ok' | 'err'>(null)
  const [copying, setCopying] = useState(false)
  const [showGit, setShowGit] = useState(false)

  const downloadUrl =
    downloadRestored || `/api/restore/v3/download?id=${encodeURIComponent(restorationId)}&which=restored`
  const contentUrl = `/api/restore/v3/content/${encodeURIComponent(restorationId)}/fixed.html?base=0`

  const copyCode = async () => {
    setCopying(true)
    setCopied(null)
    try {
      const res = await fetch(contentUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      try {
        await navigator.clipboard.writeText(html)
      } catch {
        const ta = document.createElement('textarea')
        ta.value = html
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied('ok')
    } catch {
      window.open(contentUrl, '_blank')
      setCopied('err')
    } finally {
      setCopying(false)
      setTimeout(() => setCopied(null), 2500)
    }
  }

  const btnClass =
    'flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold transition active:scale-[0.98]'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-[#D6FF00]/20 bg-white/[0.02]"
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="grid size-7 sm:size-8 shrink-0 place-items-center rounded-lg bg-[#D6FF00]/10">
          <CheckCircle2 size={13} className="text-[#D6FF00]" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-[12px] font-bold text-white sm:text-[13px]">Your restored site is ready</h4>
          <p className="mt-0.5 text-[10px] text-white/30 sm:text-[11px]">
            Get your fixed code applied — pick any option below
          </p>
        </div>
      </div>

      <div className="space-y-3 px-3 py-3 sm:px-5 sm:py-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {/* Button 1 — Download ZIP */}
          <a
            href={downloadUrl}
            download
            className={`${btnClass} bg-[#D6FF00] text-black hover:bg-[#C2E600]`}
          >
            <Download size={15} />
            Download ZIP
          </a>

          {/* Button 2 — Copy fixed code */}
          <button
            onClick={copyCode}
            disabled={copying}
            className={`${btnClass} border border-white/[0.08] bg-white/[0.03] text-white/80 hover:border-white/[0.18] hover:text-white disabled:opacity-50`}
          >
            {copied === 'ok' ? (
              <>
                <CheckCircle2 size={15} className="text-green-400" />
                Copied!
              </>
            ) : copying ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Copying...
              </>
            ) : (
              <>
                <Copy size={15} />
                Copy Code
              </>
            )}
          </button>

          {/* Button 3 — Connect GitHub */}
          <button
            onClick={() => setShowGit((v) => !v)}
            className={`${btnClass} border border-white/[0.08] bg-white/[0.03] text-white/80 hover:border-white/[0.18] hover:text-white`}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            {showGit ? 'Hide GitHub' : 'Connect to Git'}
          </button>
        </div>

        {copied === 'err' && (
          <p className="text-[11px] text-amber-300/60">
            Clipboard blocked — opened the fixed HTML in a new tab instead (Ctrl+S to save).
          </p>
        )}

        {/* Continue — close the loop: re-scan the live URL and prove the fix went live */}
        {onVerify && (
          <button
            onClick={onVerify}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#D6FF00]/30 bg-[#D6FF00]/[0.06] px-4 py-3 text-[13px] font-black text-[#D6FF00] transition hover:bg-[#D6FF00]/[0.12] active:scale-[0.98]"
          >
            <ShieldCheck size={15} />
            Continue — Verify the fix went live
          </button>
        )}

        {showGit && <GitHubApplyCard scanId={restorationId} />}
      </div>
    </motion.div>
  )
}
