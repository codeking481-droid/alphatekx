import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bot, Plus, Rocket, ShoppingBag, Sparkles, TrendingUp } from 'lucide-react'
import OnboardingModal, { useOnboarding } from '../components/OnboardingModal'
import { useAuth } from '../lib/auth'
import { getCreations } from '../lib/missionStore'
import { getJson } from '../lib/apiClient'
import { verifyCheckout } from '../lib/payment'
import { setCredits as saveCredits } from '../lib/creditStore'

export default function Dashboard() {
  const { user, session, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const onboarding = useOnboarding()
  const [showCongrats, setShowCongrats] = useState(false)
  const [showContactBanner, setShowContactBanner] = useState(false)
  const [paymentRef, setPaymentRef] = useState('')
  const [paymentCredits, setPaymentCredits] = useState<number | null>(null)
  const [celebrationTitle, setCelebrationTitle] = useState('Congratulations')
  const [celebrationMessage, setCelebrationMessage] = useState('Payment successful! Credits were added to your account.')
  const [insights, setInsights] = useState<{ id: string; title: string; description: string; severity: string }[]>([])

  useEffect(() => { void getJson<{ predictions: { id: string; title: string; description: string; severity: string }[] }>('/api/brain/predictions').then(d => setInsights(d.predictions || [])).catch(() => {}) }, [])

  useEffect(() => {
    if (!session?.access_token) return
    void fetch('/api/payment/recover', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async response => ({ response, data: await response.json().catch(() => ({})) }))
      .then(async ({ response, data }) => {
        if (!response.ok) throw new Error(data.error || 'Payment recovery failed')
        if (Number(data.recovered) > 0) {
          saveCredits(Number(data.balance) || 0)
          await refreshProfile()
          setPaymentCredits(Number(data.balance) || null)
          setCelebrationTitle('Payment recovered')
          setCelebrationMessage(`Your successful Paystack payment is confirmed. Your balance is now ${Number(data.balance) || 0} credits.`)
          setShowCongrats(true)
        }
      })
      .catch(() => {})
  }, [refreshProfile, session?.access_token, session?.user.id])

  useEffect(() => {
    const pending = (() => {
      try { return JSON.parse(localStorage.getItem('alphatekx:pending-payment') || 'null') } catch { return null }
    })()
    const ref = searchParams.get('reference') || searchParams.get('trxref') || searchParams.get('ref') || pending?.reference || (() => {
      try { return localStorage.getItem('lastRef') || '' } catch { return '' }
    })()

    if (!ref) return

    setPaymentRef(ref)
    setShowContactBanner(false)
    void verifyCheckout('paystack', ref)
      .then(async data => {
        if (data.verified === true) {
          const credited = Number(data.creditsAdded || searchParams.get('credits') || pending?.credits || 0)
          const balance = Number(data.balance ?? data.credits ?? 0)
          const plan = String(data.plan || searchParams.get('plan') || pending?.plan || '')
          setPaymentCredits(credited)
          saveCredits(balance)
          if (plan === 'early_founder_19') {
            setCelebrationTitle('Early Founder Deal Activated')
            setCelebrationMessage(`Congratulations! 🎉 Your ${credited || 500} credits are live and LinkedIn automation is unlocked.`)
          } else {
            setCelebrationTitle('Congratulations')
            setCelebrationMessage(`Payment successful! ${credited ? `${credited.toLocaleString()} credits were added` : 'Your credits were added'}. Your balance is now ${balance.toLocaleString()} credits.`)
          }
          setShowCongrats(true)
          await refreshProfile()
          try { localStorage.removeItem('alphatekx:pending-payment'); localStorage.removeItem('lastRef') } catch {}
          const next = new URLSearchParams(searchParams)
          next.delete('payment'); next.delete('reference'); next.delete('trxref'); next.delete('ref'); next.delete('credits'); next.delete('plan')
          setSearchParams(next, { replace: true })
          return
        }
        setShowContactBanner(true)
      })
      .catch(async () => {
        // A callback can lose its query string on weak mobile networks. The
        // authenticated recovery endpoint independently asks Paystack for the
        // user's recent successful transactions and settles them idempotently.
        if (session?.access_token) {
          try {
            const response = await fetch('/api/payment/recover', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } })
            const recovered = await response.json().catch(() => ({}))
            if (response.ok && Number(recovered.balance) >= 0) {
              const balance = Number(recovered.balance) || 0
              saveCredits(balance)
              await refreshProfile()
              setPaymentCredits(balance)
              setCelebrationTitle(Number(recovered.recovered) > 0 ? 'Payment recovered' : 'Payment checked')
              setCelebrationMessage(`Your Paystack payments were checked securely. Your balance is ${balance.toLocaleString()} credits.`)
              setShowCongrats(true)
              setShowContactBanner(false)
              return
            }
          } catch {}
        }
        setShowContactBanner(true)
      })
  }, [refreshProfile, searchParams, session?.access_token, setSearchParams])

  const creations = getCreations().slice(0, 6)
  const emailFirstName = user?.email ? user.email.split('@')[0].split('.')[0].replace(/^./, c => c.toUpperCase()) : 'Builder'
  const displayName = (user && ('name' in user ? user.name : (user as { user_metadata?: { name?: string } }).user_metadata?.name)) || emailFirstName

  const actions = [
    { label: 'Create an automation', sub: 'Let Alpha work for you', icon: Bot, to: '/automations' },
    { label: 'Review your history', sub: 'See what already ran', icon: TrendingUp, to: '/history' },
    { label: 'Check your brain', sub: 'Memory, goals, insights', icon: Sparkles, to: '/brain' },
    { label: 'Sell something', sub: 'Marketplace or your store', icon: ShoppingBag, to: '/marketplace' },
  ]

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-2 text-sm text-white/55">Hello, {displayName}</div>
        <h1 className="text-2xl font-bold md:text-3xl">What do you want to do today?</h1>
        <p className="mt-1 text-sm text-white/55">Pick one. Alpha handles the rest.</p>

        {(paymentRef || searchParams.get('payment') === 'success' || showContactBanner) && (
          <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">Need help with a payment or credit?</div>
                <p className="mt-1 text-amber-100/80">Send your payment reference and we’ll fix it in under a minute.</p>
              </div>
              <button onClick={() => window.dispatchEvent(new CustomEvent('alphatekx:open-contact-us'))} className="shrink-0 rounded-full bg-[#FFD700] px-3 py-1.5 text-xs font-black text-black">Contact us</button>
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map(a => (
            <button key={a.label} onClick={() => navigate(a.to)} className="group rounded-2xl border border-violet-400/20 bg-violet-500/10 p-5 text-left transition-all hover:border-indigo-500/40 hover:bg-violet-500/10">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg"><a.icon size={20} /></span>
              <h3 className="mt-4 text-base font-semibold">{a.label}</h3>
              <p className="mt-1 text-xs text-zinc-400">{a.sub}</p>
            </button>
          ))}
        </div>

        {insights.length > 0 && (
          <div className="mt-8 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><TrendingUp size={16} className="text-indigo-300"/>Alpha Insights</div>
            <div className="space-y-2">
              {insights.slice(0, 3).map(p => (
                <div key={p.id} className={`rounded-xl border p-3 text-sm ${p.severity === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'}`}>
                  <div className="font-medium">{p.title}</div>
                  <p className="mt-0.5 text-xs opacity-80">{p.description}</p>
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/brain')} className="mt-3 text-xs font-medium text-indigo-300 hover:text-indigo-200">Open Brain →</button>
          </div>
        )}

        {creations.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold">Your projects</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {creations.map(c => (
                <button key={c.id} onClick={() => navigate(`/mission/${c.missionId}`)} className="group rounded-2xl border border-violet-400/20 bg-violet-500/10 p-5 text-left transition-all hover:border-indigo-400/30 hover:bg-violet-500/10">
                  <h3 className="text-base font-semibold text-zinc-100">{c.title || 'Untitled project'}</h3>
                  <p className="mt-1 truncate text-sm text-slate-400">{c.slug ? `${c.slug}.alphatekx.name.ng` : 'Draft'}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {creations.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-violet-400/20 p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-violet-500/10"><Plus size={22} className="text-zinc-400" /></div>
            <h3 className="mt-3 text-base font-semibold">No automations yet</h3>
            <p className="mt-1 text-sm text-zinc-400">Create your first automation and let Alpha handle it for you.</p>
            <button onClick={() => navigate('/automations')} className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"><Plus size={16} /> Start automating</button>
          </div>
        )}
      </div>
      <OnboardingModal open={onboarding.open} onComplete={onboarding.finish} onClose={onboarding.close} />
      {showCongrats && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 px-4">
          <div className="mx-auto w-full max-w-lg rounded-[24px] border border-[#24242A] bg-[#151519] p-8 text-center shadow-2xl">
            <div className="text-4xl">🎉🎉🎉🎉</div>
            <h2 className="mt-4 text-2xl font-bold text-white">{celebrationTitle}</h2>
            <p className="mt-2 text-sm text-white/75">{celebrationMessage}</p>
            <p className="mt-2 text-xs text-white/40">Ref: {paymentRef || 'pending verification'}</p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => { setShowCongrats(false); setShowContactBanner(false); navigate('/dashboard', { replace: true }) }} className="rounded-full bg-[#FFD700] px-4 py-2 font-semibold text-black">Continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
