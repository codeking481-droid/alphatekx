import { useCallback, useState } from 'react'
import { X, Sparkles, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'

const ONBOARDING_LOCAL_KEY = 'alphatekx:has_seen_onboarding'

function markLocalSeen(userId?: string) {
  try {
    localStorage.setItem(ONBOARDING_LOCAL_KEY, '1')
    if (userId) localStorage.setItem(`${ONBOARDING_LOCAL_KEY}:${userId}`, '1')
  } catch {}
}

export function hasSeenOnboardingLocal(userId?: string): boolean {
  try {
    if (userId && localStorage.getItem(`${ONBOARDING_LOCAL_KEY}:${userId}`) === '1') return true
    return localStorage.getItem(ONBOARDING_LOCAL_KEY) === '1'
  } catch { return false }
}

export async function markOnboardingSeen(userId?: string) {
  markLocalSeen(userId)
  if (!supabase || !userId) return
  try {
    await supabase.from('profiles').update({ has_seen_onboarding: true }).eq('id', userId)
  } catch {}
}

type Props = {
  userId?: string
  onComplete: () => void
  onGetStarted?: () => void
}

export default function OnboardingPopup({ userId, onComplete, onGetStarted }: Props) {
  const [loading, setLoading] = useState(false)

  const handleMarkSeen = useCallback(async () => {
    if (loading) return
    setLoading(true)
    await markOnboardingSeen(userId)
    setLoading(false)
    onComplete()
  }, [loading, userId, onComplete])

  const handleGetStarted = useCallback(async () => {
    if (loading) return
    setLoading(true)
    await markOnboardingSeen(userId)
    setLoading(false)
    onComplete()
    onGetStarted?.()
    // guide user to paste URL — focus input in chat
    setTimeout(() => {
      try {
        const el = document.querySelector('textarea') as HTMLTextAreaElement | null
        el?.focus()
      } catch {}
    }, 300)
  }, [loading, userId, onComplete, onGetStarted])

  const handleSkip = useCallback(async () => {
    await handleMarkSeen()
  }, [handleMarkSeen])

  const handleClose = useCallback(async () => {
    await handleMarkSeen()
  }, [handleMarkSeen])

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-[8px]" role="dialog" aria-modal="true" aria-label="Welcome to AlphaTekX">
      <div className="relative w-[90%] max-w-[560px] rounded-[32px] border-2 border-[#FFD700] bg-[#0B0215] p-8 text-center shadow-[0_0_80px_rgba(255,215,0,0.15)] sm:p-10">
        <button
          onClick={() => void handleClose()}
          aria-label="Close onboarding"
          disabled={loading}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-full border border-white/10 text-white/40 transition hover:border-white/20 hover:text-white disabled:opacity-40"
        >
          <X size={14} />
        </button>

        {/* Premium Illustration */}
        <div className="mx-auto mb-6 grid size-20 place-items-center rounded-[20px] border border-[#FFD700]/20 bg-[#FFD700]/[0.06] shadow-[0_8px_32px_rgba(255,215,0,0.12)]">
          <Sparkles size={32} className="text-[#FFD700]" />
        </div>
        <div className="mx-auto mb-6 h-px w-full max-w-[280px] bg-gradient-to-r from-transparent via-[#FFD700]/20 to-transparent" />

        {/* Bold, readable text */}
        <h1 className="text-[26px] font-black tracking-[-0.03em] text-[#FFD700] sm:text-[30px]">
          Fix your first site in 3 steps
        </h1>
        <p className="mx-auto mt-3 max-w-[420px] text-[15px] font-semibold leading-6 text-white/80">
          Paste your website URL <span className="text-white/30">→</span> Alpha scans <span className="text-white/30">→</span> Click Fix
        </p>
        <p className="mt-2 text-[13px] font-medium text-white/40">World-class restoration. No clutter. Just results.</p>

        {/* Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => void handleGetStarted()}
            disabled={loading}
            className="inline-flex min-h-[48px] min-w-[180px] items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#FFD700] to-[#F59E0B] px-8 text-[15px] font-black text-[#0B0215] shadow-[0_8px_32px_rgba(255,215,0,0.25)] transition hover:scale-[1.02] hover:shadow-[0_12px_48px_rgba(255,215,0,0.4)] disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Get Started'}
            {!loading && <ArrowRight size={16} />}
          </button>
          <button
            onClick={() => void handleSkip()}
            disabled={loading}
            className="inline-flex min-h-[48px] min-w-[180px] items-center justify-center rounded-full border-2 border-white/15 bg-transparent px-8 text-[15px] font-bold text-white/70 transition hover:border-[#FFD700] hover:text-[#FFD700] hover:bg-[#FFD700]/5 disabled:opacity-40"
          >
            Skip
          </button>
        </div>
        <p className="mt-4 text-[11px] font-medium text-white/25">You can reopen this anytime from Help or Settings</p>
      </div>
    </div>
  )
}
