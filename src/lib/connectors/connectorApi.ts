// Alpha Connector API client
// Communicates with the AlphaTekX backend endpoints
// API key NEVER leaves the server

import { postJson, getJson, deleteJson } from '../apiClient'
import type { ConnectorProvider } from './providerRegistry'

export type ConnectedAppStatus = {
  provider: string
  connected: boolean
  connectionId?: string
  status: string
  enabled?: boolean
  error?: string | null
  connectedAt?: string
  lastSyncedAt?: string
  metadata?: Record<string, unknown>
  requiredEnvironment?: string[]
}

export type ExecutionResult = {
  id: string
  provider: string
  action: string
  status: 'success' | 'error' | 'pending'
  response_data?: unknown
  error_message?: string
  performed_at: string
}

export type ConnectedAppsResponse = {
  providers: ConnectedAppStatus[]
  executions: ExecutionResult[]
  error?: string | null
}

export type ConnectResponse = {
  authUrl: string
  provider: string
  connectionId?: string
}

export type ExecuteResponse = {
  success: boolean
  executionId: string
  providerId?: string
  creditsCharged?: number
  balance?: number
  result: unknown
  executionTimeMs: number
}

export type ComposioStatusResponse = {
  youtube: boolean
  instagram: boolean
  x: boolean
  facebook: boolean
  whatsapp: boolean
  connections: Array<{ platform: string; connected: boolean; connectionId: string | null; status: string }>
}

// Get all providers with their connection status
export async function getConnectedApps(token?: string): Promise<ConnectedAppsResponse> {
  return getJson<ConnectedAppsResponse>('/api/connected-apps', { token })
}

export async function getComposioStatus(token?: string): Promise<ComposioStatusResponse> {
  return getJson<ComposioStatusResponse>('/api/composio/status', { token })
}

export async function executeComposioAction(
  platform: string,
  action: string,
  params: Record<string, unknown>,
  approvalId: string,
  token?: string,
  idempotencyKey = crypto.randomUUID()
): Promise<{ success: boolean; provider_id: string; credits_charged: number; balance: number; execution_id: string; result: unknown }> {
  return postJson('/api/composio/execute', {
    platform,
    action,
    params,
    approval_id: approvalId,
    idempotency_key: idempotencyKey,
  }, { token })
}

// Start OAuth connection for a provider
export async function connectProvider(providerId: string, token?: string): Promise<ConnectResponse> {
  return postJson<ConnectResponse>(`/api/connectors/${providerId}/connect`, {}, { token })
}

// Disconnect a provider
export async function disconnectProvider(providerId: string, token?: string): Promise<{ success: boolean }> {
  return deleteJson<{ success: boolean }>(`/api/connectors/${providerId}`, { token })
}

// Reconnect OAuth for a provider
export async function reconnectProvider(providerId: string, token?: string): Promise<ConnectResponse> {
  return postJson<ConnectResponse>(`/api/connectors/${providerId}/connect`, {}, { token })
}

// Execute an action on a connected provider
export async function executeProviderAction(
  providerId: string,
  actionId: string,
  params: Record<string, unknown>,
  token?: string
): Promise<ExecuteResponse> {
  return postJson<ExecuteResponse>(`/api/execute/${providerId}/${actionId}`, { params }, { token })
}

// Get execution history for a provider
export async function getExecutionHistory(
  providerId: string,
  token?: string,
  limit = 10
): Promise<{ executions: ExecutionResult[] }> {
  return getJson<{ executions: ExecutionResult[] }>(
    `/api/connected-apps/executions/${providerId}?limit=${limit}`,
    { token }
  )
}

// Notion PoC: Create a page
export async function notionCreatePage(
  title: string,
  content: string,
  databaseId?: string,
  token?: string
): Promise<ExecuteResponse> {
  return executeProviderAction('notion', 'create_page', {
    title,
    content: [{ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content } }] } }],
    databaseId,
  }, token)
}
