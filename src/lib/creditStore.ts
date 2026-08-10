import { DEFAULT_CREDIT_BALANCE } from './credits'
import { supabase } from './supabase'

const STORAGE_PREFIX = 'alphatekx_credits:'
const EVENT = 'alphatekx:credits-change'
const CURRENT_USER_KEY = 'alphatekx:current-user-id'

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
  return userId ? `${STORAGE_PREFIX}${userId}` : `${STORAGE_PREFIX}anonymous`
}

export function getCredits() {
  const key = getStorageKey()
  const parsed = Number(localStorage.getItem(key) ?? String(DEFAULT_CREDIT_BALANCE))
  return Number.isFinite(parsed) ? parsed : DEFAULT_CREDIT_BALANCE
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
export function setCredits(credits: number) { const key = getStorageKey(); localStorage.setItem(key, String(Math.max(0, credits))); window.dispatchEvent(new Event(EVENT)) }

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
