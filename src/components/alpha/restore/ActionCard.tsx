import { motion } from 'framer-motion'
import { Download, ExternalLink, RotateCcw, FileText } from 'lucide-react'

export default function ActionCard({ data }: { data: {
  scanId: string
  restoredZipUrl?: string | null
  rollbackUrl?: string
  redeploySteps?: string[]
  metrics?: { before: any; after: any }
} }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-[#D6FF00]/20 bg-gradient-to-br from-[#D6FF00]/[0.06] via-[#0A0A0A] to-[#0A0A0A]"
    >
      <div className="flex items-center gap-2 border-b border-[#D6FF00]/10 px-3 py-3 sm:px-5 sm:py-4">
        <div className="grid size-8 sm:size-10 place-items-center rounded-xl bg-[#D6FF00]/10 shrink-0">
          <Download size={16} className="text-[#D6FF00]" />
        </div>
        <div className="min-w-0">
          <h4 className="text-[12px] sm:text-sm font-black uppercase tracking-wide text-[#D6FF00]">RESTORATION COMPLETE</h4>
          <p className="mt-0.5 text-[10px] sm:text-[11px] text-white/40">Download fixes and redeploy</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 border-b border-white/[0.04] px-3 py-3 sm:px-5 sm:py-4">
        {data.restoredZipUrl && (
          <a
            href={data.restoredZipUrl}
            download
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6FF00] px-3 py-2.5 text-[12px] sm:text-[13px] font-bold text-black transition hover:bg-[#C2E600]"
          >
            <Download size={13} />
            Download Fixed Files
          </a>
        )}
        <a
          href={data.rollbackUrl || '#'}
          download
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[12px] sm:text-[13px] font-bold text-white/60 transition hover:border-[#D6FF00]/20 hover:text-[#D6FF00]"
        >
          <RotateCcw size={13} />
          Download Rollback
        </a>
      </div>

      {/* Redeploy Steps */}
      {data.redeploySteps && data.redeploySteps.length > 0 && (
        <div className="px-3 py-3 sm:px-5 sm:py-4">
          <div className="mb-2 flex items-center gap-2">
            <FileText size={11} className="text-white/30" />
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/30">How to Redeploy</span>
          </div>
          <div className="space-y-1.5">
            {data.redeploySteps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] sm:text-[11px] text-white/40">
                <span className="mt-0.5 shrink-0 text-white/15">{i + 1}.</span>
                <span>{step.replace(/^\d+\.\s*/, '')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
