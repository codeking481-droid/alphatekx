import type { Worker, WorkerRole } from './types'
import { supabase } from './supabase'

const KEY = 'alphatekx_workers'
const EVENT = 'alphatekx:workers-change'
let memory: Worker[] = []

export function getWorkers(): Worker[] {
  try { memory = JSON.parse(localStorage.getItem(KEY) || '[]') as Worker[] } catch {}
  return memory
}

export function createWorker(input: { name: string; role: WorkerRole; purpose: string; instructions: string; provider?: Worker['provider']; model?: string }) {
  const worker: Worker = { ...input, id: crypto.randomUUID(), memory: [], createdAt: new Date().toISOString() }
  memory = [worker, ...getWorkers()]
  try { localStorage.setItem(KEY, JSON.stringify(memory)) } catch {}
  window.dispatchEvent(new Event(EVENT))
  void cloudUpsertWorker(worker)
  return worker
}

export function findMentionedWorker(text: string) {
  const mention = text.match(/@([\w-]+)/)?.[1]?.toLowerCase()
  return mention ? getWorkers().find((worker) => worker.name.replace(/\s+/g, '').toLowerCase() === mention) ?? null : null
}

export function subscribeWorkers(listener: () => void) {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

async function cloudUpsertWorker(worker: Worker) {
  if (!supabase) return
  const { data } = await supabase.auth.getUser()
  if (!data.user) return
  await supabase.from('workers').upsert({ id: worker.id, user_id: data.user.id, name: worker.name, role: worker.role, purpose: worker.purpose, instructions: worker.instructions, provider: worker.provider || 'groq', model: worker.model || '', memory: worker.memory, created_at: worker.createdAt })
}

export async function hydrateWorkers() {
  if (!supabase) return
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return
  const { data } = await supabase.from('workers').select('*').eq('user_id', auth.user.id).order('created_at', { ascending:false })
  if (!data) return
  memory = data.map((row) => ({ id:row.id, name:row.name, role:row.role, purpose:row.purpose, instructions:row.instructions, provider:row.provider || 'groq', model:row.model || '', memory:row.memory ?? [], createdAt:row.created_at })) as Worker[]
  localStorage.setItem(KEY, JSON.stringify(memory))
  window.dispatchEvent(new Event(EVENT))
}
