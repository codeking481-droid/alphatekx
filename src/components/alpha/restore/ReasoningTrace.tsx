import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, ChevronRight, ChevronDown, FlaskConical, Shield, AlertTriangle, CheckCircle2 } from 'lucide-react'

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

function confidenceColor(confidence: number): string {
  if (confidence >= 50) return 'text-[#D6FF00]'
  if (confidence >= 30) return 'text-amber-400'
  return 'text-white/50'
}

function confidenceBarColor(confidence: number): string {
  if (confidence >= 50) return 'bg-[#D6FF00]'
  if (confidence >= 30) return 'bg-amber-400'
  return 'bg-white/30'
}

function confidenceIcon(confidence: number) {
  if (confidence >= 50) return <CheckCircle2 size={10} className="text-[#D6FF00]" />
  if (confidence >= 30) return <AlertTriangle size={10} className="text-amber-400" />
  return <Shield size={10} className="text-white/40" />
}

export default function ReasoningTrace({ assessment, hypotheses, evidence, decision }: ReasoningTraceProps) {
  const [expanded, setExpanded] = useState(true)
  const primary = hypotheses[0]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-[#D6FF00]/10 bg-[#D6FF00]/[0.02]"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 border-b border-[#D6FF00]/10 px-4 py-2.5 transition hover:bg-[#D6FF00]/[0.02]"
      >
        <div className="grid size-7 place-items-center rounded-lg bg-[#D6FF00]/10">
          <Brain size={13} className="text-[#D6FF00]" />
        </div>
        <div className="flex-1 text-left">
          <h4 className="text-[12px] font-bold text-[#D6FF00]">ALPHA'S CURRENT ASSESSMENT</h4>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={14} className="text-[#D6FF00]/40" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 space-y-3">
              {/* Assessment */}
              <div className="flex gap-2">
                <ChevronRight size={12} className="mt-0.5 shrink-0 text-[#D6FF00]/60" />
                <p className="text-[12px] text-white/70 leading-relaxed">{assessment}</p>
              </div>

              {/* Hypotheses */}
              {hypotheses.length > 0 && (
                <div className="space-y-2.5 pl-4">
                  {hypotheses.map((hyp, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          {confidenceIcon(hyp.confidence)}
                          <span className={`text-[11px] font-medium ${confidenceColor(hyp.confidence)}`}>
                            {hyp.cause}
                          </span>
                        </div>
                        <span className="text-[10px] text-white/30">{hyp.confidence}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <motion.div
                          className={`h-full rounded-full ${confidenceBarColor(hyp.confidence)}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${hyp.confidence}%` }}
                          transition={{ duration: 0.8, delay: i * 0.15, ease: 'easeOut' }}
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Evidence */}
              {evidence && (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FlaskConical size={10} className="text-white/30" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Evidence found</span>
                  </div>
                  <p className="text-[11px] text-white/50 leading-relaxed pl-4">{evidence}</p>
                </div>
              )}

              {/* Decision */}
              {decision && (
                <div className="flex gap-2 rounded-lg border border-[#D6FF00]/10 bg-[#D6FF00]/[0.04] px-3 py-2">
                  <ChevronRight size={10} className="mt-0.5 shrink-0 text-[#D6FF00]/40" />
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#D6FF00]/40">Decision</span>
                    <p className="text-[11px] text-[#D6FF00]/60 leading-relaxed mt-0.5">{decision}</p>
                  </div>
                </div>
              )}

              {/* Confidence Sum Validation */}
              <div className="flex items-center justify-end gap-2 text-[10px] text-white/20">
                <span>Total confidence:</span>
                <span className={hypotheses.reduce((s, h) => s + h.confidence, 0) === 100 ? 'text-[#D6FF00]/40' : 'text-red-400/40'}>
                  {hypotheses.reduce((s, h) => s + h.confidence, 0)}%
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
