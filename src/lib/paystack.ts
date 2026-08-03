import { supabase } from './supabase'
import { addCredits, setCredits } from './creditStore'

type Plan = 'starter' | 'pro'
export type PlanValue = 'free' | Plan | 'credits'

export type PaymentPack = {
  id: string
  label: string
  amountKobo: number
  credits?: number
  plan?: Plan
}

export const PACKS: PaymentPack[] = [
  { id: 'starter', label: 'Starter Pack', amountKobo: 500000, credits: 500, plan: 'starter' },
  { id: 'pro', label: 'Pro Pack', amountKobo: 1_500_000, credits: 2500, plan: 'pro' },
  { id: 'credits', label: 'Credit Booster', amountKobo: 200_000, credits: 100 },
]

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: Record<string, unknown>) => { openIframe: () => void }
    }
  }
}

function getUserEmail(): string | null {
  try {
    const local = localStorage.getItem('alphatekx:local-user')
    if (local) return JSON.parse(local).email || null
  } catch { /* ignore */ }
  return null
}

export async function initiatePaystack(plan: Plan) {
  const pack = PACKS.find(p => p.id === plan)
  if (!pack) throw new Error('Invalid plan selected.')
  return initiatePaystackPack(pack)
}

function readEnv(name: string) {
  const value = typeof import.meta !== 'undefined' && import.meta && 'env' in import.meta ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name] : undefined
  return value || (typeof window !== 'undefined' ? (window as Window & { __APP_ENV__?: Record<string, string | undefined> }).__APP_ENV__?.[name] : undefined)
}

function savePendingPayment(reference: string, email: string, pack: PaymentPack) {
  try {
    localStorage.setItem('alphatekx:pending-payment', JSON.stringify({
      reference,
      email,
      packId: pack.id,
      plan: pack.plan || pack.id,
      credits: pack.credits || 0,
      amountKobo: pack.amountKobo,
      createdAt: Date.now(),
    }))
  } catch {}
}

export async function initiatePaystackPack(pack: PaymentPack) {
  const publicKey = readEnv('VITE_PAYSTACK_PUBLIC_KEY')?.trim()

  let email = ''
  try {
    const session = (await supabase?.auth.getSession())?.data.session
    email = session?.user?.email || getUserEmail() || ''
    // persist pending payment user so session can be restored after redirect
    try { if (session?.user?.id) localStorage.setItem('pendingPaymentUser', String(session.user.id)) } catch {}
  } catch { email = getUserEmail() || '' }

  if (!email) {
    const value = window.prompt('Enter your email for the Paystack receipt:')
    if (!value?.trim()) throw new Error('Email is required to start checkout.')
    email = value.trim()
  }

  const initRes = await fetch('/api/paystack/initialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ type: 'credits', packId: pack.id }),
  })
  const initText = await initRes.text()
  let initData: Record<string, unknown> = {}
  if (initText.trim()) {
    try { initData = JSON.parse(initText) as Record<string, unknown> } catch { throw new Error(`Payment server returned an invalid response (${initRes.status}). Please retry.`) }
  }
  if (!initRes.ok) throw new Error(String(initData.error || `Payment initialization failed (${initRes.status}).`))

  const reference = String(initData.reference || '')
  const amount = Number(initData.amount || 0)
  const authorizationUrl = String(initData.authorization_url || '')
  if (!reference || !amount) throw new Error('Payment initialization returned invalid data. Please retry.')

  savePendingPayment(reference, email, pack)

  if (!publicKey || !window.PaystackPop) {
    if (!authorizationUrl) throw new Error('Paystack checkout is unavailable. Please try again later.')
    window.location.href = authorizationUrl
    return { success: true as const, plan: (pack.plan || pack.id) as PlanValue, reference }
  }

  return new Promise<{ success: true; plan: PlanValue; reference: string }>((resolve, reject) => {
    const handler = window.PaystackPop?.setup({
      key: publicKey,
      email,
      amount,
      ref: reference,
      onClose: () => reject(new Error('Payment cancelled. No charge was made.')),
      callback: (response: { reference?: string; status?: string; message?: string }) => {
        const ref = response?.reference || reference
        if (!ref) {
          reject(new Error(response?.message || 'Payment did not return a reference.'))
          return
        }
        savePendingPayment(ref, email, pack)
        const destination = new URL('/dashboard', window.location.origin)
        destination.searchParams.set('payment', 'success')
        destination.searchParams.set('reference', ref)
        destination.searchParams.set('ref', ref)
        destination.searchParams.set('credits', String(pack.credits || 0))
        try {
          window.location.href = `${destination.pathname}${destination.search}`
        } catch (err) {
          void verifyPaystack(ref, pack)
            .then(() => resolve({ success: true as const, plan: (pack.plan || pack.id) as PlanValue, reference: ref }))
            .catch(reject)
        }
      },
    })
    if (!handler) {
      reject(new Error('Paystack checkout could not start. Make sure the Paystack script loaded.'))
      return
    }
    handler.openIframe()
  })
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  try {
    const session = (await supabase?.auth.getSession())?.data.session
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  } catch {}
  try {
    const raw = localStorage.getItem('alphatekx:local-user')
    if (raw) {
      const u = JSON.parse(raw)
      if (u?.id && u?.email) {
        headers['x-local-user-id'] = String(u.id)
        headers['x-local-user-email'] = String(u.email)
      }
    }
  } catch {}
  return headers
}

export async function verifyPaystack(reference: string, packOrPlan: PaymentPack | Plan) {
  let token: string | undefined
  try {
    const session = (await supabase?.auth.getSession())?.data.session
    token = session?.access_token
  } catch { /* local dev may not have supabase */ }

  const pack = typeof packOrPlan === 'string' ? PACKS.find(p => p.id === packOrPlan) : packOrPlan
  if (!pack) throw new Error('Invalid payment pack.')

  const res = await fetch('/api/verify-paystack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ reference, plan: pack.id, amount: pack.amountKobo, credits: pack.credits }),
  })
  const raw = await res.text()
  let data: Record<string, unknown> = {}
  if (raw.trim()) {
    try { data = JSON.parse(raw) as Record<string, unknown> }
    catch { throw new Error(`Payment server returned an invalid response (${res.status}). Please retry.`) }
  }
  if (!res.ok) throw new Error(String(data.error || `Payment verification failed (${res.status}).`))
  if (!raw.trim()) throw new Error('Payment server returned an empty response. No credits were changed; please retry verification.')
  localStorage.setItem('alphatekx_plan', pack.plan || pack.id)
  localStorage.setItem('alphatekx_freeCount', '0')
  if (typeof data.credits === 'number') setCredits(data.credits)
  else if (pack.credits) addCredits(pack.credits)
  return data as { success: true; plan: string; amount: number; credits?: number }
}

// Backwards-compatible helper for credit top-up routes.
export async function startPaystackCheckout(plan: Plan, email: string) {
  if (email) {
    try { localStorage.setItem('alphatekx:local-user', JSON.stringify({ email })) } catch { /* ignore */ }
  }
  return initiatePaystack(plan)
}

export function getCurrentPlan(): PlanValue {
  return (localStorage.getItem('alphatekx_plan') as PlanValue) || 'free'
}

export function canUseFreeFeature(): boolean {
  const plan = getCurrentPlan()
  if (plan === 'starter' || plan === 'pro') return true
  const count = Number(localStorage.getItem('alphatekx_freeCount') || '0')
  return count < 3
}

export function incrementFreeUsage() {
  const count = Number(localStorage.getItem('alphatekx_freeCount') || '0')
  localStorage.setItem('alphatekx_freeCount', String(count + 1))
}
