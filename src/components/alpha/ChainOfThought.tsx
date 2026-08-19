import { useState, useEffect, useRef, useCallback } from 'react'
import { Brain, ChevronRight, Check, X, Search, Wrench, FlaskConical, Globe, Film, AlertCircle } from 'lucide-react'
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
  icon: 'scan' | 'diagnose' | 'plan' | 'test' | 'search' | 'film'
  status: 'pending' | 'active' | 'done' | 'error'
  summary?: string
  details?: string[]
  logs?: string[]
  tavilySources?: TavilySource[]
}

const iconMap: Record<string, typeof Brain> = {
  scan: Brain,
  diagnose: Search,
  plan: Wrench,
  test: FlaskConical,
  search: Globe,
  film: Film,
}

function useElapsedMs(active: boolean, startTime: number) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100)
    return () => clearInterval(id)
  }, [active, startTime])
  return elapsed
}

function formatSeconds(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 1) return 'a moment'
  if (s === 1) return '1 second'
  return `${s} seconds`
}

export default function ChainOfThought({ steps }: { steps: ThoughtStep[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})
  const [showLogs, setShowLogs] = useState<Record<string, boolean>>({})
  const startTimeRef = useRef(Date.now())
  const hasActive = steps.some((s) => s.status === 'active')
  const allDone = steps.length > 0 && steps.every((s) => s.status === 'done' || s.status === 'error')
  const elapsed = useElapsedMs(hasActive, startTimeRef.current)

  const toggleStep = useCallback((id: string) => {
    setExpandedSteps((p) => ({ ...p, [id]: !p[id] }))
  }, [])

  const toggleLogs = useCallback((id: string) => {
    setShowLogs((p) => ({ ...p, [id]: !p[id] }))
  }, [])

  if (!steps.length) return null

  const doneCount = steps.filter((s) => s.status === 'done').length
  const errorCount = steps.filter((s) => s.status === 'error').length

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="group relative overflow-hidden rounded-xl border border-[#D6FF00]/10 bg-[#0a0f1e]/80 backdrop-blur-sm"
      style={{ borderLeftWidth: '2.5px', borderLeftColor: '#D6FF00' }}
    >
      {/* Shimmer overlay when thinking */}
      {hasActive && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #D6FF00 50%, transparent 100%)',
              backgroundSize: '200% 100%',
            }}
            animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      )}

      {/* Header — always visible, click to collapse/expand */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="relative flex items-center gap-2.5">
          {hasActive ? (
            <div className="relative">
              <Brain size={14} className="text-[#D6FF00] animate-pulse" />
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[#D6FF00]">
                <span className="absolute inset-0 animate-ping rounded-full bg-[#D6FF00] opacity-40" />
              </span>
            </div>
          ) : allDone ? (
            <Check size={14} className="text-[#D6FF00]" strokeWidth={3} />
          ) : (
            <Brain size={14} className="text-white/30" />
          )}

          <span
            className={`text-[12px] font-semibold ${
              hasActive ? 'text-[#D6FF00]' : allDone ? 'text-white/60' : 'text-white/40'
            }`}
          >
            {hasActive ? (
              <>Thinking{collapsed && <span className="text-[#D6FF00]/60">... {formatSeconds(elapsed)}</span>}</>
            ) : allDone ? (
              <>Thought for {formatSeconds(elapsed)}</>
            ) : (
              'Thinking'
            )}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!hasActive && steps.length > 0 && (
            <span className="text-[10px] font-medium text-white/20">
              {doneCount}{errorCount > 0 && <span className="text-red-400/60"> · {errorCount} failed</span>}
            </span>
          )}
          <motion.div
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <ChevronRight size={14} className="text-white/20" />
          </motion.div>
        </div>
      </button>

      {/* Body — collapsible */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="relative border-t border-white/[0.04] px-4 py-2">
              {/* Vertical timeline line */}
              <div className="absolute left-[23px] top-4 bottom-3 w-px bg-gradient-to-b from-[#D6FF00]/20 via-white/[0.04] to-transparent" />

              {steps.map((step, index) => {
                const Icon = iconMap[step.icon] || Brain
                const isActive = step.status === 'active'
                const isDone = step.status === 'done'
                const isError = step.status === 'error'
                const isExpanded = expandedSteps[step.id]
                const hasContent = step.summary || (step.details && step.details.length > 0) || (step.logs && step.logs.length > 0) || (step.tavilySources && step.tavilySources.length > 0)

                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.04, ease: [0.23, 1, 0.32, 1] }}
                    className="relative"
                  >
                    {/* Step row */}
                    <div className="flex items-start gap-3 py-2 pl-1">
                      {/* Status dot */}
                      <div className="relative mt-[5px] flex shrink-0 items-center justify-center">
                        {isActive ? (
                          <span className="relative flex h-[9px] w-[9px] items-center justify-center">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D6FF00] opacity-30" />
                            <span className="relative inline-flex h-[5px] w-[5px] rounded-full bg-[#D6FF00] shadow-[0_0_6px_#D6FF00]" />
                          </span>
                        ) : isDone ? (
                          <span className="flex h-[9px] w-[9px] items-center justify-center rounded-full bg-[#D6FF00]/80 shadow-[0_0_4px_rgba(214,255,0,0.2)]" />
                        ) : isError ? (
                          <span className="flex h-[9px] w-[9px] items-center justify-center rounded-full bg-red-500/80 shadow-[0_0_4px_rgba(239,68,68,0.2)]" />
                        ) : (
                          <span className="h-[9px] w-[9px] rounded-full border border-white/10 bg-transparent" />
                        )}
                      </div>

                      {/* Step content */}
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => hasContent && toggleStep(step.id)}
                          className={`flex w-full items-center gap-2 text-left ${
                            hasContent ? 'cursor-pointer group/step' : 'cursor-default'
                          }`}
                        >
                          <span
                            className={`text-[12px] font-medium italic ${
                              isActive
                                ? 'text-[#D6FF00]/90'
                                : isDone
                                  ? 'text-white/40'
                                  : isError
                                    ? 'text-red-400/70'
                                    : 'text-white/20'
                            }`}
                          >
                            {step.label}
                          </span>

                          {isActive && (
                            <motion.span
                              className="inline-block h-[14px] w-[1.5px] bg-[#D6FF00]/70"
                              animate={{ opacity: [1, 0.2, 1] }}
                              transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                            />
                          )}

                          {hasContent && !isActive && (
                            <motion.div
                              animate={{ rotate: isExpanded ? 90 : 0 }}
                              transition={{ duration: 0.15 }}
                            >
                              <ChevronRight size={10} className="text-white/15 group-hover/step:text-white/30 transition-colors" />
                            </motion.div>
                          )}
                        </button>

                        {/* Summary — inline italic like DeepSeek */}
                        {!isExpanded && step.summary && !isActive && (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-0.5 text-[11px] italic text-white/25 leading-relaxed line-clamp-1"
                          >
                            {step.summary}
                          </motion.p>
                        )}

                        {/* Expanded details */}
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                              className="overflow-hidden"
                            >
                              {/* Summary */}
                              {step.summary && (
                                <p className="mt-1.5 text-[11px] italic text-white/35 leading-relaxed">
                                  {step.summary}
                                </p>
                              )}

                              {/* Details */}
                              {step.details && step.details.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                  {step.details.map((detail, i) => (
                                    <motion.li
                                      key={i}
                                      initial={{ opacity: 0, x: -3 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: i * 0.03 }}
                                      className="flex items-start gap-2 text-[11px] italic text-white/30 leading-relaxed"
                                    >
                                      <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-[#D6FF00]/30" />
                                      {detail}
                                    </motion.li>
                                  ))}
                                </ul>
                              )}

                              {/* Tavily Sources */}
                              {step.tavilySources && step.tavilySources.length > 0 && (
                                <div className="mt-2.5 space-y-1.5">
                                  {step.tavilySources.map((source, i) => (
                                    <motion.div
                                      key={i}
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      transition={{ delay: i * 0.05 }}
                                      className="flex items-center gap-2 rounded-md bg-white/[0.02] px-2.5 py-1.5 border border-white/[0.03]"
                                    >
                                      <Globe size={9} className="shrink-0 text-[#D6FF00]/40" />
                                      <a
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] font-medium text-[#D6FF00]/50 hover:text-[#D6FF00]/80 truncate transition-colors"
                                      >
                                        {source.title}
                                      </a>
                                      <span className="ml-auto shrink-0 text-[9px] text-white/15">
                                        {(source.score * 100).toFixed(0)}%
                                      </span>
                                    </motion.div>
                                  ))}
                                </div>
                              )}

                              {/* Logs */}
                              {step.logs && step.logs.length > 0 && (
                                <div className="mt-2.5">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleLogs(step.id) }}
                                    className="flex items-center gap-1.5 text-[10px] font-medium text-white/15 hover:text-white/30 transition-colors"
                                  >
                                    <span className={`h-1 w-1 rounded-full transition-colors ${showLogs[step.id] ? 'bg-[#D6FF00]/60' : 'bg-white/15'}`} />
                                    {showLogs[step.id] ? 'Hide logs' : 'Show logs'}
                                  </button>
                                  <AnimatePresence initial={false}>
                                    {showLogs[step.id] && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        className="overflow-hidden"
                                      >
                                        <div className="mt-1.5 rounded-md bg-black/30 p-2.5 font-mono text-[10px] leading-relaxed text-white/20">
                                          {step.logs.map((log, i) => (
                                            <div key={i} className="flex gap-2">
                                              <span className="shrink-0 text-white/8">{String(i + 1).padStart(2, '0')}</span>
                                              <span>{log}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
