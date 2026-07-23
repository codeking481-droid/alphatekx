import { useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, CalendarClock, CheckCircle2, Copy, History, Pause, Play, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteAgent, saveAgent, useAgents } from '../lib/agents/agentStore'
import type { Agent, AgentStatus } from '../lib/agents/types'

const filters = ['All', 'Running', 'Waiting', 'Paused', 'Needs Attention', 'Completed'] as const
type Filter = typeof filters[number]

function displayStatus(agent: Agent) {
  if (agent.status === 'running' || agent.status === 'active') return agent.trigger?.nextRun ? 'Running' : 'Scheduled'
  if (agent.status === 'awaiting_approval' || agent.status === 'pending' || agent.status === 'draft') return 'Awaiting Approval'
  if (agent.status === 'warning' || agent.status === 'failed' || agent.status === 'error') return 'Needs Attention'
  if (agent.status === 'paused') return 'Paused'
  if (agent.status === 'completed') return 'Completed'
  return 'Scheduled'
}

function platformNames(agent: Agent) {
  const values = agent.campaign?.meta?.platforms || agent.integrations || agent.permissions || []
  return values.length ? values.map(value => value.replace(/_/g, ' ')).join(', ') : 'Automation'
}

function lastResult(agent: Agent) {
  const run = agent.executionHistory?.[0]
  if (!run) return 'No runs yet'
  return run.status === 'success' ? run.log || 'Completed successfully' : run.log || 'Needs attention'
}

function matchesFilter(agent: Agent, filter: Filter) {
  if (filter === 'All') return true
  const status = displayStatus(agent)
  if (filter === 'Waiting') return status === 'Awaiting Approval' || status === 'Scheduled'
  return status === filter
}

export default function ActiveAutomations() {
  const agents = useAgents()
  const { id } = useParams()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('All')
  const [notice, setNotice] = useState('')
  const selected = id ? agents.find(agent => agent.id === id) : null
  const visible = useMemo(() => agents.filter(agent => agent.status !== 'deleted' && matchesFilter(agent, filter)), [agents, filter])

  const changeStatus = async (agent: Agent, status: AgentStatus) => {
    try {
      await saveAgent({ ...agent, status, campaign: agent.campaign ? { ...agent.campaign, status: status === 'paused' ? 'paused' : 'running' } : undefined })
      setNotice(status === 'paused' ? 'Automation paused. No future run will start until you resume it.' : 'Automation resumed.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update automation.') }
  }

  const duplicate = async (agent: Agent) => {
    const now = new Date().toISOString()
    const copy: Agent = {
      ...agent,
      id: crypto.randomUUID(),
      name: `${agent.name} copy`,
      status: 'draft',
      approved: false,
      createdAt: now,
      updatedAt: now,
      executionHistory: [],
      executionsDone: 0,
      successRate: 0,
      campaign: agent.campaign ? {
        ...agent.campaign,
        approved: false,
        status: 'pending_approval',
        posts: agent.campaign.posts.map(post => ({ ...post, id: crypto.randomUUID(), status: 'pending_approval', approved: false, charged: false, providerPostId: undefined, providerUrl: undefined, executionKey: undefined })),
      } : undefined,
    }
    await saveAgent(copy)
    navigate(`/active-automations/${copy.id}`)
  }

  if (id && !selected) return <main className="mx-auto min-h-[calc(100dvh-8rem)] max-w-3xl px-4 py-12"><div className="rounded-3xl border border-white/10 bg-white/[.04] p-8 text-center"><h1 className="text-xl font-semibold">Automation not found</h1><p className="mt-2 text-sm text-white/55">It may have been deleted or is no longer available on the server.</p><Link to="/active-automations" className="mt-6 inline-flex rounded-xl btn-alpha px-4 py-3 text-sm">Back to Active Automations</Link></div></main>

  if (selected) {
    const nextRun = selected.trigger?.nextRun || selected.nextRunAt
    const lastRun = selected.lastRunAt || selected.executionHistory?.[0]?.at
    return <main className="mx-auto min-h-[calc(100dvh-8rem)] max-w-4xl px-4 py-10 sm:px-6">
      <button onClick={() => navigate('/active-automations')} className="text-sm text-violet-300 hover:text-violet-200">← Active Automations</button>
      {notice && <div role="status" className="mt-4 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm">{notice}</div>}
      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[.045] p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[.2em] text-violet-300">{displayStatus(selected)}</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{selected.name}</h1><p className="mt-2 text-sm capitalize text-white/55">{platformNames(selected)}</p></div><div className="flex gap-2">{selected.status === 'paused' ? <button onClick={() => void changeStatus(selected, 'running')} className="action"><Play size={16}/>Resume</button> : <button onClick={() => void changeStatus(selected, 'paused')} className="action"><Pause size={16}/>Pause</button>}<button onClick={() => void duplicate(selected)} className="action"><Copy size={16}/>Duplicate</button></div></div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Info label="Mission" value={selected.mission || selected.interpretedGoal || selected.description || 'Continue the approved automation reliably.'} />
          <Info label="Strategy" value={selected.strategy?.summary || selected.campaign?.description || 'Use the approved content plan and preferences.'} />
          <Info label="Schedule" value={selected.campaign?.meta?.frequencyText || selected.trigger?.cron || 'One time'} icon={<CalendarClock size={15}/>} />
          <Info label="Timezone" value={selected.timezone || selected.campaign?.meta?.timezone || 'UTC'} />
          <Info label="Next run" value={nextRun ? new Date(nextRun).toLocaleString() : 'No future run'} />
          <Info label="Last confirmed run" value={lastRun ? new Date(lastRun).toLocaleString() : 'No runs yet'} />
          <Info label="Approval" value={selected.approvalPolicy === 'implicit' ? 'Automatic publishing' : 'Review before publishing'} />
          <Info label="Last result" value={lastResult(selected)} />
        </div>
        <div className="mt-8 flex flex-wrap gap-2"><Link to={`/history?automation=${encodeURIComponent(selected.id)}`} className="action"><History size={16}/>View history</Link><Link to={`/automations?id=${encodeURIComponent(selected.id)}`} className="action"><CheckCircle2 size={16}/>Review content or schedule</Link><button onClick={async () => { if (window.confirm('Delete this automation? This removes it from Active Automations.')) { try { await deleteAgent(selected.id); navigate('/active-automations') } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not delete automation.') } } }} className="action text-rose-300"><Trash2 size={16}/>Delete</button></div>
      </section>
    </main>
  }

  return <main className="mx-auto min-h-[calc(100dvh-8rem)] w-full max-w-6xl px-4 py-10 sm:px-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[.2em] text-violet-300">Your jobs</p><h1 className="mt-2 text-3xl font-semibold">Active Automations</h1><p className="mt-2 max-w-2xl text-sm text-white/55">See what Alpha is doing, what happens next, and anything that needs your attention.</p></div><Link to="/automations" className="flex min-h-11 items-center gap-2 rounded-xl btn-alpha px-4 text-sm"><Plus size={17}/>New automation</Link></header>
    {notice && <div role="status" className="mt-5 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm">{notice}</div>}
    <div className="mt-7 flex gap-2 overflow-x-auto pb-2" aria-label="Automation filters">{filters.map(item => <button key={item} onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs ${filter === item ? 'bg-violet-500 text-white' : 'border border-white/10 bg-white/[.04] text-white/60'}`}>{item}</button>)}</div>
    {visible.length === 0 ? <section className="mt-14 rounded-3xl border border-dashed border-white/15 p-10 text-center"><h2 className="font-semibold">{agents.length ? 'No automations match this filter' : 'No active automations yet'}</h2><p className="mt-2 text-sm text-white/55">{agents.length ? 'Choose another filter.' : 'Tell Alpha what you want done and your automation will appear here.'}</p></section> : <section className="mt-6 grid gap-4 md:grid-cols-2">{visible.map(agent => <Link key={agent.id} to={`/active-automations/${agent.id}`} className="rounded-2xl border border-white/10 bg-white/[.04] p-5 transition hover:border-violet-400/30 hover:bg-white/[.06]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold">{agent.name}</h2><p className="mt-1 text-xs capitalize text-white/50">{platformNames(agent)}</p></div><span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/70">{displayStatus(agent)}</span></div><p className="mt-5 text-sm text-white/65">{agent.trigger?.nextRun ? `Next run ${new Date(agent.trigger.nextRun).toLocaleString()}` : lastResult(agent)}</p>{displayStatus(agent) === 'Needs Attention' && <p className="mt-3 flex items-center gap-2 text-xs text-amber-300"><AlertCircle size={14}/>Open to see what needs attention.</p>}</Link>)}</section>}
  </main>
}

function Info({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <div className="rounded-2xl border border-white/[.08] bg-white/[.035] p-4"><div className="flex items-center gap-2 text-xs text-white/45">{icon}{label}</div><p className="mt-2 text-sm leading-6 text-white/80">{value}</p></div>
}
