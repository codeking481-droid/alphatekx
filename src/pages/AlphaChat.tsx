import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, Send, Square, User, Bot, Sparkles, Paperclip, X, Film, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import ChatAuthWrapper from '../components/auth/ChatAuthWrapper'
import AnimatedPlaceholder from '../components/alpha/AnimatedPlaceholder'
import ChainOfThought, { type ThoughtStep } from '../components/alpha/ChainOfThought'
import GoldCard, { type GoldCardProps } from '../components/alpha/GoldCard'
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
import { supabase } from '../lib/supabase'

type AlphaMessage = GeneralChatMessage & {
  thoughtSteps?: ThoughtStep[]
  restoreResult?: any
  videoResult?: { videoUrl: string; editId: string; plan: any; elapsed: string }
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
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
    if ((!text && !attachedFile) || isGenerating) return

    const sendText = text || (attachedFile ? 'Edit this video to look professional' : '')
    setInput('')
    setIsGenerating(true)

    // Upload file if attached
    let fileUrl: string | null = null
    let fileType: string | null = null
    if (attachedFile) {
      setUploading(true)
      fileUrl = await uploadVideo(attachedFile)
      fileType = attachedFile.type
      setUploading(false)
      handleRemoveFile()
      if (!fileUrl) {
        updateLastMessage((prev) => ({
          ...prev,
          content: 'Upload failed. Please try again.',
          isStreaming: false,
        }))
        setIsGenerating(false)
        return
      }
    }

    let thread = activeThread
    if (!thread) {
      thread = createChatThread(text)
      setActiveThread(thread)
    }

    const userMsg: AlphaMessage = {
      id: uid(),
      role: 'user',
      content: sendText + (fileUrl ? '\n\n[Video attached]' : ''),
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
      let authToken = ''
      try {
        const { data: { session: activeSession } } = await supabase?.auth.getSession() ?? { data: { session: null } }
        authToken = activeSession?.access_token || ''
      } catch {}

      const res = await fetch('/api/alpha/repair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          message: sendText,
          threadId: thread.id,
          history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
          fileUrl: fileUrl || undefined,
          fileType: fileType || undefined,
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
                case 'video_result': {
                  updateLastMessage((prev) => ({
                    ...prev,
                    videoResult: event.result,
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
  }, [input, isGenerating, activeThread, messages, scrollToBottom, updateLastMessage, attachedFile])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      alert('Only video files are supported.')
      return
    }
    if (file.size > 2 * 1024 * 1024 * 1024) {
      alert('File too large. Maximum 2GB.')
      return
    }
    setAttachedFile(file)
    const url = URL.createObjectURL(file)
    setAttachedPreview(url)
  }

  const handleRemoveFile = () => {
    setAttachedFile(null)
    if (attachedPreview) URL.revokeObjectURL(attachedPreview)
    setAttachedPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const uploadVideo = async (file: File): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase?.auth.getSession() ?? { data: { session: null } }
      const formData = new FormData()
      formData.append('video', file)
      const res = await fetch('/api/alpha/upload-video', {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: formData,
      })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const data = await res.json()
      return data.url || null
    } catch (err) {
      console.error('Upload error:', err)
      return null
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
              {/* Attached file preview */}
              {attachedFile && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                  <Film size={16} className="text-[#D6FF00]" />
                  <span className="flex-1 truncate text-[13px] text-white/70">{attachedFile.name}</span>
                  <span className="text-[11px] text-white/30">{(attachedFile.size / 1024 / 1024).toFixed(1)}MB</span>
                  <button onClick={handleRemoveFile} className="text-white/40 hover:text-white"><X size={14} /></button>
                </div>
              )}
              <div className="alpha-input-glow group relative flex items-end rounded-2xl border border-white/[0.08] bg-white/[0.03] transition-all duration-300">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating}
                  className="mb-2.5 ml-2.5 grid size-8 shrink-0 place-items-center rounded-xl border border-white/[0.08] text-white/30 transition hover:border-[#D6FF00]/30 hover:text-[#D6FF00] disabled:opacity-20 disabled:cursor-not-allowed"
                  title="Attach video"
                >
                  <Paperclip size={14} />
                </button>
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
                {!input && !attachedFile && <AnimatedPlaceholder />}
                <button
                  onClick={() => void handleSend()}
                  disabled={(!input.trim() && !attachedFile) || isGenerating || uploading}
                  className="mb-2.5 mr-2.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[#D6FF00] text-black transition hover:bg-[#C2E600] disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : isGenerating ? <Square size={14} /> : <Send size={14} />}
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
                          <GoldCard
                            title={msg.restoreResult.title || 'Restoration'}
                            broken={{
                              label: 'Before',
                              value: msg.restoreResult.metrics?.[0]?.before || '—',
                              details: msg.restoreResult.metrics?.map((m: any) => `${m.label}: ${m.before}`) || [],
                            }}
                            restored={{
                              label: 'After',
                              value: msg.restoreResult.metrics?.[0]?.after || '—',
                              details: msg.restoreResult.metrics?.map((m: any) => `${m.label}: ${m.after}`) || [],
                            }}
                            metrics={msg.restoreResult.metrics?.map((m: any) => ({
                              label: m.label,
                              before: m.before,
                              after: m.after,
                            })) || []}
                            toolType={msg.restoreResult.url ? 'website' : 'website'}
                          />
                        )}

                        {/* Video Result */}
                        {msg.videoResult && (
                          <div className="mt-3 rounded-2xl border border-[#D6FF00]/20 bg-[#D6FF00]/[0.04] p-4">
                            <div className="mb-2 flex items-center gap-2">
                              <Film size={16} className="text-[#D6FF00]" />
                              <span className="font-syne text-sm font-bold text-white">Video Restored</span>
                            </div>
                            <video
                              controls
                              className="w-full rounded-xl border border-white/[0.06]"
                              src={msg.videoResult.videoUrl}
                            />
                            <div className="mt-2 flex items-center gap-3 text-[12px] text-white/40">
                              <span>Style: {msg.videoResult.plan?.style || 'default'}</span>
                              <span>Edits: {msg.videoResult.plan?.operations || 0}</span>
                              <span>Took {msg.videoResult.elapsed}s</span>
                            </div>
                            <a
                              href={msg.videoResult.videoUrl}
                              download
                              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#D6FF00] px-3 py-1.5 text-[12px] font-bold text-black transition hover:bg-[#C2E600]"
                            >
                              Download Restored Video
                            </a>
                          </div>
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
            {/* Attached file preview */}
            {attachedFile && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                <Film size={16} className="text-[#D6FF00]" />
                <span className="flex-1 truncate text-[13px] text-white/70">{attachedFile.name}</span>
                <span className="text-[11px] text-white/30">{(attachedFile.size / 1024 / 1024).toFixed(1)}MB</span>
                <button onClick={handleRemoveFile} className="text-white/40 hover:text-white"><X size={14} /></button>
              </div>
            )}
            <div className="alpha-input-glow group relative flex items-end rounded-2xl border border-white/[0.08] bg-white/[0.03] transition-all duration-300">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isGenerating}
                className="mb-2 ml-2 grid size-8 shrink-0 place-items-center rounded-xl border border-white/[0.08] text-white/30 transition hover:border-[#D6FF00]/30 hover:text-[#D6FF00] disabled:opacity-20 disabled:cursor-not-allowed"
                title="Attach video"
              >
                <Paperclip size={14} />
              </button>
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
              {!input && !attachedFile && <AnimatedPlaceholder />}
              <button
                onClick={() => void handleSend()}
                disabled={(!input.trim() && !attachedFile) || isGenerating || uploading}
                className="mb-2 mr-2 grid size-8 shrink-0 place-items-center rounded-xl bg-[#D6FF00] text-black transition hover:bg-[#C2E600] disabled:opacity-20 disabled:cursor-not-allowed"
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : isGenerating ? <Square size={13} /> : <Send size={13} />}
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
