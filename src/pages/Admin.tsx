import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Activity, Calendar, LoaderCircle, RefreshCw, Send, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { isAdminUser } from '../lib/adminAccess'

type AdminUser = { id: string; email: string; credits?: number; plan?: string; created_at: string; last_active_at?: string }
type Stats = { total: number; active: number; today: number; thisMonth: number; lastMonth: number; users: AdminUser[] }

export default function Admin() {
  const { session, user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [transferEmail, setTransferEmail] = useState('')
  const [transferCredits, setTransferCredits] = useState('10')
  const [transferring, setTransferring] = useState(false)
  const [transferNotice, setTransferNotice] = useState('')
  const isAdmin = isAdminUser(user)

  const load = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true); setError('')
    try {
      const headers: Record<string, string> = {}
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const response = await fetch('/api/admin/stats', { headers })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setStats(data)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load admin data') }
    finally { setLoading(false) }
  }, [isAdmin, session?.access_token])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 15_000)
    return () => window.clearInterval(timer)
  }, [load])

  const transfer = async () => {
    if (!session?.access_token || transferring) return
    setTransferring(true); setTransferNotice('')
    try {
      const response = await fetch('/api/admin/credits/transfer', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: transferEmail, credits: Number(transferCredits), idempotencyKey: crypto.randomUUID() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Credit transfer failed')
      setTransferNotice(`Transferred ${data.credits} credits to ${data.email}. New balance: ${data.balance}.`)
      await load()
    } catch (cause) { setTransferNotice(cause instanceof Error ? cause.message : 'Credit transfer failed') }
    finally { setTransferring(false) }
  }

  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <div className="mx-auto max-w-6xl px-4 py-20 sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><div className="flex items-center gap-2"><ShieldCheck size={20}/><h1 className="text-xl font-semibold">Admin</h1></div><p className="mt-2 text-sm text-white/55">Live AlphaTekX account activity. Refreshes every 15 seconds.</p></div>
      <button onClick={() => void load()} className="flex min-h-11 items-center gap-2 rounded-lg border border-violet-400/20 px-4 text-sm"><RefreshCw size={16}/>Refresh</button>
    </div>
    {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-500/10 p-3 text-sm text-rose-300">{error}</p>}
    {loading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin"/></div> : stats && <>
      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat icon={Users} label="Total signups" value={stats.total}/><Stat icon={Activity} label="Active now" value={stats.active}/><Stat icon={UserPlus} label="Today" value={stats.today}/><Stat icon={Calendar} label="This month" value={stats.thisMonth}/><Stat icon={Calendar} label="Last month" value={stats.lastMonth}/></div>
      <section className="mt-7 rounded-xl border border-[#FFD700]/20 bg-[#15151F]/80 p-5 shadow-[0_0_30px_rgba(255,215,0,.05)]">
        <div className="flex items-center gap-2"><Send size={18} className="text-[#FFD700]"/><h2 className="font-semibold">Transfer credits</h2></div>
        <p className="mt-1 text-sm text-white/55">Grant credits to an existing AlphaTekx account. Authorization is verified by the server.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <input type="email" value={transferEmail} onChange={event => setTransferEmail(event.target.value)} placeholder="customer@gmail.com" className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-white outline-none focus:border-[#FFD700]/50"/>
          <input aria-label="Credits" type="number" min="1" max="1000000" value={transferCredits} onChange={event => setTransferCredits(event.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-white outline-none focus:border-[#FFD700]/50"/>
          <button onClick={() => void transfer()} disabled={transferring || !transferEmail || Number(transferCredits) < 1} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FFD700] to-[#8B5CF6] px-5 font-black text-black disabled:cursor-not-allowed disabled:opacity-40">{transferring ? <LoaderCircle size={17} className="animate-spin"/> : <Send size={17}/>}Transfer</button>
        </div>
        {transferNotice && <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/80">{transferNotice}</p>}
      </section>
      <section className="mt-7 overflow-hidden rounded-xl border border-violet-400/20 liquid-glass">
        <div className="border-b border-violet-400/20 px-5 py-4"><h2 className="font-semibold">Users</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-violet-500/10 text-xs text-white/55"><tr><th className="px-5 py-3">Email</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Credits</th><th className="px-5 py-3">Joined</th><th className="px-5 py-3">Last active</th></tr></thead><tbody>{stats.users.map(item => <tr key={item.id} className="border-t border-violet-400/20"><td className="px-5 py-4 font-medium"><button onClick={() => setTransferEmail(item.email)} className="text-left hover:text-[#FFD700]">{item.email}</button></td><td className="px-5 py-4 capitalize">{item.plan || 'free'}</td><td className="px-5 py-4">{isAdminUser({ email: item.email }) ? 'Unlimited' : (item.credits ?? 0)}</td><td className="px-5 py-4 text-white/55">{new Date(item.created_at).toLocaleString()}</td><td className="px-5 py-4 text-white/55">{item.last_active_at ? new Date(item.last_active_at).toLocaleString() : '—'}</td></tr>)}</tbody></table></div>
      </section>
    </>}
  </div>
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return <article className="rounded-xl border border-violet-400/20 liquid-glass p-5"><Icon size={18}/><p className="mt-5 text-3xl font-semibold">{value}</p><p className="mt-1 text-sm text-white/55">{label}</p></article>
}
