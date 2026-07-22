export type PlanId = 'free' | 'pro_early_access'

export type Plan = {
  id: PlanId
  name: string
  priceKobo: number
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
    id: 'free',
    name: 'Free',
    priceKobo: 0,
    monthlyCredits: 0,
    maxActiveAutomations: 1,
    features: ['30 one-time welcome credits', '1 active automation', 'Basic automations', 'Execution history', 'No card required'],
  },
  pro_early_access: {
    id: 'pro_early_access',
    name: 'Pro Early Access',
    priceKobo: 350000,
    monthlyCredits: 500,
    maxActiveAutomations: 5,
    features: ['500 credits every month', 'Up to 5 active automations', 'Scheduled automations', 'Connected app support', 'Email notifications'],
    badge: 'Most Popular',
  },
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'credits_100', label: '100 Credits', credits: 100, amountKobo: 70000, description: 'Light top-up for occasional automations' },
  { id: 'credits_500', label: '500 Credits', credits: 500, amountKobo: 250000, description: 'Best value for regular usage' },
  { id: 'credits_1500', label: '1,500 Credits', credits: 1500, amountKobo: 600000, description: 'For creators and small teams' },
  { id: 'credits_5000', label: '5,000 Credits', credits: 5000, amountKobo: 1750000, description: 'High-volume automations' },
]

export function getPlan(id: PlanId | string): Plan {
  return (PLANS[id as PlanId] || PLANS.free)
}

export function getCreditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id)
}

export function formatCurrency(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString()}`
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
