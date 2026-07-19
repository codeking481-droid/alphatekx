import type { Worker, WorkerRole } from './types'
import { supabase } from './supabase'

const KEY = 'alphatekx_workers'
const EVENT = 'alphatekx:workers-change'
let memory: Worker[] = []

function persist(workers: Worker[]) {
  memory = workers
  try { localStorage.setItem(KEY, JSON.stringify(workers)) } catch {}
  window.dispatchEvent(new Event(EVENT))
}

export function getWorkers(): Worker[] {
  try { memory = JSON.parse(localStorage.getItem(KEY) || '[]') as Worker[] } catch {}
  return memory
}

export async function createWorker(input: { name: string; role: WorkerRole; purpose: string; instructions: string; provider?: Worker['provider']; model?: string }) {
  const worker: Worker = { ...input, id: crypto.randomUUID(), memory: [], createdAt: new Date().toISOString() }
  if (!supabase) {
    persist([worker, ...getWorkers().filter(item => item.id !== worker.id)])
    return worker
  }
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Sign in before creating a worker.')
  const { error } = await supabase.from('workers').insert({ id: worker.id, user_id: data.user.id, name: worker.name, role: worker.role, purpose: worker.purpose, instructions: worker.instructions, provider: worker.provider || 'groq', model: worker.model || '', memory: [], created_at: worker.createdAt })
  if (error) {
    persist([worker, ...getWorkers().filter(item => item.id !== worker.id)])
    return worker
  }
  persist([worker, ...getWorkers().filter(item => item.id !== worker.id)])
  return worker
}

export async function deleteWorker(id: string) {
  if (supabase) {
    const { error } = await supabase.from('workers').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }
  persist(getWorkers().filter(worker => worker.id !== id))
}

export function updateWorkerMemory(id: string, workerMemory: string[]) {
  persist(getWorkers().map(worker => worker.id === id ? { ...worker, memory: workerMemory } : worker))
}

export function findMentionedWorker(text: string) {
  const mention = text.match(/@([\w-]+)/)?.[1]?.toLowerCase()
  return mention ? getWorkers().find(worker => worker.name.replace(/\s+/g, '').toLowerCase() === mention) ?? null : null
}

export function subscribeWorkers(listener: () => void) {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

export async function hydrateWorkers() {
  if (!supabase) return
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return
  const { data, error } = await supabase.from('workers').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false })
  if (error) return
  persist((data || []).map(row => ({ id: row.id, name: row.name, role: row.role, purpose: row.purpose, instructions: row.instructions, provider: row.provider || 'groq', model: row.model || '', memory: row.memory ?? [], createdAt: row.created_at })) as Worker[])
}
