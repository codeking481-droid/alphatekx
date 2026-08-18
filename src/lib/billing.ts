export type PlanId = 'free' | 'video_19' | 'video_49' | 'video_99' | 'early_founder' | 'creator_monthly' | 'builder_monthly' | 'scale_monthly'

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
    id: 'free', name: 'Free', priceKobo: 0, monthlyCredits: 10, maxActiveAutomations: 1,
    monthlyVideos: 1,
    videoMaxDurationSec: 2 * 60,
    features: ['10 credits', '1 active automation', '1 video / month, max 2 mins'],
  },
  video_19: {
    id: 'video_19', name: '$19', priceKobo: 1900, currency: 'USD', monthlyCredits: 400, maxActiveAutomations: 10,
    monthlyVideos: 10,
    videoMaxDurationSec: 5 * 60,
    features: ['400 credits', '10 videos / month, max 5 mins', 'Up to 10 automations'],
  },
  video_49: {
    id: 'video_49', name: '$49', priceKobo: 4900, currency: 'USD', monthlyCredits: 800, maxActiveAutomations: 30,
    monthlyVideos: 30,
    videoMaxDurationSec: 8 * 60,
    schedulerDays: 7,
    features: ['800 credits', '30 videos / month, max 8 mins', '7-day scheduler', 'Up to 30 automations'],
  },
  video_99: {
    id: 'video_99', name: '$99', priceKobo: 9900, currency: 'USD', monthlyCredits: 1200, maxActiveAutomations: 1000000,
    monthlyVideos: Infinity as unknown as number,
    videoMaxDurationSec: 12 * 60,
    vault: true,
    features: ['1,200 credits', 'Unlimited videos, max 12 mins', 'Vault saving', 'Unlimited automations', 'API access'],
  },
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'video_19', label: 'Healer Starter — $19', credits: 400, amountKobo: 1900, currency: 'USD', description: '10 scans, 3 video restorations, 400 credits/month' },
  { id: 'video_49', label: 'Healer Pro — $49', credits: 800, amountKobo: 4900, currency: 'USD', description: '50 full restorations, 25 videos, 800 credits/month' },
  { id: 'video_99', label: 'Healer Empire — $99', credits: 1200, amountKobo: 9900, currency: 'USD', description: 'Unlimited restorations, all styles, 1,200 credits/month' },
  { id: 'test_100', label: 'Test purchase', credits: 100, amountKobo: 10000, currency: 'NGN', description: 'Test payment for ₦100' },
]

export function getPlan(id: PlanId | string): Plan {
  if (!id) return PLANS.free
  if (String(id) === 'early_founder') return PLANS.video_19
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
