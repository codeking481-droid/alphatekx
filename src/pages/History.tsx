import { AlertCircle, CheckCircle2, Clock3, ExternalLink } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAgents } from '../lib/agents/agentStore'

export default function History() {
  const agents = useAgents()
  const [searchParams] = useSearchParams()
  const automationId = searchParams.get('automation')
  const selectedAgents = automationId ? agents.filter(agent => agent.id === automationId) : agents
  const entries = selectedAgents.flatMap(agent => (agent.executionHistory || []).map(execution => ({ agent, execution }))).sort((a, b) => new Date(b.execution.at).getTime() - new Date(a.execution.at).getTime())

  return <main className="mx-auto min-h-[calc(100dvh-8rem)] w-full max-w-5xl px-4 py-10 sm:px-6">
    <header><p className="text-xs uppercase tracking-[.2em] text-violet-300">Confirmed activity</p><h1 className="mt-2 text-3xl font-semibold">History</h1><p className="mt-2 text-sm text-white/55">{automationId ? 'Runs for this automation.' : 'What Alpha did across all your automations.'}</p></header>
    {automationId && <Link to={`/active-automations/${automationId}`} className="mt-5 inline-flex text-sm text-violet-300">← Back to automation</Link>}
    {entries.length === 0 ? <section className="mt-14 rounded-3xl border border-dashed border-white/15 p-10 text-center"><Clock3 className="mx-auto text-white/30" size={30}/><h2 className="mt-4 font-semibold">{selectedAgents.length ? 'No runs yet' : 'No automations yet'}</h2><p className="mt-2 text-sm text-white/50">Confirmed executions will appear here. Alpha never counts a post before the provider confirms it.</p></section> : <section className="mt-8 space-y-3">{entries.map(({ agent, execution }) => {
      const output = execution.output as { steps?: { content?: string; linkedinPostId?: string; linkedinUrl?: string; credits_used?: number; status?: string }[] } | undefined
      const step = output?.steps?.[0]
      const success = execution.status === 'success'
      return <article key={execution.id} className="rounded-2xl border border-white/[.09] bg-white/[.035] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3">{success ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={18}/> : <AlertCircle className="mt-0.5 shrink-0 text-amber-300" size={18}/>}<div className="min-w-0"><Link to={`/active-automations/${agent.id}`} className="font-medium hover:text-violet-300">{agent.name}</Link><p className="mt-1 text-xs capitalize text-white/45">{agent.campaign?.meta?.platforms?.join(', ') || agent.permissions?.join(', ') || 'Automation'} · {new Date(execution.at).toLocaleString()}</p></div></div><span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize">{success ? 'Confirmed' : execution.status}</span></div>{step?.content && <p className="mt-4 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-white/65">{step.content}</p>}<p className={`mt-4 text-sm ${success ? 'text-white/65' : 'text-amber-200'}`}>{execution.log || (success ? 'Completed successfully.' : 'The run did not complete.')}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/45">{step?.linkedinPostId && <span>LinkedIn ID: {step.linkedinPostId}</span>}<span>Credits: {execution.credits_used || step?.credits_used || 0}</span>{step?.linkedinUrl && <a href={step.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-violet-300">View on LinkedIn<ExternalLink size={12}/></a>}</div></article>
    })}</section>}
  </main>
}
