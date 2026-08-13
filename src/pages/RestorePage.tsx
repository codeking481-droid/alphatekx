import { useRef, useState } from 'react'
import { Film, UploadCloud, Wand2, Video, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const modes = ['Heal Broken', 'Short to Long', 'Long to Short'] as const

export default function RestorePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [mode, setMode] = useState<(typeof modes)[number]>('Heal Broken')
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(18)
  const [isRunning, setIsRunning] = useState(false)

  const handleRestore = () => {
    if (!selectedFile) {
      fileInputRef.current?.click()
      return
    }

    setIsRunning(true)
    const interval = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(current + 13, 100)
        if (next >= 100) {
          window.clearInterval(interval)
          setIsRunning(false)
          navigate('/active-automations')
        }
        return next
      })
    }, 500)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setSelectedFile(file)
    if (file) {
      setProgress(18)
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 text-white sm:px-6 lg:py-14">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Alpha restore</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">Restore My Video — Heal My Broken Video</h1>
        </div>
        <button type="button" className="btn-primary" onClick={handleRestore}>Restore to World-Class</button>
      </header>

      <section className="mt-8 rounded-[30px] border border-white/10 bg-[#0F1013] p-5 shadow-[0_28px_70px_rgba(0,0,0,0.18)]">
        <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
        <div
          className={`relative rounded-[28px] border border-dashed p-5 transition ${isDragging ? 'border-cyan-300 bg-cyan-500/5' : 'border-white/10 bg-white/[0.02]'}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => { event.preventDefault(); setIsDragging(false); const file = event.dataTransfer.files?.[0] ?? null; if (file) setSelectedFile(file) }}
        >
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <span className="grid size-16 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-300 shadow-[0_18px_34px_rgba(34,211,238,0.16)]">
              <UploadCloud size={32} />
            </span>
            <div>
              <p className="text-xl font-black text-white">{selectedFile ? 'Video selected for restoration' : 'Drop a broken video'}</p>
              <p className="mt-2 text-sm text-slate-400">
                {selectedFile ? selectedFile.name : 'MP4, MOV, or WebM — no style-learning required.'}
              </p>
            </div>
            <button type="button" className="btn-primary" onClick={(event) => { event.stopPropagation(); fileInputRef.current?.click() }}>
              {selectedFile ? 'Choose another file' : 'Choose file'}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[28px] border border-white/10 bg-[#0F1013] p-5 shadow-[0_28px_70px_rgba(0,0,0,0.18)]">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Repair mode</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {modes.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${mode === item ? 'border-cyan-300/40 bg-cyan-500/10 text-white' : 'border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20'}`}
            >
              <div className="flex items-center gap-2">
                {item === 'Heal Broken' ? <Wand2 size={18} className="text-cyan-300" /> : item === 'Short to Long' ? <Video size={18} className="text-cyan-300" /> : <Film size={18} className="text-cyan-300" />}
                <span className="font-black">{item}</span>
              </div>
              <p className="mt-3 text-sm text-slate-400">
                {item === 'Heal Broken' ? 'Clean rough edits and rebuild flow.' : item === 'Short to Long' ? 'Expand a short clip into a full story.' : 'Trim and repackage long footage into a tighter version.'}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[30px] border border-white/10 bg-[#0D0E12] p-5 shadow-[0_28px_70px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Processing</p>
            <h2 className="mt-2 text-xl font-black text-white">{isRunning ? 'Restoring to world-class' : 'Queued for restoration'}</h2>
          </div>
          <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-cyan-300">{progress}%</span>
        </div>

        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-violet-500 to-emerald-400 transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={handleRestore} className="btn-primary">{isRunning ? 'Restoring…' : 'Restore to World-Class'}</button>
          <button type="button" className="btn-primary">4K no watermark</button>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-slate-300">
          <div className="flex items-center gap-2 font-black text-white"><Zap size={16} className="text-cyan-300" /> Output policy</div>
          <p className="mt-2">Free restores keep a subtle watermark at 720p. Paid plans unlock 4K output without watermark and direct handoff to Media Library and History.</p>
        </div>
      </section>
    </main>
  )
}
