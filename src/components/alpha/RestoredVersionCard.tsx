import { motion } from 'framer-motion'
import { ArrowRight, Zap, AlertTriangle, Clock, Activity } from 'lucide-react'

export type MetricComparison = {
  label: string
  before: string
  after: string
  icon: 'lcp' | 'errors' | 'uptime'
  improved: boolean
}

export type RestoreResult = {
  title: string
  description?: string
  metrics: MetricComparison[]
  deployUrl?: string
  codeSnippet?: string
}

const iconMap = {
  lcp: Clock,
  errors: AlertTriangle,
  uptime: Activity,
}

export default function RestoredVersionCard({ result }: { result: RestoreResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="my-4 overflow-hidden rounded-2xl border border-[#FFD700]/20 bg-gradient-to-br from-[#FFD700]/[0.06] via-[#0A0A0A] to-[#0A0A0A]"
      style={{
        boxShadow: '0 0 30px rgba(255,215,0,0.08), 0 0 60px rgba(255,215,0,0.03)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#FFD700]/10 px-5 py-4">
        <div className="grid size-9 place-items-center rounded-xl bg-[#FFD700]/10">
          <Zap size={16} className="text-[#FFD700]" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-[#FFD700]">Restored Version</h4>
          <p className="text-[11px] text-white/40">{result.title}</p>
        </div>
      </div>

      {/* Description */}
      {result.description && (
        <div className="px-5 py-3 text-[13px] leading-relaxed text-white/60 border-b border-white/[0.04]">
          {result.description}
        </div>
      )}

      {/* Metrics Comparison */}
      <div className="grid gap-0 divide-y divide-white/[0.04]">
        {result.metrics.map((metric, i) => {
          const Icon = iconMap[metric.icon]
          return (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.03]">
                <Icon size={14} className="text-white/30" />
              </div>
              <span className="text-[12px] font-semibold text-white/50 min-w-[60px]">
                {metric.label}
              </span>

              {/* Broken */}
              <div className="flex items-center gap-2 rounded-lg bg-red-500/[0.06] px-3 py-1.5">
                <span className="text-[11px] font-bold text-red-400/70 line-through">
                  {metric.before}
                </span>
              </div>

              <ArrowRight size={12} className="text-white/15 shrink-0" />

              {/* Restored */}
              <div className="flex items-center gap-2 rounded-lg bg-[#D6FF00]/[0.06] px-3 py-1.5">
                <span className="text-[11px] font-bold text-[#D6FF00]">
                  {metric.after}
                </span>
              </div>

              {metric.improved && (
                <span className="ml-auto rounded-full bg-[#D6FF00]/10 px-2 py-0.5 text-[10px] font-bold text-[#D6FF00]">
                  FIXED
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Code Snippet */}
      {result.codeSnippet && (
        <div className="border-t border-white/[0.04] px-5 py-4">
          <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-[12px] leading-relaxed text-white/60 font-mono">
            {result.codeSnippet}
          </pre>
        </div>
      )}

      {/* Deploy Button */}
      {result.deployUrl && (
        <div className="border-t border-[#FFD700]/10 px-5 py-4">
          <a
            href={result.deployUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFD700] px-4 py-3 text-[13px] font-bold text-black transition hover:bg-[#FFE666]"
          >
            <Zap size={14} />
            Deploy Restored Version
          </a>
        </div>
      )}
    </motion.div>
  )
}
