import { useEffect, useRef } from 'react'

type ScanningOverlayProps = {
  active: boolean
  target: string
  progress: number
  message: string
  soundEnabled: boolean
  onToggleSound: () => void
}

type Grain = {
  x: number
  y: number
  speed: number
  size: number
  drift: number
  alpha: number
}

const GRAIN_COUNT = 260
const MESH_Y = 0.46

// Sand grains fall through a filter mesh: the mesh line is the scan head, and grains
// that pass it are "sifted" findings.
function createGrain(width: number, height: number, seeded = false): Grain {
  return {
    x: Math.random() * width,
    y: seeded ? Math.random() * height : -Math.random() * height * 0.4,
    speed: 40 + Math.random() * 120,
    size: 0.6 + Math.random() * 1.8,
    drift: (Math.random() - 0.5) * 18,
    alpha: 0.25 + Math.random() * 0.6,
  }
}

export default function ScanningOverlay({ active, target, progress, message, soundEnabled, onToggleSound }: ScanningOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (active && soundEnabled) {
      audio.loop = true
      audio.volume = 0.35
      audio.play().catch(() => {
        // Autoplay can be blocked until the user interacts; the toggle re-triggers it.
      })
    } else {
      audio.pause()
      audio.currentTime = 0
    }
  }, [active, soundEnabled])

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    let frame = 0
    let grains: Grain[] = []
    let lastTime = performance.now()

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(width * ratio))
      canvas.height = Math.max(1, Math.floor(height * ratio))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      grains = Array.from({ length: GRAIN_COUNT }, () => createGrain(width, height, true))
    }

    resize()
    window.addEventListener('resize', resize)

    const render = (now: number) => {
      const { width, height } = canvas.getBoundingClientRect()
      const delta = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now

      context.clearRect(0, 0, width, height)

      const meshY = height * MESH_Y
      const gradient = context.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, 'rgba(124,58,237,0.10)')
      gradient.addColorStop(0.5, 'rgba(10,10,20,0)')
      gradient.addColorStop(1, 'rgba(56,189,248,0.10)')
      context.fillStyle = gradient
      context.fillRect(0, 0, width, height)

      context.strokeStyle = 'rgba(148,163,255,0.16)'
      context.lineWidth = 1
      for (let x = 0; x < width; x += 9) {
        context.beginPath()
        context.moveTo(x, meshY)
        context.lineTo(x, meshY + 6)
        context.stroke()
      }
      context.strokeStyle = 'rgba(167,139,250,0.5)'
      context.beginPath()
      context.moveTo(0, meshY)
      context.lineTo(width, meshY)
      context.stroke()

      for (const grain of grains) {
        grain.y += grain.speed * delta
        grain.x += Math.sin((grain.y + frame) / 40) * grain.drift * delta

        const passedMesh = grain.y > meshY
        context.beginPath()
        context.fillStyle = passedMesh
          ? `rgba(56,189,248,${grain.alpha * 0.85})`
          : `rgba(226,214,255,${grain.alpha})`
        context.arc(grain.x, grain.y, passedMesh ? grain.size * 0.8 : grain.size, 0, Math.PI * 2)
        context.fill()

        if (grain.y > height + 10) Object.assign(grain, createGrain(width, height))
      }

      frame += 1
      animation = requestAnimationFrame(render)
    }

    let animation = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(animation)
      window.removeEventListener('resize', resize)
    }
  }, [active])

  if (!active) {
    return <audio ref={audioRef} src="/sounds/filter-sand.mp3" preload="auto" className="hidden" />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A14]/95 backdrop-blur-sm">
      <audio ref={audioRef} src="/sounds/filter-sand.mp3" preload="auto" className="hidden" />
      <div className="relative flex w-full max-w-3xl flex-col items-center px-6">
        <canvas ref={canvasRef} className="absolute inset-x-0 top-0 h-[420px] w-full opacity-90" />

        <div className="relative mt-[120px] w-full rounded-[28px] border border-violet-400/20 bg-[#0A0A14]/80 p-8 text-center shadow-[0_40px_120px_rgba(76,29,149,0.35)]">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-violet-300">Alpha is sifting your site</p>
          <h2 className="mt-4 break-all text-2xl font-black tracking-[-0.04em] text-white">{target}</h2>
          <p className="mt-3 min-h-[24px] text-sm text-slate-300">{message}</p>

          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-400 to-cyan-400 transition-[width] duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <div className="mt-3 text-xs font-black tracking-[0.18em] text-slate-400">{Math.round(progress)}%</div>

          <button
            type="button"
            onClick={onToggleSound}
            className="mt-6 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-300 transition hover:border-violet-300/40 hover:text-white"
          >
            {soundEnabled ? 'Sound on' : 'Sound off'}
          </button>
        </div>
      </div>
    </div>
  )
}
