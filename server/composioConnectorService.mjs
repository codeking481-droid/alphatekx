// Alpha Connector Layer — Composio-powered provider-neutral connector service
// Uses @composio/core SDK for OAuth-based third-party integrations
// No credentials/tokens leave the server

import { Composio } from '@composio/core'
import { createHash } from 'node:crypto'
import { supabaseServiceHeaders } from './supabaseHeaders.mjs'
import { AUTH_CONFIGS } from './composioAuthConfigs.mjs'

// Campaigns already hold a durable, user-scoped execution lock in server.mjs.
// Track the rare production compatibility path where both optional connector
// history tables are absent so provider confirmation can still be returned to
// that owning campaign and persisted in its post result.
const campaignHistoryCompatibility = new Set()
const compatibilityKey = (userId, idempotencyKey) => `${userId}:${idempotencyKey}`

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
  gmail: {
    id: 'gmail', name: 'Gmail', composioAppName: 'gmail', composioAppNames: ['gmail'],
    authConfigEnv: 'COMPOSIO_GMAIL_AUTH_ID', defaultAuthConfigId: AUTH_CONFIGS.GMAIL,
    enabled: false, stage: 'live', actions: ['send_email', 'list_messages'],
    isNative: false, authMode: 'managed', category: 'Communication',
  },
  github: {
    id: 'github', name: 'GitHub', composioAppName: 'github', composioAppNames: ['github'],
    authConfigEnv: 'COMPOSIO_GITHUB_AUTH_ID', defaultAuthConfigId: AUTH_CONFIGS.GITHUB,
    enabled: false, stage: 'live', actions: ['list_repositories', 'get_file', 'create_issue'],
    isNative: false, authMode: 'managed', category: 'Development',
  },
  googledocs: {
    id: 'googledocs', name: 'Google Docs', composioAppName: 'googledocs', composioAppNames: ['googledocs'],
    authConfigEnv: 'COMPOSIO_GOOGLEDOCS_AUTH_ID', defaultAuthConfigId: AUTH_CONFIGS.DOCS,
    enabled: false, stage: 'live', actions: ['create_document', 'get_document', 'update_document'],
    isNative: false, authMode: 'managed', category: 'Productivity',
  },
  googlesheets: {
    id: 'googlesheets', name: 'Google Sheets', composioAppName: 'googlesheets', composioAppNames: ['googlesheets'],
    authConfigEnv: 'COMPOSIO_SHEETS_AUTH_ID', defaultAuthConfigId: AUTH_CONFIGS.SHEETS,
    enabled: false, stage: 'live', actions: ['read_rows', 'append_row', 'update_row'],
    isNative: false, authMode: 'managed', category: 'Productivity',
  },
  discord: {
    id: 'discord', name: 'Discord', composioAppName: 'discord', composioAppNames: ['discord'],
    authConfigEnv: 'COMPOSIO_DISCORD_AUTH_ID', defaultAuthConfigId: AUTH_CONFIGS.DISCORD,
    enabled: false, stage: 'live', actions: ['send_message'],
    isNative: false, authMode: 'managed', category: 'Communication',
  },
  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp',
    composioAppName: 'whatsapp',
    composioAppNames: ['whatsapp', 'whatsapp_business'],
    authConfigEnv: 'COMPOSIO_WHATSAPP_AUTH_CONFIG_ID',
    defaultAuthConfigId: AUTH_CONFIGS.WHATSAPP,
    enabled: false,
    stage: 'beta',
    actions: ['send_message', 'send_template'],
    isNative: false,
    category: 'Communication',
    authMode: 'managed',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    composioAppName: 'facebook',
    composioAppNames: ['facebook'],
    authConfigEnv: 'COMPOSIO_FACEBOOK_AUTH_CONFIG_ID',
    defaultAuthConfigId: AUTH_CONFIGS.FACEBOOK,
    enabled: false,
    stage: 'beta',
    actions: ['create_post', 'create_page_post', 'publish'],
    isNative: false,
    category: 'Social Media',
    authMode: 'managed',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    composioAppName: 'instagram',
    composioAppNames: ['instagram'],
    authConfigEnv: 'COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID',
    defaultAuthConfigId: AUTH_CONFIGS.INSTAGRAM,
    enabled: false,
    stage: 'beta',
    actions: ['create_media', 'create_post', 'create_media_post', 'publish_post', 'publish_reel', 'publish_story'],
    isNative: false,
    category: 'Social Media',
    authMode: 'managed',
  },
  twitter: {
    id: 'twitter',
    name: 'X (Twitter)',
    composioAppName: 'twitter',
    composioAppNames: ['twitter'],
    authConfigEnv: 'COMPOSIO_TWITTER_AUTH_CONFIG_ID',
    defaultAuthConfigId: AUTH_CONFIGS.TWITTER,
    enabled: false,
    stage: 'live',
    actions: ['create_post', 'create_tweet', 'create_thread', 'create_media_tweet'],
    isNative: false,
    category: 'Social Media',
    // The AlphaTekx Twitter Auth Config stores its client credentials inside
    // Composio. Nothing from the X developer app belongs on Render.
    authMode: 'custom',
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
    authMode: 'managed',
    defaultAuthConfigId: AUTH_CONFIGS.YOUTUBE,
  },
}

const AUTH_CONFIG_ALIASES = {
  gmail: ['COMPOSIO_GMAIL_AUTH_CONFIG_ID'],
  github: ['COMPOSIO_GITHUB_AUTH_CONFIG_ID'],
  googledocs: ['COMPOSIO_GOOGLE_DOCS_AUTH_CONFIG_ID'],
  googlesheets: ['COMPOSIO_GOOGLESHEETS_AUTH_CONFIG_ID', 'COMPOSIO_GOOGLE_SHEETS_AUTH_CONFIG_ID'],
  discord: ['COMPOSIO_DISCORD_AUTH_CONFIG_ID'],
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
  google_docs: 'googledocs',
  google_sheets: 'googlesheets',
  'x (twitter)': 'twitter',
  linkedin: 'linkedin', // native, not composio
  gmail: 'gmail', // Composio managed auth
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
  'gmail.send_email': process.env.COMPOSIO_GMAIL_SEND_EMAIL_TOOL || 'GMAIL_SEND_EMAIL',
  'gmail.list_messages': process.env.COMPOSIO_GMAIL_LIST_MESSAGES_TOOL || 'GMAIL_FETCH_EMAILS',
  'github.list_repositories': process.env.COMPOSIO_GITHUB_LIST_REPOSITORIES_TOOL || 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER',
  'github.get_file': process.env.COMPOSIO_GITHUB_GET_FILE_TOOL || 'GITHUB_GET_REPOSITORY_CONTENT',
  'github.create_issue': process.env.COMPOSIO_GITHUB_CREATE_ISSUE_TOOL || 'GITHUB_CREATE_AN_ISSUE',
  'googledocs.create_document': process.env.COMPOSIO_GOOGLEDOCS_CREATE_DOCUMENT_TOOL || 'GOOGLEDOCS_CREATE_DOCUMENT',
  'googledocs.get_document': process.env.COMPOSIO_GOOGLEDOCS_GET_DOCUMENT_TOOL || 'GOOGLEDOCS_GET_DOCUMENT',
  'googledocs.update_document': process.env.COMPOSIO_GOOGLEDOCS_UPDATE_DOCUMENT_TOOL || 'GOOGLEDOCS_BATCH_UPDATE_DOCUMENT',
  'googlesheets.read_rows': process.env.COMPOSIO_SHEETS_READ_ROWS_TOOL || 'GOOGLESHEETS_BATCH_GET',
  'googlesheets.append_row': process.env.COMPOSIO_SHEETS_APPEND_ROW_TOOL || 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND',
  'googlesheets.update_row': process.env.COMPOSIO_SHEETS_UPDATE_ROW_TOOL || 'GOOGLESHEETS_SPREADSHEETS_VALUES_UPDATE',
  'discord.send_message': process.env.COMPOSIO_DISCORD_SEND_MESSAGE_TOOL || 'DISCORD_SEND_MESSAGE',
  'whatsapp.send_message': process.env.COMPOSIO_WHATSAPP_SEND_MESSAGE_TOOL || 'WHATSAPP_SEND_MESSAGE',
  'whatsapp.send_template': process.env.COMPOSIO_WHATSAPP_SEND_TEMPLATE_TOOL || 'WHATSAPP_SEND_TEMPLATE_MESSAGE',
  'facebook.create_post': process.env.COMPOSIO_FACEBOOK_CREATE_POST_TOOL || 'FACEBOOK_CREATE_POST',
  'facebook.create_page_post': process.env.COMPOSIO_FACEBOOK_CREATE_PAGE_POST_TOOL || 'FACEBOOK_CREATE_POST',
  'facebook.publish': process.env.COMPOSIO_FACEBOOK_PUBLISH_TOOL || 'FACEBOOK_CREATE_POST',
  'facebook.create_photo_post': process.env.COMPOSIO_FACEBOOK_CREATE_PHOTO_POST_TOOL || 'FACEBOOK_CREATE_PHOTO_POST',
  'facebook.list_managed_pages': process.env.COMPOSIO_FACEBOOK_LIST_MANAGED_PAGES_TOOL || 'FACEBOOK_LIST_MANAGED_PAGES',
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
  'twitter.upload_media': process.env.COMPOSIO_TWITTER_UPLOAD_MEDIA_TOOL || 'TWITTER_UPLOAD_MEDIA',
  'youtube.upload_video': process.env.COMPOSIO_YOUTUBE_UPLOAD_VIDEO_TOOL || 'YOUTUBE_UPLOAD_VIDEO',
  'youtube.create_short': process.env.COMPOSIO_YOUTUBE_CREATE_SHORT_TOOL || 'YOUTUBE_UPLOAD_VIDEO',
  'youtube.update_video': process.env.COMPOSIO_YOUTUBE_UPDATE_VIDEO_TOOL || 'YOUTUBE_UPDATE_VIDEO',
  'youtube.update_description': process.env.COMPOSIO_YOUTUBE_UPDATE_DESCRIPTION_TOOL || 'YOUTUBE_UPDATE_VIDEO',
}

const TOOLKIT_VERSIONS = {
  github: '',
  googledocs: '',
  googlesheets: '',
  discord: '',
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
      const authConfigId = configuredEnv ? String(process.env[configuredEnv]).trim() : String(def.defaultAuthConfigId || '').trim()
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

async function validateProviderConfig(providerId) {
  const def = PROVIDER_DEFS[providerId]
  const configured = await resolveProviderConfig(providerId)
  if (!def || !composioClient || !configured?.authConfigId) return configured

  try {
    const exact = await composioClient.authConfigs.get(configured.authConfigId)
    const exactToolkit = String(exact?.toolkit?.slug || '').toLowerCase()
    const validToolkit = !exactToolkit || (def.composioAppNames || [def.composioAppName]).includes(exactToolkit)
    const enabled = String(exact?.status || 'ENABLED').toUpperCase() === 'ENABLED'
    const managedMatches = def.authMode !== 'managed' || exact?.isComposioManaged !== false
    if (validToolkit && enabled && managedMatches) return configured
  } catch {
    // The deployed API key may belong to a different Composio project. Discover
    // the matching managed config in that project before rejecting the request.
  }

  for (const toolkit of def.composioAppNames || [def.composioAppName]) {
    try {
      const response = await composioClient.authConfigs.list({
        toolkit,
        showDisabled: false,
        limit: 100,
        ...(def.authMode === 'managed' ? { isComposioManaged: true } : {}),
      })
      const replacement = (response?.items || []).find(item =>
        String(item?.status || '').toUpperCase() === 'ENABLED' &&
        (def.authMode !== 'managed' || item?.isComposioManaged !== false)
      )
      if (replacement?.id) {
        const discovered = {
          authConfigId: replacement.id,
          enabled: true,
          configuredEnv: null,
          discoveredFromComposio: true,
          toolkit,
        }
        providerConfigs[providerId] = discovered
        return discovered
      }
    } catch {
      // Continue to the next compatible toolkit slug.
    }
  }

  throw new Error(`${def.name} has no enabled ${def.composioAppName} Auth Config in the Composio project connected to AlphaTekx. Enable the existing Auth Config in that Composio project and retry.`)
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
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    if (response.status === 400 || response.status === 404) {
      try { return await persistExecutionFallback(record) }
      catch (error) {
        if (String(record.approval_id || '').startsWith('campaign:') && /\(40[04]\)/.test(error instanceof Error ? error.message : String(error))) {
          campaignHistoryCompatibility.add(compatibilityKey(record.user_id, record.idempotency_key))
          console.warn('[AlphaTekX] connector history tables unavailable; using the campaign durable execution lock')
          return true
        }
        throw error
      }
    }
    console.error('[AlphaTekX] connector_executions insert failed', response.status, detail)
    throw new Error(`Execution history could not be saved (${response.status})`)
  }
  return true
}

function fallbackExecutionId(userId, idempotencyKey) {
  return `connector:${createHash('sha256').update(`${userId}:${idempotencyKey}`).digest('hex')}`
}

async function findExecutionFallback(userId, idempotencyKey) {
  const config = persistenceConfig()
  if (!config) return null
  const id = fallbackExecutionId(userId, idempotencyKey)
  const response = await fetch(`${config.url}/rest/v1/agent_executions?id=eq.${encodeURIComponent(id)}&select=data&limit=1`, {
    headers: supabaseServiceHeaders(config.service),
  })
  if (!response.ok) {
    console.error('[AlphaTekX] fallback execution history read failed', response.status, await response.text().catch(() => ''))
    throw new Error(`Durable execution history could not be read (${response.status})`)
  }
  return (await response.json())?.[0]?.data || null
}

async function persistExecutionFallback(record) {
  const config = persistenceConfig()
  if (!config) return true
  const id = fallbackExecutionId(record.user_id, record.idempotency_key)
  const response = await fetch(`${config.url}/rest/v1/agent_executions`, {
    method: 'POST',
    headers: supabaseServiceHeaders(config.service, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ id, agent_id: String(record.idempotency_key).split(':')[0] || id, data: record }),
  })
  if (response.status === 409) return false
  if (!response.ok) {
    console.error('[AlphaTekX] fallback execution claim failed', response.status, await response.text().catch(() => ''))
    throw new Error(`Durable execution claim could not be saved (${response.status})`)
  }
  return true
}

async function finishExecutionFallback(userId, idempotencyKey, changes) {
  const config = persistenceConfig()
  if (!config) return
  const previous = await findExecutionFallback(userId, idempotencyKey)
  if (!previous) throw new Error('Durable execution claim disappeared before completion')
  const id = fallbackExecutionId(userId, idempotencyKey)
  const response = await fetch(`${config.url}/rest/v1/agent_executions?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: supabaseServiceHeaders(config.service, { Prefer: 'return=minimal' }),
    body: JSON.stringify({
      data: {
        ...previous,
        ...changes,
        completed_at: Object.prototype.hasOwnProperty.call(changes, 'completed_at') ? changes.completed_at : new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }),
  })
  if (!response.ok) throw new Error(`Durable execution result could not be saved (${response.status})`)
}

async function finishExecution(userId, idempotencyKey, changes) {
  if (campaignHistoryCompatibility.has(compatibilityKey(userId, idempotencyKey))) return
  const config = persistenceConfig()
  if (!config) return
  const response = await fetch(`${config.url}/rest/v1/connector_executions?user_id=eq.${encodeURIComponent(userId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}`, {
    method: 'PATCH',
    headers: supabaseServiceHeaders(config.service, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ ...changes, completed_at: new Date().toISOString() }),
  })
  if (!response.ok) {
    if (response.status === 400 || response.status === 404) return finishExecutionFallback(userId, idempotencyKey, changes)
    throw new Error(`Execution result could not be saved (${response.status})`)
  }
}

async function reclaimFailedExecution(userId, idempotencyKey, approvalId) {
  const config = persistenceConfig()
  if (!config) return true
  const response = await fetch(`${config.url}/rest/v1/connector_executions?user_id=eq.${encodeURIComponent(userId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&status=eq.failed`, {
    method: 'PATCH',
    headers: supabaseServiceHeaders(config.service, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      status: 'claimed',
      approval_id: approvalId,
      error_code: null,
      completed_at: null,
      provider_execution_id: null,
      result_metadata: { retriedAt: new Date().toISOString() },
      credits_charged: 0,
    }),
  })
  if (!response.ok) {
    if (response.status === 400 || response.status === 404) {
      const previous = await findExecutionFallback(userId, idempotencyKey)
      if (previous?.status !== 'failed') return false
      await finishExecutionFallback(userId, idempotencyKey, {
        status: 'claimed', approval_id: approvalId, error_code: null, completed_at: null,
        provider_execution_id: null, result_metadata: { retriedAt: new Date().toISOString() }, credits_charged: 0,
      })
      return true
    }
    throw new Error(`Failed publication could not be reclaimed safely (${response.status})`)
  }
  const rows = await response.json().catch(() => [])
  return Array.isArray(rows) && rows.length === 1
}

async function findExecution(userId, idempotencyKey, allowCampaignCompatibility = false) {
  if (campaignHistoryCompatibility.has(compatibilityKey(userId, idempotencyKey))) return { status: 'claimed' }
  const config = persistenceConfig()
  if (!config) return null
  const response = await fetch(`${config.url}/rest/v1/connector_executions?user_id=eq.${encodeURIComponent(userId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=*&limit=1`, {
    headers: supabaseServiceHeaders(config.service),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    if (response.status === 400 || response.status === 404) {
      try { return await findExecutionFallback(userId, idempotencyKey) }
      catch (error) {
        if (allowCampaignCompatibility && /\(404\)/.test(error instanceof Error ? error.message : String(error))) return null
        throw error
      }
    }
    console.error('[AlphaTekX] connector_executions read failed', response.status, detail)
    throw new Error(`Execution history could not be read (${response.status})`)
  }
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

export function confirmedProviderId(value, depth = 0) {
  if (!value || depth > 5) return ''
  // A bare "success" string, log id, or status value is not proof that the
  // social network created content. Only accept identifiers under known
  // provider response fields.
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'string') {
    const candidate = value.trim()
    return /^(?:\d{5,}|\d+_\d+|urn:[a-z0-9:_-]+)$/i.test(candidate) ? candidate : ''
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = confirmedProviderId(item, depth + 1)
      if (found) return found
    }
    return ''
  }
  const preferred = ['provider_id', 'post_id', 'tweet_id', 'video_id', 'media_id', 'message_id', 'creation_id', 'id']
  for (const key of preferred) {
    if (value[key] != null && ['string', 'number'].includes(typeof value[key])) return String(value[key])
  }
  for (const nested of ['data', 'response', 'result', 'post', 'tweet', 'video', 'media', 'message']) {
    const found = confirmedProviderId(value[nested], depth + 1)
    if (found) return found
  }
  return ''
}

export function confirmedPublishedContentId(providerId, value, depth = 0) {
  if (!value || depth > 6) return ''
  const provider = resolveProviderAlias(providerId) || String(providerId || '').toLowerCase()
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = confirmedPublishedContentId(provider, item, depth + 1)
      if (found) return found
    }
    return ''
  }
  if (typeof value !== 'object') return ''

  const keys = provider === 'twitter'
    ? ['tweet_id', 'post_id', 'id']
    : provider === 'facebook'
      ? ['post_id', 'id']
      : provider === 'instagram'
        ? ['media_id', 'post_id', 'id']
        : ['post_id', 'message_id', 'video_id', 'id']
  for (const key of keys) {
    const candidate = value[key]
    if (candidate != null && ['string', 'number'].includes(typeof candidate)) {
      const normalized = String(candidate).trim()
      if (normalized && !/^success$/i.test(normalized)) return normalized
    }
  }
  for (const nested of ['data', 'response', 'result', 'post', 'tweet', 'video', 'media', 'message']) {
    const found = confirmedPublishedContentId(provider, value[nested], depth + 1)
    if (found) return found
  }
  return ''
}

function findFacebookPage(value, preferredId = '', depth = 0) {
  if (!value || depth > 6) return null
  if (Array.isArray(value)) {
    const pages = value.map(item => findFacebookPage(item, preferredId, depth + 1)).filter(Boolean)
    return pages.find(page => preferredId && page.id === preferredId) || pages[0] || null
  }
  if (typeof value !== 'object') return null
  const id = String(value.page_id || value.pageId || value.id || '').trim()
  const looksLikePage = id && (value.name || value.page_name || value.access_token || value.tasks || value.category)
  if (looksLikePage && (!preferredId || id === preferredId)) return { id, name: String(value.name || value.page_name || '') }
  for (const nested of ['data', 'pages', 'items', 'response', 'result']) {
    const found = findFacebookPage(value[nested], preferredId, depth + 1)
    if (found) return found
  }
  return null
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
    const config = init.ok ? await validateProviderConfig(pid).catch(error => ({
      enabled: false,
      authConfigId: null,
      error: sanitizeError(error),
    })) : (providerConfigs[pid] || { enabled: false })
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
      authMode: def.authMode || 'managed',
      connectionCount: connected ? 1 : 0,
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

  const config = await validateProviderConfig(pid)
  if (!config || !config.enabled || !config.authConfigId) {
    throw new Error(`${def.name} is not configured. ${config?.error || 'Contact support.'}`)
  }

  if (!user || !user.id) throw new Error('Authentication required')

  const uid = composioUserId(user.id, user.email)
  const activeAccounts = await listUserAccounts(user, config, ['ACTIVE']).catch(() => ({ items: [] }))
  if (activeAccounts.items?.length) {
    const existing = activeAccounts.items[0]
    const completedUrl = new URL(callbackUrl || '/connected-apps', 'https://alphatekx.name.ng')
    completedUrl.searchParams.set('connected', pid === 'twitter' ? 'x' : pid)
    completedUrl.searchParams.set('provider', pid === 'twitter' ? 'x' : pid)
    return {
      authUrl: completedUrl.toString(),
      provider: pid,
      connectionId: existing.id,
      alreadyConnected: true,
    }
  }

  // Use the current Composio SDK's connectedAccounts.link() for OAuth
  let connectionRequest
  try {
    connectionRequest = await composioClient.connectedAccounts.link(
      uid,
      config.authConfigId,
      {
        callbackUrl: callbackUrl || undefined,
        allowMultiple: false,
      }
    )
  } catch (error) {
    const cause = error?.cause
    const causeMessage = String(cause?.message || '')
    const status = Number(cause?.status || error?.statusCode || 0)
    console.error('[AlphaTekX] Composio link failed', {
      provider: pid,
      status: status || undefined,
      code: error?.code || undefined,
      reason: sanitizeError(causeMessage || error),
    })
    if (status === 401 || status === 403) {
      throw new Error('AlphaTekx cannot access this Composio Auth Config. Update COMPOSIO_API_KEY on Render from the same Composio project, then redeploy.')
    }
    if (status === 404 || /not found|does not exist/i.test(causeMessage)) {
      throw new Error(`${def.name} Managed Auth Config is not available to the deployed Composio project.`)
    }
    if (/callback/i.test(causeMessage)) {
      throw new Error(`${def.name} rejected the post-connection callback URL. Confirm https://alphatekx.name.ng is allowed in Composio.`)
    }
    throw new Error(causeMessage && !/api[-_]?key|secret|token/i.test(causeMessage)
      ? `${def.name} connection could not start: ${causeMessage.slice(0, 160)}`
      : `${def.name} connection could not start. Confirm the Render Composio API key and Managed Auth Config belong to the same project.`)
  }

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
  const config = await validateProviderConfig(pid)

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
  const config = await validateProviderConfig(pid)

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

  const config = await validateProviderConfig(pid).catch(() => null)
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
export async function executeProviderAction(user, providerId, actionId, payload, executionPolicy = {}) {
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

  const config = await validateProviderConfig(pid)
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
  // Only trusted server-side callers can defer settlement. Keeping this outside
  // the request payload prevents clients from bypassing connector credit checks.
  const deferCreditSettlement = executionPolicy?.deferCreditSettlement === true
  if (!approvalId) throw new Error('Explicit approval is required')
  if (!idempotencyKey) throw new Error('Idempotency key is required')
  const campaignExecution = approvalId.startsWith('campaign:')
  const previous = await findExecution(user.id, idempotencyKey, campaignExecution)
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
    if (deferCreditSettlement) {
      return {
        success: true,
        executionId: previous.id,
        providerId: previous.provider_execution_id,
        creditsCharged: 0,
        balance: await getCreditBalance(user.id),
        result: previous.result_metadata || { replayed: true, billingDeferred: true },
        executionTimeMs: 0,
        replayed: true,
      }
    }
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
  if (previous?.status === 'claimed') throw new Error('This approved action is already in progress')
  if (previous && previous.status !== 'failed') throw new Error(`This publication cannot be retried from state "${previous.status}"`)
  if (!deferCreditSettlement && await getCreditBalance(user.id) < 1) throw new Error('Insufficient credits')
  const actionArguments = { ...(payload || {}) }
  delete actionArguments.approvalId
  delete actionArguments.idempotencyKey
  const claimed = previous?.status === 'failed'
    ? await reclaimFailedExecution(user.id, idempotencyKey, approvalId)
    : await persistExecution({
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
        const executeTool = (slug, args) => Promise.race([
          composioClient.tools.execute(slug, {
            connectedAccountId: account.id,
            userId: uid,
            version,
            arguments: args,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Provider request timed out')), 30_000)),
        ])
        if (pid === 'instagram' && actionId === 'publish_post') {
          const createSlug = ACTION_TOOL_MAP['instagram.create_media']
          const createResult = await executeTool(createSlug, actionArguments)
          if (createResult?.successful !== true || createResult?.data == null) throw new Error(createResult?.error || 'Instagram did not create a media container')
          const creationId = confirmedProviderId(createResult.data)
          if (!creationId) throw new Error('Instagram did not return a media container ID')
          result = await executeTool(toolSlug, {
            creation_id: creationId,
            ...(actionArguments.ig_user_id ? { ig_user_id: actionArguments.ig_user_id } : {}),
          })
        } else if (pid === 'facebook' && actionId === 'create_page_post') {
          let pageId = String(actionArguments.page_id || actionArguments.pageId || '').trim()
          let pageName = ''
          if (!pageId) {
            const pagesResult = await executeTool(ACTION_TOOL_MAP['facebook.list_managed_pages'], {})
            if (pagesResult?.successful !== true || pagesResult?.data == null) throw new Error(pagesResult?.error || 'Facebook did not return any managed Pages')
            const page = findFacebookPage(pagesResult.data)
            if (!page?.id) throw new Error('No managed Facebook Page was found for this connection')
            pageId = page.id
            pageName = page.name
          }
          if (actionArguments.image_url) {
            result = await executeTool(ACTION_TOOL_MAP['facebook.create_photo_post'], {
              page_id: pageId, url: actionArguments.image_url, message: actionArguments.message, published: true,
            })
          } else {
            result = await executeTool(toolSlug, { page_id: pageId, message: actionArguments.message, published: true })
          }
          if (result?.data && typeof result.data === 'object') result.data = { ...result.data, page_id: pageId, page_name: pageName }
        } else if (pid === 'twitter' && actionArguments.image_url) {
          const imageUrl = String(actionArguments.image_url).trim()
          const uploadedFile = await composioClient.files.upload({
            file: imageUrl,
            toolSlug: ACTION_TOOL_MAP['twitter.upload_media'],
            toolkitSlug: 'twitter',
          })
          if (!uploadedFile?.s3key || !String(uploadedFile?.mimetype || '').startsWith('image/')) {
            throw new Error('X media upload did not receive a verified image file')
          }
          const uploadResult = await executeTool(ACTION_TOOL_MAP['twitter.upload_media'], {
            media: uploadedFile,
            media_type: uploadedFile.mimetype,
            media_category: 'tweet_image',
          })
          if (uploadResult?.successful !== true || uploadResult?.data == null) {
            throw new Error(uploadResult?.error || 'X did not upload the post image')
          }
          const mediaId = confirmedProviderId(uploadResult.data)
          if (!mediaId) throw new Error('X did not return a confirmed media ID')
          // Composio's current TWITTER_CREATE_TWEET schema uses the flattened
          // `media_media_ids` field. The old double-underscore name was silently
          // ignored, so X never received the uploaded image attachment.
          const tweetArguments = { ...actionArguments, media_media_ids: [String(mediaId)] }
          delete tweetArguments.image_url
          result = await executeTool(toolSlug, tweetArguments)
          if (result?.data && typeof result.data === 'object') result.data = { ...result.data, media_id: mediaId }
        } else {
          result = await executeTool(toolSlug, actionArguments)
        }
        retryCount = attempt
        break
      } catch (error) {
        lastProviderError = error
        const providerMessage = String(error?.message || error)
        if (/connection.*not found|connected account|not connected|unauthorized|forbidden|permission|invalid.*argument|validation|bad request|\b40[0134]\b/i.test(providerMessage)) throw error
        if (attempt === retryDelays.length - 1) throw error
      }
    }
    if (!result && lastProviderError) throw lastProviderError
  } catch (error) {
    const providerMessage = String(error?.message || error)
    const errorCode = /429|rate.?limit/i.test(providerMessage)
      ? 'provider_rate_limit'
      : /timed out|timeout/i.test(providerMessage)
        ? 'provider_timeout'
        : /network|fetch|ECONN|socket/i.test(providerMessage)
          ? 'provider_network'
          : 'provider_error'
    await finishExecution(user.id, idempotencyKey, {
      status: 'failed',
      error_code: errorCode,
      result_metadata: { error: providerMessage.slice(0, 1500), failedAt: new Date().toISOString() },
    })
    if (/connection.*not found|connected account|not connected|unauthorized/i.test(String(error?.message || error))) {
      const reconnect = new Error(`Please reconnect ${def.name} in AlphaTekx Connected Apps`)
      reconnect.code = 'RECONNECT_NEEDED'
      throw reconnect
    }
    const explicit = new Error(`${def.name} publish failed: ${providerMessage}`)
    explicit.code = errorCode.toUpperCase()
    throw explicit
  }

  const executionTimeMs = Date.now() - startTime

  if (!result || result.error) {
    await finishExecution(user.id, idempotencyKey, { status: 'failed', error_code: 'provider_error' })
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

  // Confirm the identifier of the published object, not an upload/container,
  // managed Page, request log, or other intermediate provider resource.
  const confirmedId = confirmedPublishedContentId(pid, responseData)
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
  if (deferCreditSettlement) {
    return {
      success: true,
      executionId: result.logId || `exec_${Date.now()}`,
      providerId: confirmedId,
      creditsCharged: 0,
      balance: await getCreditBalance(user.id),
      result: responseData,
      executionTimeMs,
      retryCount,
      billingDeferred: true,
    }
  }
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

export async function finalizeDeferredExecution(user, idempotencyKey, settlementId) {
  if (!user?.id || !String(idempotencyKey || '').trim()) return false
  const previous = await findExecution(user.id, String(idempotencyKey).trim())
  if (!previous?.provider_execution_id) return false
  if (previous.status === 'succeeded') return true
  if (previous.status !== 'provider_confirmed') return false
  await finishExecution(user.id, String(idempotencyKey).trim(), {
    status: 'succeeded',
    provider_execution_id: previous.provider_execution_id,
    result_metadata: { ...(previous.result_metadata || {}), billingPending: false, unifiedSettlementId: String(settlementId || '') },
    credits_charged: 0,
  })
  return true
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

