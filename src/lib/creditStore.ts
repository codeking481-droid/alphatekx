import { DEFAULT_CREDIT_BALANCE } from './credits'
import { supabase } from './supabase'

const KEY = 'alphatekx_credits'
const EVENT = 'alphatekx:credits-change'

export function getCredits() {
  const parsed = Number(localStorage.getItem(KEY) ?? String(DEFAULT_CREDIT_BALANCE))
  return Number.isFinite(parsed) ? parsed : DEFAULT_CREDIT_BALANCE
}

const adminEmail = 'iamdan4live@gmail.com'

export async function spendCredits(amount: number) {
  const headers: Record<string, string> = {}
  let userEmail = ''
  if (supabase) {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return false
    if (session.user.email?.toLowerCase() === adminEmail) return true
    headers.Authorization = `Bearer ${session.access_token}`
    userEmail = session.user.email || ''
  } else {
    try {
      const raw = localStorage.getItem('alphatekx:local-user')
      if (raw) {
        const u = JSON.parse(raw)
        if (u?.id && u?.email) {
          headers['x-local-user-id'] = String(u.id)
          headers['x-local-user-email'] = String(u.email)
          userEmail = String(u.email)
        }
      }
    } catch {}
  }
  if (userEmail.toLowerCase() === adminEmail) return true
  try {
    const response = await fetch('/api/credits/spend', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ amount }) })
    const raw = await response.text()
    let result: Record<string, unknown> = {}
    try { result = raw ? JSON.parse(raw) as Record<string, unknown> : {} } catch {}
    if (response.ok && result.admin) return true
    if (response.ok && Number.isFinite(Number(result.credits))) { setCredits(Number(result.credits)); return true }
    if (response.status === 402) return false
  } catch {}
  const current = getCredits()
  if (current < amount) return false
  setCredits(current - amount)
  return true
}

export function addCredits(amount: number) { setCredits(getCredits() + amount) }
export function setCredits(credits: number) { localStorage.setItem(KEY, String(Math.max(0, credits))); window.dispatchEvent(new Event(EVENT)) }

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
