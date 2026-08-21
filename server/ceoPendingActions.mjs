import { randomUUID } from 'node:crypto'
import fs from 'node:fs'

function headers(service, extra = {}) {
  return { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json', ...extra }
}

function localRead(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return [] }
}

function localWrite(file, rows) {
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8')
}

function normalize(row) {
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    type: row.type,
    title: row.title,
    data: row.data || {},
    suggestedAction: row.suggested_action || row.suggestedAction,
    actions: row.actions || [],
    status: row.status,
    sourceKey: row.source_key || row.sourceKey,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    result: row.result || null,
    error: row.error || '',
  }
}

export async function listPendingActions(config, localFile, userId) {
  if (config.url && config.service) {
    const response = await fetch(`${config.url}/rest/v1/ceo_pending_actions?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`, { headers: headers(config.service) })
    if (!response.ok) throw new Error(`CEO Inbox persistence is unavailable (${response.status}). Apply the ceo-pending-actions migration.`)
    return (await response.json()).map(normalize)
  }
  return localRead(localFile).filter(row => row.userId === userId).map(normalize)
}

export async function createPendingAction(config, localFile, input) {
  const now = new Date().toISOString()
  const row = {
    id: randomUUID(),
    user_id: input.userId,
    type: String(input.type || 'suggested_action'),
    title: String(input.title || 'Alpha noticed work that needs approval'),
    data: input.data || {},
    suggested_action: String(input.suggestedAction || ''),
    actions: Array.isArray(input.actions) ? input.actions : [],
    status: 'pending',
    source_key: String(input.sourceKey || randomUUID()),
    created_at: now,
    updated_at: now,
  }
  if (config.url && config.service) {
    const response = await fetch(`${config.url}/rest/v1/ceo_pending_actions?on_conflict=user_id,source_key`, {
      method: 'POST',
      headers: headers(config.service, { Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify(row),
    })
    if (!response.ok) throw new Error(`CEO Inbox persistence failed (${response.status}). Apply the ceo-pending-actions migration.`)
    const saved = await response.json()
    if (saved[0]) return normalize(saved[0])
    const existing = await fetch(`${config.url}/rest/v1/ceo_pending_actions?user_id=eq.${encodeURIComponent(input.userId)}&source_key=eq.${encodeURIComponent(row.source_key)}&limit=1`, { headers: headers(config.service) })
    return normalize((await existing.json())[0])
  }
  const rows = localRead(localFile)
  const existing = rows.find(item => item.userId === input.userId && item.sourceKey === row.source_key)
  if (existing) return normalize(existing)
  const local = normalize(row)
  rows.unshift(local)
  localWrite(localFile, rows.slice(0, 1000))
  return local
}

export async function claimPendingAction(config, localFile, userId, id) {
  const now = new Date().toISOString()
  if (config.url && config.service) {
    const response = await fetch(`${config.url}/rest/v1/ceo_pending_actions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.pending`, {
      method: 'PATCH',
      headers: headers(config.service, { Prefer: 'return=representation' }),
      body: JSON.stringify({ status: 'executing', updated_at: now }),
    })
    if (!response.ok) throw new Error(`CEO action claim failed (${response.status})`)
    const rows = await response.json()
    if (!rows[0]) throw new Error('This CEO action was already handled.')
    return normalize(rows[0])
  }
  const rows = localRead(localFile)
  const index = rows.findIndex(item => item.id === id && item.userId === userId && item.status === 'pending')
  if (index < 0) throw new Error('This CEO action was already handled.')
  rows[index] = { ...rows[index], status: 'executing', updatedAt: now }
  localWrite(localFile, rows)
  return normalize(rows[index])
}

export async function finishPendingAction(config, localFile, userId, id, status, details = {}) {
  const patch = { status, updated_at: new Date().toISOString(), result: details.result || null, error: String(details.error || '') }
  if (config.url && config.service) {
    const response = await fetch(`${config.url}/rest/v1/ceo_pending_actions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: headers(config.service, { Prefer: 'return=representation' }),
      body: JSON.stringify(patch),
    })
    if (!response.ok) throw new Error(`CEO action update failed (${response.status})`)
    return normalize((await response.json())[0])
  }
  const rows = localRead(localFile)
  const index = rows.findIndex(item => item.id === id && item.userId === userId)
  if (index < 0) throw new Error('CEO action not found')
  rows[index] = { ...rows[index], status, updatedAt: patch.updated_at, result: patch.result, error: patch.error }
  localWrite(localFile, rows)
  return normalize(rows[index])
}
