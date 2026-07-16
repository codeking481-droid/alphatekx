import { useEffect, useState } from 'react'
import { Clock3, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { deleteChatThread, getChatThreads, hydrateChatHistory, subscribeChatHistory, type ChatThread } from '../lib/chatHistoryStore'

export default function History() {
  const [threads, setThreads] = useState<ChatThread[]>(getChatThreads)
  const navigate = useNavigate()
  useEffect(() => subscribeChatHistory(() => setThreads(getChatThreads())), [])
  useEffect(() => { void hydrateChatHistory() }, [])
  return <main className="mx-auto min-h-screen w-full max-w-4xl px-5 py-20">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">Chat history</h1><p className="mt-2 text-sm text-gray-500">Your conversations with the general Alpha assistant.</p></div><button onClick={() => navigate('/workspace')} className="flex min-h-11 items-center gap-2 rounded-lg bg-black px-4 text-sm text-white"><Plus size={17}/>New chat</button></header>
    {threads.length === 0 ? <section className="mt-16 rounded-xl border border-dashed border-gray-300 p-12 text-center"><MessageSquare className="mx-auto text-gray-300"/><h2 className="mt-4 font-semibold">No conversations yet</h2><p className="mt-2 text-sm text-gray-500">Start a general chat and it will appear here.</p></section> : <section className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white">{threads.map(thread => <article key={thread.id} className="group flex items-center gap-3 border-b border-gray-100 p-4 last:border-0 hover:bg-gray-50"><button onClick={() => navigate(`/workspace?chat=${thread.id}`)} className="min-w-0 flex-1 text-left"><p className="truncate font-medium">{thread.title}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500"><Clock3 size={13}/>{new Date(thread.updatedAt).toLocaleString()} · {thread.messages.length} messages</p></button><button onClick={() => deleteChatThread(thread.id)} className="grid size-11 place-items-center rounded-lg text-gray-400 hover:bg-white hover:text-red-600" aria-label={`Delete ${thread.title}`}><Trash2 size={17}/></button></article>)}</section>}
  </main>
}
