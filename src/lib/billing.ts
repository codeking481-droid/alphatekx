export type PlanId = 'free' | 'creator_monthly' | 'builder_monthly' | 'scale_monthly'

export type Plan = {
  id: PlanId
  name: string
  priceKobo: number
  currency?: string
  monthlyCredits: number
  maxActiveAutomations: number
  features: string[]
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
    features: ['1 Google credit or 10 verified-phone credits', '1 active automation', '1 post per hour', 'Schedule up to 7 days ahead'],
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
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'spark_5', label: 'Spark', credits: 5, amountKobo: 100, currency: 'USD', description: '5 credits for $1' },
  { id: 'creator_20', label: 'Creator', credits: 20, amountKobo: 300, currency: 'USD', description: '20 credits for $3' },
  { id: 'builder_40', label: 'Builder', credits: 40, amountKobo: 500, currency: 'USD', description: '40 credits for $5' },
  { id: 'scale_100', label: 'Scale', credits: 100, amountKobo: 1000, currency: 'USD', description: '100 credits for $10' },
]

export function getPlan(id: PlanId | string): Plan {
  return PLANS[id as PlanId] || PLANS.free
}

export function getCreditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find(pack => pack.id === id)
}

export function formatCurrency(minorUnits: number): string {
  return `$${(minorUnits / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
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
