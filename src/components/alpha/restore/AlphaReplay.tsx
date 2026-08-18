import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { History, Play, Pause, RotateCcw, ChevronDown, ChevronRight, Clock } from 'lucide-react'

type AlphaEvent = {
  type: string
  timestamp: string
  data?: any
}

type AlphaReplayProps = {
  events: AlphaEvent[]
  isOpen: boolean
  onClose: () => void
}

function formatTimeDiff(startMs: number, eventMs: number): string {
  const diff = Math.max(0, eventMs - startMs)
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes > 0) return `${minutes}:${secs.toString().padStart(2, '0')}`
  return `0:${secs.toString().padStart(2, '0')}`
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    RESTORATION_STARTED: 'Connected',
    REPOSITORY_SCANNED: 'X-Ray started',
    FILE_OPENED: 'File examined',
    COMMAND_STARTED: 'Command running',
    COMMAND_FINISHED: 'Command done',
    BROWSER_OPENED: 'Browser launched',
    PAGE_NAVIGATED: 'Page loaded',
    ERROR_DETECTED: 'Error found',
    HYPOTHESIS_CREATED: 'Hypothesis formed',
    EXPERIMENT_STARTED: 'Testing hypothesis',
    FILE_MODIFIED: 'File fixed',
    TEST_STARTED: 'Tests started',
    TEST_FINISHED: 'Tests done',
    COMPONENT_HEALTH_CHANGED: 'Health changed',
    VERIFICATION_PASSED: 'Verified',
    RESTORATION_COMPLETED: 'Restoration complete',
    REASONING_TRACE: 'Reasoning',
  }
  return labels[type] || type
}

function eventTypeColor(type: string): string {
  if (type.includes('ERROR')) return 'text-red-400'
  if (type.includes('MODIFIED') || type.includes('COMPLETED')) return 'text-[#D6FF00]'
  if (type.includes('STARTED')) return 'text-[#D6FF00]/60'
  if (type.includes('FINISHED') || type.includes('PASSED')) return 'text-green-400'
  return 'text-white/40'
}

export default function AlphaReplay({ events, isOpen, onClose }: AlphaReplayProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  if (events.length === 0) return null

  const startMs = new Date(events[0].timestamp).getTime()

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
            <div className="grid size-7 place-items-center rounded-lg bg-[#D6FF00]/10">
              <History size={13} className="text-[#D6FF00]" />
            </div>
            <div className="flex-1">
              <h4 className="text-[12px] font-bold text-white">RESTORATION TIMELINE</h4>
              <p className="mt-0.5 text-[10px] text-white/30">{events.length} events</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg border border-white/[0.06] px-2 py-1 text-[10px] text-white/40 hover:text-white/60"
            >
              Close
            </button>
          </div>

          {/* Timeline */}
          <div className="max-h-64 overflow-y-auto px-4 py-3">
            <div className="space-y-0">
              {events.map((event, i) => {
                const eventMs = new Date(event.timestamp).getTime()
                const timeLabel = formatTimeDiff(startMs, eventMs)
                const isSelected = selectedIdx === i

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedIdx(isSelected ? null : i)}
                    className="flex w-full items-center gap-3 py-1.5 text-left transition-colors hover:bg-white/[0.02] rounded-lg px-2 -mx-2"
                  >
                    {/* Time */}
                    <div className="flex items-center gap-1 w-12 shrink-0">
                      <Clock size={8} className="text-white/15" />
                      <span className="text-[10px] text-white/25 font-mono">{timeLabel}</span>
                    </div>

                    {/* Dot */}
                    <div className={`size-1.5 rounded-full shrink-0 ${
                      isSelected ? 'bg-[#D6FF00]' : 'bg-white/20'
                    }`} />

                    {/* Label */}
                    <span className={`text-[11px] flex-1 ${eventTypeColor(event.type)}`}>
                      {eventTypeLabel(event.type)}
                    </span>

                    {/* Expand icon */}
                    {event.data && (
                      isSelected ?
                        <ChevronDown size={10} className="text-white/20" /> :
                        <ChevronRight size={10} className="text-white/15" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected event detail */}
          <AnimatePresence>
            {selectedIdx !== null && events[selectedIdx]?.data && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-white/[0.06]"
              >
                <div className="px-4 py-3">
                  <pre className="max-h-32 overflow-y-auto rounded-lg bg-black/40 p-2 font-mono text-[10px] text-white/40 whitespace-pre-wrap">
                    {JSON.stringify(events[selectedIdx].data, null, 2)}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
