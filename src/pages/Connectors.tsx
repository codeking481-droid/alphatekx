import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, LoaderCircle, X, ExternalLink, AlertCircle, Bot, Activity, ChevronRight } from 'lucide-react'
import { FaLinkedin, FaGoogle, FaGithub, FaDiscord } from 'react-icons/fa6'
import { useAuth } from '../lib/auth'
import { getConnectedApps, connectProvider, disconnectProvider } from '../lib/connectors/connectorApi'
import { startLinkedInAuth } from '../lib/integrations'

function normalizeProviderId(provider: string) {
  return provider
}

const approvedPlatforms = ['linkedin', 'gmail', 'github', 'googledocs', 'googlesheets', 'discord'] as const
const composioOAuthProviders = new Set(approvedPlatforms.filter(id => id !== 'linkedin'))
const serverManagedProviders = new Set<string>()
const releasedPlatforms = [...approvedPlatforms]
const publicConnectorIds = new Set(releasedPlatforms)

const PLATFORM_LIST = [
  { id: 'linkedin', name: 'LinkedIn', icon: FaLinkedin, color: '#0A66C2', description: 'Professional publishing', native: true },
  { id: 'gmail', name: 'Gmail', icon: FaGoogle, color: '#EA4335', description: 'Email and attachments', native: false },
  { id: 'github', name: 'GitHub', icon: FaGithub, color: '#181717', description: 'Repo and issue automation', native: false },
  { id: 'googledocs', name: 'Google Docs', icon: FaGoogle, color: '#4285F4', description: 'Document generation', native: false },
  { id: 'googlesheets', name: 'Google Sheets', icon: FaGoogle, color: '#34A853', description: 'Spreadsheet workflows', native: false },
  { id: 'discord', name: 'Discord', icon: FaDiscord, color: '#5865F2', description: 'Server alerts and channels', native: false },
]

function verifiedOAuthDestination(value: string) {
  const destination = new URL(value, window.location.origin)
  const localHttp = destination.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(destination.hostname)
  if (destination.protocol !== 'https:' && !localHttp) throw new Error('The provider returned an unsafe OAuth link. Please retry.')
  return destination.toString()
}

export default function Connectors() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [noticeKind, setNoticeKind] = useState<'success' | 'error'>('error')
  const platformParam = searchParams.get('platform') || searchParams.get('service')
  const requestedReturnTo = searchParams.get('returnTo') || '/dashboard'
  const returnTo = requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '/dashboard'
  const service = (id: string) => ({ connected: connected.has(id), ready: connected.has(id) })
  void serverManagedProviders

  useEffect(() => {
    if (!session?.access_token) {
      setConnected(new Set())
      return
    }
    setConnected(new Set())
    let cancelled = false
    const check = async () => {
      try {
        const apps = await getConnectedApps(session.access_token)
        const ready = new Set<string>()
        for (const provider of apps.providers || []) {
          const state = { connected: provider.connected === true, ready: provider.ready === true || provider.status === 'connected' || provider.status === 'active' }
          if (state.connected && state.ready) ready.add(normalizeProviderId(provider.provider))
        }
        if (!cancelled) {
          const merged = new Set([...ready])
          setConnected(merged)
        }
      } catch (error) {
        if (!cancelled) {
          setConnected(new Set())
          setNoticeKind('error')
          setNotice(error instanceof Error ? error.message : 'Could not load connected apps. Please retry.')
        }
      }
    }
    void check()
    return () => { cancelled = true }
  }, [session?.access_token, session?.user?.id])

  useEffect(() => {
    if (!session?.access_token || !searchParams.has('connected')) return
    const returnedProvider = normalizeProviderId(searchParams.get('provider') || platformParam || '')
    if (!returnedProvider) return
    let cancelled = false
    let attempts = 0
    const confirm = async () => {
      attempts += 1
      try {
        const apps = await getConnectedApps(session.access_token)
        const provider = (apps.providers || []).find(item => normalizeProviderId(item.provider) === returnedProvider)
        if (provider?.connected === true && (provider.ready === true || provider.status === 'connected' || provider.status === 'active')) {
          if (cancelled) return
          setConnected(prev => new Set([...prev, returnedProvider]))
          setNoticeKind('success')
          setNotice(`${returnedProvider} connected successfully. Returning to Alpha…`)
          window.setTimeout(() => { if (!cancelled) navigate(returnTo) }, 900)
          return
        }
      } catch (error) {
        if (!cancelled && attempts >= 12) {
          setNoticeKind('error')
          setNotice(error instanceof Error ? error.message : 'Connection confirmation failed. Please retry.')
        }
      }
      if (!cancelled && attempts < 12) window.setTimeout(() => void confirm(), 1000)
      else if (!cancelled) {
        setNoticeKind('error')
        setNotice(`${returnedProvider} authorization returned, but the connection is not active yet. Please reconnect.`)
      }
    }
    void confirm()
    return () => { cancelled = true }
  }, [navigate, platformParam, returnTo, searchParams, session?.access_token])

  const handleConnect = async (platformId: string) => {
    if (!session?.access_token) return
    setConnecting(platformId)
    setNotice('')
    try {
      // Native connections open OAuth directly
      if (platformId === 'linkedin') {
        await startLinkedInAuth(session.access_token, returnTo)
        return
      }
      // Composio connections
      const result = await connectProvider(platformId, session.access_token, returnTo)
      if (result.authUrl) {
        window.location.assign(verifiedOAuthDestination(result.authUrl))
      } else {
        setConnected(prev => {
          const next = new Set(prev)
          next.add(platformId)
          return next
        })
        setNoticeKind('success')
        setNotice(`${platformId} connected successfully.`)
      }
    } catch (error) {
      setNoticeKind('error')
      setNotice(error instanceof Error ? error.message : 'Connection failed. Please try again.')
    } finally {
      setConnecting(null)
    }
  }

  const handleDisconnect = async (platformId: string) => {
    if (!session?.access_token) return
    setDisconnecting(platformId)
    setNotice('')
    try {
      const result = await disconnectProvider(platformId, session.access_token)
      if (result.success && result.disconnected) {
        setConnected(prev => {
          const next = new Set(prev)
          next.delete(platformId)
          return next
        })
        setNoticeKind('success')
        setNotice(`${platformId} disconnected successfully.`)
      } else {
        setNotice('Disconnect failed. Please try again.')
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Disconnect failed. Please try again.')
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0A0B] px-3 py-4 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-6xl">
        <button onClick={() => navigate(returnTo)} className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-400 transition-colors hover:text-zinc-200">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="rounded-2xl border border-zinc-800 bg-[#0F0F0F] p-4 shadow-xl sm:p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg">
              <ExternalLink size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Connected Apps</h1>
              <p className="text-sm text-zinc-400">Connect once, return to Alpha, and manage every live job in one workspace.</p>
            </div>
          </div>

          {/* Trust Banner */}
          <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs text-zinc-400">
              <span className="font-semibold text-indigo-400">Secured by AlphaTekx and Composio</span>
              <br />OAuth credentials stay server-side. Alpha shows Connected only after the provider confirms the account.
            </p>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Automation workflow">
            <button onClick={() => navigate('/connected-apps')} className="flex min-h-14 items-center gap-3 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 text-left"><span className="grid size-7 place-items-center rounded-full bg-indigo-500 text-xs font-black text-white">1</span><span><strong className="block text-sm text-white">Connect</strong><span className="text-xs text-zinc-400">Choose a secure app</span></span></button>
            <button onClick={() => navigate('/automations')} className="flex min-h-14 items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 text-left transition hover:border-violet-400/30"><Bot size={20} className="text-violet-300"/><span className="flex-1"><strong className="block text-sm text-white">Ask Alpha</strong><span className="text-xs text-zinc-400">Describe the result</span></span><ChevronRight size={15} className="text-zinc-500"/></button>
            <button onClick={() => navigate('/active-automations')} className="flex min-h-14 items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 text-left transition hover:border-emerald-400/30"><Activity size={20} className="text-emerald-300"/><span className="flex-1"><strong className="block text-sm text-white">Running</strong><span className="text-xs text-zinc-400">Track confirmed work</span></span><ChevronRight size={15} className="text-zinc-500"/></button>
          </div>

          {notice && (
            <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${noticeKind === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/20 bg-rose-500/10 text-rose-300'}`}>
              {noticeKind === 'success' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
              <span className="flex-1">{notice}</span>
              <button onClick={() => setNotice('')} className="text-rose-400 hover:text-rose-300"><X size={14} /></button>
            </div>
          )}

          <p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Public tools active</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PLATFORM_LIST.filter(platform => publicConnectorIds.has(platform.id) || Boolean((platform as { comingSoon?: boolean }).comingSoon)).map(pl => {
              const id = pl.id
              const isConnected = service(id).connected && service(id).ready
              const isConnecting = connecting === pl.id
              const isDisconnecting = disconnecting === pl.id
              const isHighlighted = platformParam === pl.id
              const Icon = pl.icon
              const isComingSoon = Boolean((pl as { comingSoon?: boolean }).comingSoon)
              return (
                <div
                  key={pl.id}
                  className={`flex min-h-28 flex-col items-stretch gap-3 rounded-xl border p-4 transition-all sm:flex-row sm:items-center ${
                    isHighlighted ? 'border-indigo-500/50 bg-indigo-500/10' : isConnected ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                  }`}
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: pl.color + '15' }}>
                    <Icon style={{ color: pl.color }} size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{pl.name}</p>
                    <p className="text-xs text-zinc-500">{pl.description}</p>
                    {isComingSoon && <p className="mt-1 text-[11px] font-medium text-amber-400">Coming soon</p>}
                  </div>
                  {isConnected ? (
                    <div className="flex items-center justify-between gap-2 sm:shrink-0">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                        <CheckCircle2 size={14} /> Connected
                      </span>
                      <button
                        onClick={() => void handleDisconnect(pl.id)}
                        disabled={isDisconnecting}
                        className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:text-white disabled:opacity-40"
                      >
                        {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => void handleConnect(pl.id)}
                      disabled={isConnecting || isComingSoon}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-all shrink-0"
                    >
                      {isConnecting ? <LoaderCircle className="animate-spin" size={14} /> : <ExternalLink size={14} />}
                      {isConnecting ? 'Connecting...' : isComingSoon ? 'Coming Soon' : 'Connect'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-6 flex flex-col gap-2 border-t border-white/5 pt-5 sm:flex-row sm:justify-center">
            <button onClick={() => { window.location.href = '/dashboard' }} className="min-h-11 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 text-sm font-black text-white shadow-lg shadow-violet-950/30">Return to Alpha</button>
            <button onClick={() => navigate('/active-automations')} className="min-h-11 rounded-xl border border-white/10 px-5 text-sm font-bold text-zinc-200">View running automations</button>
          </div>

          <p className="mt-5 text-xs text-zinc-500 text-center">
            <span className="font-semibold text-indigo-400">AlphaTekx</span> × <span className="font-semibold text-indigo-400">Composio</span> — secure managed connections
          </p>
        </div>
      </div>
    </main>
  )
}
