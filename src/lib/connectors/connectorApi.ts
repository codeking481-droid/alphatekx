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
}

export type ConnectResponse = {
  authUrl: string
  provider: string
  connectionId?: string
}

export type ExecuteResponse = {
  success: boolean
  executionId: string
  result: unknown
  executionTimeMs: number
}

// Get all providers with their connection status
export async function getConnectedApps(token?: string): Promise<ConnectedAppsResponse> {
  return getJson<ConnectedAppsResponse>('/api/connected-apps', { token })
}

// Start OAuth connection for a provider
export async function connectProvider(providerId: string, token?: string): Promise<ConnectResponse> {
  return postJson<ConnectResponse>(`/api/connect/${providerId}`, {}, { token })
}

// Disconnect a provider
export async function disconnectProvider(providerId: string, token?: string): Promise<{ success: boolean }> {
  return deleteJson<{ success: boolean }>(`/api/disconnect/${providerId}`, { token })
}

// Reconnect OAuth for a provider
export async function reconnectProvider(providerId: string, token?: string): Promise<ConnectResponse> {
  return postJson<ConnectResponse>(`/api/reconnect/${providerId}`, {}, { token })
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
