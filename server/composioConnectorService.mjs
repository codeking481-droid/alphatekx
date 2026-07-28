// Alpha Connector Layer — Composio-powered provider-neutral connector service
// Uses @composio/core SDK for OAuth-based third-party integrations
// No credentials/tokens leave the server

import { Composio } from '@composio/core'
import { supabaseServiceHeaders } from './supabaseHeaders.mjs'

// ---------------------------------------------------------------------------
// Provider Registry — maps AlphaTekX provider IDs to Composio toolkit slugs
// and auth-config environment variable names
// ---------------------------------------------------------------------------

/**
 * Provider definition.
 * @typedef {Object} ConnectorProviderDef
 * @property {string} id - AlphaTekX public provider ID
 * @property {string} name - Human-readable name
 * @property {string} composioAppName - Composio toolkit/partner app slug
 * @property {string} authConfigEnv - Env var name for auth-config ID
 * @property {boolean} enabled - Whether this provider is available
 * @property {'beta'|'live'} stage - Release stage
 * @property {string[]} actions - Allowed action IDs
 * @property {boolean} isNative - Whether execution is native (not composio)
 * @property {string} category - Provider category
 */

/** @type {Record<string, ConnectorProviderDef>} */
const PROVIDER_DEFS = {
  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp',
    composioAppName: 'whatsapp',
    composioAppNames: ['whatsapp', 'whatsapp_business'],
    authConfigEnv: 'COMPOSIO_WHATSAPP_AUTH_CONFIG_ID',
    enabled: false,
    stage: 'beta',
    actions: ['send_message', 'send_template'],
    isNative: false,
    category: 'Communication',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    composioAppName: 'facebook',
    composioAppNames: ['facebook'],
    authConfigEnv: 'COMPOSIO_FACEBOOK_AUTH_CONFIG_ID',
    enabled: false,
    stage: 'beta',
    actions: ['create_post', 'create_page_post', 'publish'],
    isNative: false,
    category: 'Social Media',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    composioAppName: 'instagram',
    composioAppNames: ['instagram'],
    authConfigEnv: 'COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID',
    enabled: false,
    stage: 'beta',
    actions: ['create_media', 'create_post', 'create_media_post', 'publish_post', 'publish_reel', 'publish_story'],
    isNative: false,
    category: 'Social Media',
  },
  twitter: {
    id: 'twitter',
    name: 'X (Twitter)',
    composioAppName: 'twitter',
    composioAppNames: ['twitter'],
    authConfigEnv: 'COMPOSIO_TWITTER_AUTH_CONFIG_ID',
    enabled: false,
    stage: 'beta',
    actions: ['create_post', 'create_tweet', 'create_thread', 'create_media_tweet'],
    isNative: false,
    category: 'Social Media',
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    composioAppName: 'youtube',
    composioAppNames: ['youtube'],
    authConfigEnv: 'COMPOSIO_YOUTUBE_AUTH_CONFIG_ID',
    enabled: false,
    stage: 'beta',
    actions: ['upload_video', 'create_short', 'update_video', 'update_description'],
    isNative: false,
    category: 'Content',
  },
}

const AUTH_CONFIG_ALIASES = {
  whatsapp: ['WHATSAPP_AUTH_CONFIG_ID', 'COMPOSIO_WHATSAPP_BUSINESS_AUTH_CONFIG_ID'],
  facebook: ['FACEBOOK_AUTH_CONFIG_ID'],
  instagram: ['INSTAGRAM_AUTH_CONFIG_ID', 'COMPOSIO_META_INSTAGRAM_AUTH_CONFIG_ID'],
  twitter: ['COMPOSIO_X_AUTH_CONFIG_ID', 'TWITTER_AUTH_CONFIG_ID', 'X_AUTH_CONFIG_ID'],
  youtube: ['YOUTUBE_AUTH_CONFIG_ID'],
}

// ---------------------------------------------------------------------------
// Provider alias resolution
// ---------------------------------------------------------------------------

const ALIASES = {
  x: 'twitter',
  'x (twitter)': 'twitter',
  linkedin: 'linkedin', // native, not composio
  gmail: 'gmail', // native
  telegram: 'telegram', // native
}

function resolveProviderAlias(idOrName) {
  const key = String(idOrName || '').toLowerCase().trim()
  if (PROVIDER_DEFS[key]) return key
  if (ALIASES[key]) return ALIASES[key]
  // Search by name
  for (const [pid, def] of Object.entries(PROVIDER_DEFS)) {
    if (def.name.toLowerCase() === key) return pid
  }
  return null
}

// ---------------------------------------------------------------------------
// Action allowlist with mapping to Composio tool slugs
// ---------------------------------------------------------------------------

/** Maps (providerId, actionId) → Composio tool slug */
const ACTION_TOOL_MAP = {
  'whatsapp.send_message': process.env.COMPOSIO_WHATSAPP_SEND_MESSAGE_TOOL || 'WHATSAPP_SEND_MESSAGE',
  'whatsapp.send_template': process.env.COMPOSIO_WHATSAPP_SEND_TEMPLATE_TOOL || 'WHATSAPP_SEND_TEMPLATE_MESSAGE',
  'facebook.create_post': process.env.COMPOSIO_FACEBOOK_CREATE_POST_TOOL || 'FACEBOOK_CREATE_POST',
  'facebook.create_page_post': process.env.COMPOSIO_FACEBOOK_CREATE_PAGE_POST_TOOL || 'FACEBOOK_CREATE_POST',
  'facebook.publish': process.env.COMPOSIO_FACEBOOK_PUBLISH_TOOL || 'FACEBOOK_CREATE_POST',
  'instagram.create_media': process.env.COMPOSIO_INSTAGRAM_CREATE_MEDIA_TOOL || 'INSTAGRAM_POST_IG_USER_MEDIA',
  'instagram.create_post': process.env.COMPOSIO_INSTAGRAM_CREATE_POST_TOOL || 'INSTAGRAM_CREATE_POST',
  'instagram.create_media_post': process.env.COMPOSIO_INSTAGRAM_CREATE_MEDIA_POST_TOOL || 'INSTAGRAM_CREATE_POST',
  'instagram.publish_post': process.env.COMPOSIO_INSTAGRAM_PUBLISH_POST_TOOL || 'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH',
  'instagram.publish_reel': process.env.COMPOSIO_INSTAGRAM_PUBLISH_REEL_TOOL || 'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH',
  'instagram.publish_story': process.env.COMPOSIO_INSTAGRAM_PUBLISH_STORY_TOOL || 'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH',
  'twitter.create_post': process.env.COMPOSIO_TWITTER_CREATE_POST_TOOL || 'TWITTER_CREATION_OF_A_POST',
  'twitter.create_tweet': process.env.COMPOSIO_TWITTER_CREATE_TWEET_TOOL || 'TWITTER_CREATION_OF_A_POST',
  'twitter.create_thread': process.env.COMPOSIO_TWITTER_CREATE_THREAD_TOOL || 'TWITTER_CREATION_OF_A_POST',
  'twitter.create_media_tweet': process.env.COMPOSIO_TWITTER_CREATE_MEDIA_TWEET_TOOL || 'TWITTER_CREATION_OF_A_POST',
  'youtube.upload_video': process.env.COMPOSIO_YOUTUBE_UPLOAD_VIDEO_TOOL || 'YOUTUBE_UPLOAD_VIDEO',
  'youtube.create_short': process.env.COMPOSIO_YOUTUBE_CREATE_SHORT_TOOL || 'YOUTUBE_UPLOAD_VIDEO',
  'youtube.update_video': process.env.COMPOSIO_YOUTUBE_UPDATE_VIDEO_TOOL || 'YOUTUBE_UPDATE_VIDEO',
  'youtube.update_description': process.env.COMPOSIO_YOUTUBE_UPDATE_DESCRIPTION_TOOL || 'YOUTUBE_UPDATE_VIDEO',
}

const TOOLKIT_VERSIONS = {
  whatsapp: '20260721_00',
  facebook: '20260721_00',
  instagram: '20260721_00',
  twitter: '20260724_00',
  youtube: '20260721_00',
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Composio|null} */
let composioClient = null
let initialized = false
let initError = null
let composioAppName = 'alphatekx'

/** @type {Record<string, {authConfigId: string, enabled: boolean, error?: string}>} */
const providerConfigs = {}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Validate required config at startup.
 * Missing config for one Beta provider must not crash the entire server.
 * Mark that provider unavailable and return a safe message.
 */
export function initialize() {
  if (initialized) return { ok: true, initialized: true }
  
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) {
    initError = 'Connector service is not configured. Contact support.'
    initialized = true
    return { ok: false, error: initError }
  }

  try {
    composioAppName = String(process.env.COMPOSIO_APP_NAME || 'alphatekx').trim() || 'alphatekx'
    composioClient = new Composio({ apiKey })
    
    // Load provider configs from env vars
    for (const [pid, def] of Object.entries(PROVIDER_DEFS)) {
      const envNames = [def.authConfigEnv, ...(AUTH_CONFIG_ALIASES[pid] || [])]
      const configuredEnv = envNames.find(name => String(process.env[name] || '').trim())
      const authConfigId = configuredEnv ? String(process.env[configuredEnv]).trim() : ''
      if (authConfigId) {
        providerConfigs[pid] = {
          authConfigId,
          enabled: true,
          configuredEnv,
        }
        PROVIDER_DEFS[pid].enabled = true
      } else {
        providerConfigs[pid] = {
          authConfigId: null,
          enabled: false,
          requiredEnvironment: envNames,
          error: `Add ${envNames.join(' or ')} on Render, then redeploy.`,
        }
      }
    }

    initialized = true
    return { ok: true }
  } catch (error) {
    initError = error instanceof Error ? error.message : 'Composio SDK initialization failed'
    initialized = true
    return { ok: false, error: initError }
  }
}

function ensureInitialized() {
  if (!initialized) return initialize()
  if (initError) return { ok: false, error: initError }
  return { ok: true }
}

async function resolveProviderConfig(providerId) {
  const existing = providerConfigs[providerId]
  if (existing?.enabled && existing.authConfigId) return existing
  const def = PROVIDER_DEFS[providerId]
  if (!def || !composioClient) return existing || { enabled: false, authConfigId: null }

  for (const toolkit of def.composioAppNames || [def.composioAppName]) {
    try {
      const response = await composioClient.authConfigs.list({ toolkit, showDisabled: false, limit: 100 })
      const items = Array.isArray(response?.items) ? response.items : []
      const enabled = items.find(item => String(item?.status || '').toUpperCase() === 'ENABLED') || items[0]
      if (enabled?.id) {
        const discovered = {
          authConfigId: enabled.id,
          enabled: true,
          configuredEnv: null,
          discoveredFromComposio: true,
          toolkit,
        }
        providerConfigs[providerId] = discovered
        def.enabled = true
        return discovered
      }
    } catch {
      // Try the next compatible toolkit slug. Safe configuration details stay server-side.
    }
  }
  const unavailable = {
    ...(existing || {}),
    enabled: false,
    authConfigId: null,
    error: `${def.name} has no enabled Auth Config in the AlphaTekx Composio project.`,
  }
  providerConfigs[providerId] = unavailable
  return unavailable
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getUserComposioId(alphaUserId, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  return normalizedEmail || `${composioAppName}:${alphaUserId}`
}

function composioUserIds(user) {
  return [...new Set([getUserComposioId(user.id, user.email), `alphatekx:${user.id}`].filter(Boolean))]
}

function composioUserId(alphaUserId, email = '') {
  return getUserComposioId(alphaUserId, email)
}

function alphaUserIdFromComposio(cuid) {
  if (!cuid || typeof cuid !== 'string') return null
  const prefix = 'alphatekx:'
  return cuid.startsWith(prefix) ? cuid.slice(prefix.length) : null
}

function sanitizeError(error) {
  if (!error) return 'Unknown error'
  const message = error instanceof Error ? error.message : String(error)
  // Never leak SDK internals, API keys, or tokens
  if (/api[-_]?key|secret|token|auth|composio/i.test(message)) {
    return 'Provider authentication failed'
  }
  return message.slice(0, 200)
}

function persistenceConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  return url && service ? { url, service } : null
}

function accountBelongsToUser(account, user) {
  const accountUser = String(account?.userId || account?.user_id || '').toLowerCase()
  // Composio is deprecating user_id in list responses. The list request is already
  // scoped by userIds, so a missing echoed owner is not an ownership failure.
  if (!accountUser) return true
  return composioUserIds(user).some(id => id.toLowerCase() === accountUser) ||
    alphaUserIdFromComposio(accountUser) === user.id
}

async function listUserAccounts(user, config, statuses) {
  return composioClient.connectedAccounts.list({
    userIds: composioUserIds(user),
    authConfigIds: config?.authConfigId ? [config.authConfigId] : undefined,
    statuses,
  })
}

async function persistConnection(user, provider, account, status) {
  const config = persistenceConfig()
  if (!config) return
  const record = {
    user_id: user.id,
    provider,
    connection_backend: 'composio',
    toolkit_slug: provider,
    composio_connected_account_id: account.id,
    status,
    display_label: account.displayName || account.name || PROVIDER_DEFS[provider]?.name || provider,
    account_metadata: {},
    last_verified_at: new Date().toISOString(),
    disconnected_at: status === 'disconnected' ? new Date().toISOString() : null,
  }
  const response = await fetch(`${config.url}/rest/v1/connected_accounts?on_conflict=user_id,provider`, {
    method: 'POST',
    headers: supabaseServiceHeaders(config.service, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(record),
  })
  if (!response.ok) throw new Error('Connection was verified but could not be saved')
}

async function persistExecution(record) {
  const config = persistenceConfig()
  if (!config) return true
  const response = await fetch(`${config.url}/rest/v1/connector_executions`, {
    method: 'POST',
    headers: supabaseServiceHeaders(config.service, { Prefer: 'return=minimal' }),
    body: JSON.stringify(record),
  })
  if (response.status === 409) return false
  if (!response.ok) throw new Error('Execution history could not be saved')
  return true
}

async function finishExecution(userId, idempotencyKey, changes) {
  const config = persistenceConfig()
  if (!config) return
  const response = await fetch(`${config.url}/rest/v1/connector_executions?user_id=eq.${encodeURIComponent(userId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}`, {
    method: 'PATCH',
    headers: supabaseServiceHeaders(config.service, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ ...changes, completed_at: new Date().toISOString() }),
  })
  if (!response.ok) throw new Error('Execution result could not be saved')
}

async function findExecution(userId, idempotencyKey) {
  const config = persistenceConfig()
  if (!config) return null
  const response = await fetch(`${config.url}/rest/v1/connector_executions?user_id=eq.${encodeURIComponent(userId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=*&limit=1`, {
    headers: supabaseServiceHeaders(config.service),
  })
  if (!response.ok) throw new Error('Execution history could not be read')
  return (await response.json())?.[0] || null
}

async function getCreditBalance(userId) {
  const config = persistenceConfig()
  if (!config) throw new Error('Database not ready, contact admin')
  const response = await fetch(`${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=credits&limit=1`, {
    headers: supabaseServiceHeaders(config.service),
  })
  if (!response.ok) {
    console.error('[AlphaTekX] Composio profile read failed', response.status, await response.text().catch(() => ''))
    throw new Error('Database not ready, contact admin')
  }
  const rows = await response.json()
  return Number(rows?.[0]?.credits) || 0
}

async function chargeConfirmedExecution(user, amount, metadata) {
  const config = persistenceConfig()
  if (!config) throw new Error('Database not ready, contact admin')
  const response = await fetch(`${config.url}/rest/v1/rpc/deduct_credit_atomic`, {
    method: 'POST',
    headers: supabaseServiceHeaders(config.service),
    body: JSON.stringify({
      p_user_id: user.id,
      p_amount: amount,
      p_idempotency_key: metadata.idempotencyKey,
      p_description: metadata.description,
      p_platform: metadata.platform,
      p_provider_id: metadata.providerId || null,
    }),
  })
  const raw = await response.text()
  let result = null
  try { result = raw ? JSON.parse(raw) : null } catch {}
  if (!response.ok) {
    console.error('[AlphaTekX] Atomic credit settlement failed', response.status, raw)
    const missingRpc = response.status === 404 || /deduct_credit_atomic|schema cache|function/i.test(raw)
    throw new Error(missingRpc ? 'Atomic credit migration is not installed; publication was confirmed but billing is pending. Contact admin.' : 'Database not ready, contact admin')
  }
  if (result?.status === 'insufficient') throw new Error('Insufficient credits')
  if (result?.status === 'error') throw new Error(result.message || 'Atomic credit settlement failed')
  if (!['success', 'already_processed'].includes(result?.status)) throw new Error('Atomic credit settlement returned an invalid result')
  return Number.isFinite(Number(result.new_balance)) ? Number(result.new_balance) : getCreditBalance(user.id)
}

function confirmedProviderId(value, depth = 0) {
  if (!value || depth > 5) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = confirmedProviderId(item, depth + 1)
      if (found) return found
    }
    return ''
  }
  const preferred = ['provider_id', 'post_id', 'tweet_id', 'video_id', 'media_id', 'message_id', 'id']
  for (const key of preferred) {
    if (value[key] != null && ['string', 'number'].includes(typeof value[key])) return String(value[key])
  }
  for (const nested of ['data', 'response', 'result', 'post', 'tweet', 'video', 'media', 'message']) {
    const found = confirmedProviderId(value[nested], depth + 1)
    if (found) return found
  }
  return ''
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all providers with their current availability and connection status
 * for the given user.
 * 
 * @param {object} user - Authenticated AlphaTekX user { id, email }
 * @returns {Promise<{providers: Array, executions: Array}>}
 */
export async function getConnectedApps(user) {
  const init = ensureInitialized()

  const providers = []
  for (const [pid, def] of Object.entries(PROVIDER_DEFS)) {
    const config = init.ok ? await resolveProviderConfig(pid) : (providerConfigs[pid] || { enabled: false })
    let connected = false
    let connectionId = null
    let status = 'disconnected'
    let connectedAt = null
    let lastSyncedAt = null
    let error = config.error || (!init.ok ? init.error : null)

    if (init.ok && config.enabled && user) {
      try {
        const accounts = await listUserAccounts(user, config)
        if (accounts.items && accounts.items.length > 0) {
          const account = accounts.items[0]
          connected = account.status === 'ACTIVE' || account.status === 'CONNECTED'
          connectionId = account.id
          status = connected ? 'connected' : account.status?.toLowerCase() || 'disconnected'
          connectedAt = account.createdAt || account.created_at || null
          lastSyncedAt = account.updatedAt || account.updated_at || null
          await persistConnection(user, pid, account, connected ? 'connected' : status)
        }
      } catch (err) {
        error = sanitizeError(err)
      }
    }

    providers.push({
      provider: pid,
      name: def.name,
      connected,
      connectionId,
      status: connected ? 'connected' : (!config.enabled ? 'unavailable' : (error ? 'error' : status)),
      stage: def.stage,
      enabled: config.enabled,
      category: def.category,
      connectedAt,
      lastSyncedAt,
      error,
      requiredEnvironment: config.requiredEnvironment || [],
      isNative: def.isNative,
      actions: def.actions,
    })
  }

  return { providers, executions: [], error: init.ok ? null : init.error }
}

/**
 * Start OAuth connection for a provider.
 * 
 * @param {object} user - Authenticated AlphaTekX user
 * @param {string} providerId - Provider ID 
 * @param {string} callbackUrl - OAuth callback URL
 * @returns {Promise<{authUrl: string, provider: string, connectionId?: string}>}
 */
export async function startConnection(user, providerId, callbackUrl) {
  const init = ensureInitialized()
  if (!init.ok) throw new Error(init.error)

  const pid = resolveProviderAlias(providerId)
  if (!pid) throw new Error(`Unknown provider: ${providerId}`)

  const def = PROVIDER_DEFS[pid]
  if (!def) throw new Error(`Unknown provider: ${providerId}`)

  const config = await resolveProviderConfig(pid)
  if (!config || !config.enabled || !config.authConfigId) {
    throw new Error(`${def.name} is not configured. ${config?.error || 'Contact support.'}`)
  }

  if (!user || !user.id) throw new Error('Authentication required')

  const uid = composioUserId(user.id, user.email)

  // Use the current Composio SDK's connectedAccounts.link() for OAuth
  const connectionRequest = await composioClient.connectedAccounts.link(
    uid,
    config.authConfigId,
    {
      callbackUrl: callbackUrl || undefined,
      allowMultiple: false,
    }
  )

  if (!connectionRequest.redirectUrl) {
    throw new Error(`${def.name} could not generate an OAuth URL.`)
  }

  return {
    authUrl: connectionRequest.redirectUrl,
    provider: pid,
    connectionId: connectionRequest.id,
  }
}

/**
 * Get connection status for a specific provider.
 * 
 * @param {object} user - Authenticated AlphaTekX user
 * @param {string} providerId - Provider ID
 * @returns {Promise<{connected: boolean, status: string, connectionId?: string, connectedAt?: string}>}
 */
export async function getConnectionStatus(user, providerId) {
  const init = ensureInitialized()
  if (!init.ok) return { connected: false, status: 'unavailable', error: init.error, provider: resolveProviderAlias(providerId) || providerId }
  const pid = resolveProviderAlias(providerId)
  if (!pid) throw new Error(`Unknown provider: ${providerId}`)

  const def = PROVIDER_DEFS[pid]
  const config = await resolveProviderConfig(pid)

  if (!config || !config.enabled) {
    return { connected: false, status: 'unavailable', provider: pid }
  }

  if (!user || !user.id) {
    return { connected: false, status: 'unauthenticated', provider: pid }
  }

  try {
    const accounts = await listUserAccounts(user, config)

    if (accounts.items && accounts.items.length > 0) {
      const account = accounts.items[0]
      const connected = account.status === 'ACTIVE' || account.status === 'CONNECTED'
      return {
        connected,
        status: connected ? 'connected' : (account.status?.toLowerCase() || 'disconnected'),
        connectionId: account.id,
        connectedAt: account.createdAt || account.created_at || null,
        provider: pid,
      }
    }
  } catch (error) {
    return { connected: false, status: 'error', error: sanitizeError(error), provider: pid }
  }

  return { connected: false, status: 'disconnected', provider: pid }
}

/**
 * Reconnect (refresh) a provider connection.
 * 
 * @param {object} user - Authenticated AlphaTekX user
 * @param {string} providerId - Provider ID
 * @param {string} callbackUrl - OAuth callback URL 
 * @returns {Promise<{authUrl?: string, provider: string, connectionId?: string}>}
 */
export async function reconnectProvider(user, providerId, callbackUrl) {
  const init = ensureInitialized()
  if (!init.ok) throw new Error(init.error)

  const pid = resolveProviderAlias(providerId)
  if (!pid) throw new Error(`Unknown provider: ${providerId}`)

  const def = PROVIDER_DEFS[pid]
  const config = await resolveProviderConfig(pid)

  if (!config || !config.enabled || !config.authConfigId) {
    throw new Error(`${def.name} is not configured.`)
  }

  if (!user || !user.id) throw new Error('Authentication required')

  // Find existing connected account
  const accounts = await listUserAccounts(user, config)

  if (accounts.items && accounts.items.length > 0) {
    const existing = accounts.items[0]
    // Refresh the existing connection
    await composioClient.connectedAccounts.refresh(existing.id, {
      redirectUrl: callbackUrl || undefined,
    })
    return { provider: pid, connectionId: existing.id }
  }

  // No existing connection - create new one
  return startConnection(user, providerId, callbackUrl)
}

/**
 * Disconnect (delete) a provider connection.
 * Only affects the authenticated user's own connection.
 * 
 * @param {object} user - Authenticated AlphaTekX user
 * @param {string} providerId - Provider ID
 * @returns {Promise<{success: boolean, provider: string}>}
 */
export async function disconnectProvider(user, providerId) {
  const init = ensureInitialized()
  if (!init.ok) throw new Error(init.error)

  const pid = resolveProviderAlias(providerId)
  if (!pid) throw new Error(`Unknown provider: ${providerId}`)

  const config = await resolveProviderConfig(pid)
  if (!user || !user.id) throw new Error('Authentication required')

  // A connection must remain removable even if its Auth Config was later disabled.
  // Fall back to the provider's toolkit slug while retaining the authenticated
  // user's server-side Composio identity filter.
  const def = PROVIDER_DEFS[pid]
  const accounts = await composioClient.connectedAccounts.list({
    userIds: composioUserIds(user),
    authConfigIds: config?.authConfigId ? [config.authConfigId] : undefined,
    toolkitSlugs: config?.authConfigId ? undefined : (def.composioAppNames || [def.composioAppName]),
  })
  const items = Array.isArray(accounts?.items) ? accounts.items : []
  let deletedAccounts = 0
  for (const account of items) {
    if (!accountBelongsToUser(account, user)) {
      throw new Error('You do not own this connection')
    }
    await composioClient.connectedAccounts.delete(account.id)
    deletedAccounts += 1
    try {
      await persistConnection(user, pid, account, 'disconnected')
    } catch (error) {
      // Provider deletion already succeeded. Do not falsely tell the user it failed
      // because optional local connection-history persistence is unavailable.
      console.error('[AlphaTekX] Disconnected provider but could not persist connector history', sanitizeError(error))
    }
  }

  return { success: true, disconnected: true, provider: pid, deletedAccounts }
}

/**
 * Execute an action on a connected provider.
 * Only executes through the authenticated user's own connection.
 * 
 * @param {object} user - Authenticated AlphaTekX user
 * @param {string} providerId - Provider ID
 * @param {string} actionId - Action ID
 * @param {object} payload - Action parameters
 * @returns {Promise<{success: boolean, executionId: string, result: unknown, executionTimeMs: number}>}
 */
export async function executeProviderAction(user, providerId, actionId, payload) {
  const init = ensureInitialized()
  if (!init.ok) throw new Error(init.error)

  const pid = resolveProviderAlias(providerId)
  if (!pid) throw new Error(`Unknown provider: ${providerId}`)

  const def = PROVIDER_DEFS[pid]
  if (!def) throw new Error(`Unknown provider: ${providerId}`)

  // Validate action is allowed
  if (!def.actions.includes(actionId)) {
    throw new Error(`Action "${actionId}" is not supported for ${def.name}`)
  }

  const config = await resolveProviderConfig(pid)
  if (!config || !config.enabled || !config.authConfigId) {
    throw new Error(`${def.name} is not configured.`)
  }

  if (!user || !user.id) throw new Error('Authentication required')

  // Resolve to composio tool slug
  const toolKey = `${pid}.${actionId}`
  const toolSlug = ACTION_TOOL_MAP[toolKey]
  if (!toolSlug) {
    throw new Error(`No known execution path for ${toolKey}`)
  }

  const uid = composioUserId(user.id, user.email)

  // Find the user's active connected account for this provider
  const accounts = await listUserAccounts(user, config, ['ACTIVE'])

  if (!accounts.items || accounts.items.length === 0) {
    const error = new Error(`Please reconnect ${def.name} in AlphaTekx Connected Apps`)
    error.code = 'RECONNECT_NEEDED'
    throw error
  }

  const account = accounts.items[0]
  if (!accountBelongsToUser(account, user)) {
    throw new Error('You do not own this connection')
  }

  const approvalId = String(payload?.approvalId || '').trim()
  const idempotencyKey = String(payload?.idempotencyKey || '').trim()
  if (!approvalId) throw new Error('Explicit approval is required')
  if (!idempotencyKey) throw new Error('Idempotency key is required')
  const previous = await findExecution(user.id, idempotencyKey)
  if (previous?.status === 'succeeded' && previous.provider_execution_id) {
    return {
      success: true,
      executionId: previous.id,
      providerId: previous.provider_execution_id,
      creditsCharged: 0,
      balance: await getCreditBalance(user.id),
      result: previous.result_metadata || { replayed: true },
      executionTimeMs: 0,
      replayed: true,
    }
  }
  if (previous?.status === 'provider_confirmed' && previous.provider_execution_id) {
    const pendingBalance = await chargeConfirmedExecution(user, 1, {
      idempotencyKey,
      description: `${pid}.${actionId}`,
      platform: pid,
      action: actionId,
      providerId: previous.provider_execution_id,
    })
    await finishExecution(user.id, idempotencyKey, {
      status: 'succeeded',
      provider_execution_id: previous.provider_execution_id,
      result_metadata: { ...(previous.result_metadata || {}), confirmed: true, providerId: previous.provider_execution_id, balance: pendingBalance },
      credits_charged: 1,
    })
    return {
      success: true,
      executionId: previous.id,
      providerId: previous.provider_execution_id,
      creditsCharged: 1,
      balance: pendingBalance,
      result: previous.result_metadata || { billingRecovered: true },
      executionTimeMs: 0,
      replayed: true,
    }
  }
  if (previous) throw new Error(previous.status === 'claimed' ? 'This approved action is already in progress' : 'This idempotency key already has a recorded failed execution')
  if (await getCreditBalance(user.id) < 1) throw new Error('Insufficient credits')
  const actionArguments = { ...(payload || {}) }
  delete actionArguments.approvalId
  delete actionArguments.idempotencyKey
  const claimed = await persistExecution({
    user_id: user.id, toolkit_slug: pid, capability_id: actionId, status: 'claimed',
    approval_id: approvalId, idempotency_key: idempotencyKey, credits_charged: 0,
  })
  if (!claimed) {
    const concurrent = await findExecution(user.id, idempotencyKey)
    if (concurrent?.status === 'succeeded' && concurrent.provider_execution_id) {
      return {
        success: true,
        executionId: concurrent.id,
        providerId: concurrent.provider_execution_id,
        creditsCharged: 0,
        balance: await getCreditBalance(user.id),
        result: concurrent.result_metadata || { replayed: true },
        executionTimeMs: 0,
        replayed: true,
      }
    }
    throw new Error('This approved action is already in progress')
  }
  const startTime = Date.now()

  // Execute through Composio SDK tools
  let result
  let retryCount = 0
  try {
    const version = String(process.env[`COMPOSIO_TOOLKIT_VERSION_${pid.toUpperCase()}`] || TOOLKIT_VERSIONS[pid] || '').trim()
    const retryDelays = [0, 2_000, 5_000, 10_000]
    let lastProviderError
    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      if (retryDelays[attempt]) await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]))
      try {
        result = await Promise.race([
          composioClient.tools.execute(toolSlug, {
            connectedAccountId: account.id,
            userId: uid,
            version,
            arguments: actionArguments,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Provider request timed out')), 30_000)),
        ])
        retryCount = attempt
        break
      } catch (error) {
        lastProviderError = error
        if (/connection.*not found|connected account|not connected|unauthorized|forbidden|permission/i.test(String(error?.message || error))) throw error
        if (attempt === retryDelays.length - 1) throw error
      }
    }
    if (!result && lastProviderError) throw lastProviderError
  } catch (error) {
    await finishExecution(user.id, idempotencyKey, { status: 'failed', error_code: 'provider_error' })
    if (/connection.*not found|connected account|not connected|unauthorized/i.test(String(error?.message || error))) {
      const reconnect = new Error(`Please reconnect ${def.name} in AlphaTekx Connected Apps`)
      reconnect.code = 'RECONNECT_NEEDED'
      throw reconnect
    }
    throw error
  }

  const executionTimeMs = Date.now() - startTime

  if (!result || result.error) {
    throw new Error(result?.error || 'Execution failed')
  }

  // Verify real successful result from Composio — never report success from
  // empty, partial, queued, or failed response
  const responseData = result.data
  const successful = result.successful === true && responseData != null

  if (!successful) {
    await finishExecution(user.id, idempotencyKey, { status: 'failed', error_code: 'provider_unconfirmed' })
    throw new Error('Provider did not confirm a successful execution')
  }

  const confirmedId = confirmedProviderId(responseData)
  if (!confirmedId) {
    await finishExecution(user.id, idempotencyKey, { status: 'failed', error_code: 'missing_provider_id' })
    throw new Error('Provider completed without returning a confirmed post or message ID')
  }
  await finishExecution(user.id, idempotencyKey, {
    status: 'provider_confirmed',
    provider_execution_id: confirmedId,
    result_metadata: { confirmed: true, providerId: confirmedId, billingPending: true, retryCount },
    credits_charged: 0,
  })
  const balance = await chargeConfirmedExecution(user, 1, {
    idempotencyKey,
    description: `${pid}.${actionId}`,
    platform: pid,
    action: actionId,
    providerId: confirmedId,
  })
  await finishExecution(user.id, idempotencyKey, {
    status: 'succeeded',
    provider_execution_id: confirmedId, result_metadata: { confirmed: true, providerId: confirmedId, balance, retryCount },
    credits_charged: 1,
  })
  return {
    success: true,
    executionId: result.logId || `exec_${Date.now()}`,
    providerId: confirmedId,
    creditsCharged: 1,
    balance,
    result: responseData,
    executionTimeMs,
    retryCount,
  }
}

/**
 * Get execution history for a user's provider connection.
 * 
 * @param {object} user - Authenticated AlphaTekX user
 * @param {string} providerId - Provider ID
 * @param {number} limit - Max results
 * @returns {Promise<{executions: Array}>}
 */
export async function getExecutionHistory(user, providerId, limit = 10) {
  // Execution history is stored in our own database (alpha_connector_executions table)
  // This method returns a server-side reference — the actual history should be
  // queried from the database by the route handler
  const pid = resolveProviderAlias(providerId)
  const config = persistenceConfig()
  if (!pid || !user?.id || !config) return { executions: [] }
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10))
  try {
    const response = await fetch(`${config.url}/rest/v1/connector_executions?user_id=eq.${encodeURIComponent(user.id)}&toolkit_slug=eq.${encodeURIComponent(pid)}&select=*&order=created_at.desc&limit=${safeLimit}`, {
      headers: supabaseServiceHeaders(config.service),
    })
    if (!response.ok) return { executions: [], warning: 'Execution history is temporarily unavailable' }
    return { executions: await response.json() }
  } catch {
    return { executions: [], warning: 'Execution history is temporarily unavailable' }
  }
}

export async function testConnection(user, providerId) {
  const status = await getConnectionStatus(user, providerId)
  return { ...status, verified: status.connected === true, checkedAt: new Date().toISOString() }
}

// ---------------------------------------------------------------------------
// Internal: get provider definitions (for route handlers)
// ---------------------------------------------------------------------------

export function getProviderDefs() {
  return { ...PROVIDER_DEFS }
}

export function getProviderConfigs() {
  return { ...providerConfigs }
}

export function getProviderConfig(providerId) {
  const pid = resolveProviderAlias(providerId)
  if (!pid) return null
  return providerConfigs[pid] || null
}

export function getProviderDef(providerId) {
  const pid = resolveProviderAlias(providerId)
  if (!pid) return null
  return PROVIDER_DEFS[pid] || null
}

export function isProviderEnabled(providerId) {
  const pid = resolveProviderAlias(providerId)
  if (!pid) return false
  const config = providerConfigs[pid]
  return config ? config.enabled : false
}

