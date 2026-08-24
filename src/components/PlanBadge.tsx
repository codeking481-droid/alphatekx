import { Crown } from 'lucide-react'

export const PLAN_LABELS: Record<string, string> = {
  free: 'FREE',
  lite_9: 'STARTER',
  video_19: 'LITE',
  video_49: 'PRO',
  video_99: 'BUSINESS',
  enterprise_199: 'ENTERPRISE',
}

const GOLD_PLANS = new Set(['video_49', 'video_99', 'enterprise_199'])

/** Golden plan badge — sits next to the user's name once they pay. */
export default function PlanBadge({ plan, size = 'sm' }: { plan?: string; size?: 'sm' | 'md' }) {
  const key = String(plan || 'free').toLowerCase()
  if (!key || key === 'free') return null
  const label = PLAN_LABELS[key] || key.toUpperCase()
  const gold = GOLD_PLANS.has(key)
  const pad = size === 'md' ? 'px-2.5 py-1 text-[10px]' : 'px-2 py-0.5 text-[9px]'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-black uppercase tracking-widest ${pad} ${
        gold
          ? 'bg-gradient-to-r from-[#FFD700] via-[#F5C518] to-[#D4A017] text-black shadow-[0_0_14px_rgba(255,215,0,.45)]'
          : 'border border-white/15 bg-white/[0.06] text-white/60'
      }`}
      title={`${label} plan member`}
    >
      {gold && <Crown size={size === 'md' ? 11 : 9} />}
      {label}
    </span>
  )
}
