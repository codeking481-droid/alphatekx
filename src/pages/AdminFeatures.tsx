import { useEffect, useState } from 'react'
import { LoaderCircle, Save, ShieldCheck, UserPlus, X } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getJson, postJson, putJson } from '../lib/apiClient'

type FeatureState = 'disabled' | 'beta' | 'public' | 'maintenance'
type Feature = { id: string; name: string; state: FeatureState; category: string; stop_existing: boolean; updated_at: string; updated_by: string }
type Audit = { id: string; feature_id: string; old_state: string; new_state: string; changed_at: string; changed_by: string }
type Snapshot = { features: Feature[]; betaUsers: string[]; audit: Audit[]; storage?: { mode: string; error?: string | null }; revision?: number }
const states: FeatureState[] = ['disabled', 'beta', 'public', 'maintenance']

export default function AdminFeatures() {
  const { user, session } = useAuth()
  const isAdmin = user?.email?.toLowerCase() === 'iamdan4live@gmail.com'
  const [data, setData] = useState<Snapshot>({ features: [], betaUsers: [], audit: [] })
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [betaEmail, setBetaEmail] = useState('')

  const load = async () => {
    try { setData(await getJson<Snapshot>('/api/admin/features', { token: session?.access_token })) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load feature management.') }
  }
  useEffect(() => {
    if (!isAdmin) return
    void load()
    const refresh = () => void load()
    const timer = window.setInterval(refresh, 5_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [isAdmin, session?.access_token])

  const save = async (feature: Feature) => {
    setBusy(feature.id); setNotice('')
    try {
      const result = await putJson<{ feature: Feature; persisted: boolean; warning?: string | null }>(`/api/admin/features/${encodeURIComponent(feature.id)}`, { state: feature.state, stopExisting: feature.stop_existing }, { token: session?.access_token })
      setData(current => ({ ...current, features: current.features.map(item => item.id === feature.id ? result.feature : item) }))
      setNotice(result.warning ? `${feature.name} changed now. Database warning: ${result.warning}` : `${feature.name} updated. The new policy is active now.`)
      await load()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Feature update failed.') }
    finally { setBusy('') }
  }
  const setBeta = async (email: string, enabled: boolean) => {
    setBusy(`beta:${email}`)
    try {
      const result = await postJson<{ betaUsers: string[] }>('/api/admin/features/beta-users', { email, enabled }, { token: session?.access_token })
      setData(current => ({ ...current, betaUsers: result.betaUsers }))
      setBetaEmail('')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Beta tester update failed.') }
    finally { setBusy('') }
  }

  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
    <header className="flex items-center gap-3"><ShieldCheck className="text-violet-300"/><div><h1 className="text-2xl font-semibold">Feature Management</h1><p className="mt-1 text-sm text-white/55">Control feature access without redeploying.</p></div></header>
    {data.storage && <p className={`mt-4 text-xs ${data.storage.mode === 'database' ? 'text-emerald-300' : 'text-amber-300'}`}>Storage: {data.storage.mode === 'database' ? 'Database connected' : 'Live server fallback'}{data.storage.error ? ` · ${data.storage.error}` : ''}</p>}
    {notice && <p role="status" className="mt-5 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm">{notice}</p>}
    <section className="mt-7 grid gap-3">{data.features.map(feature => <article key={feature.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-medium">{feature.name}</h2><p className="mt-1 text-xs text-white/45">{feature.category} · Modified {new Date(feature.updated_at).toLocaleString()} by {feature.updated_by}</p></div><select aria-label={`${feature.name} status`} value={feature.state} onChange={event => setData(current => ({ ...current, features: current.features.map(item => item.id === feature.id ? { ...item, state: event.target.value as FeatureState } : item) }))} className="field w-40 capitalize">{states.map(state => <option key={state} value={state}>{state}</option>)}</select></div>
      {(feature.state === 'disabled' || feature.state === 'maintenance') && <label className="mt-4 flex items-center gap-2 text-sm text-white/65"><input type="checkbox" checked={feature.stop_existing} onChange={event => setData(current => ({ ...current, features: current.features.map(item => item.id === feature.id ? { ...item, stop_existing: event.target.checked } : item) }))}/>Stop existing automations immediately</label>}
      <button onClick={() => void save(feature)} disabled={Boolean(busy)} className="action mt-4">{busy === feature.id ? <LoaderCircle size={16} className="animate-spin"/> : <Save size={16}/>}Save</button>
    </article>)}</section>
    <section className="mt-10 rounded-2xl border border-white/10 bg-white/[.035] p-5"><h2 className="font-semibold">Beta testers</h2><div className="mt-4 flex gap-2"><input value={betaEmail} onChange={event => setBetaEmail(event.target.value)} placeholder="beta@example.com" className="field"/><button onClick={() => void setBeta(betaEmail, true)} disabled={!betaEmail.trim() || Boolean(busy)} className="action"><UserPlus size={16}/>Add</button></div><div className="mt-4 flex flex-wrap gap-2">{data.betaUsers.map(email => <span key={email} className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs">{email}<button onClick={() => void setBeta(email, false)} aria-label={`Remove ${email}`}><X size={13}/></button></span>)}</div></section>
    <section className="mt-10"><h2 className="font-semibold">Audit log</h2><div className="mt-4 space-y-2">{data.audit.map(item => <div key={item.id} className="rounded-xl border border-white/10 p-3 text-sm"><span className="font-medium">{item.feature_id}</span> <span className="text-white/55">{item.old_state} → {item.new_state}</span><span className="mt-1 block text-xs text-white/40">{new Date(item.changed_at).toLocaleString()} · {item.changed_by}</span></div>)}</div></section>
  </main>
}
