import { motion } from 'framer-motion'
import { Check, Shield, FileCode, FlaskConical, RotateCcw, Eye } from 'lucide-react'

type RestorationCompleteProps = {
  healthBefore: number
  healthAfter: number
  filesModified: number
  testsPassed: number
  testsTotal?: number
  rollbackAvailable?: boolean
  onViewRestoration?: () => void
  onReplay?: () => void
}

function AnimatedNumber({ value, delay = 0 }: { value: number; delay?: number }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      {value}
    </motion.span>
  )
}

export default function RestorationComplete({
  healthBefore,
  healthAfter,
  filesModified,
  testsPassed,
  testsTotal,
  rollbackAvailable = true,
  onViewRestoration,
  onReplay,
}: RestorationCompleteProps) {
  const healthImprovement = healthAfter - healthBefore

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-[#D6FF00]/20 bg-[#D6FF00]/[0.02]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#D6FF00]/10 px-5 py-3">
        <div className="grid size-8 place-items-center rounded-lg bg-[#D6FF00]/15">
          <Check size={16} className="text-[#D6FF00]" />
        </div>
        <div className="flex-1">
          <h4 className="font-syne text-[14px] font-extrabold text-[#D6FF00]">RESTORED</h4>
          <p className="mt-0.5 text-[11px] text-white/30">Restoration complete</p>
        </div>
      </div>

      <div className="px-5 py-4">
        {/* Health Score Animation */}
        <div className="mb-4 flex items-center gap-6">
          <div className="text-center">
            <div className="font-syne text-3xl font-extrabold text-white/40">
              <AnimatedNumber value={healthBefore} />
            </div>
            <div className="text-[10px] text-white/20">Before</div>
          </div>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex-1 h-px bg-gradient-to-r from-white/20 via-[#D6FF00]/40 to-[#D6FF00]/60"
          />

          <div className="text-center">
            <motion.div
              className="font-syne text-3xl font-extrabold text-[#D6FF00]"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5, type: 'spring' }}
            >
              <AnimatedNumber value={healthAfter} delay={0.5} />
            </motion.div>
            <div className="text-[10px] text-[#D6FF00]/40">After</div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.8 }}
            className="rounded-full bg-[#D6FF00]/10 px-2 py-0.5"
          >
            <span className="text-[11px] font-bold text-[#D6FF00]">+{healthImprovement}</span>
          </motion.div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <FileCode size={10} className="text-[#D6FF00]/60" />
              <span className="text-[10px] text-white/30">Files Restored</span>
            </div>
            <div className="text-[16px] font-bold text-white/80">
              <AnimatedNumber value={filesModified} delay={0.7} />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <FlaskConical size={10} className="text-[#D6FF00]/60" />
              <span className="text-[10px] text-white/30">Tests</span>
            </div>
            <div className="text-[16px] font-bold text-white/80">
              <AnimatedNumber value={testsPassed} delay={0.8} />
              {testsTotal !== undefined && (
                <span className="text-[11px] text-white/30">/{testsTotal}</span>
              )}
            </div>
          </motion.div>
        </div>

        {/* Security & Rollback */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-1.5 rounded-lg border border-green-400/20 bg-green-400/[0.06] px-2 py-1">
            <Shield size={10} className="text-green-400" />
            <span className="text-[10px] text-green-400">Security PASS</span>
          </div>
          {rollbackAvailable && (
            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1">
              <RotateCcw size={10} className="text-white/30" />
              <span className="text-[10px] text-white/30">Rollback AVAILABLE</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {onViewRestoration && (
            <button
              onClick={onViewRestoration}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#D6FF00] px-3 py-2 text-[12px] font-bold text-black transition hover:bg-[#C2E600]"
            >
              <Eye size={12} />
              View Restoration
            </button>
          )}
          {onReplay && (
            <button
              onClick={onReplay}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[12px] text-white/60 transition hover:border-white/[0.15] hover:text-white/80"
            >
              <RotateCcw size={12} />
              Replay
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
