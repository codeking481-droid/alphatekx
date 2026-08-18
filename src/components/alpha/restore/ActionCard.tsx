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
      <div className="flex items-center gap-3 border-b border-[#D6FF00]/10 px-5 py-4">
        <div className="grid size-10 place-items-center rounded-xl bg-[#D6FF00]/10">
          <Download size={18} className="text-[#D6FF00]" />
        </div>
        <div>
          <h4 className="text-sm font-black uppercase tracking-wide text-[#D6FF00]">RESTORATION COMPLETE</h4>
          <p className="mt-0.5 text-[11px] text-white/40">Download fixes and redeploy</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 border-b border-white/[0.04] px-5 py-4">
        {data.restoredZipUrl && (
          <a
            href={data.restoredZipUrl}
            download
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6FF00] px-4 py-3 text-[13px] font-bold text-black transition hover:bg-[#C2E600]"
          >
            <Download size={14} />
            Download Fixed Files (restored.zip)
          </a>
        )}
        <a
          href={data.rollbackUrl || '#'}
          download
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] font-bold text-white/60 transition hover:border-[#D6FF00]/20 hover:text-[#D6FF00]"
        >
          <RotateCcw size={14} />
          Download Rollback (return back)
        </a>
      </div>

      {/* Redeploy Steps */}
      {data.redeploySteps && data.redeploySteps.length > 0 && (
        <div className="px-5 py-4">
          <div className="mb-2 flex items-center gap-2">
            <FileText size={12} className="text-white/30" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">How to Redeploy</span>
          </div>
          <div className="space-y-2">
            {data.redeploySteps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-white/40">
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
