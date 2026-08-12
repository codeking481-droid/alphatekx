import { Check, Download, Film, LoaderCircle, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

type ProVideoEvent = {
  step?: number
  jobId?: string
  message?: string
  error?: string
  phase?: string
  final?: boolean
  result?: any
}

type Props = { prompt: string; duration?: number; colorGrade?: string; youtubeUpload?: boolean; scheduleDurationDays?: number; onClose?: () => void }

export default function ProVideoBuildContainer({ prompt, duration = 600, colorGrade = 'vibrant', youtubeUpload = true, scheduleDurationDays = 7, onClose }: Props) {
  const [events, setEvents] = useState<ProVideoEvent[]>([])
  const [running, setRunning] = useState(true)
  const [finalResult, setFinalResult] = useState<any>(null)
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const controller = new AbortController()

    const start = async () => {
      try {
        const response = await fetch('/api/alpha/pro-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ prompt, duration, colorGrade, youtubeUpload, scheduleDurationDays }),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) throw new Error('Pro video studio could not start.')

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
            const line = packet.split('\n').find((entry) => entry.startsWith('data: '))
            if (!line) continue

            try {
              const event = JSON.parse(line.slice(6)) as ProVideoEvent
              setEvents((current) => [...current.slice(-24), event])

              if (event.result) {
                setFinalResult(event.result)
                setRunning(false)
              }
              if (event.phase === 'failed') {
                setError(event.message || 'Pro video production failed.')
                setRunning(false)
              }
            } catch {
              /* ignore incomplete SSE packet */
            }
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Pro video production could not start.')
      } finally {
        setRunning(false)
      }
    }

    void start()
    return () => controller.abort()
  }, [colorGrade, duration, prompt, scheduleDurationDays, youtubeUpload])

  const latest = events.at(-1)
  const steps = ['Script', 'Download', 'Voiceover', 'Advanced Edit', 'Thumbnails', 'Quality Check', 'YouTube Upload', 'Scheduling']
  const currentStep = Math.max(0, Math.min(steps.length - 1, (latest?.step || 0) - 1))

  return (
    <section className="my-4 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-[0_20px_60px_rgba(0,0,0,.38)] sm:rounded-3xl">
      {/* Main Preview Area */}
      <div className="relative aspect-video w-full bg-gradient-to-br from-purple-900/20 to-black">
        {finalResult?.videoUrl ? (
          <video src={finalResult.videoUrl} className="h-full w-full object-cover" controls playsInline />
        ) : (
          <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_50%_30%,rgba(168,85,247,.3),transparent_38%),#08080a]">
            {running ? (
              <div className="flex flex-col items-center gap-2">
                <LoaderCircle className="animate-spin text-purple-400" size={48} />
                <p className="text-sm font-semibold text-white">{steps[currentStep]}</p>
              </div>
            ) : (
              <Film size={48} className="text-white/45" />
            )}
          </div>
        )}

        {running && (
          <div className="absolute inset-0 z-10 flex cursor-not-allowed flex-col items-center justify-center gap-3 bg-black/25 p-6 text-center backdrop-blur-[3px]">
            <Sparkles className="animate-bounce text-purple-400" size={32} />
            <p className="text-sm font-bold text-white">Pro Production Mode</p>
            <p className="max-w-sm text-xs text-white/70">
              Advanced editing • Color grading • Thumbnails • YouTube scheduling...
            </p>
          </div>
        )}
      </div>

      {/* Workflow Progress */}
      <div className="border-t border-white/10 bg-[#101014] p-3 sm:p-4">
        {/* Step Progress */}
        <div className="mb-4 flex gap-1 overflow-x-auto pb-2">
          {steps.map((step, idx) => (
            <div key={idx} className={`flex shrink-0 flex-col items-center gap-1`}>
              <div
                className={`h-10 w-10 rounded-lg border-2 flex items-center justify-center text-xs font-bold transition ${
                  idx < currentStep
                    ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                    : idx === currentStep && running
                      ? 'border-purple-400/70 bg-purple-500/20 text-white animate-pulse'
                      : 'border-white/10 bg-white/[.03] text-white/35'
                }`}
              >
                {idx < currentStep ? <Check size={18} /> : idx + 1}
              </div>
              <span className="max-w-[60px] text-center text-[9px] text-white/50 line-clamp-2">{step}</span>
            </div>
          ))}
        </div>

        {/* Live Message */}
        <div className="mb-3 min-h-10 rounded-xl bg-white/[.035] px-3 py-2 text-xs text-white/70" aria-live="polite">
          {error || latest?.message || 'Initializing Pro Production...'}
        </div>

        {/* Thumbnails Preview */}
        {finalResult?.thumbnails && finalResult.thumbnails.length > 0 && (
          <div className="mb-3">
            <p className="mb-2 text-xs font-semibold text-white/70">Thumbnail Variations</p>
            <div className="flex gap-2 overflow-x-auto">
              {finalResult.thumbnails.map((thumb: any, i: number) => (
                <div key={i} className="shrink-0">
                  <div className="h-12 w-20 rounded-lg border border-purple-400/30 bg-purple-400/10 flex items-center justify-center text-[10px] font-bold text-purple-300">
                    Var {thumb.variation}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Download & YouTube Links */}
        <div className="space-y-2">
          {finalResult?.videoUrl && (
            <a
              href={finalResult.videoUrl}
              download
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-500"
            >
              <Download size={18} />
              DOWNLOAD {Math.round(duration / 60)}-MIN VIDEO
            </a>
          )}

          {finalResult?.schedule && finalResult.schedule.length > 0 && (
            <div className="rounded-xl border border-purple-400/30 bg-purple-400/10 p-3">
              <p className="text-xs font-semibold text-purple-300">📅 7-Day Release Schedule</p>
              <p className="mt-1 text-xs text-white/60">{finalResult.schedule.length} videos scheduled for release</p>
            </div>
          )}

          {!running && !finalResult?.videoUrl && (
            <button
              type="button"
              onClick={onClose}
              className="mt-3 min-h-11 w-full rounded-xl border border-white/10 px-4 text-sm font-semibold text-white hover:bg-white/5"
            >
              Close Studio
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
