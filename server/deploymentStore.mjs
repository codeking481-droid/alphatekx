/**
 * ALPHATEKX DEPLOYMENT STORE — SUPABASE (PERMANENT)
 *
 * Deployments live in PostgreSQL. Render redeploys can no longer wipe sites.
 *
 * Table: deployments
 *   id          uuid     primary key (default gen_random_uuid())
 *   name        text     unique not null   → https://alphatekx.name.ng/app/{name}
 *   title       text
 *   html        text     not null          → always UTF-8
 *   owner_id    text
 *   owner_email text
 *   created_at  timestamptz default now()
 *   updated_at  timestamptz default now() (auto-maintained by trigger)
 *
 * Schema: run supabase/deployments-table.sql once in the Supabase SQL editor.
 */

import { createClient } from '@supabase/supabase-js'

const TABLE = 'deployments'

let client = null

function getClient() {
  if (client) return client
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const key = String(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !key) return null
  client = createClient(url.replace(/\/$/, ''), key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'User-Agent': 'AlphaTekX-DeploymentStore/1.0' } },
  })
  return client
}

export function isDeploymentStoreConfigured() {
  return Boolean(getClient())
}

// Column-level schema errors (PGRST204) mean the table exists but a column
// referenced by the query is not in the table/cache — e.g. legacy tables that
// predate owner_id / owner_email. These degrade gracefully instead of failing.
function missingColumnFromError(error) {
  const message = String(error?.message || '')
  return error && (String(error.code || error.error_code || '') === 'PGRST204' || /could not find the '[^']+' column/i.test(message))
}

const OPTIONAL_COLUMNS = new Set(['title', 'owner_id', 'owner_email'])

function isSchemaMissing(error) {
  if (!error) return false
  if (missingColumnFromError(error)) return false
  const code = String(error.code || error.error_code || '')
  const message = String(error.message || '')
  return code === 'PGRST205' || code === '42P01' || /could not find the table|relation .* does not exist/i.test(message)
}

export function schemaMissingMessage(error) {
  return 'The Supabase "deployments" table is missing. Run supabase/deployments-table.sql in the Supabase SQL editor, then redeploy.'
}

function describeError(error) {
  if (!error) return 'Unknown deployment store error'
  return [error.message, error.details, error.hint].filter(Boolean).join(' — ')
}

function logStoreError(action, error) {
  const raw = {
    code: error?.code || error?.error_code || null,
    message: error?.message || null,
    details: error?.details || null,
    hint: error?.hint || null,
  }
  console.error(`[DEPLOYMENT-STORE] ${action} failed:`, JSON.stringify(raw))
}

// ─── Schema-cache self-healing ───────────────────────────────────────────────
let lastHealAttempt = 0

/**
 * Ask PostgREST to rebuild its schema cache via the reload_pgrst_schema()
 * SQL function (see supabase/deployments-table.sql). Throttled to one
 * attempt every 15s so bursts of traffic never spam the database.
 */
async function healSchemaCache() {
  const db = getClient()
  if (!db) return false
  if (Date.now() - lastHealAttempt < 15_000) return false
  lastHealAttempt = Date.now()
  try {
    const { error } = await db.rpc('reload_pgrst_schema')
    if (error) {
      console.warn('[DEPLOYMENT-STORE] Auto-heal unavailable:', error.message)
      return false
    }
    console.log('[DEPLOYMENT-STORE] PostgREST schema cache reload requested — retrying...')
    await new Promise(resolve => setTimeout(resolve, 1_200))
    return true
  } catch (err) {
    console.warn('[DEPLOYMENT-STORE] Auto-heal crashed:', err instanceof Error ? err.message : err)
    return false
  }
}

/** Run a store operation; on a schema-missing error, heal + retry once. */
async function withSchemaRetry(operation, label) {
  let result = await operation()
  if (!result?.schemaMissing) return result
  logStoreError(label, result.rawError)
  if (!(await healSchemaCache())) return result
  result = await operation()
  if (result?.schemaMissing) logStoreError(`${label} (after heal)`, result.rawError)
  return result
}

// ─── Core database functions ─────────────────────────────────────────────────

/** Create or update a deployment (upsert on unique name). HTML is stored as UTF-8 text. */
export async function saveDeployment(name, html, meta = {}) {
  const attempt = async () => {
    const db = getClient()
    if (!db) return { ok: false, error: 'Deployment store is not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY).' }

    const buildRow = (requiredOnly) => {
      const row = {
        name: String(name).toLowerCase(),
        html: String(html ?? ''),
      }
      if (!requiredOnly) {
        row.title = meta.title != null ? String(meta.title).slice(0, 120) : null
        row.owner_id = meta.ownerId != null ? String(meta.ownerId) : null
        row.owner_email = meta.ownerEmail != null ? String(meta.ownerEmail) : null
        // Whole-site deployments: { "/": html, "/about": html, ... }
        if (meta.pages && typeof meta.pages === 'object' && !Array.isArray(meta.pages)) {
          const entries = Object.entries(meta.pages)
            .filter(([k, v]) => typeof k === 'string' && k.startsWith('/') && typeof v === 'string')
            .map(([k, v]) => [k, String(v)])
          const total = entries.reduce((a, [, v]) => a + v.length, 0) + String(html ?? '').length
          if (total <= 8_000_000 && entries.length <= 60) row.pages = Object.fromEntries(entries)
        }
      }
      if (meta.id && /^[0-9a-f-]{36}$/i.test(String(meta.id))) row.id = String(meta.id)
      if (meta.createdAt) row.created_at = new Date(meta.createdAt).toISOString()
      return row
    }

    const writeOnce = async (row, useConflict) => {
      if (useConflict) {
        const { data, error } = await db.from(TABLE).upsert(row, { onConflict: 'name' }).select('id, name, created_at')
        if (error) return { ok: false, schemaMissing: isSchemaMissing(error), rawError: error, error: describeError(error), code: error?.code || error?.error_code || null, hint: error?.hint || null }
        return { ok: true, id: data?.[0]?.id || row.id || null, created_at: data?.[0]?.created_at || null }
      }
      // Degraded upsert for tables without the name UNIQUE constraint:
      // remove any existing row with this name, then insert fresh.
      await db.from(TABLE).delete().eq('name', row.name)
      const { data, error } = await db.from(TABLE).insert(row).select('id, name, created_at')
      if (error) return { ok: false, schemaMissing: isSchemaMissing(error), rawError: error, error: describeError(error), code: error?.code || error?.error_code || null, hint: error?.hint || null }
      return { ok: true, id: data?.[0]?.id || row.id || null, created_at: data?.[0]?.created_at || null }
    }

    const isNoConstraintError = (error) => /no unique or exclusion constraint matching the on conflict/i.test(String(error?.message || ''))

    const saveWithFallbacks = async (requiredOnly) => {
      let result = await writeOnce(buildRow(requiredOnly), true)
      if (!result.ok && result.rawError && missingColumnFromError(result.rawError) && !requiredOnly) {
        console.warn('[DEPLOYMENT-STORE] Optional column missing on deployments table — saving required fields only:', describeError(result.rawError))
        requiredOnly = true
        result = await saveWithFallbacks(true)
      }
      if (!result.ok && result.rawError && isNoConstraintError(result.rawError)) {
        console.warn('[DEPLOYMENT-STORE] deployments.name UNIQUE constraint missing — using delete+insert fallback:', describeError(result.rawError))
        result = await writeOnce(buildRow(requiredOnly), false)
      }
      return result
    }

    // Full row first; legacy tables missing optional columns fall back to the
    // required fields (name + html) so deploys never break.
    return saveWithFallbacks(false)
  }
  return withSchemaRetry(attempt, 'save deployment')
}

/** Fetch one deployment (full row including HTML), or null. */
export async function getDeployment(name) {
  const FULL_SELECT = 'id, name, title, html, pages, owner_id, owner_email, created_at, updated_at'
  const CORE_SELECT = 'id, name, html, created_at, updated_at'
  const attempt = async () => {
    const db = getClient()
    if (!db) return { notConfigured: true }
    const query = async (select) => {
      const { data, error } = await db
        .from(TABLE)
        .select(select)
        .eq('name', String(name).toLowerCase())
        .limit(1)
      if (error) return { schemaMissing: isSchemaMissing(error), rawError: error, error: describeError(error) }
      const row = data?.[0]
      return { row: row ? normalizeRow(row) : null }
    }
    let result = await query(FULL_SELECT)
    if (result.rawError && missingColumnFromError(result.rawError)) {
      console.warn('[DEPLOYMENT-STORE] Optional column missing on deployments table — reading core fields only:', describeError(result.rawError))
      result = await query(CORE_SELECT)
    }
    return result
  }
  const result = await withSchemaRetry(attempt, 'read deployment')
  if (result.notConfigured) return null
  if (result.schemaMissing) { console.warn('[DEPLOYMENT-STORE]', schemaMissingMessage(result.rawError)); return null }
  if (result.error) throw new Error(result.error)
  return result.row ?? null
}

/** True when the name is taken. */
export async function deploymentExists(name) {
  const attempt = async () => {
    const db = getClient()
    if (!db) return { notConfigured: true }
    const { data, error } = await db
      .from(TABLE)
      .select('id')
      .eq('name', String(name).toLowerCase())
      .limit(1)
    if (error) return { schemaMissing: isSchemaMissing(error), rawError: error, error: describeError(error) }
    return { exists: Array.isArray(data) && data.length > 0 }
  }
  const result = await withSchemaRetry(attempt, 'check deployment name')
  if (result.notConfigured) return false
  if (result.error) throw new Error(result.error)
  return Boolean(result.exists)
}

/** Remove a deployment permanently. Returns true when a row was deleted. */
export async function deleteDeployment(name) {
  const attempt = async () => {
    const db = getClient()
    if (!db) return { ok: false, deleted: false, error: 'Deployment store is not configured.' }
    const { data, error } = await db
      .from(TABLE)
      .delete()
      .eq('name', String(name).toLowerCase())
      .select('id')
    if (error) {
      return { ok: false, deleted: false, schemaMissing: isSchemaMissing(error), rawError: error, error: describeError(error) }
    }
    return { ok: true, deleted: Array.isArray(data) && data.length > 0 }
  }
  return withSchemaRetry(attempt, 'delete deployment')
}

/** List deployments. metadataOnly strips the heavy html column. */
export async function listDeployments({ limit = 500, metadataOnly = false } = {}) {
  const fullSelect = metadataOnly
    ? 'id, name, title, owner_id, owner_email, created_at, updated_at'
    : 'id, name, title, html, owner_id, owner_email, created_at, updated_at'
  const coreSelect = metadataOnly
    ? 'id, name, created_at, updated_at'
    : 'id, name, html, created_at, updated_at'
  const attempt = async () => {
    const db = getClient()
    if (!db) return { notConfigured: true }
    const query = async (select) => {
      const { data, error } = await db.from(TABLE).select(select).order('updated_at', { ascending: false }).limit(limit)
      if (error) return { schemaMissing: isSchemaMissing(error), rawError: error, error: describeError(error) }
      return { rows: (data || []).map(normalizeRow) }
    }
    let result = await query(fullSelect)
    if (result.rawError && missingColumnFromError(result.rawError)) {
      console.warn('[DEPLOYMENT-STORE] Optional column missing on deployments table — listing core fields only:', describeError(result.rawError))
      result = await query(coreSelect)
    }
    return result
  }
  const result = await withSchemaRetry(attempt, 'list deployments')
  if (result.notConfigured) return []
  if (result.schemaMissing) { console.warn('[DEPLOYMENT-STORE]', schemaMissingMessage(result.rawError)); return [] }
  if (result.error) throw new Error(result.error)
  return result.rows || []
}

// ─── Normalization ───────────────────────────────────────────────────────────

/**
 * Shape consumed by server.mjs routing/ownership logic.
 * `code` mirrors legacy local-deployment field names so serving keeps working.
 */
function normalizeRow(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.name,
    title: row.title || row.name,
    html: row.html || '',
    code: row.html || '',
    pages: row.pages && typeof row.pages === 'object' ? row.pages : null,
    ownerId: row.owner_id || '',
    ownerEmail: row.owner_email || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

/** Quick connectivity/schema probe used at boot and by the migration script. */
export async function checkDeploymentStoreHealth() {
  const db = getClient()
  if (!db) return { configured: false, connected: false, tableReady: false }
  const { error } = await db.from(TABLE).select('id').limit(1)
  if (error) {
    const schemaMissing = isSchemaMissing(error)
    const message = describeError(error)
    // A schema-missing response means PostgREST answered — the connection itself works.
    if (schemaMissing) return { configured: true, connected: true, tableReady: false, schemaMissing, message }
    return { configured: true, connected: false, tableReady: false, schemaMissing: false, message }
  }
  return { configured: true, connected: true, tableReady: true, schemaMissing: false }
}

function deploymentStoreEnv() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const keyName = process.env.SUPABASE_SERVICE_KEY ? 'SUPABASE_SERVICE_KEY'
    : process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY'
    : null
  return { url, keyName }
}

/**
 * Startup health check with loud, unambiguous logging so Render logs show
 * exactly what is wrong: connection vs configuration vs missing table.
 */
export async function runSupabaseStartupCheck() {
  console.log('[SUPABASE] Running startup connection health check...')
  const { url, keyName } = deploymentStoreEnv()
  if (!url || !keyName) {
    console.error('❌ Supabase connection failed: environment variables missing.')
    console.error(`   SUPABASE_URL/VITE_SUPABASE_URL: ${url ? 'set (' + safeUrlHost(url) + ')' : 'MISSING'}`)
    console.error(`   SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY: ${keyName ? 'set (' + keyName + ')' : 'MISSING'}`)
    console.error('   Fix: add both vars in Render → Environment, then redeploy.')
    return
  }

  const health = await checkDeploymentStoreHealth()
  let finalHealth = health
  if (health.connected && !health.tableReady) {
    // Table reported missing — try reloading the PostgREST schema cache once.
    if (await healSchemaCache()) finalHealth = await checkDeploymentStoreHealth()
  }

  if (finalHealth.connected) {
    console.log(`✅ Supabase connected successfully (${safeUrlHost(url)})`)
  } else {
    console.error('❌ Supabase connection failed:', finalHealth.message)
    console.error('   Check SUPABASE_URL and SUPABASE_SERVICE_KEY point at the SAME project.')
    return
  }

  if (finalHealth.tableReady) {
    console.log("✅ Table 'deployments' found")
  } else {
    console.error("❌ Table 'deployments' not found")
    console.error('   ', schemaMissingMessage(finalHealth))
    console.error(`   Note: you ran the SQL, but this project (${safeUrlHost(url)}) cannot see it.`)
    console.error('   Fix 1: confirm you ran supabase/deployments-table.sql in THIS project\'s SQL editor.')
    console.error('   Fix 2: run supabase/fix-schema-cache.sql in the SQL editor to enable auto-healing.')
  }
}

function safeUrlHost(url) {
  try { return new URL(url).host } catch { return 'invalid-url' }
}

/**
 * Full diagnostics for /api/supabase-status — shows exactly which Supabase
 * project the app is talking to and whether it can see the deployments table.
 * Never returns secrets (only the project host).
 */
export async function getDeploymentStoreStatus() {
  const { url, keyName } = deploymentStoreEnv()
  const status = {
    configured: Boolean(url && keyName),
    supabaseHost: url ? safeUrlHost(url) : null,
    serviceKeyVar: keyName,
    connected: false,
    tableReady: false,
    rowCount: null,
    error: null,
    checkedAt: new Date().toISOString(),
  }
  const health = await checkDeploymentStoreHealth()
  status.connected = health.connected
  status.tableReady = health.tableReady
  if (!health.connected || !health.tableReady) status.error = health.message || null
  if (health.tableReady) {
    const db = getClient()
    const { count, error } = await db.from(TABLE).select('id', { count: 'exact', head: true })
    if (!error) status.rowCount = count
  }
  return status
}
