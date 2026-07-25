import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, Key, Linkedin, LoaderCircle, Mail, PlugZap, RefreshCw, Unplug } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { connectors, getConnector } from '../lib/agents/connectorRegistry'
import { ConnectorIcon } from '../components/agents/ConnectorIcon'
import ConnectedAppsDropdown from '../components/ConnectedAppsDropdown'
import type { Connector, ConnectorCategory } from '../lib/agents/types'
import {
  deleteIntegration,
  disconnectGoogle,
  getIntegrationStatus,
  getUserUsage,
  initializePostsPayment,
  saveConnector,
  sendGmail,
  startGmailConnection,
  startLinkedInAuth,
  testConnector,
  type IntegrationStatus,
  type SendEmailInput,
  type UserUsage,
} from '../lib/integrations'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const googleProviderIds = new Set(['gmail', 'google_sheets', 'google_calendar', 'google_drive', 'calendar'])
const socialConnectorIds = new Set(['linkedin', 'x', 'facebook', 'slack', 'discord', 'telegram'])

function emptyUsage(): UserUsage { return { freePostsUsed: 0, freePostsLimit: 2, remaining: 2, connectors: {} } }

const categoryOrder: ConnectorCategory[] = ['Communication', 'Productivity', 'Development', 'Social Media', 'Storage', 'AI Providers', 'Automation', 'Business']

function getFieldConfig(c: Connector) {
  if (c.id === 'discord') return { label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/...', identifier: null as string | null }
  if (c.id === 'slack') return { label: 'Bot token or webhook URL', placeholder: 'xoxb-... or https://hooks.slack.com/...', identifier: 'Channel ID / name' }
  if (c.id === 'telegram') return { label: 'Bot token', placeholder: '8898016809:AAH...', identifier: 'Chat ID' }
  if (c.id === 'linkedin') return { label: 'Access token', placeholder: 'Paste LinkedIn access token', identifier: 'Author URN (urn:li:person:...)' }
  if (c.id === 'x') return { label: 'Bearer token', placeholder: 'Paste X Bearer token', identifier: null as string | null }
  if (c.id === 'facebook') return { label: 'Page access token', placeholder: 'Paste Facebook page token', identifier: 'Page ID' }
  if (c.id === 'whatsapp') return { label: 'WhatsApp token', placeholder: 'EAA...', identifier: 'Phone number ID' }
  if (c.id === 'github') return { label: 'GitHub token', placeholder: 'ghp_...', identifier: null as string | null }
  if (c.id === 'notion') return { label: 'Notion token', placeholder: 'secret_...', identifier: null as string | null }
  if (c.id === 'paystack') return { label: 'Paystack secret key', placeholder: 'sk_...', identifier: null as string | null }
  if (c.id === 'supabase') return { label: 'Supabase service role key', placeholder: 'eyJ...', identifier: null as string | null }
  if (c.id === 'email') return { label: 'SMTP / API key', placeholder: 'Paste key', identifier: null as string | null }
  return { label: 'API key / token', placeholder: 'Paste key', identifier: null as string | null }
}

function buildConnectorTokens(c: Connector, key: string, identifier: string): Record<string, unknown> {
  const tokens: Record<string, unknown> = { hasOwnKey: true, isMaster: false }
  if (c.id === 'discord') tokens.webhook_url = key
  else if (c.id === 'slack') {
    if (key.startsWith('http')) tokens.webhook_url = key
    else tokens.bot_token = key
    if (identifier) tokens.channel = identifier
  } else if (c.id === 'telegram') {
    tokens.bot_token = key
    if (identifier) tokens.chat_id = identifier
  } else if (c.id === 'linkedin') {
    tokens.access_token = key
    if (identifier) tokens.author_urn = identifier
  } else if (c.id === 'x') tokens.token = key
  else if (c.id === 'facebook') {
    tokens.access_token = key
    if (identifier) tokens.page_id = identifier
  } else if (c.id === 'whatsapp') {
    tokens.api_key = key
    if (identifier) tokens.phone_number_id = identifier
  } else tokens.api_key = key
  return tokens
}

type Health = { status: 'connected' | 'connecting' | 'syncing' | 'waiting' | 'auth_failed' | 'config_required' | 'rate_limited' | 'offline'; message: string; lastOk?: string; error?: string }

export default function Connectors() {
  const { user, session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = user?.email?.toLowerCase() === 'iamdan4live@gmail.com'
  const [integration, setIntegration] = useState<IntegrationStatus>(() => ({
    google: { connected: false, email: null, scopes: [] },
    gmail: { connected: false, email: null },
    sheets: { connected: false, email: null },
    calendar: { connected: false, email: null },
    drive: { connected: false, email: null },
    google_sheets: { connected: false, email: null },
    google_calendar: { connected: false, email: null },
    google_drive: { connected: false, email: null },
  }))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [usage, setUsage] = useState<UserUsage>(emptyUsage())
  const [keyInput, setKeyInput] = useState<Record<string, string>>({})
  const [identifierInput, setIdentifierInput] = useState<Record<string, string>>({})
  const [lastSuccess, setLastSuccess] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [openConnector, setOpenConnector] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const STORAGE_KEY = 'alphatekx-default-platforms'

  const connectedParam = searchParams.get('connected')
  const errorParam = searchParams.get('reason') || searchParams.get('error')

  useEffect(() => {
    if (connectedParam === 'google' || connectedParam === 'gmail') setNotice('Google connected successfully. Gmail, Sheets, Calendar, and Drive are now live.')
    if (connectedParam === 'linkedin') setNotice('LinkedIn connected successfully. Your account is linked and ready to publish posts.')
    if (connectedParam === 'error') setNotice(`Connection failed: ${errorParam || 'Unknown error'}`)
    if (connectedParam || errorParam) {
      void loadStatus()
      const next = new URLSearchParams(searchParams)
      next.delete('connected'); next.delete('reason'); next.delete('error')
      setSearchParams(next, { replace: true })
    }
  }, [connectedParam, errorParam, searchParams, setSearchParams])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setSelectedIds(JSON.parse(saved))
    } catch {}
  }, [])

  useEffect(() => { void loadStatus() }, [session?.access_token, user?.email])

  const loadStatus = async () => {
    setBusy(true)
    try {
      const [status, usageData] = await Promise.all([
        getIntegrationStatus(session?.access_token),
        getUserUsage(session?.access_token),
      ])
      setIntegration(prev => ({ ...prev, ...status }))
      setUsage(usageData || emptyUsage())
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load connector status.')
    } finally { setBusy(false); setLoaded(true) }
  }

  const serviceStatus = (id: string) => integration[id] || { connected: false, email: null, hasOwnKey: false, isMaster: false }

  const health = (c: Connector): Health => {
    const status = serviceStatus(c.id)
    if (errors[c.id]) return { status: 'offline', message: errors[c.id] }
    if (status.connected) return { status: 'connected', message: status.email ? `Connected as ${status.email}` : 'Connected', lastOk: lastSuccess[c.id] }
    if (status.ready) return { status: 'waiting', message: 'Master key configured. Add your own key for full access.' }
    if (c.authType === 'oauth') return { status: 'config_required', message: 'OAuth credentials required on backend.' }
    return { status: 'config_required', message: 'API key required.' }
  }

  const healthDot = (h: Health) => {
    const map: Record<Health['status'], string> = {
      connected: 'bg-emerald-500',
      connecting: 'bg-sky-500 animate-pulse',
      syncing: 'bg-sky-500 animate-pulse',
      waiting: 'bg-amber-500',
      auth_failed: 'bg-rose-500',
      config_required: 'bg-zinc-500',
      rate_limited: 'bg-amber-500',
      offline: 'bg-rose-500',
    }
    return <span className={`inline-block h-2.5 w-2.5 rounded-full ${map[h.status]}`} title={h.message} />
  }

  const connect = async (c: Connector) => {
    if (googleProviderIds.has(c.id)) {
      setBusy(true); setNotice('')
      try { await startGmailConnection(session?.access_token, '/connectors') }
      catch (error) { setNotice(error instanceof Error ? error.message : 'Could not start Google connection.'); setBusy(false) }
      return
    }
    if (c.id === 'linkedin') {
      setBusy(true); setNotice('')
      try { await startLinkedInAuth(session?.access_token, '/connectors') }
      catch (error) { setNotice(error instanceof Error ? error.message : 'Could not start LinkedIn connection.'); setBusy(false) }
      return
    }
    const key = keyInput[c.id]?.trim()
    const identifier = identifierInput[c.id]?.trim()
    if (!key) return
    setBusy(true); setNotice(''); setErrors(prev => ({ ...prev, [c.id]: '' }))
    try {
      const tokens = buildConnectorTokens(c, key, identifier)
      await saveConnector(c.id, session?.access_token, tokens, identifier || undefined)
      setNotice(`${c.name} connected.`)
      setLastSuccess(prev => ({ ...prev, [c.id]: new Date().toLocaleString() }))
      setKeyInput(prev => ({ ...prev, [c.id]: '' }))
      setIdentifierInput(prev => ({ ...prev, [c.id]: '' }))
      await loadStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not connect ${c.name}.`
      setErrors(prev => ({ ...prev, [c.id]: message }))
      setNotice(message)
    } finally { setBusy(false) }
  }

  const test = async (c: Connector) => {
    setBusy(true); setNotice(`Testing ${c.name}...`); setErrors(prev => ({ ...prev, [c.id]: '' }))
    try {
      await testConnector(c.id, session?.access_token, `AlphaTekX test from ${c.name}`)
      setNotice(`${c.name} test succeeded.`)
      setLastSuccess(prev => ({ ...prev, [c.id]: new Date().toLocaleString() }))
      await loadStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrors(prev => ({ ...prev, [c.id]: message }))
      setNotice(`${c.name} test failed: ${message}`)
    } finally { setBusy(false) }
  }

  const disconnect = async (c: Connector) => {
    setBusy(true); setNotice(''); setErrors(prev => ({ ...prev, [c.id]: '' }))
    try {
      if (googleProviderIds.has(c.id)) {
        await disconnectGoogle(session?.access_token)
        setIntegration({
          google: { connected: false, email: null, scopes: [] },
          gmail: { connected: false, email: null },
          sheets: { connected: false, email: null },
          calendar: { connected: false, email: null },
          drive: { connected: false, email: null },
          google_sheets: { connected: false, email: null },
          google_calendar: { connected: false, email: null },
          google_drive: { connected: false, email: null },
        })
      } else {
        await deleteIntegration(c.id, session?.access_token)
        setIntegration(prev => ({ ...prev, [c.id]: { connected: false, email: null } }))
      }
      setNotice(`${c.name} disconnected.`)
      await loadStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not disconnect ${c.name}.`
      setErrors(prev => ({ ...prev, [c.id]: message }))
      setNotice(message)
    } finally { setBusy(false) }
  }

  const grouped = useMemo(() => {
    const map = new Map<ConnectorCategory, Connector[]>()
    for (const cat of categoryOrder) map.set(cat, [])
    for (const c of connectors) {
      const list = map.get(c.category) || []
      list.push(c)
      map.set(c.category, list)
    }
    return map
  }, [])

  const [testEmail, setTestEmail] = useState<SendEmailInput>({ to: user?.email || '', subject: 'AlphaTekX Gmail test', text: 'This email was sent through your AlphaTekX Google connector.' })

  const dropdownItems = useMemo(() => connectors.map((c) => ({
    id: c.id,
    name: c.name,
    icon: <ConnectorIcon connector={c} size={18} />,
    status: serviceStatus(c.id).connected ? 'connected' : 'available',
  })), [integration])

  const sendTest = async () => {
    if (!integration.gmail.connected || !testEmail.to.trim() || !testEmail.subject.trim() || !testEmail.text?.trim()) return
    setBusy(true); setNotice('Sending test email...')
    try {
      await sendGmail(session?.access_token, testEmail)
      setNotice(`Test email sent to ${testEmail.to}.`)
      setLastSuccess(prev => ({ ...prev, gmail: new Date().toLocaleString() }))
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Test email failed.') }
    finally { setBusy(false) }
  }

  const connectedCount = useMemo(() => connectors.filter(c => serviceStatus(c.id).connected).length, [integration])

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white"><PlugZap size={20} /></span>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Connected Apps</h1>
              <p className="text-sm text-white/55">Connect the apps Alpha works with. {connectedCount}/{connectors.length} connected.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void loadStatus()} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/[.12] px-4 text-sm transition hover:bg-white/[0.04] disabled:opacity-50"><RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Refresh</button>
          </div>
        </div>

        {!GOOGLE_CLIENT_ID && (
          <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            Add <code className="rounded bg-amber-500/20 px-1">VITE_GOOGLE_CLIENT_ID</code> and <code className="rounded bg-amber-500/20 px-1">GOOGLE_CLIENT_SECRET</code> to your Render environment to enable Google OAuth.
          </div>
        )}

        {notice && (
          <div role="status" className={`mt-6 rounded-2xl border p-4 text-sm ${notice.toLowerCase().includes('failed') ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
            <div className="flex items-start gap-3">
              {notice.toLowerCase().includes('failed') ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              <div className="flex-1">
                <p className="font-medium">{notice}</p>
                {!notice.toLowerCase().includes('failed') && (
                  <Link to="/agents" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-semibold hover:bg-emerald-500/30">
                    Go to Automation <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-8">
          <ConnectedAppsDropdown
            title="Connect the Apps You Already Use"
            subtitle="Select platforms to connect. Save your selection as a dashboard default."
            items={dropdownItems}
            onSelectionChange={setSelectedIds}
            storageKey={STORAGE_KEY}
          />
        </div>

        {!loaded ? (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/[.08] bg-white/[0.03] p-5">
                <div className="h-11 w-11 rounded-xl bg-white/10" />
                <div className="mt-4 h-5 w-32 rounded bg-white/10" />
                <div className="mt-2 h-3 w-full max-w-[260px] rounded bg-white/10" />
                <div className="mt-5 h-9 rounded-xl bg-white/10" />
              </div>
            ))}
          </div>
        ) : selectedIds.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/[.08] bg-white/[0.03] p-8 text-center">
            <p className="text-lg font-medium text-white/90">Choose the apps you use</p>
            <p className="mt-2 text-sm text-white/55">Use the dropdown above to pick the platforms you want to connect. Only selected apps will appear here.</p>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {Array.from(grouped.entries()).map(([category, items]) => {
              const visible = items.filter((c) => selectedIds.includes(c.id) || serviceStatus(c.id).connected)
              if (!visible.length) return null
              return (
              <section key={category}>
                <button onClick={() => setOpenCategory(openCategory === category ? null : category)} className="flex w-full items-center justify-between rounded-2xl border border-white/[.08] bg-white/[0.03] px-5 py-4 text-left transition hover:bg-white/[0.05]">
                  <span className="font-semibold">{category}</span>
                  <span className="flex items-center gap-2 text-sm text-white/55">{visible.filter(c => serviceStatus(c.id).connected).length}/{visible.length} <ArrowRight size={14} className={`transition-transform ${openCategory === category ? 'rotate-90' : ''}`} /></span>
                </button>
                {openCategory === category && (
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {visible.map(c => {
                      const h = health(c)
                      const status = serviceStatus(c.id)
                      const isGoogle = googleProviderIds.has(c.id)
                      const config = getFieldConfig(c)
                      return (
                        <div key={c.id} className="rounded-2xl border border-white/[.08] bg-white/[0.03] p-5 transition hover:border-indigo-400/30 hover:bg-white/[0.05]">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-pink-500/20 text-white"><ConnectorIcon connector={c} className="" /></span>
                              <div>
                                <h3 className="font-semibold">{c.name}</h3>
                                <p className="flex items-center gap-1.5 text-xs text-white/55">{healthDot(h)} {h.status.replace(/_/g, ' ')}</p>
                              </div>
                            </div>
                          </div>
                          <p className="mt-3 text-sm text-white/70">{c.description}</p>
                          {h.error && <p className="mt-2 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-300">{h.error}</p>}
                          {h.lastOk && <p className="mt-2 text-xs text-white/40">Last success: {h.lastOk}</p>}
                          {openConnector === c.id && (
                            <div className="mt-4 space-y-3 border-t border-white/[.08] pt-3">
                              {!isGoogle && c.authType === 'apiKey' && !status.connected && (
                                <div className="space-y-2">
                                  <input type="password" value={keyInput[c.id] || ''} onChange={e => setKeyInput(prev => ({ ...prev, [c.id]: e.target.value }))} className="field text-sm" placeholder={config.placeholder} />
                                  {config.identifier && <input value={identifierInput[c.id] || ''} onChange={e => setIdentifierInput(prev => ({ ...prev, [c.id]: e.target.value }))} className="field text-sm" placeholder={config.identifier} />}
                                  <p className="text-[10px] text-white/40">{config.label}</p>
                                </div>
                              )}
                              {c.permissions.length > 0 && <p className="text-xs text-white/40">Permissions: {c.permissions.join(', ')}</p>}
                              <div className="flex flex-wrap gap-2">
                                {isGoogle ? (
                                  status.connected ? (
                                    <button onClick={() => void disconnect(c)} disabled={busy} className="flex flex-1 min-h-10 items-center justify-center gap-2 rounded-xl border border-white/[.15] text-sm transition hover:border-red-400/50 hover:bg-red-400/10 disabled:opacity-50"><Unplug size={16}/> Disconnect</button>
                                  ) : (
                                    <button onClick={() => void connect(c)} disabled={busy || !GOOGLE_CLIENT_ID} className="btn-alpha flex flex-1 min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16}/> : <PlugZap size={16}/>}Connect</button>
                                  )
                                ) : (
                                  <>
                                    {!status.connected ? (
                                      <button onClick={() => void connect(c)} disabled={busy || (c.authType === 'apiKey' && !keyInput[c.id]?.trim())} className="btn-alpha flex flex-1 min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16}/> : c.id === 'linkedin' ? <Linkedin size={16}/> : <Key size={16}/>} {c.id === 'linkedin' ? 'Connect with LinkedIn' : 'Connect'}</button>
                                    ) : (
                                      <button onClick={() => void disconnect(c)} disabled={busy} className="flex flex-1 min-h-10 items-center justify-center gap-2 rounded-xl border border-white/[.15] text-sm transition hover:border-red-400/50 hover:bg-red-400/10 disabled:opacity-50"><Unplug size={16}/> Disconnect</button>
                                    )}
                                    <button onClick={() => void test(c)} disabled={busy} className="flex flex-1 min-h-10 items-center justify-center gap-2 rounded-xl border border-white/[.15] text-sm transition hover:bg-white/5 disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16}/> : <CheckCircle2 size={16}/>} Test</button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                          <button onClick={() => setOpenConnector(openConnector === c.id ? null : c.id)} className="mt-4 w-full rounded-xl border border-white/[.08] bg-white/[0.04] py-2 text-sm transition hover:bg-white/[0.06]">{openConnector === c.id ? 'Close' : 'Manage'}</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )})}
          </div>
        )}

        {integration.gmail.connected && (
          <div className="mt-8 rounded-2xl border border-white/[.12] bg-white/[0.04] p-6">
            <h2 className="text-lg font-semibold">Send a test email</h2>
            <p className="mt-1 text-sm text-white/55">Verify your Gmail connector is sending from {integration.gmail.email}.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="email" value={testEmail.to} onChange={e => setTestEmail(prev => ({ ...prev, to: e.target.value }))} className="field" placeholder="To" />
              <input value={testEmail.subject} onChange={e => setTestEmail(prev => ({ ...prev, subject: e.target.value }))} className="field" placeholder="Subject" />
            </div>
            <textarea value={testEmail.text} onChange={e => setTestEmail(prev => ({ ...prev, text: e.target.value }))} className="field mt-3 h-28 py-3" placeholder="Message" />
            <button onClick={() => void sendTest()} disabled={busy || !testEmail.to.trim()} className="mt-4 flex min-h-11 items-center gap-2 rounded-xl btn-alpha px-5 text-sm text-white disabled:opacity-50"><Mail size={16}/>{busy ? <LoaderCircle className="animate-spin" size={16}/> : 'Send test'}</button>
          </div>
        )}
      </div>
    </div>
  )
}
