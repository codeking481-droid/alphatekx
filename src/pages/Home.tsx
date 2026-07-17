import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Clock3, ExternalLink, Globe2, History, LoaderCircle, Plus, RefreshCw, Repeat2, Youtube } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { spendCredits } from '../lib/creditStore'
import { createChatThread, getChatThread, hydrateChatHistory, saveChatThread, type GeneralChatMessage } from '../lib/chatHistoryStore'
import { postJson } from '../lib/apiClient'

type Video = { id: string; title: string; channel: string; url: string; thumbnail?: string }
type Source = { title: string; url: string; content?: string }
type CurrencyResult = { from: string; to: string; amount: number; rate: number; result: number; updatedAt?: string }
type ChatMessage = GeneralChatMessage

export default function Home() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const requestedThread = searchParams.get('chat') || ''
  const [threadId, setThreadId] = useState(requestedThread)
  const [messages, setMessages] = useState<ChatMessage[]>(() => getChatThread(requestedThread)?.messages || [])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { void hydrateChatHistory().then(() => { const thread = getChatThread(requestedThread); if (thread) setMessages(thread.messages) }) }, [requestedThread])
  useEffect(() => { const thread = getChatThread(requestedThread); setThreadId(requestedThread); setMessages(thread?.messages || []) }, [requestedThread])
  useEffect(() => { if (!threadId) return; const thread = getChatThread(threadId); if (thread) saveChatThread({ ...thread, messages: messages.slice(-100) }) }, [messages, threadId])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, pending])

  const send = async (suggestedPrompt?: string) => {
    const prompt = (suggestedPrompt ?? input).trim()
    if (!prompt || pending) return
    if (!await spendCredits(1)) { setError('You need at least 1 credit to chat.'); return }
    let activeId = threadId
    if (!activeId) { const thread = createChatThread(prompt); activeId = thread.id; setThreadId(activeId); navigate(`/workspace?chat=${activeId}`, { replace: true }) }
    setMessages(current => [...current, { id: crypto.randomUUID(), role: 'user', content: prompt, createdAt: new Date().toISOString() }]); setInput(''); setPending(true); setError('')
    try {
      const payload = await postJson<{ text?: string; tool?: ChatMessage['tool']; videos?: Video[]; sources?: Source[]; currency?: CurrencyResult }>('/api/alpha', { mode: 'chat', prompt })
      setMessages(current => [...current, { id: crypto.randomUUID(), role: 'assistant', createdAt: new Date().toISOString(), content: String(payload.text || ''), tool: payload.tool, videos: payload.videos, sources: payload.sources, currency: payload.currency }])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Alpha could not respond.') }
    finally { setPending(false) }
  }

  const newChat = () => { setMessages([]); setThreadId(''); navigate('/workspace') }
  return <div className="mx-auto flex min-h-screen w-full max-w-[820px] min-w-0 flex-col overflow-x-hidden px-4 pb-32 pt-20 sm:px-6">
    <div className="fixed right-4 top-4 z-30 flex gap-2"><button onClick={() => navigate('/history')} className="grid size-11 place-items-center rounded-full border border-gray-200 bg-white shadow-sm" aria-label="Chat history"><History size={18}/></button><button onClick={newChat} className="grid size-11 place-items-center rounded-full border border-gray-200 bg-white shadow-sm" aria-label="New chat"><Plus size={18}/></button></div>
    <div className="min-w-0 flex-1 space-y-6">{messages.length === 0&&<Welcome onAction={prompt => void send(prompt)}/>} {messages.map(message => <Message key={message.id} message={message}/>)}{pending&&<div className="flex items-center gap-2 text-sm text-gray-400"><LoaderCircle size={16} className="animate-spin"/>Alpha is thinking...</div>}<div ref={endRef}/></div>
    {error&&<p className="fixed bottom-28 left-1/2 z-10 w-[min(760px,calc(100%-32px))] -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent px-4 pb-5 pt-8"><div className="mx-auto flex max-w-[800px] items-end gap-2 rounded-2xl border border-gray-300 bg-white p-2 shadow-sm"><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} className="max-h-40 min-h-12 flex-1 resize-none px-3 py-3 text-sm outline-none" placeholder="Ask Alpha anything..."/><button onClick={() => void send()} disabled={!input.trim() || pending} className="grid size-11 shrink-0 place-items-center rounded-full bg-black text-white disabled:opacity-30" aria-label="Send"><ArrowUp size={18}/></button></div></div>
  </div>
}

function Welcome({ onAction }: { onAction: (prompt: string) => void }) {
  const actions = [
    [Clock3, 'Live wall clock', 'Show me a live wall clock'],
    [Repeat2, 'Currency converter', 'Show me a live currency converter'],
    [Youtube, 'Find a video', 'Find one YouTube video about learning React'],
    [Globe2, 'Search the web', 'Search the web for the latest technology news'],
  ] as const
  return <section className="grid min-h-[55vh] place-items-center text-center"><div className="w-full"><div className="mx-auto grid size-12 place-items-center rounded-xl bg-black text-lg font-semibold text-white">A</div><h1 className="mt-5 text-2xl font-semibold">How can Alpha help?</h1><p className="mt-2 text-sm text-gray-500">Ask a question, research the web, watch a video, or use a live tool.</p><div className="mx-auto mt-7 grid max-w-2xl gap-2 sm:grid-cols-2">{actions.map(([Icon, label, prompt]) => <button key={label} onClick={() => onAction(prompt)} className="flex min-h-12 items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 text-left text-sm hover:border-gray-400"><Icon size={18}/>{label}</button>)}</div></div></section>
}

function Message({ message }: { message: ChatMessage }) {
  if (message.role === 'user') return <div className="ml-auto max-w-[85%] break-words rounded-2xl bg-gray-100 px-4 py-3 text-sm leading-6">{message.content}</div>
  return <div className="max-w-[96%] min-w-0 space-y-4"><p className="whitespace-pre-wrap break-words px-1 text-sm leading-7 text-gray-800">{message.content}</p>{message.tool === 'clock'&&<ClockCard/>}{message.tool === 'currency'&&<CurrencyCard initial={message.currency}/>} {message.tool === 'youtube'&&<YouTubeCards videos={message.videos || []}/>} {message.tool === 'search'&&<SearchSources sources={message.sources || []}/>}</div>
}

function ClockCard() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer) }, [])
  return <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs text-gray-500">{Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(now)}</p><p className="mt-2 text-4xl font-semibold tabular-nums">{Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now)}</p><p className="mt-2 text-xs text-gray-500">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p></section>
}

const currencies = ['USD','NGN','GBP','EUR','GHS','ZAR','KES','CAD','AUD','JPY']
function CurrencyCard({ initial }: { initial?: CurrencyResult }) {
  const [amount, setAmount] = useState(String(initial?.amount || 1)); const [from, setFrom] = useState(initial?.from || 'USD'); const [to, setTo] = useState(initial?.to || 'NGN'); const [result, setResult] = useState<CurrencyResult | undefined>(initial); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const convert = async () => { setLoading(true); setError(''); try { const response = await fetch('/api/tools/currency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Number(amount), from, to }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setResult(data) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Conversion failed') } finally { setLoading(false) } }
  return <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="grid gap-3 sm:grid-cols-[1fr_110px_110px_auto]"><input type="number" min="0" value={amount} onChange={event => setAmount(event.target.value)} className="min-h-11 rounded-lg border border-gray-300 px-3" aria-label="Amount"/>{[from,to].map((value,index)=><select key={index} value={value} onChange={event => index === 0 ? setFrom(event.target.value) : setTo(event.target.value)} className="min-h-11 rounded-lg border border-gray-300 px-2" aria-label={index === 0 ? 'From currency' : 'To currency'}>{currencies.map(code=><option key={code}>{code}</option>)}</select>)}<button onClick={() => void convert()} disabled={loading || !Number(amount)} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-black px-4 text-sm text-white disabled:opacity-40">{loading?<LoaderCircle size={16} className="animate-spin"/>:<RefreshCw size={16}/>}Convert</button></div>{result&&<p className="mt-5 text-2xl font-semibold">{result.amount.toLocaleString()} {result.from} = {result.result.toLocaleString(undefined,{maximumFractionDigits:2})} {result.to}</p>}{error&&<p className="mt-3 text-sm text-red-600">{error}</p>}</section>
}

function YouTubeCards({ videos }: { videos: Video[] }) { return <div className="space-y-4">{videos.map(video=><article key={video.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="aspect-video"><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${video.id}`} title={video.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/></div><div className="p-4"><h3 className="font-medium">{video.title}</h3><p className="mt-1 text-xs text-gray-500">{video.channel}</p></div></article>)}</div> }
function SearchSources({ sources }: { sources: Source[] }) { return <div className="space-y-2">{sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-400"><span className="flex items-center justify-between gap-3 text-sm font-medium">{source.title}<ExternalLink size={15}/></span>{source.content&&<p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">{source.content}</p>}</a>)}</div> }
