/**
 * ALPHATEKX SITE MEMORY — per-hostname restoration history in Supabase.
 *
 * The agent reads this before a restoration ("this site's last score was 62,
 * the recurring offender is dead-image assets") and writes after it. Any
 * failure degrades to no-memory mode; the pipeline never breaks because of
 * memory.
 *
 * Table: restoration_memory (see supabase/restoration-memory.sql)
 */

import { createClient } from '@supabase/supabase-js'

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

function isSchemaMissing(error) {
  if (!error) return false
  const code = String(error.code || error.error_code || '')
  return code === 'PGRST205' || code === '42P01' || /could not find the table|does not exist/i.test(String(error.message || ''))
}

/**
 * Load what the agent knows about a hostname.
 * @returns {Promise<null|{hostname:string, scans:number, best_score:number, last_score:number, last_run_at:string, history:Array}>}
 */
export async function getSiteMemory(hostname) {
  const db = getClient()
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '')
  if (!db || !host) return null
  try {
    const { data, error } = await db
      .from(TABLE)
      .select('hostname, url, scans, best_score, last_score, last_run_at, history')
      .eq('hostname', host)
      .limit(1)
    if (error) {
      if (isSchemaMissing(error)) return null
      throw new Error(error.message)
    }
    const row = data?.[0]
    if (!row) return null
    return {
      hostname: row.hostname,
      scans: Number(row.scans || 0),
      best_score: Number(row.best_score || 0),
      last_score: Number(row.last_score || 0),
      last_run_at: row.last_run_at || '',
      history: Array.isArray(row.history) ? row.history.slice(-HISTORY_LIMIT) : [],
    }
  } catch (err) {
    console.warn('[SITE-MEMORY] read failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Record one completed restoration run (upsert on hostname).
 * @param {{url:string, hostname:string, beforeScore:number, afterScore:number, topIssues:string[]}} run
 */
export async function recordRestoration(run) {
  const db = getClient()
  const host = String(run?.hostname || '').toLowerCase().replace(/^www\./, '')
  if (!db || !host) return { ok: false }
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
    const { error } = await db.from(TABLE).upsert(row, { onConflict: 'hostname' })
    if (error && !isSchemaMissing(error)) throw new Error(error.message)
    return { ok: !error }
  } catch (err) {
    console.warn('[SITE-MEMORY] write failed:', err instanceof Error ? err.message : err)
    return { ok: false }
  }
}
