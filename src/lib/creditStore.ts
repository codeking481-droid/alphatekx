import { DEFAULT_CREDIT_BALANCE } from './credits'
import { supabase } from './supabase'

const STORAGE_PREFIX = 'alphatekx_credits:'
const EVENT = 'alphatekx:credits-change'
const CURRENT_USER_KEY = 'alphatekx:current-user-id'
const SESSION_ANONYMOUS_KEY = `${STORAGE_PREFIX}session-${Date.now()}`

function getStoredUserId() {
  try {
    const currentUser = localStorage.getItem(CURRENT_USER_KEY)
    if (currentUser) return currentUser
    const raw = localStorage.getItem('alphatekx:local-user')
    if (raw) {
      const u = JSON.parse(raw) as { id?: string }
      if (u?.id) return String(u.id)
    }
  } catch {}
  return null
}

function getStorageKey() {
  const userId = getStoredUserId()
  if (userId) {
    return `${STORAGE_PREFIX}${userId}`
  }
  // For anonymous users, check if we have a session key already
  const sessionKey = localStorage.getItem('alphatekx:session-key')
  if (sessionKey) {
    return sessionKey
  }
  // Create a new session key for this anonymous session
  const newKey = `${STORAGE_PREFIX}anonymous-${Math.random().toString(36).slice(2)}`
  localStorage.setItem('alphatekx:session-key', newKey)
  return newKey
}

export function getCredits() {
  const key = getStorageKey()
  const stored = localStorage.getItem(key)
  const parsed = Number(stored ?? String(DEFAULT_CREDIT_BALANCE))
  const result = Number.isFinite(parsed) ? parsed : DEFAULT_CREDIT_BALANCE
  if (stored) {
    console.log('[creditStore] Loading credits:', { key, stored, result })
  }
  return result
}

export async function spendCredits(amount: number) {
  const headers: Record<string, string> = {}
  if (supabase) {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return false
    headers.Authorization = `Bearer ${session.access_token}`
  } else {
    try {
      const raw = localStorage.getItem('alphatekx:local-user')
      if (raw) {
        const u = JSON.parse(raw) as { id?: string; email?: string }
        if (u?.id && u?.email) {
          headers['x-local-user-id'] = String(u.id)
          headers['x-local-user-email'] = String(u.email)
        }
      }
    } catch {}
  }

  try {
    const response = await fetch('/api/credits/spend', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ amount }) })
    const raw = await response.text()
    let result: Record<string, unknown> = {}
    try { result = raw ? JSON.parse(raw) as Record<string, unknown> : {} } catch {}
    if (response.ok && Number.isFinite(Number(result.credits))) {
      setCredits(Number(result.credits))
      return true
    }
    if (response.status === 402) return false
    return false
  } catch {
    return false
  }
}

export function addCredits(amount: number) { setCredits(getCredits() + amount) }
export function setCredits(credits: number) { 
  const key = getStorageKey()
  const value = String(Math.max(0, credits))
  console.log('[creditStore] Saving credits:', { key, value, credits })
  localStorage.setItem(key, value)
  window.dispatchEvent(new Event(EVENT)) 
}

export async function hydrateCredits() {
  if (!supabase) return getCredits()
  try {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return getCredits()
    const res = await fetch('/api/credits/balance', { headers: { Authorization: `Bearer ${session.access_token}` } })
    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      const balance = Number(data.credits)
      if (Number.isFinite(balance)) { setCredits(balance); return balance }
    }
  } catch {}
  return getCredits()
}

export function subscribeCredits(listener: () => void) { window.addEventListener(EVENT, listener); return () => window.removeEventListener(EVENT, listener) }
