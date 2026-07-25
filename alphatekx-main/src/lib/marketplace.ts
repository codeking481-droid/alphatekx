import { getJson, postJson } from './apiClient'
import type { MarketplaceProduct, MarketplaceOrder, SellerWallet, Withdrawal } from './types'

export type { MarketplaceProduct, MarketplaceOrder, SellerWallet, Withdrawal }

export const MARKETPLACE_CATEGORIES = ['All', 'Websites', 'Apps', 'Workers', 'Templates']

function getToken(): string | undefined {
  try {
    const raw = localStorage.getItem('alphatekx:session')
    if (raw) return JSON.parse(raw)?.access_token
  } catch {}
  return undefined
}

async function getUserEmail(): Promise<string> {
  try {
    const raw = localStorage.getItem('alphatekx:local-user')
    if (raw) return JSON.parse(raw)?.email || ''
  } catch {}
  try {
    const { supabase } = await import('./supabase')
    const session = await supabase?.auth.getSession()
    return session?.data?.session?.user?.email || ''
  } catch {}
  return ''
}

function tokenOptions() {
  const token = getToken()
  return token ? { token } : {}
}

export async function fetchProducts(params?: { q?: string; category?: string; sort?: string }): Promise<{ products: MarketplaceProduct[] }> {
  const query = new URLSearchParams()
  if (params?.q) query.set('q', params.q)
  if (params?.category && params.category !== 'All') query.set('category', params.category)
  if (params?.sort) query.set('sort', params.sort)
  return getJson<{ products: MarketplaceProduct[] }>(`/api/marketplace/products?${query.toString()}`, tokenOptions())
}

export async function fetchProduct(id: string): Promise<{ product: MarketplaceProduct }> {
  return getJson<{ product: MarketplaceProduct }>(`/api/marketplace/products/${id}`, tokenOptions())
}

export async function createProduct(input: Partial<MarketplaceProduct>): Promise<{ product: MarketplaceProduct }> {
  return postJson<{ product: MarketplaceProduct }>('/api/marketplace/products', input, tokenOptions())
}

export async function deleteProduct(id: string): Promise<{ ok: boolean }> {
  return deleteJson<{ ok: boolean }>(`/api/marketplace/products/${id}`, tokenOptions())
}

export async function fetchMyProducts(): Promise<{ products: MarketplaceProduct[] }> {
  return getJson<{ products: MarketplaceProduct[] }>('/api/marketplace/my-products', tokenOptions())
}

export async function fetchMyPurchases(): Promise<{ purchases: { order: MarketplaceOrder; product: MarketplaceProduct }[] }> {
  return getJson<{ purchases: { order: MarketplaceOrder; product: MarketplaceProduct }[] }>('/api/marketplace/my-purchases', tokenOptions())
}

export async function buyProduct(id: string): Promise<{ authorization_url?: string; reference: string; amount: number; productId: string }> {
  return postJson<{ authorization_url?: string; reference: string; amount: number; productId: string }>(`/api/marketplace/buy/${id}`, {}, tokenOptions())
}

export async function verifyMarketplacePayment(reference: string): Promise<{ success: boolean; order?: MarketplaceOrder; product?: MarketplaceProduct; error?: string }> {
  try {
    return await postJson<{ success: boolean; order?: MarketplaceOrder; product?: MarketplaceProduct }>('/api/marketplace/verify-payment', { reference }, tokenOptions())
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Verification failed' }
  }
}

export async function startMarketplaceCheckout(product: MarketplaceProduct): Promise<void> {
  const { authorization_url, reference, amount } = await buyProduct(product.id)
  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim()
  if (!publicKey || !window.PaystackPop) {
    window.location.href = authorization_url || `/marketplace?payment=pending&reference=${reference}`
    return
  }
  const email = await getUserEmail()
  if (!email) {
    window.location.href = authorization_url || `/marketplace?payment=pending&reference=${reference}`
    return
  }
  return new Promise((resolve, reject) => {
    const handler = window.PaystackPop.setup({
      key: publicKey,
      email,
      amount,
      ref: reference,
      metadata: { product_id: product.id, type: 'marketplace' },
      callback: (response: { reference?: string; status?: string }) => {
        if (response.status !== 'success') { reject(new Error('Payment not completed')); return }
        verifyMarketplacePayment(response.reference || reference).then(r => r.success ? resolve() : reject(new Error(r.error || 'Verification failed'))).catch(reject)
      },
      onClose: () => reject(new Error('Payment cancelled')),
    })
    handler.openIframe()
  })
}

export async function fetchEarnings(): Promise<{ wallet: SellerWallet; withdrawals: Withdrawal[] }> {
  return getJson<{ wallet: SellerWallet; withdrawals: Withdrawal[] }>('/api/marketplace/earnings', tokenOptions())
}

export async function requestWithdrawal(input: { amount: number; bankName: string; accountNumber: string; accountName: string; bankCode: string }): Promise<{ withdrawal: Withdrawal; wallet: SellerWallet }> {
  return postJson<{ withdrawal: Withdrawal; wallet: SellerWallet }>('/api/marketplace/withdraw', input, tokenOptions())
}

export async function verifyBankAccount(input: { accountNumber: string; bankCode: string }): Promise<{ accountName: string; accountNumber: string; bankCode: string }> {
  return postJson<{ accountName: string; accountNumber: string; bankCode: string }>('/api/marketplace/verify-account', input, tokenOptions())
}

export async function fetchBanks(): Promise<{ banks: { id: number; name: string; code: string; slug: string }[] }> {
  return getJson<{ banks: { id: number; name: string; code: string; slug: string }[] }>('/api/marketplace/banks')
}

export async function adminWithdrawals(): Promise<{ withdrawals: Withdrawal[] }> {
  return getJson<{ withdrawals: Withdrawal[] }>('/api/admin/withdrawals', tokenOptions())
}

export async function markWithdrawalPaid(id: string, input: { proof?: string; transferCode?: string }): Promise<{ withdrawal: Withdrawal }> {
  return postJson<{ withdrawal: Withdrawal }>(`/api/admin/withdrawals/${id}/paid`, input, tokenOptions())
}

declare global {
  interface Window {
    PaystackPop?: { setup: (options: Record<string, unknown>) => { openIframe: () => void } }
  }
}
