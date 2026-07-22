import { useEffect, useMemo, useState } from 'react'
import { ChefHat, Code2, ExternalLink, Globe2, LoaderCircle, Paintbrush, PlaneTakeoff, Rocket, ShoppingBag, Sparkles, Store, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { spendCredits } from '../lib/creditStore'
import { postJson } from '../lib/apiClient'
import { addActivity, createMission, getActivities, getCreations, getMissions, saveCreation, subscribeStore, updateCreation, updateMissionProgress, updateMissionStatus } from '../lib/missionStore'
import { createAgentFromNL, suggestedAgentsForMission } from '../lib/agents/agentParser'
import { saveAgent } from '../lib/agents/agentStore'
import { getLocalUser } from '../lib/integrations'
import { useAuth } from '../lib/auth'
import { Bot, Plus } from 'lucide-react'
import type { Activity, CreationFile, Mission } from '../lib/types'

type Blueprint = {
  id: string
  name: string
  icon: typeof ChefHat
  difficulty: string
  time: string
  credits: number
  goal: string
  description: string
}

type BuildResponse = {
  files: CreationFile[]
  code: string
  generatedPath: string
  logs: string[]
}

const blueprints: Blueprint[] = [
  { id: 'restaurant-os', name: 'Restaurant Empire OS', icon: ChefHat, difficulty: 'Intermediate', time: '4 mins', credits: 10, goal: 'Build a restaurant operating system with menu, reservations, orders, admin, and customer contact flow', description: 'Menu, booking, order flow, gallery, and admin-ready structure.' },
  { id: 'commerce-os', name: 'E-commerce Store OS', icon: ShoppingBag, difficulty: 'Advanced', time: '5 mins', credits: 12, goal: 'Build an e-commerce store with catalog, search, cart, checkout, inventory, and admin sales view', description: 'Products, cart, checkout, stock handling, and order dashboard.' },
  { id: 'portfolio-os', name: 'Premium Portfolio OS', icon: UserRound, difficulty: 'Easy', time: '3 mins', credits: 6, goal: 'Build a premium portfolio website with projects, testimonials, contact form, and case studies', description: 'A polished personal site for creators, engineers, and agencies.' },
  { id: 'saas-dashboard', name: 'SaaS Dashboard OS', icon: Store, difficulty: 'Advanced', time: '6 mins', credits: 14, goal: 'Build a SaaS dashboard with metrics, customers, tasks, settings, billing, and responsive admin UI', description: 'Operational dashboard with real state, filters, and business panels.' },
  { id: 'landing-system', name: 'Launch Landing OS', icon: Rocket, difficulty: 'Easy', time: '3 mins', credits: 5, goal: 'Build a conversion landing page with hero, features, pricing, FAQ, and lead capture form', description: 'Fast public page built for signups and product launch.' },
  { id: 'learning-os', name: 'Learning Platform OS', icon: Globe2, difficulty: 'Intermediate', time: '5 mins', credits: 10, goal: 'Build a learning platform with lessons, progress, quizzes, certificates, and student dashboard', description: 'Courses, progress tracking, quizzes, and learner experience.' },
]

const workerStages = [
  { role: 'Planner', icon: Sparkles, progress: 15, line: 'Mapping product architecture and acceptance checks...' },
  { role: 'Builder', icon: Code2, progress: 54, line: 'Generating React files, data models, and working interactions...' },
  { role: 'Designer', icon: Paintbrush, progress: 86, line: 'Applying International Orange Liquid Glass design system...' },
]

function previewDocument(code: string) {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script><script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script><script src="https://unpkg.com/@babel/standalone/babel.min.js"></script><style>html,body,#root{min-height:100%;margin:0;background:#0A0A0A}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="text/babel">${code.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
}

export default function Missions() {
  const { user } = useAuth()
  const [selected, setSelected] = useState<Blueprint | null>(null)
  const [activeMission, setActiveMission] = useState<Mission | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [creation, setCreation] = useState<{ id: string; code: string; files: CreationFile[]; path: string } | null>(null)
  const [status, setStatus] = useState<'idle' | 'queued' | 'building' | 'review' | 'deployed' | 'error'>('idle')
  const [notice, setNotice] = useState('')
  const [codexHistory, setCodexHistory] = useState(() => getMissions().slice(0, 8))

  useEffect(() => subscribeStore(() => {
    setCodexHistory(getMissions().slice(0, 8))
    if (activeMission) setActivities(getActivities(activeMission.id))
  }), [activeMission])

  const progress = activeMission?.progress ?? 0
  const latestCreations = useMemo(() => getCreations().slice(0, 5), [codexHistory, creation])

  const startMission = async (blueprint: Blueprint) => {
    if (status === 'building' || status === 'queued') return
    setSelected(blueprint)
    setStatus('queued')
    setCreation(null)
    setLogs([])
    setNotice('')
    if (!await spendCredits(blueprint.credits)) {
      setStatus('error')
      setNotice(`You need ${blueprint.credits} credits to start this mission.`)
      return
    }
    const mission = createMission(blueprint.goal, blueprint.name)
    updateMissionStatus(mission.id, 'queued', 4)
    addActivity(mission.id, 'Mission queued')
    setActiveMission(mission)
    setActivities(getActivities(mission.id))

    try {
      await runStage(mission.id, '[Planner] Mapping pages, data flows, user actions, and edge cases...', 15)
      setStatus('building')
      updateMissionStatus(mission.id, 'building', 22)
      await runStage(mission.id, '[Builder] Preparing generated project folder and production files...', 38)
      const result = await postJson<BuildResponse>('/api/missions/build', {
        missionId: mission.id,
        blueprintId: blueprint.id,
        name: blueprint.name,
        goal: blueprint.goal,
      }, { timeoutMs: 120_000 })
      setLogs(result.logs)
      await runStage(mission.id, '[Designer] Applying International Orange Liquid Glass components...', 76)
      await runStage(mission.id, '[Builder] Generated files written to disk and validated...', 88)
      const saved = saveCreation({ missionId: mission.id, title: blueprint.name, code: result.code, type: blueprint.id, files: result.files })
      updateMissionStatus(mission.id, 'review', 100)
      addActivity(mission.id, `[Designer] Preview ready from ${result.generatedPath}`)
      setCreation({ id: saved.id, code: result.code, files: result.files, path: result.generatedPath })
      setStatus('review')
    } catch (error) {
      setStatus('error')
      addActivity(mission.id, `[QA] Mission stopped: ${error instanceof Error ? error.message : 'Build failed'}`)
      setNotice(error instanceof Error ? error.message : 'Mission build failed.')
    }
  }

  const runStage = async (missionId: string, message: string, nextProgress: number) => {
    addActivity(missionId, message)
    updateMissionProgress(missionId, nextProgress)
    setActivities(getActivities(missionId))
    await new Promise(resolve => window.setTimeout(resolve, 420))
  }

  const deploy = () => {
    if (!activeMission || !creation) return
    updateMissionStatus(activeMission.id, 'deployed', 100)
    updateCreation(creation.id, { status: 'deployed', deploymentUrl: `https://${activeMission.id.slice(0, 8)}.alphatekx.name.ng` })
    addActivity(activeMission.id, '[Deployment] Mission deployed to AlphaTekX launch pipeline.')
    setStatus('deployed')
  }

  return <div className="min-h-screen bg-background px-5 py-20 text-white md:px-8">
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <main className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.22em] text-white/45">Mission Mode</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">AI Creation Engine</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">Pick a blueprint. AlphaTekX launches Planner, Builder, and Designer workers, writes real project files to `generated/[missionId]/`, then hands you a preview and deploy action.</p>
          </div>
          <Link to="/workspace" className="rounded-xl border border-white/[.12] liquid-glass px-4 py-3 text-sm">General chat</Link>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {blueprints.map(item => {
            const Icon = item.icon
            return <article key={item.id} className="liquid-glass rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-[#E56B2D]">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-12 place-items-center rounded-xl btn-alpha"><Icon size={22}/></span>
                <span className="rounded-full border border-white/[.12] px-3 py-1 text-xs text-white/65">{item.credits} credits</span>
              </div>
              <h2 className="mt-5 text-lg font-semibold">{item.name}</h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-white/60">{item.description}</p>
              <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-white/55">
                <span className="rounded-lg bg-white/[.05] px-3 py-2">Difficulty: {item.difficulty}</span>
                <span className="rounded-lg bg-white/[.05] px-3 py-2">Build: {item.time}</span>
              </div>
              <button onClick={() => void startMission(item)} disabled={status === 'queued' || status === 'building'} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl btn-alpha text-sm font-semibold disabled:opacity-50">
                {(status === 'queued' || status === 'building') && selected?.id === item.id ? <LoaderCircle className="animate-spin" size={17}/> : <PlaneTakeoff size={17}/>}
                Start Mission
              </button>
            </article>
          })}
        </section>

        {(activeMission || notice) && <section className="mt-8 liquid-glass rounded-2xl p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[.2em] text-white/45">Mission Control</p>
              <h2 className="mt-2 text-xl font-semibold">{selected?.name ?? activeMission?.title ?? 'Mission'}</h2>
              <p className="mt-2 text-sm text-white/60">{status === 'error' ? notice : `Status: ${status.toUpperCase()}`}</p>
            </div>
            <div className="flex gap-2">
              {activeMission && <Link to={`/mission/${activeMission.id}`} className="rounded-xl border border-white/[.12] liquid-glass px-4 py-3 text-sm">Edit Mission</Link>}
              {creation && <button onClick={deploy} className="rounded-xl btn-alpha px-5 py-3 text-sm font-semibold">Deploy</button>}
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[.08]"><div className="h-full rounded-full bg-[#E56B2D] transition-all" style={{ width: `${progress}%` }}/></div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {workerStages.map(worker => {
              const Icon = worker.icon
              const active = progress >= worker.progress - 25 && progress < worker.progress + 18 && status !== 'idle'
              const done = progress >= worker.progress
              return <div key={worker.role} className="rounded-xl border border-white/[.12] bg-white/[.04] p-4">
                <div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-xl ${done ? 'btn-alpha' : 'bg-white/[.08]'} ${active ? 'animate-pulse' : ''}`}><Icon size={18}/></span><strong>{worker.role}</strong></div>
                <p className="mt-3 text-sm leading-6 text-white/60">{worker.line}</p>
              </div>
            })}
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-h-[420px] overflow-hidden rounded-xl border border-white/[.12] bg-white/[.04]">
              {creation ? <iframe title="Mission preview" className="h-[520px] w-full" srcDoc={previewDocument(creation.code)} sandbox="allow-scripts allow-forms allow-modals allow-same-origin"/> : <div className="grid h-[420px] place-items-center p-8 text-center"><div><Sparkles className="mx-auto text-white/35"/><h3 className="mt-3 font-semibold">Preview appears after build</h3><p className="mt-2 text-sm text-white/55">The generated app will render here for review.</p></div></div>}
            </div>
            <div className="rounded-xl border border-white/[.12] bg-white/[.04] p-4">
              <h3 className="text-sm font-semibold">Live worker logs</h3>
              <div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto text-sm text-white/65">
                {activities.map(item => <p key={item.id} className="rounded-lg bg-black/20 p-3">{item.text}</p>)}
                {logs.map((line, index) => <p key={`${line}-${index}`} className="rounded-lg bg-black/20 p-3">{line}</p>)}
                {!activities.length && !logs.length && <p className="text-white/45">Start a mission to see worker logs.</p>}
              </div>
            </div>
          </div>
        </section>}
        {(selected || activeMission) && (() => {
          const goal = selected?.goal || activeMission?.goal || ''
          const suggestions = suggestedAgentsForMission(goal)
          return <section className="mt-8 liquid-glass rounded-2xl p-5 md:p-6">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-[#E56B2D]"/>
              <h2 className="text-lg font-semibold">Suggested agents for this mission</h2>
            </div>
            <p className="mt-2 text-sm text-white/55">Alpha can run these in the background while you build and deploy.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {suggestions.map((s, i) => <div key={i} className="rounded-xl border border-white/[.08] bg-white/[.04] p-4">
                <h3 className="text-sm font-semibold">{s.title}</h3>
                <p className="mt-1 text-xs text-white/55">{s.description}</p>
                <button onClick={() => { const authUser = user ? { id: user.id, email: user.email } : getLocalUser(); saveAgent(createAgentFromNL(s.description, activeMission?.id, authUser || undefined)); window.location.href = '/agents' }} className="mt-4 flex items-center gap-1.5 rounded-lg btn-alpha px-3 py-2 text-xs text-white"><Plus size={14}/> Add agent</button>
              </div>)}
            </div>
          </section>
        })()}
      </main>

      <aside className="liquid-glass sticky top-20 h-fit rounded-2xl p-5">
        <h2 className="text-sm font-semibold">Codex history</h2>
        <div className="mt-4 space-y-3">
          {codexHistory.map(item => <Link key={item.id} to={`/mission/${item.id}`} className="block rounded-xl border border-white/[.1] bg-white/[.04] p-3 hover:border-[#E56B2D]">
            <div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{item.title}</strong><span className="text-[10px] uppercase text-white/45">{item.status}</span></div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/55">{item.goal}</p>
          </Link>)}
          {!codexHistory.length && <p className="text-sm text-white/45">No mission history yet.</p>}
        </div>
        <h3 className="mt-6 text-sm font-semibold">Recent creations</h3>
        <div className="mt-3 space-y-2">
          {latestCreations.map(item => <Link key={item.id} to={`/mission/${item.missionId}`} className="flex items-center justify-between rounded-lg bg-white/[.04] px-3 py-2 text-xs"><span className="truncate">{item.title}</span><ExternalLink size={13}/></Link>)}
          {!latestCreations.length && <p className="text-xs text-white/45">Generated apps will appear here.</p>}
        </div>
      </aside>
    </div>
  </div>
}
