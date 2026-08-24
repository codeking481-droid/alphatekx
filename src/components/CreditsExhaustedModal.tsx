import { X, Zap } from 'lucide-react'
import { initializeCheckout } from '../lib/payment'

type Props = {
  open: boolean
  onClose: () => void
}

export default function CreditsExhaustedModal({ open, onClose }: Props) {
  if (!open) return null

  const handlePurchase = async (planId: string) => {
    try {
      const data = await initializeCheckout('paystack', { type: 'subscription', planId: planId as any })
      if (data.authorization_url) {
        window.location.href = data.authorization_url
      }
    } catch (error) {
      console.error('Payment failed:', error)
      alert(error instanceof Error ? error.message : 'Payment failed. Please try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0F1E]/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-violet-400/20 bg-[#1A1A1A] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid size-10 place-items-center rounded-lg bg-amber-500/20">
              <Zap size={20} className="text-amber-300" />
            </div>
            <h3 className="text-lg font-semibold text-white">Credits Exhausted</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-white/50 hover:bg-violet-500/10" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-white/70 mb-6">You've used your free credit. Choose a plan to continue using the platform and unlock more features.</p>
        
        <div className="space-y-3">
          <button
            onClick={() => handlePurchase('lite_9')}
            className="w-full rounded-xl bg-slate-500/20 border border-slate-400/30 hover:border-slate-400/60 px-4 py-3 text-left transition-all"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-white">Starter Plan</span>
              <span className="text-lg font-bold text-[#FFD700]">$9</span>
            </div>
            <p className="text-xs text-white/60">1 site · 5 fixes/month</p>
          </button>

          <button
            onClick={() => handlePurchase('video_19')}
            className="w-full rounded-xl bg-indigo-500/20 border border-indigo-400/30 hover:border-indigo-400/60 px-4 py-3 text-left transition-all"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-white">Lite Plan</span>
              <span className="text-lg font-bold text-[#FFD700]">$19</span>
            </div>
            <p className="text-xs text-white/60">3 sites · 15 fixes/month + 3 videos (max 5 mins)</p>
          </button>

          <button
            onClick={() => handlePurchase('video_49')}
            className="w-full rounded-xl bg-purple-500/30 border border-purple-400/50 hover:border-purple-400/80 px-4 py-3 text-left transition-all relative"
          >
            <div className="absolute -top-2 right-3 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-0.5 text-[10px] font-semibold text-white">
              Most Popular
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-white">Pro Plan</span>
              <span className="text-lg font-bold text-[#FFD700]">$49</span>
            </div>
            <p className="text-xs text-white/60">10 sites · Unlimited fixes + 25 videos (max 8 mins)</p>
          </button>

          <button
            onClick={() => handlePurchase('video_99')}
            className="w-full rounded-xl bg-cyan-500/20 border border-cyan-400/30 hover:border-cyan-400/60 px-4 py-3 text-left transition-all"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-white">Business Plan</span>
              <span className="text-lg font-bold text-[#FFD700]">$99</span>
            </div>
            <p className="text-xs text-white/60">25 sites · Priority queue · unlimited fixes + videos</p>
          </button>

          <button
            onClick={() => handlePurchase('enterprise_199')}
            className="w-full rounded-xl bg-amber-500/20 border border-amber-400/30 hover:border-amber-400/60 px-4 py-3 text-left transition-all"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-white">Enterprise Plan</span>
              <span className="text-lg font-bold text-[#FFD700]">$199</span>
            </div>
            <p className="text-xs text-white/60">Unlimited sites & fixes · everything unlocked</p>
          </button>
        </div>

        <button 
          onClick={onClose}
          className="mt-6 w-full rounded-xl border border-white/20 px-4 py-3 text-sm font-medium text-white/70 hover:text-white transition-all"
        >
          Maybe Later
        </button>
      </div>
    </div>
  )
}
