import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, X, ArrowRight, ArrowLeft, Sparkles, Globe, Clock, Calendar, AlertCircle, LoaderCircle, ExternalLink } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { getConnectedApps } from '../../lib/connectors/connectorApi'

const WIZARD_KEY = 'alphatekx:setup-wizard'
const WIZARD_COMPLETED_KEY = 'alphatekx:setup-wizard-done'

const TOPIC_OPTIONS = [
  'My Business / Product',
  'Motivational Content',
  'Educational / Tips',
  'Funny / Memes',
  'Personal Brand',
  'News / Trends',
]

const PLATFORM_DEFS = [
  { id: 'instagram', label: 'Instagram', icon: '📸' },
  { id: 'facebook', label: 'Facebook', icon: '👍' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { id: 'x', label: 'X / Twitter', icon: '🐦' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
]

const TIME_OPTIONS = ['8:00 AM', '12:00 PM', '6:00 PM', '9:00 PM']

const DAY_OPTIONS = [
  { label: 'Everyday', value: 'Everyday', creditsPerWeek: 7 },
  { label: 'Weekdays (Mon-Fri)', value: 'Weekdays (Mon-Fri)', creditsPerWeek: 5 },
  { label: 'Weekends Only', value: 'Weekends Only', creditsPerWeek: 2 },
  { label: 'Mon, Wed, Fri', value: 'Mon, Wed, Fri', creditsPerWeek: 3 },
  { label: 'Tue, Thu', value: 'Tue, Thu', creditsPerWeek: 2 },
]

type WizardData = {
  topic: string
  platforms: string[]
  postTime: string
  postDays: string
}

export default function AutomationSetupWizard({ open, onComplete }: { open: boolean; onComplete: () => void }) {
  const { session, user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<string>>(new Set())
  const [data, setData] = useState<WizardData>(() => {
    try {
      const saved = localStorage.getItem(WIZARD_KEY)
      if (saved) return JSON.parse(saved) as WizardData
    } catch {}
    return { topic: '', platforms: [], postTime: '', postDays: '' }
  })
  const [customTopic, setCustomTopic] = useState('')
  const [customTime, setCustomTime] = useState('')
  const [customDays, setCustomDays] = useState('')
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Save wizard progress to localStorage
  useEffect(() => {
    try { localStorage.setItem(WIZARD_KEY, JSON.stringify(data)) } catch {}
  }, [data])

  // Check connected platforms
  useEffect(() => {
    if (!open || !session?.access_token) return
    const check = async () => {
      try {
        const apps = await getConnectedApps(session.access_token)
        const connected = new Set<string>()
        for (const provider of apps.providers) {
          if (provider.connected) {
            const id = provider.provider === 'twitter' ? 'x' : provider.provider
            connected.add(id)
          }
        }
        setConnectedPlatforms(connected)
      } catch {}
    }
    void check()
  }, [open, session?.access_token])

  const updateData = (partial: Partial<WizardData>) => {
    setData(prev => ({ ...prev, ...partial }))
  }

  const canProceed = () => {
    switch (step) {
      case 0: return data.topic.length > 0
      case 1: return data.platforms.length > 0
      case 2: return data.postTime.length > 0
      case 3: return data.postDays.length > 0
      default: return false
    }
  }

  const handleTopicSelect = (topic: string) => {
    updateData({ topic })
    setCustomTopic('')
    setStep(1)
  }

  const handleCustomTopic = () => {
    if (!customTopic.trim()) return
    updateData({ topic: customTopic.trim() })
    setStep(1)
  }

  const togglePlatform = (id: string) => {
    const current = data.platforms
    const next = current.includes(id) ? current.filter(p => p !== id) : [...current, id]
    updateData({ platforms: next })
  }

  const handlePlatformNext = () => {
    if (data.platforms.length > 0) setStep(2)
  }

  const handleTimeSelect = (time: string) => {
    updateData({ postTime: time })
    setCustomTime('')
    setStep(3)
  }

  const handleCustomTime = () => {
    if (!customTime.trim()) return
    updateData({ postTime: customTime.trim() })
    setStep(3)
  }

  const handleDaySelect = (day: string) => {
    updateData({ postDays: day })
    setCustomDays('')
    setStep(4)
  }

  const handleCustomDays = () => {
    if (!customDays.trim()) return
    updateData({ postDays: customDays.trim() })
    setStep(4)
  }

  const getCreditsPerWeek = () => {
    const option = DAY_OPTIONS.find(d => d.value === data.postDays)
    if (option) return option.creditsPerWeek * Math.max(1, data.platforms.length)
    return Math.max(1, data.platforms.length) * 5
  }

  const handleApprove = async () => {
    if (!user?.id || !session?.access_token) {
      setError('Please sign in to save your automation.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { error: saveError } = await supabase!.from('automations').insert({
        user_id: user.id,
        topic: data.topic,
        platforms: data.platforms,
        post_time: data.postTime,
        post_days: data.postDays,
        timezone: 'Africa/Lagos',
        status: 'active',
      })
      if (saveError) throw saveError
      try { localStorage.setItem(WIZARD_COMPLETED_KEY, '1') } catch {}
      try { localStorage.removeItem(WIZARD_KEY) } catch {}
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save automation.')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    try { localStorage.setItem(WIZARD_COMPLETED_KEY, '1') } catch {}
    onComplete()
  }

  if (!open) return null

  const totalSteps = 4
  const progressPercent = ((step + 1) / totalSteps) * 100
  const showFinalStep = step >= totalSteps

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#0A0F1E]/80 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="relative w-full max-w-lg animate-slide-up rounded-t-2xl border-t border-violet-400/20 bg-[#0A0A0F] p-6 shadow-2xl sm:rounded-t-3xl sm:p-8"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Close button */}
        <button onClick={handleClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-violet-500/10 hover:text-zinc-300">
          <X size={16} />
        </button>

        {!showFinalStep ? (
          <>
            {/* Progress bar */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-violet-300">Step {step + 1} of {totalSteps}</span>
              <span className="text-xs font-semibold text-zinc-500">{Math.round(progressPercent)}%</span>
            </div>
            <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-violet-500/10">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
            </div>

            {/* Step 1: Topic */}
            {step === 0 && (
              <div>
                <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg">
                  <Sparkles size={22} />
                </div>
                <h2 className="mt-3 text-xl font-bold text-white">What do you want to post about?</h2>
                <p className="mt-1 text-sm text-zinc-400">Choose a topic or type your own.</p>

                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  {TOPIC_OPTIONS.map(topic => (
                    <button
                      key={topic}
                      onClick={() => handleTopicSelect(topic)}
                      className={`min-h-[52px] rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                        data.topic === topic
                          ? 'border-indigo-500/50 bg-indigo-500/15 text-white'
                          : 'border-violet-400/15 bg-violet-500/[0.06] text-zinc-300 hover:border-violet-400/30 hover:bg-violet-500/10'
                      }`}
                    >
                      {topic}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <input
                    value={customTopic}
                    onChange={e => setCustomTopic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCustomTopic()}
                    placeholder="Type your own answer... e.g. I sell shoes in Lagos"
                    className="min-h-11 flex-1 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] px-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-indigo-500/50"
                  />
                  <button
                    onClick={handleCustomTopic}
                    disabled={!customTopic.trim()}
                    className="grid min-h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white disabled:opacity-40"
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Platform */}
            {step === 1 && (
              <div>
                <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg">
                  <Globe size={22} />
                </div>
                <h2 className="mt-3 text-xl font-bold text-white">Where should we post it?</h2>
                <p className="mt-1 text-sm text-zinc-400">Select platforms you've connected.</p>

                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  {PLATFORM_DEFS.map(pl => {
                    const isConnected = connectedPlatforms.has(pl.id)
                    const isSelected = data.platforms.includes(pl.id)
                    return (
                      <button
                        key={pl.id}
                        onClick={() => isConnected && togglePlatform(pl.id)}
                        disabled={!isConnected && !isSelected}
                        className={`min-h-[64px] rounded-xl border px-3 py-3 text-left transition-all ${
                          isSelected
                            ? 'border-indigo-500/50 bg-indigo-500/15'
                            : isConnected
                              ? 'border-violet-400/15 bg-violet-500/[0.06] hover:border-violet-400/30 hover:bg-violet-500/10'
                              : 'border-zinc-800 bg-zinc-900/30 opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{pl.icon}</span>
                          <span className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-zinc-300'}`}>{pl.label}</span>
                          {isSelected && <CheckCircle2 size={14} className="ml-auto text-indigo-400" />}
                        </div>
                        {!isConnected && !isSelected && (
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              navigate(`/connected-apps?platform=${pl.id}`)
                              handleClose()
                            }}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300"
                          >
                            <AlertCircle size={11} /> Not connected <ExternalLink size={11} />
                          </button>
                        )}
                        {isConnected && !isSelected && (
                          <p className="mt-1 text-[10px] font-medium text-emerald-400/70">Connected</p>
                        )}
                      </button>
                    )
                  })}
                </div>

                <p className="mt-3 text-[11px] text-zinc-500">Connect more platforms from Settings → Connected Apps</p>

                <div className="mt-5 flex gap-3">
                  <button onClick={() => setStep(0)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] text-sm font-semibold text-zinc-300 hover:bg-violet-500/10">
                    <ArrowLeft size={15} /> Back
                  </button>
                  <button
                    onClick={handlePlatformNext}
                    disabled={data.platforms.length === 0}
                    className="btn-alpha flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Continue <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Time */}
            {step === 2 && (
              <div>
                <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg">
                  <Clock size={22} />
                </div>
                <h2 className="mt-3 text-xl font-bold text-white">What time should we post?</h2>
                <p className="mt-1 text-sm text-zinc-400">Choose a time or type your own.</p>

                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  {TIME_OPTIONS.map(time => (
                    <button
                      key={time}
                      onClick={() => handleTimeSelect(time)}
                      className={`min-h-[52px] rounded-xl border px-3 py-2.5 text-center text-sm font-semibold transition-all ${
                        data.postTime === time
                          ? 'border-indigo-500/50 bg-indigo-500/15 text-white'
                          : 'border-violet-400/15 bg-violet-500/[0.06] text-zinc-300 hover:border-violet-400/30 hover:bg-violet-500/10'
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <input
                    value={customTime}
                    onChange={e => setCustomTime(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCustomTime()}
                    placeholder="Type your own... e.g. 7:30 PM"
                    className="min-h-11 flex-1 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] px-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-indigo-500/50"
                  />
                  <button
                    onClick={handleCustomTime}
                    disabled={!customTime.trim()}
                    className="grid min-h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white disabled:opacity-40"
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>

                <p className="mt-3 text-[11px] text-zinc-500">Time is in Africa/Lagos (WAT, UTC+1)</p>

                <div className="mt-5 flex gap-3">
                  <button onClick={() => setStep(1)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] text-sm font-semibold text-zinc-300 hover:bg-violet-500/10">
                    <ArrowLeft size={15} /> Back
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Days */}
            {step === 3 && (
              <div>
                <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg">
                  <Calendar size={22} />
                </div>
                <h2 className="mt-3 text-xl font-bold text-white">What day(s) should we post?</h2>
                <p className="mt-1 text-sm text-zinc-400">Choose a schedule or type your own.</p>

                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  {DAY_OPTIONS.map(day => (
                    <button
                      key={day.value}
                      onClick={() => handleDaySelect(day.value)}
                      className={`min-h-[52px] rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                        data.postDays === day.value
                          ? 'border-indigo-500/50 bg-indigo-500/15 text-white'
                          : 'border-violet-400/15 bg-violet-500/[0.06] text-zinc-300 hover:border-violet-400/30 hover:bg-violet-500/10'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <input
                    value={customDays}
                    onChange={e => setCustomDays(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCustomDays()}
                    placeholder="Type your own... e.g. Every Monday and Friday"
                    className="min-h-11 flex-1 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] px-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-indigo-500/50"
                  />
                  <button
                    onClick={handleCustomDays}
                    disabled={!customDays.trim()}
                    className="grid min-h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white disabled:opacity-40"
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>

                {/* Credit calculation */}
                {data.postDays && (
                  <div className="mt-4 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] p-3">
                    <p className="text-xs font-semibold text-zinc-400">
                      This will use <span className="text-indigo-300">{getCreditsPerWeek()}</span> credits/week
                      {data.platforms.length > 1 && ` across ${data.platforms.length} platforms`}
                    </p>
                  </div>
                )}

                <div className="mt-5 flex gap-3">
                  <button onClick={() => setStep(2)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] text-sm font-semibold text-zinc-300 hover:bg-violet-500/10">
                    <ArrowLeft size={15} /> Back
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Final Review Step */
          <div>
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-indigo-500 text-white shadow-lg">
              <CheckCircle2 size={22} />
            </div>
            <h2 className="mt-3 text-xl font-bold text-white">Review & Approve</h2>
            <p className="mt-1 text-sm text-zinc-400">Check everything before we start.</p>

            <div className="mt-5 space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-violet-400/15 bg-violet-500/[0.06] px-4 py-3">
                <span className="text-xs font-semibold text-zinc-400">Topic</span>
                <span className="text-sm font-semibold text-white">{data.topic}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-violet-400/15 bg-violet-500/[0.06] px-4 py-3">
                <span className="text-xs font-semibold text-zinc-400">Platforms</span>
                <span className="text-sm font-semibold text-white">{data.platforms.map(p => PLATFORM_DEFS.find(d => d.id === p)?.label || p).join(', ')}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-violet-400/15 bg-violet-500/[0.06] px-4 py-3">
                <span className="text-xs font-semibold text-zinc-400">Time</span>
                <span className="text-sm font-semibold text-white">{data.postTime} (WAT)</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-violet-400/15 bg-violet-500/[0.06] px-4 py-3">
                <span className="text-xs font-semibold text-zinc-400">Days</span>
                <span className="text-sm font-semibold text-white">{data.postDays}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-violet-400/15 bg-violet-500/[0.06] px-4 py-3">
                <span className="text-xs font-semibold text-zinc-400">Credits / Week</span>
                <span className="text-sm font-semibold text-indigo-300">{getCreditsPerWeek()}</span>
              </div>
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(0)} className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] text-sm font-semibold text-zinc-300 hover:bg-violet-500/10">
                <ArrowLeft size={15} /> Edit
              </button>
              <button
                onClick={handleApprove}
                disabled={saving}
                className="btn-alpha flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              >
                {saving ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                {saving ? 'Saving...' : 'Approve & Start Automation'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function useSetupWizard() {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)

  const checkAndOpen = () => {
    if (checked) return
    try {
      const completed = localStorage.getItem(WIZARD_COMPLETED_KEY)
      if (completed === '1') {
        setChecked(true)
        return
      }
      // Show wizard after 1 second delay
      const timer = setTimeout(() => {
        setOpen(true)
        setChecked(true)
      }, 1000)
      return () => clearTimeout(timer)
    } catch {
      setChecked(true)
    }
  }

  const close = () => {
    setOpen(false)
    try { localStorage.setItem(WIZARD_COMPLETED_KEY, '1') } catch {}
  }

  return { open, checkAndOpen, close }
}