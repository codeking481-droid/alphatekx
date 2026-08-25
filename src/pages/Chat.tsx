import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Bot, Check, Clock, Copy, DollarSign, ExternalLink, Loader2, MessageSquare, Mic, Pencil, Search, Sparkles, Square, Volume2 } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { createChatThread, saveChatThread, getChatThread, type GeneralChatMessage } from '../lib/chatHistoryStore'

function uid() { return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}` }
function formatTime(d = new Date()) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }

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
        code: ({ node: _n, ...props }) => <code className="rounded bg-violet-500/10 px-1 py-0.5 text-sm text-emerald-300" {...props} />,
        pre: ({ node: _n, ...props }) => <pre className="mb-3 overflow-x-auto rounded-xl bg-violet-500/10 p-3 text-sm text-zinc-100" {...props} />,
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
      <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-sm backdrop-blur-xl">
        <Clock size={14} className="text-emerald-400" />
        <LiveClock />
      </div>
    )
  }
  if (message.tool === 'currency' && message.currency) {
    const c = message.currency
    return (
      <div className="mt-3 w-full max-w-4xl rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-xs text-white/55"><DollarSign size={12} /> Live conversion</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-white">{c.result.toFixed(2)}</span>
          <span className="text-sm text-zinc-400">{c.to}</span>
        </div>
        <div className="mt-1 text-xs text-slate-400">{c.amount} {c.from} · rate {c.rate.toFixed(4)} · {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : 'now'}</div>
      </div>
    )
  }
  if (message.tool === 'search' && message.sources?.length) {
    return (
      <div className="mt-3 w-full max-w-4xl rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-xs text-white/55"><Search size={12} /> Live web results</div>
        <div className="mt-3 grid gap-3">
          {message.sources.slice(0, 8).map((source, i) => (
            <a key={i} href={source.url} target="_blank" rel="noreferrer" className="group flex items-start gap-3 rounded-xl bg-violet-500/10 p-3 transition hover:bg-violet-500/10">
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
    // ——— Alpha Restoration intents: scan/fix this URL, GitHub, big site, pasted HTML ———
    const urlMatch = text.match(/https?:\/\/[^\s]+/i)
    const githubMatch = text.match(/github\.com\/[^\s]+/i) || text.match(/\b[\w-]+\/[\w.-]+\b/)
    const isGithubIntent = /github|repo/i.test(lower) && githubMatch
    const isBigSiteIntent = /big site|whole site|sitemap|100 pages|entire site/i.test(lower)
    const isPasteHtml = /<html[\s>]/i.test(text) || /<!doctype/i.test(text)
    const wantsRestore = /scan|fix|restore|repair|check|audit/i.test(lower) && (urlMatch || isGithubIntent || isPasteHtml || isBigSiteIntent)
    if (wantsRestore) {
      try {
        let alphaContent = ''
        let tool: GeneralChatMessage['tool'] = 'search'
        let sources: GeneralChatMessage['sources'] = undefined

        // Chain of thought visible steps
        const steps = [
          '🔍 Phase 1 — Scanning every file/page (10 areas, sitemap-first for big sites)...',
          '🧠 Phase 2 — Analyzing with V2+V3 + Groq (12-phase, plain English green card)...',
          '🛠️ Phase 3 — Surgical fix (minimal diff, no rewrite, WaveSpeed real images if needed)...',
          '✅ Phase 4 — Verifying rescanClean + Core Web Vitals + security headers...'
        ]
        // Show steps incrementally
        for (let s = 0; s < steps.length; s++) {
          if (isAborted()) break
          alphaContent += (alphaContent ? '\n\n' : '') + steps[s]
          const interim: GeneralChatMessage = { id: uid(), role: 'assistant', content: alphaContent, createdAt: new Date().toISOString() }
          setMessages([...nextMessages, interim])
          // small delay to show chain of thought
          // eslint-disable-next-line no-await-in-loop
          await new Promise(r => setTimeout(r, 350))
          if (s === 0) {
            // Phase 1 — actually call the right engine
            let scanRes: Response | null = null
            let scanData: any = null
            try {
              if (isGithubIntent) {
                const gh = githubMatch ? (githubMatch[0].startsWith('http') ? githubMatch[0] : `https://github.com/${githubMatch[0]}`) : urlMatch![0]
                scanRes = await fetch('/api/scan/github', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ githubUrl: gh }), signal: abortCtrl.signal })
              } else if (isBigSiteIntent && urlMatch) {
                scanRes = await fetch('/api/scan/big-site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: urlMatch[0], maxPages: 25 }), signal: abortCtrl.signal })
              } else if (isPasteHtml) {
                scanRes = await fetch('/api/engine/v3/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: text }), signal: abortCtrl.signal })
              } else if (urlMatch) {
                // Try big-site first for earning sites (sitemap), fallback to single-page V3
                scanRes = await fetch('/api/scan/big-site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: urlMatch[0], maxPages: 10 }), signal: abortCtrl.signal })
                if (!scanRes.ok) {
                  scanRes = await fetch('/api/engine/v3/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: urlMatch[0] }), signal: abortCtrl.signal })
                }
              }
              if (scanRes) scanData = await scanRes.json().catch(() => ({}))
            } catch {}
            // Phase 2-4 — build final green card
            if (scanData && (scanData.greenCard || scanData.ok)) {
              alphaContent = scanData.greenCard || `**Scan complete:** ${scanData.pagesScanned || scanData.filesScanned || 1} scanned, ${scanData.findings?.length ?? scanData.issues_found ?? 0} issues found.\n\n` + (scanData.greenCard || '')
              // Append verification + patch hint
              alphaContent += `\n\n---\n**Verification:** ${scanData.beforeScore != null ? `before ${scanData.beforeScore} → after ${scanData.after_score ?? scanData.beforeScore} ` : ''}**Next:** Say **"fix this"** and I will patch surgically (minimal diff) and give you a PR/ZIP with \`originals/\` rollback.`
              tool = 'search'
              sources = (scanData.findings || []).slice(0, 5).map((f: any) => ({ title: `${f.type} — ${f.severity}`, url: f.file || f.page || urlMatch?.[0] || '', content: f.description || f.type }))
            } else if (scanData && scanData.error) {
              alphaContent += `\n\n⚠️ ${scanData.error} ${scanData.code === 402 ? '\n\nYour Free plan is 1 scan/1 fix — upgrade to Pro $49 (10 sites) to scan big sites.' : ''}`
            } else {
              alphaContent += '\n\n⚠️ Scan did not return a green card — trying single-page fallback...'
              try {
                const fallback = await fetch('/api/engine/v3/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(urlMatch ? { url: urlMatch[0] } : { html: text }), signal: abortCtrl.signal })
                const fj = await fallback.json().catch(() => ({}))
                if (fj.ok || fj.greenCard) alphaContent = fj.greenCard || fj.html?.slice(0, 2000) || 'Fallback scan complete.'
              } catch {}
            }
            // Replace interim with final
            const finalMsg: GeneralChatMessage = { id: uid(), role: 'assistant', content: alphaContent, createdAt: new Date().toISOString(), tool, sources }
            setMessages([...nextMessages, finalMsg])
            persist([...nextMessages, finalMsg])
            setLoading(false); setController(null); abortRef.current = null
            if (voiceOn && alphaContent) speak(alphaContent.slice(0, 400))
            return
          }
        }
      } catch {}
    }

    const lower2 = text.toLowerCase()
    const wantsClock = lower2.includes('time') || lower2.includes('clock') || lower2.includes('what time')
    const parsedCurrency = parseCurrency(text)
    const wantsCurrency = lower2.includes('currency') || lower2.includes('rate') || lower2.includes('convert') || lower2.includes('naira') || lower2.includes('usd') || lower2.includes('ngn') || parsedCurrency !== null
    const wantsSearch = lower2.includes('search') || lower2.includes('find') || lower2.includes('latest') || lower2.includes('news') || lower2.startsWith('who is') || lower2.startsWith('what is') || lower2.startsWith('where is')

    let alphaContent = ''
    let tool: GeneralChatMessage['tool'] = undefined
    let sources: GeneralChatMessage['sources'] = undefined
    let currency: GeneralChatMessage['currency'] = undefined

    try {
      const res = await fetch('/api/alpha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'chat', prompt: text }),
        signal: abortCtrl.signal,
      })
      const data = await res.json().catch(() => ({})) as { text?: string; response?: string; tool?: GeneralChatMessage['tool']; sources?: GeneralChatMessage['sources']; currency?: GeneralChatMessage['currency'] }
      alphaContent = typeof data.text === 'string' ? data.text : typeof data.response === 'string' ? data.response : ''
      tool = data.tool
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

    if (wantsSearch && !sources && !alphaContent) {
      alphaContent = 'Live web search is not available right now. Try again later or ask me something else.'
    }

    const alphaMsg: GeneralChatMessage = {
      id: uid(),
      role: 'assistant',
      content: alphaContent || 'Alpha is here. I can search the web, show rates, and tell the time.',
      createdAt: new Date().toISOString(),
      tool,
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
      <header className="flex-none border-b border-violet-400/20 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-wide">
            <Sparkles size={16} className="text-emerald-400" />
            Alpha Chat
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="hidden items-center gap-1.5 sm:flex"><Clock size={12} /> {clock}</span>
            <Link to="/history" className="rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 hover:bg-violet-500/10">History</Link>
            <button onClick={() => { setMessages([]); const thread = createChatThread(); setParams({ thread: thread.id }, { replace: true }) }} className="rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 hover:bg-violet-500/10">New chat</button>
          </div>
        </div>
      </header>

      {notice && <div className="flex-none border-b border-violet-400/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">{notice}</div>}

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
          {messages.length === 0 && (
            <section className="mt-16 flex flex-col items-center text-center sm:mt-24">
              <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-emerald-500 to-indigo-600 shadow-lg shadow-emerald-500/20">
                <Sparkles size={32} className="text-white" />
              </div>
              <h1 className="mt-6 text-2xl font-semibold text-white sm:text-3xl">What do you want to restore?</h1>
              <p className="mt-2 max-w-md text-sm text-zinc-400">Paste a link, describe the problem, or upload code — Alpha scans 100%, fixes surgically, green card plain English.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {['Scan this: https://example.com', 'Fix this GitHub: vercel/next.js', 'Restore pasted HTML: <html>…</html>'].map(p => (
                  <button key={p} onClick={() => void send(p, undefined, false)} className="rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-xs text-zinc-300 hover:bg-violet-500/10 hover:text-white">{p}</button>
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
                      <button onClick={() => void copyText(message.content, message.id)} title="Copy" className="rounded p-1 text-slate-400 hover:bg-violet-500/10 hover:text-white">
                        {copiedId === message.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                      {message.id === lastAssistantId && !loading && (
                        <button onClick={() => regenerate(message.id)} title="Regenerate" className="rounded p-1 text-slate-400 hover:bg-violet-500/10 hover:text-white"><Pencil size={12} /></button>
                      )}
                    </div>
                  </div>
                  {message.content && (
                    <div className="text-[15px] leading-7 text-zinc-100">
                      <Markdown>{message.content.trim()}</Markdown>
                    </div>
                  )}
                  <ChatWidget message={message} />
                </div>
              ) : (
                <div className="max-w-[90%] rounded-2xl bg-violet-500/10 px-4 py-3 text-sm text-white sm:max-w-[80%]">
                  <div className="whitespace-pre-wrap text-[15px] leading-6">{message.content}</div>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex max-w-[85%] items-center gap-2 rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 backdrop-blur-2xl">
                <Loader2 size={16} className="animate-spin text-emerald-400" />
                <span className="text-sm text-zinc-400">Alpha is typing</span>
                <span className="flex gap-0.5">
                  <i className="size-1.5 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: '0ms' }} />
                  <i className="size-1.5 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: '150ms' }} />
                  <i className="size-1.5 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>
      </main>

      <footer className="flex-none border-t border-violet-400/20 bg-background/95 p-4 backdrop-blur-2xl">
        <div className="mx-auto w-full max-w-4xl">
          <div className="flex items-end gap-2 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-2 backdrop-blur-2xl focus-within:border-violet-400/20">
            <button
              onClick={() => setVoiceOn(v => !v)}
              title={voiceOn ? 'Voice reply is on' : 'Voice reply is off'}
              className={`grid size-10 shrink-0 place-items-center self-center rounded-xl transition-all ${voiceOn ? 'bg-indigo-500 text-white' : 'bg-violet-500/10 text-zinc-400 hover:bg-violet-500/10'}`}
            >
              <Volume2 size={18} />
            </button>
            <textarea
              value={input}
              onChange={e => { setInput(e.target.value); if (!e.target.value.trim()) setVoiceOn(false) }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
              placeholder={voiceOn ? 'Tap the mic or type a message...' : 'Paste a link, describe the problem, or say "Scan this: https://..."'}
              className="max-h-40 min-h-14 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-zinc-100 placeholder:text-slate-400 outline-none"
              rows={1}
            />
            {loading ? (
              <button onClick={stop} title="Stop generation" className="grid size-10 shrink-0 place-items-center self-center rounded-xl bg-red-500/20 text-red-400 transition-all hover:bg-red-500/30">
                <Square size={16} className="fill-current" />
              </button>
            ) : input.trim() ? (
              <button onClick={() => void send()} disabled={loading} className="grid size-10 shrink-0 place-items-center self-center rounded-xl bg-violet-500/10 text-white transition-all hover:bg-blue-500/10 disabled:opacity-30">
                <ArrowUp size={18} />
              </button>
            ) : (
              <button onClick={startListening} disabled={listening || loading} className={`grid size-10 shrink-0 place-items-center self-center rounded-xl text-white transition-all ${listening ? 'animate-pulse bg-red-500' : 'btn-alpha'}`}>
                {listening ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
            <button onClick={() => setInput('Scan this: https://example.com')} className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-1 hover:bg-violet-500/10">Try: Scan this URL</button>
            <button onClick={() => setInput('Fix this GitHub: vercel/next.js')} className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-1 hover:bg-violet-500/10">Try: Fix GitHub repo</button>
            <button onClick={() => setInput('Convert 100 USD to EUR')} className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-1 hover:bg-violet-500/10">Try: Convert 100 USD</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
