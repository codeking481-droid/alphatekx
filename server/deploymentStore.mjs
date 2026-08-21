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

function isSchemaMissing(error) {
  if (!error) return false
  const code = String(error.code || error.error_code || '')
  const message = String(error.message || '')
  return code === 'PGRST205' || code === '42P01' || /could not find the table|relation .* does not exist|schema cache/i.test(message)
}

export function schemaMissingMessage(error) {
  return 'The Supabase "deployments" table is missing. Run supabase/deployments-table.sql in the Supabase SQL editor, then redeploy.'
}

function describeError(error) {
  if (!error) return 'Unknown deployment store error'
  return [error.message, error.details, error.hint].filter(Boolean).join(' — ')
}

// ─── Core database functions ─────────────────────────────────────────────────

/** Create or update a deployment (upsert on unique name). HTML is stored as UTF-8 text. */
export async function saveDeployment(name, html, meta = {}) {
  const db = getClient()
  if (!db) return { ok: false, error: 'Deployment store is not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY).' }
  const row = {
    name: String(name).toLowerCase(),
    html: String(html ?? ''),
    title: meta.title != null ? String(meta.title).slice(0, 120) : null,
    owner_id: meta.ownerId != null ? String(meta.ownerId) : null,
    owner_email: meta.ownerEmail != null ? String(meta.ownerEmail) : null,
  }
  if (meta.id && /^[0-9a-f-]{36}$/i.test(String(meta.id))) row.id = String(meta.id)
  if (meta.createdAt) row.created_at = new Date(meta.createdAt).toISOString()

  const { data, error } = await db
    .from(TABLE)
    .upsert(row, { onConflict: 'name' })
    .select('id, name, created_at')
  if (error) {
    return { ok: false, schemaMissing: isSchemaMissing(error), error: describeError(error) }
  }
  return { ok: true, id: data?.[0]?.id || row.id || null, created_at: data?.[0]?.created_at || null }
}

/** Fetch one deployment (full row including HTML), or null. */
export async function getDeployment(name) {
  const db = getClient()
  if (!db) return null
  const { data, error } = await db
    .from(TABLE)
    .select('id, name, title, html, owner_id, owner_email, created_at, updated_at')
    .eq('name', String(name).toLowerCase())
    .limit(1)
  if (error) {
    if (isSchemaMissing(error)) { console.warn('[DEPLOYMENT-STORE]', schemaMissingMessage(error)) ; return null }
    throw new Error(describeError(error))
  }
  const row = data?.[0]
  return row ? normalizeRow(row) : null
}

/** True when the name is taken. */
export async function deploymentExists(name) {
  const db = getClient()
  if (!db) return false
  const { data, error } = await db
    .from(TABLE)
    .select('id')
    .eq('name', String(name).toLowerCase())
    .limit(1)
  if (error) {
    if (isSchemaMissing(error)) return false
    throw new Error(describeError(error))
  }
  return Array.isArray(data) && data.length > 0
}

/** Remove a deployment permanently. Returns true when a row was deleted. */
export async function deleteDeployment(name) {
  const db = getClient()
  if (!db) return { ok: false, deleted: false, error: 'Deployment store is not configured.' }
  const { data, error } = await db
    .from(TABLE)
    .delete()
    .eq('name', String(name).toLowerCase())
    .select('id')
  if (error) {
    return { ok: false, deleted: false, schemaMissing: isSchemaMissing(error), error: describeError(error) }
  }
  return { ok: true, deleted: Array.isArray(data) && data.length > 0 }
}

/** List deployments. metadataOnly strips the heavy html column. */
export async function listDeployments({ limit = 500, metadataOnly = false } = {}) {
  const db = getClient()
  if (!db) return []
  const select = metadataOnly
    ? 'id, name, title, owner_id, owner_email, created_at, updated_at'
    : 'id, name, title, html, owner_id, owner_email, created_at, updated_at'
  let query = db.from(TABLE).select(select).order('updated_at', { ascending: false }).limit(limit)
  const { data, error } = await query
  if (error) {
    if (isSchemaMissing(error)) { console.warn('[DEPLOYMENT-STORE]', schemaMissingMessage(error)); return [] }
    throw new Error(describeError(error))
  }
  return (data || []).map(normalizeRow)
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
    ownerId: row.owner_id || '',
    ownerEmail: row.owner_email || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

/** Quick connectivity/schema probe used at boot and by the migration script. */
export async function checkDeploymentStoreHealth() {
  const db = getClient()
  if (!db) return { configured: false, tableReady: false }
  const { error } = await db.from(TABLE).select('id').limit(1)
  if (error) {
    return { configured: true, tableReady: !isSchemaMissing(error), schemaMissing: isSchemaMissing(error), message: describeError(error) }
  }
  return { configured: true, tableReady: true }
}
