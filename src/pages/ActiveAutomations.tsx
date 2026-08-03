import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, CalendarClock, CalendarDays, CheckCircle2, Copy, History, List, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteAgent, refreshAgents, saveAgent, setAgentLifecycle, useAgents } from '../lib/agents/agentStore'
import type { Agent, AgentStatus } from '../lib/agents/types'
import { formatCountdown } from '../lib/scheduling/countdown.mjs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { isAdminUser } from '../lib/adminAccess'

const filters = ['All', 'Running', 'Waiting', 'Paused', 'Needs Attention', 'Completed'] as const
type Filter = typeof filters[number]

function displayStatus(agent: Agent) {
  const isApproved = Boolean(agent.approved || agent.campaign?.approved)
  if (agent.status === 'running' || agent.status === 'active' || (isApproved && (agent.status === 'awaiting_approval' || agent.status === 'pending' || agent.status === 'draft'))) return 'Running'
  if (agent.status === 'needs_attention' || agent.status === 'warning' || agent.status === 'failed' || agent.status === 'error') return 'Needs Attention'
  if (agent.status === 'paused') return 'Paused'
  if (agent.status === 'completed') return 'Completed'
  return 'Scheduled'
}

function platformNames(agent: Agent) {
  const values = agent.campaign?.meta?.platforms || agent.integrations || agent.permissions || []
  return values.length ? values.map(value => value.replace(/_/g, ' ')).join(', ') : 'Automation'
}

function nextRunOf(agent: Agent) {
  return agent.trigger?.nextRun || agent.nextRunAt
}

function lastResult(agent: Agent) {
  const run = agent.executionHistory?.[0]
  if (!run) return 'No runs yet'
  return run.log || (run.status === 'success' ? 'Completed successfully' : 'Needs attention')
}

function progress(agent: Agent) {
  const done = agent.campaign?.posts?.filter(post => post.status === 'posted').length || 0
  const total = agent.executionsTotal || agent.campaign?.posts?.length || 0
  return total > 0 ? `${Math.min(done, total)}/${total} done` : `${done} completed`
}

function progressPercent(agent: Agent) {
  const done = agent.campaign?.posts?.filter(post => post.status === 'posted').length || 0
  const total = agent.executionsTotal || agent.campaign?.posts?.length || 0
  return total > 0 ? Math.max(0, Math.min(100, Math.round(done / total * 100))) : 0
}

function matchesFilter(agent: Agent, filter: Filter) {
  if (filter === 'All') return true
  const status = displayStatus(agent)
  if (filter === 'Waiting') return status === 'Awaiting Approval' || status === 'Scheduled'
  return status === filter
}

type GeneratedPost = {
  id: string
  content: string
  image_url?: string | null
  scheduled_for?: string | null
  status?: string | null
}

function ProgressCard({ agent }: { agent: Agent }) {
  const [posts, setPosts] = useState<GeneratedPost[]>([])
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState(agent.status)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const accessToken = (await supabase?.auth.getSession())?.data?.session?.access_token
        const response = await fetch(`/api/automations/${encodeURIComponent(agent.id)}/progress`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        })
        const data = await response.json().catch(() => ({}))
        if (!active) return
        if (Array.isArray(data?.posts)) setPosts(data.posts)
        if (typeof data?.progress === 'number') setProgress(data.progress)
        if (typeof data?.status === 'string') setStatus(data.status)
        if (Array.isArray(data?.posts) && data.posts.length && progress === 0) {
          setProgress(Math.max(5, Math.min(100, Math.round((data.posts.length / Math.max(1, data.posts.length)) * 100))))
        }
      } catch {}
    }

    void load()
    const timer = window.setInterval(() => { void load() }, 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [agent.id])

  if (!posts.length && progress === 0) return null

  return <section className="mt-6 rounded-2xl border border-violet-400/20 bg-[#0A0F1E]/55 p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-black text-white">Background generation</p>
        <p className="text-xs font-semibold text-slate-400">{status === 'active' ? 'Generating posts and images in the background' : 'Queued for generation'}</p>
      </div>
      <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-300">{progress}%</span>
    </div>
    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[.06]">
      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-violet-500 transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {posts.map(post => <article key={post.id} className="overflow-hidden rounded-2xl border border-violet-400/20 bg-violet-500/10">
        {post.image_url ? <img src={post.image_url} alt="Generated post visual" className="aspect-square w-full object-cover" /> : <div className="aspect-square w-full bg-violet-500/20" />}
        <div className="p-3">
          <p className="text-sm font-semibold text-white">{post.content}</p>
          <p className="mt-2 text-[11px] uppercase tracking-[.2em] text-slate-500">{post.status || 'scheduled'}</p>
        </div>
      </article>)}
    </div>
  </section>
}

export default function ActiveAutomations() {
  const agents = useAgents()
  const { user, profile, refreshProfile } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('All')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [notice, setNotice] = useState('')
  const [runningNow, setRunningNow] = useState(false)
  const [now, setNow] = useState(Date.now())
  const selected = id ? agents.find(agent => agent.id === id) : null
  const visible = useMemo(() => agents.filter(agent => {
    const approved = Boolean(agent.approved || agent.campaign?.approved)
    // An execution failure changes the lifecycle status, but it must never make
    // the durable automation disappear. Keep every approved lifecycle outcome
    // visible until the user explicitly cancels, archives, or deletes it.
    const active = ['active', 'running', 'paused', 'warning', 'needs_attention', 'failed', 'error', 'waiting_credits', 'completed', 'preparing'].includes(agent.status)
      || (approved && ['awaiting_approval', 'pending', 'scheduled', 'draft'].includes(agent.status))
    return active && agent.status !== 'deleted' && matchesFilter(agent, filter)
  }), [agents, filter])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => { void refreshProfile() }, 30_000)
    return () => window.clearInterval(timer)
  }, [refreshProfile])

  const changeStatus = async (agent: Agent, status: AgentStatus) => {
    try {
      await setAgentLifecycle(agent.id, status === 'paused' ? 'pause' : 'resume')
      setNotice(status === 'paused' ? 'Automation paused. Future runs will wait until you resume it.' : 'Automation resumed successfully.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update automation.')
    }
  }

  const publishDueNow = async (agent: Agent) => {
    if (runningNow) return
    setRunningNow(true)
    setNotice('Alpha is publishing the due post and waiting for real provider confirmation...')
    try {
      const accessToken = (await supabase?.auth.getSession())?.data?.session?.access_token
      const response = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/run`, {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `Publish failed (${response.status})`)
      await refreshAgents()
      await refreshProfile()
      const execution = data.execution || {}
      if (execution.status === 'partial') {
        setNotice(execution.log || 'Some platforms confirmed publication. Alpha will retry only the missing platforms without duplicating confirmed posts.')
        return
      }
      if (execution.status !== 'success') throw new Error(execution.log || 'The provider did not confirm a real post. Nothing was charged.')
      const providerIds = (execution.steps || []).flatMap((step: { result?: Record<string, { id?: string }>; providerPostId?: string }) => [
        step.providerPostId,
        ...Object.values(step.result || {}).map(result => result?.id),
      ]).filter(Boolean)
      setNotice(`Real post confirmed${providerIds.length ? ` · Provider ID: ${providerIds.join(', ')}` : ''}.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The provider did not confirm the post. Nothing was charged.')
    } finally {
      setRunningNow(false)
    }
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
        posts: agent.campaign.posts.map(post => ({
          ...post,
          id: crypto.randomUUID(),
          status: 'pending_approval',
          approved: false,
          charged: false,
          providerPostId: undefined,
          providerUrl: undefined,
          executionKey: undefined,
        })),
      } : undefined,
    }
    await saveAgent(copy)
    navigate(`/active-automations/${copy.id}`)
  }

  if (id && !selected) return <Page><Empty title="Automation not found" body="It may have been deleted or is no longer available on the server."><Link to="/active-automations" className="primary-button">Back to Running Automations</Link></Empty></Page>

  if (selected) {
    const nextRun = nextRunOf(selected)
    const lastRun = selected.lastRunAt || selected.executionHistory?.[0]?.at
    const nextRunLabel = nextRun ? `${new Date(nextRun).toLocaleString()} · ${formatCountdown(nextRun, now)}` : 'No future run'
    return <Page size="max-w-4xl">
      <button onClick={() => navigate('/active-automations')} className="text-sm font-bold text-violet-300 hover:text-violet-200">← Running Automations</button>
      {notice && <Notice>{notice}</Notice>}
      {displayStatus(selected) === 'Needs Attention' && /credit/i.test(selected.campaign?.posts?.find(post => post.lastError)?.lastError || '') && <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">Out of credits - Buy $3 for 20 credits to keep your AI employee working. <Link to="/settings?section=billing" className="underline">Buy credits</Link></div>}
      <section className="mt-6 rounded-[2rem] border border-white/8 bg-[#0D1322]/70 p-5 shadow-[0_24px_70px_rgba(2,6,23,0.28)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="eyebrow">{displayStatus(selected)}</p><h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">{selected.name}</h1><p className="mt-2 text-sm font-semibold capitalize text-slate-400">{platformNames(selected)}</p></div>
          <div className="flex flex-wrap gap-2">
            {nextRun && new Date(nextRun).getTime() <= now && ['running', 'active', 'warning', 'needs_attention'].includes(selected.status) && <button onClick={() => void publishDueNow(selected)} disabled={runningNow} className="solar-action flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm disabled:opacity-50">{runningNow ? 'Publishing & verifying...' : 'Publish due post now'}</button>}
            {selected.status === 'paused' ? <button onClick={() => void changeStatus(selected, 'running')} className="action-light"><Play size={16}/>Resume</button> : <button onClick={() => void changeStatus(selected, 'paused')} className="action-light"><Pause size={16}/>Pause</button>}
            <Link to={`/automations?id=${encodeURIComponent(selected.id)}`} className="action-light"><Pencil size={16}/>Edit schedule — free</Link>
            <button onClick={() => void duplicate(selected)} className="action-light"><Copy size={16}/>Duplicate</button>
          </div>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Info label="Platform" value={platformNames(selected)} />
          <Info label="Progress" value={progress(selected)} />
          <Info label="Schedule" value={selected.campaign?.meta?.frequencyText || selected.trigger?.cron || 'One time'} icon={<CalendarClock size={15}/>} />
          <Info label="Timezone" value={selected.timezone || selected.campaign?.meta?.timezone || 'UTC'} />
          <Info label="Next run" value={nextRunLabel} />
          <Info label="Last confirmed run" value={lastRun ? new Date(lastRun).toLocaleString() : 'No runs yet'} />
          <Info label="Approval" value={selected.approvalPolicy === 'implicit' ? 'Automatic after your approved plan' : 'Review before publishing'} />
          <Info label="Last result" value={lastResult(selected)} />
          {!isAdminUser(user) && profile && <Info label="Credits left" value={profile.credits.toLocaleString()} />}
        </div>
        <div className="mt-6 rounded-2xl border border-violet-400/20 bg-[#0A0F1E]/55 p-4">
          <div className="flex items-center justify-between gap-3 text-xs font-black"><span className="text-slate-300">Verified progress</span><span className="text-violet-300">{progress(selected)}</span></div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-400 transition-[width] duration-500" style={{ width: `${progressPercent(selected)}%` }}/></div>
          <p className="mt-3 text-xs font-semibold text-slate-400">Credits are charged only after a provider returns a confirmed post ID.</p>
        </div>
        <ProgressCard agent={selected} />
        <section className="mt-6">
          <h2 className="text-sm font-black text-white">Recent verified activity</h2>
          <div className="mt-3 space-y-2">
            {(selected.executionHistory || []).slice(0, 5).map(run => <div key={run.id} className="flex items-start gap-3 rounded-xl border border-violet-400/15 bg-white/[.025] p-3">
              {run.status === 'success' ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={17}/> : <AlertCircle className="mt-0.5 shrink-0 text-rose-300" size={17}/>}
              <div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-200">{run.log || (run.status === 'success' ? 'Provider confirmed the execution.' : 'Execution needs attention.')}</p><p className="mt-1 text-[11px] text-slate-500">{new Date(run.at).toLocaleString()}</p></div>
            </div>)}
            {!selected.executionHistory?.length && <p className="rounded-xl border border-dashed border-violet-400/20 p-4 text-xs font-semibold text-slate-400">No execution has been attempted yet.</p>}
          </div>
        </section>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link to={`/history?automation=${encodeURIComponent(selected.id)}`} className="action-light"><History size={16}/>View history</Link>
          <Link to={`/automations?id=${encodeURIComponent(selected.id)}`} className="action-light"><CheckCircle2 size={16}/>Review content</Link>
          <button onClick={async () => {
            if (!window.confirm('Delete this automation? This removes it permanently.')) return
            try { await deleteAgent(selected.id); navigate('/active-automations') }
            catch (error) { setNotice(error instanceof Error ? error.message : 'Could not delete automation.') }
          }} className="action-light text-rose-300"><Trash2 size={16}/>Delete</button>
        </div>
      </section>
    </Page>
  }

  return <Page>
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow text-[11px] font-black uppercase tracking-[0.18em] text-[#8A8A93]">Your work</p><h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Running Automations</h1><p className="mt-2 max-w-2xl text-sm font-medium text-[#8A8A93]">Track every approved automation, its next run, and its confirmed progress.</p></div>
      <Link to="/automations" className="primary-button"><Plus size={17}/>New automation</Link>
    </header>
    {notice && <Notice>{notice}</Notice>}
    {visible.some(agent => displayStatus(agent) === 'Needs Attention' && /credit/i.test(agent.campaign?.posts?.find(post => post.lastError)?.lastError || '')) && (
      <div className="mt-5 rounded-2xl border border-[#F5C518]/30 bg-[#F5C518]/[0.04] p-4 text-sm font-bold text-white">
        Out of credits - Buy $3 for 20 credits to keep your AI employee working. <Link to="/settings?section=billing" className="ml-1 underline">Buy credits</Link>
      </div>
    )}
    {!isAdminUser(user) && profile && <p className="mt-4 text-sm font-bold text-[#8A8A93]">Credits left: {profile.credits.toLocaleString()}</p>}
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Automation filters">{filters.map(item => <button key={item} onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-full px-3 py-2 text-[11px] font-black ${filter === item ? 'bg-white text-[#0B0B0C]' : 'border border-white/10 bg-white/[.02] text-[#8A8A93]'}`}>{item}</button>)}</div>
      <div className="flex rounded-xl border border-white/10 bg-white/[.02] p-1">
        <button onClick={() => setView('list')} className={`view-button ${view === 'list' ? 'view-button-active' : ''}`}><List size={15}/>List</button>
        <button onClick={() => setView('calendar')} className={`view-button ${view === 'calendar' ? 'view-button-active' : ''}`}><CalendarDays size={15}/>Calendar</button>
      </div>
    </div>
    {visible.length === 0 ? <Empty title={agents.length ? 'No automations match this filter' : 'No running automations yet'} body={agents.length ? 'Choose another filter.' : 'Approve a plan in Command Centre and it will appear here.'} /> : view === 'calendar' ? <CalendarView agents={visible} /> : <section className="mt-6 grid gap-5 md:grid-cols-2">{visible.map(agent => <AutomationCard key={agent.id} agent={agent} runningNow={runningNow} onRun={publishDueNow} />)}</section>}
  </Page>
}

function AutomationCard({ agent, runningNow, onRun }: { agent: Agent; runningNow: boolean; onRun: (agent: Agent) => Promise<void> }) {
  const nextRun = nextRunOf(agent)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  const nextRunLabel = nextRun ? `${new Date(nextRun).toLocaleString()} · ${formatCountdown(nextRun, now)}` : 'No future run'
  const state = displayStatus(agent)
  const isDue = Boolean(nextRun && new Date(nextRun).getTime() <= now && ['running', 'active', 'warning', 'needs_attention'].includes(agent.status))
  return <article className="luxury-card block w-full max-w-full p-5 transition-all duration-300 hover:-translate-y-1 md:p-6">
    <Link to={`/active-automations/${agent.id}`} className="block">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#FFD700]">{platformNames(agent)}</p><h2 className="mt-2 break-words text-lg font-black text-white">{agent.name}</h2></div><span className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black ${state === 'Running' ? 'bg-emerald-400/10 text-emerald-300' : state === 'Needs Attention' ? 'bg-[#FFD700]/10 text-[#FFD700]' : 'bg-white/[.055] text-slate-300'}`}><i className={`size-2 animate-pulse rounded-full ${state === 'Running' ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.8)]' : 'bg-[#FFD700] shadow-[0_0_10px_rgba(255,215,0,.7)]'}`}/>{state}</span></div>
    <dl className="mt-6 grid grid-cols-2 gap-4 text-sm"><CardStat label="Schedule" value={agent.campaign?.meta?.frequencyText || agent.trigger?.cron || 'One time'} /><CardStat label="Progress" value={progress(agent)} /><CardStat label="Next run" value={nextRunLabel} /><CardStat label="Last result" value={lastResult(agent)} /></dl>
    <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[.08]"><div className="solar-progress h-full rounded-full transition-[width] duration-500" style={{ width: `${progressPercent(agent)}%` }}/></div>
    </Link>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <Link to={`/active-automations/${agent.id}`} className="flex min-h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[.035] px-4 text-sm font-black text-white transition hover:bg-white/[.07]">View posts</Link>
      {isDue && <button type="button" onClick={() => void onRun(agent)} disabled={runningNow} className="solar-action min-h-11 rounded-xl px-4 text-sm disabled:opacity-50">{runningNow ? 'Publishing & verifying…' : 'Run now'}</button>}
    </div>
    {displayStatus(agent) === 'Needs Attention' && <p className="mt-4 flex items-center gap-2 text-xs font-bold text-amber-300"><AlertCircle size={14}/>Open to see what needs attention.</p>}
  </article>
}

function CalendarView({ agents }: { agents: Agent[] }) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)]
  return <section className="mt-6 rounded-3xl border border-violet-400/20 bg-violet-500/10 p-4 shadow-[0_18px_45px_rgba(30,41,59,.10)] sm:p-6">
    <h2 className="text-xl font-black text-white">{now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
    <div className="mt-5 grid grid-cols-7 gap-1 text-center text-xs font-black uppercase text-slate-400">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => <div key={day}>{day}</div>)}</div>
    <div className="mt-2 grid grid-cols-7 gap-1">{cells.map((day, index) => {
      const scheduled = day ? agents.filter(agent => {
        const value = nextRunOf(agent)
        if (!value) return false
        const date = new Date(value)
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === day
      }) : []
      return <div key={`${day}-${index}`} className="min-h-20 rounded-xl border border-violet-400/20 p-1.5 sm:min-h-28 sm:p-2">{day && <><span className="text-xs font-black text-slate-400">{day}</span>{scheduled.slice(0, 2).map(agent => <Link key={agent.id} to={`/active-automations/${agent.id}`} className="mt-1 block truncate rounded bg-violet-500/10 px-1 py-1 text-[9px] font-bold text-violet-200 sm:text-[11px]">{agent.name}</Link>)}</>}</div>
    })}</div>
  </section>
}

function Page({ children, size = 'max-w-6xl' }: { children: ReactNode; size?: string }) {
  return <main className={`mx-auto min-h-[calc(100dvh-8rem)] w-full max-w-full overflow-x-hidden px-3 py-10 text-white sm:px-6 ${size}`}>{children}</main>
}

function Empty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return <section className="mt-12 rounded-3xl border-2 border-dashed border-violet-400/20 bg-violet-500/10 p-10 text-center"><h2 className="font-black text-white">{title}</h2><p className="mt-2 text-sm font-medium text-slate-400">{body}</p>{children && <div className="mt-6">{children}</div>}</section>
}

function Notice({ children }: { children: ReactNode }) {
  return <div role="status" className="mt-5 rounded-xl border border-violet-200 bg-violet-500/10 p-3 text-sm font-bold text-violet-200">{children}</div>
}

function Info({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <div className="rounded-2xl border border-violet-400/20 bg-blue-500/10 p-4"><div className="flex items-center gap-2 text-xs font-bold text-slate-400">{icon}{label}</div><p className="mt-2 text-sm font-semibold leading-6 text-white">{value}</p></div>
}

function CardStat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[11px] font-bold uppercase tracking-wide text-[#A0A0B0]">{label}</dt><dd className={`mt-1 break-words font-bold ${label === 'Next run' ? 'font-mono text-[#FFD700]' : 'text-white'}`}>{value}</dd></div>
}
