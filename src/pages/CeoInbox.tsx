import { useEffect, useState } from 'react'
import { CheckCircle2, Clock3, LoaderCircle, ShieldCheck, XCircle } from 'lucide-react'
import { decideCeoAction, listCeoActions, type CeoAction } from '../lib/ceoInbox'

export default function CeoInbox() {
  const [actions, setActions] = useState<CeoAction[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    try { setActions((await listCeoActions()).actions); setNotice('') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'CEO Inbox could not load.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer) }, [])

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id); setNotice('')
    try {
      const result = await decideCeoAction(id, decision)
      setActions(current => current.map(item => item.id === id ? result.action : item))
      setNotice(decision === 'approve' ? 'Approved work completed through the connected account.' : 'Suggestion rejected. Nothing was executed or charged.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The action could not be completed. No unconfirmed work was charged.') }
    finally { setBusy('') }
  }

  const pending = actions.filter(action => action.status === 'pending')
  return <main className="mx-auto min-h-[calc(100dvh-8rem)] w-full max-w-5xl px-4 pb-28 pt-8 text-white sm:px-6">
    <p className="text-xs font-black uppercase tracking-[.18em] text-violet-300">Level 3 · CEO mode</p>
    <h1 className="mt-2 text-3xl font-black">CEO Inbox — Pending Approvals</h1>
    <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">Alpha can notice work and prepare the response, but customer-facing actions run only after you approve them.</p>
    {notice && <div role="status" className="mt-5 rounded-xl border border-violet-300/20 bg-violet-300/10 p-3 text-sm font-bold text-violet-100">{notice}</div>}
    {loading ? <div className="mt-8 flex items-center gap-2 text-sm font-bold text-slate-300"><LoaderCircle className="animate-spin" size={18}/> Loading approvals…</div> :
      pending.length === 0 ? <section className="mt-8 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-8 text-center"><ShieldCheck className="mx-auto text-emerald-300"/><h2 className="mt-3 font-black">Nothing needs approval</h2><p className="mt-1 text-sm text-slate-300">Alpha will place new detected work here.</p></section> :
      <section className="mt-8 grid gap-4">{pending.map(action => <article key={action.id} className="liquid-glass rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-300"><Clock3 size={14}/> Pending</div><h2 className="mt-2 text-lg font-black">{action.title}</h2><p className="mt-2 text-sm font-semibold text-slate-300">{action.suggestedAction}</p></div><span className="rounded-full border border-violet-300/20 px-2 py-1 text-[10px] font-black uppercase text-violet-200">{action.type.replaceAll('_', ' ')}</span></div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2"><button disabled={Boolean(busy)} onClick={() => void decide(action.id, 'approve')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 font-black disabled:opacity-50">{busy === action.id ? <LoaderCircle className="animate-spin" size={17}/> : <CheckCircle2 size={17}/>} Approve</button><button disabled={Boolean(busy)} onClick={() => void decide(action.id, 'reject')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 font-black text-rose-100 disabled:opacity-50"><XCircle size={17}/> Reject</button></div>
      </article>)}</section>}
  </main>
}
