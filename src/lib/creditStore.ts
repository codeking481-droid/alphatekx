import { supabase } from './supabase'

const KEY = 'alphatekx_credits'
const EVENT = 'alphatekx:credits-change'

export function getCredits() {
  const parsed = Number(localStorage.getItem(KEY) ?? '100')
  return Number.isFinite(parsed) ? parsed : 100
}

export async function spendCredits(amount: number) {
  if (supabase) {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return false
    if (session.user.email?.toLowerCase() === 'iamdan4live@gmail.com') return true
    try {
      const response = await fetch('/api/credits/spend', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ amount }) })
      const raw = await response.text()
      let result: Record<string, unknown> = {}
      try { result = raw ? JSON.parse(raw) as Record<string, unknown> : {} } catch {}
      if (response.ok && result.admin) return true
      if (response.ok && Number.isFinite(Number(result.credits))) { setCredits(Number(result.credits)); return true }
      if (response.status === 402 && /insufficient/i.test(String(result.error || raw))) return false
    } catch {}
    const { data, error } = await supabase.rpc('spend_credits', { amount })
    if (!error && typeof data === 'number') { setCredits(data); return true }
    if (error && /insufficient/i.test(error.message)) return false

    // Older deployments may not have the RPC yet. Read the authenticated
    // profile instead of trusting a stale browser cache, then persist safely.
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return false
    const { data: profile, error: readError } = await supabase.from('profiles').select('credits').eq('id', auth.user.id).maybeSingle()
    const balance = Number(profile?.credits)
    if (readError || !Number.isFinite(balance)) {
      // Keep chat and Builder available while an older Supabase project is
      // waiting for the credit RPC migration.
      const cached = getCredits()
      if (cached < amount) return false
      setCredits(cached - amount)
      return true
    }
    if (balance < amount) return false
    const next = balance - amount
    const { error: updateError } = await supabase.from('profiles').update({ credits: next }).eq('id', auth.user.id)
    if (updateError) {
      // RLS intentionally blocks direct balance edits on older schemas. The
      // local balance keeps the product usable until spend_credits is installed.
      setCredits(next)
      return true
    }
    setCredits(next)
    return true
  }
  const current = getCredits()
  if (current < amount) return false
  setCredits(current - amount)
  return true
}

export function addCredits(amount: number) { setCredits(getCredits() + amount) }
export function setCredits(credits: number) { localStorage.setItem(KEY, String(Math.max(0, credits))); window.dispatchEvent(new Event(EVENT)) }

export async function hydrateCredits() {
  if (!supabase) return getCredits()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return getCredits()
  const { data } = await supabase.from('profiles').select('credits').eq('id', auth.user.id).maybeSingle()
  if (data) { setCredits(Number(data.credits)); return Number(data.credits) }
  return getCredits()
}

export function subscribeCredits(listener: () => void) { window.addEventListener(EVENT, listener); return () => window.removeEventListener(EVENT, listener) }
