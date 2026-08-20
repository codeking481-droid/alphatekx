import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MessageSquare, CreditCard, Trash2, Clock, Plus, Rocket, ExternalLink, Globe, Copy, LoaderCircle, Check } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { getChatThreads, deleteChatThread, subscribeChatHistory, type ChatThread } from '../../lib/chatHistoryStore'
import { deployPastedHtml, slugifyCreation } from '../../lib/deployCreation'

type Tab = 'history' | 'billing' | 'deploy'

export default function HamburgerSidebar({
  open,
  onClose,
  onThreadSelect,
  onNewChat,
  activeThreadId,
}: {
  open: boolean
  onClose: () => void
  onThreadSelect: (thread: ChatThread) => void
  onNewChat?: () => void
  activeThreadId?: string
}) {
  const [tab, setTab] = useState<Tab>('history')
  const [threads, setThreads] = useState<ChatThread[]>([])
  const { profile } = useAuth()
  const credits = profile?.credits ?? 0
  const currentPlan = profile?.plan || 'free'
  const navigate = useNavigate()

  // Deploy tab state
  const [pasteHtml, setPasteHtml] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteSlug, setPasteSlug] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<{ pathUrl: string; subdomainUrl: string } | null>(null)
  const [deployError, setDeployError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) setThreads(getChatThreads())
  }, [open])

  useEffect(() => {
    return subscribeChatHistory(() => {
      setThreads(getChatThreads())
    })
  }, [])

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteChatThread(id)
    setThreads(getChatThreads())
  }

  const deployCode = async () => {
    if (deploying || !pasteTitle.trim() || !pasteSlug || !pasteHtml.trim()) return
    setDeploying(true)
    setDeployResult(null)
    setDeployError('')
    try {
      const result = await deployPastedHtml({ title: pasteTitle, slug: pasteSlug, html: pasteHtml })
      setDeployResult(result)
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : 'Deploy failed.')
    } finally {
      setDeploying(false)
    }
  }

  const copyUrl = async () => {
    if (!deployResult?.pathUrl) return
    await navigator.clipboard.writeText(deployResult.pathUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const resetDeploy = () => {
    setPasteHtml('')
    setPasteTitle('')
    setPasteSlug('')
    setDeployResult(null)
    setDeployError('')
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col border-r border-white/[0.06] bg-[#0D0D0D]"
          >
            <div className="flex h-14 items-center justify-between border-b border-white/[0.06] px-4">
              <span className="font-syne text-sm font-bold tracking-wide text-white">
                ALPHATEKX
              </span>
              <button
                onClick={onClose}
                className="grid size-8 place-items-center rounded-lg text-white/40 transition hover:bg-white/[0.04] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tabs: History | Billing | Deploy */}
            <div className="flex border-b border-white/[0.06]">
              {([
                ['history', 'History', MessageSquare],
                ['billing', 'Billing', CreditCard],
                ['deploy', 'Deploy', Rocket],
              ] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-widest transition ${
                    tab === key
                      ? 'border-b-2 border-[#D6FF00] text-[#D6FF00]'
                      : 'text-white/30 hover:text-white/50'
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto alpha-chat-scroll">
              {/* ===== HISTORY TAB ===== */}
              {tab === 'history' && (
                <div className="p-3">
                  <button
                    onClick={() => { onNewChat?.(); onClose() }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#D6FF00]/20 bg-[#D6FF00]/[0.04] px-3 py-2.5 text-[12px] font-bold text-[#D6FF00] transition hover:bg-[#D6FF00]/[0.08]"
                  >
                    <Plus size={14} />
                    New Chat
                  </button>
                  {threads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <MessageSquare size={28} className="mb-3 text-white/10" />
                      <p className="text-[13px] font-semibold text-white/20">No conversations yet</p>
                      <p className="mt-1 text-[11px] text-white/10">Start chatting to build history</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {threads.map((thread) => (
                        <button
                          key={thread.id}
                          onClick={() => {
                            onThreadSelect(thread)
                            onClose()
                          }}
                          className={`group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                            activeThreadId === thread.id
                              ? 'bg-[#D6FF00]/[0.06]'
                              : 'hover:bg-white/[0.02]'
                          }`}
                        >
                          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                            <MessageSquare size={12} className="text-white/30" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`truncate text-[13px] font-semibold ${
                                activeThreadId === thread.id ? 'text-[#D6FF00]' : 'text-white/70'
                              }`}
                            >
                              {thread.title}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-white/20">
                              <Clock size={10} />
                              {formatRelativeTime(thread.updatedAt)}
                              <span className="text-white/10">·</span>
                              <span>{thread.messages.length} msgs</span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => handleDelete(thread.id, e)}
                            className="mt-1 grid size-6 shrink-0 place-items-center rounded-md text-white/0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:text-white/20"
                          >
                            <Trash2 size={11} />
                          </button>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ===== BILLING TAB ===== */}
              {tab === 'billing' && (
                <div className="p-4 space-y-3">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Current Plan</p>
                    <p className="mt-2 text-lg font-bold text-white capitalize">{currentPlan}</p>
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Credits</p>
                    <p className="mt-2 text-2xl font-bold text-[#D6FF00]">{credits}</p>
                    <p className="mt-1 text-[11px] text-white/30">Restorations remaining</p>
                  </div>

                  <div className="rounded-xl border border-[#D6FF00]/10 bg-[#D6FF00]/[0.03] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#D6FF00]/50">What you get</p>
                    <ul className="mt-2 space-y-2">
                      {[
                        'Real Playwright browser scanning',
                        'Automated code fixes with GitHub push',
                        'Before/after screenshots',
                        'Security vulnerability detection',
                        'Performance optimization',
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11px] text-white/40">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#D6FF00]/40" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => { onClose(); navigate('/billing') }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6FF00] px-4 py-3 text-[13px] font-bold text-black transition hover:bg-[#C2E600]"
                  >
                    <CreditCard size={14} />
                    Buy More Credits
                  </button>
                </div>
              )}

              {/* ===== DEPLOY TAB ===== */}
              {tab === 'deploy' && (
                <div className="p-3 space-y-3">
                  {!deployResult ? (
                    <>
                      {/* App name */}
                      <label className="block text-[11px] font-bold uppercase tracking-widest text-white/30">
                        App name
                        <input
                          value={pasteTitle}
                          onChange={e => { const t = e.target.value; setPasteTitle(t); setPasteSlug(slugifyCreation(t)) }}
                          className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-white outline-none transition placeholder:text-white/20 focus:border-[#D6FF00]/40"
                          placeholder="My site"
                        />
                      </label>

                      {/* Slug */}
                      <label className="block text-[11px] font-bold uppercase tracking-widest text-white/30">
                        Slug
                        <div className="mt-1.5 flex min-h-[38px] items-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] transition focus-within:border-[#D6FF00]/40">
                          <span className="shrink-0 text-white/25 text-[11px]">alphatekx.name.ng/app/</span>
                          <input
                            value={pasteSlug}
                            onChange={e => setPasteSlug(slugifyCreation(e.target.value))}
                            className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/20"
                            placeholder="my-site"
                          />
                        </div>
                      </label>

                      {/* HTML code */}
                      <label className="block text-[11px] font-bold uppercase tracking-widest text-white/30">
                        HTML code
                        <textarea
                          value={pasteHtml}
                          onChange={e => setPasteHtml(e.target.value)}
                          className="mt-1.5 min-h-[140px] w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 font-mono text-[11px] leading-5 text-white outline-none transition placeholder:text-white/20 focus:border-[#D6FF00]/40"
                          placeholder={'<!doctype html>\n<html>\n  <head>...</head>\n  <body>...</body>\n</html>'}
                          spellCheck={false}
                        />
                      </label>
                      <p className="text-[10px] text-white/20 -mt-1">Paste complete HTML. Max 900 KB.</p>

                      {deployError && (
                        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{deployError}</p>
                      )}

                      {/* Deploy button */}
                      <button
                        onClick={() => void deployCode()}
                        disabled={deploying || !pasteTitle.trim() || !pasteSlug || !pasteHtml.trim()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6FF00] px-4 py-3 text-[12px] font-bold text-black transition hover:bg-[#C2E600] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {deploying ? <LoaderCircle size={14} className="animate-spin" /> : <Rocket size={14} />}
                        {deploying ? 'Deploying...' : 'Deploy'}
                      </button>
                    </>
                  ) : (
                    /* Success result */
                    <div className="space-y-3">
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center">
                        <div className="mx-auto mb-2 flex size-8 items-center justify-center rounded-full bg-emerald-500/20">
                          <Check size={16} className="text-emerald-400" />
                        </div>
                        <p className="text-[13px] font-bold text-emerald-300">Your site is live!</p>
                        <p className="mt-1 break-all font-mono text-[12px] text-emerald-300/80">{deployResult.pathUrl}</p>
                        <div className="mt-3 flex gap-2">
                          <a
                            href={deployResult.pathUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2.5 text-[11px] font-bold text-emerald-300 transition hover:bg-emerald-500/25"
                          >
                            <Globe size={12} />
                            Open
                          </a>
                          <button
                            onClick={() => void copyUrl()}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2.5 text-[11px] font-bold text-white/60 transition hover:bg-white/[0.1] hover:text-white"
                          >
                            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            {copied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        {deployResult.subdomainUrl && (
                          <a
                            href={deployResult.subdomainUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block text-[10px] text-white/30 underline underline-offset-2 hover:text-white/50"
                          >
                            Subdomain: {deployResult.subdomainUrl}
                          </a>
                        )}
                      </div>

                      <button
                        onClick={resetDeploy}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] font-bold text-white/50 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        Deploy another
                      </button>
                    </div>
                  )}

                  {/* Scan & Restore link */}
                  <button
                    onClick={() => { onClose(); navigate('/scan') }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[11px] font-bold text-white/40 transition hover:bg-white/[0.04] hover:text-white/60"
                  >
                    <ExternalLink size={11} />
                    Scan & Restore a Website
                  </button>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}
