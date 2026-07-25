import { supabase } from './supabase'
import type { CreditPack, PlanId } from './billing'

export type PaymentItem =
  | { type: 'credits'; packId: CreditPack['id'] }
  | { type: 'subscription'; planId: PlanId }

export type PaymentProvider = 'paystack'

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...localUserHeaders() }
  try {
    const session = (await supabase?.auth.getSession())?.data?.session
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  } catch {}
  return headers
}

export async function initializeCheckout(provider: PaymentProvider, item: PaymentItem): Promise<{ authorization_url: string; reference: string; credits: number; amount: number; source: string; provider: string }> {
  const res = await fetch('/api/paystack/initialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...await authHeaders() },
    body: JSON.stringify(item),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Payment start failed')
  return data
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
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Payment verification failed')
  return data
}
