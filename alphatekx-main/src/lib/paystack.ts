import { supabase } from './supabase'
import { addCredits, setCredits } from './creditStore'

type Plan = 'starter' | 'pro'

export type PaymentPack = {
  id: 'starter' | 'pro' | 'credits'
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

export async function initiatePaystackPack(pack: PaymentPack) {
  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim()
  if (!publicKey) {
    console.warn('Add VITE_PAYSTACK_PUBLIC_KEY to your Render Environment to use live Paystack.')
    throw new Error('Paystack public key is missing. Add VITE_PAYSTACK_PUBLIC_KEY in your environment.')
  }

  let email = ''
  try {
    const session = (await supabase?.auth.getSession())?.data.session
    email = session?.user?.email || getUserEmail() || ''
  } catch { email = getUserEmail() || '' }

  if (!email) {
    const value = window.prompt('Enter your email for the Paystack receipt:')
    if (!value?.trim()) throw new Error('Email is required to start checkout.')
    email = value.trim()
  }

  const reference = `alphatekx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  return new Promise<{ success: true; plan: Plan | 'credits'; reference: string }>((resolve, reject) => {
    const handler = window.PaystackPop?.setup({
      key: publicKey,
      email,
      amount: pack.amountKobo,
      currency: 'NGN',
      ref: reference,
      metadata: {
        custom_fields: [
          { display_name: 'Plan', variable_name: 'plan', value: pack.id },
          ...(pack.credits ? [{ display_name: 'Credits', variable_name: 'credits', value: String(pack.credits) }] : []),
        ],
      },
      onClose: () => reject(new Error('Payment cancelled. No charge was made.')),
      callback: (response: { reference?: string; status?: string; message?: string }) => {
        if (response?.status !== 'success') {
          reject(new Error(response?.message || 'Payment was not completed.'))
          return
        }
        void verifyPaystack(response.reference || reference, pack)
          .then(() => resolve({ success: true as const, plan: pack.plan || pack.id as Plan | 'credits', reference: response.reference || reference }))
          .catch(reject)
      },
    })
    if (!handler) {
      reject(new Error('Paystack checkout could not start. Make sure the Paystack script loaded.'))
      return
    }
    handler.openIframe()
  })
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
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Payment verification failed.')
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

export function getCurrentPlan(): 'free' | Plan {
  return (localStorage.getItem('alphatekx_plan') as 'free' | Plan) || 'free'
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
