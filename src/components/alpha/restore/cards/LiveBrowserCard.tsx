import { motion } from 'framer-motion'
import { Globe, Lock, Monitor, AlertCircle, RefreshCw, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'

type LiveBrowserCardProps = {
  url: string
  screenshotUrl?: string
  error?: string
}

export default function LiveBrowserCard({ url, screenshotUrl, error }: LiveBrowserCardProps) {
  const [iframeKey, setIframeKey] = useState(0)
  const [iframeLoaded, setIframeLoaded] = useState(false)

  // Auto-refresh the iframe every 8 seconds to show live state
  useEffect(() => {
    if (!url || error) return
    const interval = setInterval(() => {
      setIframeKey(prev => prev + 1)
      setIframeLoaded(false)
    }, 8000)
    return () => clearInterval(interval)
  }, [url, error])

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
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded-full bg-[#D6FF00]/10 px-2 py-0.5 text-[8px] font-bold text-[#D6FF00]">
            <span className="h-1 w-1 animate-pulse rounded-full bg-[#D6FF00]" />
            LIVE
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1">
            <Lock size={9} className="text-[#D6FF00]/60" />
            <span className="text-[9px] text-white/30">Sandbox</span>
          </div>
        </div>
      </div>

      {/* Browser Content — live iframe or fallback to screenshot */}
      <div className="relative aspect-video bg-[#0A0A0A]">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <AlertCircle size={24} className="text-red-400" />
            <p className="text-[12px] text-red-400/80">{error}</p>
          </div>
        ) : (
          <>
            {!iframeLoaded && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0A0A0A]">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 size={18} className="animate-spin text-[#D6FF00]/40" />
                  <p className="text-[10px] text-white/20">Connecting to site...</p>
                </div>
              </div>
            )}
            {url ? (
              <iframe
                key={iframeKey}
                src={`/api/preview?url=${encodeURIComponent(url)}&_cb=${Date.now()}`}
                sandbox="allow-same-origin allow-scripts"
                style={{ pointerEvents: 'none', width: '100%', height: '100%', border: 'none', position: 'absolute', inset: 0 }}
                onLoad={() => setIframeLoaded(true)}
                title="Live website view"
              />
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
          </>
        )}

        {/* Overlay: user cannot interact */}
        <div className="absolute inset-0 z-20" style={{ pointerEvents: 'none' }} />

        {/* Manual refresh button */}
        {!error && url && (
          <button
            onClick={() => { setIframeKey(prev => prev + 1); setIframeLoaded(false) }}
            className="absolute bottom-2 right-2 z-30 flex items-center gap-1 rounded-lg border border-white/[0.06] bg-black/60 px-2 py-1 text-[9px] text-white/30 backdrop-blur-sm transition hover:text-white/50"
          >
            <RefreshCw size={9} /> Refresh
          </button>
        )}
      </div>
    </motion.div>
  )
}
