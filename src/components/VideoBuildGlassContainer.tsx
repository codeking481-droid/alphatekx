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
}

type Props = { prompt: string; duration?: number; onClose?: () => void }

// This is deliberately a POST-driven stream rather than EventSource: creating a
// video has a prompt body and must carry the current authenticated browser session.
export default function VideoBuildGlassContainer({ prompt, duration = 600, onClose }: Props) {
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
          body: JSON.stringify({ prompt, duration }),
          signal: controller.signal,
        })
        if (!response.ok || !response.body) throw new Error('Alpha could not start the video studio.')
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
              setEvents(current => [...current.slice(-24), event])
              if (event.finalVideoUrl) { setFinalUrl(event.finalVideoUrl); setRunning(false) }
              if (event.phase === 'failed') { setError(event.message || 'Alpha could not finish this video.'); setRunning(false) }
            } catch { /* ignore an incomplete SSE packet */ }
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Video generation could not start.')
      } finally { setRunning(false) }
    }
    void start()
    return () => controller.abort()
  }, [duration, prompt])

  const latest = events.at(-1)
  const clips = useMemo(() => Array.from({ length: Math.max(6, Math.min(20, latest?.clipCount || 20)) }, (_, index) => index), [latest?.clipCount])
  const completeCount = Math.max(0, Math.min(clips.length, (latest?.clipIndex ?? -1) + 1))

  return <section className="my-4 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-[0_20px_60px_rgba(0,0,0,.38)] sm:rounded-3xl">
    <div className="relative aspect-video w-full bg-black">
      {finalUrl ? <video src={finalUrl} className="h-full w-full object-cover" controls playsInline /> : <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_50%_30%,rgba(109,40,217,.3),transparent_38%),#08080a]">
        <Film size={42} className="text-white/45" />
      </div>}
      {running && <div className="absolute inset-0 z-10 flex cursor-not-allowed flex-col items-center justify-center gap-3 bg-black/30 p-6 text-center backdrop-blur-[3px]">
        <LoaderCircle className="animate-spin text-white" size={30}/>
        <p className="text-sm font-bold text-white">AI is editing Scene {Math.min(clips.length, (latest?.clipIndex ?? 0) + 1)}/{clips.length}</p>
        <p className="max-w-sm text-xs text-white/70">Observing mode — Alpha is building the video server-side.</p>
      </div>}
    </div>
    <div className="border-t border-white/10 bg-[#101014] p-3 sm:p-4">
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Video editing timeline">
        {clips.map(index => <div key={index} className={`flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${index < completeCount ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' : index === completeCount && running ? 'border-violet-400/70 bg-violet-500/20 text-white' : 'border-white/10 bg-white/[.03] text-white/35'}`}>
          {index < completeCount ? <Check size={15}/> : String(index + 1).padStart(2, '0')}
        </div>)}
      </div>
      <div className="mt-3 min-h-10 rounded-xl bg-white/[.035] px-3 py-2 text-xs text-white/70" aria-live="polite">{error || latest?.message || 'Preparing Glass Studio…'}</div>
      {finalUrl && <a href={finalUrl} download className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-500"><Download size={18}/>DOWNLOAD {Math.round(duration / 60)}-MIN VIDEO</a>}
      {!running && !finalUrl && <button type="button" onClick={onClose} className="mt-3 min-h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold text-white">Close studio</button>}
    </div>
  </section>
}
