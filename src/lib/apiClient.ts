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
import { repairOversizedSession } from './sessionRepair'

async function authToken(): Promise<string | undefined> {
  try {
    const result = await supabase?.auth.getSession()
    const session = result?.data?.session
    if (!session) return undefined
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
      const refreshed = await supabase?.auth.refreshSession()
      return refreshed?.data?.session?.access_token || undefined
    }
    return session.access_token
  } catch {}
  return undefined
}

async function requestJson<T>(url: string, init: RequestInit, options: { token?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  const controller = new AbortController()
  if (options.signal) { options.signal.addEventListener('abort', () => controller.abort(), { once: true }) }
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000)
  try {
    let token = options.token || await authToken()
    const makeRequest = () => fetch(url, {
      ...init,
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        ...(!token ? localUserHeaders() : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      signal: controller.signal,
    })
    let response = await makeRequest()
    if (response.status === 431 && token) {
      const repairedToken = await repairOversizedSession(token)
      if (repairedToken) {
        token = repairedToken
        response = await makeRequest()
      }
    }
    if (response.status === 401 && supabase) {
      const refreshed = await supabase.auth.refreshSession().catch(() => null)
      token = refreshed?.data?.session?.access_token || ''
      if (token) response = await makeRequest()
    }
    const raw = await response.text()
    const contentType = response.headers.get('content-type') || ''
    const looksLikeHtml = /text\/html/i.test(contentType) || /^\s*<!doctype html|^\s*<html/i.test(raw)
    let payload: Record<string, unknown> = {}
    try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {} } catch {}
    if (response.status === 431) throw new Error('Alpha could not refresh your sign-in session automatically. Please sign out and sign in again.')
    if (!response.ok) {
      if (looksLikeHtml) throw new Error(`Alpha's API returned an unexpected page (${response.status}). Please retry after the latest deployment finishes.`)
      throw new Error(String(payload.error || raw.slice(0, 400) || `Alpha returned HTTP ${response.status}.`))
    }
    if (looksLikeHtml) throw new Error('Alpha received a website page instead of an API response. Please retry after the latest deployment finishes.')
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
