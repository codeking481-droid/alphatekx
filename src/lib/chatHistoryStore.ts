import { supabase } from './supabase'

export type GeneralChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  tool?: 'clock' | 'currency' | 'search' | 'restoration'
  sources?: Array<{ title: string; url: string; content?: string }>
  currency?: { from: string; to: string; amount: number; rate: number; result: number; updatedAt?: string }
  revenue?: { totalLoss: string; roiAll: number; top3Loss: string; actions: { fix_all: { price: number; label: string; recover: string }; fix_critical: { price: number; label: string; recover: string }; fix_none: { price: number; label: string } } }
}

export type ChatThread = { id: string; title: string; messages: GeneralChatMessage[]; createdAt: string; updatedAt: string }

const KEY = 'alphatekx_chat_threads'
const EVENT = 'alphatekx:chat-history'

function read(): ChatThread[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as ChatThread[] } catch { return [] }
}

function write(threads: ChatThread[]) {
  localStorage.setItem(KEY, JSON.stringify(threads.slice(0, 100)))
  window.dispatchEvent(new Event(EVENT))
}

export function getChatThreads() { return read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
export function getChatThread(id: string) { return read().find(thread => thread.id === id) ?? null }

export function createChatThread(firstPrompt = '') {
  const now = new Date().toISOString()
  const thread: ChatThread = { id: crypto.randomUUID(), title: firstPrompt.trim().slice(0, 56) || 'New conversation', messages: [], createdAt: now, updatedAt: now }
  write([thread, ...read()])
  void cloudUpsert(thread)
  return thread
}

export function saveChatThread(thread: ChatThread) {
  const next = { ...thread, updatedAt: new Date().toISOString(), title: thread.messages.find(item => item.role === 'user')?.content.slice(0, 56) || thread.title }
  write([next, ...read().filter(item => item.id !== next.id)])
  void cloudUpsert(next)
  return next
}

export function deleteChatThread(id: string) {
  write(read().filter(thread => thread.id !== id))
  void cloudDelete(id)
}

export function subscribeChatHistory(listener: () => void) {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

export async function hydrateChatHistory() {
  if (!supabase) return
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return
  const { data, error } = await supabase.from('general_chat_threads').select('*').eq('user_id', auth.user.id).order('updated_at', { ascending: false })
  if (error || !data) return
  const remote = data.map(row => ({ id: row.id, title: row.title, messages: row.messages || [], createdAt: row.created_at, updatedAt: row.updated_at })) as ChatThread[]
  const merged = new Map(read().map(thread => [thread.id, thread]))
  remote.forEach(thread => merged.set(thread.id, thread))
  write([...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
}

async function cloudUpsert(thread: ChatThread) {
  if (!supabase) return
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return
  await supabase.from('general_chat_threads').upsert({ id: thread.id, user_id: auth.user.id, title: thread.title, messages: thread.messages, created_at: thread.createdAt, updated_at: thread.updatedAt })
}

async function cloudDelete(id: string) {
  if (!supabase) return
  const { data: auth } = await supabase.auth.getUser()
  if (auth.user) await supabase.from('general_chat_threads').delete().eq('id', id).eq('user_id', auth.user.id)
}

// Gap 3 Fix: sidebar history — persist all messages, survive refresh (prompt spec + thread fallback)
export const chatHistoryStore = {
  saveMessage: async (message: GeneralChatMessage) => {
    // Keep thread storage (local + general_chat_threads) — then also persist to chat_history for compatibility
    try {
      const threads = read()
      if (threads.length) {
        const latest = threads[0]
        const updated = { ...latest, messages: [...latest.messages, message], updatedAt: new Date().toISOString() }
        write([updated, ...threads.slice(1)])
        void cloudUpsert(updated)
      }
    } catch {}
    if (!supabase) return
    try {
      const { data: auth } = await supabase.auth.getUser()
      await supabase.from('chat_history').insert({
        user_id: auth.user?.id ?? 'anon',
        message,
        created_at: new Date().toISOString(),
      })
    } catch {}
  },
  loadHistory: async (): Promise<GeneralChatMessage[]> => {
    // Try chat_history table first (prompt spec), fallback to threads
    if (supabase) {
      try {
        const { data } = await supabase.from('chat_history').select('*').order('created_at', { ascending: true })
        if (data && data.length) return data.map((r: any) => r.message).filter(Boolean)
      } catch {}
    }
    // Fallback: flatten all threads so sidebar never loses cards after refresh
    return read().flatMap(t => t.messages)
  },
}
