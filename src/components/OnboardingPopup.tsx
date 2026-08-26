import { useCallback, useState } from 'react'
import { X, ArrowRight, Globe, Search, Wrench } from 'lucide-react'
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
    setTimeout(() => {
      try {
        const el = document.querySelector('textarea') as HTMLTextAreaElement | null
        el?.focus()
      } catch {}
    }, 300)
  }, [loading, userId, onComplete, onGetStarted])

  const handleClose = useCallback(async () => {
    await handleMarkSeen()
  }, [handleMarkSeen])

  return (
    <div className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm lg:items-center lg:bg-black/70 lg:p-6" role="dialog" aria-modal="true" aria-label="Welcome to AlphaTekX">
      {/* Mobile: full height sheet from top to bottom, Desktop: centered tall card */}
      <div className="flex h-[96dvh] max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-white/[0.06] bg-[#0B0215] shadow-[0_8px_40px_rgba(0,0,0,0.35)] lg:h-[86dvh] lg:max-h-[780px] lg:max-w-[440px] lg:rounded-[24px] lg:border lg:shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
        {/* Close */}
        <button
          onClick={() => void handleClose()}
          aria-label="Close onboarding"
          disabled={loading}
          className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-full bg-black/40 text-white/70 backdrop-blur transition hover:bg-black/60 hover:text-white disabled:opacity-40 lg:bg-white/10"
        >
          <X size={16} />
        </button>

        {/* Real tech image on top — from top to down, covers ~45% */}
        <div className="relative h-[42%] min-h-[220px] w-full shrink-0 overflow-hidden bg-[#070A14] lg:h-[44%]">
          {/* Tech gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0f1a3a] via-[#101e3a] to-[#0a1f2e]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.15),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(168,85,247,0.12),transparent_55%)]" />
          {/* Subtle grid */}
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.25) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          {/* Browser mock — real tech */}
          <div className="absolute inset-0 flex items-center justify-center p-6 lg:p-8">
            <div className="w-full max-w-[320px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0f172a] shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
              {/* Browser header */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
                <span className="size-2.5 rounded-full bg-red-400/80" />
                <span className="size-2.5 rounded-full bg-yellow-400/80" />
                <span className="size-2.5 rounded-full bg-green-400/80" />
                <span className="ml-3 flex-1 truncate rounded-full bg-black/30 px-3 py-1 text-[11px] font-medium text-white/40">https://yoursite.com</span>
              </div>
              {/* Content scan lines */}
              <div className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-emerald-500/20 grid place-items-center">
                    <Search size={14} className="text-emerald-400" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="h-2 w-[70%] rounded-full bg-white/80" />
                    <div className="h-2 w-[45%] rounded-full bg-white/20" />
                  </div>
                  <span className="rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-bold text-white">Scanning</span>
                </div>
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-white/10">
                      <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" />
                    </div>
                    <span className="text-[11px] font-bold text-emerald-300">72%</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-2 text-center">
                      <Wrench size={14} className="mx-auto text-emerald-400" />
                      <p className="mt-1 text-[10px] font-bold text-white">Fixing</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-center">
                      <Globe size={14} className="mx-auto text-white/40" />
                      <p className="mt-1 text-[10px] font-medium text-white/60">Verified</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-center">
                      <Search size={14} className="mx-auto text-white/40" />
                      <p className="mt-1 text-[10px] font-medium text-white/60">Secure</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Bottom fade */}
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0B0215] to-transparent" />
        </div>

        {/* Content — remaining part, scrollable, from top to down */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex-1 px-6 py-6 lg:px-7 lg:py-7">
            <h1 className="text-[22px] font-black leading-tight tracking-[-0.02em] text-white lg:text-[24px]">
              Fix your first site in 3 steps
            </h1>
            <p className="mt-3 text-[14px] font-medium leading-6 text-white/60">
              Paste your website URL and Alpha does the rest — scanning every page, finding every issue, and fixing it for you.
            </p>

            {/* 3 steps — classic, trustworthy */}
            <div className="mt-6 space-y-4">
              <div className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-[13px] font-black text-white">1</span>
                <div>
                  <p className="text-[14px] font-bold text-white">Paste your website URL</p>
                  <p className="mt-1 text-[13px] leading-5 text-white/50">Copy any link — your store, portfolio, or blog — and drop it in chat.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-[13px] font-black text-white">2</span>
                <div>
                  <p className="text-[14px] font-bold text-white">Alpha scans everything</p>
                  <p className="mt-1 text-[13px] leading-5 text-white/50">Every page, image, and link — you get a clear Green Card with what to fix and why.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-[13px] font-black text-white">3</span>
                <div>
                  <p className="text-[14px] font-bold text-white">Click Fix and verify</p>
                  <p className="mt-1 text-[13px] leading-5 text-white/50">Download the fixed code or push to GitHub, then click Verify to confirm it is live.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions — classic one primary + one secondary */}
          <div className="border-t border-white/[0.06] bg-white/[0.02] p-6 lg:p-7">
            <button
              onClick={() => void handleGetStarted()}
              disabled={loading}
              className="flex h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-white px-6 text-[15px] font-bold text-black shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition hover:bg-white/90 disabled:opacity-50"
            >
              {loading ? 'Loading' : 'Get Started'}
              {!loading && <ArrowRight size={16} />}
            </button>
            <button
              onClick={() => void handleClose()}
              disabled={loading}
              className="mt-3 flex h-[44px] w-full items-center justify-center rounded-xl border border-white/10 bg-transparent px-6 text-[14px] font-semibold text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-40"
            >
              Skip for now
            </button>
            <p className="mt-3 text-center text-[11px] font-medium text-white/25">You can reopen this from Settings and Help anytime</p>
          </div>
        </div>
      </div>
    </div>
  )
}
