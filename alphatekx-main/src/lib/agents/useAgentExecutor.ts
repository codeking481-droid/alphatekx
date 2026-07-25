import { useEffect } from 'react'
import { getAgents, setCache } from './agentStore'
import { getConnector } from './connectorRegistry'
import { sendEmail } from '../integrations'
import { randomUUID } from '../utils'
import type { Agent, AgentExecution } from './types'

async function runLocalAction(agent: Agent, action: Agent['actions'][number], index: number): Promise<AgentExecution> {
  const start = Date.now()
  const connector = getConnector(action.connector)
  const baseLog = `[${connector?.name || action.connector}] ${action.label || action.action}`
  try {
    if (action.connector === 'gmail' && action.action === 'send_email') {
      const params = action.params as { to?: unknown; subject?: unknown; body?: unknown; text?: unknown }
      const to = String(params?.to || '')
      if (to) {
        await sendEmail(undefined, { to, subject: String(params?.subject || 'Alpha Agent'), text: String(params?.text || params?.body || ''), html: `<p>${String(params?.body || params?.text || '')}</p>` })
      }
    }
    return {
      id: randomUUID(),
      agentId: agent.id,
      at: new Date().toISOString(),
      status: 'success',
      duration: Date.now() - start,
      log: `${baseLog} completed.`,
    }
  } catch (error) {
    return {
      id: randomUUID(),
      agentId: agent.id,
      at: new Date().toISOString(),
      status: 'error',
      duration: Date.now() - start,
      log: `${baseLog} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export async function executeAgentNow(agent: Agent): Promise<AgentExecution[]> {
  const results: AgentExecution[] = []
  for (let i = 0; i < agent.actions.length; i++) {
    results.push(await runLocalAction(agent, agent.actions[i], i))
  }
  results.forEach(r => { if (r.status === 'success') { /* noop */ } })
  return results
}

export function useAgentExecutor() {
  useEffect(() => {
    const trigger = () => {
      void fetch('/api/agents/run-due').then(async r => {
        if (!r.ok) return
        const data = await r.json().catch(() => null)
        if (data?.executed) {
          const res = await fetch('/api/agents')
          if (!res.ok) return
          const fresh = await res.json().catch(() => null)
          if (fresh?.agents) {
            const current = getAgents()
            const next = fresh.agents as Agent[]
            const map = new Map(current.map(a => [a.id, a]))
            const merged = next.map(a => ({ ...(map.get(a.id) || {}), ...a }))
            setCache(merged)
          }
        }
      }).catch(() => {})
    }
    trigger()
    const interval = window.setInterval(trigger, 30_000)
    return () => window.clearInterval(interval)
  }, [])
}
