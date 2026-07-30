import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaFacebook, FaInstagram, FaLinkedin, FaXTwitter, FaTiktok } from 'react-icons/fa6'
import { CheckCircle2, ArrowRight, ArrowLeft, Sparkles, Clock, Target, Users, Image, AlertCircle, LoaderCircle, CreditCard, RefreshCw, Zap } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { getConnectedApps } from '../../lib/connectors/connectorApi'
import { getCredits, hydrateCredits } from '../../lib/creditStore'

const WIZARD_KEY = 'alphatekx:mature-wizard'
const WIZARD_DONE_KEY = 'alphatekx:mature-wizard-done'
const CONNECTED_CACHE_KEY = 'alphatekx:connected-platforms'

const TOPIC_OPTIONS = ['My Business / Product', 'Personal Brand', 'Educational', 'Motivational', 'Tech News', 'Memes / Funny']
const GOAL_OPTIONS = ['Get more customers', 'Build followers', 'Go viral', 'Educate audience', 'Drive website traffic', 'Get leads']
const TONE_OPTIONS = ['Professional', 'Friendly & Casual', 'Funny', 'Luxury / Premium', 'Bold & Direct', 'Educational']
const CONTENT_OPTIONS = ['Images with text', 'Carousel posts', 'Long write-up / story', 'Short punchy post', 'Video ideas', 'With my product photos']
const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const QUICK_DAY_SETS = ['Everyday', 'Weekdays', 'Weekends', 'Mon / Wed / Fri']
const TIME_OPTIONS = ['8:00 AM', '12:00 PM', '6:00 PM', '9:00 PM']

const PLATFORM_DEFS = [
  { id: 'facebook', label: 'Facebook', icon: FaFacebook, color: '#1877F2' },
  { id: 'instagram', label: 'Instagram', icon: FaInstagram, color: '#E4405F' },
  { id: 'linkedin', label: 'LinkedIn', icon: FaLinkedin, color: '#0A66C2' },
  { id: 'x', label: 'X / Twitter', icon: FaXTwitter, color: '#000000' },
  { id: 'tiktok', label: 'TikTok', icon: FaTiktok, color: '#000000' },
]

type WizardData = {
  topic: string; goal: string; platforms: string[]; audience: string; tone: string
  contentTypes: string[]; postTime: string; postDays: string[]; timezone: string
}

const slideVariants = {
  enter: { x: 300, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: -300, opacity: 0 },
}

export default function MatureAutomationWizard({ open, onComplete }: { open: boolean; onComplete: () => void }) {
  const { session, user } = useAuth()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<string>>(() => {
    try {
      const cached = localStorage.getItem(CONNECTED_CACHE_KEY)
      if (cached) return new Set(JSON.parse(cached))
    } catch {}
    return new Set()
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [creditBalance, setCreditBalance] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState(0)
  const [genStatus, setGenStatus] = useState('')
  const [generatedPreview, setGeneratedPreview] = useState<any>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [planId, setPlanId] = useState<string | null>(null)
  const [data, setData] = useState<WizardData>(() => {
    try { const saved = localStorage.getItem(WIZARD_KEY); if (saved) return JSON.parse(saved) as WizardData } catch {}
    return { topic: '', goal: '', platforms: [], audience: '', tone: '', contentTypes: [], postTime: '', postDays: [], timezone: 'Africa/Lagos' }
  })
  const [customTopic, setCustomTopic] = useState('')
  const [customGoal, setCustomGoal] = useState('')
  const [customTone, setCustomTone] = useState('')
  const [customTime, setCustomTime] = useState('')
  const [audienceInput, setAudienceInput] = useState('')

  useEffect(() => { try { localStorage.setItem(WIZARD_KEY, JSON.stringify(data)) } catch {} }, [data])

  // Check connected platforms and credit balance
  useEffect(() => {
    if (!open || !session?.access_token) return
    const check = async () => {
      try {
        const apps = await getConnectedApps(session.access_token)
        const connected = new Set<string>()
        for (const provider of apps.providers) {
          if (provider.connected) connected.add(provider.provider === 'twitter' ? 'x' : provider.provider)
        }
        // Merge with existing cache so native connections (like LinkedIn) persist even if API doesn't return them
        const merged = new Set([...connected, ...connectedPlatforms])
        setConnectedPlatforms(merged)
        try { localStorage.setItem(CONNECTED_CACHE_KEY, JSON.stringify([...merged])) } catch {}
      } catch {}
      const bal = await hydrateCredits()
      setCreditBalance(typeof bal === 'number' ? bal : 0)
    }
    void check()
    const interval = setInterval(() => { void hydrateCredits().then(b => setCreditBalance(typeof b === 'number' ? b : 0)) }, 3000)
    return () => clearInterval(interval)
  }, [open, session?.access_token])

  const update = (partial: Partial<WizardData>) => setData(prev => ({ ...prev, ...partial }))
  const goTo = (s: number) => { setDirection(s > step ? 1 : -1); setStep(s) }

  const handleSkip = () => { try { localStorage.setItem(WIZARD_DONE_KEY, '1') } catch {}; setShowSkipConfirm(false); onComplete() }
  const handleBackdropClick = () => setShowSkipConfirm(true)

  const getCreditsPerWeek = () => {
    const dayCount = data.postDays.length || 1
    return dayCount * Math.max(1, data.platforms.length) * 2
  }
  const totalCreditsNeeded = getCreditsPerWeek() * 4
  const hasEnoughCredits = creditBalance >= totalCreditsNeeded

  const handleApprove = async () => {
    if (!user?.id) { setError('Please sign in.'); return }
    setSaving(true); setError('')
    try {
      const creditsEst = totalCreditsNeeded
      const { data: savedPlan, error: saveError } = await supabase!.from('automations').insert({
        user_id: user.id, topic: data.topic, goal: data.goal, platforms: data.platforms,
        audience: data.audience, tone: data.tone, content_types: data.contentTypes,
        post_time: data.postTime, post_days: data.postDays, timezone: 'Africa/Lagos',
        status: 'generating', credits_estimated: creditsEst,
      }).select('id').single()
      if (saveError) throw saveError
      setPlanId(savedPlan?.id || null)
      setSaving(false)
      // Start generating
      setGenerating(true); setGenProgress(0); setStep(7)
      await generateContent(savedPlan?.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
      setSaving(false)
    }
  }

  const generateContent = async (planId: string) => {
    const totalRuns = data.postDays.length * 4 // Weekly runs for a month
    for (let i = 1; i <= totalRuns; i++) {
      setGenProgress(Math.round((i / totalRuns) * 100))
      setGenStatus(`Generating script ${i}/${totalRuns}...`)
      // Simulate content generation - in production, this would call an API
      await new Promise(r => setTimeout(r, 200))
      // Update plan progress
      try { await supabase!.from('automations').update({ progress: Math.round((i / totalRuns) * 100) }).eq('id', planId) } catch {}
    }
    setGenStatus('Generating images...')
    for (let i = 1; i <= data.platforms.length; i++) {
      const pct = Math.round((i / data.platforms.length) * 100)
      setGenProgress(90 + Math.round((i / data.platforms.length) * 10))
      setGenStatus(`Creating image ${i}/${data.platforms.length}...`)
      await new Promise(r => setTimeout(r, 300))
    }
    setGenProgress(100)
    setGenStatus('Automation ready!')
    await new Promise(r => setTimeout(r, 500))
    // Show preview
    setGeneratedPreview({
      runNumber: 1,
      platforms: data.platforms,
      content: `🔥 ${data.topic} post for ${data.platforms.join(', ')} - Day 1`,
      imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(data.topic + ' social media post professional')}?width=1024&height=1024`,
    })
    setGenerating(false)
    setShowConfirm(true)
  }

  const handleConfirm = async () => {
    if (planId) {
      await supabase!.from('automations').update({ status: 'active' }).eq('id', planId)
    }
    try { localStorage.setItem(WIZARD_DONE_KEY, '1') } catch {}
    try { localStorage.removeItem(WIZARD_KEY) } catch {}
    onComplete()
  }

  const handleTopUp = () => {
    window.location.href = '/settings?tab=billing'
  }

  const handleConnectPlatform = (platformId: string) => {
    const returnTo = `/automations?wizard=1&platform=${encodeURIComponent(platformId)}`
    window.open(`/connected-apps?platform=${encodeURIComponent(platformId)}&returnTo=${encodeURIComponent(returnTo)}`, '_blank')
  }

  if (!open) return null

  const totalSteps = 7
  const progress = ((step + 1) / totalSteps) * 100

  const handleTopicSelect = (t: string) => { update({ topic: t }); setCustomTopic(''); goTo(1) }
  const handleCustomTopic = () => { if (customTopic.trim()) { update({ topic: customTopic.trim() }); goTo(1) } }
  const handleGoalSelect = (g: string) => { update({ goal: g }); setCustomGoal(''); goTo(2) }
  const handleCustomGoal = () => { if (customGoal.trim()) { update({ goal: customGoal.trim() }); goTo(2) } }
  const togglePlatform = (id: string) => {
    if (!connectedPlatforms.has(id)) return
    const next = data.platforms.includes(id) ? data.platforms.filter(p => p !== id) : [...data.platforms, id]
    update({ platforms: next })
  }
  const handleToneSelect = (t: string) => { update({ tone: t }); setCustomTone('') }
  const handleCustomTone = () => { if (customTone.trim()) update({ tone: customTone.trim() }) }
  const toggleContent = (c: string) => {
    const next = data.contentTypes.includes(c) ? data.contentTypes.filter(x => x !== c) : [...data.contentTypes, c]
    update({ contentTypes: next })
  }
  const toggleDay = (d: string) => {
    const next = data.postDays.includes(d) ? data.postDays.filter(x => x !== d) : [...data.postDays, d]
    update({ postDays: next })
  }
  const applyQuickDay = (set: string) => {
    if (set === 'Everyday') update({ postDays: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] })
    else if (set === 'Weekdays') update({ postDays: ['Mon','Tue','Wed','Thu','Fri'] })
    else if (set === 'Weekends') update({ postDays: ['Sat','Sun'] })
    else if (set === 'Mon / Wed / Fri') update({ postDays: ['Mon','Wed','Fri'] })
  }
  const handleTimeSelect = (t: string) => { update({ postTime: t }); setCustomTime('') }
  const handleCustomTime = () => { if (customTime.trim()) update({ postTime: customTime.trim() }) }

  const renderStep = () => {
    // Generation progress step
    if (step === 7) {
      return (
        <div className="flex flex-col items-center text-center py-6">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg mb-4">
            {generating ? <LoaderCircle className="animate-spin" size={28} /> : <CheckCircle2 size={28} />}
          </div>
          <h2 className="text-lg font-bold text-white mb-2">
            {generating ? 'Agent is generating your automations...' : 'Generation complete!'}
          </h2>
          <p className="text-sm text-zinc-400 mb-4">{genStatus}</p>
          <div className="w-full bg-zinc-800 rounded-full h-3 mb-2">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 rounded-full transition-all duration-500" style={{ width: `${genProgress}%` }} />
          </div>
          <p className="text-xs text-zinc-500 font-bold">{genProgress}%</p>
          {showConfirm && generatedPreview && (
            <div className="mt-6 w-full">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 mb-4">
                <p className="text-xs text-zinc-400 mb-1">Preview - Day 1</p>
                <p className="text-sm text-white mb-3">{generatedPreview.content}</p>
                {generatedPreview.imageUrl && (
                  <img src={generatedPreview.imageUrl} alt="Preview" className="rounded-lg w-full max-h-48 object-cover" />
                )}
              </div>
              <p className="text-xs text-zinc-500 mb-4">+ {getCreditsPerWeek() * 4 - 1} more scripts ready to run</p>
              <button onClick={handleConfirm} className="w-full min-h-12 rounded-xl bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500">
                <CheckCircle2 size={16} className="inline mr-2" /> Confirm & Go Live
              </button>
            </div>
          )}
        </div>
      )
    }

    // Regular steps
    switch (step) {
      case 0: return (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg"><Sparkles size={20} /></div>
            <div><h2 className="text-lg font-bold text-white">What do you want to post about?</h2><p className="text-sm text-zinc-400">Be specific — agent will use this to create content</p></div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {TOPIC_OPTIONS.map(t => (
              <button key={t} onClick={() => handleTopicSelect(t)} className={`min-h-[48px] rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-all ${data.topic === t ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700'}`}>{t}</button>
            ))}
          </div>
          <div className="mt-4">
            <textarea value={customTopic} onChange={e => setCustomTopic(e.target.value)} placeholder="Or describe in your own words… e.g. I sell luxury sneakers for Gen Z in Lagos" className="w-full min-h-[80px] rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-indigo-500 resize-none" />
            <button onClick={handleCustomTopic} disabled={!customTopic.trim()} className="mt-2 w-full min-h-10 rounded-xl bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-30">Continue</button>
          </div>
        </div>
      )

      case 1: return (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-indigo-500 text-white shadow-lg"><Target size={20} /></div>
            <div><h2 className="text-lg font-bold text-white">What is your goal?</h2><p className="text-sm text-zinc-400">This changes how the agent writes</p></div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {GOAL_OPTIONS.map(g => (
              <button key={g} onClick={() => handleGoalSelect(g)} className={`min-h-[48px] rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-all ${data.goal === g ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700'}`}>{g}</button>
            ))}
          </div>
          <div className="mt-4">
            <input value={customGoal} onChange={e => setCustomGoal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCustomGoal()} placeholder="Or type your own goal…" className="w-full min-h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-indigo-500" />
            <button onClick={handleCustomGoal} disabled={!customGoal.trim()} className="mt-2 w-full min-h-10 rounded-xl bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-30">Continue</button>
          </div>
        </div>
      )

      case 2: return (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg"><FaFacebook size={18} /></div>
            <div><h2 className="text-lg font-bold text-white">Where should we post?</h2><p className="text-sm text-zinc-400">Connect platforms to continue</p></div>
          </div>
          <div className="space-y-2.5">
            {PLATFORM_DEFS.map(pl => {
              const isConnected = connectedPlatforms.has(pl.id)
              const isSelected = data.platforms.includes(pl.id)
              const Icon = pl.icon
              return (
                <div key={pl.id} className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${isSelected ? 'border-indigo-500 bg-indigo-500/20' : isConnected ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-800 bg-zinc-900/30 opacity-50'}`}>
                  <div className="grid h-10 w-10 place-items-center rounded-lg" style={{ backgroundColor: pl.color + '20' }}>
                    <Icon style={{ color: pl.color }} size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{pl.label}</p>
                    {isConnected ? <p className="text-xs text-emerald-400">Connected ✅</p> : <p className="text-xs text-rose-400">Not connected</p>}
                  </div>
                  {isConnected ? (
                    <button onClick={() => togglePlatform(pl.id)} className={`grid h-8 w-8 place-items-center rounded-lg border transition-all ${isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-600 text-transparent'}`}>
                      {isSelected && <CheckCircle2 size={16} />}
                    </button>
                  ) : (
                    <button onClick={() => handleConnectPlatform(pl.id)} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1">
                      Connect {pl.id} <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-zinc-500">Connected platforms refresh automatically. Select from connected above.</p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => goTo(1)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-sm font-semibold text-zinc-300"><ArrowLeft size={15} /> Back</button>
            <button onClick={() => goTo(3)} disabled={data.platforms.length === 0} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 text-sm font-semibold text-white disabled:opacity-30">Continue <ArrowRight size={15} /></button>
          </div>
        </div>
      )

      case 3: return (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-lg"><Users size={20} /></div>
            <div><h2 className="text-lg font-bold text-white">Who & How?</h2><p className="text-sm text-zinc-400">Who are you talking to and what's the vibe?</p></div>
          </div>
          <p className="text-xs font-semibold text-zinc-400 mb-2">Audience</p>
          <input value={audienceInput || data.audience} onChange={e => { setAudienceInput(e.target.value); update({ audience: e.target.value }) }} placeholder="e.g. Young entrepreneurs in Nigeria, 18-30" className="w-full min-h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-indigo-500" />
          <p className="text-xs font-semibold text-zinc-400 mt-4 mb-2">Tone</p>
          <div className="grid grid-cols-2 gap-2">
            {TONE_OPTIONS.map(t => (
              <button key={t} onClick={() => handleToneSelect(t)} className={`min-h-[42px] rounded-xl border px-3 text-sm font-semibold transition-all ${data.tone === t ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700'}`}>{t}</button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={customTone} onChange={e => setCustomTone(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCustomTone()} placeholder="Custom tone…" className="flex-1 min-h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-indigo-500" />
            <button onClick={handleCustomTone} disabled={!customTone.trim()} className="min-h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-30">Set</button>
          </div>
          <div className="mt-5 flex gap-3">
            <button onClick={() => goTo(2)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-sm font-semibold text-zinc-300"><ArrowLeft size={15} /> Back</button>
            <button onClick={() => goTo(4)} disabled={!data.audience || !data.tone} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 text-sm font-semibold text-white disabled:opacity-30">Continue <ArrowRight size={15} /></button>
          </div>
        </div>
      )

      case 4: return (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-pink-500 to-indigo-500 text-white shadow-lg"><Image size={20} /></div>
            <div><h2 className="text-lg font-bold text-white">Content Type & Media</h2><p className="text-sm text-zinc-400">What should the agent create?</p></div>
          </div>
          <div className="space-y-2">
            {CONTENT_OPTIONS.map(c => {
              const sel = data.contentTypes.includes(c)
              return (
                <button key={c} onClick={() => toggleContent(c)} className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${sel ? 'border-indigo-500 bg-indigo-500/20' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}`}>
                  <div className={`grid h-6 w-6 place-items-center rounded-md border transition-all ${sel ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-600'}`}>{sel && <CheckCircle2 size={14} />}</div>
                  <span className={`text-sm font-semibold ${sel ? 'text-white' : 'text-zinc-300'}`}>{c}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-zinc-500">Agent will generate high-quality images via Pollinations AI</p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => goTo(3)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-sm font-semibold text-zinc-300"><ArrowLeft size={15} /> Back</button>
            <button onClick={() => goTo(5)} disabled={data.contentTypes.length === 0} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 text-sm font-semibold text-white disabled:opacity-30">Continue <ArrowRight size={15} /></button>
          </div>
        </div>
      )

      case 5: return (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-indigo-500 text-white shadow-lg"><Clock size={20} /></div>
            <div><h2 className="text-lg font-bold text-white">Schedule</h2><p className="text-sm text-zinc-400">Strict Africa/Lagos (WAT, UTC+1)</p></div>
          </div>
          <p className="text-xs font-semibold text-zinc-400 mb-2">Time</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {TIME_OPTIONS.map(t => (
              <button key={t} onClick={() => handleTimeSelect(t)} className={`min-h-[36px] rounded-lg border px-3 text-sm font-semibold transition-all ${data.postTime === t ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700'}`}>{t}</button>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            <input value={customTime} onChange={e => setCustomTime(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCustomTime()} placeholder="Custom time e.g. 7:30 PM" className="flex-1 min-h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-indigo-500" />
            <button onClick={handleCustomTime} disabled={!customTime.trim()} className="min-h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-30">Set</button>
          </div>
          <p className="text-xs font-semibold text-zinc-400 mb-2">Days</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK_DAY_SETS.map(s => (
              <button key={s} onClick={() => applyQuickDay(s)} className="min-h-[32px] rounded-lg border border-zinc-800 bg-zinc-900/50 px-2.5 text-[11px] font-semibold text-zinc-400 hover:border-zinc-700">{s}</button>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            {DAY_OPTIONS.map(d => (
              <button key={d} onClick={() => toggleDay(d)} className={`grid h-10 w-10 place-items-center rounded-xl border text-sm font-bold transition-all ${data.postDays.includes(d) ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700'}`}>{d}</button>
            ))}
          </div>
          {data.postTime && data.postDays.length > 0 && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3 space-y-1">
              <p className="text-sm font-semibold text-indigo-300">Will post every {data.postDays.join(', ')} at {data.postTime} WAT</p>
              <p className="text-xs text-indigo-400">{getCreditsPerWeek()} credits/week = {totalCreditsNeeded} credits/month</p>
            </div>
          )}
          <div className="mt-5 flex gap-3">
            <button onClick={() => goTo(4)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-sm font-semibold text-zinc-300"><ArrowLeft size={15} /> Back</button>
            <button onClick={() => goTo(6)} disabled={!data.postTime || data.postDays.length === 0} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 text-sm font-semibold text-white disabled:opacity-30">Continue <ArrowRight size={15} /></button>
          </div>
        </div>
      )

      case 6: return (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-indigo-500 text-white shadow-lg"><CheckCircle2 size={20} /></div>
            <div><h2 className="text-lg font-bold text-white">Review & Launch</h2><p className="text-sm text-zinc-400">Check everything before we go live</p></div>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Topic', value: data.topic },
              { label: 'Goal', value: data.goal },
              { label: 'Platforms', value: data.platforms.map(p => PLATFORM_DEFS.find(d => d.id === p)?.label || p).join(', ') },
              { label: 'Audience', value: data.audience },
              { label: 'Tone', value: data.tone },
              { label: 'Content Types', value: data.contentTypes.join(', ') },
              { label: 'Schedule', value: `${data.postDays.join(', ')} at ${data.postTime} WAT` },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
                <span className="text-xs font-semibold text-zinc-400">{item.label}</span>
                <span className="text-sm font-semibold text-white text-right max-w-[60%] truncate">{item.value}</span>
              </div>
            ))}
          </div>

          {/* Credit calculation */}
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-400"><CreditCard size={13} className="inline mr-1" /> Credits needed</span>
              <span className="text-sm font-bold text-indigo-300">{totalCreditsNeeded}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-400">Your balance</span>
              <span className={`text-sm font-bold ${hasEnoughCredits ? 'text-emerald-400' : 'text-rose-400'}`}>{creditBalance}</span>
            </div>
            {!hasEnoughCredits && (
              <div className="mt-3 flex gap-2">
                <button onClick={() => { const d = data.postDays.slice(0, Math.max(1, data.postDays.length - 2)); update({ postDays: d }) }} className="flex-1 min-h-10 rounded-xl border border-zinc-700 bg-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-700">
                  <ArrowLeft size={13} className="inline mr-1" /> Reduce days
                </button>
                <button onClick={handleTopUp} className="flex-1 min-h-10 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500">
                  <Zap size={13} className="inline mr-1" /> Top up credits
                </button>
              </div>
            )}
          </div>

          <label className="mt-4 flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500" />
            <span className="text-xs text-zinc-400 leading-relaxed">I approve the agent to create and post automatically based on this configuration</span>
          </label>
          {error && <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300"><AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
          <div className="mt-5 flex gap-3">
            <button onClick={() => goTo(5)} className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-sm font-semibold text-zinc-300"><ArrowLeft size={15} /> Edit</button>
            <button onClick={handleApprove} disabled={saving || !hasEnoughCredits} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-30 shadow-lg">
              {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Zap size={16} />}
              {saving ? 'Saving...' : 'Approve & Start Generation →'}
            </button>
          </div>
        </div>
      )

      default: return null
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={handleBackdropClick}>
      <div className="relative w-full max-w-[640px] animate-slide-up rounded-t-3xl bg-[#0A0A0B] p-0 shadow-2xl overflow-hidden max-h-[90dvh] sm:max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <AnimatePresence>
          {showSkipConfirm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="mx-4 w-full max-w-sm rounded-2xl bg-[#0F0F0F] p-6 shadow-xl text-center border border-zinc-800">
                <p className="text-base font-bold text-white">You need to finish setup to start automation.</p>
                <p className="mt-2 text-sm text-zinc-400">Are you sure you want to skip?</p>
                <div className="mt-5 flex gap-3">
                  <button onClick={() => setShowSkipConfirm(false)} className="flex-1 min-h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 text-sm font-semibold text-zinc-300">Continue setup</button>
                  <button onClick={handleSkip} className="flex-1 min-h-10 rounded-xl bg-zinc-800 text-sm font-semibold text-zinc-400 hover:bg-zinc-700">Skip for now</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="h-1 w-full bg-zinc-800">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all duration-500" style={{ width: `${step === 7 ? 100 : progress}%` }} />
        </div>

        <div className="px-6 pt-4 pb-2 flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-400">{step === 7 ? 'Generating' : `Step ${step + 1} of ${totalSteps}`}</span>
          <span className="text-xs font-semibold text-zinc-400">{step === 7 ? `${genProgress}%` : `${Math.round(progress)}%`}</span>
        </div>

        <div className="overflow-y-auto px-6 pb-8" style={{ maxHeight: 'calc(90dvh - 60px)' }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div key={step} custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

export function useMatureWizard() {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)

  const checkAndOpen = useCallback(() => {
    if (checked) return
    try {
      const done = localStorage.getItem(WIZARD_DONE_KEY)
      if (done === '1') { setChecked(true); return }
      const timer = setTimeout(() => { setOpen(true); setChecked(true) }, 800)
      return () => clearTimeout(timer)
    } catch { setChecked(true) }
  }, [checked])

  const openWizard = useCallback(() => { setOpen(true); setChecked(true) }, [])

  const close = () => {
    setOpen(false)
    try { localStorage.setItem(WIZARD_DONE_KEY, '1') } catch {}
  }

  return { open, checkAndOpen, close, openWizard }
}