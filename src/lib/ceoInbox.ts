import { getJson, postJson } from './apiClient'

export type CeoAction = {
  id: string
  type: string
  title: string
  data: Record<string, unknown>
  suggestedAction: string
  actions: Array<{ provider: string; action: string; params: Record<string, unknown> }>
  status: 'pending' | 'executing' | 'approved' | 'rejected' | 'failed'
  createdAt: string
  result?: unknown
  error?: string
}

export const listCeoActions = () => getJson<{ actions: CeoAction[] }>('/api/ceo/pending')
export const decideCeoAction = (id: string, decision: 'approve' | 'reject') =>
  postJson<{ action: CeoAction }>(`/api/ceo/actions/${encodeURIComponent(id)}/${decision}`, {})
