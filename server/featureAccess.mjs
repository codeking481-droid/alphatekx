import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { supabaseServiceHeaders } from './supabaseHeaders.mjs'

export const ADMIN_TEST_EMAILS = new Set(['iamdan4live@gmail.com'])
export const FEATURE_STATES = new Set(['disabled', 'beta', 'public', 'maintenance'])

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localFile = path.resolve(root, 'data', 'feature-management.json')
const DEFAULT_FEATURES = [
  ['linkedin', 'LinkedIn', 'public', 'connector'],
  ['whatsapp', 'WhatsApp', 'disabled', 'connector'],
  ['google', 'Google', 'disabled', 'connector'],
  ['gmail', 'Gmail', 'public', 'connector'],
  ['github', 'GitHub', 'public', 'connector'],
  ['googledocs', 'Google Docs', 'public', 'connector'],
  ['googlesheets', 'Google Sheets', 'public', 'connector'],
  ['google_sheets', 'Google Sheets', 'public', 'connector'],
  ['google_calendar', 'Google Calendar', 'disabled', 'connector'],
  ['google_drive', 'Google Drive', 'disabled', 'connector'],
  ['notion', 'Notion', 'beta', 'connector'],
  ['youtube', 'YouTube', 'disabled', 'connector'],
  ['telegram', 'Telegram', 'disabled', 'connector'],
  ['slack', 'Slack', 'beta', 'connector'],
  ['airtable', 'Airtable', 'beta', 'connector'],
  ['shopify', 'Shopify', 'beta', 'connector'],
  ['discord', 'Discord', 'public', 'connector'],
  ['company_builder', 'Company Builder', 'disabled', 'product'],
  ['image_generator', 'AI Image Generator', 'disabled', 'product'],
  ['video_generator', 'AI Video Generator', 'disabled', 'product'],
].map(([id, name, state, category]) => ({ id, name, state, category, stop_existing: true, updated_at: new Date(0).toISOString(), updated_by: 'system' }))

const PLATFORM_ALIASES = Object.freeze({ sheets: 'googlesheets', google_sheets: 'googlesheets', google_docs: 'googledocs', calendar: 'google_calendar', drive: 'google_drive' })
const DEFAULT_FEATURE_MAP = new Map(DEFAULT_FEATURES.map(feature => [feature.id, feature]))
let featureCache = new Map(DEFAULT_FEATURES.map(feature => [feature.id, feature]))
let betaUsers = new Set()
let auditCache = []
let loadedAt = 0
let storageMode = 'defaults'
let lastStorageError = ''

function readLocal() {
  try {
    const parsed = JSON.parse(fs.readFileSync(localFile, 'utf8'))
    return {
      features: Array.isArray(parsed.features) ? parsed.features : DEFAULT_FEATURES,
      betaUsers: Array.isArray(parsed.betaUsers) ? parsed.betaUsers : [],
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
    }
  } catch { return { features: DEFAULT_FEATURES, betaUsers: [], audit: [] } }
}

function writeLocal() {
  try {
    fs.mkdirSync(path.dirname(localFile), { recursive: true })
    fs.writeFileSync(localFile, JSON.stringify({ features: [...featureCache.values()], betaUsers: [...betaUsers], audit: auditCache }, null, 2), 'utf8')
  } catch {}
}

function serviceHeaders(config, extra = {}) {
  return supabaseServiceHeaders(config.service, extra)
}

export function normalizeFeatureId(value) {
  const id = String(value || '').trim().toLowerCase()
  return PLATFORM_ALIASES[id] || id
}

export async function refreshFeatureConfig(config, force = false) {
  if (!force && Date.now() - loadedAt < 2_000) return
  loadedAt = Date.now()
  if (config?.url && config?.service) {
    try {
      const [featuresResponse, betaResponse, auditResponse] = await Promise.all([
        fetch(`${config.url}/rest/v1/features?select=*&order=name.asc`, { headers: serviceHeaders(config) }),
        fetch(`${config.url}/rest/v1/feature_beta_users?select=email`, { headers: serviceHeaders(config) }),
        fetch(`${config.url}/rest/v1/feature_audit_log?select=*&order=changed_at.desc&limit=100`, { headers: serviceHeaders(config) }),
      ])
      if (featuresResponse.ok) {
        const records = await featuresResponse.json()
        if (Array.isArray(records) && records.length) featureCache = new Map(records.map(record => [record.id, record]))
        betaUsers = new Set(betaResponse.ok ? (await betaResponse.json()).map(record => String(record.email).toLowerCase()) : [])
        auditCache = auditResponse.ok ? await auditResponse.json() : []
        storageMode = 'database'
        lastStorageError = ''
        return
      }
      lastStorageError = `Feature database returned HTTP ${featuresResponse.status}`
    } catch (error) { lastStorageError = error instanceof Error ? error.message : String(error) }
  }
  const local = readLocal()
  featureCache = new Map(local.features.map(feature => [feature.id, feature]))
  betaUsers = new Set(local.betaUsers.map(email => String(email).toLowerCase()))
  auditCache = local.audit
  storageMode = 'local_fallback'
}

export function isAdminTestUser(user, trustedIdentity = true) {
  return Boolean(trustedIdentity && ADMIN_TEST_EMAILS.has(String(user?.email || '').trim().toLowerCase()))
}

export function connectorFeatureAccess(user, connector, trustedIdentity = true) {
  const id = normalizeFeatureId(connector)
  const feature = featureCache.get(id) || DEFAULT_FEATURE_MAP.get(id) || { id, name: id, state: 'disabled', stop_existing: true }
  const defaultFeature = DEFAULT_FEATURE_MAP.get(id)
  const state = defaultFeature?.state === 'public' ? 'public' : feature.state
  const email = String(user?.email || '').trim().toLowerCase()
  const admin = isAdminTestUser(user, trustedIdentity)
  const beta = trustedIdentity && betaUsers.has(email)
  const enabled = state === 'public' || (state === 'beta' && (admin || beta))
  return {
    id,
    name: feature.name || id,
    state,
    category: feature.category || 'connector',
    stopExisting: feature.stop_existing !== false,
    publicEnabled: state === 'public',
    admin,
    beta,
    enabled,
    availability: state === 'public' ? 'available' : state === 'maintenance' ? 'maintenance' : state === 'beta' && (admin || beta) ? 'testing' : 'coming_soon',
  }
}

export function unavailableConnectorMessage(connector) {
  const id = normalizeFeatureId(connector)
  const feature = featureCache.get(id) || DEFAULT_FEATURE_MAP.get(id) || { name: id, state: 'disabled' }
  if (feature.state === 'maintenance') return `${feature.name} is temporarily under maintenance.`
  return `${feature.name} integration is coming soon. LinkedIn is available now.`
}

export function connectorsInPrompt(prompt) {
  const text = String(prompt || '').toLowerCase()
  const matches = []
  const patterns = [
    ['facebook', /\bfacebook\b/], ['instagram', /\binstagram\b/], ['whatsapp', /\bwhats\s*app\b|\bwhatsapp\b/], ['youtube', /\byoutube\b/],
    ['x', /\btwitter\b|\bpost\s+(?:on|to)\s+x\b|\bx\s+(?:post|automation|account)\b/], ['linkedin', /\blinked\s*in\b|\blinkedin\b/],
    ['telegram', /\btelegram\b/], ['slack', /\bslack\b/], ['discord', /\bdiscord\b/], ['gmail', /\bgmail\b/],
    ['google_drive', /\bgoogle\s+drive\b/], ['google_calendar', /\bgoogle\s+calendar\b/], ['google_sheets', /\bgoogle\s+sheets?\b/],
    ['company_builder', /\bcompany\s+builder\b/], ['image_generator', /\bimage\s+generat(?:or|ion)\b/], ['video_generator', /\bvideo\s+generat(?:or|ion)\b/],
  ]
  for (const [id, pattern] of patterns) if (pattern.test(text)) matches.push(id)
  return matches
}

export function unavailablePromptConnector(user, prompt, trustedIdentity = true) {
  return connectorsInPrompt(prompt).find(id => !connectorFeatureAccess(user, id, trustedIdentity).enabled) || null
}

export function featureStatusForUser(user, trustedIdentity = true) {
  const connectors = {}
  const featureIds = new Set([...DEFAULT_FEATURE_MAP.keys(), ...featureCache.keys()])
  for (const featureId of featureIds) connectors[featureId] = connectorFeatureAccess(user, featureId, trustedIdentity)
  return {
    admin: isAdminTestUser(user, trustedIdentity),
    beta: betaUsers.has(String(user?.email || '').toLowerCase()),
    connectors,
    revision: Math.max(0, ...[...featureCache.values()].map(feature => Date.parse(feature.updated_at || '') || 0)),
  }
}

export function featureManagementSnapshot() {
  return {
    features: [...featureCache.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    betaUsers: [...betaUsers].sort(),
    audit: auditCache,
    storage: { mode: storageMode, error: lastStorageError || null },
    revision: Math.max(0, ...[...featureCache.values()].map(feature => Date.parse(feature.updated_at || '') || 0)),
  }
}

export async function updateFeature(config, id, changes, actor) {
  throw new Error('Feature management is disabled for launch. Released tools are controlled by code.')
}

export async function updateFeatureDisabled(config, id, changes, actor) {
  const featureId = normalizeFeatureId(id)
  const previous = featureCache.get(featureId)
  if (!previous) throw new Error('Feature not found')
  const state = String(changes.state || previous.state)
  if (!FEATURE_STATES.has(state)) throw new Error('Invalid feature state')
  const updated = { ...previous, state, stop_existing: changes.stopExisting !== false, updated_at: new Date().toISOString(), updated_by: actor.email }
  const audit = { id: crypto.randomUUID(), feature_id: featureId, old_state: previous.state, new_state: state, stop_existing: updated.stop_existing, changed_at: updated.updated_at, changed_by: actor.email }
  let persisted = false
  let persistenceWarning = ''
  if (config?.url && config?.service) {
    try {
      const featureResponse = await fetch(`${config.url}/rest/v1/features?on_conflict=id`, {
        method: 'POST',
        headers: serviceHeaders(config, { Prefer: 'resolution=merge-duplicates,return=representation' }),
        body: JSON.stringify(updated),
      })
      const saved = await featureResponse.json().catch(() => [])
      if (!featureResponse.ok || !Array.isArray(saved) || saved[0]?.state !== state) {
        throw new Error(saved?.message || `Feature database verification failed (${featureResponse.status})`)
      }
      persisted = true
      storageMode = 'database'
      const auditResponse = await fetch(`${config.url}/rest/v1/feature_audit_log`, { method: 'POST', headers: serviceHeaders(config), body: JSON.stringify(audit) })
      if (!auditResponse.ok) persistenceWarning = (await auditResponse.json().catch(() => ({}))).message || 'Feature changed, but the audit entry could not be stored.'
    } catch (error) {
      persistenceWarning = error instanceof Error ? error.message : String(error)
      storageMode = 'local_fallback'
      lastStorageError = persistenceWarning
    }
  }
  featureCache.set(featureId, updated)
  auditCache = [audit, ...auditCache].slice(0, 100)
  writeLocal()
  loadedAt = Date.now()
  return { feature: updated, persisted, warning: persistenceWarning || null, revision: Date.parse(updated.updated_at) }
}

export async function setBetaUser(config, email, enabled, actor) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Valid beta tester email required')
  if (config?.url && config?.service) {
    const url = `${config.url}/rest/v1/feature_beta_users?email=eq.${encodeURIComponent(normalized)}`
    const response = enabled
      ? await fetch(`${config.url}/rest/v1/feature_beta_users`, { method: 'POST', headers: serviceHeaders(config, { Prefer: 'resolution=merge-duplicates' }), body: JSON.stringify({ email: normalized, added_by: actor.email }) })
      : await fetch(url, { method: 'DELETE', headers: serviceHeaders(config) })
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Beta tester update failed')
  }
  if (enabled) betaUsers.add(normalized)
  else betaUsers.delete(normalized)
  writeLocal()
  loadedAt = Date.now()
  return [...betaUsers].sort()
}
