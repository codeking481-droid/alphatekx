import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, CheckCircle2, FileVideo2, Image, LoaderCircle, Play, Trash2, UploadCloud, X } from 'lucide-react'
import { getCredits } from '../lib/creditStore'
import { createSmartImage, deleteMedia, listMedia, publishMedia, updateMedia, uploadMedia, type MediaItem } from '../lib/mediaLibrary'

const MAX_FILES = 20
const MAX_BYTES = 500 * 1024 * 1024

export default function MediaLibrary() {
  const input = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [notice, setNotice] = useState('')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [setupRequired, setSetupRequired] = useState(false)
  const [imagePrompt, setImagePrompt] = useState('')
  const [startDate, setStartDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  const [time, setTime] = useState('09:00')

  const load = async () => {
    setLoading(true)
    try {
      const response = await listMedia()
      setItems(response.items)
      setSetupRequired(response.setupRequired === true)
      setNotice(response.setupRequired ? 'Media Library is being prepared. Uploading will become available as soon as storage setup finishes.' : '')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load your Media Library.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const counts = useMemo(() => ({
    videos: items.filter(item => item.file_type === 'video').length,
    images: items.filter(item => item.file_type === 'image').length,
    scheduled: items.filter(item => item.status === 'scheduled').length,
    published: items.filter(item => item.status === 'published').length,
  }), [items])

  const addFiles = async (files: FileList | File[]) => {
    const batch = [...files].slice(0, MAX_FILES)
    const invalid = batch.find(file => file.size > MAX_BYTES || !/^(video\/(mp4|webm|quicktime)|image\/(jpeg|png|webp))$/.test(file.type))
    if (invalid) {
      setNotice(`${invalid.name} is not a supported MP4, WebM, MOV, JPEG, PNG, or WebP file under 500MB.`)
      return
    }
    setBusy(true)
    setNotice('')
    try {
      for (let index = 0; index < batch.length; index += 1) {
        const file = batch[index]
        const created = await uploadMedia(file, percent => setProgress(`Uploading ${index + 1}/${batch.length}: ${percent}%`))
        setItems(current => [created, ...current])
      }
      setNotice(`${batch.length} file${batch.length === 1 ? '' : 's'} uploaded securely.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Upload failed. No incomplete item was added.') }
    finally { setBusy(false); setProgress('') }
  }

  const remove = async (item: MediaItem) => {
    if (!window.confirm(`Delete ${item.title || item.file_name}? This removes the stored file.`)) return
    setBusy(true)
    try {
      await deleteMedia(item.id)
      setItems(current => current.filter(entry => entry.id !== item.id))
      setNotice('Media deleted.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Delete failed.') }
    finally { setBusy(false) }
  }

  const publishNow = async (item: MediaItem) => {
    if (!window.confirm(`Publish ${item.title || item.file_name} to your connected YouTube account now? One credit is charged only after YouTube confirms the video ID.`)) return
    setBusy(true)
    setNotice('Alpha is securely sending your video to YouTube…')
    try {
      const result = await publishMedia(item.id)
      setItems(current => current.map(entry => entry.id === item.id ? {
        ...entry, status: 'published', provider_id: result.providerId, published_at: new Date().toISOString(),
      } : entry))
      setNotice(`Published successfully. YouTube video ID: ${result.providerId}`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'YouTube publication failed. No credit was charged.') }
    finally { setBusy(false) }
  }

  const scheduleReady = async () => {
    const ready = items.filter(item => item.file_type === 'video' && item.status === 'ready')
    if (!ready.length) { setNotice('Upload at least one ready video first.'); return }
    const credits = getCredits()
    const count = Math.min(ready.length, credits)
    if (count <= 0) { setNotice('You need at least 1 credit before scheduling a video.'); return }
    if (ready.length > credits && !window.confirm(`${credits} credits can cover ${credits} of ${ready.length} videos. Schedule only those ${credits} now?`)) return
    setBusy(true)
    try {
      const [hour, minute] = time.split(':').map(Number)
      const base = new Date(`${startDate}T00:00:00`)
      for (let index = 0; index < count; index += 1) {
        const date = new Date(base)
        date.setDate(date.getDate() + index)
        date.setHours(hour, minute, 0, 0)
        const response = await updateMedia(ready[index].id, {
          status: 'scheduled',
          scheduled_for: date.toISOString(),
          platform_target: ['youtube'],
        })
        setItems(current => current.map(item => item.id === response.item.id ? response.item : item))
      }
      setScheduleOpen(false)
      setNotice(`${count} video${count === 1 ? '' : 's'} added to the daily YouTube queue. Credits are charged only after confirmed publication.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not schedule the vault.') }
    finally { setBusy(false) }
  }

  const generateImage = async () => {
    const prompt = imagePrompt.trim()
    if (!prompt) { setNotice('Describe the image you want Alpha to create.'); return }
    setBusy(true)
    setNotice('Alpha is creating your premium image…')
    try {
      const result = await createSmartImage(prompt, prompt, 'social')
      if (!result.image_url || !result.image_storage_path) throw new Error('The image provider did not return a verified saved image.')
      await load()
      setImagePrompt('')
      setNotice('Premium image created, verified, and saved to your Media Library.')
    } catch (error) {
      setNotice(error instanceof Error ? `${error.message} You can retry safely.` : 'Image generation needs another try. Nothing was charged.')
    } finally { setBusy(false) }
  }

  return <main className="mx-auto min-h-[calc(100dvh-8rem)] w-full min-w-0 max-w-6xl overflow-x-hidden bg-violet-500/10 px-4 pb-28 pt-7 text-white sm:px-6 sm:py-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[.18em] text-violet-300">Content vault</p><h1 className="mt-2 text-3xl font-black">Your Media Library</h1><p className="mt-2 max-w-2xl text-sm font-semibold text-slate-400">Upload up to 20 videos at once. Alpha keeps the files private and prepares an honest publishing queue.</p></div>
      <button onClick={() => setScheduleOpen(true)} disabled={setupRequired} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#6D28D9] px-5 text-sm font-black text-white shadow-lg shadow-violet-200 disabled:opacity-50 sm:w-auto"><CalendarClock size={17}/>Drip schedule</button>
    </header>

    <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Object.entries(counts).map(([label, value]) => <article key={label} className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></article>)}
    </section>

    {notice && <div role="status" className="mt-5 rounded-xl border border-violet-200 bg-violet-500/10 p-3 text-sm font-bold text-white">{notice}</div>}

    <section className="mt-6 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm font-black text-white">Generate image with Alpha
          <span className="mt-1 block text-xs font-semibold text-slate-400">Describe the scene. Alpha creates, verifies, and saves a private 1024×1024 image.</span>
          <input value={imagePrompt} onChange={event => setImagePrompt(event.target.value)} placeholder="e.g. thrift gown in Lagos, premium editorial photograph" className="field mt-3" disabled={busy || setupRequired}/>
        </label>
        <button onClick={() => void generateImage()} disabled={busy || setupRequired || !imagePrompt.trim()} className="btn-alpha min-h-12 shrink-0 rounded-xl px-5 text-sm font-black disabled:opacity-50">{busy ? 'Alpha is creating…' : 'Generate image'}</button>
      </div>
      {busy && <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5"><div className="skeleton h-full w-full"/></div>}
    </section>

    <button
      onClick={() => input.current?.click()}
      onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); void addFiles(event.dataTransfer.files) }}
      disabled={busy || setupRequired}
      className="mt-6 grid min-h-44 w-full place-items-center rounded-2xl border-2 border-dashed border-violet-300 bg-[#0A0F1E] p-6 text-center transition hover:border-[#6D28D9] disabled:opacity-60"
    >
      {busy ? <LoaderCircle className="animate-spin text-violet-300" size={32}/> : <UploadCloud className="text-violet-300" size={34}/>}
      <span className="mt-3 block font-black">{progress || 'Drop up to 20 videos or images here'}</span>
      <span className="mt-1 block text-xs font-semibold text-slate-400">MP4, WebM, MOV, JPEG, PNG or WebP · 500MB maximum per file</span>
    </button>
    <input ref={input} type="file" multiple accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp" className="hidden" onChange={event => event.target.files && void addFiles(event.target.files)}/>

    {loading ? <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3].map(value => <div key={value} className="h-64 animate-pulse rounded-2xl bg-blue-500/10"/>)}</section> :
      items.length === 0 ? <section className="mt-7 rounded-2xl border border-violet-400/20 bg-blue-500/10 p-10 text-center"><FileVideo2 className="mx-auto text-slate-400"/><h2 className="mt-3 font-black">Your vault is ready</h2><p className="mt-1 text-sm font-semibold text-slate-400">Upload your first file to begin.</p></section> :
      <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(item => <article key={item.id} className="overflow-hidden rounded-2xl border border-violet-400/20 bg-violet-500/10 shadow-sm">
        <div className="relative grid aspect-video place-items-center bg-blue-500/10">
          {item.file_type === 'image' && item.file_url ? <img src={item.file_url} alt="" className="h-full w-full object-cover"/> : item.file_url ? <video src={item.file_url} className="h-full w-full object-cover" preload="metadata"/> : item.file_type === 'video' ? <FileVideo2 className="text-slate-400"/> : <Image className="text-slate-400"/>}
          <span className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${item.status === 'published' ? 'border-emerald-200 bg-emerald-500/10 text-emerald-300' : item.status === 'scheduled' ? 'border-violet-200 bg-violet-500/10 text-violet-200' : 'border-violet-400/20 bg-violet-500/10 text-slate-400'}`}>{item.status}</span>
        </div>
        <div className="p-4"><h2 className="truncate font-black">{item.title || item.file_name}</h2><p className="mt-1 text-xs font-semibold text-slate-400">{(item.file_size / 1048576).toFixed(1)}MB {item.scheduled_for ? `· ${new Date(item.scheduled_for).toLocaleString()}` : ''}</p><div className="mt-4 flex flex-wrap gap-2">{item.file_url && <a href={item.file_url} target="_blank" rel="noreferrer" className="action bg-violet-500/10 text-slate-400"><Play size={15}/>Preview</a>}{item.file_type === 'video' && ['ready', 'failed'].includes(item.status) && <button onClick={() => void publishNow(item)} disabled={busy} className="action bg-[#6D28D9] text-white"><UploadCloud size={15}/>Publish now</button>}<button onClick={() => void remove(item)} disabled={busy} className="action bg-violet-500/10 text-rose-300"><Trash2 size={15}/>Delete</button></div></div>
      </article>)}</section>}

    {scheduleOpen && <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/35 sm:place-items-center" onClick={() => setScheduleOpen(false)}><section className="w-full rounded-t-3xl bg-violet-500/10 p-6 text-white shadow-2xl sm:max-w-md sm:rounded-3xl" onClick={event => event.stopPropagation()}><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Daily YouTube queue</h2><p className="mt-1 text-sm font-semibold text-slate-400">One ready video per day · Africa/Lagos</p></div><button onClick={() => setScheduleOpen(false)} className="grid size-10 place-items-center rounded-full bg-blue-500/10"><X size={18}/></button></div><div className="mt-6 grid gap-4"><label className="text-sm font-bold">Start date<input type="date" value={startDate} min={new Date().toISOString().slice(0,10)} onChange={event => setStartDate(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-violet-400/20 px-3 text-white"/></label><label className="text-sm font-bold">Time<input type="time" value={time} onChange={event => setTime(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-violet-400/20 px-3 text-white"/></label><div className="rounded-xl border border-emerald-200 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-300"><CheckCircle2 className="mr-1 inline" size={15}/>No credits are charged while scheduling. Each confirmed publication costs one credit.</div><button onClick={() => void scheduleReady()} disabled={busy} className="min-h-12 rounded-xl bg-[#6D28D9] px-5 font-black text-white disabled:opacity-50">{busy ? 'Scheduling…' : 'Confirm queue'}</button></div></section></div>}
  </main>
}
