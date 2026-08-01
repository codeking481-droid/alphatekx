import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarClock, CheckCircle2, ExternalLink, LoaderCircle, Sparkles, X, Zap } from 'lucide-react'
import { ConnectorIcon } from './ConnectorIcon'
import { getConnector } from '../../lib/agents/connectorRegistry'
import { getAgents, saveAgent, setCache } from '../../lib/agents/agentStore'
import type { Agent } from '../../lib/agents/types'
import type { IntegrationStatus, ServiceStatus } from '../../lib/integrations'

type Props = {
  agent: Agent
  integrationStatus: IntegrationStatus
  credits: number | null
  isAdmin: boolean
  authHeaders: () => Record<string, string>
  onClose: () => void
  onActivated: (agent: Agent) => void
}

type BrandForm = {
  business: string
  audience: string
  tone: string
  website: string
  dontPost: string
}

type PublishConfirmation = { platform: string; id: string; url?: string }

const platformNames: Record<string, string> = {
  facebook: 'Facebook', linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X', twitter: 'X', whatsapp: 'WhatsApp', telegram: 'Telegram', slack: 'Slack', discord: 'Discord'
}

function toDatetimeLocal(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offset).toISOString().slice(0, 16)
}

function fromDatetimeLocal(value: string) {
  return new Date(value).toISOString()
}

function defaultStartAt() {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return d.toISOString()
}

function isServiceStatus(value: unknown): value is Partial<ServiceStatus> {
  return Boolean(value && typeof value === 'object' && ('connected' in value || 'ready' in value))
}

function connectorConnected(id: string, status: IntegrationStatus) {
  const s = status[id] || status[(id === 'x' ? 'twitter' : id)]
  if (!isServiceStatus(s)) return false
  return Boolean(s.connected && s.ready)
}

function connectorState(id: string, status: IntegrationStatus) {
  const value = status[id] || status[(id === 'x' ? 'twitter' : id)]
  if (!isServiceStatus(value)) return { connected: false, ready: false, label: 'Not connected' }
  if (value.connected && value.ready) return { connected: true, ready: true, label: id === 'linkedin' ? 'LinkedIn personal profile ready' : 'Ready to publish' }
  if (value.connected) return { connected: true, ready: false, label: id === 'linkedin' ? 'Reconnect to approve LinkedIn publishing' : 'Reconnect required' }
  return { connected: false, ready: false, label: 'Not connected' }
}

export default function CampaignPreview({ agent, integrationStatus, credits, isAdmin, authHeaders, onClose, onActivated }: Props) {
  const [draft, setDraft] = useState<Agent>(agent)
  const [brand, setBrand] = useState<BrandForm>({
    business: agent.campaign?.brand?.business || '',
    audience: agent.campaign?.brand?.audience || '',
    tone: agent.campaign?.brand?.tone || '',
    website: agent.campaign?.brand?.website || '',
    dontPost: Array.isArray(agent.campaign?.brand?.dontPost) ? agent.campaign.brand.dontPost.join(', ') : (agent.campaign?.brand?.dontPost || ''),
  })
  const [savingBrand, setSavingBrand] = useState(false)
  const [activating, setActivating] = useState(false)
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'calendar' | 'cost' | 'brand'>('calendar')
  const [editing, setEditing] = useState<{ postId: string; platform: string; text: string } | null>(null)
  const [savingPost, setSavingPost] = useState(false)
  const [reviewingPost, setReviewingPost] = useState<string | null>(null)
  const [preparingPreview, setPreparingPreview] = useState(false)
  const [publishConfirmations, setPublishConfirmations] = useState<PublishConfirmation[]>([])
  const [startAt] = useState(() => {
    const first = toDatetimeLocal(agent.campaign?.posts?.[0]?.scheduledAt)
    const fallback = toDatetimeLocal(defaultStartAt())
    if (first) {
      const d = new Date(fromDatetimeLocal(first))
      if (!isNaN(d.getTime()) && d.getTime() > Date.now()) return first
    }
    return fallback || ''
  })
  const [postingOption, setPostingOption] = useState<'now' | 'later' | 'recurring'>(() => {
    if (agent.campaign?.meta?.postingOption === 'now' || agent.campaign?.meta?.postingOption === 'recurring') return agent.campaign.meta.postingOption
    if (agent.campaign?.meta?.publishingMode === 'once_now') return 'now'
    if (agent.campaign?.meta?.publishingMode === 'recurring' || (agent.campaign?.meta?.frequency && agent.campaign.meta.frequency !== 'once')) return 'recurring'
    return 'later'
  })
  const [scheduleDate, setScheduleDate] = useState(() => (startAt || toDatetimeLocal(defaultStartAt())).slice(0, 10))
  const [scheduleTime, setScheduleTime] = useState(() => (startAt || toDatetimeLocal(defaultStartAt())).slice(11, 16))
  const [timezone, setTimezone] = useState(() => agent.campaign?.meta?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  const [startError, setStartError] = useState('')

  useEffect(() => {
    fetch('/api/user/brand-profile', { headers: authHeaders() })
      .then(r => r.json().catch(() => ({})))
      .then(data => {
        if (data.brandProfile) {
          setBrand(prev => ({
            business: prev.business || data.brandProfile.business || '',
            audience: prev.audience || data.brandProfile.audience || '',
            tone: prev.tone || data.brandProfile.tone || '',
            website: prev.website || data.brandProfile.website || '',
            dontPost: prev.dontPost || (Array.isArray(data.brandProfile.dontPost) ? data.brandProfile.dontPost.join(', ') : (data.brandProfile.dontPost || '')),
          }))
        }
      })
      .catch(() => {})
  }, [agent.id])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !activating) onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [activating, onClose])

  const campaign = draft.campaign
  if (!campaign) return null

  const platformIds = campaign.meta.platforms
  const missingBrand = !brand.audience.trim() || !brand.tone.trim()
  const requiredConnectors = platformIds.filter(id => !connectorConnected(id, integrationStatus))
  const missingCaptions = campaign.posts.some(post => (post.platforms || []).some(platform => !String(post.captions?.[platform] || '').trim()))
  const requiresImage = campaign.meta.includeImages === true || platformIds.includes('instagram')
  const missingImages = requiresImage && campaign.posts.some(post => !String(post.imageUrl || post.image_url || '').trim())
  const previewReady = !missingCaptions && !missingImages
  // One approved content item costs one credit across all selected platforms.
  const total = Math.max(1, campaign.posts.length)
  const balance = credits ?? 0
  const canAfford = isAdmin || balance >= total
  const startAtDate = scheduleDate && scheduleTime ? new Date(`${scheduleDate}T${scheduleTime}`) : null
  const startValid = postingOption === 'now' || Boolean(startAtDate && !isNaN(startAtDate.getTime()) && startAtDate.getTime() > Date.now())
  const canActivate = requiredConnectors.length === 0 && !missingBrand && canAfford && startValid && previewReady && !campaign.posts.some(post => post.status === 'publishing') && !campaign.posts.every(post => post.status === 'posted')
  const activationBlocker = missingBrand
    ? 'Fill in the audience and tone in Brand Profile'
    : requiredConnectors.length
      ? `Connect ${requiredConnectors.map(id => platformNames[id] || id).join(', ')}`
      : !previewReady
        ? 'Prepare and review the final captions and matched images'
        : !canAfford
          ? `You need ${total} credits but currently have ${balance}`
          : !startValid
            ? 'Choose a future start date and time, or select Publish Now'
            : campaign.posts.some(post => post.status === 'publishing')
              ? 'A publication is already in progress'
              : campaign.posts.every(post => post.status === 'posted')
                ? 'Every post in this plan is already published'
                : ''
  const confirmation = postingOption === 'now' ? 'This post will publish immediately after approval.' : (scheduleDate && scheduleTime ? `This post will be published on ${new Date(`${scheduleDate}T${scheduleTime}`).toLocaleDateString(undefined, { dateStyle: 'long' })} at ${new Date(`${scheduleDate}T${scheduleTime}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}, ${timezone} time.` : '')

  const groupedPosts = useMemo(() => {
    const map: Record<string, typeof campaign.posts> = {}
    campaign.posts.forEach(p => {
      const key = `Day ${p.day}`
      if (!map[key]) map[key] = []
      map[key].push(p)
    })
    return map
  }, [campaign.posts])

  const saveBrand = async () => {
    setSavingBrand(true)
    try {
      const body = {
        business: brand.business.trim(),
        audience: brand.audience.trim(),
        tone: brand.tone.trim(),
        website: brand.website.trim(),
        dontPost: brand.dontPost.split(',').map(s => s.trim()).filter(Boolean),
      }
      const res = await fetch('/api/user/brand-profile', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error('Could not save brand profile')
      setNotice('Brand profile saved. Regenerate the campaign to use it.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to save brand profile')
    } finally { setSavingBrand(false) }
  }

  const preparePreview = async () => {
    setPreparingPreview(true)
    setNotice('Alpha is preparing the final captions and matched images for your review...')
    try {
      const start = await fetch(`/api/automations/${encodeURIComponent(draft.id)}/generate-background`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ automationId: draft.id }) })
      const startBody = await start.json().catch(() => ({}))
      if (!start.ok) throw new Error(startBody.error || 'Could not start preview preparation.')
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 1500))
        const response = await fetch(`/api/automations/${encodeURIComponent(draft.id)}/progress`, { headers: authHeaders() })
        const progress = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(progress.error || 'Could not check preview preparation.')
        if (Array.isArray(progress.campaignPosts) && progress.campaignPosts.length) setDraft(current => current.campaign ? { ...current, campaign: { ...current.campaign, posts: progress.campaignPosts } } : current)
        if (progress.status === 'failed' || progress.status === 'completed_with_errors' || progress.error) throw new Error(progress.error || 'Preview preparation failed.')
        if (progress.status === 'completed' && Number(progress.progress) >= 100) {
          setNotice('Preview ready. Review the final captions and matched images, then publish.')
          return
        }
      }
      throw new Error('Preview preparation is taking longer than expected. Nothing was published or charged. Try again shortly.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not prepare the preview.')
    } finally { setPreparingPreview(false) }
  }

  const startEditPost = (postId: string, platform: string, text: string) => {
    setEditing({ postId, platform, text })
  }
  const cancelEditPost = () => setEditing(null)
  const updatePostText = (text: string) => setEditing(prev => prev ? { ...prev, text } : null)
  const savePostEdit = async () => {
    if (!editing) return
    setSavingPost(true)
    try {
      const nextPosts = campaign.posts.map(p => {
        if (p.id !== editing.postId) return p
        return { ...p, captions: { ...p.captions, [editing.platform]: editing.text }, approved: true, status: 'scheduled' as const, edited: true }
      })
      const next = { ...draft, approved: true, status: 'running' as const, campaign: { ...campaign, approved: true, status: 'running' as const, posts: nextPosts.map(post => ({ ...post, approved: true, status: post.status === 'pending_approval' || post.status === 'awaiting_approval' || post.status === 'draft' ? 'scheduled' : post.status })) }, updatedAt: new Date().toISOString() }
      await saveAgent(next)
      setDraft(next)
      setNotice('Post updated.')
      setEditing(null)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not save post edit')
    } finally { setSavingPost(false) }
  }

  const reviewPost = async (postId: string, platform: string, action: string, tone = '') => {
    setReviewingPost(`${postId}:${action}`)
    setNotice('')
    try {
      const res = await fetch(`/api/agents/campaign/${encodeURIComponent(draft.id)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ postId, platform, action, tone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update the post')
      setDraft(data.agent)
      setNotice('Post updated. Review the new version before approval.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not update the post')
    } finally { setReviewingPost(null) }
  }

  const activate = async () => {
    if (!canActivate) {
      if (!startValid) setStartError('That time has passed. Choose another exact time or use Publish Now.')
      setNotice(`Cannot go live yet: ${activationBlocker || 'review the plan details and try again'}.`)
      return
    }
    setStartError('')
    setActivating(true)
    setNotice(`Saving approval and activating ${platformIds.map(id => platformNames[id] || id).join(', ')}…`)
    try {
      const controller = new AbortController()
      const timeoutMs = postingOption === 'now' ? 180_000 : 45_000
      const timer = window.setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(`/api/agents/campaign/${encodeURIComponent(draft.id)}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ autoPublish: true, postingOption, localDate: scheduleDate, localTime: scheduleTime, timezone, startAt: postingOption === 'now' ? new Date().toISOString() : fromDatetimeLocal(`${scheduleDate}T${scheduleTime}`) }),
        signal: controller.signal,
      })
      window.clearTimeout(timer)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Activation failed')
      const providerIds = (data.execution?.steps || []).map((step: { providerPostId?: string; linkedinPostId?: string }) => step.providerPostId || step.linkedinPostId).filter(Boolean)
      const confirmations: PublishConfirmation[] = []
      for (const step of (data.execution?.steps || [])) {
        for (const [platform, result] of Object.entries(step.result || {}) as Array<[string, { id?: string; link?: string }]>) {
          if (result?.id) confirmations.push({ platform, id: String(result.id), url: result.link || undefined })
        }
        if (step.linkedinPostId && !confirmations.some(item => item.id === String(step.linkedinPostId))) confirmations.push({ platform: 'linkedin', id: String(step.linkedinPostId), url: step.linkedinUrl || undefined })
      }
      setPublishConfirmations(confirmations)
      setNotice(postingOption === 'now' ? `Published successfully to ${platformIds.map(id => platformNames[id] || id).join(', ')}. Provider ID${providerIds.length === 1 ? '' : 's'}: ${providerIds.join(', ') || data.agent?.campaign?.posts?.[0]?.providerPostId || 'confirmed'}` : `Approved and scheduled. No credits charged yet. ${confirmation}`)
      setDraft(data.agent)
      setCache([data.agent, ...getAgents().filter(item => item.id !== data.agent.id)])
      // Approval is the only action required. Move completed or scheduled work
      // out of review immediately; never leave a second publish action behind.
      onActivated(data.agent)
    } catch (err) {
      setNotice(err instanceof DOMException && err.name === 'AbortError' ? 'Provider confirmation is taking longer than expected. Check Active Automations before retrying so you do not create a duplicate request.' : (err instanceof Error ? err.message : 'Activation failed'))
    } finally { setActivating(false) }
  }

  const cancelSchedule = async () => {
    setActivating(true)
    try {
      const res = await fetch(`/api/agents/campaign/${encodeURIComponent(draft.id)}/cancel`, { method: 'POST', headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (res.status === 404) {
        const cancelled = { ...draft, status: 'paused' as const, approved: false, nextRunAt: undefined, trigger: { ...draft.trigger, nextRun: undefined }, campaign: { ...draft.campaign!, status: 'cancelled', approved: false, posts: draft.campaign!.posts.map(post => ['scheduled', 'pending_approval'].includes(post.status) ? { ...post, status: 'cancelled', approved: false } : post) } }
        setDraft(cancelled)
        setCache(getAgents().filter(item => item.id !== draft.id))
        setNotice('This old schedule was no longer on the server and has been removed from this browser. Nothing was published or charged.')
        return
      }
      if (!res.ok) throw new Error(data.error || 'Cancellation failed')
      setDraft(data.agent)
      setCache([data.agent, ...getAgents().filter(item => item.id !== data.agent.id)])
      setNotice('Schedule cancelled. Nothing was published or charged.')
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Cancellation failed') }
    finally { setActivating(false) }
  }

  return <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-hidden bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="campaign-preview-title">
    <div className="relative flex h-[100dvh] w-full max-w-full flex-col overflow-hidden border border-[#FFD700]/20 bg-[#15151F] shadow-[0_0_50px_rgba(255,215,0,.13)] sm:h-auto sm:max-h-[92dvh] sm:max-w-3xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
      <div className="shrink-0 border-b border-white/10 bg-[#15151F]/95 px-4 py-4 backdrop-blur-2xl sm:px-6 sm:py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-[#FFD700]"><Zap size={13} strokeWidth={1.5}/> Alpha execution plan</div>
          <h2 id="campaign-preview-title" className="mt-2 break-words text-xl font-black text-white sm:text-2xl">{campaign.name}</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-[#A0A0B0]">{campaign.description}</p>
        </div>
        <button onClick={onClose} aria-label="Close automation review" className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[.035] text-[#A0A0B0] transition hover:border-[#FFD700]/25 hover:text-white"><X size={19}/></button>
      </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6 sm:pb-6">

      {notice && <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[.07] p-3 text-sm font-bold leading-6 text-emerald-200">{notice}</div>}

      {publishConfirmations.length > 0 && <section className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/[.07] p-4" aria-label="Confirmed published posts">
        <div className="flex items-center gap-2 text-sm font-black text-emerald-200"><CheckCircle2 size={17}/> Real post confirmed</div>
        <div className="mt-3 space-y-2">{publishConfirmations.map(item => <div key={`${item.platform}:${item.id}`} className="flex min-w-0 flex-col gap-2 rounded-xl border border-white/10 bg-[#0A0A0F]/70 p-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between"><div className="min-w-0"><p className="text-xs font-black capitalize text-white">{platformNames[item.platform] || item.platform}</p><p className="mt-1 break-all font-mono text-[10px] text-emerald-300">Provider ID: {item.id}</p></div>{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-lg border border-emerald-300/20 px-3 text-xs font-black text-emerald-200">View real post <ExternalLink size={13}/></a>}</div>)}</div>
      </section>}

      <section className="mt-4 rounded-2xl border border-white/10 bg-[#0A0A0F] p-3" aria-label="Publish readiness">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black text-white">Ready to publish</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${previewReady && !requiredConnectors.length ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-300/10 text-amber-200'}`}>{previewReady && !requiredConnectors.length ? 'READY' : 'ACTION NEEDED'}</span></div>
        <div className="mt-3 grid gap-2 text-xs min-[430px]:grid-cols-3">
          <p className={missingCaptions ? 'text-amber-200' : 'text-emerald-300'}>{missingCaptions ? '○ Captions need preparation' : '✓ Final captions ready'}</p>
          <p className={missingImages ? 'text-amber-200' : 'text-emerald-300'}>{requiresImage ? (missingImages ? '○ Matched image needed' : '✓ Matched image ready') : '✓ Text-only plan selected'}</p>
          <p className={requiredConnectors.length ? 'text-amber-200' : 'text-emerald-300'}>{requiredConnectors.length ? `○ Connect ${requiredConnectors.map(id => platformNames[id] || id).join(', ')}` : '✓ Connections ready'}</p>
        </div>
        {!previewReady && <button type="button" onClick={() => void preparePreview()} disabled={preparingPreview} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#FFD700]/25 bg-[#FFD700]/10 px-4 text-xs font-black text-[#FFD700] disabled:opacity-50">{preparingPreview ? <LoaderCircle className="animate-spin" size={15}/> : <Sparkles size={15}/>} {preparingPreview ? 'Preparing final preview...' : 'Prepare captions & matched images'}</button>}
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="luxury-card rounded-xl p-4">
          <div className="text-xs text-white/55">Posts</div>
          <div className="mt-1 text-2xl font-semibold">{campaign.meta.totalPosts}</div>
          <div className="text-xs text-white/40">{campaign.meta.publishingMode === 'once_now' ? 'Publish once now' : campaign.meta.publishingMode === 'once_later' ? 'Schedule once' : `${campaign.meta.frequencyText}`}</div>
        </div>
        <div className="luxury-card rounded-xl p-4">
          <div className="text-xs text-white/55">Platforms</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {platformIds.map(id => <span key={id} className={`rounded-lg border px-2 py-1 text-xs font-black ${id === 'linkedin' ? 'border-[#0A66C2]/35 bg-[#0A66C2]/15 text-[#78B9F2]' : 'border-white/10 bg-white/[.045] text-white'}`}>{platformNames[id] || id}{id === 'linkedin' ? ' · Native' : ''}</span>)}
          </div>
        </div>
        <div className="luxury-card rounded-xl p-4">
          <div className="text-xs text-white/55">Total cost</div>
          <div className="mt-1 text-2xl font-black text-[#FFD700]">{isAdmin ? 'Admin' : `${total} credit${total === 1 ? '' : 's'}`}</div>
          <div className="text-xs text-white/40">{isAdmin ? 'Admin — free' : `Balance: ${balance}`}</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-[#0A0A0F] p-1">
        {(['calendar', 'cost', 'brand'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`min-h-10 rounded-lg px-2 text-xs font-black transition ${tab === t ? 'bg-gradient-to-r from-[#FFD700] to-[#6C5CE7] text-[#0A0A0F] shadow-lg' : 'text-[#A0A0B0] hover:bg-white/[.055] hover:text-white'}`}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'calendar' && <div className="mt-4 space-y-4">
        <div className="grid gap-3 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 sm:grid-cols-2">
          <div><p className="text-xs text-white/45">Publishing mode</p><p className="mt-1 text-sm font-medium">{postingOption === 'now' ? 'Once now' : postingOption === 'later' ? 'Once later' : 'Recurring'}</p></div>
          {postingOption === 'recurring' && <><div><p className="text-xs text-white/45">Frequency</p><p className="mt-1 text-sm font-medium">{campaign.meta.frequencyText}</p></div><div><p className="text-xs text-white/45">Timezone</p><p className="mt-1 text-sm font-medium">{campaign.meta.timezone}</p></div><div><p className="text-xs text-white/45">End condition</p><p className="mt-1 text-sm font-medium">{campaign.meta.endDate || `${campaign.meta.totalPosts} posts`}</p></div><div><p className="text-xs text-white/45">Estimated executions</p><p className="mt-1 text-sm font-medium">{campaign.meta.totalPosts}</p></div></>}
        </div>
        <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-white/80"><CalendarClock size={16} className="text-indigo-400"/> Posting option</label>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([['now', 'Publish Now'], ['later', 'Schedule for Later'], ['recurring', 'Recurring Schedule']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setPostingOption(value); setStartError('') }} className={`rounded-xl border px-3 py-2 text-xs ${postingOption === value ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-violet-400/20 text-white/60 hover:bg-violet-500/10'}`}>{label}</button>)}
          </div>
          {postingOption !== 'now' && <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-white/55">Date<input type="date" value={scheduleDate} onChange={e => { setScheduleDate(e.target.value); setStartError('') }} className="mt-1 w-full rounded-xl bg-violet-500/10 px-3 py-2 text-sm text-white outline-none" /></label>
            <label className="text-xs text-white/55">Exact time<input type="time" step="60" value={scheduleTime} onChange={e => { setScheduleTime(e.target.value); setStartError('') }} className="mt-1 w-full rounded-xl bg-violet-500/10 px-3 py-2 text-sm text-white outline-none" /></label>
            <label className="text-xs text-white/55">Timezone<select value={timezone} onChange={e => setTimezone(e.target.value)} className="mt-1 w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white outline-none">{Array.from(new Set([timezone, 'Africa/Lagos', 'UTC', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Kolkata'])).map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></label>
          </div>}
          {postingOption === 'recurring' && <p className="mt-3 text-xs text-white/50">The selected weekdays, start/end condition, and post count from your approved plan remain unchanged. This sets their exact local publishing time.</p>}
          {confirmation && <p className="mt-3 rounded-lg bg-indigo-500/10 p-3 text-xs text-indigo-200">{confirmation}</p>}
          {startError && <p className="mt-2 text-xs text-amber-300">{startError}</p>}
        </div>
        {Object.entries(groupedPosts).map(([day, posts]) => (
          <div key={day} className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
            <h3 className="text-sm font-semibold text-white/80">{day}</h3>
            <div className="mt-3 space-y-3">
              {posts.map(post => (
                <div key={post.id} className="rounded-xl bg-violet-500/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-indigo-300">{post.slot} · {new Date(post.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-white/60">{post.status === 'posted' ? 'Published' : post.status === 'pending_approval' || post.status === 'awaiting_approval' ? 'Scheduled' : post.status === 'scheduled' ? 'Scheduled' : post.status === 'publishing' ? 'Publishing' : post.status === 'failed' ? 'Failed' : post.status === 'cancelled' ? 'Cancelled' : 'Draft'}</span>
                  </div>
                  <p className="mt-1 text-xs text-white/70">{post.topic}</p>
                  {post.imageUrl && <figure className="mt-3 overflow-hidden rounded-xl border border-violet-400/20 bg-violet-500/10">
                    <img src={post.imageUrl} alt={`Generated visual for ${post.topic}`} className="aspect-video w-full object-cover" loading="lazy" />
                    <figcaption className="px-3 py-2 text-[10px] text-white/45">Matched automatically by Alpha · {post.imageSource || 'premium image provider'}</figcaption>
                  </figure>}
                  <div className="mt-2 space-y-2">
                    {post.platforms.map(platform => (
                      <div key={platform} className="rounded-lg border border-violet-400/20 bg-[#0A0F1E]/45 p-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[10px] font-medium text-white/50"><ConnectorIcon connector={getConnector(platform) || { id: platform, name: platformNames[platform] || platform, icon: 'bot', color: '#6366f1', authType: 'apiKey', category: 'Communication', description: '', triggers: [], actions: [], permissions: [] }}/> {platformNames[platform] || platform}</div>
                          {editing?.postId === post.id && editing?.platform === platform ? null : <button onClick={() => startEditPost(post.id, platform, post.captions[platform] || '')} className="text-[10px] text-indigo-300 hover:text-white">Edit</button>}
                        </div>
                        {editing?.postId === post.id && editing?.platform === platform ? (
                          <div className="mt-2 space-y-2">
                            <textarea value={editing.text} onChange={e => updatePostText(e.target.value)} className="min-h-[80px] w-full rounded-lg bg-violet-500/10 p-2 text-xs text-white/90 outline-none placeholder:text-white/30" />
                            <div className="flex justify-end gap-2">
                              <button onClick={cancelEditPost} className="rounded-md border border-violet-400/20 px-2 py-1 text-[10px] text-white/70 hover:bg-violet-500/10">Cancel</button>
                              <button onClick={savePostEdit} disabled={savingPost} className="rounded-md bg-indigo-500 px-2 py-1 text-[10px] text-white hover:bg-indigo-400 disabled:opacity-50">{savingPost ? 'Saving...' : 'Save'}</button>
                            </div>
                          </div>
                        ) : <>
                          <p className="mt-1 whitespace-pre-wrap text-xs text-white/80">{post.captions[platform]}</p>
                          <div className="mt-2 text-[10px] text-white/40">{(post.captions[platform] || '').length.toLocaleString()} characters</div>
                          {platform === 'linkedin' && <div className="mt-2 flex flex-wrap gap-1.5">
                            {[
                              ['regenerate', 'Regenerate'],
                              ['improve_hook', 'Improve hook'],
                              ['shorten', 'Shorten'],
                              ['expand', 'Expand'],
                              ['add_hashtags', 'Add hashtags'],
                              ['remove_hashtags', 'Remove hashtags'],
                            ].map(([action, label]) => <button key={action} disabled={Boolean(reviewingPost)} onClick={() => reviewPost(post.id, platform, action)} className="rounded-md border border-violet-400/20 px-2 py-1 text-[10px] text-white/65 hover:bg-violet-500/10 disabled:opacity-40">{reviewingPost === `${post.id}:${action}` ? 'Working...' : label}</button>)}
                            <button disabled={Boolean(reviewingPost)} onClick={() => { const tone = window.prompt('What tone should Alpha use?', brand.tone || 'professional'); if (tone) reviewPost(post.id, platform, 'change_tone', tone) }} className="rounded-md border border-violet-400/20 px-2 py-1 text-[10px] text-white/65 hover:bg-violet-500/10 disabled:opacity-40">Change tone</button>
                          </div>}
                        </>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>}

      {tab === 'cost' && <div className="mt-4 space-y-3 text-sm text-[#A0A0B0]">
        <div className="luxury-card rounded-xl p-4">
          <p className="font-bold text-white">One content item publishes adapted versions to every selected platform.</p>
          <p className="mt-2">{campaign.posts.length} post{campaign.posts.length === 1 ? '' : 's'} across {platformIds.length} platform{platformIds.length === 1 ? '' : 's'}.</p>
          <div className="mt-3 border-t border-[#FFD700]/10 pt-3 text-base font-black text-[#FFD700]">Total: {total} credit{total === 1 ? '' : 's'}</div>
        </div>
        <p className="rounded-xl border border-white/10 bg-white/[.035] p-3">Credits are charged only after every selected provider confirms the post.</p>
        <p>Current balance: <span className="font-black text-[#FFD700]">{isAdmin ? 'Admin · unlimited' : balance}</span></p>
        {!canAfford && <p className="font-bold text-amber-300">You need {total - balance} more credits.</p>}
      </div>}

      {tab === 'brand' && <div className="mt-4 space-y-3">
        <p className="text-sm text-white/60">Tell Alpha about your business so the posts sound like you.</p>
        <input value={brand.business} onChange={e => setBrand({ ...brand, business: e.target.value })} placeholder="Business name" className="w-full rounded-xl bg-violet-500/10 px-3 py-2 text-sm outline-none placeholder:text-white/30" />
        <input value={brand.audience} onChange={e => setBrand({ ...brand, audience: e.target.value })} placeholder="Target audience" className="w-full rounded-xl bg-violet-500/10 px-3 py-2 text-sm outline-none placeholder:text-white/30" />
        <input value={brand.tone} onChange={e => setBrand({ ...brand, tone: e.target.value })} placeholder="Tone (e.g. professional, playful, bold)" className="w-full rounded-xl bg-violet-500/10 px-3 py-2 text-sm outline-none placeholder:text-white/30" />
        <input value={brand.website} onChange={e => setBrand({ ...brand, website: e.target.value })} placeholder="Website (optional)" className="w-full rounded-xl bg-violet-500/10 px-3 py-2 text-sm outline-none placeholder:text-white/30" />
        <input value={brand.dontPost} onChange={e => setBrand({ ...brand, dontPost: e.target.value })} placeholder="Topics to avoid, separated by commas" className="w-full rounded-xl bg-violet-500/10 px-3 py-2 text-sm outline-none placeholder:text-white/30" />
        <button onClick={saveBrand} disabled={savingBrand} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-400 disabled:opacity-50">{savingBrand ? 'Saving...' : 'Save brand profile'}</button>
      </div>}

      <div className="luxury-card mt-6 rounded-xl p-4">
        <h3 className="text-sm font-black text-white">Publishing connections</h3>
        <p className="mt-1 text-xs leading-5 text-[#A0A0B0]">LinkedIn uses AlphaTekX native secure publishing. Other selected social platforms use their verified connection.</p>
        <div className="mt-3 space-y-2">
          {platformIds.map(id => {
            const state = connectorState(id, integrationStatus)
            const C = getConnector(id) || { id, name: platformNames[id] || id, icon: 'bot', color: '#6366f1', authType: 'apiKey', category: 'Communication', description: '', triggers: [], actions: [], permissions: [] }
            return <div key={id} className={`flex min-w-0 flex-col gap-3 rounded-xl border p-3 text-xs min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between ${id === 'linkedin' ? 'border-[#0A66C2]/25 bg-[#0A66C2]/[.07]' : 'border-white/10 bg-white/[.025]'}`}>
              <span className="flex min-w-0 items-center gap-2 font-black text-white"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[.055]"><ConnectorIcon connector={C}/></span><span className="min-w-0"><strong className="block truncate">{C.name}</strong>{id === 'linkedin' && <small className="font-bold text-[#78B9F2]">Native personal-profile publishing</small>}</span></span>
              {state.ready ? <span className="flex shrink-0 items-center gap-1 font-bold text-emerald-300"><CheckCircle2 size={13}/> {state.label}</span> : <a href={`/connected-apps?service=${id}&returnTo=${encodeURIComponent(`/automations?resume=${draft.id}`)}`} className="flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-[#FFD700]/20 bg-[#FFD700]/[.07] px-3 font-black text-[#FFD700] hover:bg-[#FFD700]/10">{state.connected ? 'Reconnect' : 'Connect'} {C.name}</a>}
            </div>
          })}
        </div>
      </div>

      </div>
      <div className="z-10 shrink-0 border-t border-[#FFD700]/10 bg-[#15151F]/95 px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-2xl sm:px-6 sm:py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-white/50">
            {!canActivate && (
              <span className="flex items-center gap-1.5 text-amber-300"><AlertCircle size={12}/>
                {activationBlocker || 'Review the plan before activation'}
              </span>
            )}
          </div>
          {campaign.status === 'running' && <button type="button" onClick={cancelSchedule} disabled={activating} className="min-h-10 rounded-lg border border-red-400/30 px-4 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-40">Cancel</button>}
          {publishConfirmations.length === 0 && <button
            type="button"
            onClick={() => activate()}
            disabled={activating}
            className="solar-action flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm sm:w-auto disabled:cursor-not-allowed disabled:opacity-40"
          >
            {activating ? <LoaderCircle className="animate-spin" size={16}/> : <Sparkles size={16}/>}
            {postingOption === 'now' ? `Approve & Publish Now · ${total} credits` : campaign.status === 'running' ? 'Approve & Update Schedule' : `Approve & Schedule · estimated ${total} credits`}
          </button>}
          {publishConfirmations.length > 0 && <button type="button" onClick={onClose} className="min-h-12 w-full rounded-xl border border-white/15 px-5 text-sm font-black text-white sm:w-auto">Done</button>}
        </div>
      </div>
    </div>
  </div>
}
