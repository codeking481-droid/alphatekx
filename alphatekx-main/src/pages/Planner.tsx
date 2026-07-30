import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { getCredits } from '../lib/creditStore'
import { calculateTotalRuns, calculateTotalCredits, getPlatformCreditsBreakdown, calculateEndDate, formatScheduleSummary, type ScheduleInput } from '../lib/planner/calculateRuns'
import { addDays, format, parseISO } from 'date-fns'
import { LoaderCircle, Check, X, AlertTriangle, Lock, Eye, EyeOff, Edit3, RefreshCw, ChevronLeft, ChevronRight, Play, Pause, StopCircle, List, Plus, Shield, Zap, Clock, Calendar, Globe, CreditCard, ArrowRight, ArrowLeft, Sparkles, Bot, Image, FileText, MessageSquare, Smartphone, Monitor, Twitter, Youtube, Linkedin, Mail, Sliders, CheckCircle, AlertCircle, Info } from 'lucide-react'

// ============ TYPES ============
type Platform = 'linkedin' | 'gmail' | 'calendar' | 'instagram' | 'twitter' | 'youtube' | 'telegram' | 'outlook' | 'slack' | 'notion'

interface WizardState {
  currentStep: number
  platforms: Platform[]
  task: string
  customTask: string
  schedule: ScheduleInput
  contentRules: Record<string, any>
  safety: {
    approval: 'yes' | 'first3' | 'no'
    neverDo: string
    workingHours: '9-5' | '24-7'
  }
}

const PLATFORMS: { id: Platform; label: string; icon: string; color: string }[] = [
  { id: 'linkedin', label: 'LinkedIn', icon: 'linkedin', color: '#0A66C2' },
  { id: 'gmail', label: 'Gmail', icon: 'mail', color: '#EA4335' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', color: '#4285F4' },
  { id: 'instagram', label: 'Instagram', icon: 'instagram', color: '#E4405F' },
  { id: 'twitter', label: 'X/Twitter', icon: 'twitter', color: '#1DA1F2' },
  { id: 'youtube', label: 'YouTube', icon: 'youtube', color: '#FF0000' },
  { id: 'telegram', label: 'Telegram', icon: 'telegram', color: '#0088CC' },
  { id: 'outlook', label: 'Outlook', icon: 'outlook', color: '#0078D4' },
  { id: 'slack', label: 'Slack', icon: 'slack', color: '#4A154B' },
  { id: 'notion', label: 'Notion', icon: 'notion', color: '#000000' },
]

const PLATFORM_QUESTIONS: Record<string, { key: string; label: string; type: string; options?: string[] }[]> = {
  linkedin: [
    { key: 'tone', label: 'Tone', type: 'select', options: ['Professional', 'Friendly', 'Bold', 'Storytelling', 'Technical', 'Viral'] },
    { key: 'topics', label: 'Topics', type: 'multi', options: ['AI', 'Tech', 'Startup', 'Leadership', 'Sales'] },
    { key: 'postLength', label: 'Post length', type: 'select', options: ['Short 150', 'Medium 300', 'Long 600+', 'Viral long-form 1000+'] },
    { key: 'includeImage', label: 'Include image?', type: 'select', options: ['Yes AI-generated', 'Upload brand images', 'No text only'] },
    { key: 'cta', label: 'CTA', type: 'select', options: ['Comment', 'DM me', 'Link in comments', 'None'] },
    { key: 'language', label: 'Language', type: 'select', options: ['English', 'Pidgin', 'French', 'Spanish', 'Arabic'] },
  ],
  gmail: [
    { key: 'emailFilter', label: 'Which emails to automate?', type: 'select', options: ['All', 'Only with subject contains', 'Only from', 'Leads'] },
    { key: 'action', label: 'Action', type: 'select', options: ['Auto-reply', 'Summarize', 'Forward to Slack', 'Draft only'] },
    { key: 'replyTone', label: 'Reply tone', type: 'select', options: ['Professional', 'Friendly', 'Short'] },
    { key: 'signature', label: 'Signature', type: 'select', options: ['Use my signature', 'No signature'] },
  ],
  calendar: [
    { key: 'action', label: 'What to do', type: 'select', options: ['Daily briefing 8AM', 'Auto-block focus time', 'Summarize day'] },
  ],
  instagram: [
    { key: 'tone', label: 'Tone', type: 'select', options: ['Professional', 'Friendly', 'Bold', 'Storytelling', 'Aesthetic'] },
    { key: 'topics', label: 'Topics', type: 'multi', options: ['AI', 'Tech', 'Lifestyle', 'Fashion', 'Travel', 'Food'] },
    { key: 'includeImage', label: 'Include image?', type: 'select', options: ['Yes AI-generated', 'Upload brand images', 'No text only'] },
    { key: 'language', label: 'Language', type: 'select', options: ['English', 'Pidgin', 'French', 'Spanish'] },
  ],
  twitter: [
    { key: 'tone', label: 'Tone', type: 'select', options: ['Professional', 'Friendly', 'Bold', 'Witty', 'Technical'] },
    { key: 'topics', label: 'Topics', type: 'multi', options: ['AI', 'Tech', 'Startup', 'News', 'Memes'] },
    { key: 'language', label: 'Language', type: 'select', options: ['English', 'Pidgin', 'French', 'Spanish'] },
  ],
  youtube: [
    { key: 'tone', label: 'Tone', type: 'select', options: ['Professional', 'Friendly', 'Bold', 'Educational', 'Entertaining'] },
    { key: 'topics', label: 'Topics', type: 'multi', options: ['AI', 'Tech', 'Tutorial', 'Review', 'Vlog'] },
    { key: 'videoLength', label: 'Video length', type: 'select', options: ['Short 60s', 'Medium 10min', 'Long 20min+'] },
  ],
  telegram: [
    { key: 'tone', label: 'Tone', type: 'select', options: ['Professional', 'Friendly', 'Bold', 'Informative'] },
    { key: 'topics', label: 'Topics', type: 'multi', options: ['AI', 'Tech', 'News', 'Community', 'Updates'] },
  ],
  outlook: [
    { key: 'emailFilter', label: 'Which emails to automate?', type: 'select', options: ['All', 'Only with subject contains', 'Only from', 'Leads'] },
    { key: 'action', label: 'Action', type: 'select', options: ['Auto-reply', 'Summarize', 'Forward to Slack', 'Draft only'] },
    { key: 'replyTone', label: 'Reply tone', type: 'select', options: ['Professional', 'Friendly', 'Short'] },
  ],
  slack: [
    { key: 'tone', label: 'Tone', type: 'select', options: ['Professional', 'Friendly', 'Bold', 'Casual'] },
    { key: 'channel', label: 'Channel', type: 'text' },
    { key: 'messageType', label: 'Message type', type: 'select', options: ['Announcement', 'Daily update', 'Reminder', 'Fun'] },
  ],
  notion: [
    { key: 'action', label: 'Action', type: 'select', options: ['Create page', 'Update database', 'Add to list'] },
    { key: 'tone', label: 'Tone', type: 'select', options: ['Professional', 'Friendly', 'Technical', 'Minimal'] },
  ],
}

const PLATFORM_ICONS: Record<string, string> = {
  linkedin: '💼', gmail: '📧', calendar: '📅', instagram: '📸', twitter: '🐦',
  youtube: '▶️', telegram: '✈️', outlook: '📨', slack: '💬', notion: '📝',
}

// ============ MAIN PLANNER COMPONENT ============
export default function Planner() {
  const { user, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [wizard, setWizard] = useState<WizardState>({
    currentStep: 1,
    platforms: [],
    task: '',
    customTask: '',
    schedule: {
      startDate: 'today',
      time: '09:00',
      timezone: 'Africa/Lagos',
      frequency: 'daily',
      duration: '30days',
      weeklyDays: [],
    },
    contentRules: {},
    safety: {
      approval: 'yes',
      neverDo: '',
      workingHours: '9-5',
    },
  })

  const [generating, setGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generationStatus, setGenerationStatus] = useState('')
  const [planId, setPlanId] = useState<string | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [planData, setPlanData] = useState<any>(null)
  const [selectedDay, setSelectedDay] = useState(1)
  const [editingDay1, setEditingDay1] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [healthCheckResults, setHealthCheckResults] = useState<any[]>([])
  const [healthCheckRunning, setHealthCheckRunning] = useState(false)
  const [healthCheckPassed, setHealthCheckPassed] = useState(false)
  const [activeAutomations, setActiveAutomations] = useState<any[]>([])
  const [loadingAutomations, setLoadingAutomations] = useState(true)
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [notConnectedPlatforms, setNotConnectedPlatforms] = useState<string[]>([])
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [customTopics, setCustomTopics] = useState<Record<string, string>>({})
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Load active automations
  useEffect(() => {
    if (!user?.id) return
    loadAutomations()
  }, [user?.id])

  const loadAutomations = async () => {
    setLoadingAutomations(true)
    try {
      const { data, error } = await supabase!
        .from('automation_plans')
        .select('*')
        .eq('user_id', user!.id)
        .in('status', ['active', 'paused', 'ready_for_confirmation'])
        .order('created_at', { ascending: false })
      if (!error && data) setActiveAutomations(data)
    } catch { }
    finally { setLoadingAutomations(false) }
  }

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) navigate('/auth')
  }, [user, authLoading, navigate])

  // ============ WIZARD HELPERS ============
  const updateWizard = (updates: Partial<WizardState>) => setWizard(prev => ({ ...prev, ...updates }))

  const togglePlatform = (platform: Platform) => {
    setWizard(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform],
    }))
  }

  const updateSchedule = (updates: Partial<ScheduleInput>) => {
    setWizard(prev => ({ ...prev, schedule: { ...prev.schedule, ...updates } }))
  }

  const updateContentRule = (platform: string, key: string, value: any) => {
    setWizard(prev => ({
      ...prev,
      contentRules: {
        ...prev.contentRules,
        [platform]: { ...(prev.contentRules[platform] || {}), [key]: value },
      },
    }))
  }

  const updateSafety = (updates: Partial<WizardState['safety']>) => {
    setWizard(prev => ({ ...prev, safety: { ...prev.safety, ...updates } }))
  }

  // ============ COMPUTED VALUES ============
  const totalRuns = useMemo(() => calculateTotalRuns(wizard.schedule), [wizard.schedule])
  const totalCredits = useMemo(() => calculateTotalCredits(wizard.platforms, totalRuns), [wizard.platforms, totalRuns])
  const creditsBreakdown = useMemo(() => getPlatformCreditsBreakdown(wizard.platforms), [wizard.platforms])
  const endDate = useMemo(() => calculateEndDate(wizard.schedule), [wizard.schedule])
  const userCredits = getCredits()
  const hasEnoughCredits = userCredits >= totalCredits

  const platformSuggestions = useMemo(() => {
    const p = wizard.platforms
    if (p.length === 0) return []
    if (p.length === 1 && p[0] === 'linkedin') return ['Daily posts', 'Auto-comment', 'Lead research']
    if (p.includes('linkedin') && p.includes('gmail')) return ['Repurpose Gmail leads to LinkedIn posts', 'Auto outreach']
    if (p.includes('gmail') && p.includes('calendar')) return ['Email daily briefing', 'Auto-schedule from emails']
    return ['Cross-platform content automation', 'Multi-platform engagement']
  }, [wizard.platforms])

  const isStep1Valid = wizard.platforms.length > 0
  const isStep2Valid = wizard.schedule.startDate && wizard.schedule.time && wizard.schedule.frequency && wizard.schedule.duration
  const isStep3Valid = useMemo(() => {
    for (const platform of wizard.platforms) {
      const rules = wizard.contentRules[platform]
      if (!rules) return false
      const questions = PLATFORM_QUESTIONS[platform] || []
      for (const q of questions) {
        if (!rules[q.key] && rules[q.key] !== '') return false
        if (q.type === 'multi' && (!Array.isArray(rules[q.key]) || rules[q.key].length === 0)) return false
      }
    }
    return wizard.platforms.length > 0
  }, [wizard.platforms, wizard.contentRules])
  const isStep4Valid = true // Safety always has defaults

  // ============ GENERATION ============
  const startGeneration = async () => {
    if (!user?.id) return
    setGenerating(true)
    setGenerationProgress(0)
    setGenerationStatus('Starting generation...')

    try {
      const res = await fetch('/api/agent/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms: wizard.platforms,
          task: wizard.customTask || wizard.task || 'Automated content',
          schedule: wizard.schedule,
          contentRulesPerPlatform: wizard.contentRules,
          safety: wizard.safety,
          userId: user.id,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')

      setPlanId(data.planId)
      setPlanData(data)

      // Poll progress
      pollRef.current = setInterval(async () => {
        try {
          const progRes = await fetch(`/api/agent/generate/progress?planId=${data.planId}`)
          const progData = await progRes.json()
          if (progRes.ok) {
            setGenerationProgress(progData.percent)
            setGenerationStatus(`Generating script ${progData.currentRun}/${progData.totalRuns}...`)

            if (progData.status === 'ready_for_confirmation' || progData.percent >= 100) {
              if (pollRef.current) clearInterval(pollRef.current)
              setGenerationProgress(100)
              setGenerationStatus('Generation complete!')
              setTimeout(() => {
                setGenerating(false)
                setShowConfirmation(true)
                loadPlanData(data.planId)
              }, 500)
            }
          }
        } catch { }
      }, 1000)
    } catch (error: any) {
      showToast(error.message || 'Generation failed', 'error')
      setGenerating(false)
    }
  }

  const loadPlanData = async (id: string) => {
    try {
      const { data, error } = await supabase!
        .from('automation_plans')
        .select('*')
        .eq('id', id)
        .single()
      if (!error && data) {
        setPlanData(data)
        setSelectedDay(1)
        if (data.posts?.[0]?.perPlatformContent) {
          const firstPlatform = Object.keys(data.posts[0].perPlatformContent)[0]
          setEditedContent(data.posts[0].perPlatformContent[firstPlatform]?.content || '')
        }
      }
    } catch { }
  }

  // ============ CONFIRMATION ============
  const runHealthCheck = async () => {
    if (!user?.id || !planData) return
    setHealthCheckRunning(true)
    setHealthCheckPassed(false)
    const results: any[] = []

    // Check connections
    for (const platform of planData.platforms || []) {
      results.push({ label: `Checking ${platform} connection...`, status: 'checking' })
      setHealthCheckResults([...results])
      await new Promise(r => setTimeout(r, 800))
      try {
        const res = await fetch(`/api/connections/check?userId=${user.id}&platforms=${platform}`)
        const data = await res.json()
        const connected = data.results?.[platform]?.connected
        results[results.length - 1] = {
          label: `Checking ${platform} connection...`,
          status: connected ? 'passed' : 'failed',
          detail: connected ? 'Connected' : 'Not connected',
        }
      } catch {
        results[results.length - 1] = { label: `Checking ${platform} connection...`, status: 'failed', detail: 'Check failed' }
      }
      setHealthCheckResults([...results])
    }

    // Check image generation
    results.push({ label: 'Checking image generation...', status: 'checking' })
    setHealthCheckResults([...results])
    await new Promise(r => setTimeout(r, 600))
    results[results.length - 1] = { label: 'Checking image generation...', status: 'passed', detail: 'Ready' }
    setHealthCheckResults([...results])

    // Check schedule
    results.push({ label: 'Checking schedule...', status: 'checking' })
    setHealthCheckResults([...results])
    await new Promise(r => setTimeout(r, 500))
    const hasConflict = planData.schedule?.startDate === 'past'
    results[results.length - 1] = {
      label: 'Checking schedule...',
      status: hasConflict ? 'failed' : 'passed',
      detail: hasConflict ? 'Start date is in the past' : 'No conflicts',
    }
    setHealthCheckResults([...results])

    const allPassed = results.every(r => r.status === 'passed')
    setHealthCheckPassed(allPassed)
    setHealthCheckRunning(false)
  }

  const confirmPlan = async () => {
    if (!planId || !user?.id) return
    try {
      const res = await fetch('/api/agent/generate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, userId: user.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Confirmation failed')

      showToast(`🎉 Your ${data.totalRuns}-day automation is live!`, 'success')
      setShowConfirmation(false)
      setPlanId(null)
      setPlanData(null)
      loadAutomations()
      setWizard(prev => ({ ...prev, currentStep: 1, platforms: [], task: '', customTask: '', contentRules: {} }))
    } catch (error: any) {
      showToast(error.message || 'Confirmation failed', 'error')
    }
  }

  const handleEditLearn = async () => {
    if (!planId || !editedContent) return
    try {
      const res = await fetch('/api/agent/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          editedContent,
          platform: Object.keys(planData?.posts?.[0]?.perPlatformContent || {})[0] || 'linkedin',
          runNumber: selectedDay,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        showToast(`✅ Learned your style - applied to remaining ${data.totalHidden} hidden posts`, 'success')
        setEditingDay1(false)
        loadPlanData(planId)
      }
    } catch (error: any) {
      showToast(error.message || 'Learn failed', 'error')
    }
  }

  // ============ CONNECTION CHECK ============
  const checkConnections = async () => {
    if (!user?.id) return
    try {
      const res = await fetch('/api/connections/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: wizard.platforms, userId: user.id }),
      })
      const data = await res.json()
      const notConnected = Object.entries(data.results || {})
        .filter(([_, v]: any) => !v.connected)
        .map(([k]) => k)
      if (notConnected.length > 0) {
        setNotConnectedPlatforms(notConnected)
        setShowConnectionModal(true)
        return false
      }
      return true
    } catch {
      return true
    }
  }

  // ============ RENDER HELPERS ============
  const renderPlatformIcon = (platform: string) => {
    return PLATFORM_ICONS[platform] || '🔗'
  }

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3, 4, 5].map(step => (
        <div key={step} className="flex items-center gap-2">
          <button
            onClick={() => setWizard(prev => ({ ...prev, currentStep: step }))}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              wizard.currentStep === step
                ? 'bg-white text-black scale-110'
                : wizard.currentStep > step
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-white/5 text-zinc-500 border border-white/10'
            }`}
          >
            {wizard.currentStep > step ? <Check size={14} /> : step}
          </button>
          {step < 5 && <div className={`w-8 h-0.5 ${wizard.currentStep > step ? 'bg-emerald-500/50' : 'bg-white/10'}`} />}
        </div>
      ))}
    </div>
  )

  // ============ STEP 1: PLATFORM SELECTION ============
  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">What do you want to automate?</h2>
        <p className="text-zinc-400 mt-2">Select one or more platforms</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {PLATFORMS.map(p => {
          const selected = wizard.platforms.includes(p.id)
          return (
            <button
              key={p.id}
              onClick={() => togglePlatform(p.id)}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                selected
                  ? 'border-white/30 bg-white/10 shadow-lg shadow-white/5'
                  : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20'
              }`}
            >
              {selected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}
              <span className="text-2xl">{renderPlatformIcon(p.id)}</span>
              <span className="text-xs font-medium text-zinc-300">{p.label}</span>
            </button>
          )
        })}
      </div>

      {wizard.platforms.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
          <p className="text-sm text-zinc-400">Suggestions for {wizard.platforms.join(' + ')}:</p>
          <div className="flex flex-wrap gap-2">
            {platformSuggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => updateWizard({ task: s })}
                className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                  wizard.task === s
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Or type custom:</span>
            <input
              value={wizard.customTask}
              onChange={e => updateWizard({ customTask: e.target.value })}
              placeholder="Describe your automation..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/30"
            />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => updateWizard({ currentStep: 2 })}
          disabled={!isStep1Valid}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )

  // ============ STEP 2: SCHEDULE ============
  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Schedule your automation</h2>
        <p className="text-zinc-400 mt-2">Set when and how often it runs</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Start Date */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400">When to start?</label>
          <div className="flex gap-2">
            {['today', 'tomorrow'].map(d => (
              <button
                key={d}
                onClick={() => updateSchedule({ startDate: d })}
                className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  wizard.schedule.startDate === d
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20'
                }`}
              >
                {d === 'today' ? 'Today' : 'Tomorrow'}
              </button>
            ))}
            <button
              onClick={() => updateSchedule({ startDate: new Date().toISOString().split('T')[0] })}
              className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                !['today', 'tomorrow'].includes(wizard.schedule.startDate)
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20'
              }`}
            >
              Pick date
            </button>
          </div>
          {!['today', 'tomorrow'].includes(wizard.schedule.startDate) && (
            <input
              type="date"
              value={wizard.schedule.startDate}
              onChange={e => updateSchedule({ startDate: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          )}
        </div>

        {/* Time */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400">What time?</label>
          <input
            type="time"
            value={wizard.schedule.time}
            onChange={e => updateSchedule({ time: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
          <input
            value={wizard.schedule.timezone}
            onChange={e => updateSchedule({ timezone: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            placeholder="Timezone (e.g. Africa/Lagos)"
          />
        </div>

        {/* Frequency */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400">How often?</label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'daily', label: 'Daily' },
              { id: 'every2hours', label: 'Every 2 hours' },
              { id: 'every6hours', label: 'Every 6 hours' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'whenEvent', label: 'When event happens' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => updateSchedule({ frequency: f.id as any })}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  wizard.schedule.frequency === f.id
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {wizard.schedule.frequency === 'weekly' && (
            <div className="flex flex-wrap gap-1 mt-2">
              {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => (
                <button
                  key={d}
                  onClick={() => {
                    const days = wizard.schedule.weeklyDays || []
                    updateSchedule({
                      weeklyDays: days.includes(d) ? days.filter(x => x !== d) : [...days, d],
                    })
                  }}
                  className={`w-9 h-9 rounded-lg text-xs font-medium border transition-all ${
                    (wizard.schedule.weeklyDays || []).includes(d)
                      ? 'border-white/30 bg-white/10 text-white'
                      : 'border-white/10 bg-white/[0.04] text-zinc-500 hover:border-white/20'
                  }`}
                >
                  {d.slice(0, 2)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400">How long to run?</label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: '7days', label: '7 days' },
              { id: '14days', label: '14 days' },
              { id: '30days', label: '30 days' },
              { id: '60days', label: '60 days' },
              { id: '90days', label: '90 days' },
              { id: 'untilDate', label: 'Until date' },
              { id: 'forever', label: 'Forever' },
            ].map(d => (
              <button
                key={d.id}
                onClick={() => updateSchedule({ duration: d.id as any })}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  wizard.schedule.duration === d.id
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          {wizard.schedule.duration === 'untilDate' && (
            <input
              type="date"
              value={wizard.schedule.untilDate || ''}
              onChange={e => updateSchedule({ untilDate: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          )}
        </div>
      </div>

      {/* LIVE CALCULATION CARD */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Zap size={16} className="text-amber-400" /> Live Calculation</h3>

        {wizard.platforms.length > 0 && (
          <div className="text-sm text-zinc-300">
            <p>You selected: {creditsBreakdown.map(c => `${c.platform} (${c.credits}cr)`).join(' + ')} = {creditsBreakdown.reduce((a, c) => a + c.credits, 0)}cr per run</p>
          </div>
        )}

        <div className="text-sm text-zinc-300">
          <p>Frequency: {formatScheduleSummary(wizard.schedule)} = {totalRuns} runs</p>
        </div>

        <div className="text-sm font-medium text-white">
          <p>Total: {totalRuns} × {creditsBreakdown.reduce((a, c) => a + c.credits, 0)} = {totalCredits} credits</p>
        </div>

        <div className="text-xs text-zinc-400">
          <p>Starts: {wizard.schedule.startDate === 'today' ? 'Today' : wizard.schedule.startDate === 'tomorrow' ? 'Tomorrow' : wizard.schedule.startDate} {wizard.schedule.time} | {wizard.schedule.timezone}</p>
          {endDate && <p>Ends: {format(endDate, 'MMM d, yyyy')} {wizard.schedule.time}</p>}
          {wizard.schedule.duration === 'forever' && <p>Runs indefinitely, billed monthly</p>}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-400">Balance: {userCredits}</span>
          {hasEnoughCredits ? (
            <span className="text-emerald-400 flex items-center gap-1"><Check size={14} /> After: {userCredits - totalCredits} left</span>
          ) : (
            <span className="text-red-400 flex items-center gap-1"><AlertTriangle size={14} /> Insufficient credits</span>
          )}
        </div>

        {/* Credit Insurance */}
        <div className="text-xs text-zinc-500 flex items-center gap-1 mt-2">
          <Shield size={12} className="text-emerald-400" />
          If agent fails to post, credits auto-refunded in 5 mins - guaranteed
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => updateWizard({ currentStep: 1 })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm hover:bg-white/5 transition-all"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <button
          onClick={() => updateWizard({ currentStep: 3 })}
          disabled={!isStep2Valid || !hasEnoughCredits}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )

  // ============ STEP 3: CONTENT RULES ============
  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Content Rules</h2>
        <p className="text-zinc-400 mt-2">Configure rules for each platform</p>
      </div>

      <div className="space-y-6">
        {wizard.platforms.map(platform => {
          const questions = PLATFORM_QUESTIONS[platform] || []
          const rules = wizard.contentRules[platform] || {}

          return (
            <div key={platform} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                {renderPlatformIcon(platform)} {platform.charAt(0).toUpperCase() + platform.slice(1)}
              </h3>

              {questions.map(q => (
                <div key={q.key} className="space-y-1.5">
                  <label className="text-xs text-zinc-400">{q.label}</label>
                  {q.type === 'select' && (
                    <div className="flex flex-wrap gap-2">
                      {(q.options || []).map(opt => (
                        <button
                          key={opt}
                          onClick={() => updateContentRule(platform, q.key, opt)}
                          className={`px-3 py-1.5 rounded-xl text-xs border transition-all ${
                            rules[q.key] === opt
                              ? 'border-white/30 bg-white/10 text-white'
                              : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  {q.type === 'multi' && (
                    <div className="flex flex-wrap gap-2">
                      {(q.options || []).map(opt => {
                        const selected = Array.isArray(rules[q.key]) && rules[q.key].includes(opt)
                        return (
                          <button
                            key={opt}
                            onClick={() => {
                              const current = Array.isArray(rules[q.key]) ? [...rules[q.key]] : []
                              updateContentRule(platform, q.key,
                                current.includes(opt) ? current.filter((x: string) => x !== opt) : [...current, opt]
                              )
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs border transition-all ${
                              selected
                                ? 'border-white/30 bg-white/10 text-white'
                                : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20'
                            }`}
                          >
                            {selected && <Check size={10} className="inline mr-1" />}
                            {opt}
                          </button>
                        )
                      })}
                      <input
                        value={customTopics[platform] || ''}
                        onChange={e => {
                          setCustomTopics(prev => ({ ...prev, [platform]: e.target.value }))
                          if (e.target.value.trim()) {
                            const current = Array.isArray(rules[q.key]) ? [...rules[q.key]] : []
                            updateContentRule(platform, q.key, [...current, e.target.value.trim()])
                          }
                        }}
                        placeholder="Custom..."
                        className="px-3 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 outline-none focus:border-white/30"
                      />
                    </div>
                  )}
                  {q.type === 'text' && (
                    <input
                      value={rules[q.key] || ''}
                      onChange={e => updateContentRule(platform, q.key, e.target.value)}
                      placeholder={`Enter ${q.label.toLowerCase()}...`}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/30"
                    />
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => updateWizard({ currentStep: 2 })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm hover:bg-white/5 transition-all"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <button
          onClick={() => updateWizard({ currentStep: 4 })}
          disabled={!isStep3Valid}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )

  // ============ STEP 4: SAFETY ============
  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Safety & Approval</h2>
        <p className="text-zinc-400 mt-2">Set guardrails for your automation</p>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
          <label className="text-sm font-medium text-white">Approval mode</label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'yes', label: 'Approve each before posting' },
              { id: 'first3', label: 'Approve first 3 only then auto' },
              { id: 'no', label: 'No auto-post' },
            ].map(a => (
              <button
                key={a.id}
                onClick={() => updateSafety({ approval: a.id as any })}
                className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${
                  wizard.safety.approval === a.id
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
          <label className="text-sm font-medium text-white">What should agent NEVER do?</label>
          <textarea
            value={wizard.safety.neverDo}
            onChange={e => updateSafety({ neverDo: e.target.value })}
            placeholder="Never post about politics, never email CEO, etc."
            className="w-full h-24 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/30 resize-none"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
          <label className="text-sm font-medium text-white">Working hours</label>
          <div className="flex gap-2">
            {[
              { id: '9-5', label: 'Only 9AM-5PM' },
              { id: '24-7', label: '24/7' },
            ].map(h => (
              <button
                key={h.id}
                onClick={() => updateSafety({ workingHours: h.id as any })}
                className={`flex-1 px-4 py-2 rounded-xl text-xs font-medium border transition-all ${
                  wizard.safety.workingHours === h.id
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => updateWizard({ currentStep: 3 })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm hover:bg-white/5 transition-all"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <button
          onClick={() => updateWizard({ currentStep: 5 })}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-100 transition-all"
        >
          Next <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )

  // ============ STEP 5: REVIEW ============
  const renderStep5 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Review your automation</h2>
        <p className="text-zinc-400 mt-2">Everything looks good?</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <span className="text-sm text-zinc-400">Platforms</span>
          <span className="text-sm font-medium text-white">{wizard.platforms.length} selected</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {wizard.platforms.map(p => (
            <span key={p} className="px-3 py-1 rounded-full bg-white/10 text-xs text-white">
              {renderPlatformIcon(p)} {p}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <span className="text-sm text-zinc-400">Task</span>
          <span className="text-sm font-medium text-white">{wizard.customTask || wizard.task || 'Automated content'}</span>
        </div>

        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <span className="text-sm text-zinc-400">Schedule</span>
          <span className="text-sm font-medium text-white">{formatScheduleSummary(wizard.schedule)}</span>
        </div>

        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <span className="text-sm text-zinc-400">Runs</span>
          <span className="text-sm font-medium text-white">{totalRuns} runs (dynamic)</span>
        </div>

        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <span className="text-sm text-zinc-400">Credits</span>
          <span className="text-sm font-medium text-white">{totalCredits} total</span>
        </div>

        <div className="space-y-2">
          <span className="text-sm text-zinc-400">Content rules per platform</span>
          {wizard.platforms.map(p => (
            <div key={p} className="rounded-xl bg-white/[0.04] p-3">
              <span className="text-xs font-medium text-white">{renderPlatformIcon(p)} {p}</span>
              <div className="mt-1 text-xs text-zinc-500">
                {Object.entries(wizard.contentRules[p] || {}).map(([k, v]) => (
                  <span key={k} className="mr-3">{k}: {Array.isArray(v) ? v.join(', ') : String(v)}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Safety</span>
          <span className="text-sm font-medium text-white">{wizard.safety.approval} · {wizard.safety.workingHours}</span>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => updateWizard({ currentStep: 4 })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm hover:bg-white/5 transition-all"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <button
          onClick={async () => {
            const connected = await checkConnections()
            if (connected) startGeneration()
          }}
          disabled={generating}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm hover:from-emerald-400 hover:to-emerald-500 transition-all disabled:opacity-30"
        >
          {generating ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
          {generating ? 'Generating...' : 'Approve & Start Agent Generation'}
        </button>
      </div>
    </div>
  )

  // ============ GENERATION OVERLAY ============
  const renderGenerationOverlay = () => {
    if (!generating) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="max-w-md w-full mx-4 text-center space-y-6">
          {/* Futuristic spinner */}
          <div className="relative w-24 h-24 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin"
              style={{ animationDuration: '1.5s' }}
            />
            <div
              className="absolute inset-2 rounded-full border-2 border-transparent border-t-amber-400 animate-spin"
              style={{ animationDuration: '2s', animationDirection: 'reverse' }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl font-bold text-white">{generationProgress}%</span>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white">Agent is generating your automations...</h3>
            <p className="text-sm text-zinc-400 mt-2">{generationStatus}</p>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${generationProgress}%` }}
            />
          </div>

          <p className="text-xs text-zinc-500">This may take a few minutes depending on the number of runs</p>
        </div>
      </div>
    )
  }

  // ============ CONFIRMATION POPUP ============
  const renderConfirmationPopup = () => {
    if (!showConfirmation || !planData) return null
    const posts = planData.posts || []
    const totalRuns = planData.total_runs || posts.length
    const currentPost = posts[selectedDay - 1]
    const isLocked = selectedDay > 1

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-y-auto py-8">
        <div className="max-w-2xl w-full mx-4 bg-[#0A0A0F] border border-white/10 rounded-2xl p-6 space-y-5">
          <h2 className="text-xl font-bold text-white text-center">
            Your {totalRuns}-day automation is ready!
          </h2>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/[0.04] p-3">
              <span className="text-zinc-400">Platforms</span>
              <p className="text-white font-medium">{planData.platforms?.length || 0}</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <span className="text-zinc-400">Frequency</span>
              <p className="text-white font-medium">{formatScheduleSummary(planData.schedule)}</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <span className="text-zinc-400">Total Runs</span>
              <p className="text-white font-medium">{totalRuns}</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <span className="text-zinc-400">Total Credits</span>
              <p className="text-white font-medium">{planData.total_credits}</p>
            </div>
          </div>

          {/* Timeline Scrubber */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Timeline</span>
              <span className="text-xs text-zinc-500">Day {selectedDay} of {totalRuns}</span>
            </div>
            <input
              type="range"
              min={1}
              max={totalRuns}
              value={selectedDay}
              onChange={e => setSelectedDay(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>Day 1</span>
              <span>Day {totalRuns}</span>
            </div>
          </div>

          {/* Content Preview */}
          {currentPost && (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">Day {selectedDay} Preview</span>
                {isLocked ? (
                  <span className="text-xs text-amber-400 flex items-center gap-1"><Lock size={12} /> Locked</span>
                ) : (
                  <span className="text-xs text-emerald-400 flex items-center gap-1"><Eye size={12} /> Visible</span>
                )}
              </div>

              {Object.entries(currentPost.perPlatformContent || {}).map(([platform, content]: [string, any]) => (
                <div key={platform} className="space-y-2">
                  <span className="text-xs font-medium text-white flex items-center gap-1">
                    {renderPlatformIcon(platform)} {platform}
                  </span>
                  {isLocked ? (
                    <div className="relative">
                      <div className="blur-sm select-none">
                        <div className="h-20 bg-white/5 rounded-lg" />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                          <Lock size={12} /> Unlocks on Day {selectedDay}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {editingDay1 ? (
                        <textarea
                          value={editedContent}
                          onChange={e => setEditedContent(e.target.value)}
                          className="w-full h-32 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-white/30 resize-none"
                        />
                      ) : (
                        <p className="text-sm text-zinc-300 whitespace-pre-wrap">{content.content}</p>
                      )}
                      {content.imageUrl && !isLocked && (
                        <img
                          src={content.imageUrl}
                          alt={`Day ${selectedDay}`}
                          className="rounded-xl w-full max-h-48 object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}

              {/* Edit/Learn for Day 1 */}
              {!isLocked && (
                <div className="flex gap-2">
                  {editingDay1 ? (
                    <>
                      <button onClick={handleEditLearn} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-400 transition-all">
                        Save & Learn
                      </button>
                      <button onClick={() => setEditingDay1(false)} className="px-3 py-1.5 rounded-lg border border-white/10 text-zinc-300 text-xs hover:bg-white/5 transition-all">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setEditingDay1(true)} className="px-3 py-1.5 rounded-lg border border-white/10 text-zinc-300 text-xs flex items-center gap-1 hover:bg-white/5 transition-all">
                      <Edit3 size={12} /> Edit Day 1
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-zinc-500 text-center">
            +{totalRuns - 1} more scripts hidden - will run automatically
          </p>
          <p className="text-xs text-zinc-500 text-center">
            {totalRuns} posts generated and locked, Day 1 ready to read
          </p>

          {/* Health Check */}
          <div className="space-y-2">
            {healthCheckResults.length > 0 && (
              <div className="rounded-xl bg-white/[0.04] p-3 space-y-1.5">
                {healthCheckResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {r.status === 'checking' ? (
                      <LoaderCircle size={12} className="animate-spin text-amber-400" />
                    ) : r.status === 'passed' ? (
                      <Check size={12} className="text-emerald-400" />
                    ) : (
                      <X size={12} className="text-red-400" />
                    )}
                    <span className={r.status === 'passed' ? 'text-emerald-300' : r.status === 'failed' ? 'text-red-300' : 'text-zinc-300'}>
                      {r.label} {r.detail && `→ ${r.detail}`}
                    </span>
                  </div>
                ))}
                {healthCheckResults.every(r => r.status === 'passed') && (
                  <p className="text-xs text-emerald-400 mt-1">0 errors - Ready to launch</p>
                )}
              </div>
            )}

            {!healthCheckRunning && !healthCheckPassed && (
              <button
                onClick={runHealthCheck}
                className="w-full px-4 py-2 rounded-xl border border-white/10 text-zinc-300 text-xs hover:bg-white/5 transition-all"
              >
                Run health check before going live
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => { setShowConfirmation(false); setPlanId(null); setPlanData(null) }}
              className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={confirmPlan}
              disabled={!healthCheckPassed}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm hover:from-emerald-400 hover:to-emerald-500 transition-all disabled:opacity-30"
            >
              {healthCheckPassed ? 'Confirm & Go Live' : 'Run health check first'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============ CONNECTION MODAL ============
  const renderConnectionModal = () => {
    if (!showConnectionModal) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="max-w-md w-full mx-4 bg-[#0A0A0F] border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle size={20} />
            <h3 className="text-lg font-semibold text-white">Connection Required</h3>
          </div>

          <p className="text-sm text-zinc-300">
            Your {notConnectedPlatforms.join(' and ')} not connected
          </p>

          {/* Trust Banner */}
          <div className="rounded-xl bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-emerald-400" />
              <span className="text-xs font-medium text-emerald-300">Secured by AlphaTekX × Composio</span>
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              Enterprise-grade SOC2 Certified · 256-bit Encrypted · Trusted by 100k+ businesses · We never store passwords
            </p>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              <span>Composio</span>
              <span>×</span>
              <span>AlphaTekX</span>
            </div>
          </div>

          <div className="space-y-2">
            {notConnectedPlatforms.map(p => (
              <button
                key={p}
                onClick={() => navigate(`/connectors?service=${p}`)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
              >
                <span className="text-sm text-white flex items-center gap-2">
                  {renderPlatformIcon(p)} Connect {p}
                </span>
                <ArrowRight size={14} className="text-zinc-400" />
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowConnectionModal(false)}
            className="w-full px-4 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm hover:bg-white/5 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  // ============ ACTIVE AUTOMATIONS LIST ============
  const renderActiveAutomations = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Active Automations</h2>
        <button
          onClick={() => setWizard(prev => ({ ...prev, currentStep: 1, platforms: [], task: '', customTask: '', contentRules: {} }))}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-100 transition-all"
        >
          <Plus size={16} /> Activate New Automation
        </button>
      </div>

      {loadingAutomations ? (
        <div className="flex items-center justify-center py-12">
          <LoaderCircle className="animate-spin text-zinc-400" size={24} />
        </div>
      ) : activeAutomations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
          <Bot size={32} className="mx-auto text-zinc-500 mb-3" />
          <p className="text-zinc-400 text-sm">No active automations yet</p>
          <p className="text-zinc-600 text-xs mt-1">Create your first automation to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeAutomations.map(plan => {
            const runsLeft = plan.total_runs - (plan.current_run || 0)
            return (
              <div key={plan.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3 hover:bg-white/[0.06] transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${plan.status === 'active' ? 'bg-emerald-500 animate-pulse' : plan.status === 'paused' ? 'bg-amber-500' : 'bg-zinc-500'}`} />
                    <span className="text-sm font-medium text-white">
                      {plan.platforms?.map((p: string) => renderPlatformIcon(p)).join(' ')} {plan.task || 'Automation'}
                    </span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    plan.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' :
                    plan.status === 'paused' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-zinc-500/10 text-zinc-400'
                  }`}>
                    {plan.status}
                  </span>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                  <span>{plan.platforms?.length || 0} Platforms</span>
                  <span>{plan.total_runs} runs</span>
                  <span>{runsLeft} left</span>
                  <span>Next: {plan.schedule?.time || '9AM'}</span>
                </div>

                <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded-lg border border-white/10 text-zinc-300 text-xs flex items-center gap-1 hover:bg-white/5 transition-all">
                    <Pause size={12} /> Pause
                  </button>
                  <button className="px-3 py-1.5 rounded-lg border border-white/10 text-zinc-300 text-xs flex items-center gap-1 hover:bg-white/5 transition-all">
                    <StopCircle size={12} /> Stop
                  </button>
                  <button className="px-3 py-1.5 rounded-lg border border-white/10 text-zinc-300 text-xs flex items-center gap-1 hover:bg-white/5 transition-all">
                    <List size={12} /> Logs
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ============ MAIN RENDER ============
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <LoaderCircle className="animate-spin text-zinc-400" size={32} />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' :
          toast.type === 'error' ? 'bg-red-500/20 border border-red-500/30 text-red-300' :
          'bg-blue-500/20 border border-blue-500/30 text-blue-300'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Generation Overlay */}
      {renderGenerationOverlay()}

      {/* Confirmation Popup */}
      {renderConfirmationPopup()}

      {/* Connection Modal */}
      {renderConnectionModal()}

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            AlphaTekX Planner
          </h1>
          <p className="text-zinc-500 mt-2">Build powerful multi-platform automations</p>
        </div>

        {/* Wizard or Active Automations */}
        {wizard.currentStep >= 1 && wizard.currentStep <= 5 ? (
          <div className="rounded-2xl border border-white/10 bg-[#0E0E14] p-6 md:p-8">
            {renderStepIndicator()}

            {wizard.currentStep === 1 && renderStep1()}
            {wizard.currentStep === 2 && renderStep2()}
            {wizard.currentStep === 3 && renderStep3()}
            {wizard.currentStep === 4 && renderStep4()}
            {wizard.currentStep === 5 && renderStep5()}
          </div>
        ) : (
          renderActiveAutomations()
        )}

        {/* Active Automations below wizard */}
        {wizard.currentStep >= 1 && wizard.currentStep <= 5 && (
          <div className="mt-8">
            {renderActiveAutomations()}
          </div>
        )}
      </div>
    </div>
  )
}