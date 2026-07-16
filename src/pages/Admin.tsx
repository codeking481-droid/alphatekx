import { useCallback, useEffect, useState } from 'react'
import { Activity, LoaderCircle, RefreshCw, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

type AdminUser = { id: string; email: string; credits: number; plan: string; created_at: string; last_active_at?: string }
type Stats = { total: number; active: number; today: number; users: AdminUser[] }

export default function Admin() {
  const { session, user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const isAdmin = user?.email?.toLowerCase() === 'iamdan4live@gmail.com'
  const load = useCallback(async () => {
    if (!session?.access_token) return
    setError('')
    try { const response = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${session.access_token}` } }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setStats(data) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load admin data') }
    finally { setLoading(false) }
  }, [session?.access_token])
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 15_000); return () => window.clearInterval(timer) }, [load])
  if (!isAdmin) return <Navigate to="/workspace" replace/>
  return <div className="mx-auto max-w-6xl px-5 py-20"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-2"><ShieldCheck size={20}/><h1 className="text-xl font-semibold">Admin</h1></div><p className="mt-2 text-sm text-gray-500">Live AlphaTekX account activity. Refreshes every 15 seconds.</p></div><button onClick={()=>void load()} className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm"><RefreshCw size={16}/>Refresh</button></div>{error&&<p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}{loading?<div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin"/></div>:stats&&<><div className="mt-7 grid gap-4 sm:grid-cols-3"><Stat icon={Users} label="Total signups" value={stats.total}/><Stat icon={Activity} label="Active now" value={stats.active}/><Stat icon={UserPlus} label="Signed up today" value={stats.today}/></div><section className="mt-7 overflow-hidden rounded-xl border border-gray-200 bg-white"><div className="border-b border-gray-200 px-5 py-4"><h2 className="font-semibold">Users</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-5 py-3">Email</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Credits</th><th className="px-5 py-3">Joined</th><th className="px-5 py-3">Last active</th></tr></thead><tbody>{stats.users.map(item=><tr key={item.id} className="border-t border-gray-100"><td className="px-5 py-4 font-medium">{item.email}</td><td className="px-5 py-4 capitalize">{item.plan}</td><td className="px-5 py-4">{item.email.toLowerCase()==='iamdan4live@gmail.com'?'Unlimited':item.credits}</td><td className="px-5 py-4 text-gray-500">{new Date(item.created_at).toLocaleString()}</td><td className="px-5 py-4 text-gray-500">{item.last_active_at?new Date(item.last_active_at).toLocaleString():'Not tracked yet'}</td></tr>)}</tbody></table></div></section></>}</div>
}
function Stat({icon:Icon,label,value}:{icon:typeof Users;label:string;value:number}){return <article className="rounded-xl border border-gray-200 bg-white p-5"><Icon size={18}/><p className="mt-5 text-3xl font-semibold">{value}</p><p className="mt-1 text-sm text-gray-500">{label}</p></article>}
