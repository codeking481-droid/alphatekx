import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, LoaderCircle, RefreshCw, Unplug } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { ConnectorIcon } from '../components/agents/ConnectorIcon'
import { getConnector } from '../lib/agents/connectorRegistry'
import type { Connector } from '../lib/agents/types'
import { useAuth } from '../lib/auth'
import { connectProvider, disconnectProvider, getConnectedApps, reconnectProvider, type ConnectedAppStatus } from '../lib/connectors/connectorApi'
import { deleteIntegration, getIntegrationStatus, startCustomOAuth, startLinkedInAuth } from '../lib/integrations'

const CACHE_KEY = 'alphatekx_connections_cache'
const CACHE_TTL = 5 * 60_000
const composioOAuthProviders = new Set(['gmail', 'github', 'googledocs', 'googlesheets', 'discord', 'whatsapp', 'facebook', 'instagram', 'youtube', 'x'])
const customOAuthProviders = new Set(['tiktok', 'snapchat'])
const nativeOAuthProviders = new Set(['linkedin'])
const serverManagedProviders = new Set<string>()
// Public tools active. Readiness remains equivalent to service(id).connected && service(id).ready.

function backendReady(state: { connected?: boolean; ready?: boolean }) {
  return Boolean(state.connected && state.ready)
}

const releasedPlatforms = [
  { id: 'x', name: 'X', color: '#111827', description: 'Securely publish posts and threads through your connected account.', authMode: 'Managed' },
  { id: 'linkedin', name: 'LinkedIn', color: '#0A66C2', description: 'Secure personal-profile publishing with confirmed post IDs.', authMode: 'Native' },
  { id: 'tiktok', name: 'TikTok', color: '#111827', description: 'Custom TikTok API foundation awaiting approved app credentials.', authMode: 'Custom API', comingSoon: true },
  { id: 'snapchat', name: 'Snapchat', color: '#EAB308', description: 'Custom Snapchat API foundation awaiting approved app credentials.', authMode: 'Custom API', comingSoon: true },
  { id: 'gmail', name: 'Gmail', color: '#EA4335', description: 'Send and manage approved business email.', authMode: 'Managed' },
  { id: 'github', name: 'GitHub', color: '#334155', description: 'Read code and manage repository work.', authMode: 'Managed' },
  { id: 'googledocs', name: 'Google Docs', color: '#4285F4', description: 'Create and update proposals and documents.', authMode: 'Managed' },
  { id: 'googlesheets', name: 'Google Sheets', color: '#0F9D58', description: 'Read orders, inventory, and append rows.', authMode: 'Managed' },
  { id: 'discord', name: 'Discord', color: '#5865F2', description: 'Send approved team messages.', authMode: 'Managed' },
  { id: 'instagram', name: 'Instagram', color: '#C13584', description: 'Posts and reels through your connected account.', authMode: 'Managed' },
  { id: 'facebook', name: 'Facebook', color: '#1877F2', description: 'Facebook Page publishing.', authMode: 'Managed' },
  { id: 'youtube', name: 'YouTube', color: '#FF0033', description: 'Upload videos from your Media Library.', authMode: 'Managed' },
  { id: 'whatsapp', name: 'WhatsApp', color: '#25D366', description: 'Advanced Business API messaging.', authMode: 'Managed' },
] as const
const publicConnectorIds = new Set(releasedPlatforms.map(platform => platform.id))

function withDeadline<T>(operation: Promise<T>, timeoutMs = 12_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Connection status took too long. You can still connect or retry.')), timeoutMs)
    operation.then(
      value => { window.clearTimeout(timer); resolve(value) },
      error => { window.clearTimeout(timer); reject(error) },
    )
  })
}

function fallbackConnector(id: string, name: string): Connector {
  return { id, name, icon: id === 'youtube' ? 'video' : 'plug', authType: 'oauth', category: 'Connected Apps', color: '#8B5CF6', description: '', triggers: [], actions: [], permissions: [] }
}

export default function Connectors() {
  const { session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPlatform = searchParams.get('platform') || searchParams.get('service')
  void requestedPlatform
  void serverManagedProviders
  const [native, setNative] = useState<Record<string, { connected?: boolean; ready?: boolean }>>({})
  const [composio, setComposio] = useState<Record<string, ConnectedAppStatus>>({})
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [wabaReady, setWabaReady] = useState(false)
  const slowTimer = useRef<number | null>(null)
  const autoStarted = useRef(false)

  const applyProviders = (providers: ConnectedAppStatus[]) => {
    const unique = new Map<string, ConnectedAppStatus>()
    for (const provider of providers) unique.set(provider.provider === 'twitter' ? 'x' : provider.provider, provider)
    setComposio(Object.fromEntries(unique))
  }

  const load = async () => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
      if (cached?.timestamp && Date.now() - cached.timestamp < CACHE_TTL && Array.isArray(cached.providers)) {
        applyProviders(cached.providers)
        if (cached.native && typeof cached.native === 'object') setNative(cached.native)
        setLoading(false)
      }
    } catch {}
    const [nativeResult, connectedResult] = await Promise.allSettled([
      withDeadline(getIntegrationStatus(session?.access_token)),
      getConnectedApps(session?.access_token),
    ])
    if (nativeResult.status === 'fulfilled') setNative(nativeResult.value)
    if (connectedResult.status === 'fulfilled') applyProviders(connectedResult.value.providers)
    if (nativeResult.status === 'fulfilled' || connectedResult.status === 'fulfilled') {
      const nativeValue = nativeResult.status === 'fulfilled' ? nativeResult.value : native
      const providerValue = connectedResult.status === 'fulfilled' ? connectedResult.value.providers : Object.values(composio)
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ providers: providerValue, native: nativeValue, timestamp: Date.now() })) } catch {}
      setNotice('')
    } else {
      console.error('[Connections]', nativeResult.reason, connectedResult.reason)
      const reason = connectedResult.reason || nativeResult.reason
      setNotice(reason instanceof Error ? reason.message : 'Could not refresh connections.')
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [session?.access_token])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const provider = searchParams.get('provider') || connected
    if (connected && connected !== 'error') {
      setNotice(`${releasedPlatforms.find(item => item.id === provider)?.name || 'Platform'} connected successfully.`)
      void load()
    } else if (connected === 'error') {
      setNotice(searchParams.get('reason') || searchParams.get('error') || 'Connection was not completed.')
    }
    if (connected) {
      const next = new URLSearchParams(searchParams)
      for (const key of ['connected', 'provider', 'reason', 'error', 'success']) next.delete(key)
      setSearchParams(next, { replace: true })
    }
  }, [searchParams])

  useEffect(() => () => { if (slowTimer.current) window.clearTimeout(slowTimer.current) }, [])

  const status = useMemo(() => Object.fromEntries(releasedPlatforms.map(platform => {
    const connected = nativeOAuthProviders.has(platform.id)
      ? backendReady(native[platform.id] || {})
      : customOAuthProviders.has(platform.id)
        ? backendReady(native[platform.id] || {})
      : composio[platform.id]?.connected === true
    return [platform.id, connected]
  })), [native, composio])

  const connect = async (id: string, name: string) => {
    if (connecting) return
    if (!publicConnectorIds.has(id as (typeof releasedPlatforms)[number]['id'])) {
      setNotice('This connection is not available in the public workspace.')
      return
    }
    setConnecting(id)
    setSlow(false)
    setNotice(`Connecting to ${name}…`)
    slowTimer.current = window.setTimeout(() => setSlow(true), 10_000)
    try {
      const selected = releasedPlatforms.find(item => item.id === id)
      if (selected && 'comingSoon' in selected && selected.comingSoon) throw new Error(`${name} custom API is coming soon. No credentials were saved.`)
      if (id === 'linkedin') {
        await startLinkedInAuth(session?.access_token, '/connected-apps')
        return
      }
      if (customOAuthProviders.has(id)) {
        await startCustomOAuth(id as 'tiktok' | 'snapchat', session?.access_token)
        return
      }
      if (!composioOAuthProviders.has(id)) throw new Error('This platform does not have a released connection flow.')
      const result = status[id] ? await reconnectProvider(id, session?.access_token) : await connectProvider(id, session?.access_token)
      if (!result.authUrl) throw new Error(`${name} did not return a secure connection URL.`)
      window.location.assign(result.authUrl)
    } catch (error) {
      console.error('[Composio]', error)
      setNotice(error instanceof Error ? error.message : `${name} connection failed.`)
      setConnecting(null)
    } finally {
      if (slowTimer.current) window.clearTimeout(slowTimer.current)
    }
  }

  const disconnect = async (id: string) => {
    if (!window.confirm(`Disconnect ${releasedPlatforms.find(item => item.id === id)?.name || id}?`)) return
    setDisconnecting(id)
    setNotice('')
    try {
      if (nativeOAuthProviders.has(id) || customOAuthProviders.has(id)) {
        await deleteIntegration(id, session?.access_token)
        setNative(current => ({ ...current, [id]: { connected: false, ready: false } }))
      } else {
        await disconnectProvider(id, session?.access_token)
        setComposio(current => ({
          ...current,
          [id]: {
            ...(current[id] || { provider: id }),
            connected: false,
            status: 'disconnected',
            connectionId: undefined,
          },
        }))
      }
      try { localStorage.removeItem(CACHE_KEY) } catch {}
      setNotice(`${releasedPlatforms.find(item => item.id === id)?.name || id} disconnected successfully.`)
    } catch (error) {
      console.error('[Composio]', error)
      setNotice(error instanceof Error ? error.message : 'Disconnect failed.')
    } finally { setDisconnecting(null) }
  }

  useEffect(() => {
    if (autoStarted.current || searchParams.get('autostart') !== '1' || !requestedPlatform) return
    const platform = releasedPlatforms.find(item => item.id === requestedPlatform)
    if (!platform) return
    autoStarted.current = true
    void connect(platform.id, platform.name)
  }, [requestedPlatform, searchParams])

  return <main className="relative mx-auto min-h-[calc(100dvh-8rem)] w-full min-w-0 max-w-5xl overflow-x-hidden px-4 pb-28 pt-7 text-white sm:px-6 sm:py-8">
    <p className="text-xs font-black uppercase tracking-[.18em] text-violet-300">AlphaTekx connections</p>
    <h1 className="mt-2 text-3xl font-black">Super Computer Connections</h1>
    <p className="mt-2 text-sm font-semibold text-slate-300">Connect once. AlphaTekx uses the approved account only when your reviewed automation runs.</p>
    <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/10 px-4 py-3 text-sm font-black text-emerald-100"><CheckCircle2 size={17} className="shrink-0"/>Connections are secured by Composio and AlphaTekx OAuth. Provider tokens are never exposed in your browser.</div>
    <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/10 p-3 text-sm font-bold text-emerald-100">No data? Upload with small data. AlphaTekx posts even when your phone is off.</div>

    {notice && <div role="status" className="mt-4 rounded-xl border border-violet-300/20 bg-violet-300/10 p-3 text-sm font-bold text-violet-100">{notice}</div>}
    {slow && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm font-bold text-amber-100">Network slow? <button onClick={() => { setConnecting(null); setSlow(false); void load() }} className="ml-2 underline">Retry connection</button></div>}

    <div className="mt-6">
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search connected tools" className="min-h-12 rounded-xl border border-violet-300/20 bg-slate-950/30 px-4 font-bold text-white outline-none placeholder:text-slate-400 focus:border-violet-400"/>
    </div>

    {loading ? <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{releasedPlatforms.map(item => <div key={item.id} className="skeleton h-52 rounded-[20px]"/>)}</div> :
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {releasedPlatforms.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase())).map(item => {
          const connected = status[item.id]
          const comingSoon = 'comingSoon' in item && item.comingSoon
          const busy = connecting === item.id
          const removing = disconnecting === item.id
          const connector = getConnector(item.id) || fallbackConnector(item.id, item.name)
          return <Fragment key={item.id}>
          <article id={`platform-${item.id}`} className="liquid-glass min-w-0 rounded-[20px] p-4 sm:p-5">
            <div className="flex items-center gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-sm" style={{ background: item.id === 'instagram' ? 'linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)' : item.color }}><ConnectorIcon connector={connector} className="size-6 text-white"/></span><div><h2 className="font-black">{item.name}</h2><div className="mt-1"><span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${connected ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : 'border-violet-400/20 bg-violet-500/10 text-slate-300'}`}>{connected ? '● Connected' : '○ Not Connected'}</span></div></div></div>
            <p className="mt-4 min-h-10 text-xs font-semibold text-slate-300">{item.description}</p>
            <p className="mt-2 text-[11px] font-bold text-slate-400">{connected ? '1 active connection' : '0 active connections'}</p>
            {item.id === 'whatsapp' && <div className="mt-3 text-xs text-slate-300"><p>Requires an approved 15-digit WABA ID from Meta Business Suite. Regular WhatsApp sellers can skip this.</p>{wabaReady && <a href="https://business.facebook.com/settings/whatsapp-business-accounts" target="_blank" rel="noreferrer" className="mt-2 inline-block text-violet-300 underline">How to get a WABA ID</a>}</div>}
            {item.id === 'whatsapp' && !connected && !wabaReady ? <div className="mt-4 grid gap-2"><button onClick={() => setWabaReady(true)} className="min-h-11 rounded-xl bg-[#7C3AED] px-3 text-sm font-black">I have WABA ID — Connect</button><button onClick={() => { setNotice('WhatsApp skipped. Instagram and Facebook are ready.'); document.getElementById('platform-instagram')?.scrollIntoView({ behavior: 'smooth' }) }} className="min-h-11 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 text-sm font-bold">I don’t have one — Skip</button></div> :
              <div className={`mt-4 grid min-w-0 gap-2 ${connected ? 'grid-cols-2' : 'grid-cols-1'}`}><button onClick={() => void connect(item.id, item.name)} disabled={Boolean(connecting || disconnecting || comingSoon)} className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-[#7C3AED] px-3 text-sm font-black disabled:opacity-50">{busy ? <LoaderCircle className="shrink-0 animate-spin" size={16}/> : connected ? <RefreshCw className="shrink-0" size={16}/> : <CheckCircle2 className="shrink-0" size={16}/>}{comingSoon ? 'Coming Soon' : busy ? 'Connecting…' : connected ? 'Reconnect' : 'Connect'}</button>{connected && <button onClick={() => void disconnect(item.id)} disabled={Boolean(connecting || disconnecting)} aria-label={`Disconnect ${item.name}`} className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 text-sm font-black text-rose-200 transition hover:bg-rose-300/15 disabled:opacity-50">{removing ? <LoaderCircle className="shrink-0 animate-spin" size={16}/> : <Unplug className="shrink-0" size={16}/>}<span>{removing ? 'Disconnecting…' : 'Disconnect'}</span></button>}</div>}
          </article></Fragment>
        })}
      </section>}
    <p className="mt-6 text-center text-xs font-semibold text-slate-400">Paste HTML to host a site instantly. Upload once; AlphaTekx’s offline queue handles scheduled publishing.</p>
  </main>
}
