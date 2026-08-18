import { motion } from 'framer-motion'
import { Eye, Loader2, Camera } from 'lucide-react'
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
  const [loaded, setLoaded] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const filmstripRef = useRef<HTMLDivElement>(null)

  const hasScreenshots = screenshots && screenshots.length > 0
  const current = hasScreenshots ? screenshots[currentIdx] : null

  // Auto-advance to latest screenshot
  useEffect(() => {
    if (hasScreenshots) {
      setCurrentIdx(screenshots.length - 1)
      setLoaded(true)
    }
  }, [screenshots?.length])

  // Auto-scroll filmstrip to latest
  useEffect(() => {
    if (filmstripRef.current) {
      filmstripRef.current.scrollLeft = filmstripRef.current.scrollWidth
    }
  }, [screenshots?.length])

  const height = compact ? 260 : 400

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <div className="grid size-8 place-items-center rounded-lg bg-[#D6FF00]/10">
          {hasScreenshots ? (
            <Camera size={14} className="text-[#D6FF00]" />
          ) : status === 'loading' || !loaded ? (
            <Loader2 size={14} className="animate-spin text-[#D6FF00]" />
          ) : (
            <Eye size={14} className="text-[#D6FF00]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-bold text-white">
            {hasScreenshots ? 'Agent Browser — Live Feed' : 'Entering your website live...'}
          </h4>
          <p className="mt-0.5 truncate text-[11px] text-white/30">{url}</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[#D6FF00]/10 px-2 py-0.5 text-[10px] font-bold text-[#D6FF00]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6FF00]" />
          LIVE
        </span>
      </div>

      {/* Main view */}
      <div className="relative bg-[#0A0A0A]">
        {!loaded && !hasScreenshots && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0A0A0A]">
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={20} className="animate-spin text-[#D6FF00]/40" />
              <span className="text-[11px] text-white/20">Launching browser...</span>
            </div>
          </div>
        )}

        {hasScreenshots && current ? (
          <>
            <img
              key={current.filename}
              src={`/api/restore/screenshots/${scanId}/${current.filename}`}
              alt={current.label}
              className="w-full object-contain bg-black"
              style={{ height }}
              onLoad={() => setLoaded(true)}
            />
            {/* Label overlay */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-6">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6FF00]" />
                <span className="text-[11px] font-semibold text-[#D6FF00]">{current.label}</span>
                {screenshots.length > 1 && (
                  <span className="ml-auto text-[10px] text-white/30 font-mono">
                    {currentIdx + 1}/{screenshots.length}
                  </span>
                )}
              </div>
            </div>
            {/* Progress bar */}
            {screenshots.length > 1 && (
              <div className="absolute top-0 inset-x-0 h-0.5 bg-white/[0.06]">
                <div
                  className="h-full bg-[#D6FF00] transition-all duration-300"
                  style={{ width: `${((currentIdx + 1) / screenshots.length) * 100}%` }}
                />
              </div>
            )}
          </>
        ) : (
          <iframe
            src={`/api/preview?url=${encodeURIComponent(url)}&_cb=${Date.now()}`}
            sandbox="allow-same-origin allow-scripts"
            style={{ pointerEvents: 'none', width: '100%', height, border: 'none' }}
            onLoad={() => setLoaded(true)}
            title="Website preview"
          />
        )}
      </div>

      {/* Filmstrip */}
      {hasScreenshots && screenshots.length > 1 && (
        <div
          ref={filmstripRef}
          className="flex gap-1.5 overflow-x-auto border-t border-white/[0.06] px-3 py-2"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
        >
          {screenshots.map((s, i) => (
            <button
              key={`${s.filename}-${i}`}
              onClick={() => setCurrentIdx(i)}
              className={`relative shrink-0 overflow-hidden rounded-lg border transition-all duration-200 ${
                i === currentIdx
                  ? 'border-[#D6FF00]/50 ring-1 ring-[#D6FF00]/20'
                  : 'border-white/[0.06] opacity-50 hover:opacity-80'
              }`}
            >
              <img
                src={`/api/restore/screenshots/${scanId}/${s.filename}`}
                alt={s.label}
                className="h-10 w-[72px] object-cover"
                loading="lazy"
              />
              {i === screenshots.length - 1 && (
                <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6FF00]" />
              )}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}
