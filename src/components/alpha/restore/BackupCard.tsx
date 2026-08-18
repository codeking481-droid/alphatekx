import { motion } from 'framer-motion'
import { Shield, CheckCircle2, Loader2, Download } from 'lucide-react'

export default function BackupCard({ status, scanId, version }: { status: 'start' | 'done'; scanId?: string; version?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <div className={`grid size-8 place-items-center rounded-lg ${status === 'done' ? 'bg-[#D6FF00]/10' : 'bg-white/[0.04]'}`}>
          {status === 'done' ? (
            <CheckCircle2 size={14} className="text-[#D6FF00]" />
          ) : (
            <Shield size={14} className="animate-pulse text-[#D6FF00]" />
          )}
        </div>
        <div className="flex-1">
          <h4 className="text-[13px] font-bold text-white">Backup Created</h4>
          <p className="mt-0.5 text-[11px] text-white/30">Rollback version created — you can return back anytime</p>
        </div>
      </div>

      <div className="px-5 py-4">
        {status === 'start' ? (
          <div className="flex items-center gap-2 text-[12px] text-white/30">
            <Loader2 size={13} className="animate-spin text-[#D6FF00]" />
            Creating rollback snapshot...
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-[#D6FF00]/[0.06] px-3 py-2">
              <CheckCircle2 size={13} className="text-[#D6FF00]" />
              <span className="text-[12px] font-bold text-[#D6FF00]">Rollback version created</span>
            </div>
            <p className="text-[11px] text-white/40">
              You can return to the original state anytime using the rollback file.
              {version && <span className="ml-1 text-white/20">Version: {version}</span>}
            </p>
            {scanId && (
              <a
                href={`/api/download/rollback/${scanId}`}
                download
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[12px] font-bold text-white/60 transition hover:border-[#D6FF00]/20 hover:text-[#D6FF00]"
              >
                <Download size={13} />
                Download Rollback
              </a>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
