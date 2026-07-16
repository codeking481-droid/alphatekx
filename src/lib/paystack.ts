import { supabase } from './supabase'

type Plan = 'starter' | 'pro'
type Transaction = { reference: string }
type PaystackOptions = { key: string; email: string; amount: number; currency: string; metadata?: Record<string, unknown>; onSuccess: (transaction: Transaction) => void; onCancel: () => void; onError: (error: { message?: string }) => void }
type PaystackInstance = { newTransaction: (options: PaystackOptions) => void }
declare global { interface Window { Paystack?: new () => PaystackInstance } }

function loadPaystack() {
  return new Promise<void>((resolve, reject) => {
    if (window.Paystack) return resolve()
    const existing = document.querySelector<HTMLScriptElement>('script[data-paystack]')
    if (existing) { existing.addEventListener('load', () => resolve(), { once: true }); existing.addEventListener('error', () => reject(new Error('Could not load Paystack checkout.')), { once: true }); return }
    const script = document.createElement('script')
    script.src = 'https://js.paystack.co/v2/inline.js'; script.async = true; script.dataset.paystack = 'true'
    script.onload = () => resolve(); script.onerror = () => reject(new Error('Could not load Paystack checkout. Check your connection and try again.'))
    document.head.appendChild(script)
  })
}

async function sessionToken() {
  const session = (await supabase?.auth.getSession()).data.session
  if (!session) throw new Error('Sign in again before making a payment.')
  return session.access_token
}

async function assertPaystackReady() {
  const response = await fetch('/api/paystack/status')
  const data = await response.json()
  if (!response.ok || !data.ready) throw new Error(data.error || `Paystack needs configuration: ${(data.missing || []).join(', ')}`)
}

export async function startPaystackCheckout(plan: Plan, email: string) {
  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim()
  if (!publicKey) throw new Error('VITE_PAYSTACK_PUBLIC_KEY is missing from the deployed site.')
  if (!email) throw new Error('Your account needs an email address before checkout.')
  await assertPaystackReady(); await loadPaystack(); const token = await sessionToken()
  return new Promise<{ verified: boolean; credits: number; plan: string }>((resolve, reject) => {
    const popup = new window.Paystack!()
    popup.newTransaction({ key: publicKey, email, amount: plan === 'pro' ? 800000 : 200000, currency: 'NGN', metadata: { plan, product: 'alphatekx_credits' }, onSuccess: async transaction => {
      try { const verified = await fetch('/api/paystack/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ reference: transaction.reference, plan }) }); const data = await verified.json(); if (!verified.ok) throw new Error(data.error || 'Paystack verification failed'); resolve({ verified: true, credits: data.credits, plan: data.plan }) }
      catch (error) { reject(error) }
    }, onCancel: () => reject(new Error('Payment cancelled. No credits were charged.')), onError: error => reject(new Error(error.message || 'Paystack could not start the transaction.')) })
  })
}

export async function purchaseMarketplaceItem(itemId: string, email: string, amountNaira: number) {
  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim()
  if (!publicKey) throw new Error('VITE_PAYSTACK_PUBLIC_KEY is missing from the deployed site.')
  await assertPaystackReady(); await loadPaystack(); const token = await sessionToken()
  return new Promise<{ creationId: string; downloads: number }>((resolve, reject) => {
    const popup = new window.Paystack!()
    popup.newTransaction({ key: publicKey, email, amount: Math.round(amountNaira * 100), currency: 'NGN', metadata: { itemId, type: 'marketplace' }, onSuccess: async transaction => {
      try { const verified = await fetch('/api/marketplace/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ reference: transaction.reference, itemId }) }); const data = await verified.json(); if (!verified.ok) throw new Error(data.error || 'Marketplace purchase failed'); resolve(data) }
      catch (error) { reject(error) }
    }, onCancel: () => reject(new Error('Payment cancelled.')), onError: error => reject(new Error(error.message || 'Paystack could not start the transaction.')) })
  })
}

export async function acquireFreeMarketplaceItem(itemId: string) {
  const token = await sessionToken()
  const response = await fetch('/api/marketplace/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ itemId }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not acquire creation')
  return data as { creationId: string; downloads: number }
}
