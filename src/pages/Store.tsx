import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Star, Trash2, Copy, Edit2, LoaderCircle, Grid3X3, List as ListIcon, Sparkles, Link2, Lightbulb, Code, FileText, Image as ImageIcon, X, Upload } from 'lucide-react'
import { fetchStoreItems, createStoreItem, updateStoreItem, deleteStoreItem, useStoreItem, uploadStoreFile, itemIcon, type StoreItem } from '../lib/store'

const TYPES = ['All', 'snippet', 'prompt', 'image', 'link', 'idea', 'file']

function iconForType(type: StoreItem['type']) {
  switch (type) {
    case 'snippet': return <Code size={16}/>
    case 'prompt': return <Sparkles size={16}/>
    case 'image': return <ImageIcon size={16}/>
    case 'link': return <Link2 size={16}/>
    case 'idea': return <Lightbulb size={16}/>
    case 'file': return <FileText size={16}/>
  }
}

export default function Store() {
  const navigate = useNavigate()
  const [items, setItems] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [sort, setSort] = useState('recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [notice, setNotice] = useState('')
  const [newItem, setNewItem] = useState({ title: '', content: '', type: 'snippet' as StoreItem['type'], tags: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState<StoreItem | null>(null)
  const fileInputRef = { current: null as HTMLInputElement | null }

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    setLoading(true)
    try {
      const data = await fetchStoreItems({ type: typeFilter === 'All' ? undefined : typeFilter, q: query, sort })
      setItems(data.items || [])
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load store') }
    finally { setLoading(false) }
  }

  useEffect(() => { const t = setTimeout(loadItems, 250); return () => clearTimeout(t) }, [query, typeFilter, sort])

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: items.length }
    TYPES.forEach(t => { if (t !== 'All') c[t] = 0 })
    items.forEach(i => { c[i.type] = (c[i.type] || 0) + 1 })
    return c
  }, [items])

  const save = async (input: Partial<StoreItem>) => {
    setSaving(true)
    try {
      if (input.id) await updateStoreItem(input.id, input)
      else await createStoreItem({ ...input, tags: input.tags?.map((t: string) => t.trim()) })
      setNewItem({ title: '', content: '', type: 'snippet', tags: '' })
      setEditing(null)
      await loadItems()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this item?')) return
    try { await deleteStoreItem(id); await loadItems() } catch (error) { setNotice(error instanceof Error ? error.message : 'Delete failed') }
  }

  const copy = async (content: string) => {
    try { await navigator.clipboard.writeText(content); setNotice('Copied!') } catch { setNotice('Copy not supported') }
  }

  const useInBuilder = async (item: StoreItem) => {
    try {
      await useStoreItem(item.id)
      const params = new URLSearchParams()
      if (item.type === 'prompt') params.set('prompt', item.content)
      else if (item.type === 'link') params.set('prompt', `Build an app from this reference: ${item.content}`)
      else params.set('prompt', item.title + '\n' + item.content)
      const prompt = params.get('prompt') || ''
      await navigator.clipboard.writeText(prompt)
      setNotice('Copied to clipboard and added to Builder prompt!')
      navigate(`/builder?${params.toString()}`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not use in builder') }
  }

  const toggleFavorite = async (item: StoreItem) => {
    try { await updateStoreItem(item.id, { isFavorite: !item.isFavorite }); await loadItems() } catch {}
  }

  const quickAdd = async () => {
    if (!newItem.title.trim()) return
    await save({ title: newItem.title, content: newItem.content, type: newItem.type, tags: newItem.tags.split(',').map(t => t.trim()).filter(Boolean) })
  }

  const handleFile = async (file: File) => {
    if (!file) return
    setUploading(true); setNotice('Uploading...')
    try {
      const uploaded = await uploadStoreFile(file)
      const type: StoreItem['type'] = uploaded.mime.startsWith('image/') ? 'image' : 'file'
      await save({ title: newItem.title.trim() || uploaded.name, content: uploaded.url, type, tags: [] })
      setNotice(`Uploaded ${uploaded.name}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Upload failed')
    } finally { setUploading(false) }
  }

  return (
    <div className="min-h-screen p-5 pb-28 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header>
          <h1 className="text-2xl font-bold md:text-3xl">Your second brain</h1>
          <p className="text-sm text-white/55">Dump anything — snippets, prompts, ideas, links — and use it inside Builder.</p>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {TYPES.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-medium ${typeFilter === t ? 'btn-alpha text-white' : 'border border-white/[.12] liquid-glass text-white/70'}`}>
              {t !== 'All' && iconForType(t as StoreItem['type'])} {t === 'All' ? 'All' : t} ({counts[t] || 0})
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/[.12] liquid-glass p-4 md:flex-row md:items-end">
          <label className="flex min-h-12 flex-1 items-center gap-3 rounded-xl border border-white/[.12] bg-background px-4">
            <Search size={16} className="text-white/40"/>
            <input value={query} onChange={e => setQuery(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search your dump..." />
          </label>
          <input value={newItem.title} onChange={e => setNewItem(n => ({ ...n, title: e.target.value }))} className="min-h-12 flex-[2] rounded-xl border border-white/[.12] bg-background px-4 text-sm outline-none" placeholder="Quick dump title" />
          <select value={newItem.type} onChange={e => setNewItem(n => ({ ...n, type: e.target.value as StoreItem['type'] }))} className="min-h-12 rounded-xl border border-white/[.12] bg-background px-3 text-sm outline-none">
            {TYPES.filter(t => t !== 'All').map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input ref={el => fileInputRef.current = el} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); if (fileInputRef.current) fileInputRef.current.value = '' }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex min-h-12 items-center gap-2 rounded-xl border border-white/[.12] bg-white/[0.05] px-4 text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50">
            {uploading ? <LoaderCircle className="animate-spin" size={14}/> : <Upload size={14}/>} Upload
          </button>
          <button onClick={() => void quickAdd()} disabled={saving || !newItem.title.trim()} className="flex min-h-12 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black transition-transform hover:scale-[1.02] disabled:opacity-50">
            {saving ? <LoaderCircle className="animate-spin" size={14}/> : <Plus size={14}/>} Save
          </button>
        </div>

        {editing && (
          <div className="mt-5 rounded-2xl border border-white/[.12] liquid-glass p-4">
            <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">Edit item</span><button onClick={() => setEditing(null)}><X size={16}/></button></div>
            <div className="space-y-3">
              <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className="min-h-11 w-full rounded-xl border border-white/[.12] bg-background px-4 text-sm outline-none" />
              {editing.type === 'image' && <img src={editing.content} alt={editing.title} className="max-h-40 w-full rounded-lg object-cover" />}
              <textarea value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} rows={4} className="w-full rounded-xl border border-white/[.12] bg-background px-4 py-3 text-sm outline-none" />
              <input value={editing.tags.join(', ')} onChange={e => setEditing({ ...editing, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} className="min-h-11 w-full rounded-xl border border-white/[.12] bg-background px-4 text-sm outline-none" placeholder="comma, separated, tags" />
              <button onClick={() => void save(editing)} disabled={saving} className="min-h-11 rounded-xl bg-white px-5 text-sm font-semibold text-black disabled:opacity-50">Save changes</button>
            </div>
          </div>
        )}

        {newItem.title && (
          <div className="mt-3 rounded-xl border border-white/[.12] bg-white/[.04] p-3 text-sm text-white/70">
            <span className="font-medium">Tip:</span> Add content below the title before saving, or keep it as a one-liner.
          </div>
        )}

        {notice && <div className="mt-5 rounded-xl border border-white/[.12] liquid-glass px-4 py-3 text-sm">{notice}</div>}

        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setView('grid')} className={`rounded-lg p-2 ${view === 'grid' ? 'bg-white/10 text-white' : 'text-white/50'}`}><Grid3X3 size={16}/></button>
            <button onClick={() => setView('list')} className={`rounded-lg p-2 ${view === 'list' ? 'bg-white/10 text-white' : 'text-white/50'}`}><ListIcon size={16}/></button>
          </div>
          <select value={sort} onChange={e => setSort(e.target.value)} className="min-h-9 rounded-lg border border-white/[.12] bg-background px-3 text-xs outline-none">
            <option value="recent">Recent</option>
            <option value="most_used">Most used</option>
            <option value="favorites">Favorites</option>
          </select>
        </div>

        {loading ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1,2,3,4,5,6].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/[.08]"/>)}</div>
        ) : items.length ? (
          <div className={`mt-6 grid gap-4 ${view === 'grid' ? 'md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}>
            {items.map(item => (
              <article key={item.id} className="flex flex-col rounded-2xl border border-white/[.12] liquid-glass p-4 transition-all hover:border-indigo-400/30 hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium"><span className="text-white/60">{iconForType(item.type)}</span> {item.title}</div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => void toggleFavorite(item)} className={`rounded-lg p-1.5 ${item.isFavorite ? 'text-amber-400' : 'text-white/40 hover:text-white'}`}><Star size={14} className={item.isFavorite ? 'fill-amber-400' : ''}/></button>
                    <button onClick={() => setEditing(item)} className="rounded-lg p-1.5 text-white/40 hover:text-white"><Edit2 size={14}/></button>
                    <button onClick={() => void remove(item.id)} className="rounded-lg p-1.5 text-white/40 hover:text-red-400"><Trash2 size={14}/></button>
                  </div>
                </div>
                {item.type === 'image' && <img src={item.content} alt={item.title} className="mt-3 max-h-40 w-full rounded-lg object-cover" />}
                {item.type === 'file' && <a href={item.content} download className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/[.12] bg-white/[0.05] px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.08]"><FileText size={12}/> Download file</a>}
                {item.type !== 'image' && item.type !== 'file' && <p className="mt-3 line-clamp-3 whitespace-pre-line text-xs text-white/55">{item.content}</p>}
                {item.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{item.tags.map(t => <span key={t} className="rounded-full bg-white/[.08] px-2 py-0.5 text-[10px] text-white/70">{t}</span>)}</div>}
                <div className="mt-auto flex items-center gap-2 pt-4">
                  <button onClick={() => void copy(item.content)} className="flex min-h-8 items-center gap-1 rounded-lg border border-white/[.12] px-2.5 text-xs transition-colors hover:bg-white/[.04]"><Copy size={12}/> Copy</button>
                  <button onClick={() => useInBuilder(item)} className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg btn-alpha text-xs text-white"><Sparkles size={12}/> Use in Builder</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-12 grid min-h-64 place-items-center rounded-2xl border border-dashed border-white/[.15] liquid-glass text-center">
            <div>
              <h2 className="text-base font-semibold">Your store is empty</h2>
              <p className="mt-2 text-sm text-white/55">Dump your first idea, prompt, or link above.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
