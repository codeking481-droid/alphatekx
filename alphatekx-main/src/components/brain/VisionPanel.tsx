import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Trash2, Upload, X } from 'lucide-react'
import { postJson } from '../../lib/apiClient'

const MAX_SIZE_MB = 5
const ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/gif'

export default function VisionPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const loadImage = useCallback((selected: File) => {
    setError('')
    if (!ACCEPT.split(',').includes(selected.type)) { setError('Only PNG, JPG, WebP and GIF images are supported.'); return }
    if (selected.size > MAX_SIZE_MB * 1024 * 1024) { setError(`File is too large. Max ${MAX_SIZE_MB}MB.`); return }
    setFile(selected)
    const reader = new FileReader()
    reader.onload = () => setPreview(String(reader.result || ''))
    reader.readAsDataURL(selected)
  }, [])

  const remove = () => { setFile(null); setPreview(''); setResult(null); setError(''); setQuestion('') }

  const analyze = async () => {
    if (!preview) return
    setBusy(true); setError(''); setResult(null)
    try {
      const payload: Record<string, unknown> = { image: preview }
      if (question.trim()) payload.question = question.trim()
      const data = await postJson<Record<string, unknown>>('/api/brain/vision', payload)
      setResult(data)
      if (!data.extractedText && !data.extracted_text && !data.documentType && !data.document_type && !data.suggestedAction && !data.answer) {
        setError('The vision model returned an empty response. Please try a clearer image or add a question.')
      }
    } catch (err: any) { setError(err.message || 'Image analysis failed.') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = e.clipboardData?.files?.[0]
      if (item && item.type.startsWith('image/')) loadImage(item)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [loadImage])

  const drop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const item = e.dataTransfer.files?.[0]
    if (item && item.type.startsWith('image/')) loadImage(item)
    else setError('Only image files can be dropped here.')
  }

  const openCamera = () => cameraRef.current?.click()
  const handleCamera = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) loadImage(f)
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium"><Camera size={18} className="text-indigo-400"/>Vision to Action</h2>
      <p className="mt-1 text-sm text-white/55">Upload, paste, drag, or capture an image. Alpha extracts text, describes UI, finds errors, and suggests actions.</p>

      {!preview ? (
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={drop}
          onClick={() => fileRef.current?.click()}
          className={`mt-4 grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 bg-black/20 hover:border-white/30'}`}
        >
          <ImagePlus size={32} className="text-white/40" />
          <p className="mt-3 text-sm text-white/70">Drop an image, click to upload, or paste one (Ctrl+V)</p>
          <p className="mt-1 text-xs text-white/40">PNG, JPG, WebP, GIF up to {MAX_SIZE_MB}MB</p>
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) loadImage(f) }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCamera} />
          <button onClick={e => { e.stopPropagation(); openCamera() }} className="mt-4 flex items-center gap-2 rounded-lg border border-white/[.12] px-4 py-2 text-xs transition hover:bg-white/[0.06]"><Camera size={14}/> Use camera</button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <img src={preview} alt="Preview" className="max-h-[400px] w-full object-contain" />
            <button onClick={remove} className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-black/60 text-white/80 backdrop-blur"><X size={16}/></button>
          </div>
          <input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && !busy && analyze()} placeholder="Ask about this image (e.g. 'Find bugs', 'Read text', 'Describe UI')" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm outline-none focus:border-indigo-500" />
          <button onClick={analyze} disabled={busy} className="flex min-h-11 items-center gap-2 rounded-xl btn-alpha px-5 text-sm text-white disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={16}/> : <Upload size={16}/>} Analyze</button>
        </div>
      )}

      {error && <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}

      {result && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
          <p className="font-medium text-indigo-300">Document type: {String(result.documentType || result.document_type || 'unknown')}</p>
          <p className="mt-2 whitespace-pre-wrap text-white/80">{String(result.extractedText || result.extracted_text || result.answer || result.suggestedAction || result.suggested_action || '')}</p>
          {result.suggestedAction && <p className="mt-3 text-xs text-white/60">Suggested action: {String(result.suggestedAction)}</p>}
          {result.error && <p className="mt-2 text-rose-300">Error: {String(result.error)}</p>}
        </div>
      )}
    </section>
  )
}
