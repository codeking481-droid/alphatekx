import { useEffect, useMemo, useState } from 'react'
import { Check, CheckCircle2, ChevronRight, LoaderCircle, Plug, RefreshCw, Search, Unplug, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { ConnectorIcon } from '../components/agents/ConnectorIcon'
import { getConnector } from '../lib/agents/connectorRegistry'
import type { Connector } from '../lib/agents/types'
import { useAuth } from '../lib/auth'
import { connectProvider, disconnectProvider, getConnectedApps, reconnectProvider, type ConnectedAppStatus } from '../lib/connectors/connectorApi'
import { deleteIntegration, disconnectGoogle, getFacebookPages, getIntegrationStatus, saveConnector, selectFacebookPage, startFacebookAuth, startGmailConnection, startLinkedInAuth, testConnector, type IntegrationStatus } from '../lib/integrations'

const apiKeyAvailable = new Set(['slack', 'discord'])
const manualConnectionAvailable = new Set(['telegram', 'slack', 'discord'])
const composioOAuthProviders = new Set(['notion', 'instagram', 'x', 'youtube'])
const nativeOAuthProviders = new Set(['linkedin', 'facebook', 'google'])
const serverManagedProviders = new Set(['whatsapp'])
const publicConnectorIds = new Set(['linkedin', 'facebook', 'instagram', 'whatsapp', 'x', 'google', 'gmail', 'google_sheets', 'google_calendar', 'google_drive', 'notion', 'youtube', 'telegram', 'slack', 'discord'])
const BUILD_ID = String(import.meta.env.VITE_BUILD_ID || 'dev')
const releasedPlatforms = [
  { id: 'facebook', name: 'Facebook', description: 'Facebook Page publishing.' },
  { id: 'instagram', name: 'Instagram', description: 'Instagram publishing.' },
  { id: 'whatsapp', name: 'WhatsApp', description: 'WhatsApp messaging.' },
  { id: 'x', name: 'X', description: 'X posts and threads.' },
  { id: 'google', name: 'Google', description: 'Gmail, Calendar, Sheets and Drive.' },
  { id: 'notion', name: 'Notion', description: 'Create pages and notes.' },
  { id: 'youtube', name: 'YouTube', description: 'YouTube workflow foundation.' },
  { id: 'telegram', name: 'Telegram', description: 'Send Telegram messages.' },
  { id: 'slack', name: 'Slack', description: 'Send Slack messages.' },
  { id: 'discord', name: 'Discord', description: 'Send Discord messages.' },
]

function fieldConfig(id: string) {
  if (id === 'discord') return { key: 'Webhook URL', keyPlaceholder: 'https://discord.com/api/webhooks/...', identifier: '' }
  if (id === 'slack') return { key: 'Bot token or webhook URL', keyPlaceholder: 'xoxb-... or webhook URL', identifier: 'Channel ID or name' }
  return { key: '', keyPlaceholder: '', identifier: 'Telegram chat ID' }
}

function connectorTokens(id: string, key: string, identifier: string) {
  if (id === 'discord') return { webhook_url: key, hasOwnKey: true }
  if (id === 'slack') return key.startsWith('http') ? { webhook_url: key, channel: identifier, hasOwnKey: true } : { bot_token: key, channel: identifier, hasOwnKey: true }
  return { chat_id: identifier, isMaster: true }
}

function fallbackConnector(id: string, name?: string): Connector {
  return {
    id,
    name: name || id,
    icon: id === 'youtube' ? 'video' : 'plug',
    authType: 'oauth',
    category: 'Connected Apps',
    color: '#8b5cf6',
    description: '',
    triggers: [],
    actions: [],
    permissions: [],
  }
}

export default function Connectors() {
  const { session, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPlatform = searchParams.get('platform') || searchParams.get('service')
  const [status, setStatus] = useState<IntegrationStatus>({})
  const [connectorStatus, setConnectorStatus] = useState<Record<string, ConnectedAppStatus>>({})
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(requestedPlatform || null)
  const [query, setQuery] = useState('')
  const [key, setKey] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [facebookPages, setFacebookPages] = useState<{ id: string; name: string }[]>([])
  const [facebookPageId, setFacebookPageId] = useState('')
  const returnTo = searchParams.get('returnTo') || ''

  const load = async () => {
    try {
      const [nativeStatus, connectorData] = await Promise.all([
        getIntegrationStatus(session?.access_token),
        getConnectedApps(session?.access_token).catch(() => ({ providers: [], executions: [] })),
      ])
      const mapped = Object.fromEntries(connectorData.providers.map(provider => [provider.provider === 'twitter' ? 'x' : provider.provider, provider]))
      setConnectorStatus(mapped)
      for (const provider of connectorData.providers) {
        const id = provider.provider === 'twitter' ? 'x' : provider.provider
        const current = nativeStatus[id]
        nativeStatus[id] = {
          ...(current && 'connected' in current ? current : { connected: false }),
          connected: Boolean((current && 'connected' in current && current.connected) || provider.connected),
          ready: Boolean((current && 'ready' in current && current.ready) || provider.connected),
          identifier: (current && 'identifier' in current && current.identifier) || provider.connectionId || null,
        }
      }
      setStatus(nativeStatus)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load connected apps.')
    }
  }

  useEffect(() => {
    void load()
    const refresh = () => void load()
    const timer = window.setInterval(refresh, 5_000)
    window.addEventListener('focus', refresh)
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [session?.access_token])

  useEffect(() => {
    const connected = searchParams.get('connected')
    if (connected === 'linkedin') setNotice('LinkedIn connected successfully and is ready to publish.')
    else if (connected === 'facebook') setNotice('Facebook connected successfully and is ready to publish to the selected Page.')
    else if (connected === 'facebook_select') {
      setSelected('facebook')
      setNotice('Choose the Facebook Page AlphaTekx should manage.')
      void getFacebookPages(session?.access_token).then(data => {
        setFacebookPages(data.pages)
        if (data.pages.length === 1) setFacebookPageId(data.pages[0].id)
      }).catch(error => setNotice(error instanceof Error ? error.message : 'Could not load Facebook Pages.'))
    } else if (connected === 'google' || connected === 'gmail') setNotice('Google connected successfully.')
    else if (connected === 'error') setNotice(searchParams.get('reason') || searchParams.get('error') || 'Connection was not completed.')
    if (connected && returnTo && connected !== 'error' && connected !== 'facebook_select') {
      window.setTimeout(() => window.location.assign(returnTo), 700)
      return
    }
    if (connected) {
      const next = new URLSearchParams(searchParams)
      next.delete('connected'); next.delete('reason'); next.delete('error')
      setSearchParams(next, { replace: true })
      void load()
    }
  }, [searchParams])

  const service = (id: string) => {
    if (id === 'google') return status.google || status.gmail || { connected: false }
    const state = status[id]
    return state && 'connected' in state ? state : { connected: false }
  }
  const feature = (id: string) => status._access?.connectors?.[id] || {
    enabled: publicConnectorIds.has(id),
    publicEnabled: publicConnectorIds.has(id),
    availability: publicConnectorIds.has(id) ? 'available' : 'coming_soon',
  }

  useEffect(() => {
    if (!selected && requestedPlatform && status._access && feature(requestedPlatform === 'google' ? 'gmail' : requestedPlatform).enabled) {
      setSelected(requestedPlatform)
      return
    }
    if (selected && status._access && !feature(selected === 'google' ? 'gmail' : selected).enabled) {
      setSelected(null)
      setFacebookPages([])
      setNotice('Coming soon. We are testing this integration before releasing it publicly.')
    }
  }, [requestedPlatform, selected, status._access])

  const choices = useMemo(() => {
    const available = ['linkedin'].map(id => {
      const connector = getConnector(id)!
      const state = service(id)
      return { id, name: connector.name, description: connector.description, connector, availability: state.connected && state.ready ? 'Connected' : 'Available' }
    })
    const released = releasedPlatforms.map(item => {
      const state = service(item.id)
      const access = feature(item.id)
      const providerState = connectorStatus[item.id]
      const nativeConfigured = nativeOAuthProviders.has(item.id) && (item.id !== 'facebook' || state.configured !== false)
      const configured = nativeConfigured || manualConnectionAvailable.has(item.id) || (serverManagedProviders.has(item.id) && state.connected && state.ready) || Boolean(providerState?.enabled) || (providerState && providerState.status !== 'unavailable')
      return { ...item, connector: getConnector(item.id) || fallbackConnector(item.id, item.name), availability: access.enabled ? (state.connected && state.ready ? 'Connected - Testing' : configured ? 'Ready to connect' : 'Needs server config') : 'Coming Soon' }
    })
    return [...available, ...released].filter(item => `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()))
  }, [query, status, connectorStatus])

  const connected = useMemo(() => {
    const result: { id: string; name: string; connector: Connector; account: string; capabilities: string }[] = []
    const linkedIn = getConnector('linkedin')
    if (service('linkedin').connected && service('linkedin').ready && linkedIn) result.push({ id: 'linkedin', name: 'LinkedIn', connector: linkedIn, account: service('linkedin').email || service('linkedin').identifier || 'Personal profile', capabilities: 'Personal-profile text publishing' })
    const facebook = getConnector('facebook')
    if (feature('facebook').enabled && service('facebook').connected && service('facebook').ready && facebook) result.push({ id: 'facebook', name: 'Facebook - Testing', connector: facebook, account: service('facebook').email || service('facebook').identifier || 'Facebook Page', capabilities: 'Internal Beta - Facebook Page text publishing' })
    const google = getConnector('gmail')
    if (feature('gmail').enabled && (service('google').connected && service('google').ready || service('gmail').connected && service('gmail').ready) && google) result.push({ id: 'google', name: 'Google - Testing', connector: google, account: service('google').email || service('gmail').email || 'Google account', capabilities: 'Internal Beta - Gmail, Calendar, Sheets and Drive' })
    for (const id of [...manualConnectionAvailable, ...composioOAuthProviders, ...serverManagedProviders]) {
      const connector = getConnector(id) || fallbackConnector(id)
      if (feature(id).enabled && service(id).connected && service(id).ready) result.push({ id, name: `${connector.name} - Testing`, connector, account: service(id).email || service(id).identifier || 'Connected', capabilities: `Internal Beta - ${connector.actions.map(action => action.label).join(', ') || 'OAuth connector'}` })
    }
    return result
  }, [status, connectorStatus])

  const choose = (id: string, availability: string) => {
    if (availability === 'Coming Soon') {
      setSelectorOpen(false)
      setNotice('Coming soon. We are testing this integration before releasing it publicly.')
      return
    }
    if (availability === 'Needs server config') {
      setSelected(id)
      setSelectorOpen(false)
      const provider = connectorStatus[id === 'x' ? 'x' : id] || connectorStatus[id === 'x' ? 'twitter' : id]
      setNotice(service(id).setupError || provider?.error || `${getConnector(id)?.name || id} needs its server credentials on Render, followed by a redeploy.`)
      return
    }
    setSelected(id)
    setSelectorOpen(false)
    setNotice('')
    setKey('')
    setIdentifier('')
  }

  const connect = async () => {
    if (!selected) return
    setBusy(true)
    setNotice('')
    try {
      const redirect = returnTo ? `/connected-apps?returnTo=${encodeURIComponent(returnTo)}` : '/connected-apps'
      if (selected === 'linkedin') return await startLinkedInAuth(session?.access_token, redirect)
      if (selected === 'facebook') {
        if (facebookPages.length) {
          if (!facebookPageId) throw new Error('Select the Facebook Page AlphaTekx should manage.')
          const result = await selectFacebookPage(facebookPageId, session?.access_token)
          setFacebookPages([])
          setFacebookPageId('')
          await load()
          setNotice(`${result.page.name} connected successfully.`)
          return
        }
        return await startFacebookAuth(session?.access_token, redirect)
      }
      if (selected === 'google') return await startGmailConnection(session?.access_token, redirect)
      if (serverManagedProviders.has(selected)) throw new Error('WhatsApp uses the protected server credentials. Add every WHATSAPP_* variable on Render and redeploy; no user bot token is required.')
      if (composioOAuthProviders.has(selected)) {
        const result = selectedConnected ? await reconnectProvider(selected, session?.access_token) : await connectProvider(selected, session?.access_token)
        if (!result.authUrl) throw new Error(`${getConnector(selected)?.name || selected} OAuth URL was not returned.`)
        window.location.assign(result.authUrl)
        return
      }
      if (!manualConnectionAvailable.has(selected)) throw new Error('This connection method is not available.')
      if (selected === 'telegram' && !identifier.trim()) throw new Error('Enter the Telegram chat ID that should receive Alpha messages.')
      if (selected !== 'telegram' && !key.trim()) throw new Error('Enter the required connection details.')
      await saveConnector(selected, session?.access_token, connectorTokens(selected, key.trim(), identifier.trim()), identifier.trim() || undefined)
      await load()
      setNotice(`${getConnector(selected)?.name || selected} connected.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Connection failed.') }
    finally { setBusy(false) }
  }

  const disconnect = async (id: string) => {
    if (serverManagedProviders.has(id)) {
      setNotice(`${getConnector(id)?.name || id} is managed securely by the Render server credentials. Remove or replace those credentials on Render to disconnect it.`)
      return
    }
    if (!window.confirm(`Disconnect ${id === 'google' ? 'Google' : getConnector(id)?.name || id}? Existing automations may need attention.`)) return
    setBusy(true)
    try {
      if (id === 'google') await disconnectGoogle(session?.access_token)
      else if (composioOAuthProviders.has(id)) await disconnectProvider(id, session?.access_token)
      else await deleteIntegration(id, session?.access_token)
      await load()
      setSelected(null)
      setNotice('App disconnected.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not disconnect app.') }
    finally { setBusy(false) }
  }

  const verify = async (id: string) => {
    setBusy(true)
    try {
      if (id === 'google' || id === 'linkedin' || composioOAuthProviders.has(id) || serverManagedProviders.has(id)) { await load(); setNotice(`${getConnector(id)?.name || id} connection verified without publishing anything.`) }
      else { await testConnector(id, session?.access_token, 'AlphaTekx connection verification'); setNotice(`${getConnector(id)?.name || id} connection verified.`) }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Verification failed.') }
    finally { setBusy(false) }
  }

  const selectedConnector = selected && selected !== 'google' ? getConnector(selected) || fallbackConnector(selected) : selected === 'google' ? getConnector('gmail') : null
  const selectedConnected = selected ? Boolean((service(selected).connected && service(selected).ready) || (selected === 'google' && service('gmail').connected && service('gmail').ready)) : false
  const config = selected ? fieldConfig(selected) : null

  return <main className="mx-auto min-h-[calc(100dvh-8rem)] w-full max-w-5xl px-4 py-8 sm:px-6">
    <header className="flex flex-col gap-4 border-b border-white/[.08] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs uppercase tracking-[.18em] text-violet-300">Connections</p><h1 className="mt-2 text-3xl font-semibold">Connected Apps</h1><p className="mt-2 max-w-2xl text-sm text-white/55">Connect the apps Alpha can use, then approve automations with confidence.</p></div>
      <span className="w-fit rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">Public tools active - build {BUILD_ID}</span>
    </header>
    {notice && <div role="status" className="mt-5 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm">{notice}</div>}
    <button onClick={() => setSelectorOpen(true)} className="mt-7 flex min-h-14 w-full items-center justify-between rounded-xl border border-white/10 bg-white/[.045] px-5 text-left hover:border-violet-400/30"><span className="flex items-center gap-3"><Plug size={18} className="text-violet-300"/><span><span className="block text-sm font-medium">Select or add a platform</span><span className="text-xs text-white/45">Search available, released, and connected apps</span></span></span><ChevronRight size={18}/></button>

    {selected && <section className="mt-5 rounded-xl border border-violet-400/20 bg-violet-500/[.055] p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3">{selectedConnector && <span className="grid size-11 place-items-center rounded-lg bg-white/[.07]"><ConnectorIcon connector={selectedConnector}/></span>}<div><h2 className="font-semibold">{selected === 'google' ? 'Google' : selectedConnector?.name}</h2><p className="mt-1 text-xs text-white/50">{selectedConnected ? 'Connected and verified by backend status.' : 'Complete this connection to continue.'}</p></div></div><button onClick={() => setSelected(null)} aria-label="Close connection details"><X size={18}/></button></div>
      {!selectedConnected && manualConnectionAvailable.has(selected) && config && <div className="mt-5 grid gap-3">{config.key && <label className="text-xs text-white/55">{config.key}<input type="password" value={key} onChange={event => setKey(event.target.value)} placeholder={config.keyPlaceholder} className="field mt-1"/></label>}{selected === 'telegram' && <p className="text-sm text-white/60">Send a message to the AlphaTekx Telegram bot first, then enter that chat ID. AlphaTekx protects the bot token.</p>}{config.identifier && <label className="text-xs text-white/55">{config.identifier}<input value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder={selected === 'telegram' ? 'For example: 123456789' : undefined} className="field mt-1"/></label>}</div>}
      {!selectedConnected && selected === 'facebook' && facebookPages.length > 0 && <fieldset className="mt-5 grid gap-2"><legend className="mb-2 text-xs text-white/55">Select one Facebook Page</legend>{facebookPages.map(page => <label key={page.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${facebookPageId === page.id ? 'border-violet-400 bg-violet-500/10' : 'border-white/10'}`}><input type="radio" name="facebook-page" value={page.id} checked={facebookPageId === page.id} onChange={() => setFacebookPageId(page.id)}/><span className="text-sm">{page.name}</span></label>)}</fieldset>}
      <div className="mt-5 flex flex-wrap gap-2">{selectedConnected ? <><button onClick={() => void verify(selected)} disabled={busy} className="action">{busy ? <LoaderCircle className="animate-spin" size={16}/> : <CheckCircle2 size={16}/>}Verify</button><button onClick={() => void connect()} disabled={busy} className="action"><RefreshCw size={16}/>Reconnect</button><button onClick={() => void disconnect(selected)} disabled={busy} className="action text-rose-300"><Unplug size={16}/>Disconnect</button></> : <button onClick={() => void connect()} disabled={busy || (apiKeyAvailable.has(selected) && !key.trim()) || (selected === 'telegram' && !identifier.trim())} className="flex min-h-11 items-center gap-2 rounded-xl btn-alpha px-5 text-sm disabled:opacity-40">{busy ? <LoaderCircle className="animate-spin" size={16}/> : <Plug size={16}/>}Connect {selected === 'google' ? 'Google' : selectedConnector?.name}</button>}</div>
    </section>}

    <section className="mt-10"><h2 className="text-sm font-medium text-white/70">Your connected apps</h2>{connected.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-white/15 p-8 text-center"><p className="font-medium">No apps connected yet.</p><p className="mt-2 text-sm text-white/50">Choose a platform to connect.</p></div> : <div className="mt-4 grid gap-3 md:grid-cols-2">{connected.map(item => <button key={item.id} onClick={() => setSelected(item.id)} className="flex w-full items-center gap-4 rounded-xl border border-white/[.09] bg-white/[.035] p-4 text-left hover:border-violet-400/25"><span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white/[.06]"><ConnectorIcon connector={item.connector}/></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 font-medium">{item.name}<Check size={14} className="text-emerald-300"/></span><span className="mt-1 block truncate text-xs text-white/55">{item.account}</span><span className="mt-1 block text-xs text-white/40">{item.capabilities}</span></span><ChevronRight size={17} className="text-white/35"/></button>)}</div>}</section>

    {selectorOpen && <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-0 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="platform-selector-title" onClick={() => setSelectorOpen(false)}><section className="max-h-[85dvh] w-full overflow-hidden rounded-t-2xl border border-white/10 bg-[#160923] sm:max-w-xl sm:rounded-2xl" onClick={event => event.stopPropagation()}><div className="flex items-center justify-between border-b border-white/[.08] p-5"><div><h2 id="platform-selector-title" className="font-semibold">Choose a platform</h2><p className="mt-1 text-xs text-white/45">Only backend-enabled connections can start OAuth.</p></div><button onClick={() => setSelectorOpen(false)} className="grid size-10 place-items-center rounded-full hover:bg-white/[.06]" aria-label="Close platform selector"><X size={18}/></button></div><div className="p-4"><label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3"><Search size={16} className="text-white/40"/><span className="sr-only">Search platforms</span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search platforms" className="h-11 flex-1 bg-transparent text-sm outline-none"/></label><div className="mt-3 max-h-[55dvh] space-y-1 overflow-y-auto">{choices.map(item => <button key={item.id} onClick={() => choose(item.id, item.availability)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/[.05] ${item.availability === 'Coming Soon' ? 'opacity-60' : ''}`}>{item.connector ? <span className="grid size-10 place-items-center rounded-lg bg-white/[.06]"><ConnectorIcon connector={item.connector}/></span> : <span className="grid size-10 place-items-center rounded-lg bg-white/[.04]"><Plug size={17}/></span>}<span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.name}</span><span className="block truncate text-xs text-white/45">{item.description}</span></span><span className="rounded-full border border-white/10 px-2 py-1 text-[10px]">{item.availability}</span></button>)}</div></div></section></div>}
  </main>
}
