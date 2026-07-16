import { supabase } from './supabase'

type Plan = 'starter' | 'pro'
declare global { interface Window { PaystackPop?: { setup: (options: Record<string, unknown>) => { openIframe: () => void } } } }

function loadPaystack() {
  return new Promise<void>((resolve, reject) => {
    if (window.PaystackPop) return resolve()
    const existing = document.querySelector<HTMLScriptElement>('script[data-paystack]')
    if (existing) { existing.addEventListener('load', () => resolve(), { once:true }); return }
    const script = document.createElement('script')
    script.src = 'https://js.paystack.co/v1/inline.js'; script.async = true; script.dataset.paystack = 'true'
    script.onload = () => resolve(); script.onerror = () => reject(new Error('Could not load Paystack'))
    document.head.appendChild(script)
  })
}

export async function startPaystackCheckout(plan: Plan, email: string) {
  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim()
  if (!publicKey) throw new Error('Paystack is not configured. Add VITE_PAYSTACK_PUBLIC_KEY.')
  await loadPaystack()
  return new Promise<{verified:boolean;credits:number;plan:string}>((resolve, reject) => {
    const amount = plan === 'pro' ? 800000 : 200000
    const handler = window.PaystackPop!.setup({ key:publicKey, email, amount, currency:'NGN', metadata:{plan}, callback: async (response: unknown) => {
      const reference = (response as {reference:string}).reference
      const session = (await supabase?.auth.getSession()).data.session
      const verified = await fetch('/api/paystack/verify', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token ?? ''}`}, body:JSON.stringify({reference,plan}) })
      const data = await verified.json()
      if(!verified.ok) reject(new Error(data.error || 'Paystack verification failed')); else resolve({verified:true,credits:data.credits,plan:data.plan})
    }, onClose: () => reject(new Error('Payment cancelled')) })
    handler.openIframe()
  })
}

export async function purchaseMarketplaceItem(itemId: string, email: string, amountNaira: number) {
  const session = (await supabase?.auth.getSession()).data.session
  if (!session) throw new Error('Authentication required')
  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim()
  if (!publicKey) throw new Error('Marketplace payments are not configured')
  await loadPaystack()
  return new Promise<{creationId:string;downloads:number}>((resolve, reject) => {
    const handler = window.PaystackPop!.setup({ key:publicKey, email, amount:Math.round(amountNaira*100), currency:'NGN', metadata:{itemId,type:'marketplace'}, callback: async (response: unknown) => {
      const reference = (response as {reference:string}).reference
      const verified = await fetch('/api/marketplace/purchase', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`}, body:JSON.stringify({reference,itemId}) })
      const data = await verified.json()
      if (!verified.ok) reject(new Error(data.error || 'Marketplace purchase failed')); else resolve(data)
    }, onClose: () => reject(new Error('Payment cancelled')) })
    handler.openIframe()
  })
}

export async function acquireFreeMarketplaceItem(itemId: string) {
  const session = (await supabase?.auth.getSession()).data.session
  if (!session) throw new Error('Authentication required')
  const response = await fetch('/api/marketplace/purchase', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`}, body:JSON.stringify({itemId}) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not acquire creation')
  return data as {creationId:string;downloads:number}
}
