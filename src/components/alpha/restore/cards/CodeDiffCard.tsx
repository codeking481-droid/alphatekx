import { motion } from 'framer-motion'
import { FileCode, Check, Minus, Plus } from 'lucide-react'

type CodeDiffCardProps = {
  filename: string
  old: string
  newContent: string
}

export default function CodeDiffCard({ filename, old, newContent }: CodeDiffCardProps) {
  // Simple diff visualization - show removed and added lines
  const oldLines = old.split('\n').slice(0, 10)
  const newLines = newContent.split('\n').slice(0, 10)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <div className="grid size-7 place-items-center rounded-lg bg-[#D6FF00]/10">
          <FileCode size={13} className="text-[#D6FF00]" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[12px] font-bold text-white truncate">{filename}</h4>
          <p className="mt-0.5 text-[10px] text-white/30">Change applied</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-[#D6FF00]/20 bg-[#D6FF00]/[0.06] px-2 py-1">
          <Check size={9} className="text-[#D6FF00]" />
          <span className="text-[9px] text-[#D6FF00]">Applied</span>
        </div>
      </div>

      {/* Diff Content */}
      <div className="max-h-48 overflow-y-auto font-mono text-[11px]">
        {/* Removed lines */}
        {oldLines.map((line, i) => (
          <div key={`old-${i}`} className="flex items-start border-l-2 border-red-400/30 bg-red-400/[0.04] px-3 py-0.5">
            <Minus size={9} className="mt-0.5 shrink-0 text-red-400/60" />
            <span className="ml-2 text-red-400/50 whitespace-pre">{line || ' '}</span>
          </div>
        ))}
        {/* Added lines */}
        {newLines.map((line, i) => (
          <div key={`new-${i}`} className="flex items-start border-l-2 border-[#D6FF00]/30 bg-[#D6FF00]/[0.04] px-3 py-0.5">
            <Plus size={9} className="mt-0.5 shrink-0 text-[#D6FF00]/60" />
            <span className="ml-2 text-[#D6FF00]/50 whitespace-pre">{line || ' '}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
