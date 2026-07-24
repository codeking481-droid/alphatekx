import { useMemo, useState } from 'react'
import { AlertCircle, Bot, CalendarClock, CheckCircle2, Link2, PlugZap, Wallet, Webhook, X, Zap } from 'lucide-react'
import { getConnector } from '../../lib/agents/connectorRegistry'
import { ConnectorIcon } from './ConnectorIcon'
import type { Agent, MissingField } from '../../lib/agents/types'
import type { IntegrationStatus } from '../../lib/integrations'

type Props = {
  agent: Agent
  integrationStatus: IntegrationStatus
  credits: number | null
  isAdmin: boolean
  onClose: () => void
  onApprove: (agent: Agent) => void
}

const googleProviderIds = new Set(['gmail', 'google_sheets', 'google_calendar', 'google_drive', 'calendar'])

function providerForConnectorId(id: string) {
  if (googleProviderIds.has(id)) return 'google'
  return id
}

function connectorStatus(id: string, status: IntegrationStatus) {
  const key = providerForConnectorId(id)
  const s = status[key] || { connected: false, ready: false }
  return { connected: Boolean(s.connected && s.ready), ready: Boolean(s.ready) }
}

function TriggerIcon({ type }: { type: string }) {
  if (type === 'schedule') return <CalendarClock size={18} className="text-sky-400" />
  if (type === 'monitor') return <Link2 size={18} className="text-amber-400" />
  return <Webhook size={18} className="text-indigo-400" />
}

function parseTimeInput(value: string) {
  const match = value.trim().match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i)
  if (!match) return null
  let hour = parseInt(match[1], 10)
  const minute = parseInt(match[2] || '0', 10)
  const period = (match[3] || '').toLowerCase()
  if (period === 'pm' && hour !== 12) hour += 12
  if (period === 'am' && hour === 12) hour = 0
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute, display: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}` }
}

function cronFromTime(time: { hour: number; minute: number }) {
  return `0 ${time.minute} ${time.hour} * * *`
}

function formatDate(date?: string) {
  if (!date) return '—'
  try { return new Date(date).toLocaleDateString() } catch { return date }
}

export default function WorkflowPlan({ agent, integrationStatus, credits, isAdmin, onClose, onApprove }: Props) {
  const [draft, setDraft] = useState<Agent>(agent)
  const isUnsupported = agent.missing?.some(m => m.field === 'unsupported')

  const emptyRequired = useMemo<MissingField[]>(() => {
    const list: MissingField[] = []
    draft.actions.forEach((a, i) => {
      const p = a.params || {}
      const step = a.label || `${a.action} ${a.connector}`
      if ((a.connector === 'gmail' || a.connector === 'email') && a.action === 'send_email' && !p.to) list.push({ field: 'to', step, connector: a.connector, reason: 'Recipient email is required.', index: i })
      if ((a.connector === 'google_calendar' || a.connector === 'calendar') && a.action === 'email_summary' && !p.to) list.push({ field: 'to', step, connector: a.connector, reason: 'Recipient email is required.', index: i })
      if (a.connector === 'telegram' && a.action === 'send_message' && !p.chat_id && !p.to && !p.chatId) list.push({ field: 'chat_id', step, connector: a.connector, reason: 'Telegram chat ID is required.', index: i })
      if (a.connector === 'telegram' && a.action === 'send_gmail_summary' && !p.chatId && !p.chat_id && !p.to) list.push({ field: 'chat_id', step, connector: a.connector, reason: 'Telegram chat ID is required.', index: i })
      if (a.connector === 'slack' && a.action === 'send_message' && !p.channel && !p.to) list.push({ field: 'channel', step, connector: a.connector, reason: 'Slack channel or user ID is required.', index: i })
      if (a.connector === 'whatsapp' && a.action === 'send_message' && !p.to && !p.phone) list.push({ field: 'to', step, connector: a.connector, reason: 'WhatsApp recipient phone number is required.', index: i })
      if (a.connector === 'github' && (a.action === 'create_issue' || a.action === 'summarize_commits') && !p.repo) list.push({ field: 'repo', step, connector: a.connector, reason: 'Repository owner/name is required.', index: i })
      if (a.connector === 'google_sheets' && a.action === 'read_rows' && !p.spreadsheetId) list.push({ field: 'spreadsheetId', step, connector: a.connector, reason: 'Spreadsheet ID is required.', index: i })
    })
    if (draft.trigger.type === 'monitor' && !draft.trigger.url) list.push({ field: 'url', step: 'Monitor trigger', connector: 'monitor', reason: 'URL to monitor is required.' })
    return list
  }, [draft.actions, draft.trigger])

  const combinedMissing = useMemo<MissingField[]>(() => {
    const base = [...(agent.missing || []), ...emptyRequired]
    const seen = new Set<string>()
    return base.filter(m => {
      const key = m.index !== undefined ? `${m.index}:${m.field}` : m.field
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [agent.missing, emptyRequired])

  const [missingInputs, setMissingInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    combinedMissing.forEach(m => {
      const key = m.index !== undefined ? `${m.index}:${m.field}` : m.field
      map[key] = ''
    })
    return map
  })

  const requiredConnectors = useMemo(() => Array.from(new Set(draft.actions.map(a => a.connector))), [draft.actions])
  const missingConnectors = requiredConnectors.filter(id => !connectorStatus(id, integrationStatus).connected && !connectorStatus(id, integrationStatus).ready)
  const cost = draft.creditsNeeded || draft.creditsPerRun || draft.actions.length || 1
  const durationDays = Math.max(1, Number(draft.schedule?.durationDays) || 30)
  const monthlyCost = cost * durationDays
  const balance = credits ?? 0
  const canAfford = isAdmin || balance >= cost || isUnsupported

  const stillMissing: MissingField[] = useMemo(() => {
    const list: MissingField[] = []
    combinedMissing.forEach(m => {
      const key = m.index !== undefined ? `${m.index}:${m.field}` : m.field
      const value = m.index !== undefined ? draft.actions[m.index]?.params[m.field] : undefined
      const triggerValue = m.field === 'url' ? draft.trigger.url : undefined
      const scheduleValue = m.field === 'time' ? draft.schedule?.time : m.field === 'timezone' ? draft.timezone : m.field === 'duration' ? draft.duration : undefined
      const current = value !== undefined ? value : (triggerValue !== undefined ? triggerValue : scheduleValue)
      if (String(current || '').trim() === '' && String(missingInputs[key] || '').trim() === '') {
        list.push(m)
      }
    })
    return list
  }, [draft, missingInputs, combinedMissing])

  const approveDisabled = isUnsupported || missingConnectors.length > 0 || stillMissing.length > 0 || !canAfford

  const handleApprove = () => {
    let next = { ...draft, status: 'running' as const, approved: true, updatedAt: new Date().toISOString() }
    Object.entries(missingInputs).forEach(([key, value]) => {
      if (!value.trim()) return
      if (key.includes(':')) {
        const [idx, field] = key.split(':')
        const index = parseInt(idx, 10)
        if (!isNaN(index) && next.actions[index]) {
          next = { ...next, actions: next.actions.map((a, i) => i === index ? { ...a, params: { ...a.params, [field]: value } } : a) }
        }
      } else if (key === 'url') {
        next = { ...next, trigger: { ...next.trigger, url: value } }
      } else if (key === 'time') {
        const time = parseTimeInput(value)
        if (time) {
          const cron = cronFromTime(time)
          next = { ...next, trigger: { ...next.trigger, cron }, schedule: { ...(next.schedule || {}), cron, time: time.display }, timezone: next.timezone || next.schedule?.timezone || 'UTC' }
        }
      } else if (key === 'timezone') {
        next = { ...next, timezone: value, schedule: { ...(next.schedule || {}), timezone: value } }
      } else if (key === 'duration') {
        const days = parseInt(value.replace(/\D/g, ''), 10)
        if (!isNaN(days) && days > 0) {
          const end = new Date()
          end.setDate(end.getDate() + days)
          next = { ...next, duration: `${days} days`, endDate: end.toISOString().split('T')[0], schedule: { ...(next.schedule || {}), durationDays: days, endDate: end.toISOString().split('T')[0] } }
        }
      }
    })
    onApprove(next)
  }

  if (isUnsupported) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/[.12] bg-background p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-amber-400"><AlertCircle size={12}/> Not available yet</div>
            <h2 className="mt-1 text-xl font-semibold">Unsupported automation</h2>
            <p className="mt-1 text-sm text-white/55">{agent.description}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/[.08]"><X size={18}/></button>
        </div>
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          {agent.missing?.find(m => m.field === 'unsupported')?.reason || 'Try a different request.'}
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="rounded-xl border border-white/[.12] bg-white/[.04] px-5 py-2.5 text-sm font-medium text-white hover:bg-white/[.08]">Close</button>
        </div>
      </div>
    </div>
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/[.12] bg-background p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-indigo-400"><Zap size={12}/> Workflow plan</div>
          <h2 className="mt-1 text-xl font-semibold">{draft.title || draft.name}</h2>
          <p className="mt-1 text-sm text-white/55">{draft.description}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/[.08]"><X size={18}/></button>
      </div>

      <div className="mt-4 flex gap-3">
        <div className="flex-1 rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
          <div className="text-xs text-white/45">You</div>
          <p className="mt-1 text-sm text-white/90">{agent.originalRequest || agent.description}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-indigo-400"><Zap size={12}/> Alpha</div>
        <p className="mt-1 text-sm font-medium">{draft.interpretedGoal || draft.description}</p>
      </div>

      <div className="mt-4 rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
        <div className="text-xs text-white/45">Trigger</div>
        <div className="mt-2 flex items-center gap-3">
          <TriggerIcon type={draft.trigger.type} />
          <div>
            <p className="text-sm font-medium capitalize">{draft.trigger.type}</p>
            {draft.trigger.type === 'schedule' && <p className="text-xs text-white/55">{draft.schedule?.time || draft.trigger.cron}</p>}
            {draft.trigger.type === 'monitor' && <p className="text-xs text-white/55">Website monitor</p>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
          <div className="text-xs text-white/45">Timezone</div>
          <p className="mt-1 text-sm font-medium">{draft.timezone || draft.schedule?.timezone || 'UTC'}</p>
        </div>
        <div className="rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
          <div className="text-xs text-white/45">Duration</div>
          <p className="mt-1 text-sm font-medium">{draft.duration || (draft.schedule?.durationDays ? `${draft.schedule.durationDays} days` : 'Until paused or deleted')}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
          <div className="text-xs text-white/45">Start date</div>
          <p className="mt-1 text-sm font-medium">{formatDate(draft.startDate || draft.schedule?.startDate)}</p>
        </div>
        <div className="rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
          <div className="text-xs text-white/45">End date</div>
          <p className="mt-1 text-sm font-medium">{formatDate(draft.endDate || draft.schedule?.endDate)}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {draft.actions.map((action, i) => {
          const c = getConnector(action.connector)
          return <div key={i} className="rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
            <div className="flex items-center gap-3">
              {c ? <ConnectorIcon connector={c}/> : <Bot size={18} className="text-white/50"/>}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{action.label || action.action}</p>
                <p className="text-xs text-white/45">{c?.name || action.connector}</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {Object.entries(action.params).filter(([k]) => k !== 'generate' && k !== 'research' && k !== 'image' && k !== 'bodyTemplate' && k !== 'generateSubject').map(([k, v]) => (
                <div key={k} className="text-xs"><span className="text-white/40">{k}:</span> <span className="truncate text-white/70">{String(v || '—')}</span></div>
              ))}
            </div>
          </div>
        })}
      </div>

      {(combinedMissing.length > 0) && <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-300"><AlertCircle size={16}/> Missing information</div>
        <div className="mt-3 space-y-3">
          {combinedMissing.map((m, idx) => {
            const key = m.index !== undefined ? `${m.index}:${m.field}` : m.field
            const type = m.field === 'time' ? 'time' : 'text'
            return <div key={idx}>
              <label className="text-xs text-white/70">{m.reason} <span className="text-white/40">({m.step})</span></label>
              <input
                type={type}
                value={missingInputs[key] || ''}
                onChange={e => setMissingInputs(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={m.field}
                className="field mt-1 text-sm"
              />
            </div>
          })}
        </div>
      </div>}

      <div className="mt-4 rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
        <div className="text-xs text-white/45">Required connectors</div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {requiredConnectors.map(id => {
            const c = getConnector(id)
            const s = connectorStatus(id, integrationStatus)
            return <div key={id} className="flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.04] p-2">
              {c ? <ConnectorIcon connector={c}/> : <PlugZap size={14} className="text-white/50"/>}
              <span className="min-w-0 flex-1 truncate text-xs">{c?.name || id}</span>
              {s.connected ? <CheckCircle2 size={14} className="text-emerald-400"/> : s.ready ? <CheckCircle2 size={14} className="text-sky-400"/> : <AlertCircle size={14} className="text-amber-400"/>}
            </div>
          })}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
        <div className="flex items-center gap-2 text-xs text-white/45"><Wallet size={14}/> Credit estimate</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-white/55">Per execution</p>
            <p className="text-lg font-semibold">{cost} credit{cost === 1 ? '' : 's'}</p>
          </div>
          <div>
            <p className="text-xs text-white/55">Estimated {durationDays || 30} days</p>
            <p className="text-lg font-semibold">{monthlyCost} credit{monthlyCost === 1 ? '' : 's'}</p>
          </div>
          <div>
            <p className="text-xs text-white/55">Balance after</p>
            <p className="text-lg font-semibold">{Math.max(0, (credits ?? 0) - monthlyCost).toLocaleString()}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-white/40">Credits are only charged when the automation actually runs. You will never be charged without this estimate.</p>
      </div>

      {draft.creditsPerStep && draft.creditsPerStep.length > 0 && <div className="mt-4 rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
        <div className="text-xs text-white/45">Cost breakdown</div>
        <div className="mt-2 space-y-1">
          {draft.creditsPerStep.map((s, i) => <div key={i} className="flex items-center justify-between text-xs"><span className="text-white/70">{s.step}</span><span className="font-medium">{s.cost} cr</span></div>)}
        </div>
      </div>}

      {approveDisabled && <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
        {stillMissing.length > 0 && <p>Fill all missing fields before activating.</p>}
        {missingConnectors.length > 0 && <p>Connect {missingConnectors.join(', ')} in Connected Apps first.</p>}
        {!canAfford && <p>Not enough credits. You have {credits ?? 0}, this run needs {cost}. <button onClick={() => window.location.href='/settings?tab=billing'} className="ml-1 font-semibold underline text-violet-300">Buy credits</button></p>}
      </div>}

      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-xl border border-white/[.12] bg-white/[.04] px-5 py-2.5 text-sm font-medium text-white hover:bg-white/[.08]">Cancel</button>
        <button onClick={handleApprove} disabled={approveDisabled} className="btn-alpha rounded-xl px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">Approve & Activate</button>
      </div>
    </div>
  </div>
}
