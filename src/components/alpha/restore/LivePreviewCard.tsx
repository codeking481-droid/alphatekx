import { motion } from 'framer-motion'
import { Eye, Loader2 } from 'lucide-react'
import { useState } from 'react'

export default function LivePreviewCard({ url, status, compact }: { url: string; status?: 'loading' | 'loaded' | 'error'; compact?: boolean }) {
  const [loaded, setLoaded] = useState(false)
  const iframeHeight = compact ? '260px' : '400px'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <div className="grid size-8 place-items-center rounded-lg bg-[#D6FF00]/10">
          {status === 'loading' || !loaded ? (
            <Loader2 size={14} className="animate-spin text-[#D6FF00]" />
          ) : (
            <Eye size={14} className="text-[#D6FF00]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-bold text-white">Entering your website live...</h4>
          <p className="mt-0.5 truncate text-[11px] text-white/30">{url}</p>
        </div>
        {!loaded && (
          <span className="flex items-center gap-1.5 rounded-full bg-[#D6FF00]/10 px-2 py-0.5 text-[10px] font-bold text-[#D6FF00]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6FF00]" />
            LIVE
          </span>
        )}
      </div>

      <div className="relative bg-[#0A0A0A]">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0A0A0A]">
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={20} className="animate-spin text-[#D6FF00]/40" />
              <span className="text-[11px] text-white/20">Loading preview...</span>
            </div>
          </div>
        )}
        <iframe
          src={`/api/preview?url=${encodeURIComponent(url)}&_cb=${Date.now()}`}
          sandbox="allow-same-origin allow-scripts"
          style={{ pointerEvents: 'none', width: '100%', height: iframeHeight, border: 'none', borderRadius: '0 0 12px 12px' }}
          onLoad={() => setLoaded(true)}
          title="Website preview"
        />
      </div>
    </motion.div>
  )
}
