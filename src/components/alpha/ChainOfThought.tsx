import { useState } from 'react'
import { ChevronDown, CheckCircle2, Loader2, Scan, Search, Wrench, FlaskConical, Globe } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export type TavilySource = {
  title: string
  url: string
  score: number
  snippet: string
}

export type ThoughtStep = {
  id: string
  label: string
  icon: 'scan' | 'diagnose' | 'plan' | 'test' | 'search'
  status: 'pending' | 'active' | 'done' | 'error'
  summary?: string
  details?: string[]
  logs?: string[]
  tavilySources?: TavilySource[]
}

const iconMap = {
  scan: Scan,
  diagnose: Search,
  plan: Wrench,
  test: FlaskConical,
  search: Globe,
}

const statusColors = {
  done: { bg: 'bg-[#D6FF00]/10', text: 'text-[#D6FF00]', border: 'border-[#D6FF00]/20' },
  active: { bg: 'bg-[#D6FF00]/10', text: 'text-[#D6FF00]', border: 'border-[#D6FF00]/20' },
  error: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  pending: { bg: 'bg-white/[0.04]', text: 'text-white/30', border: 'border-white/[0.06]' },
}

export default function ChainOfThought({ steps }: { steps: ThoughtStep[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showLogs, setShowLogs] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  const toggleLogs = (id: string) => setShowLogs((prev) => ({ ...prev, [id]: !prev[id] }))

  if (!steps.length) return null

  const doneCount = steps.filter((s) => s.status === 'done').length
  const hasActive = steps.some((s) => s.status === 'active')

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      {/* Header */}
      <button
        onClick={() => {
          const allExpanded = steps.every((s) => expanded[s.id])
          if (allExpanded) {
            setExpanded({})
          } else {
            const next: Record<string, boolean> = {}
            steps.forEach((s) => (next[s.id] = true))
            setExpanded(next)
          }
        }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-2">
          {hasActive ? (
            <Loader2 size={14} className="animate-spin text-[#D6FF00]" />
          ) : (
            <CheckCircle2 size={14} className="text-[#D6FF00]" />
          )}
          <span className="text-xs font-bold uppercase tracking-widest text-[#D6FF00]">
            Thinking
          </span>
        </div>
        <span className="ml-auto text-[10px] font-semibold text-white/30">
          {doneCount}/{steps.length}
        </span>
        <ChevronDown
          size={14}
          className="text-white/30 transition-transform duration-200"
          style={{
            transform: steps.every((s) => expanded[s.id]) ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Steps */}
      <AnimatePresence>
        {steps.map((step, index) => {
          const Icon = iconMap[step.icon]
          const isOpen = expanded[step.id]
          const colors = statusColors[step.status]
          const isLast = index === steps.length - 1
          return (
            <motion.div
              key={step.id}
              initial={false}
              animate={{ height: isOpen ? 'auto' : 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className={`relative border-t border-white/[0.04] px-4 py-3 ${!isLast ? 'pb-5' : ''}`}>
                {!isLast && (
                  <div className="absolute left-[25px] top-[40px] bottom-0 w-px bg-white/[0.04]" />
                )}

                <button
                  onClick={() => toggle(step.id)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-lg ${colors.bg} ${colors.text}`}
                  >
                    {step.status === 'active' ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : step.status === 'done' ? (
                      <CheckCircle2 size={13} />
                    ) : (
                      <Icon size={13} />
                    )}
                  </span>
                  <span
                    className={`text-[13px] font-semibold ${
                      step.status === 'done'
                        ? 'text-white/70'
                        : step.status === 'active'
                          ? 'text-white'
                          : step.status === 'error'
                            ? 'text-red-400'
                            : 'text-white/30'
                    }`}
                  >
                    {step.label}
                  </span>
                  <ChevronDown
                    size={12}
                    className={`ml-auto text-white/20 transition-transform duration-150 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isOpen && step.summary && (
                  <div className="mt-2 ml-10 text-[12px] leading-relaxed text-white/50">
                    {step.summary}
                  </div>
                )}

                {isOpen && step.details && step.details.length > 0 && (
                  <ul className="mt-2 ml-10 space-y-1">
                    {step.details.map((detail, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-white/40">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#D6FF00]/40" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Tavily Sources */}
                {isOpen && step.tavilySources && step.tavilySources.length > 0 && (
                  <div className="mt-3 ml-10 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#D6FF00]/40">
                      Sources via Tavily
                    </p>
                    {step.tavilySources.map((source, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2"
                      >
                        <div className="flex items-center justify-between">
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-semibold text-[#D6FF00]/70 hover:text-[#D6FF00]"
                          >
                            {source.title}
                          </a>
                          <span className="text-[9px] font-bold text-[#D6FF00]/30">
                            {(source.score * 100).toFixed(0)}% match
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-white/30 line-clamp-2">{source.snippet}</p>
                      </div>
                    ))}
                  </div>
                )}

                {isOpen && step.logs && step.logs.length > 0 && (
                  <div className="mt-3 ml-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleLogs(step.id)
                      }}
                      className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/20 transition hover:text-white/40"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${showLogs[step.id] ? 'bg-[#D6FF00]' : 'bg-white/20'}`} />
                      {showLogs[step.id] ? 'Hide' : 'Show'} thinking logs
                    </button>
                    <AnimatePresence>
                      {showLogs[step.id] && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 rounded-xl border border-white/[0.04] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/30">
                            {step.logs.map((log, i) => (
                              <div key={i} className="flex gap-2">
                                <span className="shrink-0 text-white/10">{String(i + 1).padStart(2, '0')}</span>
                                <span>{log}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
