import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Agent, AgentExecution } from './types'

const STORAGE_KEY = 'alphatekx_agents'

function loadAgents(): Agent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Agent[]) : []
  } catch { return [] }
}

function saveAgents(agents: Agent[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(agents)) } catch {}
}

const listeners = new Set<() => void>()
function notify() { listeners.forEach(fn => { try { fn() } catch {} }) }
export function subscribeAgents(callback: () => void) { listeners.add(callback); return () => listeners.delete(callback) }

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 30_000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try { return await fetch(input, { ...init, signal: controller.signal }) }
  finally { window.clearTimeout(timer) }
}

let cache: Agent[] | null = null
let serverRevision = 0
let refreshPromise: Promise<Agent[]> | null = null
export function getAgents(): Agent[] {
  if (!cache) cache = loadAgents()
  return cache
}

export function setCache(agents: Agent[]) { cache = agents; saveAgents(agents); notify() }

function localUserHeaders() {
  try {
    const raw = localStorage.getItem('alphatekx:local-user')
    if (raw) {
      const u = JSON.parse(raw)
      if (u?.id && u?.email) return { 'x-local-user-id': String(u.id), 'x-local-user-email': String(u.email) }
    }
  } catch {}
  return {}
}

async function authHeaders() {
  const headers: Record<string, string> = { ...localUserHeaders() }
  try {
    const session = (await supabase?.auth.getSession())?.data?.session
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  } catch {}
  return headers
}

export async function saveAgent(agent: Agent) {
  serverRevision += 1
  const record = { ...agent, updatedAt: new Date().toISOString() }
  const res = await fetchWithTimeout('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json', ...await authHeaders() }, body: JSON.stringify({ agent: record }) })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const error = new Error(data.error || `Could not save agent (${res.status})`)
    // @ts-expect-error attach plan context for upgrade modal
    error.code = data.code
    // @ts-expect-error
    error.plan = data.plan
    throw error
  }
  const agents = getAgents()
  const index = agents.findIndex(a => a.id === agent.id)
  if (index >= 0) agents[index] = record
  else agents.unshift(record)
  setCache(agents)
  return res.json()
}

export async function deleteAgent(id: string) {
  const previous = getAgents()
  serverRevision += 1
  setCache(previous.filter(agent => agent.id !== id))
  let response: Response
  try {
    response = await fetchWithTimeout(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE', headers: await authHeaders() })
  } catch (error) {
    setCache(previous)
    throw error
  }
  if (response.status === 404) {
    // A stale browser cache may reference a legacy/ephemeral automation that
    // no longer exists durably. Removing that local ghost is idempotent.
    setCache(getAgents().filter(a => a.id !== id))
    return
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    setCache(previous)
    throw new Error(data.error || 'Could not delete automation from the server')
  }
}

export async function setAgentLifecycle(id: string, action: 'pause' | 'resume' | 'archive') {
  const previous = getAgents()
  serverRevision += 1
  if (action === 'pause') {
    setCache(previous.map(agent => agent.id === id ? { ...agent, status: 'paused', nextRunAt: undefined, trigger: { ...agent.trigger, nextRun: undefined } } : agent))
  }
  let response: Response
  try {
    response = await fetchWithTimeout(`/api/agents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...await authHeaders() },
      body: JSON.stringify({ action }),
    })
  } catch (error) {
    setCache(previous)
    throw error
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    setCache(previous)
    throw new Error(data.error || `Could not ${action} automation`)
  }
  setCache(getAgents().map(agent => agent.id === id && data.agent ? data.agent : agent))
  return data.agent as Agent
}

export async function refreshAgents() {
  if (refreshPromise) return refreshPromise
  const revisionAtStart = serverRevision
  refreshPromise = (async () => {
    const res = await fetchWithTimeout('/api/agents', { headers: await authHeaders() })
    if (!res.ok) throw new Error(`Could not load automations (${res.status})`)
    const data = await res.json()
    const agents = Array.isArray(data.agents) ? data.agents as Agent[] : []
    if (revisionAtStart === serverRevision) setCache(agents)
    return agents
  })()
  try { return await refreshPromise }
  finally { refreshPromise = null }
}

export function updateAgent(id: string, patch: Partial<Agent>) {
  const agent = getAgents().find(a => a.id === id)
  if (!agent) return
  const updated = { ...agent, ...patch, updatedAt: new Date().toISOString() }
  saveAgent(updated)
}

export function addExecution(agentId: string, execution: AgentExecution) {
  const agent = getAgents().find(a => a.id === agentId)
  if (!agent) return
  const history = [execution, ...agent.executionHistory].slice(0, 100)
  const successes = history.filter(e => e.status === 'success').length
  const successRate = history.length ? Math.round((successes / history.length) * 100) : 0
  const status = execution.status === 'error' && agent.status !== 'paused' ? 'warning' : agent.status
  saveAgent({ ...agent, executionHistory: history, successRate, status, updatedAt: new Date().toISOString() })
}

export function runningAgentsCount() {
  return getAgents().filter(a => a.status === 'running' || a.status === 'active').length
}

export function useAgents() {
  const [agents, setAgents] = useState(getAgents)
  useEffect(() => subscribeAgents(() => setAgents(getAgents())), [])
  useEffect(() => {
    const load = () => { void refreshAgents().catch(() => {}) }
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    load()
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(load, 10_000)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', load)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return agents
}
