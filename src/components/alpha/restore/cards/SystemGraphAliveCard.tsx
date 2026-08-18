import { motion } from 'framer-motion'
import { GitBranch, ArrowDown } from 'lucide-react'

type ComponentHealth = {
  name: string
  health: 'healthy' | 'degraded' | 'critical' | 'unknown'
}

type SystemGraphAliveCardProps = {
  components: ComponentHealth[]
  recentChange?: {
    component: string
    oldHealth: string
    newHealth: string
  }
}

function healthColor(health: string): string {
  if (health === 'healthy') return '#22c55e' // green
  if (health === 'degraded') return '#f59e0b' // amber
  if (health === 'critical') return '#ef4444' // red
  return '#6b7280' // gray
}

function healthBg(health: string): string {
  if (health === 'healthy') return 'bg-green-400/10 border-green-400/20'
  if (health === 'degraded') return 'bg-amber-400/10 border-amber-400/20'
  if (health === 'critical') return 'bg-red-400/10 border-red-400/20'
  return 'bg-white/[0.03] border-white/[0.06]'
}

function ComponentNode({ component, isRecentlyChanged }: { component: ComponentHealth; isRecentlyChanged?: boolean }) {
  return (
    <div className="flex items-center justify-center">
      <motion.div
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${healthBg(component.health)}`}
        animate={isRecentlyChanged ? {
          boxShadow: [
            `0 0 0 0px ${healthColor(component.health)}40`,
            `0 0 0 4px ${healthColor(component.health)}20`,
            `0 0 0 0px ${healthColor(component.health)}00`,
          ],
        } : undefined}
        transition={isRecentlyChanged ? { duration: 1.5, repeat: 2 } : undefined}
      >
        <motion.div
          className="size-2 rounded-full"
          style={{ backgroundColor: healthColor(component.health) }}
          animate={isRecentlyChanged ? { scale: [1, 1.5, 1] } : undefined}
          transition={{ duration: 0.5, repeat: 3 }}
        />
        <span className="text-[11px] font-medium text-white/80">{component.name}</span>
      </motion.div>
    </div>
  )
}

function Connector() {
  return (
    <div className="flex justify-center py-1">
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-px h-2 bg-white/10" />
        <ArrowDown size={8} className="text-white/15" />
        <div className="w-px h-2 bg-white/10" />
      </div>
    </div>
  )
}

export default function SystemGraphAliveCard({ components, recentChange }: SystemGraphAliveCardProps) {
  if (components.length === 0) return null

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
          <GitBranch size={13} className="text-[#D6FF00]" />
        </div>
        <div className="flex-1">
          <h4 className="text-[12px] font-bold text-white">SYSTEM HEALTH</h4>
          <p className="mt-0.5 text-[10px] text-white/30">
            {components.filter(c => c.health === 'healthy').length}/{components.length} healthy
          </p>
        </div>
      </div>

      {/* Graph */}
      <div className="px-4 py-4">
        <div className="space-y-0">
          {components.map((component, i) => (
            <div key={component.name}>
              <ComponentNode
                component={component}
                isRecentlyChanged={recentChange?.component === component.name}
              />
              {i < components.length - 1 && <Connector />}
            </div>
          ))}
        </div>

        {/* Recent change annotation */}
        {recentChange && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2"
          >
            <p className="text-[10px] text-white/40">
              <span className="font-bold text-white/60">{recentChange.component}</span>
              {' '}{recentChange.oldHealth} →{' '}
              <span style={{ color: healthColor(recentChange.newHealth) }}>
                {recentChange.newHealth}
              </span>
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
