// Alpha Connector Service — Provider-neutral abstraction over Composio
//
// Architecture:
// - AlphaTekx owns the entire UX. Users NEVER see "Powered by Composio".
// - Users NEVER log into Composio or see Composio branding.
// - COMPOSIO_API_KEY stays server-side only — NEVER sent to frontend.
// - References stored in alpha_connected_apps table (no OAuth tokens).
// - Building this as an abstraction so Composio can be replaced later
//   without changing Alpha's planner.

import { Composio } from '@composio/core'

let composioClient = null

function getComposioClient() {
  if (composioClient) return composioClient
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) return null
  composioClient = new Composio({
    apiKey,
    baseUrl: process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev/api'
  })
  return composioClient
}

function composioConfig() {
  return {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
  }
}

function serviceHeaders(serviceKey) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
}

// ─── Provider Mapping ──────────────────────────────────────────────────
// Maps our provider IDs to Composio's internal app names

const PROVIDER_TO_COMPOSIO_APP = {
  facebook: 'facebook',
  instagram: 'instagram',
  twitter: 'twitter',
  youtube: 'youtube',
  whatsapp: 'whatsapp_business',
  linkedin: 'linkedin',
  notion: 'notion',
}

const COMPOSIO_APP_TO_PROVIDER = {}
for (const [k, v] of Object.entries(PROVIDER_TO_COMPOSIO_APP)) {
  COMPOSIO_APP_TO_PROVIDER[v] = k
}

// ─── Internal Helpers ──────────────────────────────────────────────────

function log(...args) {
  console.log(`[AlphaConnector]`, ...args)
}

function logError(...args) {
  console.error(`[AlphaConnector]`, ...args)
}

async function querySupabase(path, options = {}) {
  const config = composioConfig()
  if (!config.url || !config.service) return null
  try {
    const res = await fetch(`${config.url}/rest/v1/${path}`, {
      headers: serviceHeaders(config.service),
      ...options,
    })
    if (!res.ok) {
      const text = await res.text()
      logError(`Supabase query failed: ${res.status} ${text}`)
      return null
    }
    if (res.status === 204 || res.headers.get('content-length') === '0') return null
    return await res.json()
  } catch (err) {
    logError('Supabase query error:', err.message)
    return null
  }
}

async function upsertConnectedApp(userId, provider, data) {
  const config = composioConfig()
  if (!config.url || !config.service) return false
  try {
    const existing = await querySupabase(
      `alpha_connected_apps?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}&select=id`,
      { method: 'GET' }
    )
    const record = {
      user_id: userId,
      provider,
      connection_id: data.connectionId || '',
      status: data.status || 'active',
      provider_app_id: data.providerAppId || null,
      metadata: data.metadata || {},
      connected_at: data.connectedAt || new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (Array.isArray(existing) && existing.length > 0) {
      const res = await fetch(
        `${config.url}/rest/v1/alpha_connected_apps?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`,
        {
          method: 'PATCH',
          headers: serviceHeaders(config.service),
          body: JSON.stringify(record),
        }
      )
      return res.ok
    } else {
      const res = await fetch(
        `${config.url}/rest/v1/alpha_connected_apps`,
        {
          method: 'POST',
          headers: { ...serviceHeaders(config.service), Prefer: 'return=minimal' },
          body: JSON.stringify(record),
        }
      )
      return res.ok
    }
  } catch (err) {
    logError('upsertConnectedApp error:', err.message)
    return false
  }
}

async function deleteConnectedApp(userId, provider) {
  const config = composioConfig()
  if (!config.url || !config.service) return false
  try {
    const res = await fetch(
      `${config.url}/rest/v1/alpha_connected_apps?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`,
      { method: 'DELETE', headers: serviceHeaders(config.service) }
    )
    return res.ok
  } catch (err) {
    logError('deleteConnectedApp error:', err.message)
    return false
  }
}

async function getConnectedApp(userId, provider) {
  const rows = await querySupabase(
    `alpha_connected_apps?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}&select=*`
  )
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

async function listConnectedApps(userId) {
  return await querySupabase(
    `alpha_connected_apps?user_id=eq.${encodeURIComponent(userId)}&select=*`
  ) || []
}

async function logExecution(userId, provider, action, status, requestParams, responseData, errorMessage, executionTimeMs) {
  const config = composioConfig()
  if (!config.url || !config.service) return
  try {
    await fetch(`${config.url}/rest/v1/alpha_connector_executions`, {
      method: 'POST',
      headers: { ...serviceHeaders(config.service), Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        provider,
        action,
        status,
        request_params: requestParams || {},
        response_data: responseData || null,
        error_message: errorMessage || null,
        execution_time_ms: executionTimeMs || 0,
        performed_at: new Date().toISOString(),
      }),
    })
  } catch (err) {
    logError('logExecution error:', err.message)
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Check if Composio is configured
 */
export function isComposioConfigured() {
  return Boolean(process.env.COMPOSIO_API_KEY)
}

/**
 * List all available apps that Composio supports
 * Returns array of { id, name, description, authScheme }
 */
export async function listAvailableApps() {
  const client = getComposioClient()
  if (!client) throw new Error('COMPOSIO_API_KEY not configured')
  
  try {
    const apps = await client.apps.list()
    return (apps || []).map(app => ({
      id: app.appId || app.name,
      name: app.name,
      description: app.description || '',
      authScheme: app.authScheme || 'oauth2',
    }))
  } catch (err) {
    logError('listAvailableApps error:', err.message)
    // Fallback: return our configured providers
    return Object.keys(PROVIDER_TO_COMPOSIO_APP).map(id => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      description: `${id} integration`,
      authScheme: 'oauth2',
    }))
  }
}

/**
 * Start OAuth connection for a provider.
 * Returns { authUrl, connectionId } — the frontend redirects to authUrl.
 */
export async function connectApp(userId, provider, redirectUri) {
  if (!userId) throw new Error('User ID is required')
  if (!provider) throw new Error('Provider is required')
  
  const client = getComposioClient()
  if (!client) throw new Error('COMPOSIO_API_KEY not configured')

  const appName = PROVIDER_TO_COMPOSIO_APP[provider]
  if (!appName) throw new Error(`Provider '${provider}' is not supported`)

  // Use the Composio integration/link flow
  try {
    const integration = await client.integrations.create({
      appId: appName,
      authScheme: 'OAUTH2',
      useComposioAuth: false, // we use our own OAuth creds
    })

    const connection = await client.connectedAccounts.link({
      integrationId: integration.id,
      userId: userId,
      redirectUri: redirectUri || `${process.env.PUBLIC_APP_URL || 'https://alphatekx.name.ng'}/api/oauth/callback/composio`,
    })

    const connectionId = connection.connectionId || connection.id || integration.id
    
    // Save reference to our database
    await upsertConnectedApp(userId, provider, {
      connectionId,
      status: 'pending',
      connectedAt: new Date().toISOString(),
    })

    log(`Connection initiated for user ${userId}, provider ${provider}, connectionId: ${connectionId}`)

    return {
      authUrl: connection.redirectUrl || connection.link,
      connectionId,
      provider,
    }
  } catch (err) {
    logError(`connectApp(${provider}) error:`, err.message)
    throw new Error(`Could not connect ${provider}: ${err.message}`)
  }
}

/**
 * Get connection status for a provider
 */
export async function getConnectionStatus(userId, provider) {
  if (!userId) return { connected: false, status: 'unknown' }
  
  // First check our database
  const record = await getConnectedApp(userId, provider)
  if (!record) return { connected: false, status: 'not_connected' }

  // If we have a connection, verify with Composio
  if (record.connection_id) {
    try {
      const client = getComposioClient()
      if (client) {
        const status = await client.connectedAccounts.get(record.connection_id)
        const composioStatus = String(status?.status || 'ACTIVE').toUpperCase()
        
        const isActive = ['ACTIVE', 'CONNECTED'].includes(composioStatus)
        const newStatus = isActive ? 'active' : composioStatus.toLowerCase()

        // Update our local status if changed
        if (newStatus !== record.status) {
          await upsertConnectedApp(userId, provider, {
            connectionId: record.connection_id,
            status: newStatus,
            metadata: record.metadata,
            connectedAt: record.connected_at,
          })
        }

        return {
          connected: isActive,
          status: newStatus,
          connectionId: record.connection_id,
          connectedAt: record.connected_at,
          lastSyncedAt: record.last_synced_at,
          metadata: record.metadata,
        }
      }
    } catch (err) {
      logError(`getConnectionStatus(${provider}) composio error:`, err.message)
      // Return based on what we have in DB
      return {
        connected: record.status === 'active',
        status: record.status,
        connectionId: record.connection_id,
        connectedAt: record.connected_at,
        lastSyncedAt: record.last_synced_at,
      }
    }
  }

  return {
    connected: false,
    status: record.status || 'unknown',
  }
}

/**
 * Get all connected apps for a user with their status
 */
export async function getAllConnectionStatuses(userId) {
  if (!userId) {
    // Return all providers as disconnected
    return Object.keys(PROVIDER_TO_COMPOSIO_APP).map(provider => ({
      provider,
      connected: false,
      status: 'not_connected',
    }))
  }

  const records = await listConnectedApps(userId)
  const recordMap = {}
  for (const r of records || []) {
    recordMap[r.provider] = r
  }

  // Check each provider's status
  const results = []
  for (const provider of Object.keys(PROVIDER_TO_COMPOSIO_APP)) {
    const record = recordMap[provider]
    if (record && record.connection_id) {
      try {
        const client = getComposioClient()
        if (client) {
          const status = await client.connectedAccounts.get(record.connection_id)
          const isActive = String(status?.status || '').toUpperCase() === 'ACTIVE'
          results.push({
            provider,
            connected: isActive,
            status: isActive ? 'active' : 'inactive',
            connectionId: record.connection_id,
            connectedAt: record.connected_at,
            lastSyncedAt: record.last_synced_at,
          })
          continue
        }
      } catch (err) {
        // fall through
      }
      results.push({
        provider,
        connected: record.status === 'active',
        status: record.status,
        connectionId: record.connection_id,
        connectedAt: record.connected_at,
        lastSyncedAt: record.last_synced_at,
      })
    } else {
      results.push({
        provider,
        connected: false,
        status: 'not_connected',
      })
    }
  }

  return results
}

/**
 * Disconnect a provider
 */
export async function disconnect(userId, provider) {
  if (!userId) throw new Error('User ID is required')
  if (!provider) throw new Error('Provider is required')

  const record = await getConnectedApp(userId, provider)
  
  if (record?.connection_id) {
    try {
      const client = getComposioClient()
      if (client) {
        await client.connectedAccounts.delete(record.connection_id)
        log(`Disconnected Composio connection ${record.connection_id} for ${provider}`)
      }
    } catch (err) {
      logError(`disconnect(${provider}) composio error:`, err.message)
      // Continue with local cleanup even if Composio fails
    }
  }

  await deleteConnectedApp(userId, provider)
  log(`Disconnected ${provider} for user ${userId}`)

  return { success: true }
}

/**
 * Execute an action on a connected provider
 */
export async function executeAction(userId, provider, action, payload = {}) {
  if (!userId) throw new Error('User ID is required')
  if (!provider) throw new Error('Provider is required')
  if (!action) throw new Error('Action is required')

  // Check connection first
  const status = await getConnectionStatus(userId, provider)
  if (!status.connected) {
    throw new Error(`${provider} is not connected. Connect it first.`)
  }

  const client = getComposioClient()
  if (!client) throw new Error('COMPOSIO_API_KEY not configured')

  const appName = PROVIDER_TO_COMPOSIO_APP[provider]
  if (!appName) throw new Error(`Provider '${provider}' is not supported`)

  const startTime = Date.now()

  try {
    log(`Executing ${provider}.${action} for user ${userId}`)

    // Execute via Composio tools
    const result = await client.tools.execute({
      appName,
      actionName: action,
      connectedAccountId: status.connectionId,
      input: payload,
      // Don't show Composio branding
      entityId: userId,
    })

    const executionTime = Date.now() - startTime

    await logExecution(userId, provider, action, 'success', payload, result, null, executionTime)
    log(`${provider}.${action} succeeded in ${executionTime}ms`)

    return {
      success: true,
      result,
      executionTimeMs: executionTime,
    }
  } catch (err) {
    const executionTime = Date.now() - startTime
    const errorMsg = err.message || 'Unknown error'

    await logExecution(userId, provider, action, 'error', payload, null, errorMsg, executionTime)
    logError(`${provider}.${action} failed: ${errorMsg}`)

    throw new Error(`${provider} ${action} failed: ${errorMsg}`)
  }
}

/**
 * Handle OAuth callback from Composio
 */
export async function handleOAuthCallback(userId, provider, connectionId) {
  if (!userId || !provider || !connectionId) {
    throw new Error('Missing OAuth callback parameters')
  }

  try {
    // Verify the connection with Composio
    const client = getComposioClient()
    let status = 'active'
    let metadata = {}

    if (client) {
      try {
        const connection = await client.connectedAccounts.get(connectionId)
        status = String(connection?.status || 'ACTIVE').toUpperCase() === 'ACTIVE' ? 'active' : 'inactive'
        metadata = connection?.metadata || {}
      } catch (err) {
        logError(`handleOAuthCallback verify error:`, err.message)
      }
    }

    // Update or create the record
    await upsertConnectedApp(userId, provider, {
      connectionId,
      status,
      metadata,
      connectedAt: new Date().toISOString(),
    })

    log(`OAuth callback processed for ${provider}, user ${userId}, connection ${connectionId}`)

    return { success: true, provider, status }
  } catch (err) {
    logError(`handleOAuthCallback error:`, err.message)
    throw err
  }
}

/**
 * Get execution history for a user/provider
 */
export async function getExecutions(userId, provider = null, limit = 20) {
  let path = `alpha_connector_executions?user_id=eq.${encodeURIComponent(userId)}&order=performed_at.desc&limit=${limit}`
  if (provider) {
    path = `alpha_connector_executions?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}&order=performed_at.desc&limit=${limit}`
  }

  const rows = await querySupabase(path)
  return Array.isArray(rows) ? rows : []
}

// ─── Notion PoC Helpers ────────────────────────────────────────────────

/**
 * Notion: Create a page (Proof of Concept)
 */
export async function notionCreatePage(userId, title, content = '', databaseId = null) {
  const payload = {
    title,
    content: content || `Created by AlphaTekX at ${new Date().toISOString()}`,
  }
  if (databaseId) payload.parentDatabaseId = databaseId
  
  return executeAction(userId, 'notion', 'create_page', payload)
}

// ─── Temporarily disable Composio (for local dev without key) ──────────

export function getAvailableProviders() {
  return Object.keys(PROVIDER_TO_COMPOSIO_APP).map(id => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    composioAppName: PROVIDER_TO_COMPOSIO_APP[id],
  }))
}
