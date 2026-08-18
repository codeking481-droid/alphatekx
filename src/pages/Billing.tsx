import { useEffect, useState } from 'react'
import { ArrowLeft, Check, CreditCard, Crown, Zap, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type Plan = { id: string; name: string; price: number; credits: number; features: string[]; recommended?: boolean }

const PLANS: Plan[] = [
  { id: 'free', name: 'Starter', price: 0, credits: 10, features: ['10 repairs/month', 'Website Resurrector', 'Basic chat support'] },
  { id: 'pro', name: 'Pro', price: 29, credits: 100, features: ['100 repairs/month', 'All Resurrectors', 'Priority support', 'Video restoration'], recommended: true },
  { id: 'enterprise', name: 'Enterprise', price: 99, credits: 500, features: ['500 repairs/month', 'All Resurrectors', 'Dedicated support', 'Custom integrations', 'SLA guarantee'] },
]

export default function Billing() {
  const { user, profile } = useAuth()
  const [currentPlan, setCurrentPlan] = useState<string>(profile?.plan || 'free')
  const [credits, setCredits] = useState<number>(profile?.credits ?? 10)

  useEffect(() => {
    if (profile) {
      setCurrentPlan(profile.plan || 'free')
      setCredits(profile.credits ?? 10)
    }
  }, [profile])

  const handleUpgrade = async (planId: string) => {
    if (!user) return
    try {
      const { data: { session } } = await supabase?.auth.getSession() ?? { data: { session: null } }
      const token = session?.access_token
      const res = await fetch('/api/alpha/billing/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan: planId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.checkoutUrl) {
        window.open(data.checkoutUrl, '_blank')
      } else if (res.ok) {
        setCurrentPlan(planId)
        const plan = PLANS.find(p => p.id === planId)
        if (plan) setCredits(plan.credits)
      }
    } catch {}
  }

  return (
    <main className="mx-auto min-h-[calc(100dvh-4rem)] w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link to="/chat" className="mb-6 inline-flex items-center gap-2 text-sm text-white/40 transition hover:text-white/70">
        <ArrowLeft size={14} />
        Back to chat
      </Link>

      <header className="mb-10">
        <p className="text-xs uppercase tracking-[.2em] text-[#D6FF00]">Billing</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Manage your plan</h1>
        <p className="mt-2 text-sm text-white/50">
          {credits} credits remaining on <span className="font-semibold text-white/70 capitalize">{currentPlan}</span> plan
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const isActive = currentPlan === plan.id
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-6 transition ${
                isActive
                  ? 'border-[#D6FF00]/30 bg-[#D6FF00]/[0.04]'
                  : plan.recommended
                  ? 'border-[#FFD700]/25 bg-[#FFD700]/[0.03]'
                  : 'border-white/[0.06] bg-white/[0.02]'
              }`}
            >
              {plan.recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#FFD700]/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#FFD700]">
                  Recommended
                </div>
              )}

              <div className="mb-4 flex items-center gap-2">
                {plan.id === 'enterprise' ? (
                  <Crown size={18} className="text-[#FFD700]" />
                ) : plan.id === 'pro' ? (
                  <Zap size={18} className="text-[#D6FF00]" />
                ) : (
                  <CreditCard size={18} className="text-white/30" />
                )}
                <h3 className="font-bold text-white">{plan.name}</h3>
              </div>

              <div className="mb-4">
                <span className="text-3xl font-black text-white">${plan.price}</span>
                <span className="text-sm text-white/30">/month</span>
              </div>

              <p className="mb-4 text-xs text-white/40">{plan.credits} credits/month</p>

              <ul className="mb-6 flex-1 space-y-2">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-white/50">
                    <Check size={12} className="mt-0.5 shrink-0 text-[#D6FF00]" />
                    {feature}
                  </li>
                ))}
              </ul>

              {isActive ? (
                <div className="rounded-xl border border-[#D6FF00]/20 bg-[#D6FF00]/[0.06] py-2.5 text-center text-[12px] font-bold text-[#D6FF00]">
                  Current Plan
                </div>
              ) : (
                <button
                  onClick={() => void handleUpgrade(plan.id)}
                  className={`rounded-xl py-2.5 text-[12px] font-bold transition ${
                    plan.recommended
                      ? 'bg-[#D6FF00] text-black hover:bg-[#C2E600]'
                      : 'border border-white/[0.08] bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
                  }`}
                >
                  Upgrade to {plan.name}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <h3 className="mb-3 font-bold text-white">Usage History</h3>
        <p className="text-sm text-white/40">Credit usage and billing history will appear here.</p>
      </div>
    </main>
  )
}
