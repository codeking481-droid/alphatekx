import { motion } from 'framer-motion'
import { Eye, Loader2, Camera, Globe } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

type Screenshot = { filename: string; label: string }

export default function LivePreviewCard({
  url, status, compact, screenshots, scanId,
}: {
  url: string
  status?: 'loading' | 'loaded' | 'error'
  compact?: boolean
  screenshots?: Screenshot[]
  scanId?: string
}) {
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeError, setIframeError] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [view, setView] = useState<'live' | 'screenshots'>('live')
  const filmstripRef = useRef<HTMLDivElement>(null)

  const hasScreenshots = screenshots && screenshots.length > 0
  const current = hasScreenshots ? screenshots[currentIdx] : null

  // Reset iframe state when URL changes
  useEffect(() => {
    setIframeLoaded(false)
    setIframeError(false)
    setView('live')
  }, [url])

  // Auto-advance to latest screenshot
  useEffect(() => {
    if (hasScreenshots) {
      setCurrentIdx(screenshots.length - 1)
    }
  }, [screenshots?.length])

  // Auto-scroll filmstrip
  useEffect(() => {
    if (filmstripRef.current) {
      filmstripRef.current.scrollLeft = filmstripRef.current.scrollWidth
    }
  }, [screenshots?.length])

  // Auto-switch to screenshots view when they arrive
  useEffect(() => {
    if (hasScreenshots && view === 'live') {
      setView('screenshots')
    }
  }, [screenshots?.length])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="grid size-7 sm:size-8 place-items-center rounded-lg bg-[#D6FF00]/10 shrink-0">
          {status === 'loading' && !iframeLoaded ? (
            <Loader2 size={13} className="animate-spin text-[#D6FF00]" />
          ) : hasScreenshots ? (
            <Camera size={13} className="text-[#D6FF00]" />
          ) : (
            <Globe size={13} className="text-[#D6FF00]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[12px] sm:text-[13px] font-bold text-white leading-tight">
            {status === 'loading' && !iframeLoaded ? 'Loading your site...' : 'Live Website Preview'}
          </h4>
          <p className="mt-0.5 truncate text-[10px] sm:text-[11px] text-white/30">{url}</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[#D6FF00]/10 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-[#D6FF00] shrink-0">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6FF00]" />
          LIVE
        </span>
      </div>

      {/* View toggle: Live / Screenshots */}
      {hasScreenshots && (
        <div className="flex border-b border-white/[0.06]">
          <button
            onClick={() => setView('live')}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition ${
              view === 'live' ? 'border-b-2 border-[#D6FF00] text-[#D6FF00]' : 'text-white/20 hover:text-white/40'
            }`}
          >
            <Globe size={11} />
            Live
          </button>
          <button
            onClick={() => setView('screenshots')}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition ${
              view === 'screenshots' ? 'border-b-2 border-[#D6FF00] text-[#D6FF00]' : 'text-white/20 hover:text-white/40'
            }`}
          >
            <Camera size={11} />
            Agent View ({screenshots!.length})
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="relative bg-[#0A0A0A]">
        {view === 'live' ? (
          /* LIVE IFRAME — actually loads the site */
          <>
            {!iframeLoaded && !iframeError && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0A0A0A]">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 size={20} className="animate-spin text-[#D6FF00]/40" />
                  <span className="text-[11px] text-white/20">Loading website...</span>
                </div>
              </div>
            )}
            {iframeError ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Globe size={28} className="mb-3 text-white/10" />
                <p className="text-[13px] font-semibold text-white/30">Could not load live preview</p>
                <p className="mt-1 text-[11px] text-white/15">The site may be blocking iframe access</p>
                {hasScreenshots && (
                  <button
                    onClick={() => setView('screenshots')}
                    className="mt-3 rounded-lg bg-[#D6FF00]/10 px-3 py-1.5 text-[11px] font-bold text-[#D6FF00] transition hover:bg-[#D6FF00]/20"
                  >
                    View Agent Screenshots Instead
                  </button>
                )}
              </div>
            ) : (
              <iframe
                src={`/api/preview?url=${encodeURIComponent(url)}&_cb=${Date.now()}`}
                sandbox="allow-same-origin allow-scripts allow-forms"
                className="w-full border-none"
                style={{ pointerEvents: 'none', height: compact ? 220 : 340, border: 'none' }}
                onLoad={() => setIframeLoaded(true)}
                onError={() => setIframeError(true)}
                title="Live website preview"
              />
            )}
          </>
        ) : (
          /* SCREENSHOTS — agent's browser view */
          <>
            {current ? (
              <>
                <img
                  key={current.filename}
                  src={`/api/restore/screenshots/${scanId}/${current.filename}`}
                  alt={current.label}
                  className="w-full object-contain bg-black"
                  style={{ maxHeight: compact ? '50vw' : '60vw' }}
                />
                {/* Label overlay */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pb-1.5 pt-6 sm:px-3 sm:pb-2">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6FF00] shrink-0" />
                    <span className="text-[10px] sm:text-[11px] font-semibold text-[#D6FF00] truncate">{current.label}</span>
                    {screenshots!.length > 1 && (
                      <span className="ml-auto text-[9px] sm:text-[10px] text-white/30 font-mono shrink-0">
                        {currentIdx + 1}/{screenshots!.length}
                      </span>
                    )}
                  </div>
                </div>
                {/* Progress bar */}
                {screenshots!.length > 1 && (
                  <div className="absolute top-0 inset-x-0 h-0.5 bg-white/[0.06]">
                    <div
                      className="h-full bg-[#D6FF00] transition-all duration-300"
                      style={{ width: `${((currentIdx + 1) / screenshots!.length) * 100}%` }}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={18} className="animate-spin text-[#D6FF00]/30" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Filmstrip */}
      {hasScreenshots && screenshots!.length > 1 && (
        <div
          ref={filmstripRef}
          className="flex gap-1.5 overflow-x-auto border-t border-white/[0.06] px-2 py-1.5 sm:px-3 sm:py-2"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent', WebkitOverflowScrolling: 'touch' }}
        >
          {screenshots!.map((s, i) => (
            <button
              key={`${s.filename}-${i}`}
              onClick={() => { setCurrentIdx(i); setView('screenshots') }}
              className={`relative shrink-0 overflow-hidden rounded-lg border transition-all duration-200 ${
                i === currentIdx
                  ? 'border-[#D6FF00]/50 ring-1 ring-[#D6FF00]/20'
                  : 'border-white/[0.06] opacity-50 hover:opacity-80'
              }`}
            >
              <img
                src={`/api/restore/screenshots/${scanId}/${s.filename}`}
                alt={s.label}
                className="h-8 w-[56px] object-cover sm:h-10 sm:w-[72px]"
                loading="lazy"
              />
              {i === screenshots!.length - 1 && (
                <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6FF00]" />
              )}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}
