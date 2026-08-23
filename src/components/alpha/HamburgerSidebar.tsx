import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MessageSquare, CreditCard, Trash2, Clock, Plus, Rocket, LogOut } from 'lucide-react'
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
            </div>

            <div className="flex-1 overflow-y-auto alpha-chat-scroll">
              {/* ===== HISTORY ===== */}
              <div className="p-3">
                <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-white/25">History</p>
                <button
                  onClick={() => { onNewChat?.(); onClose() }}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] font-bold text-white/70 transition hover:bg-white/[0.06] hover:text-white"
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
            </div>

            {/* Profile footer — plan badge + sign out */}
            <div className="border-t border-white/[0.06] p-3">
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
