import { supabase } from './supabase'

export type ProviderName = 'openai' | 'groq' | 'anthropic' | 'gemini' | 'supabase' | 'paystack'
export type UserKeys = Record<ProviderName, string>
export type ProviderStatus = Record<ProviderName, { configured: boolean; masked: string }>

const providers: ProviderName[] = ['openai', 'groq', 'anthropic', 'gemini', 'supabase', 'paystack']
export const emptyUserKeys = Object.fromEntries(providers.map(provider => [provider, ''])) as UserKeys
export const emptyProviderStatus = Object.fromEntries(providers.map(provider => [provider, { configured: false, masked: '' }])) as ProviderStatus

async function accessToken() {
  if (!supabase) throw new Error('Supabase is required to store private keys.')
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Sign in before managing API keys.')
  return data.session.access_token
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = await accessToken()
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  })
  const payload = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || 'API key operation failed.')
  return payload
}

export async function getUserKeyStatus(): Promise<ProviderStatus> {
  const payload = await request<{ providers: ProviderStatus }>('/api/settings/api-keys')
  return payload.providers || emptyProviderStatus
}

export async function saveUserKeys(keys: Partial<UserKeys>): Promise<ProviderStatus> {
  const payload = await request<{ providers: ProviderStatus }>('/api/settings/api-keys', { method: 'POST', body: JSON.stringify({ keys }) })
  return payload.providers
}

export async function removeUserKey(provider: ProviderName): Promise<ProviderStatus> {
  return saveUserKeys({ [provider]: '' })
}

export async function testUserKey(provider: ProviderName) {
  return request<{ valid: boolean; provider: ProviderName }>('/api/settings/api-keys/test', { method: 'POST', body: JSON.stringify({ provider }) })
}
