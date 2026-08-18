import { motion } from 'framer-motion'
import { Wrench, CheckCircle2, Loader2 } from 'lucide-react'
import { useState } from 'react'

export type DiffEntry = { filename: string; old: string; newContent: string }

export default function FixingCard({ files, diffs, status, summary }: { files: string[]; diffs: DiffEntry[]; status: 'start' | 'done'; summary?: string }) {
  const [openDiff, setOpenDiff] = useState<Record<number, boolean>>({})

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 sm:px-5 sm:py-3">
        <div className={`grid size-7 sm:size-8 place-items-center rounded-lg ${status === 'done' ? 'bg-[#D6FF00]/10' : 'bg-white/[0.04]'} shrink-0`}>
          {status === 'done' ? (
            <CheckCircle2 size={13} className="text-[#D6FF00]" />
          ) : (
            <Wrench size={13} className="animate-pulse text-[#D6FF00]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[12px] sm:text-[13px] font-bold text-white">Fixing Files</h4>
          <p className="mt-0.5 text-[10px] sm:text-[11px] text-white/30 truncate">
            {status === 'done' ? `${files.length} file(s) fixed` : `Fixing via AI... ${diffs.length > 0 ? `(${diffs.length} diff${diffs.length > 1 ? 's' : ''})` : ''}`}
          </p>
        </div>
        {status === 'start' && <Loader2 size={13} className="animate-spin text-[#D6FF00] shrink-0" />}
      </div>

      <div className="px-3 py-3 sm:px-5 sm:py-4">
        {status === 'start' && files.length === 0 && (
          <div className="flex items-center gap-2 text-[11px] sm:text-[12px] text-white/30">
            <Loader2 size={12} className="animate-spin text-[#D6FF00]" />
            Generating fixes...
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((f, i) => (
              <div key={i} className="rounded-lg border border-white/[0.04] bg-black/20">
                <button
                  onClick={() => setOpenDiff((p) => ({ ...p, [i]: !p[i] }))}
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition hover:bg-white/[0.02] sm:px-3"
                >
                  <CheckCircle2 size={10} className="text-[#D6FF00] shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[11px] sm:text-[12px] font-mono font-bold text-white/70">{f}</span>
                </button>
                {openDiff[i] && diffs[i] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="overflow-hidden border-t border-white/[0.04]"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.04]">
                      <div className="px-2.5 py-2 sm:px-3">
                        <p className="mb-1 text-[8px] sm:text-[9px] font-bold uppercase text-red-400/60">Old</p>
                        <pre className="max-h-[100px] sm:max-h-[120px] overflow-y-auto text-[9px] sm:text-[10px] leading-relaxed text-red-400/50 whitespace-pre-wrap break-all">
                          {diffs[i].old?.slice(0, 500) || '(original)'}
                        </pre>
                      </div>
                      <div className="px-2.5 py-2 sm:px-3">
                        <p className="mb-1 text-[8px] sm:text-[9px] font-bold uppercase text-[#D6FF00]/60">New</p>
                        <pre className="max-h-[100px] sm:max-h-[120px] overflow-y-auto text-[9px] sm:text-[10px] leading-relaxed text-[#D6FF00]/50 whitespace-pre-wrap break-all">
                          {diffs[i].newContent?.slice(0, 500) || '(fixed)'}
                        </pre>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        )}

        {summary && (
          <p className="mt-3 text-[10px] sm:text-[11px] text-white/30">{summary}</p>
        )}
      </div>
    </motion.div>
  )
}
