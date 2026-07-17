export type IntegrationStatus = { gmail: { connected: boolean; email: string | null } }
export type SendEmailInput = { to: string; subject: string; html?: string; text?: string }

async function request<T>(url: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  })
  const payload = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || 'Integration request failed.')
  return payload
}

export const getIntegrationStatus = (token: string) => request<IntegrationStatus>('/api/integrations/status', token)

export async function startGmailConnection(token: string) {
  const result = await request<{ url: string }>('/api/integrations/google/start', token, { method: 'POST', body: '{}' })
  if (!result.url.startsWith('https://accounts.google.com/')) throw new Error('Google returned an invalid authorization URL.')
  window.location.assign(result.url)
}

export const disconnectGmail = (token: string) => request<{ disconnected: boolean }>('/api/integrations/gmail', token, { method: 'DELETE' })
export const sendGmail = (token: string, input: SendEmailInput) => request<{ success: boolean; messageId: string }>('/api/gmail/send', token, { method: 'POST', body: JSON.stringify(input) })
