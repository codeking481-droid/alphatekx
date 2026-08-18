import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

export type ScanError = {
  id: string
  name: string
  file: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
}

export default function ErrorsCard({ errors, severity, status }: { errors: ScanError[]; severity?: string; status: 'start' | 'done' }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <div className={`grid size-8 place-items-center rounded-lg ${errors.length > 0 ? 'bg-red-500/10' : 'bg-[#D6FF00]/10'}`}>
          {errors.length > 0 ? (
            <AlertTriangle size={14} className="text-red-400" />
          ) : (
            <CheckCircle2 size={14} className="text-[#D6FF00]" />
          )}
        </div>
        <div className="flex-1">
          <h4 className="text-[13px] font-bold text-white">Errors Found</h4>
          <p className="mt-0.5 text-[11px] text-white/30">
            {errors.length > 0 ? `${errors.length} error${errors.length !== 1 ? 's' : ''} detected` : 'No errors detected'}
          </p>
        </div>
        {severity && severity !== 'unknown' && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${severityColors[severity] || 'bg-white/[0.06] text-white/40 border-white/[0.08]'}`}>
            {severity}
          </span>
        )}
      </div>

      {status === 'start' ? (
        <div className="flex items-center gap-2 px-5 py-4 text-[12px] text-white/30">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6FF00]" />
          Analyzing errors...
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {errors.map((err) => (
            <div key={err.id} className="px-5 py-3">
              <button
                onClick={() => setExpanded((p) => ({ ...p, [err.id]: !p[err.id] }))}
                className="flex w-full items-start gap-3 text-left"
              >
                <span className={`mt-0.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${severityColors[err.severity] || 'bg-white/[0.06] text-white/40'}`}>
                  {err.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-white/80">{err.name}</p>
                  <p className="mt-0.5 text-[11px] text-white/30">{err.file}</p>
                </div>
              </button>
              {expanded[err.id] && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-2 ml-16 text-[11px] leading-relaxed text-white/40"
                >
                  {err.description}
                </motion.p>
              )}
            </div>
          ))}
          {errors.length === 0 && (
            <div className="flex items-center gap-2 px-5 py-4 text-[12px] text-[#D6FF00]/60">
              <CheckCircle2 size={13} />
              All clear — no errors found
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
