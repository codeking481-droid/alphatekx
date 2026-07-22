function localUserHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('alphatekx:local-user')
    if (!raw) return {}
    const u = JSON.parse(raw)
    if (u?.id && u?.email) return { 'x-local-user-id': String(u.id), 'x-local-user-email': String(u.email) }
  } catch {}
  return {}
}

import { supabase } from './supabase'

async function authToken(): Promise<string | undefined> {
  try {
    const session = await supabase?.auth.getSession()
    return session?.data?.session?.access_token || undefined
  } catch {}
  return undefined
}

async function requestJson<T>(url: string, init: RequestInit, options: { token?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  const controller = new AbortController()
  if (options.signal) { options.signal.addEventListener('abort', () => controller.abort(), { once: true }) }
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000)
  try {
    const token = options.token || await authToken()
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...localUserHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      signal: controller.signal,
    })
    const raw = await response.text()
    let payload: Record<string, unknown> = {}
    try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {} } catch {}
    if (!response.ok) throw new Error(String(payload.error || raw || `Alpha returned HTTP ${response.status}.`))
    return payload as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Alpha took too long to respond. Try again.')
    if (error instanceof TypeError) throw new Error('Could not reach Alpha. Confirm the Render service is running with `npm start`.')
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function getJson<T>(url: string, options: { token?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  return requestJson<T>(url, { method: 'GET' }, options)
}

export async function deleteJson<T>(url: string, options: { token?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  return requestJson<T>(url, { method: 'DELETE' }, options)
}

export async function putJson<T>(url: string, body: unknown, options: { token?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  return requestJson<T>(url, { method: 'PUT', body: JSON.stringify(body) }, options)
}

export async function postJson<T>(url: string, body: unknown, options: { token?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  return requestJson<T>(url, { method: 'POST', body: JSON.stringify(body) }, options)
}

export async function patchJson<T>(url: string, body: unknown, options: { token?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  return requestJson<T>(url, { method: 'PATCH', body: JSON.stringify(body) }, options)
}
