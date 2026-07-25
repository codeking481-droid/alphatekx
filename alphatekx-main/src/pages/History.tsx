import { useMemo } from 'react'
import { Bot, CalendarClock, CheckCircle2, Clock3, Plus, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { deleteAgent, useAgents } from '../lib/agents/agentStore'
import type { Agent } from '../lib/agents/types'

function statusIcon(agent: Agent) {
  const s = agent.status
  if (s === 'running' || s === 'active') return <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
  if (s === 'paused' || s === 'completed') return <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
  if (s === 'error' || s === 'failed' || s === 'warning') return <X size={14} className="text-red-400" />
  return <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
}

export default function History() {
  const agents = useAgents()
  const navigate = useNavigate()
  const sorted = useMemo(() => [...agents].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()), [agents])

  return <main className="mx-auto min-h-screen w-full max-w-4xl px-5 py-20">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="mt-2 text-sm text-white/55">Your automations and recent runs.</p>
      </div>
      <button onClick={() => navigate('/automations')} className="flex min-h-11 items-center gap-2 rounded-lg btn-alpha px-4 text-sm text-white"><Plus size={17}/>New automation</button>
    </header>
    {sorted.length === 0 ? (
      <section className="mt-16 rounded-xl border border-dashed border-white/[.15] p-12 text-center">
        <Bot className="mx-auto text-white/35" size={32}/>
        <h2 className="mt-4 font-semibold">No automations yet</h2>
        <p className="mt-2 text-sm text-white/55">Create an automation and it will appear here.</p>
      </section>
    ) : (
      <section className="mt-8 space-y-3">
        {sorted.map(agent => {
          const last = agent.executionHistory?.[agent.executionHistory.length - 1]
          return (
            <article key={agent.id} className="group flex items-center gap-3 rounded-xl border border-white/[.12] liquid-glass p-4 hover:bg-white/[.04]">
              <button onClick={() => navigate(`/automations?id=${agent.id}`)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2">
                  {statusIcon(agent)}
                  <p className="truncate font-medium">{agent.name || 'Automation'}</p>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-white/55">
                  <Clock3 size={13}/>
                  {last ? `Last run ${new Date(last.at).toLocaleString()}` : `Updated ${new Date(agent.updatedAt || agent.createdAt).toLocaleString()}`}
                  {agent.trigger.type === 'schedule' && <><CalendarClock size={13}/> {agent.trigger.cron || 'Daily'}</>}
                  {agent.executionHistory?.length ? <><CheckCircle2 size={13}/> {agent.executionHistory.length} runs</> : null}
                </p>
              </button>
              <button onClick={() => { if (window.confirm('Delete this automation?')) deleteAgent(agent.id) }} className="grid size-11 place-items-center rounded-lg text-white/45 hover:bg-white/[.08] hover:text-red-600" aria-label={`Delete ${agent.name}`}><Trash2 size={17}/></button>
            </article>
          )
        })}
      </section>
    )}
  </main>
}
