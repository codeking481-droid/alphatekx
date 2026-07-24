import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarClock, CheckCircle2, LoaderCircle, Sparkles, X, Zap } from 'lucide-react'
import { ConnectorIcon } from './ConnectorIcon'
import { getConnector } from '../../lib/agents/connectorRegistry'
import { getAgents, saveAgent, setCache } from '../../lib/agents/agentStore'
import type { Agent } from '../../lib/agents/types'
import type { IntegrationStatus } from '../../lib/integrations'

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

function connectorConnected(id: string, status: IntegrationStatus) {
  const s = status[id] || status[(id === 'x' ? 'twitter' : id)] || { connected: false, ready: false }
  return Boolean(s.connected && s.ready)
}

export default function CampaignPreview({ agent, integrationStatus, credits, isAdmin, authHeaders, onClose, onActivated }: Props) {
  const [draft, setDraft] = useState<Agent>(agent)
  const [brand, setBrand] = useState<BrandForm>(agent.campaign?.brand || { business: '', audience: '', tone: '', website: '', dontPost: '' })
  const [savingBrand, setSavingBrand] = useState(false)
  const [activating, setActivating] = useState(false)
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'calendar' | 'cost' | 'brand'>('calendar')
  const [editing, setEditing] = useState<{ postId: string; platform: string; text: string } | null>(null)
  const [savingPost, setSavingPost] = useState(false)
  const [reviewingPost, setReviewingPost] = useState<string | null>(null)
  const [startAt] = useState(() => {
    const first = toDatetimeLocal(agent.campaign?.posts?.[0]?.scheduledAt)
    const fallback = toDatetimeLocal(defaultStartAt())
    if (first) {
      const d = new Date(fromDatetimeLocal(first))
      if (!isNaN(d.getTime()) && d.getTime() > Date.now()) return first
    }
    return fallback || ''
  })
  const [postingOption, setPostingOption] = useState<'now' | 'later' | 'recurring'>(() => agent.campaign?.meta?.postingOption === 'now' || agent.campaign?.meta?.postingOption === 'recurring' ? agent.campaign.meta.postingOption : (agent.campaign?.meta?.frequency && agent.campaign.meta.frequency !== 'once' ? 'recurring' : 'later'))
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

  const campaign = draft.campaign
  if (!campaign) return null

  const platformIds = campaign.meta.platforms
  const missingBrand = !brand.audience.trim() || !brand.tone.trim()
  const requiredConnectors = platformIds.filter(id => !connectorConnected(id, integrationStatus))
  const total = campaign.totalCredits
  const balance = credits ?? 0
  const canAfford = isAdmin || balance >= total
  const startAtDate = scheduleDate && scheduleTime ? new Date(`${scheduleDate}T${scheduleTime}`) : null
  const startValid = postingOption === 'now' || Boolean(startAtDate && !isNaN(startAtDate.getTime()) && startAtDate.getTime() > Date.now())
  const canActivate = requiredConnectors.length === 0 && !missingBrand && canAfford && startValid && !campaign.posts.some(post => post.status === 'publishing') && !campaign.posts.every(post => post.status === 'posted')
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
        return { ...p, captions: { ...p.captions, [editing.platform]: editing.text }, approved: false, status: 'pending_approval' as const, edited: true }
      })
      const next = { ...draft, approved: false, status: 'awaiting_approval' as const, campaign: { ...campaign, approved: false, status: 'pending_approval' as const, posts: nextPosts }, updatedAt: new Date().toISOString() }
      await saveAgent(next)
      setDraft(next)
      setNotice('Post updated.')
      setEditing(null)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not save post edit')
    } finally { setSavingPost(false) }
  }

  const reviewPost = async (postId: string, action: string, tone = '') => {
    setReviewingPost(`${postId}:${action}`)
    setNotice('')
    try {
      const res = await fetch(`/api/agents/campaign/${encodeURIComponent(draft.id)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ postId, platform: 'linkedin', action, tone }),
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
      return
    }
    setStartError('')
    setActivating(true)
    setNotice('Saving your approval and activating the LinkedIn schedule…')
    try {
      await saveAgent(draft)
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 30_000)
      const res = await fetch(`/api/agents/campaign/${encodeURIComponent(draft.id)}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ autoPublish: true, postingOption, localDate: scheduleDate, localTime: scheduleTime, timezone, startAt: postingOption === 'now' ? new Date().toISOString() : fromDatetimeLocal(`${scheduleDate}T${scheduleTime}`) }),
        signal: controller.signal,
      })
      window.clearTimeout(timer)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Activation failed')
      setNotice(postingOption === 'now' ? `Published successfully. LinkedIn post ID: ${data.execution?.steps?.[0]?.linkedinPostId || data.agent?.campaign?.posts?.[0]?.providerPostId || 'confirmed'}` : `Approved and scheduled. No credits charged yet. ${confirmation}`)
      setDraft(data.agent)
      setCache([data.agent, ...getAgents().filter(item => item.id !== data.agent.id)])
      onActivated(data.agent)
    } catch (err) {
      setNotice(err instanceof DOMException && err.name === 'AbortError' ? 'Activation took too long. Nothing was published; please retry.' : (err instanceof Error ? err.message : 'Activation failed'))
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

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Review and approve automation">
    <div className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/[.12] bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6" onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-indigo-400"><Zap size={12}/> Content Employee plan</div>
          <h2 className="mt-1 text-xl font-semibold">{campaign.name}</h2>
          <p className="mt-1 text-sm text-white/55">{campaign.description}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 text-white/50 hover:bg-white/[.08]"><X size={18}/></button>
      </div>

      {notice && <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="liquid-glass rounded-xl p-4">
          <div className="text-xs text-white/55">Posts</div>
          <div className="mt-1 text-2xl font-semibold">{campaign.meta.totalPosts}</div>
          <div className="text-xs text-white/40">{campaign.meta.postsPerDay} per day for {campaign.meta.durationDays} days</div>
        </div>
        <div className="liquid-glass rounded-xl p-4">
          <div className="text-xs text-white/55">Platforms</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {platformIds.map(id => <span key={id} className="rounded-md bg-white/5 px-2 py-1 text-xs">{platformNames[id] || id}</span>)}
          </div>
        </div>
        <div className="liquid-glass rounded-xl p-4">
          <div className="text-xs text-white/55">Total cost</div>
          <div className="mt-1 text-2xl font-semibold">{total} credits</div>
          <div className="text-xs text-white/40">{isAdmin ? 'Admin — free' : `Balance: ${balance}`}</div>
        </div>
      </div>

      <div className="mt-6 flex gap-2 border-b border-white/[.08] pb-2">
        {(['calendar', 'cost', 'brand'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === t ? 'bg-indigo-500 text-white' : 'text-white/60 hover:bg-white/[.05]'}`}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'calendar' && <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-white/[.08] bg-white/[.03] p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-white/80"><CalendarClock size={16} className="text-indigo-400"/> Posting option</label>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([['now', 'Publish Now'], ['later', 'Schedule for Later'], ['recurring', 'Recurring Schedule']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setPostingOption(value); setStartError('') }} className={`rounded-xl border px-3 py-2 text-xs ${postingOption === value ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-white/10 text-white/60 hover:bg-white/5'}`}>{label}</button>)}
          </div>
          {postingOption !== 'now' && <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-white/55">Date<input type="date" value={scheduleDate} onChange={e => { setScheduleDate(e.target.value); setStartError('') }} className="mt-1 w-full rounded-xl bg-white/[.05] px-3 py-2 text-sm text-white outline-none" /></label>
            <label className="text-xs text-white/55">Exact time<input type="time" step="60" value={scheduleTime} onChange={e => { setScheduleTime(e.target.value); setStartError('') }} className="mt-1 w-full rounded-xl bg-white/[.05] px-3 py-2 text-sm text-white outline-none" /></label>
            <label className="text-xs text-white/55">Timezone<select value={timezone} onChange={e => setTimezone(e.target.value)} className="mt-1 w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white outline-none">{Array.from(new Set([timezone, 'Africa/Lagos', 'UTC', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Kolkata'])).map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></label>
          </div>}
          {postingOption === 'recurring' && <p className="mt-3 text-xs text-white/50">The selected weekdays, start/end condition, and post count from your approved plan remain unchanged. This sets their exact local publishing time.</p>}
          {confirmation && <p className="mt-3 rounded-lg bg-indigo-500/10 p-3 text-xs text-indigo-200">{confirmation}</p>}
          {startError && <p className="mt-2 text-xs text-amber-300">{startError}</p>}
        </div>
        {Object.entries(groupedPosts).map(([day, posts]) => (
          <div key={day} className="rounded-2xl border border-white/[.08] bg-white/[.03] p-4">
            <h3 className="text-sm font-semibold text-white/80">{day}</h3>
            <div className="mt-3 space-y-3">
              {posts.map(post => (
                <div key={post.id} className="rounded-xl bg-white/[.04] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-indigo-300">{post.slot} · {new Date(post.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">{post.status === 'posted' ? 'Published' : post.status === 'pending_approval' ? 'Awaiting Approval' : post.status === 'scheduled' ? 'Scheduled' : post.status === 'publishing' ? 'Publishing' : post.status === 'failed' ? 'Failed' : post.status === 'cancelled' ? 'Cancelled' : 'Draft'}</span>
                  </div>
                  <p className="mt-1 text-xs text-white/70">{post.topic}</p>
                  <div className="mt-2 space-y-2">
                    {post.platforms.map(platform => (
                      <div key={platform} className="rounded-lg border border-white/[.06] bg-black/20 p-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[10px] font-medium text-white/50"><ConnectorIcon connector={getConnector(platform) || { id: platform, name: platformNames[platform] || platform, icon: 'bot', color: '#6366f1', authType: 'apiKey', description: '', triggers: [], actions: [], permissions: [] }}/> {platformNames[platform] || platform}</div>
                          {editing?.postId === post.id && editing?.platform === platform ? null : <button onClick={() => startEditPost(post.id, platform, post.captions[platform] || '')} className="text-[10px] text-indigo-300 hover:text-white">Edit</button>}
                        </div>
                        {editing?.postId === post.id && editing?.platform === platform ? (
                          <div className="mt-2 space-y-2">
                            <textarea value={editing.text} onChange={e => updatePostText(e.target.value)} className="min-h-[80px] w-full rounded-lg bg-white/[.05] p-2 text-xs text-white/90 outline-none placeholder:text-white/30" />
                            <div className="flex justify-end gap-2">
                              <button onClick={cancelEditPost} className="rounded-md border border-white/[.12] px-2 py-1 text-[10px] text-white/70 hover:bg-white/[.05]">Cancel</button>
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
                            ].map(([action, label]) => <button key={action} disabled={Boolean(reviewingPost)} onClick={() => reviewPost(post.id, action)} className="rounded-md border border-white/[.1] px-2 py-1 text-[10px] text-white/65 hover:bg-white/[.06] disabled:opacity-40">{reviewingPost === `${post.id}:${action}` ? 'Working...' : label}</button>)}
                            <button disabled={Boolean(reviewingPost)} onClick={() => { const tone = window.prompt('What tone should Alpha use?', brand.tone || 'professional'); if (tone) reviewPost(post.id, 'change_tone', tone) }} className="rounded-md border border-white/[.1] px-2 py-1 text-[10px] text-white/65 hover:bg-white/[.06] disabled:opacity-40">Change tone</button>
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

      {tab === 'cost' && <div className="mt-4 space-y-3 text-sm text-white/70">
        <div className="rounded-xl border border-white/[.08] bg-white/[.03] p-4">
          <p>AI writing: 3 credits × {campaign.meta.totalPosts} posts = {3 * campaign.meta.totalPosts}</p>
          {campaign.meta.includeImages && <p>Image generation: 2 credits × {campaign.meta.totalPosts} = {2 * campaign.meta.totalPosts}</p>}
          {campaign.meta.imageRequested && !campaign.meta.includeImages && <p className="text-amber-300">Image generation is not configured. This automation will publish text only and will not charge image credits.</p>}
          <p>Publishing: {platformIds.length} platform(s) × {campaign.meta.totalPosts} posts = {platformIds.length * campaign.meta.totalPosts}</p>
          <div className="mt-2 border-t border-white/[.08] pt-2 text-base font-semibold text-white">Total: {total} credits</div>
        </div>
        <p>Current balance: <span className="font-semibold">{isAdmin ? '∞' : balance}</span></p>
        {!canAfford && <p className="text-amber-300">You need {total - balance} more credits.</p>}
      </div>}

      {tab === 'brand' && <div className="mt-4 space-y-3">
        <p className="text-sm text-white/60">Tell Alpha about your business so the posts sound like you.</p>
        <input value={brand.business} onChange={e => setBrand({ ...brand, business: e.target.value })} placeholder="Business name" className="w-full rounded-xl bg-white/[.05] px-3 py-2 text-sm outline-none placeholder:text-white/30" />
        <input value={brand.audience} onChange={e => setBrand({ ...brand, audience: e.target.value })} placeholder="Target audience" className="w-full rounded-xl bg-white/[.05] px-3 py-2 text-sm outline-none placeholder:text-white/30" />
        <input value={brand.tone} onChange={e => setBrand({ ...brand, tone: e.target.value })} placeholder="Tone (e.g. professional, playful, bold)" className="w-full rounded-xl bg-white/[.05] px-3 py-2 text-sm outline-none placeholder:text-white/30" />
        <input value={brand.website} onChange={e => setBrand({ ...brand, website: e.target.value })} placeholder="Website (optional)" className="w-full rounded-xl bg-white/[.05] px-3 py-2 text-sm outline-none placeholder:text-white/30" />
        <input value={brand.dontPost} onChange={e => setBrand({ ...brand, dontPost: e.target.value })} placeholder="Topics to avoid, separated by commas" className="w-full rounded-xl bg-white/[.05] px-3 py-2 text-sm outline-none placeholder:text-white/30" />
        <button onClick={saveBrand} disabled={savingBrand} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-400 disabled:opacity-50">{savingBrand ? 'Saving...' : 'Save brand profile'}</button>
      </div>}

      <div className="mt-6 rounded-xl border border-white/[.08] bg-white/[.03] p-4">
        <h3 className="text-sm font-semibold">Required connections</h3>
        <div className="mt-2 space-y-2">
          {platformIds.map(id => {
            const connected = connectorConnected(id, integrationStatus)
            const C = getConnector(id) || { id, name: platformNames[id] || id, icon: 'bot', color: '#6366f1', authType: 'apiKey', description: '', triggers: [], actions: [], permissions: [] }
            return <div key={id} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2"><ConnectorIcon connector={C}/> {C.name}</span>
              {connected ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12}/> Connected personal profile</span> : <a href={`/connected-apps?service=${id}`} className="text-indigo-400 hover:underline">Connect</a>}
            </div>
          })}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="text-xs text-white/50">
          {!canActivate && (
            <span className="flex items-center gap-1.5 text-amber-300"><AlertCircle size={12}/>
              {missingBrand ? 'Fill brand profile first' : requiredConnectors.length ? `Connect ${requiredConnectors.join(', ')}` : !canAfford ? 'Not enough credits' : !startValid ? 'Pick a future start date & time' : 'Cannot activate'}
            </span>
          )}
        </div>
        {campaign.status === 'running' && <button type="button" onClick={cancelSchedule} disabled={activating} className="min-h-10 rounded-lg border border-red-400/30 px-4 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-40">Cancel</button>}
        <button
          type="button"
          onClick={() => activate()}
          disabled={!canActivate || activating}
          className="flex min-h-10 items-center gap-2 rounded-lg bg-indigo-500 px-5 text-sm text-white hover:bg-indigo-400 disabled:opacity-40"
        >
          {activating ? <LoaderCircle className="animate-spin" size={16}/> : <Sparkles size={16}/>}
          {postingOption === 'now' ? `Approve & Publish Now · ${total} credits` : campaign.status === 'running' ? 'Approve & Update Schedule' : `Approve & Schedule · estimated ${total} credits`}
        </button>
      </div>
    </div>
  </div>
}
