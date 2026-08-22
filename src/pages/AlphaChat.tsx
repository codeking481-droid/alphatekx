import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, Send, Square, User, Bot, Sparkles, Paperclip, X, Film, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import ChatAuthWrapper from '../components/auth/ChatAuthWrapper'
import AnimatedPlaceholder from '../components/alpha/AnimatedPlaceholder'
import ChainOfThought, { type ThoughtStep } from '../components/alpha/ChainOfThought'
import GoldCard, { type GoldCardProps } from '../components/alpha/GoldCard'
import HamburgerSidebar from '../components/alpha/HamburgerSidebar'
import ScanningCard, { type ScanLog } from '../components/alpha/restore/ScanningCard'
import ErrorsCard, { type ScanError } from '../components/alpha/restore/ErrorsCard'
import BackupCard from '../components/alpha/restore/BackupCard'
import FixingCard, { type DiffEntry } from '../components/alpha/restore/FixingCard'
import GoldProofCard, { type ProofData } from '../components/alpha/restore/GoldProofCard'
import ActionCard from '../components/alpha/restore/ActionCard'
import GitHubApplyCard from '../components/alpha/restore/GitHubApplyCard'
import RestoreDeliveryCard from '../components/alpha/restore/RestoreDeliveryCard'
import GitHubConnectGate from '../components/alpha/restore/GitHubConnectGate'
import FixPromptCard from '../components/alpha/restore/FixPromptCard'
import ScreenshotComparison from '../components/alpha/restore/ScreenshotComparison'
import SecurityFindings from '../components/alpha/restore/SecurityFindings'
import ActivityStream from '../components/alpha/restore/ActivityStream'
import PlainEnglishReport from '../components/alpha/restore/PlainEnglishReport'
import CodeDiffCard from '../components/alpha/restore/cards/CodeDiffCard'
import TerminalCard from '../components/alpha/restore/cards/TerminalCard'
import SystemGraphAliveCard from '../components/alpha/restore/cards/SystemGraphAliveCard'
import ReasoningTrace from '../components/alpha/restore/ReasoningTrace'
import RestorationComplete from '../components/alpha/restore/RestorationComplete'
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

type RestoreCardState = {
  scanning?: { logs: ScanLog[]; status: 'start' | 'done' | 'error' }
  screenshots?: Array<{ filename: string; label: string }>
  scanId?: string
  errors?: { errors: ScanError[]; severity: string; status: 'start' | 'done' }
  backup?: { status: 'start' | 'done'; scanId?: string; version?: string }
  fixing?: { files: string[]; diffs: DiffEntry[]; status: 'start' | 'done'; summary?: string; _refreshKey?: number }
  goldproof?: ProofData | null
  action?: { scanId: string; restoredZipUrl?: string | null; rollbackUrl?: string; redeploySteps?: string[]; metrics?: any }
  github?: boolean
  fixprompt?: { scanId: string; url: string; errorsFound: number; severity: string; summary: string }
  isRunning?: boolean
  // V2 pipeline state
  v2?: {
    restorationId?: string
    screenshotBefore?: string | null
    screenshotAfter?: string | null
    verified?: boolean | null
    githubGateRequired?: boolean
    experimentId?: string
    experimentPassed?: boolean
    prUrl?: string | null
    prNumber?: number | null
    branch?: string | null
    repoFullName?: string
    securityFindings?: any[]
    securitySummary?: any
    plainEnglish?: { wetinHappen: string[]; wetinFitHappen: string[]; wetinAlphaDo: string[] }
    tier?: 'free' | 'silver' | 'gold'
    restoreComplete?: boolean
    pipelineDone?: boolean
    deliverables?: any
  }
}

type AlphaEventType = {
  type: string
  timestamp: string
  data?: any
}

type AlphaMessage = GeneralChatMessage & {
  thoughtSteps?: ThoughtStep[]
  restoreResult?: any
  videoResult?: { videoUrl: string; editId: string; plan: any; elapsed: string }
  restoreCards?: RestoreCardState
  alphaEvents?: AlphaEventType[]
  alphaReasoning?: { assessment: string; hypotheses: { cause: string; confidence: number }[]; evidence: string; decision: string }
  isStreaming?: boolean
}

function extractUrl(text: string): string | null {
  // Try explicit protocol first
  const match = text.match(/https?:\/\/[^\s"'<>]+/)
  if (match) return match[0]

  // Try bare domain: kraitin.vercel.app, mysite.com, sub.domain.co.uk/path
  const bareMatch = text.match(/\b([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+(?:com|net|org|io|co|app|dev|vercel\.app|netlify\.app|pages\.dev|workers\.dev|github\.io|herokuapp\.com|onrender\.com|name\.ng)(?:\/[^\s"'<>]*)?/i)
  if (bareMatch) {
    return 'https://' + bareMatch[0]
  }
  return null
}

function isGitHubRepoUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'github.com') return false
    const parts = parsed.pathname.replace(/^\//, '').replace(/\/$/, '').split('/')
    return parts.length >= 2 && Boolean(parts[0]) && Boolean(parts[1])
  } catch { return false }
}

// "fix my whole site", "restore every page", "the entire website"…
function detectWholeSite(text: string): boolean {
  return /\b(?:whole|entire|complete|full)\s+(?:site|website|web\s?site)\b|\bevery\s+page\b|\ball\s+(?:the\s+)?pages\b/i.test(text)
}

// Pronoun follow-ups after a scan: "fix it", "repair that", "scan the site".
const FOLLOWUP_RE = /^\s*(?:please\s+)?(?:alpha[,\s]+)?(?:fix|restore|repair|scan|check|heal|rebuild|unbreak)\s+(?:it|that|this|dem|am|the\s+(?:site|website|page|link)|my\s+(?:site|website|page))\b[\s!?.]*$/i

function isFollowupRestore(text: string): boolean {
  return FOLLOWUP_RE.test(text)
}

function detectRestoreIntent(text: string): 'scan' | 'full' {
  const lower = text.toLowerCase()
  const fixKeywords = /\b(?:fix|restore|repair|solve|patch|heal|improve|optimize|make\s+better|clean\s*up|rebuild|overhaul|remedy|correct|rectify|update|upgrade|debug|troubleshoot)\b/
  const scanKeywords = /\b(?:scan|check|analyze|analyse|review|audit|inspect|examine|look\s*at|diagnose|test|probe|assess|evaluate|survey|report|find|detect|identify)\b/
  if (fixKeywords.test(lower)) return 'full'
  if (scanKeywords.test(lower)) return 'scan'
  return 'scan'
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
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [attachedPreviews, setAttachedPreviews] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const detectedUrlRef = useRef<string | null>(null)
  const lastSiteUrlRef = useRef<string | null>(null)
  const lastIntentRef = useRef<'scan' | 'full'>('scan')
  const autoFixTriggeredRef = useRef(false)

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
    if ((!text && attachedFiles.length === 0) || isGenerating) return

    const sendText = text || (attachedFiles.length > 0 ? 'Edit this video to look professional' : '')
    setInput('')
    setIsGenerating(true)

    // Upload files if attached
    let fileUrl: string | null = null
    let fileType: string | null = null

    // Detect URL in message — any prominent URL runs the real restoration pipeline
    let detectedUrl = extractUrl(sendText)
    // Smart follow-ups: "fix it" / "scan that" after a URL was mentioned earlier
    if (!detectedUrl && isFollowupRestore(sendText) && lastSiteUrlRef.current) {
      detectedUrl = lastSiteUrlRef.current
    }
    if (detectedUrl) lastSiteUrlRef.current = detectedUrl
    detectedUrlRef.current = detectedUrl
    const isWebsiteRestore = Boolean(detectedUrl)
    const wholeSite = detectWholeSite(sendText)
    // Restore intent without a URL → Alpha asks for the URL (conversational step 1)
    const asksRestoreNoUrl = !detectedUrl && !fileUrl && attachedFiles.length === 0 &&
      /\b(fix|restore|repair|recover|resurrect|unbreak|heal)\b/i.test(sendText) &&
      /\b(site|website|web\s?site|page|web\s?page|url|link|blog|store|landing)\b/i.test(sendText)

    if (attachedFiles.length > 0) {
      setUploading(true)
      try {
        // Upload first file (primary), then queue the rest
        fileUrl = await uploadVideo(attachedFiles[0])
        fileType = attachedFiles[0].type
      } catch {
        fileUrl = null
      } finally {
        setUploading(false)
      }
      handleRemoveAllFiles()
      if (!fileUrl) {
        setMessages((prev) => [...prev, {
          id: uid(),
          role: 'assistant',
          content: 'Upload failed. Please try again.',
          createdAt: new Date().toISOString(),
          isStreaming: false,
        }])
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
      content: sendText + (fileUrl ? `\n\n[${attachedFiles.length > 1 ? attachedFiles.length + ' videos attached' : 'Video attached'}]` : ''),
      createdAt: new Date().toISOString(),
    }

    const aiMsg: AlphaMessage = {
      id: uid(),
      role: 'assistant',
      content: asksRestoreNoUrl
        ? "Sure! 📩 Send me your website URL (e.g. `https://example.com`) and I'll scan it, fix every issue, and restore it — right here in this chat."
        : '',
      createdAt: new Date().toISOString(),
      thoughtSteps: [],
      alphaEvents: [],
      restoreCards: undefined,
      isStreaming: !asksRestoreNoUrl,
    }

    setMessages((prev) => [...prev, userMsg, aiMsg])
    scrollToBottom()

    if (asksRestoreNoUrl) {
      setIsGenerating(false)
      return
    }

    // If website restore detected, start the real SSE pipeline — every live
    // site goes through the V4 agentic restoration chain of thought.
    if (isWebsiteRestore && detectedUrl) {
      try {
        abortRef.current = new AbortController()
        const intent = detectRestoreIntent(sendText)
        lastIntentRef.current = intent
        autoFixTriggeredRef.current = false
        let streamUrl: string

        if (isGitHubRepoUrl(detectedUrl)) {
          // GitHub repo → V2 pipeline (clone, scan, experiment, PR)
          streamUrl = `/api/restore/v2?url=${encodeURIComponent(detectedUrl)}&mode=${intent === 'full' ? 'full' : 'scan-only'}&message=${encodeURIComponent(sendText)}`
        } else {
          // Live website → V4 agentic pipeline (7-step chain-of-thought restoration).
          // Whole-site phrasing restores EVERY page Alpha can reach.
          const pagesParam = wholeSite ? '&pages=15' : ''
          streamUrl = `/api/restore/v3?url=${encodeURIComponent(detectedUrl)}&mode=${intent === 'full' ? 'full' : 'scan-only'}${pagesParam}&message=${encodeURIComponent(sendText)}`
        }

        const res = await fetch(streamUrl, { signal: abortRef.current.signal })

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
                handleRestoreEvent(event, detectedUrl)
              } catch {}
            }
          }
        }

        // Mark done
        updateLastMessage((prev) => ({
          ...prev,
          isStreaming: false,
          restoreCards: { ...prev.restoreCards, isRunning: false },
        }))

        // Save final state
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && thread) {
            const updatedThread: ChatThread = {
              ...thread,
              messages: [...thread.messages, userMsg, { ...last, isStreaming: undefined, restoreCards: undefined }],
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
            content: prev.content || `Error: ${err.message}`,
            isStreaming: false,
            restoreCards: { ...prev.restoreCards, isRunning: false },
          }))
        }
      } finally {
        setIsGenerating(false)
        abortRef.current = null
      }
      return
    }

    // Normal (non-URL) path — existing repair pipeline
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
          history: [...messages.slice(-10), userMsg].map((m) => ({ role: m.role, content: m.content })),
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

      // Stream ended — ensure streaming state is cleared even if no `done` event arrived
      updateLastMessage((prev) => (prev.isStreaming ? { ...prev, isStreaming: false } : prev))

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
      updateLastMessage((prev) => {
        if (!prev.isStreaming && err.name === 'AbortError') return prev
        return {
          ...prev,
          content: err.name === 'AbortError' ? prev.content : (prev.content || 'Something went wrong. Please try again.'),
          isStreaming: false,
        }
      })
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }, [input, isGenerating, activeThread, messages, scrollToBottom, updateLastMessage, attachedFiles])

  const handleRestoreEvent = useCallback((event: any, url: string) => {
    // Handle alpha events from event-bus
    if (event.type === 'alpha_event' && event.event) {
      const alphaEvent = event.event
      updateLastMessage((prev) => {
        const events = [...(prev.alphaEvents || [])]
        events.push(alphaEvent)

        // Handle reasoning trace events
        let reasoning = prev.alphaReasoning
        if (alphaEvent.type === 'REASONING_TRACE' && alphaEvent.data) {
          reasoning = alphaEvent.data
        }

        return { ...prev, alphaEvents: events, alphaReasoning: reasoning }
      })
      scrollToBottom()
      return
    }

    // ===== V3 Pipeline: final summary message (markdown) =====
    if (event.type === 'v3_summary' && event.message) {
      updateLastMessage((prev) => ({ ...prev, content: event.message, isStreaming: false }))
      scrollToBottom()
      return
    }

    // ===== V2 Pipeline Events =====
    if (event.type === 'pipeline_start' || event.type === 'scan_complete' || event.type === 'screenshot_before'
      || event.type === 'experiment_complete' || event.type === 'github_gate_required' || event.type === 'screenshot_after'
      || event.type === 'restore_complete' || event.type === 'pipeline_done' || event.type === 'pipeline_paused'
      || event.type === 'branch_created' || event.type === 'fix_pushed' || event.type === 'pr_created') {
      updateLastMessage((prev) => {
        const cards = { ...(prev.restoreCards || {}) }
        if (!cards.v2) cards.v2 = {}
        const v2 = { ...cards.v2 }

        switch (event.type) {
          case 'pipeline_start':
            v2.restorationId = event.restorationId
            cards.isRunning = true
            break
          case 'scan_complete':
            v2.screenshotBefore = event.data?.screenshotBefore || null
            break
          case 'screenshot_before':
            v2.screenshotBefore = event.data?.screenshotPath || v2.screenshotBefore
            break
          case 'experiment_complete':
            v2.experimentPassed = event.data?.passed
            v2.experimentId = event.data?.experimentId
            break
          case 'github_gate_required':
            v2.githubGateRequired = true
            v2.experimentId = event.experimentId
            v2.restorationId = event.restorationId
            cards.isRunning = false
            break
          case 'pipeline_paused':
            if (event.reason === 'github_gate') {
              v2.githubGateRequired = true
            }
            if (event.reason === 'scan-only' || event.reason === 'no fixable hypothesis found') {
              cards.isRunning = false
            }
            if (event.reason === 'experiment failed') {
              cards.isRunning = false
            }
            break
          case 'branch_created':
            v2.branch = event.branch
            v2.githubGateRequired = false
            cards.isRunning = true
            break
          case 'fix_pushed':
            v2.branch = event.branch
            break
          case 'pr_created':
            v2.prUrl = event.prUrl
            v2.prNumber = event.prNumber
            break
          case 'screenshot_after':
            v2.screenshotAfter = event.data?.screenshotPath || null
            v2.verified = event.data?.verified ?? null
            break
          case 'restore_complete':
            v2.screenshotBefore = event.data?.screenshots?.before || v2.screenshotBefore
            v2.screenshotAfter = event.data?.screenshots?.after || v2.screenshotAfter
            v2.prUrl = event.data?.prUrl || v2.prUrl
            v2.prNumber = event.data?.prNumber || v2.prNumber
            v2.branch = event.data?.branch || v2.branch
            v2.repoFullName = event.data?.repoFullName || v2.repoFullName
            v2.verified = event.data?.verified ?? v2.verified
            v2.securityFindings = event.data?.security?.findings || v2.securityFindings
            v2.securitySummary = event.data?.security?.summary || v2.securitySummary
            v2.plainEnglish = event.data?.plainEnglish || v2.plainEnglish
            v2.tier = event.data?.tier || v2.tier || 'gold'
            v2.restoreComplete = true
            v2.deliverables = event.data?.deliverables || v2.deliverables || null
            if (!v2.restorationId && event.restorationId) v2.restorationId = event.restorationId
            cards.isRunning = false
            break
          case 'pipeline_done':
            v2.pipelineDone = true
            cards.isRunning = false
            break
        }

        cards.v2 = v2
        return { ...prev, restoreCards: cards }
      })
      scrollToBottom()
      return
    }

    // ===== V1 Legacy Pipeline Events =====
    // thought_step events (shared by V1 and V2)
    if (event.type === 'thought_step' && event.step) {
      updateLastMessage((prev) => {
        const steps = [...(prev.thoughtSteps || [])]
        const existing = steps.findIndex((s: ThoughtStep) => s.id === event.step.id)
        if (existing >= 0) {
          steps[existing] = event.step
        } else {
          steps.push(event.step)
        }
        return { ...prev, thoughtSteps: steps }
      })
      scrollToBottom()
      return
    }

    updateLastMessage((prev) => {
      const cards = { ...(prev.restoreCards || {}) }

      switch (event.type) {
        case 'card': {
          const cardName = event.card as keyof RestoreCardState
          if (cardName === 'preview') break
          if (cardName === 'scanning') {
            cards.scanning = { logs: cards.scanning?.logs || [], status: event.status }
            if (event.data?.scanId) cards.scanId = event.data.scanId
          } else if (cardName === 'errors') {
            cards.errors = { errors: event.data?.errors || [], severity: event.data?.severity || 'unknown', status: event.status }
          } else if (cardName === 'backup') {
            cards.backup = { status: event.status, scanId: event.data?.scanId, version: event.data?.version }
          } else if (cardName === 'fixing') {
            cards.fixing = { files: event.data?.files || cards.fixing?.files || [], diffs: cards.fixing?.diffs || [], status: event.status, summary: event.data?.summary }
          } else if (cardName === 'goldproof') {
            cards.goldproof = event.data
          } else if (cardName === 'action') {
            cards.action = event.data
            if (event.status === 'done') cards.github = true
          }
          break
        }
        case 'log': {
          const cardName = event.card as keyof RestoreCardState
          if (cardName === 'scanning' && cards.scanning) {
            cards.scanning = { ...cards.scanning, logs: [...cards.scanning.logs, { text: event.text }] }
          } else if (cardName === 'errors' && cards.errors) {
            // errors logs are informational, no state change needed
          }
          break
        }
        case 'diff': {
          if (cards.fixing) {
            cards.fixing = {
              ...cards.fixing,
              diffs: [...(cards.fixing.diffs || []), { filename: event.filename, old: event.old, newContent: event.newContent }],
              files: [...new Set([...(cards.fixing.files || []), event.filename])],
              _refreshKey: Date.now(),
            }
          }
          break
        }
        case 'preview_refresh': {
          // Trigger live preview iframe refresh in FixingCard
          if (cards.fixing) {
            cards.fixing = { ...cards.fixing, _refreshKey: Date.now() }
          }
          break
        }
        case 'screenshot': {
          const existing = cards.screenshots || []
          cards.screenshots = [...existing, { filename: event.filename, label: event.label }]
          if (event.scanId) cards.scanId = event.scanId
          break
        }
        case 'done': {
          cards.isRunning = false
          cards.preview = { url, status: 'loaded' }
          break
        }
        case 'fixprompt': {
          cards.isRunning = false
          const summary = event.scanSummary || event
          cards.fixprompt = {
            scanId: event.scanId || '',
            url: summary.url || url,
            errorsFound: summary.errorsFound || 0,
            severity: summary.severity || 'unknown',
            summary: summary.summary || '',
          }
          // Show a proper conversation message after scan
          const errCount = summary.errorsFound || 0
          const tech = summary.tech || 'unknown'
          const sev = summary.severity || 'low'
          const scanUrl = summary.url || url
          const isNonGithub = !isGitHubRepoUrl(scanUrl)
          const isAutoFix = lastIntentRef.current === 'full' && errCount > 0
          let responseMsg = `I analyzed **${scanUrl}** and found **${errCount} issues** (${sev} severity). Tech stack: ${tech}.\n\n`
          if (errCount === 0) {
            responseMsg += `The site looks healthy — no critical issues detected.`
          } else if (isAutoFix) {
            responseMsg += `Found ${errCount} issues. **Fixing now...**`
          } else if (isNonGithub) {
            responseMsg += `Here's what I found:\n\n`
            const errSummary = summary.summary || ''
            if (errSummary) responseMsg += `${errSummary}\n\n`
            responseMsg += `This is a **live website** — I can fix the issues and restore it in two ways:\n\n`
            responseMsg += `1. **Fix & Download** — I'll generate a fixed version of the HTML and you can download it as a ZIP\n`
            responseMsg += `2. **Fix & Push to GitHub** — Give me a GitHub repo URL and I'll push the fixes so it redeploys automatically`
          } else {
            responseMsg += `Here's what I found:\n\n`
            const errSummary = summary.summary || ''
            if (errSummary) responseMsg += `${errSummary}\n\n`
            responseMsg += `**How would you like me to restore it?**\n\n`
            responseMsg += `1. **Fix & Push to GitHub** — I'll create a branch, push the fixes, and open a PR\n`
            responseMsg += `2. **Fix & Download** — I'll generate a fixed version you can download as a ZIP`
          }
          return { ...prev, restoreCards: cards, content: responseMsg }
        }
        case 'error': {
          cards.isRunning = false
          if (event.message) {
            return { ...prev, restoreCards: cards, content: event.message }
          }
          break
        }
      }

      return { ...prev, restoreCards: cards }
    })
    scrollToBottom()
  }, [updateLastMessage, scrollToBottom])

  const handleFixNow = useCallback(async (scanId: string, url: string) => {
    setIsGenerating(true)
    updateLastMessage((prev) => {
      const cards = { ...(prev.restoreCards || {}) }
      cards.fixprompt = undefined
      cards.fixing = { files: [], diffs: [], status: 'start' }
      cards.isRunning = true
      return { ...prev, restoreCards: cards }
    })
    scrollToBottom()

    try {
      abortRef.current = new AbortController()
      const fixUrl = `/api/restore/fix?scanId=${encodeURIComponent(scanId)}`
      const res = await fetch(fixUrl, { signal: abortRef.current.signal })
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
              const data = JSON.parse(line.slice(6))
              handleRestoreEvent(data, url)
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        updateLastMessage((prev) => {
          const cards = { ...(prev.restoreCards || {}) }
          cards.isRunning = false
          return {
            ...prev,
            content: prev.content || `Fix failed: ${err.message}`,
            restoreCards: cards,
          }
        })
      }
    } finally {
      setIsGenerating(false)
      scrollToBottom()
    }
  }, [updateLastMessage, scrollToBottom, handleRestoreEvent])

  // Auto-trigger fix when user said "fix/restore" and scan just finished
  useEffect(() => {
    if (lastIntentRef.current !== 'full' || autoFixTriggeredRef.current) return
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg?.restoreCards?.fixprompt || lastMsg.restoreCards?.fixing) return
    const fp = lastMsg.restoreCards.fixprompt
    if (!fp || fp.errorsFound === 0) return
    autoFixTriggeredRef.current = true
    // Auto-trigger fix for non-GitHub live sites (fix & download)
    if (!isGitHubRepoUrl(fp.url)) {
      void handleFixNow(fp.scanId, fp.url)
    }
  }, [messages, handleFixNow])

  const handleCreateAndPush = useCallback(async (scanId: string, originalUrl: string, repoUrl: string) => {
    if (!isGitHubRepoUrl(repoUrl)) {
      updateLastMessage((prev) => ({
        ...prev,
        content: (prev.content || '') + '\n\nThat doesn\'t look like a GitHub repo URL (expected `github.com/user/repo`). Please try again.',
      }))
      scrollToBottom()
      return
    }

    setIsGenerating(true)
    updateLastMessage((prev) => {
      const cards = { ...(prev.restoreCards || {}) }
      cards.fixprompt = undefined
      cards.isRunning = true
      return { ...prev, restoreCards: cards }
    })
    scrollToBottom()

    try {
      abortRef.current = new AbortController()

      // Step 1: Fix the site
      updateLastMessage((prev) => ({
        ...prev,
        content: `Got it — pushing fixes to **${repoUrl}**. Let me generate the fix and push a PR...`,
        thoughtSteps: [...(prev.thoughtSteps || []), {
          id: uid(),
          status: 'active',
          label: `Fixing ${originalUrl}`,
          detail: 'Applying AI-generated fixes to scanned issues',
        }],
      }))
      scrollToBottom()

      const fixRes = await fetch(`/api/restore/fix?scanId=${encodeURIComponent(scanId)}`, {
        signal: abortRef.current.signal,
      })
      if (!fixRes.ok) throw new Error(`Fix failed: HTTP ${fixRes.status}`)

      // Consume fix stream until done
      const fixReader = fixRes.body?.getReader()
      if (fixReader) {
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await fixReader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() || ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try { handleRestoreEvent(JSON.parse(line.slice(6)), originalUrl) } catch {}
            }
          }
        }
      }

      // Step 2: Push to GitHub (V1 scan flow → direct-push endpoint)
      updateLastMessage((prev) => {
        const steps = [...(prev.thoughtSteps || [])]
        steps.push({
          id: uid(),
          status: 'completed',
          label: `Fix ready, pushing to ${repoUrl}`,
          detail: 'Creating branch and pushing changes',
        })
        return { ...prev, thoughtSteps: steps }
      })
      scrollToBottom()

      const pushRes = await fetch('/api/github/apply-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, repoFullName: repoUrl.replace('https://github.com/', '') }),
        signal: abortRef.current.signal,
      })
      if (!pushRes.ok) {
        const errPayload = await pushRes.json().catch(() => ({}) as { error?: string })
        throw new Error((errPayload as { error?: string }).error || `Push failed: HTTP ${pushRes.status}`)
      }

      const pushReader = pushRes.body?.getReader()
      let pushErrorMessage = ''
      if (pushReader) {
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await pushReader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const evt = JSON.parse(line.slice(6))
              if (evt.type === 'thought_step') handleRestoreEvent(evt, originalUrl)
              else if (evt.type === 'error') pushErrorMessage = String(evt.message || 'Push failed')
            } catch {}
          }
        }
      }
      if (pushErrorMessage) throw new Error(pushErrorMessage)

      updateLastMessage((prev) => ({
        ...prev,
        content: `Done! Fixes pushed to **${repoUrl}**. Your site should redeploy automatically once the CI/CD pipeline picks up the changes.`,
      }))
      scrollToBottom()
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        updateLastMessage((prev) => ({
          ...prev,
          content: prev.content || `Push to GitHub failed: ${err.message}`,
        }))
        scrollToBottom()
      }
    } finally {
      setIsGenerating(false)
      abortRef.current = null
      scrollToBottom()
    }
  }, [updateLastMessage, scrollToBottom, handleRestoreEvent])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const validFiles: File[] = []
    for (const file of files) {
      if (!file.type.startsWith('video/')) continue
      if (file.size > 2 * 1024 * 1024 * 1024) continue
      validFiles.push(file)
    }
    if (validFiles.length === 0) {
      alert('No valid video files. Max 2GB each.')
      return
    }
    const newPreviews = validFiles.map(f => URL.createObjectURL(f))
    setAttachedFiles(prev => [...prev, ...validFiles])
    setAttachedPreviews(prev => [...prev, ...newPreviews])
  }

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
    setAttachedPreviews(prev => {
      URL.revokeObjectURL(prev[index])
      return prev.filter((_, i) => i !== index)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveAllFiles = () => {
    attachedPreviews.forEach(u => URL.revokeObjectURL(u))
    setAttachedFiles([])
    setAttachedPreviews([])
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
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setIsGenerating(false)
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
        onNewChat={handleNewChat}
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
              {/* Attached file previews */}
              {attachedFiles.length > 0 && (
                <div className="mb-2 space-y-1">
                  {attachedFiles.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                      <Film size={16} className="text-[#D6FF00] shrink-0" />
                      <span className="flex-1 truncate text-[13px] text-white/70">{file.name}</span>
                      <span className="text-[11px] text-white/30 shrink-0">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button onClick={() => handleRemoveFile(i)} className="text-white/40 hover:text-white shrink-0"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="alpha-input-glow group relative flex items-end rounded-2xl border border-white/[0.08] bg-white/[0.03] transition-all duration-300">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  multiple
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
                {!input && attachedFiles.length === 0 && <AnimatedPlaceholder />}
                <button
                  onClick={() => void handleSend()}
                  disabled={(!input.trim() && attachedFiles.length === 0) || isGenerating || uploading}
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

                        {/* Restore Result (legacy) */}
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

                        {/* Website Resurrector Cards — sequential ordered flow */}
                        {msg.restoreCards && (
                          <div className="mt-3 space-y-3">
                            {/* Card 1: Scanning */}
                            {msg.restoreCards.scanning && (
                              <ScanningCard logs={msg.restoreCards.scanning.logs} status={msg.restoreCards.scanning.status} />
                            )}
                            {/* Card 2: Errors Found */}
                            {msg.restoreCards.errors && (
                              <ErrorsCard errors={msg.restoreCards.errors.errors} severity={msg.restoreCards.errors.severity} status={msg.restoreCards.errors.status} />
                            )}
                            {/* Card 3: Fix Prompt */}
                            {msg.restoreCards.fixprompt && !msg.restoreCards.fixing && (
                              <FixPromptCard
                                scanId={msg.restoreCards.fixprompt.scanId}
                                url={msg.restoreCards.fixprompt.url}
                                errorsFound={msg.restoreCards.fixprompt.errorsFound}
                                severity={msg.restoreCards.fixprompt.severity}
                                summary={msg.restoreCards.fixprompt.summary}
                                onFixNow={() => handleFixNow(msg.restoreCards!.fixprompt!.scanId, msg.restoreCards!.fixprompt!.url)}
                                onFixAndPush={(scanId, url, repoUrl) => handleCreateAndPush(scanId, url, repoUrl)}
                                isNonGithub={!isGitHubRepoUrl(msg.restoreCards.fixprompt.url)}
                              />
                            )}
                            {/* Card 4: Backup */}
                            {msg.restoreCards.backup && (
                              <BackupCard status={msg.restoreCards.backup.status} scanId={msg.restoreCards.backup.scanId} version={msg.restoreCards.backup.version} />
                            )}
                            {/* Card 5: Fixing */}
                            {msg.restoreCards.fixing && (
                              <FixingCard files={msg.restoreCards.fixing.files} diffs={msg.restoreCards.fixing.diffs} status={msg.restoreCards.fixing.status} summary={msg.restoreCards.fixing.summary} />
                            )}
                            {/* Card 6: Gold Proof */}
                            {msg.restoreCards.goldproof && (
                              <GoldProofCard data={msg.restoreCards.goldproof} />
                            )}
                            {/* Card 7: Action */}
                            {msg.restoreCards.action && (
                              <ActionCard data={msg.restoreCards.action} />
                            )}
                            {/* Card 8: GitHub Direct Push */}
                            {msg.restoreCards.github && msg.restoreCards.action?.scanId && (
                              <GitHubApplyCard scanId={msg.restoreCards.action.scanId} />
                            )}

                            {/* ===== V2 Pipeline Cards ===== */}
                            {/* Screenshot Before/After Comparison */}
                            {msg.restoreCards.v2?.screenshotBefore || msg.restoreCards.v2?.screenshotAfter ? (
                              <ScreenshotComparison
                                beforeUrl={msg.restoreCards.v2.screenshotBefore || undefined}
                                afterUrl={msg.restoreCards.v2.screenshotAfter || undefined}
                                verified={msg.restoreCards.v2.verified}
                              />
                            ) : null}

                            {/* Plain English Report */}
                            {msg.restoreCards.v2?.securityFindings && msg.restoreCards.v2.securityFindings.length > 0 && (
                              <PlainEnglishReport
                                findings={msg.restoreCards.v2.securityFindings}
                                prUrl={msg.restoreCards.v2.prUrl}
                                prNumber={msg.restoreCards.v2.prNumber}
                              />
                            )}

                            {/* Security Findings */}
                            {msg.restoreCards.v2?.securityFindings && msg.restoreCards.v2.securityFindings.length > 0 ? (
                              <SecurityFindings
                                findings={msg.restoreCards.v2.securityFindings}
                                summary={msg.restoreCards.v2.securitySummary}
                              />
                            ) : null}

                            {/* GitHub Connect Gate */}
                            {msg.restoreCards.v2?.githubGateRequired && (
                              <GitHubConnectGate
                                scanId={msg.restoreCards.v2.restorationId || ''}
                                sendEvent={(event: any) => {
                                  if (event?.type === 'thought_step' && event?.step) {
                                    updateLastMessage((prev) => ({
                                      ...prev,
                                      thoughtSteps: [...(prev.thoughtSteps || []), event.step],
                                    }))
                                  }
                                }}
                                onConnected={async ({ repoFullName }) => {
                                  if (!repoFullName || !msg.restoreCards?.v2?.restorationId) return
                                  updateLastMessage((prev) => ({
                                    ...prev,
                                    restoreCards: { ...prev.restoreCards, isRunning: true, v2: { ...prev.restoreCards?.v2, githubGateRequired: false, repoFullName } },
                                  }))
                                  try {
                                    const pushRes = await fetch('/api/restore/push', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ restorationId: msg.restoreCards?.v2?.restorationId, repoFullName }),
                                    })
                                    if (!pushRes.ok) throw new Error(`HTTP ${pushRes.status}`)
                                    const reader = pushRes.body?.getReader()
                                    if (!reader) throw new Error('No response body')
                                    const decoder = new TextDecoder()
                                    let buf = ''
                                    while (true) {
                                      const { done, value } = await reader.read()
                                      if (done) break
                                      buf += decoder.decode(value, { stream: true })
                                      const lines = buf.split('\n')
                                      buf = lines.pop() || ''
                                      for (const line of lines) {
                                        if (line.startsWith('data: ')) {
                                          try { handleRestoreEvent(JSON.parse(line.slice(6)), detectedUrlRef.current || '') } catch {}
                                        }
                                      }
                                    }
                                  } catch (err: any) {
                                    updateLastMessage((prev) => ({
                                      ...prev,
                                      content: prev.content || `Push failed: ${err.message}`,
                                    }))
                                  }
                                  scrollToBottom()
                                }}
                              />
                            )}

                            {/* PR Link */}
                            {msg.restoreCards.v2?.prUrl && (
                              <a
                                href={msg.restoreCards.v2.prUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] font-bold text-[#D6FF00] transition hover:border-[#D6FF00]/30"
                              >
                                <span className="text-[#D6FF00]">#</span>
                                Open Pull Request #{msg.restoreCards.v2.prNumber}
                                <span className="ml-auto text-[11px] text-white/30">↗</span>
                              </a>
                            )}

                            {/* Gold Restoration Certificate */}
                            {msg.restoreCards.v2?.restoreComplete && (
                              <GoldCard
                                tier={msg.restoreCards.v2.tier || 'gold'}
                                screenshotBefore={msg.restoreCards.v2.screenshotBefore || undefined}
                                screenshotAfter={msg.restoreCards.v2.screenshotAfter || undefined}
                                prUrl={msg.restoreCards.v2.prUrl || undefined}
                                prNumber={msg.restoreCards.v2.prNumber || undefined}
                                branch={msg.restoreCards.v2.branch || undefined}
                                repoFullName={msg.restoreCards.v2.repoFullName}
                                findings={msg.restoreCards.v2.securityFindings || []}
                                summary={msg.restoreCards.v2.securitySummary}
                                plainEnglish={msg.restoreCards.v2.plainEnglish}
                              />
                            )}

                            {/* Delivery: Download ZIP / Copy Code / Connect to Git */}
                            {msg.restoreCards.v2?.restoreComplete && msg.restoreCards.v2.restorationId && (
                              <RestoreDeliveryCard
                                restorationId={msg.restoreCards.v2.restorationId}
                                downloadRestored={msg.restoreCards.v2.deliverables?.download?.restored || undefined}
                              />
                            )}
                          </div>
                        )}

                        {/* Alpha Activity Stream — below chat, shows when events arrive */}
                        {msg.alphaEvents && msg.alphaEvents.length > 0 && (
                          <div className="mt-3 space-y-3">
                            <ActivityStream
                              events={msg.alphaEvents}
                              isRunning={msg.isStreaming === true}
                            />

                            {/* Signature Visual Cards — appear when relevant events arrive */}
                            {msg.alphaEvents.filter(e => e.type === 'FILE_MODIFIED').map((e, i) => (
                              <CodeDiffCard key={`diff-${i}`} filename={e.data?.path || ''} old={e.data?.diff || ''} newContent={e.data?.diff || ''} />
                            ))}
                            {msg.alphaEvents.filter(e => e.type === 'COMMAND_STARTED' || e.type === 'COMMAND_FINISHED').map((e, i) => (
                              <TerminalCard
                                key={`cmd-${i}`}
                                cmd={e.data?.cmd || ''}
                                status={e.type === 'COMMAND_FINISHED' ? (e.data?.success ? 'success' : 'error') : 'running'}
                                output={e.data?.output}
                              />
                            ))}
                            {msg.alphaEvents.filter(e => e.type === 'TEST_STARTED' || e.type === 'TEST_FINISHED').map((e, i) => (
                              <TerminalCard
                                key={`test-${i}`}
                                cmd="Running Tests"
                                status={e.type === 'TEST_FINISHED' ? 'success' : 'running'}
                                testCount={e.data?.count}
                                testsPassed={e.data?.passed}
                                testsFailed={e.data?.failed}
                              />
                            ))}
                            {msg.alphaEvents.filter(e => e.type === 'COMPONENT_HEALTH_CHANGED').map((e, i) => (
                              <SystemGraphAliveCard
                                key={`health-${i}`}
                                components={[{
                                  name: e.data?.component || '',
                                  health: e.data?.newHealth as any || 'unknown',
                                }]}
                                recentChange={e.data}
                              />
                            ))}

                            {/* Reasoning Trace */}
                            {msg.alphaReasoning && (
                              <ReasoningTrace
                                assessment={msg.alphaReasoning.assessment}
                                hypotheses={msg.alphaReasoning.hypotheses}
                                evidence={msg.alphaReasoning.evidence}
                                decision={msg.alphaReasoning.decision}
                              />
                            )}

                            {/* Restoration Complete */}
                            {msg.alphaEvents.some(e => e.type === 'RESTORATION_COMPLETED') && (
                              <RestorationComplete
                                healthBefore={msg.alphaEvents.find(e => e.type === 'RESTORATION_COMPLETED')?.data?.healthBefore || 42}
                                healthAfter={msg.alphaEvents.find(e => e.type === 'RESTORATION_COMPLETED')?.data?.healthAfter || 99}
                                filesModified={msg.alphaEvents.find(e => e.type === 'RESTORATION_COMPLETED')?.data?.filesModified || 0}
                                testsPassed={msg.alphaEvents.find(e => e.type === 'RESTORATION_COMPLETED')?.data?.testsPassed || 0}
                              />
                            )}
                          </div>
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
            {attachedFiles.length > 0 && (
                <div className="mb-2 space-y-1">
                  {attachedFiles.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                      <Film size={16} className="text-[#D6FF00] shrink-0" />
                      <span className="flex-1 truncate text-[13px] text-white/70">{file.name}</span>
                      <span className="text-[11px] text-white/30 shrink-0">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button onClick={() => handleRemoveFile(i)} className="text-white/40 hover:text-white shrink-0"><X size={14} /></button>
                    </div>
                  ))}
                </div>
            )}
            <div className="alpha-input-glow group relative flex items-end rounded-2xl border border-white/[0.08] bg-white/[0.03] transition-all duration-300">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                multiple
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
              {!input && attachedFiles.length === 0 && <AnimatedPlaceholder />}
              <button
                onClick={() => void handleSend()}
                disabled={(!input.trim() && attachedFiles.length === 0) || isGenerating || uploading}
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
