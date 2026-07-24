import { supabase } from './supabase'
import type { CreditPack, PlanId } from './billing'

export type PaymentItem =
  | { type: 'credits'; packId: CreditPack['id'] }
  | { type: 'subscription'; planId: PlanId }

export type PaymentProvider = 'paystack'

async function responsePayload(response: Response) {
  const text = await response.text()
  if (!text.trim()) return {}
  try { return JSON.parse(text) as Record<string, unknown> }
  catch { throw new Error(`Payment server returned an invalid response (${response.status}). Please retry.`) }
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  try {
    const session = (await supabase?.auth.getSession())?.data?.session
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    else Object.assign(headers, localUserHeaders())
  } catch {}
  if (!headers.Authorization) Object.assign(headers, localUserHeaders())
  return headers
}

export async function initializeCheckout(provider: PaymentProvider, item: PaymentItem): Promise<{ authorization_url: string; reference: string; credits: number; amount: number; source: string; provider: string }> {
  const res = await fetch('/api/paystack/initialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...await authHeaders() },
    body: JSON.stringify(item),
  })
  const data = await responsePayload(res)
  if (!res.ok) throw new Error(String(data.error || `Payment start failed (${res.status})`))
  if (!data.authorization_url) throw new Error('Paystack did not return a checkout link. Please retry.')
  return data as { authorization_url: string; reference: string; credits: number; amount: number; source: string; provider: string }
}

function localUserHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('alphatekx:local-user')
    if (raw) {
      const u = JSON.parse(raw)
      if (u?.id && u?.email) return { 'x-local-user-id': String(u.id), 'x-local-user-email': String(u.email) }
    }
  } catch {}
  return {}
}

export async function verifyCheckout(provider: PaymentProvider, reference: string): Promise<{ verified: boolean; credits?: number; plan?: string; amount?: number; reference?: string; mock?: boolean }> {
  const res = await fetch('/api/verify-paystack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...await authHeaders() },
    body: JSON.stringify({ reference }),
  })
  const data = await responsePayload(res)
  if (!res.ok) throw new Error(String(data.error || `Payment verification failed (${res.status})`))
  return data as { verified: boolean; credits?: number; plan?: string; amount?: number; reference?: string; mock?: boolean }
}
