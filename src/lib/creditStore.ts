import { DEFAULT_CREDIT_BALANCE } from './credits'
import { supabase } from './supabase'

const STORAGE_PREFIX = 'alphatekx_credits:'
const EVENT = 'alphatekx:credits-change'

function getStorageKey() {
  const userId = localStorage.getItem('alphatekx:current-user-id')
  if (userId) return `${STORAGE_PREFIX}${userId}`
  return `${STORAGE_PREFIX}anonymous-${localStorage.getItem('alphatekx:session-key') || 'default'}`
}

export function getCredits() {
  const key = getStorageKey()
  const stored = localStorage.getItem(key)
  if (!stored || stored === '' || stored === 'null') return DEFAULT_CREDIT_BALANCE
  const parsed = Number(stored)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_CREDIT_BALANCE
}

export async function spendCredits(amount: number) {
  const headers: Record<string, string> = {}
  if (supabase) {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return false
    headers.Authorization = `Bearer ${session.access_token}`
  }

  try {
    const response = await fetch('/api/credits/spend', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json', ...headers }, 
      body: JSON.stringify({ amount }) 
    })
    
    if (response.ok) {
      const result = await response.json().catch(() => ({}))
      if (Number.isFinite(Number(result.credits))) {
        setCredits(Number(result.credits))
        return true
      }
    }
    if (response.status === 402) return false
    return false
  } catch {
    return false
  }
}

export function setCredits(credits: number) { 
  const key = getStorageKey()
  localStorage.setItem(key, String(Math.max(0, credits)))
  window.dispatchEvent(new Event(EVENT)) 
}

export async function hydrateCredits() {
  // Fetch from backend API which reads from Supabase
  if (!supabase) return getCredits()
  
  try {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return getCredits()
    
    const res = await fetch('/api/check-credits', { 
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}` 
      },
      body: JSON.stringify({ email: session.user.email })
    })
    
    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      const balance = Number(data.credits)
      if (Number.isFinite(balance)) {
        // Only update if balance actually changed to prevent glittering
        const currentBalance = getCredits()
        if (balance !== currentBalance) {
          setCredits(balance)
        }
        return balance
      }
    }
  } catch (error) {
    console.error('[creditStore] Hydration failed:', error instanceof Error ? error.message : error)
  }
  return getCredits()
}

export function subscribeCredits(listener: () => void) { 
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener) 
}

