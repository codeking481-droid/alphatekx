import { supabaseServiceHeaders } from './supabaseHeaders.mjs'

const STATUSES = new Set(['new', 'contacted', 'qualified', 'closed', 'lost'])

function assertConfig(config) {
  if (!config?.url || !config?.service) {
    const error = new Error('Money Loop database is not configured.')
    error.code = 'DB_ERROR'
    throw error
  }
}

async function parse(response) {
  const raw = await response.text()
  let payload = null
  try { payload = raw ? JSON.parse(raw) : null } catch {}
  if (!response.ok) {
    const message = payload?.message || payload?.error || raw || `HTTP ${response.status}`
    const error = new Error(message)
    error.code = /relation|schema cache|does not exist/i.test(message) ? 'DB_ERROR' : 'MONEY_LOOP_ERROR'
    throw error
  }
  return payload
}

function headers(config, extra = {}) {
  return supabaseServiceHeaders(config.service, extra)
}

export function isMissingMoneyLoopSchema(error) {
  return error?.code === 'DB_ERROR' && /content_insights|leads|schema cache|relation|does not exist/i.test(String(error?.message || ''))
}

export async function listLeads(config, user, { status = '', limit = 100 } = {}) {
  assertConfig(config)
  const safeLimit = Math.min(250, Math.max(1, Number(limit) || 100))
  const filter = STATUSES.has(status) ? `&status=eq.${status}` : ''
  const response = await fetch(
    `${config.url}/rest/v1/leads?user_id=eq.${encodeURIComponent(user.id)}${filter}&select=*&order=created_at.desc&limit=${safeLimit}`,
    { headers: headers(config) },
  )
  return parse(response)
}

export async function getMoneyLoopStats(config, user) {
  const leads = await listLeads(config, user, { limit: 250 })
  const totals = { total: leads.length, new: 0, contacted: 0, qualified: 0, closed: 0, lost: 0, estimatedValue: 0, closedValue: 0 }
  for (const lead of leads) {
    if (lead.status in totals) totals[lead.status] += 1
    totals.estimatedValue += Math.max(0, Number(lead.estimated_value) || 0)
    if (lead.status === 'closed') totals.closedValue += Math.max(0, Number(lead.estimated_value) || 0)
  }
  return totals
}

export async function updateLead(config, user, leadId, changes) {
  assertConfig(config)
  const patch = { updated_at: new Date().toISOString() }
  if (changes.status !== undefined) {
    if (!STATUSES.has(String(changes.status))) throw new Error('Invalid lead status.')
    patch.status = String(changes.status)
  }
  if (changes.estimated_value !== undefined) {
    const value = Number(changes.estimated_value)
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) throw new Error('Estimated value must be a positive number.')
    patch.estimated_value = Math.round(value)
  }
  const response = await fetch(
    `${config.url}/rest/v1/leads?id=eq.${encodeURIComponent(leadId)}&user_id=eq.${encodeURIComponent(user.id)}`,
    {
      method: 'PATCH',
      headers: headers(config, { Prefer: 'return=representation' }),
      body: JSON.stringify(patch),
    },
  )
  const rows = await parse(response)
  if (!rows?.[0]) throw new Error('Lead not found.')
  return rows[0]
}

export async function listInsights(config, user, limit = 3) {
  assertConfig(config)
  const response = await fetch(
    `${config.url}/rest/v1/content_insights?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc&limit=${Math.min(10, Math.max(1, Number(limit) || 3))}`,
    { headers: headers(config) },
  )
  return parse(response)
}
