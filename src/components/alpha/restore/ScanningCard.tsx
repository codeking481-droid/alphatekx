import { motion } from 'framer-motion'
import { Terminal, Loader2, CheckCircle2 } from 'lucide-react'

export type ScanLog = { text: string; ts?: number }

export default function ScanningCard({ logs, status }: { logs: ScanLog[]; status: 'start' | 'done' | 'error' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="grid size-7 sm:size-8 place-items-center rounded-lg bg-[#D6FF00]/10 shrink-0">
          {status === 'done' ? (
            <CheckCircle2 size={13} className="text-[#D6FF00]" />
          ) : (
            <Terminal size={13} className={status === 'start' ? 'animate-pulse text-[#D6FF00]' : 'text-red-400'} />
          )}
        </div>
        <h4 className="flex-1 text-[12px] sm:text-[13px] font-bold text-white">Scanning your website...</h4>
        {status === 'start' && (
          <Loader2 size={12} className="animate-spin text-[#D6FF00] shrink-0" />
        )}
      </div>

      <div className="max-h-[250px] sm:max-h-[320px] overflow-y-auto px-3 py-2.5 font-mono text-[10px] sm:text-[11px] leading-relaxed alpha-chat-scroll sm:px-5 sm:py-3">
        {logs.length === 0 ? (
          <div className="flex items-center gap-2 text-white/20">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6FF00]" />
            Starting scan...
          </div>
        ) : (
          logs.map((log, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
              className={`flex gap-2 ${
                log.text.includes('ERROR') || log.text.includes('failed') || log.text.includes('Failed')
                  ? 'text-red-400/70'
                  : log.text.includes('complete') || log.text.includes('resolved') || log.text.includes('DONE')
                    ? 'text-[#D6FF00]/70'
                    : 'text-white/40'
              }`}
            >
              <span className="shrink-0 text-white/10">{String(i + 1).padStart(2, '0')}</span>
              <span className="whitespace-pre-wrap break-all">{log.text}</span>
            </motion.div>
          ))
        )}
        {status === 'start' && logs.length > 0 && (
          <div className="flex items-center gap-2 text-[#D6FF00]/40">
            <span className="h-1 w-1 animate-pulse rounded-full bg-[#D6FF00]" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-[#D6FF00]/60 [animation-delay:200ms]" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-[#D6FF00]/30 [animation-delay:400ms]" />
          </div>
        )}
      </div>
    </motion.div>
  )
}
