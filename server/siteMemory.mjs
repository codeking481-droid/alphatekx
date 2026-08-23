/**
 * ALPHATEKX SITE MEMORY — per-hostname restoration history.
 *
 * The agent reads this before a restoration ("this site's last score was 62,
 * the recurring offender is dead-image assets") and writes after it. Any
 * failure degrades to no-memory mode; the pipeline never breaks because of
 * memory.
 *
 * Storage: Supabase table `restoration_memory` when credentials exist, with an
 * ALWAYS-ON local JSON mirror (data/site-memory.json) so memory works on any
 * deployment — including fresh installs with zero cloud config.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCAL_FILE = path.resolve(__dirname, '..', 'data', 'site-memory.json')
const TABLE = 'restoration_memory'
const HISTORY_LIMIT = 10

let client = null

function getClient() {
  if (client) return client
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const key = String(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !key) return null
  client = createClient(url.replace(/\/$/, ''), key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}

// ─── Local JSON store (always-on mirror / primary fallback) ──────────────────

function readLocalAll() {
  try {
    const rows = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'))
    return rows && typeof rows === 'object' ? rows : {}
  } catch {
    return {}
  }
}

function writeLocalRow(row) {
  try {
    fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true })
    const all = readLocalAll()
    all[row.hostname] = row
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(all, null, 2), 'utf8')
  } catch (err) {
    console.warn('[SITE-MEMORY] local write failed:', err instanceof Error ? err.message : err)
  }
}

function isSchemaMissing(error) {
  if (!error) return false
  const code = String(error.code || error.error_code || '')
  return code === 'PGRST205' || code === '42P01' || /could not find the table|does not exist/i.test(String(error.message || ''))
}

/**
 * Load what the agent knows about a hostname.
 * @returns {Promise<null|{hostname:string, scans:number, best_score:number, last_score:number, last_run_at:string, history:Array, recurring_issues:string[]}>}
 */
export async function getSiteMemory(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '')
  if (!host) return null

  let row = null
  const db = getClient()
  if (db) {
    try {
      const { data, error } = await db
        .from(TABLE)
        .select('hostname, url, scans, best_score, last_score, last_run_at, history')
        .eq('hostname', host)
        .limit(1)
      if (error && !isSchemaMissing(error)) throw new Error(error.message)
      row = data?.[0] || null
    } catch (err) {
      console.warn('[SITE-MEMORY] remote read failed:', err instanceof Error ? err.message : err)
    }
  }

  // Local mirror wins only when remote has nothing (or is unavailable).
  if (!row) {
    const local = readLocalAll()[host]
    if (local) row = local
  }
  if (!row) return null

  // Recurring offenders: count issue signatures across all recorded runs so
  // the agent can open with "this host keeps breaking images".
  const counts = new Map()
  for (const h of Array.isArray(row.history) ? row.history : []) {
    for (const t of Array.isArray(h?.top_issues) ? h.top_issues : []) {
      const key = String(t || '').trim().slice(0, 60)
      if (key) counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  const recurring_issues = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k)

  return {
    hostname: row.hostname,
    scans: Number(row.scans || 0),
    best_score: Number(row.best_score || 0),
    last_score: Number(row.last_score || 0),
    last_run_at: row.last_run_at || '',
    history: Array.isArray(row.history) ? row.history.slice(-HISTORY_LIMIT) : [],
    recurring_issues,
  }
}

/**
 * Record one completed restoration run (upsert on hostname).
 * @param {{url:string, hostname:string, beforeScore:number, afterScore:number, topIssues:string[]}} run
 */
export async function recordRestoration(run) {
  const host = String(run?.hostname || '').toLowerCase().replace(/^www\./, '')
  if (!host) return { ok: false }
  try {
    const previous = await getSiteMemory(host)
    const entry = {
      at: new Date().toISOString(),
      before: Math.round(Number(run.beforeScore) || 0),
      after: Math.round(Number(run.afterScore) || 0),
      top_issues: (run.topIssues || []).slice(0, 5),
    }
    const history = [...(previous?.history || []), entry].slice(-HISTORY_LIMIT)
    const row = {
      hostname: host,
      url: String(run.url || ''),
      scans: (previous?.scans || 0) + 1,
      best_score: Math.max(previous?.best_score || 0, entry.after),
      last_score: entry.after,
      last_run_at: entry.at,
      history,
    }
    // Local mirror first — memory must survive even with zero cloud config.
    writeLocalRow(row)
    const db = getClient()
    if (db) {
      const { error } = await db.from(TABLE).upsert(row, { onConflict: 'hostname' })
      if (error && !isSchemaMissing(error)) throw new Error(error.message)
    }
    return { ok: true }
  } catch (err) {
    console.warn('[SITE-MEMORY] write failed:', err instanceof Error ? err.message : err)
    return { ok: false }
  }
}
