import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MessageSquare, CreditCard, Trash2, Clock, Plus, Rocket, LogOut, MessageCircle, HelpCircle, Search } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { getChatThreads, deleteChatThread, subscribeChatHistory, type ChatThread } from '../../lib/chatHistoryStore'
import PlanBadge, { PLAN_LABELS } from '../PlanBadge'

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
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const { profile, user, signOut } = useAuth()
  const currentPlan = profile?.plan || 'free'
  const planLabel = PLAN_LABELS[String(currentPlan).toLowerCase()] || 'FREE'
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

  const goTo = (path: string) => {
    onClose()
    navigate(path)
  }

  const filteredThreads = threads.filter(t => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return t.title.toLowerCase().includes(q) || t.messages.some(m => m.content.toLowerCase().includes(q))
  })

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
            className="fixed inset-y-0 left-0 z-50 flex h-[100dvh] max-h-[100dvh] w-[300px] max-w-[86vw] flex-col overflow-hidden border-r border-white/[0.06] bg-[#0D0D0D] supports-[height:100dvh]:h-[100dvh]"
          >
            <div className="flex h-14 min-h-14 items-center justify-between border-b border-white/[0.06] px-4 pt-[env(safe-area-inset-top)]">
              <span className="flex items-center gap-2">
                <span className="font-syne text-sm font-bold tracking-wide text-white">
                  ALPHATEKX
                </span>
                <PlanBadge plan={currentPlan} />
              </span>
              <button
                onClick={onClose}
                className="grid size-8 place-items-center rounded-lg text-white/40 transition hover:bg-white/[0.04] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick actions — open as dedicated full pages */}
            <div className="space-y-2 border-b border-white/[0.06] p-3">
              <button
                onClick={() => goTo('/deploy')}
                className="flex w-full items-center gap-3 rounded-xl border border-[#D6FF00]/20 bg-[#D6FF00]/[0.04] px-3 py-2.5 text-left transition hover:bg-[#D6FF00]/[0.08]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#D6FF00]/10">
                  <Rocket size={14} className="text-[#D6FF00]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-white">Deploy</span>
                  <span className="block text-[10px] text-white/30">Put a site live on the web</span>
                </span>
              </button>
              <button
                onClick={() => goTo('/billing')}
                className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05]">
                  <CreditCard size={14} className="text-white/60" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-white">Billing</span>
                  <span className="block text-[10px] text-white/30">{planLabel} plan · manage sites & fixes</span>
                </span>
              </button>
              <button
                onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('alphatekx:open-contact-us')) }}
                className="flex w-full items-center gap-3 rounded-xl border border-[#FFD700]/20 bg-[#FFD700]/[0.06] px-3 py-2.5 text-left transition hover:bg-[#FFD700]/[0.12]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#FFD700]/15">
                  <MessageCircle size={14} className="text-[#D6FF00]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-white">Contact support</span>
                  <span className="block text-[10px] text-white/40">We reply in 1 minute ⚡ — in sidebar</span>
                </span>
              </button>
              <button
                onClick={() => goTo('/help')}
                className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05]">
                  <HelpCircle size={14} className="text-white/60" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-white">Help & FAQ</span>
                  <span className="block text-[10px] text-white/30">Guides, billing, video tips</span>
                </span>
              </button>

            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain alpha-chat-scroll touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' } as any}>
              {/* ===== HISTORY ===== */}
              <div className="p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-white/25">History</p>
                  <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-white/30">{threads.length}</span>
                </div>
                <button
                  onClick={() => { onNewChat?.(); onClose() }}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#D6FF00]/15 bg-[#D6FF00]/[0.06] px-3 py-2.5 text-[13px] font-black text-white transition hover:bg-[#D6FF00]/10"
                >
                  <Plus size={14} />
                  New Chat
                </button>
                <div className="relative mb-3">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search chats"
                    className="h-9 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] py-2 pl-9 pr-3 text-[13px] font-medium text-white placeholder:text-white/25 outline-none focus:border-white/12 focus:bg-white/[0.05]"
                  />
                </div>
                {threads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <MessageSquare size={28} className="mb-3 text-white/10" />
                    <p className="text-[13px] font-semibold text-white/20">No conversations yet</p>
                    <p className="mt-1 text-[11px] text-white/10">Start chatting to build history</p>
                  </div>
                ) : filteredThreads.length === 0 ? (
                  <p className="py-8 text-center text-[12px] font-medium text-white/30">No chats match {searchQuery}</p>
                ) : (
                  <div className="space-y-1">
                    {filteredThreads.map((thread) => (
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
            </div>

            {/* Profile footer — plan badge + sign out */}
            <div className="border-t border-white/[0.06] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-3 rounded-xl bg-white/[0.02] px-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#FFD700] to-[#6B21A8] text-[12px] font-black text-black">
                  {(user?.email || 'A').slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-bold text-white">{user?.email || 'Guest'}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <PlanBadge plan={currentPlan} />
                    <span className="text-[10px] text-white/25">{planLabel} member</span>
                  </span>
                </span>
                <button
                  onClick={() => { onClose(); void signOut() }}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-white/30 transition hover:bg-red-500/10 hover:text-red-300"
                  title="Log out"
                  aria-label="Log out"
                >
                  <LogOut size={15} />
                </button>
              </div>
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
