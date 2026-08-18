import { motion } from 'framer-motion'
import { Globe, Lock, Monitor, AlertCircle } from 'lucide-react'

type LiveBrowserCardProps = {
  url: string
  screenshotUrl?: string
  error?: string
}

export default function LiveBrowserCard({ url, screenshotUrl, error }: LiveBrowserCardProps) {
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
          <Monitor size={13} className="text-[#D6FF00]" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[12px] font-bold text-white">ALPHA LIVE VIEW</h4>
          <p className="mt-0.5 text-[10px] text-white/30 truncate">{url}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1">
          <Lock size={9} className="text-[#D6FF00]/60" />
          <span className="text-[9px] text-white/30">Sandbox</span>
        </div>
      </div>

      {/* Browser Content */}
      <div className="relative aspect-video bg-[#0A0A0A]">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <AlertCircle size={24} className="text-red-400" />
            <p className="text-[12px] text-red-400/80">{error}</p>
          </div>
        ) : screenshotUrl ? (
          <img
            src={screenshotUrl}
            alt="Website preview"
            className="h-full w-full object-cover"
            style={{ pointerEvents: 'none' }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Globe size={24} className="text-white/10" />
            <p className="text-[11px] text-white/20">Connecting to site...</p>
            <div className="flex gap-1">
              <span className="h-1 w-1 animate-pulse rounded-full bg-[#D6FF00]/40" />
              <span className="h-1 w-1 animate-pulse rounded-full bg-[#D6FF00]/30 [animation-delay:200ms]" />
              <span className="h-1 w-1 animate-pulse rounded-full bg-[#D6FF00]/20 [animation-delay:400ms]" />
            </div>
          </div>
        )}

        {/* Overlay: user cannot interact */}
        <div className="absolute inset-0" style={{ pointerEvents: 'none' }} />
      </div>
    </motion.div>
  )
}
