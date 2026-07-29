import { useCallback, useEffect, useState } from 'react'
import { BadgeDollarSign, LoaderCircle, MessageCircle, RefreshCw, Target, Users } from 'lucide-react'
import { getLeads, getMoneyLoopStats, updateLead, type Lead, type LeadStatus, type MoneyLoopStats } from '../lib/moneyLoop'

const EMPTY: MoneyLoopStats = { total: 0, new: 0, contacted: 0, qualified: 0, closed: 0, lost: 0, estimatedValue: 0, closedValue: 0 }
const STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'closed', 'lost']
const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 })

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [stats, setStats] = useState<MoneyLoopStats>(EMPTY)
  const [insight, setInsight] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [setupRequired, setSetupRequired] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [leadData, statData] = await Promise.all([getLeads(), getMoneyLoopStats()])
      setLeads(leadData.leads)
      setStats(statData.stats)
      setInsight(statData.insights[0]?.insight || '')
      setSetupRequired(leadData.setupRequired === true || statData.setupRequired === true)
      setNotice('')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load Money Loop.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const changeStatus = async (lead: Lead, status: LeadStatus) => {
    setBusy(lead.id)
    try {
      const saved = await updateLead(lead.id, { status })
      setLeads(current => current.map(item => item.id === saved.id ? saved : item))
      const statData = await getMoneyLoopStats()
      setStats(statData.stats)
      setNotice('Lead updated.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update lead.') }
    finally { setBusy('') }
  }

  return <main className="mx-auto min-h-[calc(100dvh-8rem)] w-full max-w-6xl bg-violet-500/10 px-4 py-8 text-white sm:px-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-violet-300">Revenue intelligence</p><h1 className="mt-2 text-3xl font-black">Money Loop</h1><p className="mt-2 max-w-2xl text-sm font-semibold text-slate-400">People who explicitly respond to your campaign calls to action, organized for honest follow-up.</p></div><button onClick={() => void load()} className="flex min-h-11 items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 text-sm font-black shadow-sm"><RefreshCw size={16}/>Refresh</button></header>

    {notice && <div role="status" className="mt-5 rounded-xl border border-violet-200 bg-violet-500/10 p-3 text-sm font-bold">{notice}</div>}
    {setupRequired && <div role="status" className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-semibold text-amber-100"><strong className="block font-black">Money Loop is ready for database activation.</strong>No customer data was lost or invented. An administrator needs to apply the bundled Money Loop migration once; this page will begin syncing automatically afterward.</div>}
    <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat icon={Users} label="Total leads" value={String(stats.total)}/>
      <Stat icon={MessageCircle} label="Contacted" value={String(stats.contacted)}/>
      <Stat icon={Target} label="Closed" value={String(stats.closed)}/>
      <Stat icon={BadgeDollarSign} label="Estimated value" value={money.format(stats.estimatedValue)}/>
    </section>
    {insight && <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-500/10 p-5"><p className="text-xs font-black uppercase tracking-wider text-violet-300">Alpha learned</p><p className="mt-2 font-bold text-white">{insight}</p></section>}

    {loading ? <div className="mt-8 grid min-h-64 place-items-center rounded-2xl bg-blue-500/10"><LoaderCircle className="animate-spin text-violet-300"/></div> :
      leads.length === 0 ? <section className="mt-8 rounded-2xl border border-dashed border-violet-400/20 bg-blue-500/10 p-10 text-center"><Users className="mx-auto text-slate-400"/><h2 className="mt-3 font-black">No captured leads yet</h2><p className="mt-1 text-sm font-semibold text-slate-400">Leads appear only after a person responds to a clear opt-in CTA. Alpha will never invent leads or send unapproved messages.</p></section> :
      <section className="mt-8 overflow-hidden rounded-2xl border border-violet-400/20 bg-violet-500/10 shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-blue-500/10 text-xs uppercase text-slate-400"><tr><th className="px-5 py-4">Lead</th><th className="px-5 py-4">Platform</th><th className="px-5 py-4">Comment</th><th className="px-5 py-4">DM</th><th className="px-5 py-4">Value</th><th className="px-5 py-4">Status</th></tr></thead><tbody>{leads.map(lead => <tr key={lead.id} className="border-t border-violet-400/20"><td className="px-5 py-4"><p className="font-black">{lead.lead_name || lead.lead_handle || 'Platform user'}</p><p className="mt-1 text-xs font-semibold text-slate-400">{lead.lead_handle ? `@${lead.lead_handle.replace(/^@/, '')}` : new Date(lead.created_at).toLocaleDateString()}</p></td><td className="px-5 py-4 font-bold capitalize">{lead.platform}</td><td className="max-w-sm px-5 py-4 font-semibold text-slate-400"><span className="line-clamp-2">{lead.comment_text}</span></td><td className="px-5 py-4">{lead.dm_sent ? <span className="font-bold text-emerald-300">Confirmed sent</span> : <span className="font-bold text-amber-300">Not sent</span>}</td><td className="px-5 py-4 font-bold">{money.format(lead.estimated_value || 0)}</td><td className="px-5 py-4"><select value={lead.status} disabled={busy === lead.id} onChange={event => void changeStatus(lead, event.target.value as LeadStatus)} className="h-10 rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 font-bold text-white">{STATUSES.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></td></tr>)}</tbody></table></div></section>}
  </main>
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <article className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 shadow-sm"><Icon size={18} className="text-violet-300"/><p className="mt-4 text-2xl font-black">{value}</p><p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-400">{label}</p></article>
}
