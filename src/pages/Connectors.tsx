import { useEffect, useMemo, useState } from 'react'
import { Check, CheckCircle2, ChevronRight, LoaderCircle, Plug, RefreshCw, Search, Unplug, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { ConnectorIcon } from '../components/agents/ConnectorIcon'
import { connectors, getConnector } from '../lib/agents/connectorRegistry'
import type { Connector } from '../lib/agents/types'
import { useAuth } from '../lib/auth'
import { deleteIntegration, disconnectGoogle, getFacebookPages, getIntegrationStatus, saveConnector, selectFacebookPage, startFacebookAuth, startGmailConnection, startLinkedInAuth, testConnector, type IntegrationStatus } from '../lib/integrations'

const googleIds = new Set(['gmail', 'google_sheets', 'google_calendar', 'google_drive', 'calendar'])
const apiKeyAvailable = new Set(['slack', 'discord'])
const manualConnectionAvailable = new Set(['telegram', 'slack', 'discord'])
const futurePlatforms = [
  { id: 'facebook', name: 'Facebook', description: 'Facebook publishing is being tested.' },
  { id: 'instagram', name: 'Instagram', description: 'Social publishing is coming soon.' },
  { id: 'whatsapp', name: 'WhatsApp', description: 'Messaging automation is being tested.' },
  { id: 'x', name: 'X', description: 'Social publishing is being tested.' },
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

export default function Connectors() {
  const { session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPlatform = searchParams.get('platform')
  const [status, setStatus] = useState<IntegrationStatus>({})
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(requestedPlatform === 'linkedin' ? 'linkedin' : null)
  const [query, setQuery] = useState('')
  const [key, setKey] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [facebookPages, setFacebookPages] = useState<{ id: string; name: string }[]>([])
  const [facebookPageId, setFacebookPageId] = useState('')
  const returnTo = searchParams.get('returnTo') || ''

  const load = async () => {
    try { setStatus(await getIntegrationStatus(session?.access_token)) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load connected apps.') }
  }
  useEffect(() => { void load() }, [session?.access_token])
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
    }
    else if (connected === 'google' || connected === 'gmail') setNotice('Google connected successfully.')
    else if (connected === 'error') setNotice(searchParams.get('reason') || 'Connection was not completed.')
    if (connected && returnTo && connected !== 'error' && connected !== 'facebook_select') {
      window.setTimeout(() => window.location.assign(returnTo), 700)
      return
    }
    if (connected) {
      const next = new URLSearchParams(searchParams)
      next.delete('connected'); next.delete('reason')
      setSearchParams(next, { replace: true })
      void load()
    }
  }, [searchParams])

  const service = (id: string) => {
    if (id === 'google') return status.google || status.gmail || { connected: false }
    const state = status[id]
    return state && 'connected' in state ? state : { connected: false }
  }
  const feature = (id: string) => status._access?.connectors?.[id] || { enabled: id === 'linkedin', publicEnabled: id === 'linkedin', availability: id === 'linkedin' ? 'available' : 'coming_soon' }
  const isAdminTester = status._access?.admin === true
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
    const future = futurePlatforms.map(item => {
      const state = service(item.id)
      const access = feature(item.id)
      return { ...item, connector: getConnector(item.id) || null, availability: access.enabled ? (state.connected && state.ready ? 'Connected · Testing' : 'Internal Beta') : 'Coming Soon' }
    })
    const internal = isAdminTester ? ['google', 'telegram', 'slack', 'discord'].map(id => {
      const connector = getConnector(id === 'google' ? 'gmail' : id)!
      const state = service(id)
      return { id, name: id === 'google' ? 'Google' : connector.name, description: id === 'google' ? 'Gmail, Calendar, Sheets and Drive.' : connector.description, connector, availability: state.connected && state.ready ? 'Connected · Testing' : 'Internal Beta' }
    }) : []
    return [...available, ...future, ...internal].filter(item => `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()))
  }, [query, status])

  const connected = useMemo(() => {
    const result: { id: string; name: string; connector: Connector; account: string; capabilities: string }[] = []
    const linkedIn = getConnector('linkedin')
    if (service('linkedin').connected && service('linkedin').ready && linkedIn) result.push({ id: 'linkedin', name: 'LinkedIn', connector: linkedIn, account: service('linkedin').email || service('linkedin').identifier || 'Personal profile', capabilities: 'Personal-profile text publishing' })
    const facebook = getConnector('facebook')
    if (feature('facebook').enabled && service('facebook').connected && service('facebook').ready && facebook) result.push({ id: 'facebook', name: 'Facebook · Testing', connector: facebook, account: service('facebook').email || service('facebook').identifier || 'Facebook Page', capabilities: 'Internal Beta — Facebook Page text publishing' })
    const google = getConnector('gmail')
    if (feature('gmail').enabled && (service('google').connected && service('google').ready || service('gmail').connected && service('gmail').ready) && google) result.push({ id: 'google', name: 'Google · Testing', connector: google, account: service('google').email || service('gmail').email || 'Google account', capabilities: 'Internal Beta — Gmail, Calendar, Sheets and Drive' })
    for (const id of manualConnectionAvailable) {
      const connector = getConnector(id)
      if (feature(id).enabled && connector && service(id).connected && service(id).ready) result.push({ id, name: `${connector.name} · Testing`, connector, account: service(id).email || service(id).identifier || 'Connected', capabilities: `Internal Beta — ${connector.actions.map(action => action.label).join(', ')}` })
    }
    return result
  }, [status])

  const choose = (id: string, availability: string) => {
    if (availability === 'Coming Soon') {
      setSelectorOpen(false)
      setNotice('Coming soon. We are testing this integration before releasing it publicly.')
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
      if (!manualConnectionAvailable.has(selected)) throw new Error('This connection method is not available.')
      if (selected === 'telegram' && !identifier.trim()) throw new Error('Enter the Telegram chat ID that should receive Alpha’s messages.')
      if (selected !== 'telegram' && !key.trim()) throw new Error('Enter the required connection details.')
      await saveConnector(selected, session?.access_token, connectorTokens(selected, key.trim(), identifier.trim()), identifier.trim() || undefined)
      await load()
      setNotice(`${getConnector(selected)?.name || selected} connected.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Connection failed.') }
    finally { setBusy(false) }
  }

  const disconnect = async (id: string) => {
    if (!window.confirm(`Disconnect ${id === 'google' ? 'Google' : getConnector(id)?.name || id}? Existing automations may need attention.`)) return
    setBusy(true)
    try {
      if (id === 'google') await disconnectGoogle(session?.access_token)
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
      if (id === 'google' || id === 'linkedin') { await load(); setNotice(`${id === 'google' ? 'Google' : 'LinkedIn'} connection verified without publishing anything.`) }
      else { await testConnector(id, session?.access_token, 'AlphaTekx connection verification'); setNotice(`${getConnector(id)?.name || id} connection verified.`) }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Verification failed.') }
    finally { setBusy(false) }
  }

  const selectedConnector = selected && selected !== 'google' ? getConnector(selected) : selected === 'google' ? getConnector('gmail') : null
  const selectedConnected = selected ? Boolean((service(selected).connected && service(selected).ready) || (selected === 'google' && service('gmail').connected && service('gmail').ready)) : false
  const config = selected ? fieldConfig(selected) : null

  return <main className="mx-auto min-h-[calc(100dvh-8rem)] w-full max-w-4xl px-4 py-10 sm:px-6">
    <header><p className="text-xs uppercase tracking-[.2em] text-violet-300">Connections</p><h1 className="mt-2 text-3xl font-semibold">Connected Apps</h1><p className="mt-2 text-sm text-white/55">Connect only the apps Alpha needs for your automations.</p></header>
    {notice && <div role="status" className="mt-5 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm">{notice}</div>}
    <button onClick={() => setSelectorOpen(true)} className="mt-7 flex min-h-14 w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.045] px-5 text-left hover:border-violet-400/30"><span className="flex items-center gap-3"><Plug size={18} className="text-violet-300"/><span><span className="block text-sm font-medium">Select or add a platform</span><span className="text-xs text-white/45">Search available and upcoming connections</span></span></span><ChevronRight size={18}/></button>

    {selected && <section className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-500/[.055] p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3">{selectedConnector && <span className="grid size-11 place-items-center rounded-xl bg-white/[.07]"><ConnectorIcon connector={selectedConnector}/></span>}<div><h2 className="font-semibold">{selected === 'google' ? 'Google' : selectedConnector?.name}</h2><p className="mt-1 text-xs text-white/50">{selectedConnected ? 'Connected' : 'Complete this connection to continue.'}</p></div></div><button onClick={() => setSelected(null)} aria-label="Close connection details"><X size={18}/></button></div>
      {!selectedConnected && manualConnectionAvailable.has(selected) && config && <div className="mt-5 grid gap-3">{config.key && <label className="text-xs text-white/55">{config.key}<input type="password" value={key} onChange={event => setKey(event.target.value)} placeholder={config.keyPlaceholder} className="field mt-1"/></label>}{selected === 'telegram' && <p className="text-sm text-white/60">Send a message to the AlphaTekx Telegram bot first, then enter that chat’s numeric ID. AlphaTekx supplies and protects the bot token.</p>}{config.identifier && <label className="text-xs text-white/55">{config.identifier}<input value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder={selected === 'telegram' ? 'For example: 123456789' : undefined} className="field mt-1"/></label>}</div>}
      {!selectedConnected && selected === 'facebook' && facebookPages.length > 0 && <fieldset className="mt-5 grid gap-2"><legend className="mb-2 text-xs text-white/55">Select one Facebook Page</legend>{facebookPages.map(page => <label key={page.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${facebookPageId === page.id ? 'border-violet-400 bg-violet-500/10' : 'border-white/10'}`}><input type="radio" name="facebook-page" value={page.id} checked={facebookPageId === page.id} onChange={() => setFacebookPageId(page.id)}/><span className="text-sm">{page.name}</span></label>)}</fieldset>}
      <div className="mt-5 flex flex-wrap gap-2">{selectedConnected ? <><button onClick={() => void verify(selected)} disabled={busy} className="action">{busy ? <LoaderCircle className="animate-spin" size={16}/> : <CheckCircle2 size={16}/>}Verify</button><button onClick={() => void connect()} disabled={busy} className="action"><RefreshCw size={16}/>Reconnect</button><button onClick={() => void disconnect(selected)} disabled={busy} className="action text-rose-300"><Unplug size={16}/>Disconnect</button></> : <button onClick={() => void connect()} disabled={busy || (apiKeyAvailable.has(selected) && !key.trim()) || (selected === 'telegram' && !identifier.trim())} className="flex min-h-11 items-center gap-2 rounded-xl btn-alpha px-5 text-sm disabled:opacity-40">{busy ? <LoaderCircle className="animate-spin" size={16}/> : <Plug size={16}/>}Connect {selected === 'google' ? 'Google' : selectedConnector?.name}</button>}</div>
    </section>}

    <section className="mt-10"><h2 className="text-sm font-medium text-white/70">Your connected apps</h2>{connected.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-white/15 p-8 text-center"><p className="font-medium">No apps connected yet.</p><p className="mt-2 text-sm text-white/50">Choose a platform to connect.</p></div> : <div className="mt-4 grid gap-3 md:grid-cols-2">{connected.map(item => <button key={item.id} onClick={() => setSelected(item.id)} className="flex w-full items-center gap-4 rounded-2xl border border-white/[.09] bg-white/[.035] p-4 text-left hover:border-violet-400/25"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[.06]"><ConnectorIcon connector={item.connector}/></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 font-medium">{item.name}<Check size={14} className="text-emerald-300"/></span><span className="mt-1 block truncate text-xs text-white/55">{item.account}</span><span className="mt-1 block text-xs text-white/40">{item.capabilities}</span></span><ChevronRight size={17} className="text-white/35"/></button>)}</div>}</section>

    {selectorOpen && <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-0 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="platform-selector-title" onClick={() => setSelectorOpen(false)}><section className="max-h-[85dvh] w-full overflow-hidden rounded-t-3xl border border-white/10 bg-[#160923] sm:max-w-lg sm:rounded-3xl" onClick={event => event.stopPropagation()}><div className="flex items-center justify-between border-b border-white/[.08] p-5"><div><h2 id="platform-selector-title" className="font-semibold">Choose a platform</h2><p className="mt-1 text-xs text-white/45">Only available connections can be selected.</p></div><button onClick={() => setSelectorOpen(false)} className="grid size-10 place-items-center rounded-full hover:bg-white/[.06]" aria-label="Close platform selector"><X size={18}/></button></div><div className="p-4"><label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3"><Search size={16} className="text-white/40"/><span className="sr-only">Search platforms</span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search platforms" className="h-11 flex-1 bg-transparent text-sm outline-none"/></label><div className="mt-3 max-h-[55dvh] space-y-1 overflow-y-auto">{choices.map(item => <button key={item.id} onClick={() => choose(item.id, item.availability)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/[.05] ${item.availability === 'Coming Soon' ? 'opacity-60' : ''}`}>{item.connector ? <span className="grid size-10 place-items-center rounded-xl bg-white/[.06]"><ConnectorIcon connector={item.connector}/></span> : <span className="grid size-10 place-items-center rounded-xl bg-white/[.04]"><Plug size={17}/></span>}<span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.name}</span><span className="block truncate text-xs text-white/45">{item.description}</span></span><span className="rounded-full border border-white/10 px-2 py-1 text-[10px]">{item.availability}</span></button>)}</div></div></section></div>}
  </main>
}
