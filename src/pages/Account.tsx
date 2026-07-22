import { useEffect, useState, type ReactNode } from 'react'
import { Check, CreditCard, LoaderCircle, LogOut, ShieldCheck, Trash2, WalletCards, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { clearAllHistory } from '../lib/missionStore'
import { getCredits, hydrateCredits, subscribeCredits } from '../lib/creditStore'
import { getCurrentPlan, initiatePaystackPack, PACKS, type PaymentPack } from '../lib/paystack'

export default function Account() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.email?.toLowerCase() === 'iamdan4live@gmail.com'
  const [credits, setCredits] = useState(getCredits())
  const [plan, setPlan] = useState(getCurrentPlan())
  const [selectedPack, setSelectedPack] = useState<PaymentPack | null>(null)
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const listener = () => { setCredits(getCredits()); setPlan(getCurrentPlan()) }
    const unsubscribe = subscribeCredits(listener)
    window.addEventListener('storage', listener)
    return () => { unsubscribe(); window.removeEventListener('storage', listener) }
  }, [])

  useEffect(() => { if (profile?.credits != null) setCredits(Number(profile.credits)) }, [profile?.credits])
  useEffect(() => { void hydrateCredits() }, [user?.id])

  const buy = async () => {
    if (!selectedPack) return
    setPending(true)
    setNotice('Opening secure Paystack checkout...')
    try {
      const result = await initiatePaystackPack(selectedPack)
      setPlan(result.plan)
      await hydrateCredits()
      setCredits(getCredits())
      setNotice(`Payment verified. You bought ${selectedPack.label}.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Payment failed.')
    } finally {
      setPending(false)
    }
  }

  return <div className="min-h-screen px-5 py-8 md:px-10"><div className="mx-auto max-w-3xl">
    <h1 className="text-2xl font-semibold md:text-3xl">Account</h1>
    <p className="mt-2 text-sm text-white/55">Manage your AlphaTekX profile, credits and plan.</p>

    <div className="mt-6 rounded-2xl border border-white/[.12] liquid-glass p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-white/[.08]"><ShieldCheck size={21}/></span>
        <div>
          <p className="font-semibold">{user?.email || 'Guest'}</p>
          <p className="text-sm text-white/55">Signed in securely</p>
        </div>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Current credits" value={isAdmin ? 'Unlimited' : String(credits)} icon={<CreditCard size={16}/>}/>
        <Stat label="Plan" value={isAdmin ? 'admin' : plan} icon={<ShieldCheck size={16}/>}/>
        <Stat label="Revenue" value={`NGN ${Number(profile?.revenue ?? 0).toLocaleString()}`} icon={<WalletCards size={16}/>}/>
      </dl>

      <h2 className="mt-8 text-lg font-semibold">Top up</h2>
      <p className="mt-1 text-sm text-white/55">Select a pack and pay securely with Paystack.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {PACKS.map(pack => {
          const active = selectedPack?.id === pack.id
          const naira = `₦${(pack.amountKobo / 100).toLocaleString()}`
          const isBooster = pack.id === 'credits'
          return <button key={pack.id} onClick={() => setSelectedPack(pack)} className={`relative rounded-2xl border p-4 text-left transition-all ${active ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/[.12] bg-white/[.04] hover:border-white/[.25]'}`}>
            {active && <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 text-black"><Check size={12}/></span>}
            <span className="flex items-center gap-2 font-semibold">{isBooster ? <Zap size={16}/> : <WalletCards size={16}/>}{pack.label}</span>
            <p className="mt-2 text-2xl font-semibold">{naira}</p>
            <p className="mt-1 text-xs text-white/55">{isBooster ? `${pack.credits} credits` : pack.id === 'pro' ? 'Unlimited generations' : `${pack.credits} credits`}</p>
          </button>
        })}
      </div>

      {notice && <p role="status" className="mt-5 rounded-lg border border-white/[.12] bg-white/[.04] p-3 text-sm">{notice}</p>}

      <button onClick={() => void buy()} disabled={pending || !selectedPack} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl btn-alpha px-4 text-sm font-medium text-white transition-all disabled:opacity-50">
        {pending ? <LoaderCircle className="animate-spin" size={16}/> : <WalletCards size={16}/>} {selectedPack ? `Pay ${`₦${(selectedPack.amountKobo / 100).toLocaleString()}`} for ${selectedPack.label}` : 'Select a pack to pay'}
      </button>

      <button onClick={() => void signOut()} className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[.15] px-4 text-sm transition-all hover:border-indigo-500 hover:bg-white/[0.04]"><LogOut size={16}/>Sign out</button>

      <div className="mt-8 border-t border-white/[.12] pt-6">
        <h2 className="text-lg font-semibold text-rose-400">Danger zone</h2>
        <p className="mt-1 text-sm text-white/55">Permanently delete all missions, creations and marketplace history from this device and the cloud.</p>
        <button onClick={async () => { if (confirm('Delete all history? This cannot be undone.')) { await clearAllHistory(); setNotice('All history cleared.'); navigate('/workspace') } }} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 text-sm text-rose-300 transition-all hover:bg-rose-500/20"><Trash2 size={16}/>Clear all history</button>
      </div>
    </div>
  </div></div>
}

function Stat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <div className="rounded-xl border border-white/[.12] bg-white/[.04] p-4">
    <dt className="flex items-center gap-2 text-xs text-white/55">{icon}{label}</dt>
    <dd className="mt-2 text-2xl font-semibold capitalize">{value}</dd>
  </div>
}
