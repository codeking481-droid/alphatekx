import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ExternalLink, LoaderCircle, Plug, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { getConnectedApps, connectProvider } from '../lib/connectors/connectorApi'

const PLATFORM_LIST = [
  { id: 'x', label: 'X / Twitter', icon: '🐦', description: 'Posts and threads' },
  { id: 'instagram', label: 'Instagram', icon: '📸', description: 'Posts, reels and stories' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', description: 'Professional publishing' },
  { id: 'gmail', label: 'Gmail', icon: '📧', description: 'Email and attachments' },
  { id: 'youtube', label: 'YouTube', icon: '🎬', description: 'Videos and channel actions' },
  { id: 'facebook', label: 'Facebook', icon: '👍', description: 'Pages and publishing' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵', description: 'Short-form video' },
]

export default function Connectors() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const [connecting, setConnecting] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const platformParam = searchParams.get('platform')

  useEffect(() => {
    if (!session?.access_token) return
    const check = async () => {
      try {
        const apps = await getConnectedApps(session.access_token)
        const ready = new Set<string>()
        for (const provider of apps.providers) {
          if (provider.connected) ready.add(provider.provider === 'twitter' ? 'x' : provider.provider)
        }
        setConnected(ready)
      } catch {}
    }
    void check()
  }, [session?.access_token])

  const handleConnect = async (platformId: string) => {
    if (!session?.access_token) return
    setConnecting(platformId)
    setNotice('')
    try {
      const result = await connectProvider(platformId, session.access_token)
      if (result.authUrl) {
        window.location.href = result.authUrl
      } else {
        setNotice(`${platformId} connection initiated.`)
        setConnected(prev => new Set(prev).add(platformId))
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Connection failed.')
    } finally {
      setConnecting(null)
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0F1E] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <button onClick={() => navigate(-1)} className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-zinc-400 hover:text-zinc-200">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-white">Connected Apps</h1>
          <p className="mt-1 text-sm text-zinc-400">Connect your platforms to enable automations.</p>

          {/* Trust Banner */}
          <div className="mt-5 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] p-4">
            <p className="text-xs font-semibold text-zinc-400">
              <span className="text-indigo-300">🔒 Secured by AlphaTekX × Composio</span> — Enterprise-grade SOC2 Certified · 256-bit Encrypted · Trusted by 100k+ businesses · We never store your passwords
            </p>
          </div>

          {notice && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">
              <span>{notice}</span>
              <button onClick={() => setNotice('')}><X size={14} /></button>
            </div>
          )}

          <div className="mt-6 space-y-2.5">
            {PLATFORM_LIST.map(pl => {
              const isConnected = connected.has(pl.id)
              const isConnecting = connecting === pl.id
              const isHighlighted = platformParam === pl.id
              return (
                <div
                  key={pl.id}
                  className={`flex items-center gap-4 rounded-xl border p-4 transition ${
                    isHighlighted ? 'border-indigo-500/50 bg-indigo-500/15' : 'border-violet-400/15 bg-violet-500/[0.06]'
                  }`}
                >
                  <span className="text-2xl">{pl.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{pl.label}</p>
                    <p className="text-xs text-zinc-500">{pl.description}</p>
                  </div>
                  {isConnected ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 size={14} /> Connected
                    </span>
                  ) : (
                    <button
                      onClick={() => void handleConnect(pl.id)}
                      disabled={isConnecting}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
                    >
                      {isConnecting ? <LoaderCircle className="animate-spin" size={14} /> : <Plug size={14} />}
                      {isConnecting ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Trust Banner at bottom */}
        <div className="mt-6 rounded-xl border border-violet-400/15 bg-violet-500/[0.06] p-4 text-center">
          <p className="text-xs text-zinc-500">
            <span className="font-semibold text-indigo-300">AlphaTekX</span> × <span className="font-semibold text-indigo-300">Composio</span>
            <br />Enterprise-grade security · SOC2 Certified · 256-bit encryption
          </p>
        </div>
      </div>
    </main>
  )
}