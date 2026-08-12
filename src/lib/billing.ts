export type PlanId = 'free' | 'starter' | 'growth' | 'scale' | 'early_founder' | 'creator_monthly' | 'builder_monthly' | 'scale_monthly' | 'video_free' | 'video_19' | 'video_49' | 'video_99'

export type Plan = {
  id: PlanId
  name: string
  priceKobo: number
  currency?: string
  monthlyCredits: number
  maxActiveAutomations: number
  features: string[]
  // Video-specific fields
  monthlyVideos?: number
  videoMaxDurationSec?: number
  schedulerDays?: number
  vault?: boolean
  badge?: string
}

export type CreditPack = {
  id: string
  label: string
  credits: number
  amountKobo: number
  currency?: string
  description: string
}

export type Transaction = {
  id: string
  type: 'purchase' | 'subscription' | 'spend' | 'refund' | 'plan_change' | 'earn'
  creditsAdded: number
  creditsRemoved: number
  balanceAfter: number
  reference: string | null
  automationId: string | null
  reason: string | null
  createdAt: string
}

export type BillingSummary = {
  credits: number
  plan: PlanId
  planName: string
  monthlyCredits: number
  purchasedCredits: number
  monthlyIncluded: number
  renewalDate: string | null
  usageThisMonth: number
  totalCreditsSpent: number
  maxActiveAutomations: number
  transactions: Transaction[]
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free', name: 'Free', priceKobo: 0, monthlyCredits: 0, maxActiveAutomations: 1,
    features: ['10 free signup credits', '1 active automation', 'Basic automations', 'Execution history'],
  },
  starter: {
    id: 'starter', name: 'Starter', priceKobo: 1500, currency: 'USD', monthlyCredits: 150, maxActiveAutomations: 2,
    features: ['150 credits every month', 'Up to 2 active automations', 'Scheduled automations', 'Basic support'],
  },
  growth: {
    id: 'growth', name: 'Growth', priceKobo: 2900, currency: 'USD', monthlyCredits: 400, maxActiveAutomations: 10,
    features: ['400 credits every month', 'Up to 10 active automations', 'Priority scheduling', 'Priority support'], badge: 'Most Popular',
  },
  scale: {
    id: 'scale', name: 'Scale', priceKobo: 7900, currency: 'USD', monthlyCredits: 1200, maxActiveAutomations: 1000000,
    features: ['1,200 credits every month', 'Unlimited active automations', 'Dedicated success', 'API access'],
  },
  early_founder: {
    id: 'early_founder', name: 'Early Founder', priceKobo: 1900, currency: 'USD', monthlyCredits: 400, maxActiveAutomations: 10,
    monthlyVideos: 10,
    videoMaxDurationSec: 5 * 60,
    features: ['400 credits every month', 'Up to 10 active automations', 'Priority scheduling', 'Early founder pricing'],
  },
  creator_monthly: {
    id: 'creator_monthly', name: 'Starter', priceKobo: 1500, currency: 'USD', monthlyCredits: 150, maxActiveAutomations: 2,
    features: ['150 credits every month', 'Up to 2 active automations', 'Scheduled automations', 'Basic support'],
  },
  builder_monthly: {
    id: 'builder_monthly', name: 'Growth', priceKobo: 2900, currency: 'USD', monthlyCredits: 400, maxActiveAutomations: 10,
    features: ['400 credits every month', 'Up to 10 active automations', 'Priority scheduling', 'Priority support'], badge: 'Most Popular',
  },
  scale_monthly: {
    id: 'scale_monthly', name: 'Scale', priceKobo: 7900, currency: 'USD', monthlyCredits: 1200, maxActiveAutomations: 1000000,
    features: ['1,200 credits every month', 'Unlimited active automations', 'Dedicated success', 'API access'],
  },
  // Video subscription plans
  video_free: {
    id: 'video_free', name: 'Free Video', priceKobo: 0, monthlyCredits: 0, maxActiveAutomations: 1,
    monthlyVideos: 1,
    videoMaxDurationSec: 2 * 60,
    features: ['1 video / month, max 2 mins']
  },
  video_19: {
    id: 'video_19', name: '$19 Video', priceKobo: 1900, currency: 'USD', monthlyCredits: 0, maxActiveAutomations: 2,
    monthlyVideos: 10,
    videoMaxDurationSec: 5 * 60,
    features: ['10 videos / month, max 5 mins']
  },
  video_49: {
    id: 'video_49', name: '$49 Video', priceKobo: 4900, currency: 'USD', monthlyCredits: 0, maxActiveAutomations: 10,
    monthlyVideos: 30,
    videoMaxDurationSec: 8 * 60,
    schedulerDays: 7,
    features: ['30 videos / month, max 8 mins, 7-day scheduler']
  },
  video_99: {
    id: 'video_99', name: '$99 Video', priceKobo: 9900, currency: 'USD', monthlyCredits: 0, maxActiveAutomations: 1000000,
    monthlyVideos: Infinity as unknown as number,
    videoMaxDurationSec: 12 * 60,
    vault: true,
    features: ['Unlimited videos, max 12 mins, Vault & team seats']
  },
}

export const CREDIT_PACKS: CreditPack[] = [
  // Legacy micro-packs have been retired. Only test and promotional purchases remain.
  { id: 'test_100', label: 'Test purchase', credits: 100, amountKobo: 10000, currency: 'NGN', description: 'Test payment for ₦100' },
]

export function getPlan(id: PlanId | string): Plan {
  return PLANS[id as PlanId] || PLANS.free
}

export function getCreditPack(id: string): CreditPack | undefined {
  const normalizedId = String(id || '').trim()
  const pack = CREDIT_PACKS.find(pack => pack.id === normalizedId)
  if (pack) return pack
  if (normalizedId === 'test_50') return CREDIT_PACKS.find(pack => pack.id === 'test_100')
  return undefined
}

export function formatCurrency(minorUnits: number): string {
  return `$${(minorUnits / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function formatAmount(minorUnits: number, currency = 'USD'): string {
  const normalized = String(currency || 'USD').trim().toUpperCase()
  if (normalized === 'NGN') {
    return `₦${(minorUnits / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  }
  return formatCurrency(minorUnits)
}

export function estimateMonthlyUsage(perRun: number, durationDays = 30): number {
  return perRun * durationDays
}

export function projectBalanceAfter(balance: number, perRun: number, durationDays = 30): number {
  return Math.max(0, balance - estimateMonthlyUsage(perRun, durationDays))
}

export function formatCredits(n: number): string {
  if (!isFinite(n)) return 'Unlimited'
  return `${n.toLocaleString()} Credit${n === 1 ? '' : 's'}`
}
