import { useEffect, useState } from 'react'
import { CheckCircle, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getJson, postJson } from '../lib/apiClient'
import type { Withdrawal } from '../lib/types'

export default function AdminWithdrawals() {
  const { user } = useAuth()
  const isAdmin = user?.email?.toLowerCase() === 'iamdan4live@gmail.com'
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [proof, setProof] = useState<Record<string, string>>({})

  const load = async () => {
    setLoading(true); setError('')
    try {
      const data = await getJson<{ withdrawals: Withdrawal[] }>('/api/admin/withdrawals')
      setWithdrawals(data.withdrawals)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load withdrawals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (isAdmin) void load() }, [isAdmin])

  const markPaid = async (id: string) => {
    try {
      await postJson<{ success: boolean }>(`/api/admin/withdrawals/${id}/paid`, { proof: proof[id] || '' })
      void load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to update withdrawal')
    }
  }

  if (!isAdmin) return <Navigate to="/workspace" replace />

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-indigo-400" /><h1 className="text-xl font-semibold">Admin — Withdrawals</h1></div>
        <button onClick={() => void load()} className="flex min-h-10 items-center gap-2 rounded-lg border border-white/[.15] px-3 text-sm transition-colors hover:bg-white/[.04]"><RefreshCw size={14} /> Refresh</button>
      </div>
      <p className="mt-2 text-sm text-white/55">Review and approve seller payouts.</p>
      {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? (
        <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin" size={28} /></div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/[.12] bg-white/[.03]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/[.04] text-xs text-white/55"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Seller</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Bank</th><th className="px-5 py-3">Account</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Action</th></tr></thead>
              <tbody>
                {withdrawals.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-white/55">No withdrawals yet.</td></tr>}
                {withdrawals.map(w => (
                  <tr key={w.id} className="border-t border-white/10">
                    <td className="px-5 py-4 text-white/70">{new Date(w.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-4">{w.userId.slice(0, 8)}</td>
                    <td className="px-5 py-4 font-medium">${w.amount.toFixed(2)}</td>
                    <td className="px-5 py-4 text-white/70">{w.bankName}</td>
                    <td className="px-5 py-4 text-white/70">{w.accountName}<br/><span className="text-xs text-white/40">{w.accountNumber}</span></td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${w.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : w.status === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>{w.status}</span></td>
                    <td className="px-5 py-4">
                      {w.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <input value={proof[w.id] || ''} onChange={e => setProof(p => ({ ...p, [w.id]: e.target.value }))} placeholder="Transfer ref / proof" className="w-40 rounded-lg border border-white/[.15] bg-white/[.04] px-2 py-1.5 text-xs outline-none focus:border-indigo-400/50" />
                          <button onClick={() => void markPaid(w.id)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"><CheckCircle size={12} /> Mark paid</button>
                        </div>
                      ) : (
                        <span className="text-xs text-white/40">{w.transferCode || 'No proof'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
