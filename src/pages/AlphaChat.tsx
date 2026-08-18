import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, Send, Square, User, Bot, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import ChatAuthWrapper from '../components/auth/ChatAuthWrapper'
import AnimatedPlaceholder from '../components/alpha/AnimatedPlaceholder'
import ChainOfThought, { type ThoughtStep } from '../components/alpha/ChainOfThought'
import RestoredVersionCard, { type RestoreResult } from '../components/alpha/RestoredVersionCard'
import HamburgerSidebar from '../components/alpha/HamburgerSidebar'
import {
  createChatThread,
  saveChatThread,
  getChatThread,
  getChatThreads,
  hydrateChatHistory,
  type ChatThread,
  type GeneralChatMessage,
} from '../lib/chatHistoryStore'
import { useAuth } from '../lib/auth'

type AlphaMessage = GeneralChatMessage & {
  thoughtSteps?: ThoughtStep[]
  restoreResult?: RestoreResult
  isStreaming?: boolean
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ node: _n, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed text-white/70" {...props} />,
        ul: ({ node: _n, ...props }) => <ul className="mb-2 list-disc space-y-1 pl-4 text-white/70" {...props} />,
        ol: ({ node: _n, ...props }) => <ol className="mb-2 list-decimal space-y-1 pl-4 text-white/70" {...props} />,
        li: ({ node: _n, ...props }) => <li className="text-[13px] leading-relaxed" {...props} />,
        a: ({ node: _n, ...props }) => <a className="text-[#D6FF00] hover:underline" target="_blank" rel="noreferrer" {...props} />,
        strong: ({ node: _n, ...props }) => <strong className="font-bold text-white" {...props} />,
        code: ({ node: _n, ...props }) => <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[12px] text-[#D6FF00]/80" {...props} />,
        pre: ({ node: _n, ...props }) => <pre className="my-2 overflow-x-auto rounded-xl bg-black/40 p-3 text-[12px] text-white/60" {...props} />,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

function ChatContent() {
  const { user, profile } = useAuth()
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null)
  const [messages, setMessages] = useState<AlphaMessage[]>([])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    void hydrateChatHistory()
  }, [])

  useEffect(() => {
    setThreads(getChatThreads())
  }, [activeThread])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  const updateLastMessage = useCallback((updater: (prev: AlphaMessage) => AlphaMessage) => {
    setMessages((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last) next[next.length - 1] = updater(last)
      return next
    })
  }, [])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isGenerating) return

    setInput('')
    setIsGenerating(true)

    let thread = activeThread
    if (!thread) {
      thread = createChatThread(text)
      setActiveThread(thread)
    }

    const userMsg: AlphaMessage = {
      id: uid(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }

    const aiMsg: AlphaMessage = {
      id: uid(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      thoughtSteps: [],
      isStreaming: true,
    }

    setMessages((prev) => [...prev, userMsg, aiMsg])
    scrollToBottom()

    try {
      abortRef.current = new AbortController()
      const res = await fetch('/api/alpha/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          threadId: thread.id,
          history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))

              switch (event.type) {
                case 'thought_step': {
                  updateLastMessage((prev) => {
                    const steps = [...(prev.thoughtSteps || [])]
                    const existing = steps.findIndex((s) => s.id === event.step.id)
                    if (existing >= 0) {
                      steps[existing] = event.step
                    } else {
                      steps.push(event.step)
                    }
                    return { ...prev, thoughtSteps: steps }
                  })
                  scrollToBottom()
                  break
                }
                case 'content': {
                  updateLastMessage((prev) => ({
                    ...prev,
                    content: (prev.content || '') + event.text,
                  }))
                  scrollToBottom()
                  break
                }
                case 'restore_result': {
                  updateLastMessage((prev) => ({
                    ...prev,
                    restoreResult: event.result,
                  }))
                  scrollToBottom()
                  break
                }
                case 'done': {
                  updateLastMessage((prev) => ({ ...prev, isStreaming: false }))
                  break
                }
                case 'error': {
                  updateLastMessage((prev) => ({
                    ...prev,
                    content: prev.content || `Error: ${event.message}`,
                    isStreaming: false,
                  }))
                  break
                }
              }
            } catch {}
          }
        }
      }

      // Save final state
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && thread) {
          const updatedThread: ChatThread = {
            ...thread,
            messages: [...thread.messages, userMsg, { ...last, isStreaming: undefined }],
            updatedAt: new Date().toISOString(),
          }
          saveChatThread(updatedThread)
          setActiveThread(updatedThread)
        }
        return prev
      })
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        updateLastMessage((prev) => ({
          ...prev,
          content: prev.content || 'Something went wrong. Please try again.',
          isStreaming: false,
        }))
      }
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }, [input, isGenerating, activeThread, messages, scrollToBottom, updateLastMessage])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleThreadSelect = (thread: ChatThread) => {
    setActiveThread(thread)
    setMessages(thread.messages as AlphaMessage[])
    setSidebarOpen(false)
  }

  const handleNewChat = () => {
    setActiveThread(null)
    setMessages([])
    setInput('')
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-[100dvh] flex-col bg-[#0A0A0A]">
      {/* Top Bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center border-b border-white/[0.04] bg-[#0A0A0A]/90 px-4 backdrop-blur-xl">
        <button
          onClick={() => setSidebarOpen(true)}
          className="grid size-9 place-items-center rounded-xl border border-white/[0.06] text-white/40 transition hover:border-white/[0.12] hover:text-white"
          aria-label="Open menu"
        >
          <Menu size={17} />
        </button>
        <div className="mx-auto flex items-center gap-2">
          <span className="font-syne text-sm font-extrabold tracking-[0.14em] text-white">
            ALPHATEKX
          </span>
        </div>
        <div className="size-9" />
      </header>

      {/* Hamburger Sidebar */}
      <HamburgerSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onThreadSelect={handleThreadSelect}
        activeThreadId={activeThread?.id}
      />

      {/* Chat Area */}
      <div
        ref={scrollRef}
        className="alpha-chat-scroll flex-1 overflow-y-auto pt-14"
        style={{ scrollBehavior: 'smooth' }}
      >
        {isEmpty ? (
          /* Empty State — Centered Input */
          <div className="flex h-full flex-col items-center justify-center px-4 pb-24">
            {/* Logo mark */}
            <div className="mb-8 flex flex-col items-center">
              <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-[#D6FF00]/20 bg-[#D6FF00]/[0.04]">
                <Sparkles size={24} className="text-[#D6FF00]" />
              </div>
              <h1 className="font-syne text-xl font-extrabold text-white">What do you want to restore?</h1>
              <p className="mt-2 text-[13px] text-white/25">Paste a link, describe the problem, or upload code</p>
            </div>

            {/* Centered Input */}
            <div className="w-full max-w-[560px]">
              <div className="alpha-input-glow group relative flex items-end rounded-2xl border border-white/[0.08] bg-white/[0.03] transition-all duration-300">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder=""
                  rows={1}
                  className="min-h-[52px] w-full resize-none bg-transparent py-3.5 pl-4 pr-12 text-[15px] text-white outline-none placeholder:text-transparent"
                  style={{ maxHeight: 120 }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = Math.min(target.scrollHeight, 120) + 'px'
                  }}
                />
                {!input && <AnimatedPlaceholder />}
                <button
                  onClick={() => void handleSend()}
                  disabled={!input.trim() || isGenerating}
                  className="mb-2.5 mr-2.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[#D6FF00] text-black transition hover:bg-[#C2E600] disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  {isGenerating ? <Square size={14} /> : <Send size={14} />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="mx-auto max-w-[680px] px-4 py-6 pb-32">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="mb-6"
                >
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#D6FF00]/[0.08] px-4 py-3 text-[14px] text-white/80">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg bg-[#D6FF00]/[0.06]">
                        <Bot size={13} className="text-[#D6FF00]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* Chain of Thought */}
                        {msg.thoughtSteps && msg.thoughtSteps.length > 0 && (
                          <ChainOfThought steps={msg.thoughtSteps} />
                        )}

                        {/* Message Content */}
                        {msg.content && (
                          <div className="text-[14px] leading-relaxed">
                            <Markdown>{msg.content}</Markdown>
                          </div>
                        )}

                        {/* Restore Result */}
                        {msg.restoreResult && (
                          <RestoredVersionCard result={msg.restoreResult} />
                        )}

                        {/* Streaming indicator */}
                        {msg.isStreaming && !msg.content && (
                          <div className="flex items-center gap-2 py-2">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6FF00]" />
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6FF00]/60 [animation-delay:200ms]" />
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D6FF00]/30 [animation-delay:400ms]" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Bottom Input (when messages exist) */}
      {!isEmpty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.04] bg-[#0A0A0A]/90 px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto max-w-[680px]">
            <div className="alpha-input-glow group relative flex items-end rounded-2xl border border-white/[0.08] bg-white/[0.03] transition-all duration-300">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder=""
                rows={1}
                className="min-h-[48px] w-full resize-none bg-transparent py-3 pl-4 pr-12 text-[14px] text-white outline-none placeholder:text-transparent"
                style={{ maxHeight: 100 }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = Math.min(target.scrollHeight, 100) + 'px'
                }}
              />
              {!input && <AnimatedPlaceholder />}
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || isGenerating}
                className="mb-2 mr-2 grid size-8 shrink-0 place-items-center rounded-xl bg-[#D6FF00] text-black transition hover:bg-[#C2E600] disabled:opacity-20 disabled:cursor-not-allowed"
              >
                {isGenerating ? <Square size={13} /> : <Send size={13} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AlphaChat() {
  return (
    <ChatAuthWrapper>
      <ChatContent />
    </ChatAuthWrapper>
  )
}
