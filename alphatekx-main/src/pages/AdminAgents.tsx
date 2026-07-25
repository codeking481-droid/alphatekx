import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle, Pause, Play, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import type { Agent } from '../lib/agents/types'

type AgentLog = { id: string; agentId: string; connectorType: string; content?: string; status: 'success' | 'failed'; response?: string; error?: string; createdAt: string }

export default function AdminAgents() {
  const { session, user } = useAuth()
  const isAdmin = user?.email?.toLowerCase() === 'iamdan4live@gmail.com'
  const [agents, setAgents] = useState<Agent[]>([])
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [health, setHealth] = useState<{ activeAgents?: number; lastRun?: string; nextRun?: string; dueAgents?: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const authHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {}
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`
    if (user?.email) h['X-Admin-Email'] = user.email
    return h
  }

  const load = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const [aRes, lRes, hRes] = await Promise.all([
        fetch('/api/agents', { headers: authHeaders() }),
        fetch('/api/agents/logs?limit=500', { headers: authHeaders() }),
        fetch('/api/agents/health', { headers: authHeaders() }),
      ])
      const aData = await aRes.json().catch(() => ({}))
      const lData = await lRes.json().catch(() => ({}))
      const hData = await hRes.json().catch(() => ({}))
      setAgents(Array.isArray(aData.agents) ? aData.agents : [])
      setLogs(Array.isArray(lData.logs) ? lData.logs : [])
      setHealth(hData)
    } catch {}
    finally { setLoading(false) }
  }, [isAdmin, session?.access_token, user?.email])

  useEffect(() => { void load(); const t = window.setInterval(() => void load(), 15_000); return () => window.clearInterval(t) }, [load])

  const toggle = async (agent: Agent) => {
    const next = agent.status === 'running' || agent.status === 'warning' ? 'paused' : 'running'
    try {
      await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ agent: { ...agent, status: next } }) })
      await load()
    } catch {}
  }

  const runNow = async (agent: Agent) => {
    try { await fetch(`/api/agents/${encodeURIComponent(agent.id)}/run`, { method: 'POST', headers: authHeaders() }); await load() } catch {}
  }

  if (!isAdmin) return <Navigate to="/workspace" replace />

  return <div className="mx-auto max-w-7xl px-4 py-20 sm:px-5"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-2"><ShieldCheck size={20}/><h1 className="text-xl font-semibold">Agents Admin</h1></div><button onClick={() => void load()} className="flex min-h-11 items-center gap-2 rounded-lg border border-white/[.15] px-4 text-sm"><RefreshCw size={16}/> Refresh</button></div><p className="mt-2 text-sm text-white/55">All agent schedules, executions, and per-action logs.</p>

    {health && <div className="mt-6 grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-white/[.12] liquid-glass p-5"><p className="text-xs text-white/55">Active agents</p><p className="mt-2 text-3xl font-semibold">{health.activeAgents ?? '—'}</p></div><div className="rounded-xl border border-white/[.12] liquid-glass p-5"><p className="text-xs text-white/55">Due now</p><p className="mt-2 text-3xl font-semibold">{health.dueAgents ?? '—'}</p></div><div className="rounded-xl border border-white/[.12] liquid-glass p-5"><p className="text-xs text-white/55">Last scheduler run</p><p className="mt-2 text-sm font-semibold">{health.lastRun ? new Date(health.lastRun).toLocaleTimeString() : '—'}</p></div><div className="rounded-xl border border-white/[.12] liquid-glass p-5"><p className="text-xs text-white/55">Next scheduler run</p><p className="mt-2 text-sm font-semibold">{health.nextRun ? new Date(health.nextRun).toLocaleTimeString() : '—'}</p></div></div>}

    {loading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin"/></div> : <>
      <section className="mt-8 overflow-hidden rounded-xl border border-white/[.12] liquid-glass"><div className="border-b border-white/[.12] px-5 py-4"><h2 className="font-semibold">Agents ({agents.length})</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-white/[.04] text-xs text-white/55"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">User</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Schedule</th><th className="px-5 py-3">Next run</th><th className="px-5 py-3">Success</th><th className="px-5 py-3">Actions</th></tr></thead><tbody>{agents.map(a => <tr key={a.id} className="border-t border-white/10"><td className="px-5 py-4 font-medium">{a.name}</td><td className="px-5 py-4">{a.userEmail}</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] ${a.status === 'running' ? 'bg-emerald-500/15 text-emerald-300' : a.status === 'warning' ? 'bg-amber-500/15 text-amber-300' : a.status === 'paused' ? 'bg-zinc-500/15 text-zinc-300' : 'bg-red-500/15 text-red-300'}`}>{a.status}</span></td><td className="px-5 py-4">{a.trigger?.cron || a.trigger?.type}</td><td className="px-5 py-4">{a.trigger?.nextRun ? new Date(a.trigger.nextRun).toLocaleString() : '—'}</td><td className="px-5 py-4">{a.successRate ?? 100}%</td><td className="px-5 py-4"><div className="flex items-center gap-2"><button onClick={() => toggle(a)} className="rounded p-1 hover:bg-white/10">{a.status === 'running' || a.status === 'warning' ? <Pause size={14}/> : <Play size={14}/>}</button><button onClick={() => runNow(a)} className="rounded p-1 hover:bg-white/10"><RefreshCw size={14}/></button></div></td></tr>)}</tbody></table></div></section>

      <section className="mt-8 overflow-hidden rounded-xl border border-white/[.12] liquid-glass"><div className="border-b border-white/[.12] px-5 py-4"><h2 className="font-semibold">Recent agent logs ({logs.length})</h2></div><div className="max-h-[520px] overflow-y-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="sticky top-0 bg-white/[.04] text-xs text-white/55"><tr><th className="px-5 py-3">Time</th><th className="px-5 py-3">Agent</th><th className="px-5 py-3">Connector</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Content preview</th><th className="px-5 py-3">Response / Error</th></tr></thead><tbody>{logs.map(l => <tr key={l.id} className="border-t border-white/10"><td className="px-5 py-4 whitespace-nowrap text-xs text-white/50">{new Date(l.createdAt).toLocaleString()}</td><td className="px-5 py-4 text-xs">{agents.find(a => a.id === l.agentId)?.name || l.agentId.slice(0, 8)}</td><td className="px-5 py-4 text-xs">{l.connectorType}</td><td className="px-5 py-4">{l.status === 'success' ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 size={12}/> success</span> : <span className="inline-flex items-center gap-1 text-red-400"><X size={12}/> failed</span>}</td><td className="px-5 py-4 max-w-xs truncate text-xs text-white/60">{l.content || '—'}</td><td className="px-5 py-4 max-w-xs truncate text-xs text-white/60" title={l.response || l.error}>{l.response || l.error || '—'}</td></tr>)}</tbody></table>{logs.length === 0 && <p className="p-8 text-center text-sm text-white/45">No agent logs yet. Run an agent to see real posts.</p>}</div></section>
    </>}
  </div>
}
