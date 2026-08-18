import { motion } from 'framer-motion'
import { Terminal, Check, Loader2, AlertCircle } from 'lucide-react'

type TerminalCardProps = {
  cmd: string
  status: 'running' | 'success' | 'error'
  output?: string
  testCount?: number
  testsPassed?: number
  testsFailed?: number
}

export default function TerminalCard({
  cmd,
  status,
  output,
  testCount,
  testsPassed,
  testsFailed
}: TerminalCardProps) {
  // Calculate progress bar for tests
  const hasTests = testCount !== undefined && testCount > 0
  const progressPercent = hasTests && testsPassed !== undefined
    ? Math.round((testsPassed / testCount) * 100)
    : 0

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
          <Terminal size={13} className="text-[#D6FF00]" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[12px] font-bold text-white truncate">{cmd}</h4>
          <p className="mt-0.5 text-[10px] text-white/30">
            {status === 'running' ? 'Running...' :
             status === 'success' ? 'Completed' :
             'Failed'}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${
          status === 'running' ? 'border-[#D6FF00]/20 bg-[#D6FF00]/[0.06]' :
          status === 'success' ? 'border-green-400/20 bg-green-400/[0.06]' :
          'border-red-400/20 bg-red-400/[0.06]'
        }`}>
          {status === 'running' ? (
            <Loader2 size={9} className="animate-spin text-[#D6FF00]" />
          ) : status === 'success' ? (
            <Check size={9} className="text-green-400" />
          ) : (
            <AlertCircle size={9} className="text-red-400" />
          )}
          <span className={`text-[9px] ${
            status === 'running' ? 'text-[#D6FF00]' :
            status === 'success' ? 'text-green-400' :
            'text-red-400'
          }`}>
            {status === 'running' ? 'Running' : status === 'success' ? 'Done' : 'Failed'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {/* Test Progress (cinematic) */}
        {hasTests && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-white/50">{testCount} tests</span>
              <span className="text-white/30">
                {testsPassed || 0} passed{testsFailed !== undefined && testsFailed > 0 ? `, ${testsFailed} failed` : ''}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className={`h-full ${testsFailed && testsFailed > 0 ? 'bg-amber-400' : 'bg-[#D6FF00]'}`}
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {/* Output preview (limited lines) */}
        {output && (
          <div className="max-h-24 overflow-y-auto rounded-lg bg-black/40 p-2 font-mono text-[10px] text-white/40">
            {output.split('\n').slice(-8).map((line, i) => (
              <div key={i} className="whitespace-pre">{line || ' '}</div>
            ))}
          </div>
        )}

        {/* Running indicator */}
        {status === 'running' && !hasTests && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full bg-[#D6FF00]"
                initial={{ width: '0%' }}
                animate={{ width: '90%' }}
                transition={{ duration: 3, ease: 'easeInOut' }}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
