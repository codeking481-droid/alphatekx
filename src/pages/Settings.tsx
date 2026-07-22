import { useEffect, useRef, useState } from 'react'
import { Check, CreditCard, Globe, LoaderCircle, LogOut, Moon, Palette, Receipt, Shield, Sparkles, Trash2, User, Wallet, WalletCards, Zap } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getCredits, hydrateCredits, setCredits as saveCredits, subscribeCredits } from '../lib/creditStore'
import { CREDIT_PACKS, formatCredits, formatCurrency, getPlan, PLANS, type BillingSummary, type CreditPack, type PlanId } from '../lib/billing'
import { initializeCheckout, verifyCheckout } from '../lib/payment'

export default function Settings() {
  const { user, session, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = user?.email?.toLowerCase() === 'iamdan4live@gmail.com'
  const [credits, setCredits] = useState(getCredits())
  const [billing, setBilling] = useState<BillingSummary | null>(null)
  const [loadingBilling, setLoadingBilling] = useState(false)
  const [selectedPack, setSelectedPack] = useState<CreditPack | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null)
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const billingRef = useRef<HTMLElement>(null)

  const authHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {}
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`
    try {
      const raw = localStorage.getItem('alphatekx:local-user')
      if (raw) {
        const u = JSON.parse(raw)
        if (u?.id && u?.email) { h['x-local-user-id'] = String(u.id); h['x-local-user-email'] = String(u.email) }
      }
    } catch {}
    return h
  }

  useEffect(() => subscribeCredits(() => setCredits(getCredits())), [])
  useEffect(() => { void hydrateCredits() }, [user?.id])

  const loadBilling = async () => {
    setLoadingBilling(true)
    try {
      const res = await fetch('/api/billing', { headers: authHeaders() })
      const data = await res.json()
      if (res.ok) {
        const summary: BillingSummary = {
          credits: data.credits,
          plan: data.plan,
          planName: data.planName,
          monthlyCredits: data.monthlyCredits,
          purchasedCredits: data.purchasedCredits,
          monthlyIncluded: data.monthlyIncluded,
          renewalDate: data.renewalDate,
          usageThisMonth: data.usageThisMonth,
          totalCreditsSpent: data.totalCreditsSpent,
          maxActiveAutomations: data.maxActiveAutomations,
          transactions: (data.transactions || []).map((t: Record<string, unknown>) => ({
            id: String(t.id || ''),
            type: String(t.type) as BillingSummary['transactions'][number]['type'],
            creditsAdded: Number(t.credits_added || 0),
            creditsRemoved: Number(t.credits_removed || 0),
            balanceAfter: Number(t.balance_after || 0),
            reference: t.reference ? String(t.reference) : null,
            automationId: t.automation_id ? String(t.automation_id) : null,
            reason: t.reason ? String(t.reason) : null,
            createdAt: String(t.created_at || ''),
          })),
        }
        setBilling(summary)
        setCredits(summary.credits)
      }
    } finally { setLoadingBilling(false) }
  }

  useEffect(() => { void loadBilling() }, [user?.id, notice])

  useEffect(() => {
    const reference = searchParams.get('reference')
    if (!reference) return
    setPending(true)
    setNotice('Verifying payment...')
    verifyCheckout('paystack', reference)
      .then(async () => {
        const res = await fetch('/api/credits/balance', { headers: authHeaders() })
        const creditData = await res.json().catch(() => ({ credits: getCredits() }))
        saveCredits(Number(creditData.credits) || getCredits())
        await refreshProfile()
        await loadBilling()
        setNotice('Payment verified. Your account has been updated.')
        searchParams.delete('reference')
        setSearchParams(searchParams, { replace: true })
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : 'Payment verification failed'))
      .finally(() => setPending(false))
  }, [searchParams, setSearchParams, refreshProfile])

  useEffect(() => {
    if (searchParams.get('tab') === 'billing' && billingRef.current) {
      billingRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      searchParams.delete('tab')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams, billing])

  const currentPlan = billing ? getPlan(billing.plan) : getPlan('free')

  const startCheckout = async () => {
    if (!selectedPack && !selectedPlan) return
    if (selectedPlan === 'free') {
      setPending(true)
      setNotice('Downgrading to Free...')
      try {
        const res = await fetch('/api/billing/upgrade', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ planId: 'free' }) })
        if (!res.ok) throw new Error('Could not change plan')
        await refreshProfile()
        await loadBilling()
        setNotice('You are now on the Free plan.')
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Plan change failed.')
      } finally { setPending(false) }
      return
    }
    setPending(true)
    setNotice('Opening secure checkout...')
    try {
      const item = selectedPlan ? { type: 'subscription' as const, planId: selectedPlan } : { type: 'credits' as const, packId: selectedPack!.id }
      const data = await initializeCheckout('paystack', item)
      if (data.authorization_url) {
        window.location.href = data.authorization_url
        return
      }
      setNotice('Checkout ready. Complete payment in the new tab.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Checkout failed.')
      setPending(false)
    }
  }

  const selectPack = (pack: CreditPack) => { setSelectedPack(pack); setSelectedPlan(null) }
  const selectPlan = (planId: PlanId) => { setSelectedPlan(planId); setSelectedPack(null) }

  const deleteAccount = () => {
    if (!confirm('This will sign you out and clear local data. To permanently delete your account, contact hello@alphatekx.name.ng.')) return
    localStorage.clear()
    void signOut()
    navigate('/')
  }

  const renewalText = billing?.renewalDate ? new Date(billing.renewalDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">Settings</h1>
          <p className="mt-2 text-sm text-white/55">Manage your account, credits, and preferences.</p>
        </div>

        <section className="rounded-2xl border border-white/[.12] bg-white/[0.04] p-6">
          <div className="flex items-center gap-2 text-lg font-semibold"><User size={20} className="text-violet-400"/> Profile</div>
          <div className="mt-4 flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-white/[.08] text-white font-semibold">{(user?.email?.[0] || 'A').toUpperCase()}</span>
            <div>
              <p className="font-medium">{user?.email || 'Guest'}</p>
              <p className="text-sm text-white/55">Signed in securely</p>
            </div>
          </div>
        </section>

        <section ref={billingRef} className="rounded-2xl border border-white/[.12] bg-white/[0.04] p-6">
          <div className="flex items-center gap-2 text-lg font-semibold"><CreditCard size={20} className="text-violet-400"/> Billing & Credits</div>
          <p className="mt-2 text-sm text-white/55">Credits are consumed only when an automation performs work. Costs are always shown before you approve an automation.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Stat label="Current Plan" value={currentPlan.name} sub={currentPlan.badge ? `Most Popular` : undefined} />
            <Stat label="Credit Balance" value={isAdmin ? 'Unlimited' : formatCredits(billing?.credits ?? credits)} />
            <Stat label="Monthly Included" value={billing ? `${billing.monthlyCredits.toLocaleString()} / ${billing.monthlyIncluded.toLocaleString()}` : '—'} />
            <Stat label="Purchased Credits" value={billing ? billing.purchasedCredits.toLocaleString() : '—'} />
            <Stat label="Usage This Month" value={billing ? `${billing.usageThisMonth.toLocaleString()} used` : '—'} />
            <Stat label="Renewal Date" value={renewalText} />
          </div>

          <div className="mt-6">
            <h3 className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-violet-400"/> Upgrade plan</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {Object.values(PLANS).map((plan) => {
                const active = selectedPlan === plan.id || billing?.plan === plan.id
                return (
                  <button key={plan.id} onClick={() => selectPlan(plan.id)} disabled={billing?.plan === plan.id} className={`relative rounded-2xl border p-4 text-left transition-all text-left ${active ? 'border-violet-500 bg-violet-500/10' : 'border-white/[.12] bg-white/[.04] hover:border-white/[.25]'} ${billing?.plan === plan.id ? 'opacity-70' : ''}`}>
                    {plan.badge && <span className="absolute right-3 top-3 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-0.5 text-[10px] font-semibold text-black">{plan.badge}</span>}
                    <span className="font-semibold">{plan.name}</span>
                    <p className="mt-2 text-2xl font-semibold">{plan.priceKobo === 0 ? 'Free' : `${formatCurrency(plan.priceKobo)}/mo`}</p>
                    <ul className="mt-2 space-y-1 text-xs text-white/55">
                      {plan.features.map((f, i) => <li key={i} className="flex items-start gap-1.5"><Check size={12} className="mt-0.5 text-violet-400"/> {f}</li>)}
                    </ul>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="flex items-center gap-2 font-semibold"><Wallet size={16} className="text-violet-400"/> Buy credits</h3>
            <p className="text-sm text-white/55">Purchased credits never expire and are used when your monthly credits run out.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {CREDIT_PACKS.map((pack) => {
                const active = selectedPack?.id === pack.id
                return (
                  <button key={pack.id} onClick={() => selectPack(pack)} className={`relative rounded-2xl border p-4 text-left transition-all ${active ? 'border-violet-500 bg-violet-500/10' : 'border-white/[.12] bg-white/[.04] hover:border-white/[.25]'}`}>
                    {active && <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-black"><Check size={12}/></span>}
                    <span className="flex items-center gap-2 font-semibold"><WalletCards size={16}/>{pack.label}</span>
                    <p className="mt-2 text-2xl font-semibold">{formatCurrency(pack.amountKobo)}</p>
                    <p className="mt-1 text-xs text-white/55">{pack.description}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {notice && <p role="status" className="mt-4 rounded-lg border border-white/[.12] bg-white/[.04] p-3 text-sm">{notice}</p>}

          <button onClick={() => void startCheckout()} disabled={pending || (!selectedPack && !selectedPlan)} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl btn-alpha px-4 text-sm font-medium text-white transition-all disabled:opacity-50">
            {pending ? <LoaderCircle className="animate-spin" size={16}/> : <WalletCards size={16}/>}
            {selectedPlan ? `Upgrade to ${getPlan(selectedPlan).name} — ${formatCurrency(getPlan(selectedPlan).priceKobo)}` : selectedPack ? `Buy ${selectedPack.label} for ${formatCurrency(selectedPack.amountKobo)}` : 'Select a plan or credit pack'}
          </button>

          <div className="mt-6">
            <h3 className="flex items-center gap-2 font-semibold"><Receipt size={16} className="text-violet-400"/> Credit History</h3>
            {loadingBilling ? <p className="mt-3 text-sm text-white/55">Loading...</p> : !billing?.transactions?.length ? <p className="mt-3 text-sm text-white/55">No transactions yet.</p> : (
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
                {billing.transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-xl border border-white/[.12] bg-white/[.04] px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium capitalize">{String(t.type).replace('_', ' ')}</p>
                      <p className="text-xs text-white/55">{t.reason || '—'} • {new Date(t.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${t.creditsAdded ? 'text-emerald-400' : t.creditsRemoved ? 'text-rose-300' : ''}`}>{t.creditsAdded ? `+${t.creditsAdded}` : t.creditsRemoved ? `-${t.creditsRemoved}` : '—'}</p>
                      <p className="text-xs text-white/55">bal {t.balanceAfter.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/[.12] bg-white/[0.04] p-6">
          <div className="flex items-center gap-2 text-lg font-semibold"><Palette size={20} className="text-violet-400"/> Preferences</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Pref label="Timezone" icon={<Globe size={16}/>} value="UTC / Local time" />
            <Pref label="Notifications" icon={<Zap size={16}/>} value="Email when automations fail" />
            <Pref label="Language" icon={<span className="text-xs">EN</span>} value="English" />
            <Pref label="Appearance" icon={<Moon size={16}/>} value="Dark purple" />
          </div>
          <p className="mt-4 text-xs text-white/40">More preference options will be added soon.</p>
        </section>

        <section className="rounded-2xl border border-white/[.12] bg-white/[0.04] p-6">
          <div className="flex items-center gap-2 text-lg font-semibold"><Shield size={20} className="text-violet-400"/> Security</div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/[.12] bg-white/[.04] px-4 py-3">
              <span className="text-sm text-white/70">Connected login method</span>
              <span className="text-sm">Email / Password</span>
            </div>
            <button onClick={() => void signOut()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[.15] px-4 text-sm transition-all hover:border-violet-500 hover:bg-white/[0.04]"><LogOut size={16}/>Sign out</button>
          </div>
          <div className="mt-6 border-t border-white/[.12] pt-6">
            <h3 className="text-rose-400 font-semibold">Danger zone</h3>
            <p className="mt-1 text-sm text-white/55">Permanently delete your account and all data.</p>
            <button onClick={deleteAccount} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 text-sm text-rose-300 transition-all hover:bg-rose-500/20"><Trash2 size={16}/>Delete account</button>
          </div>
        </section>
      </div>
    </div>
  )
}

function Pref({ label, icon, value }: { label: string; icon: React.ReactNode; value: string }) {
  return <div className="flex items-center justify-between rounded-xl border border-white/[.12] bg-white/[.04] px-4 py-3">
    <span className="flex items-center gap-2 text-sm text-white/70">{icon}{label}</span>
    <span className="text-sm">{value}</span>
  </div>
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return <div className="rounded-xl border border-white/[.12] bg-white/[.04] px-4 py-3">
    <p className="text-xs text-white/55">{label}{sub ? <span className="ml-1.5 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300">{sub}</span> : null}</p>
    <p className="mt-1 text-lg font-semibold">{value}</p>
  </div>
}
