import { useEffect, useMemo, useState } from 'react'
import { Activity, Brain, Camera, ChevronRight, Goal, Loader2, MessageCircle, Mic, Pin, Plus, Search, Sparkles, Target, Trash2, TrendingUp, Wand2, X } from 'lucide-react'
import { getJson, postJson, patchJson, deleteJson } from '../lib/apiClient'
import VoicePanel from '../components/brain/VoicePanel'
import VisionPanel from '../components/brain/VisionPanel'

type Tab = 'insights' | 'memory' | 'goals' | 'voice' | 'vision' | 'healing'

interface MemoryRecord { id: string; event_type: string; category?: string; pinned?: boolean; summary: string; created_at: string; source_workflow_id?: string; metadata?: Record<string, unknown> }
interface Customer { id: string; name: string; email: string; amount: number; paid_at: string }
interface Payment { id: string; amount: number; status: string; reference?: string; paid_at: string }
interface Goal { id: string; goal_text: string; target_value: number; current_value: number; deadline?: string; progress_percent: number; status: string }
interface Prediction { id: string; type: string; title: string; description: string; severity: string; created_at: string }
interface HealingLog { id: string; error_pattern: string; attempted_fix: string; result: string; retries: number; created_at: string }

const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'insights', label: 'Insights', icon: Sparkles },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'vision', label: 'Vision', icon: Camera },
  { id: 'healing', label: 'Healing', icon: Activity },
]

export default function AlphaBrain() {
  const [tab, setTab] = useState<Tab>('insights')
  const [busy, setBusy] = useState(false)

  // insights
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [insightsGenerated, setInsightsGenerated] = useState(false)

  // memory
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<{ answer: string; sources?: MemoryRecord[] } | null>(null)
  const [memories, setMemories] = useState<MemoryRecord[]>([])
  const [memoryFilter, setMemoryFilter] = useState('')
  const [memoryCategory, setMemoryCategory] = useState('all')
  const [newMemory, setNewMemory] = useState('')
  const [newCategory, setNewCategory] = useState('note')
  const [newPinned, setNewPinned] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [payments, setPayments] = useState<Payment[]>([])

  // goals
  const [goals, setGoals] = useState<Goal[]>([])
  const [goalText, setGoalText] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalDeadline, setGoalDeadline] = useState('')

  // healing
  const [healing, setHealing] = useState<HealingLog[]>([])

  const load = async () => {
    try {
      if (tab === 'insights') {
        const data = await getJson<{ predictions: Prediction[] }>('/api/brain/predictions')
        setPredictions(data.predictions || [])
      }
      if (tab === 'memory') {
        const data = await getJson<{ memories: MemoryRecord[]; customers: Customer[]; payments: Payment[] }>('/api/brain/memory')
        setMemories(data.memories || [])
        const c = await getJson<{ customers: Customer[] }>('/api/brain/customers')
        setCustomers(c.customers || [])
        const p = await getJson<{ payments: Payment[] }>('/api/brain/payments')
        setPayments(p.payments || [])
      }
      if (tab === 'goals') {
        const data = await getJson<{ goals: Goal[] }>('/api/brain/goals')
        setGoals(data.goals || [])
      }
      if (tab === 'healing') {
        const data = await getJson<{ logs: HealingLog[] }>('/api/brain/self-heal')
        setHealing(data.logs || [])
      }
    } catch {}
  }

  useEffect(() => { void load() }, [tab])

  const askMemory = async () => {
    if (!query.trim()) return
    setBusy(true)
    try {
      const data = await postJson<{ answer: string; sources?: MemoryRecord[] }>('/api/brain/memory/ask', { question: query })
      setAnswer(data)
    } catch (err: any) { setAnswer({ answer: err.message || 'Could not query memory.' }) }
    setBusy(false)
  }

  const loadMemory = async () => {
    try {
      const params = new URLSearchParams()
      if (memoryCategory !== 'all') params.set('event_type', memoryCategory)
      if (memoryFilter) params.set('query', memoryFilter)
      const data = await getJson<{ memories: MemoryRecord[] }>(`/api/brain/memory?${params.toString()}`)
      setMemories(data.memories || [])
    } catch {}
  }

  const addMemory = async () => {
    if (!newMemory.trim()) return
    setBusy(true)
    try {
      await postJson('/api/brain/memory', { category: newCategory, summary: newMemory, pinned: newPinned })
      setNewMemory(''); setNewPinned(false); setNewCategory('note')
      await loadMemory()
    } catch {}
    setBusy(false)
  }

  const removeMemory = async (id: string) => {
    if (!confirm('Delete this memory?')) return
    try { await deleteJson(`/api/brain/memory/${id}`); await loadMemory() } catch {}
  }

  const togglePinMemory = async (id: string, pinned: boolean) => {
    try { await patchJson(`/api/brain/memory/${id}`, { pinned: !pinned }); await loadMemory() } catch {}
  }

  const clearAllMemory = async () => {
    if (!confirm('Clear all memories? This cannot be undone.')) return
    try { await postJson('/api/brain/memory/clear', {}); setMemories([]) } catch {}
  }

  useEffect(() => { if (tab === 'memory') void loadMemory() }, [tab, memoryFilter, memoryCategory])

  const createGoal = async () => {
    if (!goalText.trim() || !goalTarget) return
    setBusy(true)
    try {
      await postJson('/api/brain/goals', { goal_text: goalText, target_value: Number(goalTarget), deadline: goalDeadline || undefined })
      setGoalText(''); setGoalTarget(''); setGoalDeadline('')
      const data = await getJson<{ goals: Goal[] }>('/api/brain/goals')
      setGoals(data.goals || [])
    } catch {}
    setBusy(false)
  }

  const updateGoal = async (id: string, current: number) => {
    try {
      await patchJson(`/api/brain/goals/${id}`, { current })
      const data = await getJson<{ goals: Goal[] }>('/api/brain/goals')
      setGoals(data.goals || [])
    } catch {}
  }

  const generateInsights = async () => {
    setBusy(true)
    try {
      const data = await postJson<{ predictions: Prediction[] }>('/api/brain/predictions/generate', {})
      setPredictions(data.predictions || [])
      setInsightsGenerated(true)
    } catch {}
    setBusy(false)
  }

  const dismissInsight = async (id: string) => {
    try {
      await postJson('/api/brain/predictions/dismiss', { id })
      setPredictions(prev => prev.filter(p => p.id !== id))
    } catch {}
  }

  const severityClass = (s: string) => {
    if (s === 'warning') return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    if (s === 'error') return 'bg-red-500/15 text-red-300 border-red-500/30'
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  }

  const summary = useMemo(() => {
    return [
      { label: 'Memory events', value: memories.length, icon: Brain },
      { label: 'Active goals', value: goals.filter(g => g.status === 'active').length, icon: Target },
      { label: 'Customers', value: customers.length, icon: MessageCircle },
      { label: 'Predictions', value: predictions.length, icon: Sparkles },
    ]
  }, [memories, goals, customers, predictions])

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Brain className="text-indigo-400" size={26}/>Your Brain</h1>
          <p className="mt-1 text-sm text-white/55">Everything Alpha remembers about your business, goals, and automations.</p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {summary.map(s => <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><div className="flex items-center gap-2 text-xs text-white/55"><s.icon size={14}/>{s.label}</div><div className="mt-2 text-2xl font-semibold">{s.value}</div></div>)}
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {tabs.map(t => {
            const Icon = t.icon
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${tab===t.id?'border-indigo-500/50 bg-indigo-500/15 text-indigo-200':'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]'}`}>
                <Icon size={16}/>{t.label}
              </button>
            )
          })}
        </div>

        {tab === 'insights' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Alpha Insights</h2>
              <button onClick={generateInsights} disabled={busy} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                {busy ? <Loader2 size={16} className="animate-spin"/> : <Wand2 size={16}/>} Generate insights
              </button>
            </div>
            {predictions.length === 0 && <p className="text-sm text-white/40">No insights yet. Click generate to analyze your memory.</p>}
            {predictions.map(p => (
              <div key={p.id} className={`rounded-2xl border p-4 ${severityClass(p.severity)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold"><TrendingUp size={16}/>{p.title}</div>
                    <p className="mt-1 text-sm opacity-90">{p.description}</p>
                    <p className="mt-2 text-xs opacity-70">{new Date(p.created_at).toLocaleString()}</p>
                  </div>
                  <button onClick={() => dismissInsight(p.id)} className="rounded-lg p-1 hover:bg-white/10"><X size={14}/></button>
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === 'memory' && (
          <section className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
              <label className="text-sm font-medium">Ask Alpha anything about your customers, payments, or workflows</label>
              <div className="mt-3 flex gap-2">
                <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key==='Enter' && askMemory()} placeholder="Who is Chidi and why did we refund him?" className="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm outline-none focus:border-indigo-500" />
                <button onClick={askMemory} disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin"/> : 'Ask'}</button>
              </div>
              {answer && <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm"><p className="font-medium text-white/90">{answer.answer}</p>{answer.sources && answer.sources.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-white/60">{answer.sources.map((s,i) => <li key={i}>{s.summary} — {new Date(s.created_at).toLocaleDateString()}</li>)}</ul>}</div>}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
              <h3 className="text-sm font-medium">Save a memory</h3>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <textarea value={newMemory} onChange={e => setNewMemory(e.target.value)} onKeyDown={e => e.key==='Enter' && !e.shiftKey && (e.preventDefault(), addMemory())} placeholder="Important note, instruction, preference, or knowledge..." className="flex-1 rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-indigo-500" />
                <div className="flex flex-col gap-2 md:w-48">
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                    <option value="note">Note</option><option value="knowledge">Knowledge</option><option value="instruction">Instruction</option><option value="preference">Preference</option><option value="project_context">Project context</option><option value="document">Document</option>
                  </select>
                  <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={newPinned} onChange={e => setNewPinned(e.target.checked)} className="rounded border-white/20 bg-black/20" /> Pin important</label>
                  <button onClick={addMemory} disabled={busy || !newMemory.trim()} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? 'Saving...' : <><Plus size={14}/> Save</>}</button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h3 className="text-sm font-medium">Your Brain</h3>
                <div className="flex flex-1 flex-col gap-2 md:flex-row md:justify-end">
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <input value={memoryFilter} onChange={e => setMemoryFilter(e.target.value)} placeholder="Search memories..." className="w-full rounded-xl border border-white/10 bg-black/20 py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-500 md:w-64" />
                  </div>
                  <select value={memoryCategory} onChange={e => setMemoryCategory(e.target.value)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                    <option value="all">All</option><option value="note">Notes</option><option value="knowledge">Knowledge</option><option value="instruction">Instructions</option><option value="preference">Preferences</option><option value="project_context">Project context</option><option value="document">Documents</option>
                  </select>
                  <button onClick={clearAllMemory} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-medium text-white/70 hover:bg-white/[0.1]">Clear all</button>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {[...memories.filter(m => m.pinned).sort((a,b) => new Date(b.created_at).getTime()-new Date(a.created_at).getTime()), ...memories.filter(m => !m.pinned).sort((a,b) => new Date(b.created_at).getTime()-new Date(a.created_at).getTime())].map(m => (
                  <div key={m.id} className={`rounded-xl border p-4 ${m.pinned ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/[0.08] bg-black/20'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-xs font-medium text-indigo-300"><Brain size={13}/>{m.event_type}{m.pinned && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">Pinned</span>}</div>
                        <p className="mt-1 text-sm text-white/80">{m.summary}</p>
                        <p className="text-[10px] text-white/40">{new Date(m.created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => togglePinMemory(m.id, !!m.pinned)} title={m.pinned ? 'Unpin' : 'Pin'} className="rounded-lg p-2 hover:bg-white/10"><Pin size={14} className={m.pinned ? 'fill-amber-400 text-amber-400' : 'text-white/50'} /></button>
                        <button onClick={() => removeMemory(m.id)} title="Delete" className="rounded-lg p-2 hover:bg-red-500/10"><Trash2 size={14} className="text-white/50 hover:text-red-300"/></button>
                      </div>
                    </div>
                  </div>
                ))}
                {memories.length === 0 && <p className="text-sm text-white/40">No memory yet. Add a note, instruction, or preference above.</p>}
              </div>
            </div>
          </section>
        )}

        {tab === 'goals' && (
          <section className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
              <h3 className="text-sm font-medium">Create goal</h3>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <input value={goalText} onChange={e => setGoalText(e.target.value)} placeholder="Make 5M Naira this month" className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm outline-none focus:border-indigo-500 md:col-span-2" />
                <input value={goalTarget} onChange={e => setGoalTarget(e.target.value)} type="number" placeholder="Target value" className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm outline-none focus:border-indigo-500" />
                <input value={goalDeadline} onChange={e => setGoalDeadline(e.target.value)} type="date" className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm outline-none focus:border-indigo-500" />
              </div>
              <button onClick={createGoal} disabled={busy} className="mt-4 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? 'Saving...' : 'Add goal'}</button>
            </div>

            <div className="space-y-3">
              {goals.map(g => (
                <div key={g.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-medium"><Goal size={18} className="text-indigo-400"/>{g.goal_text}</div>
                    <div className="text-sm text-white/70">{g.current_value} / {g.target_value}</div>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all" style={{ width: `${Math.min(100, g.progress_percent)}%` }}/></div>
                  <div className="mt-3 flex items-center gap-2">
                    <input type="number" defaultValue={g.current_value} onBlur={e => updateGoal(g.id, Number(e.target.value))} className="w-28 rounded-lg border border-white/10 bg-black/20 px-3 py-1 text-sm outline-none" />
                    <span className="text-xs text-white/50">{g.progress_percent}%</span>
                    {g.deadline && <span className="ml-auto text-xs text-white/50">Deadline: {new Date(g.deadline).toLocaleDateString()}</span>}
                  </div>
                </div>
              ))}
              {goals.length === 0 && <p className="text-sm text-white/40">No goals yet. Add one and Alpha will track progress from payments and workflows.</p>}
            </div>
          </section>
        )}

        {tab === 'voice' && <VoicePanel />}

        {tab === 'vision' && <VisionPanel />}

        {tab === 'healing' && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
            <h2 className="flex items-center gap-2 text-lg font-medium"><Activity size={18} className="text-emerald-400"/>Self-Healing Logs</h2>
            {healing.length === 0 && <p className="mt-3 text-sm text-white/40">No healing events yet. Alpha logs repeated errors and suggests fixes.</p>}
            {healing.map(h => (
              <div key={h.id} className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-amber-300"><ChevronRight size={12}/>{h.error_pattern}</div>
                <p className="mt-1 text-white/70">Fix: {h.attempted_fix || '—'}</p>
                <p className="mt-2 text-xs text-white/40">Status: {h.result} • Retries: {h.retries} • {new Date(h.created_at).toLocaleString()}</p>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
