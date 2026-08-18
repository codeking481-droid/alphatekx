import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MessageSquare, CreditCard, Trash2, Clock } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { getChatThreads, deleteChatThread, subscribeChatHistory, type ChatThread } from '../../lib/chatHistoryStore'

type Tab = 'history' | 'billing'

export default function HamburgerSidebar({
  open,
  onClose,
  onThreadSelect,
  activeThreadId,
}: {
  open: boolean
  onClose: () => void
  onThreadSelect: (thread: ChatThread) => void
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

            <div className="flex border-b border-white/[0.06]">
              {([
                ['history', 'History', MessageSquare],
                ['billing', 'Billing', CreditCard],
              ] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex flex-1 items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase tracking-widest transition ${
                    tab === key
                      ? 'border-b-2 border-[#D6FF00] text-[#D6FF00]'
                      : 'text-white/30 hover:text-white/50'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto alpha-chat-scroll">
              {tab === 'history' && (
                <div className="p-3">
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

              {tab === 'billing' && (
                <div className="p-4">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Current Plan</p>
                    <p className="mt-2 text-lg font-bold text-white capitalize">{currentPlan}</p>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Credits</p>
                    <p className="mt-2 text-2xl font-bold text-[#D6FF00]">{credits}</p>
                    <p className="mt-1 text-[11px] text-white/30">Restorations remaining</p>
                  </div>

                  <button
                    onClick={() => { onClose(); navigate('/billing') }}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6FF00] px-4 py-3 text-[13px] font-bold text-black transition hover:bg-[#C2E600]"
                  >
                    <CreditCard size={14} />
                    Buy More Credits
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
