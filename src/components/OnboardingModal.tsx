import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Rocket, Plug, Globe, X, ArrowRight, Sparkles } from 'lucide-react'

const ONBOARDED_KEY = 'alphatekx:onboarded'

const steps = [
  {
    icon: Sparkles,
    title: 'Welcome to AlphaTekX',
    body: 'Build real apps and websites just by describing them. Alpha plans, designs, codes and deploys for you.',
    cta: 'Next',
  },
  {
    icon: Rocket,
    title: 'Create your first project',
    body: 'Go to the Builder and type what you want — a calculator, a shop, a course platform or a portfolio.',
    cta: 'Start building',
    link: '/builder',
  },
  {
    icon: Plug,
    title: 'Connect your platforms',
    body: 'Link Telegram, Discord, Slack, LinkedIn or Gmail so Alpha can post, send emails and run automations for real.',
    cta: 'Connect apps',
    link: '/connectors',
  },
  {
    icon: Globe,
    title: 'Deploy in one click',
    body: 'When your app is ready, hit Publish to get a live URL you can share instantly.',
    cta: 'Open dashboard',
    link: '/dashboard',
  },
]

export function useOnboarding() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(ONBOARDED_KEY) !== '1' } catch { return true }
  })
  const finish = () => {
    try { localStorage.setItem(ONBOARDED_KEY, '1') } catch {}
    setOpen(false)
  }
  return { open, finish, close: () => setOpen(false) }
}

export default function OnboardingModal({ open, onComplete, onClose }: { open: boolean; onComplete: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const current = steps[step]

  const next = () => {
    if (current.link && step > 0) {
      onComplete()
      navigate(current.link)
      return
    }
    if (step < steps.length - 1) setStep(s => s + 1)
    else onComplete()
  }

  const Icon = current.icon

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.12] bg-background p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {steps.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= step ? 'bg-gradient-to-r from-indigo-500 to-pink-500' : 'bg-white/10'}`} style={{ width: 40 }} />
            ))}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 hover:bg-white/10"><X size={16} /></button>
        </div>

        <div className="mt-8 flex flex-col items-center text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg"><Icon size={28} /></div>
          <h2 className="mt-6 text-2xl font-bold">{current.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">{current.body}</p>
        </div>

        <div className="mt-8 flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep(s => Math.max(0, s - 1))} className="flex flex-1 min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-zinc-300 transition-all hover:bg-white/[0.08]">
              Back
            </button>
          )}
          <button onClick={next} className="btn-alpha flex flex-1 min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white">
            {current.cta} <ArrowRight size={16} />
          </button>
        </div>

        <button onClick={onComplete} className="mt-4 w-full text-xs text-zinc-500 hover:text-zinc-300">
          Skip onboarding
        </button>
      </div>
    </div>
  )
}
