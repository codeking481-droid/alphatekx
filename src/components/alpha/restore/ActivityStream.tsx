import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Check, Circle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type AlphaEvent = {
  type: string
  timestamp: string
  data?: any
}

type StageName = 'UNDERSTANDING' | 'INVESTIGATING' | 'REPRODUCING' | 'DIAGNOSING' | 'RESTORING' | 'VERIFYING' | 'RESTORED'

interface StageState {
  name: StageName
  status: 'pending' | 'active' | 'done'
  details: string[]
  startTime?: string
  endTime?: string
}

interface ActivityStreamProps {
  events: AlphaEvent[]
  isRunning: boolean
}

// ─── Stage Mapping ────────────────────────────────────────────────────────────

const STAGE_ORDER: StageName[] = ['UNDERSTANDING', 'INVESTIGATING', 'REPRODUCING', 'DIAGNOSING', 'RESTORING', 'VERIFYING', 'RESTORED']

function mapEventToStage(event: AlphaEvent): { stage: StageName; detail: string } | null {
  switch (event.type) {
    case 'RESTORATION_STARTED':
      return { stage: 'UNDERSTANDING', detail: 'Restoration initiated' }
    case 'REPOSITORY_SCANNED':
      return { stage: 'UNDERSTANDING', detail: `${event.data?.totalFiles || 0} files analyzed` }
    case 'FILE_OPENED':
      return { stage: 'INVESTIGATING', detail: `Examining ${event.data?.path || 'file'}` }
    case 'BROWSER_OPENED':
    case 'PAGE_NAVIGATED':
      return { stage: 'INVESTIGATING', detail: `Testing ${event.data?.url || 'site'}` }
    case 'ERROR_DETECTED':
      return { stage: 'DIAGNOSING', detail: event.data?.message || 'Error found' }
    case 'HYPOTHESIS_CREATED':
      return { stage: 'DIAGNOSING', detail: `${event.data?.hypotheses?.length || 0} hypotheses formed` }
    case 'EXPERIMENT_STARTED':
      return { stage: 'REPRODUCING', detail: `Testing hypothesis #${event.data?.hypothesisId || 0}` }
    case 'COMMAND_STARTED':
      return { stage: 'REPRODUCING', detail: `Running: ${event.data?.cmd || 'command'}` }
    case 'COMMAND_FINISHED':
      return { stage: 'REPRODUCING', detail: event.data?.success ? 'Command succeeded' : 'Command failed' }
    case 'FILE_MODIFIED':
      return { stage: 'RESTORING', detail: `Modified ${event.data?.path || 'file'}` }
    case 'TEST_STARTED':
      return { stage: 'VERIFYING', detail: `Running ${event.data?.count || 0} tests` }
    case 'TEST_FINISHED':
      return { stage: 'VERIFYING', detail: `${event.data?.passed || 0} passed, ${event.data?.failed || 0} failed` }
    case 'COMPONENT_HEALTH_CHANGED':
      return { stage: 'VERIFYING', detail: `${event.data?.component}: ${event.data?.oldHealth} → ${event.data?.newHealth}` }
    case 'VERIFICATION_PASSED':
      return { stage: 'VERIFYING', detail: 'Verification passed' }
    case 'RESTORATION_COMPLETED':
      return { stage: 'RESTORED', detail: `Health ${event.data?.healthBefore || 0} → ${event.data?.healthAfter || 0}` }
    case 'REASONING_TRACE':
      return { stage: 'DIAGNOSING', detail: event.data?.assessment || 'Analyzing' }
    default:
      return null
  }
}

function buildStages(events: AlphaEvent[]): StageState[] {
  const stages: StageState[] = STAGE_ORDER.map(name => ({
    name,
    status: 'pending',
    details: [],
  }))

  let currentStageIdx = 0

  for (const event of events) {
    const mapping = mapEventToStage(event)
    if (!mapping) continue

    const stageIdx = STAGE_ORDER.indexOf(mapping.stage)
    if (stageIdx < 0) continue

    // Mark stages up to current as done
    for (let i = currentStageIdx; i < stageIdx; i++) {
      if (stages[i].status === 'active') {
        stages[i].status = 'done'
        stages[i].endTime = event.timestamp
      }
    }

    // Set current stage
    if (stages[stageIdx].status === 'pending') {
      stages[stageIdx].status = 'active'
      stages[stageIdx].startTime = event.timestamp
    }

    // Add detail (max 5 per stage)
    if (stages[stageIdx].details.length < 5) {
      stages[stageIdx].details.push(mapping.detail)
    }

    currentStageIdx = stageIdx
  }

  // Mark last active stage as done if restoration completed
  const lastEvent = events[events.length - 1]
  if (lastEvent?.type === 'RESTORATION_COMPLETED') {
    for (const stage of stages) {
      if (stage.status === 'active') stage.status = 'done'
    }
  }

  return stages
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ events }: { events: AlphaEvent[] }) {
  const stages = buildStages(events)
  const doneCount = stages.filter(s => s.status === 'done').length
  const activeCount = stages.filter(s => s.status === 'active').length
  const progress = Math.round(((doneCount + activeCount * 0.5) / stages.length) * 100)

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-white/30 mb-1">
        <span>Progress</span>
        <span>{progress}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full bg-[#D6FF00]"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

// ─── Stage Timeline ───────────────────────────────────────────────────────────

function StageIcon({ status }: { status: 'pending' | 'active' | 'done' }) {
  if (status === 'done') {
    return (
      <div className="grid size-5 place-items-center rounded-full bg-[#D6FF00]/20">
        <Check size={10} className="text-[#D6FF00]" />
      </div>
    )
  }
  if (status === 'active') {
    return (
      <div className="grid size-5 place-items-center rounded-full bg-[#D6FF00]/10">
        <Loader2 size={10} className="animate-spin text-[#D6FF00]" />
      </div>
    )
  }
  return (
    <div className="grid size-5 place-items-center">
      <Circle size={8} className="text-white/20" />
    </div>
  )
}

function StageItem({ stage, isExpanded, onToggle }: { stage: StageState; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className="flex gap-3">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <StageIcon status={stage.status} />
        {stage.status === 'done' && (
          <div className="mt-1 w-px flex-1 bg-[#D6FF00]/20" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-3">
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-2 text-left"
          disabled={stage.details.length === 0}
        >
          <span className={`text-[12px] font-bold ${
            stage.status === 'done' ? 'text-[#D6FF00]/60' :
            stage.status === 'active' ? 'text-[#D6FF00]' :
            'text-white/20'
          }`}>
            {stage.name}
          </span>
          {stage.status === 'active' && (
            <span className="text-[10px] text-[#D6FF00]/60">●</span>
          )}
          {stage.details.length > 0 && (
            isExpanded ? <ChevronDown size={10} className="text-white/20" /> :
            <ChevronRight size={10} className="text-white/20" />
          )}
        </button>

        <AnimatePresence>
          {isExpanded && stage.details.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-1 space-y-0.5">
                {stage.details.map((detail, i) => (
                  <div key={i} className="text-[11px] text-white/40 leading-relaxed">
                    {detail}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActivityStream({ events, isRunning }: ActivityStreamProps) {
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const stages = buildStages(events)

  // Auto-expand active stage
  useEffect(() => {
    const activeStage = stages.find(s => s.status === 'active')
    if (activeStage) {
      setExpandedStages(prev => new Set([...prev, activeStage.name]))
    }
  }, [events.length])

  // Get current stage for header
  const currentStage = stages.find(s => s.status === 'active') || stages.find(s => s.status === 'done' && s.name !== 'RESTORED')
  const doneCount = stages.filter(s => s.status === 'done').length

  if (events.length === 0) return null

  const toggleStage = (name: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <div className="grid size-8 place-items-center rounded-lg bg-[#D6FF00]/10">
          {isRunning ? (
            <Loader2 size={14} className="animate-spin text-[#D6FF00]" />
          ) : (
            <Activity size={14} className="text-[#D6FF00]" />
          )}
        </div>
        <div className="flex-1">
          <h4 className="text-[13px] font-bold text-white">
            ALPHA STATE: {currentStage?.name || 'UNDERSTANDING'}
          </h4>
          <p className="mt-0.5 text-[11px] text-white/30">
            {doneCount}/{stages.length} stages complete
          </p>
        </div>
      </div>

      <div className="px-5 py-4">
        {/* Progress Bar */}
        <ProgressBar events={events} />

        {/* Stage Timeline */}
        <div className="mt-4">
          {stages.map((stage) => (
            <StageItem
              key={stage.name}
              stage={stage}
              isExpanded={expandedStages.has(stage.name)}
              onToggle={() => toggleStage(stage.name)}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}
