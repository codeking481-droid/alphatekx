import { motion } from 'framer-motion'
import { Brain, ChevronRight } from 'lucide-react'

type Hypothesis = {
  cause: string
  confidence: number
}

type ReasoningTraceProps = {
  assessment: string
  hypotheses: Hypothesis[]
  evidence: string
  decision: string
}

function confidenceBar(confidence: number): string {
  if (confidence >= 70) return 'bg-[#D6FF00]'
  if (confidence >= 40) return 'bg-amber-400'
  return 'bg-white/30'
}

export default function ReasoningTrace({ assessment, hypotheses, evidence, decision }: ReasoningTraceProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-[#D6FF00]/10 bg-[#D6FF00]/[0.02]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#D6FF00]/10 px-4 py-2.5">
        <div className="grid size-7 place-items-center rounded-lg bg-[#D6FF00]/10">
          <Brain size={13} className="text-[#D6FF00]" />
        </div>
        <div className="flex-1">
          <h4 className="text-[12px] font-bold text-[#D6FF00]">ALPHA'S CURRENT ASSESSMENT</h4>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Assessment */}
        <div className="flex gap-2">
          <ChevronRight size={12} className="mt-0.5 shrink-0 text-[#D6FF00]/60" />
          <p className="text-[12px] text-white/70 leading-relaxed">{assessment}</p>
        </div>

        {/* Hypotheses */}
        {hypotheses.length > 0 && (
          <div className="space-y-2 pl-4">
            {hypotheses.map((hyp, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-white/60">{hyp.cause}</span>
                  <span className="text-[10px] text-white/30">{hyp.confidence}%</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    className={`h-full ${confidenceBar(hyp.confidence)}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${hyp.confidence}%` }}
                    transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Evidence */}
        {evidence && (
          <div className="flex gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
            <ChevronRight size={10} className="mt-0.5 shrink-0 text-white/20" />
            <p className="text-[11px] text-white/40 leading-relaxed">{evidence}</p>
          </div>
        )}

        {/* Decision */}
        {decision && (
          <div className="flex gap-2 rounded-lg border border-[#D6FF00]/10 bg-[#D6FF00]/[0.04] px-3 py-2">
            <ChevronRight size={10} className="mt-0.5 shrink-0 text-[#D6FF00]/40" />
            <p className="text-[11px] text-[#D6FF00]/60 leading-relaxed">{decision}</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}
