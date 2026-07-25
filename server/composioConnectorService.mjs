// Alpha Connector Layer — Composio-powered provider-neutral connector service
// Uses @composio/core SDK for OAuth-based third-party integrations
// No credentials/tokens leave the server

import { Composio } from '@composio/core'

// ---------------------------------------------------------------------------
// Provider Registry — maps AlphaTekX provider IDs to Composio toolkit slugs
// and auth-config environment variable names
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'iamdan4live@gmail.com'

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
  notion: {
    id: 'notion',
    name: 'Notion',
    composioAppName: 'notion',
    authConfigEnv: 'COMPOSIO_NOTION_AUTH_CONFIG_ID',
    enabled: false,
    stage: 'beta',
    actions: ['create_page', 'append_block', 'search'],
    isNative: false,
    category: 'Productivity',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    composioAppName: 'facebook',
    authConfigEnv: 'COMPOSIO_FACEBOOK_AUTH_CONFIG_ID',
    enabled: false,
    stage: 'beta',
    actions: ['create_page_post', 'upload_photo', 'upload_video'],
    isNative: false,
    category: 'Social Media',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    composioAppName: 'instagram',
    authConfigEnv: 'COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID',
    enabled: false,
    stage: 'beta',
    actions: ['create_media_post', 'create_carousel', 'create_reel'],
    isNative: false,
    category: 'Social Media',
  },
  twitter: {
    id: 'twitter',
    name: 'X (Twitter)',
    composioAppName: 'twitter',
    authConfigEnv: 'COMPOSIO_TWITTER_AUTH_CONFIG_ID',
    enabled: false,
    stage: 'beta',
    actions: ['create_post', 'create_thread', 'reply_to_tweet', 'quote_tweet'],
    isNative: false,
    category: 'Social Media',
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    composioAppName: 'youtube',
    authConfigEnv: 'COMPOSIO_YOUTUBE_AUTH_CONFIG_ID',
    enabled: false,
    stage: 'beta',
    actions: ['upload_video', 'update_video', 'schedule_video'],
    isNative: false,
    category: 'Content',
  },
  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp',
    composioAppName: 'whatsapp_business',
    authConfigEnv: 'COMPOSIO_WHATSAPP_AUTH_CONFIG_ID',
    enabled: false,
    stage: 'beta',
    actions: ['send_message', 'send_template', 'send_media'],
    isNative: false,
    category: 'Communication',
  },
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
  'notion.create_page': 'NOTION_CREATE_PAGE',
  'notion.append_block': 'NOTION_APPEND_BLOCK',
  'notion.search': 'NOTION_SEARCH',
  'facebook.create_page_post': 'FACEBOOK_CREATE_PAGE_POST',
  'facebook.upload_photo': 'FACEBOOK_UPLOAD_PHOTO',
  'facebook.upload_video': 'FACEBOOK_UPLOAD_VIDEO',
  'instagram.create_media_post': 'INSTAGRAM_CREATE_MEDIA_POST',
  'instagram.create_carousel': 'INSTAGRAM_CREATE_CAROUSEL',
  'instagram.create_reel': 'INSTAGRAM_CREATE_REEL',
  'twitter.create_post': 'TWITTER_CREATE_POST',
  'twitter.create_thread': 'TWITTER_CREATE_THREAD',
  'twitter.reply_to_tweet': 'TWITTER_REPLY_TO_TWEET',
  'twitter.quote_tweet': 'TWITTER_QUOTE_TWEET',
  'youtube.upload_video': 'YOUTUBE_UPLOAD_VIDEO',
  'youtube.update_video': 'YOUTUBE_UPDATE_VIDEO',
  'youtube.schedule_video': 'YOUTUBE_SCHEDULE_VIDEO',
  'whatsapp.send_message': 'WHATSAPP_SEND_MESSAGE',
  'whatsapp.send_template': 'WHATSAPP_SEND_TEMPLATE',
  'whatsapp.send_media': 'WHATSAPP_SEND_MEDIA',
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Composio|null} */
let composioClient = null
let initialized = false
let initError = null

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
    composioClient = new Composio({ apiKey })
    
    // Load provider configs from env vars
    for (const [pid, def] of Object.entries(PROVIDER_DEFS)) {
      const authConfigId = process.env[def.authConfigEnv]
      if (authConfigId) {
        providerConfigs[pid] = {
          authConfigId,
          enabled: true,
        }
        PROVIDER_DEFS[pid].enabled = true
      } else {
        providerConfigs[pid] = {
          authConfigId: null,
          enabled: false,
          error: `${def.authConfigEnv} not configured. ${def.name} is unavailable.`,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function composioUserId(alphaUserId) {
  return `alphatekx_${alphaUserId}`
}

function alphaUserIdFromComposio(cuid) {
  if (!cuid || typeof cuid !== 'string') return null
  const prefix = 'alphatekx_'
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

function isAdminUser(user) {
  return user && String(user.email || '').toLowerCase() === ADMIN_EMAIL
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
  if (!init.ok) {
    return { providers: [], executions: [], error: init.error }
  }

  const providers = []
  for (const [pid, def] of Object.entries(PROVIDER_DEFS)) {
    const config = providerConfigs[pid] || { enabled: false }
    let connected = false
    let connectionId = null
    let status = 'disconnected'
    let connectedAt = null
    let lastSyncedAt = null
    let error = null

    if (config.enabled && user) {
      try {
        const uid = composioUserId(user.id)
        const accounts = await composioClient.connectedAccounts.list({
          userIds: [uid],
          authConfigIds: [config.authConfigId],
        })
        if (accounts.items && accounts.items.length > 0) {
          const account = accounts.items[0]
          connected = account.status === 'ACTIVE' || account.status === 'CONNECTED'
          connectionId = account.id
          status = connected ? 'connected' : account.status?.toLowerCase() || 'disconnected'
          connectedAt = account.createdAt || account.created_at || null
          lastSyncedAt = account.updatedAt || account.updated_at || null
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
      status: connected ? 'connected' : (error ? 'error' : status),
      stage: def.stage,
      enabled: config.enabled,
      category: def.category,
      connectedAt,
      lastSyncedAt,
      error,
      isNative: def.isNative,
      actions: def.actions,
    })
  }

  return { providers, executions: [] }
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

  const config = providerConfigs[pid]
  if (!config || !config.enabled || !config.authConfigId) {
    throw new Error(`${def.name} is not configured. ${config?.error || 'Contact support.'}`)
  }

  if (!user || !user.id) throw new Error('Authentication required')

  const uid = composioUserId(user.id)

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
  const pid = resolveProviderAlias(providerId)
  if (!pid) throw new Error(`Unknown provider: ${providerId}`)

  const def = PROVIDER_DEFS[pid]
  const config = providerConfigs[pid]

  if (!config || !config.enabled) {
    return { connected: false, status: 'unavailable', provider: pid }
  }

  if (!user || !user.id) {
    return { connected: false, status: 'unauthenticated', provider: pid }
  }

  const uid = composioUserId(user.id)
  
  try {
    const accounts = await composioClient.connectedAccounts.list({
      userIds: [uid],
      authConfigIds: [config.authConfigId],
    })

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
  const config = providerConfigs[pid]

  if (!config || !config.enabled || !config.authConfigId) {
    throw new Error(`${def.name} is not configured.`)
  }

  if (!user || !user.id) throw new Error('Authentication required')

  const uid = composioUserId(user.id)

  // Find existing connected account
  const accounts = await composioClient.connectedAccounts.list({
    userIds: [uid],
    authConfigIds: [config.authConfigId],
  })

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

  const config = providerConfigs[pid]
  if (!config || !config.authConfigId) {
    throw new Error(`Provider ${providerId} has no auth config`)
  }

  if (!user || !user.id) throw new Error('Authentication required')

  const uid = composioUserId(user.id)

  // Find the user's connected account for this provider
  const accounts = await composioClient.connectedAccounts.list({
    userIds: [uid],
    authConfigIds: [config.authConfigId],
  })

  if (accounts.items && accounts.items.length > 0) {
    const account = accounts.items[0]
    // Verify ownership before deleting
    const accountUserId = alphaUserIdFromComposio(account.userId || account.user_id)
    if (accountUserId !== user.id && !isAdminUser(user)) {
      throw new Error('You do not own this connection')
    }
    await composioClient.connectedAccounts.delete(account.id)
  }

  return { success: true, provider: pid }
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

  const config = providerConfigs[pid]
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

  const uid = composioUserId(user.id)

  // Find the user's active connected account for this provider
  const accounts = await composioClient.connectedAccounts.list({
    userIds: [uid],
    authConfigIds: [config.authConfigId],
    statuses: ['ACTIVE'],
  })

  if (!accounts.items || accounts.items.length === 0) {
    throw new Error(`${def.name} is not connected. Connect it first.`)
  }

  const account = accounts.items[0]
  const accountUserId = alphaUserIdFromComposio(account.userId || account.user_id)
  if (accountUserId !== user.id && !isAdminUser(user)) {
    throw new Error('You do not own this connection')
  }

  const startTime = Date.now()

  // Execute through Composio SDK tools
  const result = await composioClient.tools.execute(toolSlug, {
    connectedAccountId: account.id,
    userId: uid,
    arguments: payload || {},
    dangerouslySkipVersionCheck: true,
  })

  const executionTimeMs = Date.now() - startTime

  if (!result || result.error) {
    throw new Error(result?.error || 'Execution failed')
  }

  // Verify real successful result from Composio — never report success from
  // empty, partial, queued, or failed response
  const responseData = result.data
  const successful = result.successful === true && responseData != null

  if (!successful) {
    throw new Error('Provider did not confirm a successful execution')
  }

  return {
    success: true,
    executionId: result.logId || `exec_${Date.now()}`,
    result: responseData,
    executionTimeMs,
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
  return { executions: [] }
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

