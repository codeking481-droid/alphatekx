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

function persistPaymentReference(reference: string) {
  try {
    localStorage.setItem('lastRef', reference)
    localStorage.setItem('alphatekx:last-ref', reference)
  } catch {}
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
  const res = await fetch('/api/payment/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...await authHeaders() },
    body: JSON.stringify({ provider, ...item }),
  })
  const data = await responsePayload(res)
  if (!res.ok) throw new Error(String(data.error || `Payment start failed (${res.status})`))
  if (!data.authorization_url) throw new Error('Paystack did not return a checkout link. Please retry.')
  const reference = String(data.reference || '')
  persistPaymentReference(reference)
  try {
    localStorage.setItem('alphatekx:pending-payment', JSON.stringify({
      reference,
      credits: Number(data.credits) || 0,
      source: String(data.source || ''),
      createdAt: new Date().toISOString(),
    }))
  } catch {}
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

export type VerifiedCheckout = { verified: boolean; creditsAdded?: number; balance?: number; credits?: number; duplicate?: boolean; plan?: string; amount?: number; reference?: string; mock?: boolean }

export async function verifyCheckout(provider: PaymentProvider, reference: string): Promise<VerifiedCheckout> {
  let lastError = 'Payment verification failed.'
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch('/api/payment/verify-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...await authHeaders() },
      body: JSON.stringify({ provider, reference }),
    })
    const data = await responsePayload(res)
    if (res.ok && data.verified === true) {
      return data as VerifiedCheckout
    }
    lastError = String(data.error || `Payment verification failed (${res.status})`)
    const retryable = res.status >= 500 || res.status === 409 || /still being credited|temporar|try again|processing/i.test(lastError)
    if (!retryable || attempt === 3) break
    await new Promise(resolve => window.setTimeout(resolve, 700 * (attempt + 1)))
  }
  throw new Error(lastError)
}
