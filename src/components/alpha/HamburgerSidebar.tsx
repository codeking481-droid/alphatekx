import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MessageSquare, CreditCard, Trash2, Clock, Plus, Rocket, ExternalLink } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { getChatThreads, deleteChatThread, subscribeChatHistory, type ChatThread } from '../../lib/chatHistoryStore'

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
                <div className="p-4 space-y-3">
                  <div className="rounded-xl border border-[#D6FF00]/10 bg-[#D6FF00]/[0.03] p-4">
                    <div className="flex items-center gap-2">
                      <Rocket size={14} className="text-[#D6FF00]" />
                      <p className="text-[12px] font-bold text-white">Deploy a Site</p>
                    </div>
                    <p className="mt-2 text-[11px] text-white/40 leading-relaxed">
                      Paste your HTML and get a live link instantly. AlphaTekX hosts your site on a free subdomain.
                    </p>
                  </div>

                  <button
                    onClick={() => { onClose(); navigate('/scan') }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[12px] font-bold text-white/60 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    <ExternalLink size={12} />
                    Scan & Restore a Website
                  </button>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">How it works</p>
                    <div className="mt-3 space-y-3">
                      {[
                        { step: '1', label: 'Scan', desc: 'Paste a URL — Alpha scans for errors, broken links, security issues' },
                        { step: '2', label: 'Fix', desc: 'Alpha generates real code fixes and shows before/after' },
                        { step: '3', label: 'Push', desc: 'Connect GitHub — Alpha pushes fixes to your repo' },
                        { step: '4', label: 'Verify', desc: 'Alpha re-scans the live site to confirm everything works' },
                      ].map((item) => (
                        <div key={item.step} className="flex items-start gap-3">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#D6FF00]/10 text-[10px] font-bold text-[#D6FF00]">
                            {item.step}
                          </span>
                          <div>
                            <p className="text-[11px] font-semibold text-white/60">{item.label}</p>
                            <p className="text-[10px] text-white/25 mt-0.5">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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
