import { useState } from 'react'
import { ChevronDown, CheckCircle2, Loader2, Scan, Search, Wrench, FlaskConical } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export type ThoughtStep = {
  id: string
  label: string
  icon: 'scan' | 'diagnose' | 'plan' | 'test'
  status: 'pending' | 'active' | 'done' | 'error'
  summary?: string
  details?: string[]
}

const iconMap = {
  scan: Scan,
  diagnose: Search,
  plan: Wrench,
  test: FlaskConical,
}

export default function ChainOfThought({ steps }: { steps: ThoughtStep[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))

  if (!steps.length) return null

  return (
    <div className="my-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
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
          {steps.some((s) => s.status === 'active') ? (
            <Loader2 size={14} className="animate-spin text-[#D6FF00]" />
          ) : (
            <CheckCircle2 size={14} className="text-[#D6FF00]" />
          )}
          <span className="text-xs font-bold uppercase tracking-widest text-[#D6FF00]">
            Chain of Thought
          </span>
        </div>
        <span className="ml-auto text-[10px] font-semibold text-white/30">
          {steps.filter((s) => s.status === 'done').length}/{steps.length} steps
        </span>
        <ChevronDown
          size={14}
          className="text-white/30 transition-transform duration-200"
          style={{
            transform: steps.every((s) => expanded[s.id]) ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      <AnimatePresence>
        {steps.map((step) => {
          const Icon = iconMap[step.icon]
          const isOpen = expanded[step.id]
          return (
            <motion.div
              key={step.id}
              initial={false}
              animate={{ height: isOpen ? 'auto' : 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="border-t border-white/[0.04] px-4 py-3">
                <button
                  onClick={() => toggle(step.id)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-lg ${
                      step.status === 'done'
                        ? 'bg-[#D6FF00]/10 text-[#D6FF00]'
                        : step.status === 'active'
                          ? 'bg-[#D6FF00]/10 text-[#D6FF00]'
                          : step.status === 'error'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-white/[0.04] text-white/30'
                    }`}
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
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
