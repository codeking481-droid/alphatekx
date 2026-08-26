import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, ExternalLink, MessageSquareText, Sparkles } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAgents } from '../lib/agents/agentStore'
import { useAuth } from '../lib/auth'
import { getChatThreads, type ChatThread } from '../lib/chatHistoryStore'
import ReactMarkdown from 'react-markdown'

type ConversationHistory = {
  id: string
  title: string
  originalRequest: string
  conversationStage: string
  status: string
  createdAt: string
  updatedAt: string
  messages: Array<{ role: 'user' | 'alpha' | 'system'; text: string; ts: string }>
}

export default function History() {
  const agents = useAgents()
  const { session } = useAuth()
  const [searchParams] = useSearchParams()
  const [conversations, setConversations] = useState<ConversationHistory[]>([])
  const [conversationError, setConversationError] = useState('')
  const [localThreads, setLocalThreads] = useState<ChatThread[]>([])
  const automationId = searchParams.get('automation')

  useEffect(() => {
    setLocalThreads(getChatThreads())
    const handler = () => setLocalThreads(getChatThreads())
    window.addEventListener('alphatekx:chat-history', handler)
    return () => window.removeEventListener('alphatekx:chat-history', handler)
  }, [])
  const selectedAgents = automationId ? agents.filter(agent => agent.id === automationId) : agents
  const entries = selectedAgents.flatMap(agent => (agent.executionHistory || []).map(execution => ({ agent, execution }))).sort((a, b) => new Date(b.execution.at).getTime() - new Date(a.execution.at).getTime())

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/alpha/conversations', {
      credentials: 'omit',
      signal: controller.signal,
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    }).then(async response => {
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not load conversation history.')
      setConversations(Array.isArray(payload.conversations) ? payload.conversations : [])
      setConversationError('')
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setConversationError(error instanceof Error ? error.message : 'Could not load conversation history.')
    })
    return () => controller.abort()
  }, [session?.access_token])

  return <main className="mx-auto min-h-[calc(100dvh-8rem)] w-full max-w-5xl px-4 py-10 sm:px-6">
    <header><p className="text-xs uppercase tracking-[.2em] text-violet-300">Confirmed activity</p><h1 className="mt-2 text-3xl font-semibold">History</h1><p className="mt-2 text-sm text-white/55">{automationId ? 'Runs for this automation.' : 'Your conversations with Alpha and confirmed automation activity.'}</p></header>
    {automationId && <Link to={`/active-automations/${automationId}`} className="mt-5 inline-flex text-sm text-violet-300">← Back to automation</Link>}

    {!automationId && <section className="mt-8">
      <div className="flex items-center gap-2"><MessageSquareText size={18} className="text-violet-300"/><h2 className="font-semibold">Conversations</h2></div>
      <p className="mt-1 text-sm text-white/50">Every completed chat turn is saved securely and remains available after refresh.</p>
      {conversationError && <p role="status" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">{conversationError}</p>}
      {!conversationError && conversations.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-violet-400/20 p-6 text-sm text-white/50">No conversations yet.</div> :
        <div className="mt-4 space-y-3">{conversations.map(conversation => <details key={conversation.id} className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
          <summary className="cursor-pointer list-none"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-medium">{conversation.originalRequest || conversation.title}</h3><p className="mt-1 text-xs text-white/45">{new Date(conversation.updatedAt || conversation.createdAt).toLocaleString()} · {conversation.messages.length} messages</p></div><span className="rounded-full border border-violet-400/20 px-2.5 py-1 text-[11px] capitalize">{conversation.conversationStage.replaceAll('_', ' ')}</span></div></summary>
          <div className="mt-4 space-y-3 border-t border-violet-400/20 pt-4">{conversation.messages.map((message, index) => <div key={`${message.ts}-${index}`} className={message.role === 'user' ? 'ml-auto max-w-[88%] rounded-2xl bg-violet-500/20 p-3' : 'max-w-full rounded-2xl bg-blue-500/10 p-3'}><p className="whitespace-pre-wrap text-sm leading-6 text-white/75">{message.text}</p></div>)}</div>
        </details>)}</div>}
    </section>}

    {!automationId && (
      <section className="mt-10">
        <div className="flex items-center gap-2"><Sparkles size={18} className="text-emerald-300"/><h2 className="font-semibold">Local Chat History — Green Cards</h2></div>
        <p className="mt-1 text-sm text-white/50">Scanned sites and Green Cards stored locally — full content, survives refresh, open in chat to use Fix buttons.</p>
        {localThreads.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-violet-400/20 p-6 text-sm text-white/50">No local chats yet — scan a site in chat to see history here.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {localThreads.map(thread => (
              <details key={thread.id} className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">{thread.title || 'Chat'}</h3>
                      <p className="mt-1 text-xs text-white/45">{new Date(thread.updatedAt).toLocaleString()} · {thread.messages.length} messages</p>
                    </div>
                    <Link to="/chat" className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-300">Open in Chat</Link>
                  </div>
                </summary>
                <div className="mt-4 space-y-3 border-t border-violet-400/20 pt-4">
                  {thread.messages.map(msg => (
                    <div key={msg.id} className={msg.role === 'user' ? 'ml-auto max-w-[88%] rounded-2xl bg-violet-500/20 p-3' : 'max-w-full rounded-2xl bg-black/20 p-3'}>
                      <div className="prose prose-invert max-w-none text-sm leading-6 prose-strong:font-bold prose-strong:text-white">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                      {msg.content.includes('ALPHA GREEN CARD') && (
                        <div className="mt-3 flex gap-2">
                          <Link to="/chat" className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black">Fix Everything — $49</Link>
                          <Link to="/chat" className="rounded-lg border border-white/20 bg-white px-3 py-1.5 text-xs font-bold text-black">Fix Critical — $19</Link>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    )}

    {!automationId && <div className="mt-10 flex items-center gap-2"><Clock3 size={18} className="text-violet-300"/><h2 className="font-semibold">Automation executions</h2></div>}
    {entries.length === 0 ? <section className="mt-6 rounded-3xl border border-dashed border-violet-400/20 p-10 text-center"><Clock3 className="mx-auto text-white/30" size={30}/><h2 className="mt-4 font-semibold">{selectedAgents.length ? 'No runs yet' : 'No automations yet'}</h2><p className="mt-2 text-sm text-white/50">Confirmed executions will appear here. Alpha never counts a post before the provider confirms it.</p></section> : <section className="mt-6 space-y-3">{entries.map(({ agent, execution }) => {
      const output = execution.output as { steps?: { content?: string; linkedinPostId?: string; linkedinUrl?: string; credits_used?: number; status?: string }[] } | undefined
      const step = output?.steps?.[0]
      const success = execution.status === 'success'
      return <article key={execution.id} className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3">{success ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={18}/> : <AlertCircle className="mt-0.5 shrink-0 text-amber-300" size={18}/>}<div className="min-w-0"><Link to={`/active-automations/${agent.id}`} className="font-medium hover:text-violet-300">{agent.name}</Link><p className="mt-1 text-xs capitalize text-white/45">{agent.campaign?.meta?.platforms?.join(', ') || agent.permissions?.join(', ') || 'Automation'} · {new Date(execution.at).toLocaleString()}</p></div></div><span className="rounded-full border border-violet-400/20 px-2.5 py-1 text-[11px] capitalize">{success ? 'Confirmed' : execution.status}</span></div>{step?.content && <p className="mt-4 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-white/65">{step.content}</p>}<p className={`mt-4 text-sm ${success ? 'text-white/65' : 'text-amber-200'}`}>{execution.log || (success ? 'Completed successfully.' : 'The run did not complete.')}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/45">{step?.linkedinPostId && <span>LinkedIn ID: {step.linkedinPostId}</span>}<span>Credits: {execution.credits_used || step?.credits_used || 0}</span>{step?.linkedinUrl && <a href={step.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-violet-300">View on LinkedIn<ExternalLink size={12}/></a>}</div></article>
    })}</section>}
  </main>
}
