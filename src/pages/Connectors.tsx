import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, LoaderCircle, X, ExternalLink, AlertCircle } from 'lucide-react'
import { FaFacebook, FaInstagram, FaLinkedin, FaXTwitter, FaTiktok, FaYoutube, FaGoogle, FaGithub, FaDiscord } from 'react-icons/fa6'
import { useAuth } from '../lib/auth'
import { getConnectedApps, connectProvider, disconnectProvider } from '../lib/connectors/connectorApi'
import { startLinkedInAuth, startGmailConnection } from '../lib/integrations'

function normalizeProviderId(provider: string) {
  return provider === 'twitter' ? 'x' : provider
}

function connectedCacheKey(userId?: string) {
  return `alphatekx:connected-platforms:${userId || 'anonymous'}`
}

const PLATFORM_LIST = [
  { id: 'linkedin', label: 'LinkedIn', icon: FaLinkedin, color: '#0A66C2', description: 'Professional publishing', native: true },
  { id: 'gmail', label: 'Gmail', icon: FaGoogle, color: '#EA4335', description: 'Email and attachments', native: true },
  { id: 'github', label: 'GitHub', icon: FaGithub, color: '#181717', description: 'Repo and issue automation', native: false },
  { id: 'googledocs', label: 'Google Docs', icon: FaGoogle, color: '#4285F4', description: 'Document generation', native: false },
  { id: 'googlesheets', label: 'Google Sheets', icon: FaGoogle, color: '#34A853', description: 'Spreadsheet workflows', native: false },
  { id: 'discord', label: 'Discord', icon: FaDiscord, color: '#5865F2', description: 'Server alerts and channels', native: false },
  { id: 'whatsapp', label: 'WhatsApp', icon: FaGoogle, color: '#25D366', description: 'Business messaging', native: false },
  { id: 'facebook', label: 'Facebook', icon: FaFacebook, color: '#1877F2', description: 'Pages and publishing', native: false },
  { id: 'instagram', label: 'Instagram', icon: FaInstagram, color: '#E4405F', description: 'Posts, reels and stories', native: false },
  { id: 'x', label: 'X / Twitter', icon: FaXTwitter, color: '#000000', description: 'Posts and threads', native: false },
  { id: 'youtube', label: 'YouTube', icon: FaYoutube, color: '#FF0000', description: 'Videos and channel actions', native: false },
  { id: 'tiktok', label: 'TikTok', icon: FaTiktok, color: '#000000', description: 'Short-form video', native: false, comingSoon: true },
  { id: 'snapchat', label: 'Snapchat', icon: FaTiktok, color: '#FFFC00', description: 'Stories and creative campaigns', native: false, comingSoon: true },
]

export default function Connectors() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [connected, setConnected] = useState<Set<string>>(() => {
    try {
      const cached = localStorage.getItem(connectedCacheKey(session?.user?.id))
      if (cached) return new Set(JSON.parse(cached))
    } catch {}
    return new Set()
  })
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const platformParam = searchParams.get('platform')

  useEffect(() => {
    const userId = session?.user?.id || 'anonymous'
    if (!session?.access_token) {
      setConnected(new Set())
      try { localStorage.removeItem(connectedCacheKey(userId)) } catch {}
      return
    }
    setConnected(new Set())
    let cancelled = false
    const check = async () => {
      try {
        const [apps, integrationStatus] = await Promise.allSettled([
          getConnectedApps(session.access_token),
          import('../lib/integrations').then(({ getIntegrationStatus }) => getIntegrationStatus(session.access_token))
        ])
        const ready = new Set<string>()
        if (apps.status === 'fulfilled') {
          for (const provider of apps.value.providers || []) {
            if (provider.connected) ready.add(normalizeProviderId(provider.provider))
          }
        }
        if (integrationStatus.status === 'fulfilled') {
          const status = integrationStatus.value as Record<string, { connected?: boolean }> | undefined
          if (status?.linkedin?.connected) ready.add('linkedin')
          if (status?.gmail?.connected) ready.add('gmail')
        }
        if (!cancelled) {
          const merged = new Set([...ready])
          setConnected(merged)
          try { localStorage.setItem(connectedCacheKey(userId), JSON.stringify([...merged])) } catch {}
        }
      } catch {
        if (!cancelled) {
          const cached = localStorage.getItem(connectedCacheKey(userId))
          if (cached) {
            try { setConnected(new Set(JSON.parse(cached))) } catch {}
          }
        }
      }
    }
    void check()
    return () => { cancelled = true }
  }, [session?.access_token, session?.user?.id])

  const handleConnect = async (platformId: string) => {
    if (!session?.access_token) return
    setConnecting(platformId)
    setNotice('')
    try {
      // Native connections open OAuth directly
      if (platformId === 'linkedin') {
        await startLinkedInAuth(session.access_token, '/connected-apps')
        return
      }
      if (platformId === 'gmail') {
        await startGmailConnection(session.access_token, '/connected-apps')
        return
      }
      // Composio connections
      const result = await connectProvider(platformId, session.access_token)
      if (result.authUrl) {
        window.location.href = result.authUrl
      } else {
        setConnected(prev => {
          const next = new Set(prev)
          next.add(platformId)
          try { localStorage.setItem(connectedCacheKey(session?.user?.id), JSON.stringify([...next])) } catch {}
          return next
        })
        setNotice(`${platformId} connected successfully.`)
      }
    } catch (error) {
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
          try { localStorage.setItem(connectedCacheKey(session?.user?.id), JSON.stringify([...next])) } catch {}
          return next
        })
        setNotice(`disconnected successfully — status: 'disconnected'`)
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
    <main className="min-h-screen bg-[#0A0A0B] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <button onClick={() => navigate(-1)} className="mb-6 flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-zinc-200 transition-colors">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="rounded-2xl border border-zinc-800 bg-[#0F0F0F] p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-1">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white shadow-lg">
              <ExternalLink size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Connected Apps</h1>
              <p className="text-sm text-zinc-500">Connect your platforms to enable automations</p>
            </div>
          </div>

          {/* Trust Banner */}
          <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs text-zinc-400">
              <span className="font-semibold text-indigo-400">🔒 Secured by AlphaTekX × Composio</span>
              <br />Enterprise-grade SOC2 Certified · 256-bit Encrypted · 100k+ businesses trust us
            </p>
          </div>

          {notice && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span className="flex-1">{notice}</span>
              <button onClick={() => setNotice('')} className="text-rose-400 hover:text-rose-300"><X size={14} /></button>
            </div>
          )}

          <div className="mt-6 space-y-2">
            {PLATFORM_LIST.map(pl => {
              const isConnected = connected.has(pl.id)
              const isConnecting = connecting === pl.id
              const isDisconnecting = disconnecting === pl.id
              const isHighlighted = platformParam === pl.id
              const Icon = pl.icon
              const isComingSoon = Boolean((pl as { comingSoon?: boolean }).comingSoon)
              return (
                <div
                  key={pl.id}
                  className={`flex items-center gap-4 rounded-xl border p-4 transition-all ${
                    isHighlighted ? 'border-indigo-500/50 bg-indigo-500/10' : isConnected ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                  }`}
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: pl.color + '15' }}>
                    <Icon style={{ color: pl.color }} size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{pl.label}</p>
                    <p className="text-xs text-zinc-500">{pl.description}</p>
                    {isComingSoon && <p className="mt-1 text-[11px] font-medium text-amber-400">Coming soon</p>}
                  </div>
                  {isConnected ? (
                    <div className="flex items-center gap-2 shrink-0">
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

          <p className="mt-5 text-xs text-zinc-500 text-center">
            <span className="font-semibold text-indigo-400">AlphaTekX</span> × <span className="font-semibold text-indigo-400">Composio</span> — Enterprise security
          </p>
        </div>
      </div>
    </main>
  )
}