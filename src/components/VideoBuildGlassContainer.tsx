import { Check, Download, Film, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

type VideoEvent = {
  step?: number
  totalSteps?: number
  message?: string
  clipIndex?: number
  clipCount?: number
  phase?: string
  finalVideoUrl?: string
  size?: number
  totalScenes?: number
}

type Props = { 
  prompt: string
  plan?: 'free' | 'starter' | 'creator' | 'beast'
  onClose?: () => void 
}

const PLAN_CONFIG = {
  free: { scenesMax: 6, duration: 120, name: 'Free' },
  starter: { scenesMax: 12, duration: 300, name: 'Starter' },
  creator: { scenesMax: 20, duration: 480, name: 'Creator' },
  beast: { scenesMax: 32, duration: 780, name: 'Beast' },
}

// This is deliberately a POST-driven stream rather than EventSource: creating a
// video has a prompt body and must carry the current authenticated browser session.
export default function VideoBuildGlassContainer({ prompt, plan = 'free', onClose }: Props) {
  const planConfig = PLAN_CONFIG[plan]
  const [events, setEvents] = useState<VideoEvent[]>([])
  const [running, setRunning] = useState(true)
  const [finalUrl, setFinalUrl] = useState('')
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const controller = new AbortController()
    const start = async () => {
      try {
        const response = await fetch('/api/alpha/video-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ prompt, plan, duration: planConfig.duration }),
          signal: controller.signal,
        })
        if (!response.ok || !response.body) throw new Error('Glass Studio could not initialize.')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let pending = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          const packets = pending.split('\n\n')
          pending = packets.pop() || ''
          for (const packet of packets) {
            const line = packet.split('\n').find(entry => entry.startsWith('data: '))
            if (!line) continue
            try {
              const event = JSON.parse(line.slice(6)) as VideoEvent
              setEvents(current => [...current.slice(-49), event])
              if (event.finalVideoUrl) { setFinalUrl(event.finalVideoUrl); setRunning(false) }
              if (event.phase === 'error') { setError(event.message || 'Video generation failed.'); setRunning(false) }
            } catch { /* ignore an incomplete SSE packet */ }
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Video generation could not start.')
      } finally { setRunning(false) }
    }
    void start()
    return () => controller.abort()
  }, [plan, planConfig.duration, prompt])

  const latest = events.at(-1)
  const totalScenes = latest?.totalScenes || planConfig.scenesMax
  const clips = useMemo(() => Array.from({ length: totalScenes }, (_, index) => index), [totalScenes])
  const completeCount = Math.max(0, Math.min(clips.length, (latest?.clipIndex ?? -1) + 1))

  // Format phase display
  const phaseDisplay = latest?.phase ? {
    'script': '📝 Script Generation',
    'narration': '🎙️ Voice Generation',
    'search': '🔍 Searching Pexels',
    'editing': '✂️ Editing Scenes',
    'final': '🎬 Finalizing Video',
    'upload': '☁️ Uploading Video',
    'complete': '✅ Complete!',
    'error': '❌ Error',
    'starting': '🚀 Starting Glass Studio',
  }[latest.phase] : 'Preparing Glass Studio…'

  const durationMin = Math.round(planConfig.duration / 60)

  return <section className="my-4 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-[0_20px_60px_rgba(0,0,0,.38)] sm:rounded-3xl">
    {/* Header with plan info */}
    <div className="border-b border-white/10 bg-gradient-to-r from-violet-600/20 to-purple-600/20 px-4 py-3 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-white">Building {durationMin}min {planConfig.name} Video</h3>
          <p className="text-xs text-white/60">Phase: {phaseDisplay}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-white">{totalScenes} Scenes</p>
          <p className="text-xs text-white/60">{completeCount}/{totalScenes} done</p>
        </div>
      </div>
    </div>

    {/* Video preview */}
    <div className="relative aspect-video w-full bg-black">
      {finalUrl ? (
        <video src={finalUrl} className="h-full w-full object-cover" controls playsInline />
      ) : (
        <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_50%_30%,rgba(109,40,217,.3),transparent_38%),#08080a]">
          <div className="text-center">
            <Film size={48} className="mx-auto mb-2 text-white/45" />
            <p className="text-sm font-semibold text-white/70">Calm Mode - Building</p>
          </div>
        </div>
      )}
      {running && (
        <div className="absolute inset-0 z-10 flex cursor-not-allowed flex-col items-center justify-center gap-3 bg-black/30 p-6 text-center backdrop-blur-[3px]">
          <LoaderCircle className="animate-spin text-white" size={32}/>
          <p className="text-sm font-bold text-white">Scene {Math.min(totalScenes, (latest?.clipIndex ?? 0) + 1)}/{totalScenes}</p>
          <p className="text-xs text-white/70">{latest?.message || 'Processing...'}</p>
        </div>
      )}
    </div>

    {/* Timeline */}
    <div className="border-t border-white/10 bg-[#101014] p-3 sm:p-4">
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Video editing timeline">
        {clips.map(index => (
          <div
            key={index}
            className={`flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition ${
              index < completeCount
                ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                : index === completeCount && running
                  ? 'border-violet-400/70 bg-violet-500/20 text-white animate-pulse'
                  : 'border-white/10 bg-white/[.03] text-white/35'
            }`}
            title={`Scene ${index + 1}`}
          >
            {index < completeCount ? <Check size={16}/> : String(index + 1).padStart(2, '0')}
          </div>
        ))}
      </div>

      {/* Status message */}
      <div className="rounded-xl bg-white/[.035] px-3 py-2 text-xs text-white/70" aria-live="polite">
        {error ? (
          <span className="text-red-400">{error}</span>
        ) : (
          <span>{latest?.message || 'Initializing Glass Studio…'}</span>
        )}
      </div>

      {/* Download button */}
      {finalUrl && (
        <a
          href={finalUrl}
          download
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-500 active:scale-95"
        >
          <Download size={18}/>
          DOWNLOAD {durationMin}-MIN VIDEO
        </a>
      )}

      {!running && !finalUrl && (
        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-11 w-full rounded-xl border border-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/5"
        >
          Close Studio
        </button>
      )}
    </div>
  </section>
}
