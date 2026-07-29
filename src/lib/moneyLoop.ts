import { getJson } from './apiClient'
import { supabase } from './supabase'

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'closed' | 'lost'
export type Lead = {
  id: string
  platform: string
  provider_post_id: string
  lead_name: string | null
  lead_handle: string | null
  lead_phone: string | null
  lead_email: string | null
  comment_text: string
  consent_keyword: string | null
  dm_sent: boolean
  dm_provider_id: string | null
  status: LeadStatus
  estimated_value: number
  created_at: string
}

export type MoneyLoopStats = {
  total: number
  new: number
  contacted: number
  qualified: number
  closed: number
  lost: number
  estimatedValue: number
  closedValue: number
}

export async function getLeads(status = '') {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return getJson<{ leads: Lead[]; setupRequired?: boolean }>(`/api/money-loop/leads${query}`)
}

export async function getMoneyLoopStats() {
  return getJson<{ stats: MoneyLoopStats; insights: { id: string; insight: string; created_at: string }[]; setupRequired?: boolean }>('/api/money-loop/stats')
}

export async function updateLead(id: string, patch: { status?: LeadStatus; estimated_value?: number }) {
  const session = await supabase?.auth.getSession()
  const token = session?.data?.session?.access_token || ''
  const response = await fetch(`/api/money-loop/leads/${id}`, {
    method: 'PATCH',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(patch),
  })
  const raw = await response.text()
  let payload: { lead?: Lead; error?: string } = {}
  try { payload = raw ? JSON.parse(raw) : {} } catch {}
  if (!response.ok || !payload.lead) throw new Error(payload.error || 'Could not update lead.')
  return payload.lead
}
