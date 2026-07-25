import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Bot, Check, Clock, Copy, DollarSign, ExternalLink, Loader2, MessageSquare, Mic, Pencil, Search, Sparkles, Square, Volume2, Youtube } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { createChatThread, saveChatThread, getChatThread, type GeneralChatMessage } from '../lib/chatHistoryStore'

function uid() { return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}` }
function formatTime(d = new Date()) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
function extractYouTubeId(url: string) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/)
  return match?.[1]
}

async function fetchRates() {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
    const data = await res.json() as { rates?: Record<string, number>; date?: string }
    if (!data.rates) return null
    return {
      USD: data.rates.NGN ? data.rates.NGN.toFixed(2) : '—',
      EUR: data.rates.EUR ? ((1 / data.rates.EUR) * (data.rates.NGN || 0)).toFixed(2) : '—',
      GBP: data.rates.GBP ? ((1 / data.rates.GBP) * (data.rates.NGN || 0)).toFixed(2) : '—',
      BTC: data.rates.BTC ? (data.rates.BTC * (data.rates.NGN || 0)).toFixed(2) : '—',
      date: data.date,
    }
  } catch { return null }
}

async function searchWeb(query: string) {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    if (!res.ok) return null
    return (await res.json()) as { results: Array<{ title: string; url: string; snippet?: string; content?: string }>; answer?: string }
  } catch { return null }
}

function extractSearchQuery(text: string) {
  const patterns = [
    /search (?:the web |online )?for (.+)/i,
    /search (.+)/i,
    /(?:find|look up|what is|who is|latest on|news about) (.+)/i,
  ]
  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (m && m[1]) return m[1].trim()
  }
  return text.trim()
}

function parseCurrency(text: string) {
  const match = text.match(/([\d.,]+)\s*([A-Za-z]{3})\s+(?:to|in)\s+([A-Za-z]{3})/i)
  return match ? { amount: Number(match[1].replace(/,/g, '')), from: match[2].toUpperCase(), to: match[3].toUpperCase() } : null
}

function LiveClock() {
  const [time, setTime] = useState(formatTime())
  useEffect(() => {
    const id = window.setInterval(() => setTime(formatTime()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="font-mono text-white/90">{time}</span>
}

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ node: _n, ...props }) => <h1 className="mb-2 text-xl font-semibold text-white" {...props} />,
        h2: ({ node: _n, ...props }) => <h2 className="mb-2 text-lg font-semibold text-white" {...props} />,
        h3: ({ node: _n, ...props }) => <h3 className="mb-1.5 text-base font-semibold text-white" {...props} />,
        p: ({ node: _n, ...props }) => <p className="mb-3 leading-7 text-zinc-200" {...props} />,
        ul: ({ node: _n, ...props }) => <ul className="mb-3 list-disc space-y-1.5 pl-5 text-zinc-200" {...props} />,
        ol: ({ node: _n, ...props }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-zinc-200" {...props} />,
        li: ({ node: _n, ...props }) => <li className="leading-7" {...props} />,
        a: ({ node: _n, ...props }) => <a className="text-emerald-400 hover:underline" target="_blank" rel="noreferrer" {...props} />,
        strong: ({ node: _n, ...props }) => <strong className="font-semibold text-white" {...props} />,
        em: ({ node: _n, ...props }) => <em className="italic text-zinc-300" {...props} />,
        code: ({ node: _n, ...props }) => <code className="rounded bg-white/[0.08] px-1 py-0.5 text-sm text-emerald-300" {...props} />,
        pre: ({ node: _n, ...props }) => <pre className="mb-3 overflow-x-auto rounded-xl bg-white/[0.06] p-3 text-sm text-zinc-100" {...props} />,
        blockquote: ({ node: _n, ...props }) => <blockquote className="mb-3 border-l-2 border-emerald-400/60 pl-3 italic text-zinc-300" {...props} />,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

function ChatWidget({ message }: { message: GeneralChatMessage }) {
  if (message.tool === 'clock') {
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm backdrop-blur-xl">
        <Clock size={14} className="text-emerald-400" />
        <LiveClock />
      </div>
    )
  }
  if (message.tool === 'currency' && message.currency) {
    const c = message.currency
    return (
      <div className="mt-3 w-full max-w-4xl rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-xs text-white/55"><DollarSign size={12} /> Live conversion</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-white">{c.result.toFixed(2)}</span>
          <span className="text-sm text-zinc-400">{c.to}</span>
        </div>
        <div className="mt-1 text-xs text-zinc-500">{c.amount} {c.from} · rate {c.rate.toFixed(4)} · {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : 'now'}</div>
      </div>
    )
  }
  if (message.tool === 'youtube' && message.videos?.length) {
    return (
      <div className="mt-3 w-full max-w-4xl space-y-4">
        {message.videos.map(video => (
          <div key={video.id} className="w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-lg">
            <div className="aspect-video w-full">
              <iframe className="h-full w-full" src={`https://www.youtube.com/embed/${video.id}?rel=0&modestbranding=1`} title={video.title || 'YouTube video'} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
            </div>
            {(video.title || video.channel) && (
              <div className="border-t border-white/10 px-4 py-3">
                <div className="text-sm font-medium text-white line-clamp-1">{video.title}</div>
                {video.channel && <div className="text-xs text-zinc-500">{video.channel}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }
  if (message.tool === 'search' && message.sources?.length) {
    return (
      <div className="mt-3 w-full max-w-4xl rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-xs text-white/55"><Search size={12} /> Live web results</div>
        <div className="mt-3 grid gap-3">
          {message.sources.slice(0, 8).map((source, i) => (
            <a key={i} href={source.url} target="_blank" rel="noreferrer" className="group flex items-start gap-3 rounded-xl bg-white/[0.04] p-3 transition hover:bg-white/[0.08]">
              <ExternalLink size={14} className="mt-0.5 flex-shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-white group-hover:text-emerald-300 line-clamp-1">{source.title}</div>
                <div className="mt-0.5 text-xs text-white/50 line-clamp-2">{source.content || source.url}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    )
  }
  return null
}

export default function Chat() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const threadId = params.get('thread') || ''
  const [messages, setMessages] = useState<GeneralChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [clock, setClock] = useState(formatTime())
  const [listening, setListening] = useState(false)
  const [voiceOn, setVoiceOn] = useState(false)
  const [notice, setNotice] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editText, setEditText] = useState('')
  const [controller, setController] = useState<AbortController | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text.replace(/https?:\/\/\S+/g, 'link'))
    utter.rate = 1
    utter.pitch = 1
    window.speechSynthesis.speak(utter)
  }

  const startListening = () => {
    const SR = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition || (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!SR) { setNotice('Voice input is not supported in this browser.'); window.setTimeout(() => setNotice(''), 3000); return }
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.onstart = () => setListening(true)
    rec.onend = () => setListening(false)
    rec.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join('')
      setInput(transcript)
      if (event.results[0]?.isFinal) {
        setVoiceOn(true)
        setTimeout(() => void send(), 200)
      }
    }
    rec.start()
  }

  useEffect(() => {
    const timer = window.setInterval(() => setClock(formatTime()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (threadId) {
      const thread = getChatThread(threadId)
      if (thread) { setMessages(thread.messages); return }
    }
    const thread = createChatThread()
    setParams({ thread: thread.id }, { replace: true })
    setMessages([])
  }, [threadId])

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const persist = (msgs: GeneralChatMessage[]) => {
    const thread = getChatThread(threadId)
    if (thread) saveChatThread({ ...thread, messages: msgs })
  }

  const isAborted = () => abortRef.current?.signal.aborted ?? false

  const stop = () => {
    abortRef.current?.abort()
    setController(null)
    setLoading(false)
    window.speechSynthesis?.cancel()
  }

  const regenerate = (messageId: string) => {
    const idx = messages.findIndex(m => m.id === messageId)
    const prior = messages[idx - 1]
    if (!prior || prior.role !== 'user') return
    const trimmed = messages.slice(0, idx)
    setMessages(trimmed)
    persist(trimmed)
    void send(prior.content, trimmed, true)
  }

  const copyText = async (text: string, id: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); window.setTimeout(() => setCopiedId(''), 2000) } catch {}
  }

  const send = async (seedText?: string, baseMessages?: GeneralChatMessage[], replace = false) => {
    const text = (seedText ?? input).trim()
    if (!text || loading || !threadId) return
    const now = new Date().toISOString()
    const userMsg: GeneralChatMessage = { id: uid(), role: 'user', content: text, createdAt: now }
    const nextMessages = replace ? (baseMessages ?? messages) : [...(baseMessages ?? messages), userMsg]
    setMessages(nextMessages)
    persist(nextMessages)
    if (!seedText && !replace) setInput('')
    setLoading(true)

    const abortCtrl = new AbortController()
    abortRef.current = abortCtrl
    setController(abortCtrl)

    const lower = text.toLowerCase()
    const wantsClock = lower.includes('time') || lower.includes('clock') || lower.includes('what time')
    const parsedCurrency = parseCurrency(text)
    const wantsCurrency = lower.includes('currency') || lower.includes('rate') || lower.includes('convert') || lower.includes('naira') || lower.includes('usd') || lower.includes('ngn') || parsedCurrency !== null
    const youtubeMatch = text.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[^\s]+/)
    const wantsYoutube = /\byoutube\b|\bvideo\b|\btutorial\b|\bshow me\b|\bfind me a video/i.test(text)
    const wantsSearch = lower.includes('search') || lower.includes('find') || lower.includes('latest') || lower.includes('news') || lower.startsWith('who is') || lower.startsWith('what is') || lower.startsWith('where is')

    let alphaContent = ''
    let tool: GeneralChatMessage['tool'] = undefined
    let videos: GeneralChatMessage['videos'] = undefined
    let sources: GeneralChatMessage['sources'] = undefined
    let currency: GeneralChatMessage['currency'] = undefined

    try {
      const res = await fetch('/api/alpha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'chat', prompt: text }),
        signal: abortCtrl.signal,
      })
      const data = await res.json().catch(() => ({})) as { text?: string; response?: string; tool?: GeneralChatMessage['tool']; videos?: GeneralChatMessage['videos']; sources?: GeneralChatMessage['sources']; currency?: GeneralChatMessage['currency'] }
      alphaContent = typeof data.text === 'string' ? data.text : typeof data.response === 'string' ? data.response : ''
      tool = data.tool
      videos = data.videos
      sources = data.sources?.map(s => ({ title: s.title, url: s.url, content: s.content || s.snippet || s.url }))
      currency = data.currency
    } catch {
      alphaContent = ''
    }

    if (isAborted()) { setLoading(false); setController(null); abortRef.current = null; return }

    if (wantsClock && !tool) {
      tool = 'clock'
      if (!alphaContent) alphaContent = `It is ${formatTime()} right now.`
    }

    if (wantsCurrency && !currency) {
      const amount = parsedCurrency?.amount || 1
      const from = parsedCurrency?.from || 'USD'
      const to = parsedCurrency?.to || 'NGN'
      try {
        const res = await fetch('/api/tools/currency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, amount }) })
        if (res.ok) {
          currency = await res.json() as GeneralChatMessage['currency']
          tool = 'currency'
          if (!alphaContent) alphaContent = `Live conversion: ${amount} ${from} is about ${Number(currency.result).toFixed(2)} ${to}.`
        }
      } catch {}
      if (!currency) {
        const rates = await fetchRates()
        if (rates) {
          currency = { from: 'USD', to: 'NGN', amount: 1, rate: Number(rates.USD) || 0, result: Number(rates.USD) || 0 }
          tool = 'currency'
          if (!alphaContent) alphaContent = `Live rates: 1 USD is about ₦${rates.USD}.`
        }
      }
    }

    if (isAborted()) { setLoading(false); setController(null); abortRef.current = null; return }

    if (wantsSearch && !sources) {
      const searchResult = await searchWeb(extractSearchQuery(text))
      if (searchResult?.results?.length) {
        tool = 'search'
        sources = searchResult.results.map(r => ({ title: r.title, url: r.url, content: r.snippet || r.content || r.url }))
        if (!alphaContent) alphaContent = searchResult.answer || `Here is what I found on the live web for "${text}".`
      }
    }

    if (isAborted()) { setLoading(false); setController(null); abortRef.current = null; return }

    if ((youtubeMatch || wantsYoutube) && !videos) {
      if (youtubeMatch) {
        const id = extractYouTubeId(youtubeMatch[0])
        if (id) {
          tool = 'youtube'
          videos = [{ id, title: 'YouTube video', channel: '', url: `https://www.youtube.com/watch?v=${id}` }]
          if (!alphaContent) alphaContent = 'Here is the YouTube video you shared.'
        }
      } else {
        const query = text.replace(/\b(show|find|load|play|youtube|videos?|watch|tutorial|me|please|a)\b/gi, ' ').replace(/\s+/g, ' ').trim() || text
        const result = await searchWeb(`site:youtube.com ${query}`)
        const youtubeUrl = result?.results?.find(r => /youtube\.com|youtu\.be/.test(r.url))?.url
        if (youtubeUrl) {
          const id = extractYouTubeId(youtubeUrl)
          if (id) {
            const title = result?.results?.find(r => r.url === youtubeUrl)?.title || 'YouTube video'
            tool = 'youtube'
            videos = [{ id, title, channel: '', url: youtubeUrl }]
            if (!alphaContent) alphaContent = 'Here is a matching YouTube video.'
          }
        }
      }
    }

    if (isAborted()) { setLoading(false); setController(null); abortRef.current = null; return }

    if (wantsYoutube && !videos && !alphaContent) {
      alphaContent = 'I can embed a YouTube video if you paste the link here, like https://www.youtube.com/watch?v=...'
    }
    if (wantsSearch && !sources && !alphaContent) {
      alphaContent = 'Live web search is not available right now. Try again later or ask me something else.'
    }

    const alphaMsg: GeneralChatMessage = {
      id: uid(),
      role: 'assistant',
      content: alphaContent || 'Alpha is here. I can search the web, fetch videos, show rates, and tell the time.',
      createdAt: new Date().toISOString(),
      tool,
      videos,
      sources,
      currency,
    }
    const final = [...nextMessages, alphaMsg]
    setMessages(final)
    persist(final)
    setLoading(false)
    setController(null)
    abortRef.current = null
    if (voiceOn && alphaMsg.content) speak(alphaMsg.content)
  }

  const lastAssistantId = useMemo(() => [...messages].reverse().find(m => m.role === 'assistant')?.id, [messages])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-white">
      <header className="flex-none border-b border-white/10 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-wide">
            <Sparkles size={16} className="text-emerald-400" />
            Alpha Chat
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="hidden items-center gap-1.5 sm:flex"><Clock size={12} /> {clock}</span>
            <Link to="/history" className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 hover:bg-white/[0.08]">History</Link>
            <button onClick={() => { setMessages([]); const thread = createChatThread(); setParams({ thread: thread.id }, { replace: true }) }} className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 hover:bg-white/[0.08]">New chat</button>
          </div>
        </div>
      </header>

      {notice && <div className="flex-none border-b border-white/10 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">{notice}</div>}

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
          {messages.length === 0 && (
            <section className="mt-16 flex flex-col items-center text-center sm:mt-24">
              <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-emerald-500 to-indigo-600 shadow-lg shadow-emerald-500/20">
                <Sparkles size={32} className="text-white" />
              </div>
              <h1 className="mt-6 text-2xl font-semibold text-white sm:text-3xl">Turn your ideas into reality</h1>
              <p className="mt-2 max-w-md text-sm text-zinc-400">Ask Alpha anything. Search the live web, convert currency, embed YouTube videos, get the time, and more.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {['Convert 100 USD to EUR', 'Search the web for Apple news', 'Show me a YouTube video about space', 'What time is it?'].map(p => (
                  <button key={p} onClick={() => void send(p, undefined, false)} className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.08] hover:text-white">{p}</button>
                ))}
              </div>
            </section>
          )}
          {messages.map(message => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.role === 'assistant' ? (
                <div className="w-full max-w-full space-y-1">
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium text-emerald-400">
                    <Bot size={14} />
                    Alpha
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={() => void copyText(message.content, message.id)} title="Copy" className="rounded p-1 text-zinc-500 hover:bg-white/[0.08] hover:text-white">
                        {copiedId === message.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                      {message.id === lastAssistantId && !loading && (
                        <button onClick={() => regenerate(message.id)} title="Regenerate" className="rounded p-1 text-zinc-500 hover:bg-white/[0.08] hover:text-white"><Pencil size={12} /></button>
                      )}
                    </div>
                  </div>
                  {message.content && (
                    <div className="text-[15px] leading-7 text-zinc-100">
                      <Markdown>{message.content}</Markdown>
                    </div>
                  )}
                  <ChatWidget message={message} />
                </div>
              ) : (
                <div className="max-w-[90%] rounded-2xl bg-white px-4 py-3 text-sm text-black sm:max-w-[80%]">
                  <div className="whitespace-pre-wrap text-[15px] leading-6">{message.content}</div>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex max-w-[85%] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-2xl">
                <Loader2 size={16} className="animate-spin text-emerald-400" />
                <span className="text-sm text-zinc-400">Alpha is typing</span>
                <span className="flex gap-0.5">
                  <i className="size-1.5 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: '0ms' }} />
                  <i className="size-1.5 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: '150ms' }} />
                  <i className="size-1.5 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>
      </main>

      <footer className="flex-none border-t border-white/10 bg-background/95 p-4 backdrop-blur-2xl">
        <div className="mx-auto w-full max-w-4xl">
          <div className="flex items-end gap-2 rounded-2xl border border-white/15 bg-white/[0.06] p-2 backdrop-blur-2xl focus-within:border-white/30">
            <button
              onClick={() => setVoiceOn(v => !v)}
              title={voiceOn ? 'Voice reply is on' : 'Voice reply is off'}
              className={`grid size-10 shrink-0 place-items-center self-center rounded-xl transition-all ${voiceOn ? 'bg-indigo-500 text-white' : 'bg-white/[0.05] text-zinc-400 hover:bg-white/[0.08]'}`}
            >
              <Volume2 size={18} />
            </button>
            <textarea
              value={input}
              onChange={e => { setInput(e.target.value); if (!e.target.value.trim()) setVoiceOn(false) }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
              placeholder={voiceOn ? 'Tap the mic or type a message...' : 'Ask Alpha anything, paste a YouTube link, search the web, or say show me currency...'}
              className="max-h-40 min-h-14 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
              rows={1}
            />
            {loading ? (
              <button onClick={stop} title="Stop generation" className="grid size-10 shrink-0 place-items-center self-center rounded-xl bg-red-500/20 text-red-400 transition-all hover:bg-red-500/30">
                <Square size={16} className="fill-current" />
              </button>
            ) : input.trim() ? (
              <button onClick={() => void send()} disabled={loading} className="grid size-10 shrink-0 place-items-center self-center rounded-xl bg-white text-black transition-all hover:bg-zinc-100 disabled:opacity-30">
                <ArrowUp size={18} />
              </button>
            ) : (
              <button onClick={startListening} disabled={listening || loading} className={`grid size-10 shrink-0 place-items-center self-center rounded-xl text-white transition-all ${listening ? 'animate-pulse bg-red-500' : 'btn-alpha'}`}>
                {listening ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-zinc-500">
            <button onClick={() => setInput('Convert 100 USD to EUR')} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 hover:bg-white/[0.08]">Try: Convert 100 USD to EUR</button>
            <button onClick={() => setInput('Search the web for Apple news')} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 hover:bg-white/[0.08]">Try: search the web</button>
            <button onClick={() => setInput('Show me a YouTube video about space')} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 hover:bg-white/[0.08]">Try: YouTube video</button>
            <button onClick={() => setInput('What time is it?')} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 hover:bg-white/[0.08]">Try: "What time is it?"</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
