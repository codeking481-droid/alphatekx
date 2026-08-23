import { useEffect, useState } from 'react'
import { ArrowLeft, Check, CreditCard, Crown, Zap, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import PlanBadge, { PLAN_LABELS } from '../components/PlanBadge'

type Plan = { id: string; packId: string; name: string; price: number; credits: number; features: string[]; recommended?: boolean }

const PLANS: Plan[] = [
  { id: 'lite_9', packId: 'lite_9', name: 'Lite', price: 9, credits: 150, features: ['1 site', '5 fixes / month', 'Scan + report + full heal'] },
  { id: 'video_19', packId: 'video_19', name: 'Starter', price: 19, credits: 400, features: ['3 sites', '15 fixes / month', '10 App Scans + Reports', '3 Video Restorations'] },
  { id: 'video_49', packId: 'video_49', name: 'Pro', price: 49, credits: 800, features: ['10 sites', 'Unlimited fixes', '50 Full App Restorations', '25 Video Restorations'], recommended: true },
  { id: 'video_99', packId: 'video_99', name: 'Business', price: 99, credits: 1200, features: ['25 sites', 'Priority healing queue', 'Unlimited Restorations', 'All video styles'] },
  { id: 'enterprise_199', packId: 'enterprise_199', name: 'Enterprise', price: 199, credits: 5000, features: ['Unlimited sites & fixes', 'Everything unlocked', 'Priority queue + API access', 'White-label reports'] },
]

export default function Billing() {
  const { user, profile, refreshProfile } = useAuth()
  const [currentPlan, setCurrentPlan] = useState<string>(profile?.plan || 'free')
  const [credits, setCredits] = useState<number>(profile?.credits ?? 10)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [paidConfirmation, setPaidConfirmation] = useState<{ plan: string; amountUsd: number; reference: string } | null>(null)
  const [confirmingPayment, setConfirmingPayment] = useState(false)

  useEffect(() => {
    if (profile) {
      setCurrentPlan(profile.plan || 'free')
      setCredits(profile.credits ?? 10)
    }
  }, [profile])

  // Payment just returned from Paystack — confirm it and SHOW what was paid for.
  useEffect(() => {
    let cancelled = false
    let raw: string | null = null
    try { raw = localStorage.getItem('alphatekx:pending-payment') } catch {}
    if (!raw) return
    let pending: { reference?: string; planId?: string; amountKobo?: number }
    try { pending = JSON.parse(raw) } catch { return }
    if (!pending?.reference) return

    setConfirmingPayment(true)
    ;(async () => {
      try {
        const { data: { session } } = await supabase?.auth.getSession() ?? { data: { session: null } }
        const res = await fetch('/api/paystack/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ reference: pending.reference, plan: pending.planId, amount: pending.amountKobo }),
        })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && (data?.success ?? true)) {
          setPaidConfirmation({
            plan: String(pending.planId || ''),
            amountUsd: Number(pending.amountKobo || 0) / 100,
            reference: String(pending.reference),
          })
          try { localStorage.setItem('alphatekx_plan', String(pending.planId || 'free')) } catch {}
        }
      } catch {} finally {
        try { localStorage.removeItem('alphatekx:pending-payment') } catch {}
        if (!cancelled) {
          setConfirmingPayment(false)
          refreshProfile?.()
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpgrade = async (plan: Plan) => {
    if (!user) return
    setLoadingPlan(plan.id)
    try {
      let email = user.email || ''
      if (!email) {
        const { data: { session } } = await supabase?.auth.getSession() ?? { data: { session: null } }
        email = session?.user?.email || ''
      }
      if (!email) {
        const prompted = window.prompt('Enter your email for Paystack checkout:')
        if (!prompted?.trim()) { setLoadingPlan(null); return }
        email = prompted.trim()
      }

      const { data: { session } } = await supabase?.auth.getSession() ?? { data: { session: null } }
      const token = session?.access_token

      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email,
          type: 'subscription',
          planId: plan.packId,
          callback_url: 'https://alphatekx.name.ng/dashboard',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Payment initialization failed')

      const authUrl = String(data.authorization_url || '')
      if (authUrl) {
        localStorage.setItem('alphatekx:pending-payment', JSON.stringify({
          reference: data.reference,
          email,
          planId: plan.packId,
          credits: plan.credits,
          amountKobo: plan.price * 100,
          createdAt: Date.now(),
        }))
        window.location.assign(authUrl)
      }
    } catch (err: any) {
      alert(err?.message || 'Payment failed. Please try again.')
    } finally {
      setLoadingPlan(null)
    }
  }

  return (
    <main className="mx-auto min-h-[calc(100dvh-4rem)] w-full max-w-6xl px-4 py-10 sm:px-6">
      <Link to="/chat" className="mb-6 inline-flex items-center gap-2 text-sm text-white/40 transition hover:text-white/70">
        <ArrowLeft size={14} />
        Back to chat
      </Link>

      <header className="mb-10">
        <p className="text-xs uppercase tracking-[.2em] text-[#D6FF00]">Billing</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Manage your plan</h1>
        <p className="mt-2 text-sm text-white/50">
          You&apos;re on the <span className="font-semibold text-white/70 capitalize">{currentPlan}</span> plan
        </p>
      </header>

      {confirmingPayment && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-white/60">
          <Loader2 size={15} className="animate-spin text-[#D6FF00]" />
          Confirming your payment…
        </div>
      )}

      {paidConfirmation && (
        <div className="mb-8 overflow-hidden rounded-2xl border border-[#FFD700]/40 bg-gradient-to-br from-[#FFD700]/[0.12] via-[#FFD700]/[0.04] to-transparent p-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-[#FFD700] to-[#D4A017] text-black shadow-[0_0_24px_rgba(255,215,0,.45)]">
              <Crown size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-black text-white">
                Payment confirmed — welcome to {PLAN_LABELS[paidConfirmation.plan] || paidConfirmation.plan}
                <PlanBadge plan={paidConfirmation.plan} />
              </p>
              <p className="mt-1 break-all text-sm text-white/60">
                You paid ${paidConfirmation.amountUsd} (ref {paidConfirmation.reference.slice(0, 22)}…) — your golden badge is now live next to your name.
              </p>
            </div>
            <Check size={20} className="shrink-0 text-emerald-300" />
          </div>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {PLANS.map((plan) => {
          const isActive = currentPlan === plan.id
          const isLoading = loadingPlan === plan.id
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
                  Most Popular
                </div>
              )}

              <div className="mb-4 flex items-center gap-2">
                {plan.id === 'enterprise_199' ? (
                  <Crown size={18} className="text-[#FFD700]" />
                ) : plan.id === 'video_49' ? (
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
                  onClick={() => void handleUpgrade(plan)}
                  disabled={isLoading}
                  className={`rounded-xl py-2.5 text-[12px] font-bold transition disabled:opacity-50 ${
                    plan.recommended
                      ? 'bg-[#D6FF00] text-black hover:bg-[#C2E600]'
                      : 'border border-white/[0.08] bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
                  }`}
                >
                  {isLoading ? (
                    <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Redirecting...</span>
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
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
