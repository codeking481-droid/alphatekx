export type ServiceStatus = { connected: boolean; ready?: boolean; email?: string | null; scopes?: string[]; identifier?: string | null; hasOwnKey?: boolean; isMaster?: boolean; access?: 'available' | 'testing' | 'coming_soon'; publicEnabled?: boolean }
export type FeatureAccessStatus = { admin: boolean; connectors: Record<string, { id: string; name: string; enabled: boolean; publicEnabled: boolean; admin: boolean; availability: 'available' | 'testing' | 'coming_soon' }> }
export type IntegrationStatus = {
  google: ServiceStatus
  gmail: ServiceStatus
  sheets: ServiceStatus
  calendar: ServiceStatus
  drive: ServiceStatus
  google_sheets: ServiceStatus
  google_calendar: ServiceStatus
  google_drive: ServiceStatus
  _access?: FeatureAccessStatus
  [provider: string]: ServiceStatus | FeatureAccessStatus | undefined
}
export type SendEmailInput = { to: string; subject: string; html?: string; text?: string }
export type UserUsage = { freePostsUsed: number; freePostsLimit: number; remaining: number; connectors: Record<string, unknown> }

function getLocalUserHeader(): Record<string, string> {
  try {
    const raw = localStorage.getItem('alphatekx:local-user')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed?.id && parsed?.email) {
      return { 'x-local-user-id': String(parsed.id), 'x-local-user-email': String(parsed.email) }
    }
  } catch { /* ignore */ }
  return {}
}

import { supabase } from './supabase'

async function sessionToken(): Promise<string | undefined> {
  try {
    const result = await supabase?.auth.getSession()
    const session = result?.data?.session
    if (!session) return undefined
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
      const refreshed = await supabase?.auth.refreshSession()
      return refreshed?.data?.session?.access_token || undefined
    }
    return session.access_token
  } catch { return undefined }
}

async function request<T>(url: string, token?: string, options: RequestInit = {}): Promise<T> {
  const authToken = token || await sessionToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(!authToken ? getLocalUserHeader() : {}) }
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  if (options.headers) {
    Object.entries(options.headers).forEach(([k, v]) => { if (v != null) headers[k] = String(v) })
  }
  let response = await fetch(url, { ...options, headers })
  if (response.status === 401 && supabase) {
    const refreshed = await supabase.auth.refreshSession().catch(() => null)
    const freshToken = refreshed?.data?.session?.access_token
    if (freshToken) {
      headers.Authorization = `Bearer ${freshToken}`
      response = await fetch(url, { ...options, headers })
    }
  }
  const raw = await response.text()
  let payload = {} as T & { error?: string }
  try { payload = raw ? JSON.parse(raw) as T & { error?: string } : payload } catch {}
  if (!response.ok) throw new Error(payload.error || raw || `Integration request failed (${response.status}). Please sign in again if this continues.`)
  return payload
}

export const getIntegrationStatus = (token?: string) => request<IntegrationStatus>('/api/integrations/status', token)

function getLocalUser() {
  try {
    const raw = localStorage.getItem('alphatekx:local-user')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && parsed.id && parsed.email ? { id: parsed.id, email: parsed.email } : null
  } catch { return null }
}

export { getLocalUser }

const GOOGLE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file'

export function getGoogleOAuthUrl() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('Google Client ID is not configured.')
  const redirect = `${window.location.origin}/api/auth/gmail/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function startGmailConnection(token?: string, redirect = '/agents') {
  const data = await request<{ url: string }>('/api/integrations/google/start', token, { method: 'POST', body: JSON.stringify({ redirect }) })
  if (!data.url) throw new Error('Google OAuth URL was not returned')
  window.location.assign(data.url)
}

export const disconnectGoogle = (token?: string) => request<{ disconnected: boolean }>('/api/integrations/google', token, { method: 'DELETE' })
export const disconnectGmail = disconnectGoogle

export const sendGmail = (token: string | undefined, input: SendEmailInput) => request<{ success: boolean; messageId: string }>('/api/gmail/send', token, { method: 'POST', body: JSON.stringify(input) })
export const sendEmail = (token: string | undefined, input: SendEmailInput) => request<{ success: boolean; messageId: string }>('/api/send-email', token, { method: 'POST', body: JSON.stringify(input) })

export const saveIntegration = (provider: string, token: string | undefined, credentials: Record<string, string>, identifier?: string) =>
  request<{ saved: boolean; provider: string }>(`/api/integrations/${provider}`, token, { method: 'POST', body: JSON.stringify({ tokens: credentials, identifier, email: identifier }) })

export const deleteIntegration = (provider: string, token: string | undefined) =>
  request<{ deleted: boolean; provider: string }>(`/api/integrations/${provider}`, token, { method: 'DELETE' })

export const getUserUsage = (token?: string) => request<UserUsage>('/api/user/usage', token)

export const saveConnector = (platform: string, token: string | undefined, credentials: Record<string, unknown>, identifier?: string) =>
  request<{ saved: boolean; platform: string; hasOwnKey: boolean }>('/api/connectors/save', token, { method: 'POST', body: JSON.stringify({ platform, tokens: credentials, identifier }) })

export const testConnector = (platform: string, token: string | undefined, text = 'AlphaTekX connector test', imageUrl?: string, to?: string) =>
  request<{ success: boolean; platform: string; result: unknown }>('/api/connectors/test', token, { method: 'POST', body: JSON.stringify({ platform, text, imageUrl, to }) })

export const initializePostsPayment = (credits: number, token?: string) =>
  request<{ authorization_url: string; reference: string; credits: number; amount: number; source: string }>('/api/paystack/initialize', token, { method: 'POST', body: JSON.stringify({ credits, source: 'posts' }) })

export async function startLinkedInAuth(token?: string, redirect = '/connectors') {
  const data = await request<{ url: string }>('/api/connectors/linkedin/start', token, { method: 'POST', body: JSON.stringify({ redirect }) })
  if (!data.url) throw new Error('LinkedIn OAuth URL was not returned')
  window.location.assign(data.url)
}

export async function startFacebookAuth(token?: string, redirect = '/connected-apps') {
  const data = await request<{ url: string }>('/api/connectors/facebook/start', token, { method: 'POST', body: JSON.stringify({ redirect }) })
  if (!data.url) throw new Error('Facebook OAuth URL was not returned')
  window.location.assign(data.url)
}

export const getFacebookPages = (token?: string) =>
  request<{ pages: { id: string; name: string }[] }>('/api/connectors/facebook/pages', token)

export const selectFacebookPage = (pageId: string, token?: string) =>
  request<{ connected: true; page: { id: string; name: string } }>('/api/connectors/facebook/select-page', token, { method: 'POST', body: JSON.stringify({ pageId }) })
