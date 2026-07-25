import { useEffect, useMemo, useState } from 'react'
import { ArrowUp, Bot, KeyRound, LoaderCircle, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { createWorker, deleteWorker, getWorkers, hydrateWorkers, subscribeWorkers, updateWorkerMemory } from '../lib/workerStore'
import { postJson } from '../lib/apiClient'
import { supabase } from '../lib/supabase'
import type { Worker, WorkerRole } from '../lib/types'

const roles: WorkerRole[] = ['coding', 'research', 'marketing', 'support', 'sales', 'business']
const defaultModels = { openai: 'gpt-4o-mini', groq: 'llama-3.3-70b-versatile', anthropic: 'claude-3-5-sonnet-latest', gemini: 'gemini-2.5-flash' } as const

export default function Workers() {
  const initial = getWorkers()
  const [workers, setWorkers] = useState<Worker[]>(initial)
  const [selectedId, setSelectedId] = useState(initial[0]?.id || '')
  const selected = useMemo(() => workers.find(worker => worker.id === selectedId) || workers[0] || null, [workers, selectedId])
  const [showCreate, setShowCreate] = useState(initial.length === 0)
  const [form, setForm] = useState({ name: '', role: 'coding' as WorkerRole, purpose: '', instructions: '', provider: 'groq' as keyof typeof defaultModels })
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => subscribeWorkers(() => setWorkers(getWorkers())), [])
  useEffect(() => { void hydrateWorkers().catch(error => setNotice(error instanceof Error ? error.message : 'Could not load workers.')) }, [])

  const create = async () => {
    if (!form.name.trim() || !form.purpose.trim()) return setNotice('Give your worker a name and purpose.')
    setCreating(true); setNotice('')
    try {
      const worker = await createWorker({ ...form, name: form.name.trim(), purpose: form.purpose.trim(), instructions: form.instructions.trim(), model: defaultModels[form.provider] })
      setSelectedId(worker.id); setShowCreate(false); setForm({ name: '', role: 'coding', purpose: '', instructions: '', provider: 'groq' }); setNotice('Worker created. Connect its provider key, then give it a task.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Worker could not be created.') }
    finally { setCreating(false) }
  }

  const run = async () => {
    if (!selected || !prompt.trim()) return
    setRunning(true); setNotice('')
    try {
      const session = (await supabase?.auth.getSession()).data.session
      const data = await postJson<{ text: string; memory: string[] }>('/api/workers/run', { workerId: selected.id, prompt: prompt.trim() }, { token: session?.access_token, timeoutMs: 90_000 })
      updateWorkerMemory(selected.id, data.memory || [...selected.memory, `User: ${prompt.trim()}`, `Worker: ${data.text}`])
      setPrompt('')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Worker failed.') }
    finally { setRunning(false) }
  }

  const remove = async () => {
    if (!selected || !window.confirm(`Delete ${selected.name}?`)) return
    try { await deleteWorker(selected.id); setSelectedId(''); setNotice('Worker deleted.') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Worker could not be deleted.') }
  }

  return <main className="mx-auto min-h-screen max-w-6xl overflow-x-hidden px-5 py-12 sm:py-16">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">AI Workers</h1><p className="mt-2 text-sm text-white/55">Create a specialist that follows your instructions and remembers recent conversations.</p></div><button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 rounded-lg btn-alpha px-4 text-sm text-white"><Plus size={17}/>Create worker</button></header>
    <div className="mt-8 grid min-w-0 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-xl border border-white/[.12] liquid-glass"><div className="border-b border-white/10 p-4 text-sm font-medium">Your workers</div>{workers.length === 0 ? <p className="p-5 text-sm text-white/55">No workers yet. Create one to begin.</p> : workers.map(worker => <button key={worker.id} onClick={() => setSelectedId(worker.id)} className={`flex w-full items-center gap-3 border-b border-white/10 p-4 text-left last:border-0 ${selected?.id === worker.id ? 'bg-white/[.08]' : 'hover:bg-white/[.04]'}`}><span className="grid size-10 shrink-0 place-items-center rounded-lg btn-alpha text-white"><Bot size={18}/></span><span className="min-w-0"><strong className="block truncate text-sm">{worker.name}</strong><span className="text-xs capitalize text-white/55">{worker.role} / {worker.provider || 'groq'}</span></span></button>)}</aside>
      <section className="min-w-0 rounded-xl border border-white/[.12] liquid-glass p-4 sm:p-5">{selected ? <><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{selected.name}</h2><p className="mt-1 text-sm text-white/55">{selected.purpose}</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-white/[.08] px-3 py-1.5 text-xs capitalize">{selected.provider || 'groq'}</span><button onClick={() => void remove()} className="grid size-11 place-items-center rounded-lg border border-white/[.15]" aria-label="Delete worker"><Trash2 size={16}/></button></div></div>
        <div className="mt-5 min-h-72 space-y-3 rounded-xl bg-white/[.04] p-3 sm:p-5">{selected.memory.length ? selected.memory.map((message, index) => { const fromUser = message.startsWith('User:'); return <div key={`${index}-${message.slice(0, 12)}`} className={`flex ${fromUser ? 'justify-end' : 'justify-start'}`}><p className={`max-w-[90%] whitespace-pre-wrap break-words rounded-xl px-4 py-3 text-sm leading-6 ${fromUser ? 'btn-alpha text-white' : 'border border-white/[.12] liquid-glass'}`}>{message.replace(/^(User|Worker):\s*/, '')}</p></div> }) : <div className="grid min-h-60 place-items-center text-center"><div><Sparkles className="mx-auto text-white/35"/><p className="mt-3 text-sm text-white/55">Ask your worker to complete a focused task.</p></div></div>}</div>
        {notice && <p role="status" className="mt-4 rounded-lg bg-white/[.04] p-3 text-sm text-white/80">{notice}</p>}
        <div className="mt-4 flex items-end gap-2 rounded-xl border border-white/[.15] p-2 focus-within:border-[#E56B2D]"><textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void run() } }} className="min-h-20 min-w-0 flex-1 resize-none px-2 py-2 text-sm outline-none" placeholder={`Ask ${selected.name}...`}/><button onClick={() => void run()} disabled={running || !prompt.trim()} className="grid size-11 shrink-0 place-items-center rounded-lg btn-alpha text-white disabled:opacity-30" aria-label="Send task">{running ? <LoaderCircle className="animate-spin" size={17}/> : <ArrowUp size={17}/>}</button></div>
        <Link to="/settings/api-keys" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium"><KeyRound size={16}/>Manage provider keys</Link></> : <div className="grid min-h-96 place-items-center text-sm text-white/55">Create a worker to begin.</div>}</section>
    </div>
    {showCreate && <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/50 p-4" onMouseDown={() => !creating && setShowCreate(false)}><section className="w-full max-w-lg rounded-xl liquid-glass p-6" onMouseDown={event => event.stopPropagation()}><h2 className="text-xl font-semibold">Create an AI worker</h2><p className="mt-2 text-sm text-white/55">Choose its job, provider, and clear operating instructions.</p><div className="mt-5 grid gap-4"><Field label="Name"><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="control" placeholder="Research Assistant"/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Role"><select value={form.role} onChange={event => setForm({ ...form, role: event.target.value as WorkerRole })} className="control">{roles.map(role => <option key={role}>{role}</option>)}</select></Field><Field label="AI provider"><select value={form.provider} onChange={event => setForm({ ...form, provider: event.target.value as keyof typeof defaultModels })} className="control">{Object.keys(defaultModels).map(provider => <option key={provider}>{provider}</option>)}</select></Field></div><Field label="Purpose"><input value={form.purpose} onChange={event => setForm({ ...form, purpose: event.target.value })} className="control" placeholder="Research markets and summarize reliable sources"/></Field><Field label="Instructions"><textarea value={form.instructions} onChange={event => setForm({ ...form, instructions: event.target.value })} className="control min-h-28 resize-none" placeholder="Be concise, cite sources, and state uncertainty."/></Field></div>{notice && <p className="mt-4 rounded-lg bg-white/[.04] p-3 text-sm">{notice}</p>}<div className="mt-6 flex justify-end gap-2"><button onClick={() => setShowCreate(false)} disabled={creating} className="min-h-11 rounded-lg border border-white/[.15] px-4 text-sm">Cancel</button><button onClick={() => void create()} disabled={creating} className="flex min-h-11 items-center gap-2 rounded-lg btn-alpha px-4 text-sm text-white disabled:opacity-50">{creating && <LoaderCircle className="animate-spin" size={16}/>}Create worker</button></div></section></div>}
  </main>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-sm font-medium">{label}</span><div className="mt-2">{children}</div></label> }
