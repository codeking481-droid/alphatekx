import { useEffect, useMemo, useState } from 'react'
import { ArrowUp, Bot, KeyRound, LoaderCircle, Plus, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { createWorker, getWorkers, hydrateWorkers, subscribeWorkers } from '../lib/workerStore'
import { getUserKeys } from '../lib/userSettings'
import { supabase } from '../lib/supabase'
import type { Worker, WorkerRole } from '../lib/types'

const roles: WorkerRole[] = ['coding', 'research', 'marketing', 'support', 'sales', 'business']
const defaultModels = { openai: 'gpt-4o-mini', groq: 'llama-3.3-70b-versatile', anthropic: 'claude-3-5-sonnet-latest', gemini: 'gemini-2.5-flash' } as const

export default function Workers() {
  const [workers, setWorkers] = useState<Worker[]>(getWorkers)
  const [selected, setSelected] = useState<Worker | null>(workers[0] || null)
  const [showCreate, setShowCreate] = useState(workers.length === 0)
  const [form, setForm] = useState({ name: '', role: 'coding' as WorkerRole, purpose: '', instructions: '', provider: 'groq' as keyof typeof defaultModels })
  const [prompt, setPrompt] = useState('')
  const [reply, setReply] = useState('')
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => subscribeWorkers(() => setWorkers(getWorkers())), [])
  useEffect(() => { void hydrateWorkers() }, [])
  const configured = useMemo(() => selected?.provider || 'groq', [selected])

  const create = () => {
    if (!form.name.trim() || !form.purpose.trim()) return setNotice('Give your worker a name and purpose.')
    const worker = createWorker({ ...form, name: form.name.trim(), purpose: form.purpose.trim(), instructions: form.instructions.trim(), model: defaultModels[form.provider] })
    setSelected(worker); setShowCreate(false); setNotice('Worker created. Connect its provider key and test it below.')
  }

  const run = async () => {
    if (!selected || !prompt.trim()) return
    setRunning(true); setNotice(''); setReply('')
    try {
      const keys = await getUserKeys(); const provider = selected.provider || 'groq'; const apiKey = keys[provider]
      if (!apiKey) throw new Error(`Add your ${provider.toUpperCase()} API key in API Keys first.`)
      const session = (await supabase?.auth.getSession()).data.session
      const response = await fetch('/api/workers/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ provider, apiKey, model: selected.model || defaultModels[provider], name: selected.name, role: selected.role, purpose: selected.purpose, instructions: selected.instructions, prompt }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Worker could not respond')
      setReply(data.text); setPrompt('')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Worker failed') }
    finally { setRunning(false) }
  }

  return <main className="mx-auto min-h-screen max-w-6xl overflow-x-hidden px-5 py-20"><header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">AI Workers</h1><p className="mt-2 text-sm text-gray-500">Create a specialist assistant and power it with your own AI provider key.</p></div><button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 rounded-lg bg-black px-4 text-sm text-white"><Plus size={17}/>Create worker</button></header>
    <div className="mt-8 grid min-w-0 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]"><aside className="overflow-hidden rounded-xl border border-gray-200 bg-white"><div className="border-b border-gray-100 p-4 text-sm font-medium">Your workers</div>{workers.length===0?<p className="p-5 text-sm text-gray-500">No workers yet.</p>:workers.map(worker=><button key={worker.id} onClick={()=>setSelected(worker)} className={`flex w-full items-center gap-3 border-b border-gray-100 p-4 text-left last:border-0 ${selected?.id===worker.id?'bg-gray-100':'hover:bg-gray-50'}`}><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-black text-white"><Bot size={18}/></span><span className="min-w-0"><strong className="block truncate text-sm">{worker.name}</strong><span className="text-xs capitalize text-gray-500">{worker.role} · {worker.provider || 'groq'}</span></span></button>)}</aside>
      <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-5">{selected?<><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{selected.name}</h2><p className="mt-1 text-sm text-gray-500">{selected.purpose}</p></div><span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs capitalize">{configured}</span></div><div className="mt-6 min-h-64 rounded-xl bg-gray-50 p-5">{reply?<p className="whitespace-pre-wrap break-words text-sm leading-7">{reply}</p>:<div className="grid min-h-52 place-items-center text-center"><div><Sparkles className="mx-auto text-gray-300"/><p className="mt-3 text-sm text-gray-500">Ask your worker to complete a focused task.</p></div></div>}</div>{notice&&<p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{notice}</p>}<div className="mt-4 flex items-end gap-2 rounded-xl border border-gray-300 p-2"><textarea value={prompt} onChange={event=>setPrompt(event.target.value)} className="min-h-20 min-w-0 flex-1 resize-none px-2 py-2 text-sm outline-none" placeholder={`Ask ${selected.name}...`}/><button onClick={()=>void run()} disabled={running||!prompt.trim()} className="grid size-11 shrink-0 place-items-center rounded-lg bg-black text-white disabled:opacity-30">{running?<LoaderCircle className="animate-spin" size={17}/>:<ArrowUp size={17}/>}</button></div><Link to="/settings/api-keys" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium"><KeyRound size={16}/>Manage provider keys</Link></>:<div className="grid min-h-96 place-items-center text-sm text-gray-500">Select or create a worker.</div>}</section></div>
    {showCreate&&<div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/30 p-4" onMouseDown={()=>setShowCreate(false)}><section className="w-full max-w-lg rounded-xl bg-white p-6" onMouseDown={event=>event.stopPropagation()}><h2 className="text-xl font-semibold">Create an AI worker</h2><p className="mt-2 text-sm text-gray-500">Define one clear role. You can change provider keys later.</p><div className="mt-5 grid gap-4"><Field label="Name"><input value={form.name} onChange={event=>setForm({...form,name:event.target.value})} className="control" placeholder="Research Assistant"/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Role"><select value={form.role} onChange={event=>setForm({...form,role:event.target.value as WorkerRole})} className="control">{roles.map(role=><option key={role}>{role}</option>)}</select></Field><Field label="AI provider"><select value={form.provider} onChange={event=>setForm({...form,provider:event.target.value as keyof typeof defaultModels})} className="control">{Object.keys(defaultModels).map(provider=><option key={provider}>{provider}</option>)}</select></Field></div><Field label="Purpose"><input value={form.purpose} onChange={event=>setForm({...form,purpose:event.target.value})} className="control" placeholder="Research markets and summarize reliable sources"/></Field><Field label="Instructions"><textarea value={form.instructions} onChange={event=>setForm({...form,instructions:event.target.value})} className="control min-h-28 resize-none" placeholder="Be concise, cite sources, and state uncertainty."/></Field></div><div className="mt-6 flex justify-end gap-2"><button onClick={()=>setShowCreate(false)} className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm">Cancel</button><button onClick={create} className="min-h-11 rounded-lg bg-black px-4 text-sm text-white">Create worker</button></div></section></div>}
  </main>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-sm font-medium">{label}</span><div className="mt-2">{children}</div></label> }
