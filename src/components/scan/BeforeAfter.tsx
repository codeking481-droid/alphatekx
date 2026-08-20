import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Loader2, Maximize2, RotateCcw } from 'lucide-react'

type ScreenshotInfo = {
  label: string
  fileName: string
  serveUrl: string
  size: number
}

type DiffInfo = {
  diffUrl: string
  changedPixels: number
  totalPixels: number
  changePercent: string
}

type Props = {
  scanId: string
  baseUrl?: string
  className?: string
}

export default function BeforeAfter({ scanId, baseUrl = '', className = '' }: Props) {
  const [before, setBefore] = useState<ScreenshotInfo | null>(null)
  const [after, setAfter] = useState<ScreenshotInfo | null>(null)
  const [diff, setDiff] = useState<DiffInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sliderPos, setSliderPos] = useState(50)
  const [viewMode, setViewMode] = useState<'side-by-side' | 'overlay' | 'diff'>('side-by-side')
  const [fullscreen, setFullscreen] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  // ─── Load screenshots ──────────────────────────────────────────────────

  const loadScreenshots = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${baseUrl}/api/screenshot/list?scanId=${scanId}`)
      const data = await res.json()
      const shots: ScreenshotInfo[] = data.screenshots || []
      setBefore(shots.find(s => s.label === 'before') || null)
      setAfter(shots.find(s => s.label === 'after') || null)

      // Try to load diff
      try {
        const diffRes = await fetch(`${baseUrl}/api/screenshot/diff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scanId }),
        })
        if (diffRes.ok) {
          const diffData = await diffRes.json()
          setDiff(diffData.diff || null)
        }
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load screenshots')
    } finally {
      setLoading(false)
    }
  }, [scanId, baseUrl])

  useEffect(() => { loadScreenshots() }, [loadScreenshots])

  // ─── Slider drag ───────────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    updateSlider(e)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    updateSlider(e)
  }

  const handlePointerUp = () => {
    dragging.current = false
  }

  const updateSlider = (e: React.PointerEvent) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setSliderPos(pct)
  }

  // ─── Download ──────────────────────────────────────────────────────────

  const handleDownload = (url: string, filename: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  }

  // ─── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={`flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] p-8 ${className}`}>
        <Loader2 size={20} className="animate-spin text-violet-400" />
        <span className="ml-2 text-sm text-slate-400">Loading screenshots...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`rounded-2xl border border-rose-400/15 bg-rose-500/5 p-6 text-center ${className}`}>
        <p className="text-sm text-rose-300">{error}</p>
        <button onClick={loadScreenshots} className="mt-2 text-xs text-violet-300 hover:text-violet-200">Retry</button>
      </div>
    )
  }

  if (!before && !after) {
    return (
      <div className={`rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center ${className}`}>
        <p className="text-sm text-slate-400">No screenshots available for this scan.</p>
      </div>
    )
  }

  return (
    <div className={`rounded-[28px] border border-violet-300/20 bg-[#0b0d14]/80 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.22)] sm:p-5 ${className}`}>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Before / After</p>
          <h3 className="mt-1 text-lg font-black text-white">Screenshot Comparison</h3>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/20 p-1">
          {(['side-by-side', 'overlay', 'diff'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition ${
                viewMode === mode
                  ? 'bg-violet-500 text-white shadow-[0_4px_12px_rgba(109,40,217,0.3)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {mode === 'side-by-side' ? 'Side by Side' : mode === 'overlay' ? 'Overlay' : 'Diff'}
            </button>
          ))}
        </div>
      </div>

      {/* Diff stats */}
      {diff && (
        <div className="mb-4 flex items-center gap-4 rounded-xl border border-violet-400/15 bg-violet-500/5 px-4 py-2.5">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-violet-300">Changed</span>
            <span className="ml-2 text-sm font-black text-white">{diff.changePercent}%</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-violet-300">Pixels</span>
            <span className="ml-2 text-xs text-slate-400">{diff.changedPixels.toLocaleString()} / {diff.totalPixels.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* ─── Side by Side ─────────────────────────────────────────────── */}
      {viewMode === 'side-by-side' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {before && (
            <div className="group relative overflow-hidden rounded-2xl border border-rose-400/20">
              <div className="absolute left-0 top-0 z-10 rounded-br-xl bg-rose-500/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
                Before
              </div>
              <button
                onClick={() => setFullscreen(before.serveUrl)}
                className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-lg bg-black/50 text-white/60 opacity-0 transition hover:bg-black/70 hover:text-white group-hover:opacity-100"
              >
                <Maximize2 size={12} />
              </button>
              <img
                src={before.serveUrl}
                alt="Before screenshot"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                <button
                  onClick={() => handleDownload(before.serveUrl, `before-${scanId}.png`)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur-sm transition hover:bg-black/70 hover:text-white"
                >
                  <Download size={10} /> Download
                </button>
              </div>
            </div>
          )}
          {after && (
            <div className="group relative overflow-hidden rounded-2xl border border-emerald-400/20">
              <div className="absolute left-0 top-0 z-10 rounded-br-xl bg-emerald-500/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
                After
              </div>
              <button
                onClick={() => setFullscreen(after.serveUrl)}
                className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-lg bg-black/50 text-white/60 opacity-0 transition hover:bg-black/70 hover:text-white group-hover:opacity-100"
              >
                <Maximize2 size={12} />
              </button>
              <img
                src={after.serveUrl}
                alt="After screenshot"
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                <button
                  onClick={() => handleDownload(after.serveUrl, `after-${scanId}.png`)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur-sm transition hover:bg-black/70 hover:text-white"
                >
                  <Download size={10} /> Download
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Overlay (slider) ─────────────────────────────────────────── */}
      {viewMode === 'overlay' && before && after && (
        <div
          ref={containerRef}
          className="relative cursor-ew-resize overflow-hidden rounded-2xl border border-white/10 select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* After (full background) */}
          <img src={after.serveUrl} alt="After" className="w-full object-cover" draggable={false} />

          {/* Before (clipped) */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          >
            <img src={before.serveUrl} alt="Before" className="w-full object-cover" draggable={false} />
          </div>

          {/* Slider line */}
          <div
            className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_rgba(255,255,255,0.5)]"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-lg">
              <RotateCcw size={14} className="text-black" />
            </div>
          </div>

          {/* Labels */}
          <div className="absolute left-3 top-3 rounded-lg bg-rose-500/80 px-2 py-1 text-[10px] font-black text-white backdrop-blur-sm">
            Before
          </div>
          <div className="absolute right-3 top-3 rounded-lg bg-emerald-500/80 px-2 py-1 text-[10px] font-black text-white backdrop-blur-sm">
            After
          </div>
        </div>
      )}

      {/* ─── Diff view ────────────────────────────────────────────────── */}
      {viewMode === 'diff' && (
        <div className="relative overflow-hidden rounded-2xl border border-white/10">
          {diff?.diffUrl ? (
            <>
              <img src={diff.diffUrl} alt="Diff" className="w-full object-cover" />
              <div className="absolute left-3 top-3 rounded-lg bg-violet-500/80 px-2 py-1 text-[10px] font-black text-white backdrop-blur-sm">
                Pixel Diff — {diff.changePercent}% changed
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                <button
                  onClick={() => handleDownload(diff.diffUrl, `diff-${scanId}.png`)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur-sm transition hover:bg-black/70 hover:text-white"
                >
                  <Download size={10} /> Download Diff
                </button>
              </div>
            </>
          ) : before ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-center">
                <p className="text-sm text-slate-400">No diff available yet.</p>
                <p className="mt-1 text-xs text-slate-500">Apply fixes and capture an "after" screenshot to see differences.</p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ─── Fullscreen overlay ───────────────────────────────────────── */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setFullscreen(null)}
        >
          <button
            onClick={() => setFullscreen(null)}
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            ✕
          </button>
          <img
            src={fullscreen}
            alt="Screenshot fullscreen"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}

      {/* Scan ID */}
      <p className="mt-3 text-center font-mono text-[10px] text-slate-600">Scan: {scanId}</p>
    </div>
  )
}
