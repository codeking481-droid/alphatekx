/**
 * RESTORE QUOTAS — the advertised pricing, enforced for real.
 *
 *   Free Trial  $0     1 site · 1 scan · 1 fix
 *   Lite        $9     1 site · 5 scans · 5 fixes
 *   Starter     $19    3 sites · 15 scans · 15 fixes
 *   Pro         $49    10 sites · unlimited scans & fixes
 *   Business    $99    25 sites · unlimited · priority queue
 *   Enterprise  $199   unlimited everything
 *
 * Counters persist per identity per UTC month. Primary store is the
 * plan_usage table in Supabase (durable across deploys, race-safe via
 * consume_plan_quota RPC); if Supabase is not configured or unreachable,
 * falls back to data/user-restore-quotas.json so local dev keeps working.
 *
 * Identity is `u:<userId>` for signed-in users or `ip:<hash>` for
 * anonymous visitors (they get the free trial).
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { supabaseServiceHeaders as serviceHeaders } from './supabaseHeaders.mjs'

export const PLAN_LIMITS = {
  free: { label: 'Free Trial', price: 0, sites: 1, scans: 1, fixes: 1 },
  lite_9: { label: 'Starter', price: 9, sites: 1, scans: 5, fixes: 5 },
  video_19: { label: 'Lite', price: 19, sites: 3, scans: 15, fixes: 15 },
  video_49: { label: 'Pro', price: 49, sites: 10, scans: Infinity, fixes: Infinity },
  video_99: { label: 'Business', price: 99, sites: 25, scans: Infinity, fixes: Infinity, priority: true },
  enterprise_199: { label: 'Enterprise', price: 199, sites: Infinity, scans: Infinity, fixes: Infinity, priority: true },
  // Admins bypass every gate; model as unlimited so limitsFor('admin') never clamps to free.
  admin: { label: 'Admin', price: 0, sites: Infinity, scans: Infinity, fixes: Infinity, priority: true },
}

const STORE = path.resolve(process.cwd(), 'data', 'user-restore-quotas.json')
const LIMITLESS = -1

// ---- Supabase resolution (same env vars billing.mjs uses) ----

function supabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''
  return url && service ? { url: url.replace(/\/+$/, ''), service } : null
}

function monthKey() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function rpc(name, body) {
  const cfg = supabaseEnv()
  if (!cfg) return null
  try {
    const res = await fetch(`${cfg.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: serviceHeaders(cfg.service),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ---- Local JSON fallback (legacy shape preserved) ----

function readStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE, 'utf8'))
    if (raw && typeof raw === 'object') return raw
  } catch {}
  return {}
}

function writeStore(store) {
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true })
    fs.writeFileSync(STORE, JSON.stringify(store, null, 2))
  } catch {}
}

function entryFor(identity) {
  const store = readStore()
  const month = monthKey()
  let entry = store[identity]
  if (!entry || entry.month !== month) {
    entry = { month, fixesUsed: 0, scansUsed: 0, sites: {} }
    store[identity] = entry
    writeStore(store)
  }
  return { entry, store }
}

// ---- Public identity helpers ----

export function ipIdentity(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  return `ip:${createHash('sha256').update(ip).digest('hex').slice(0, 16)}`
}

export function userIdentity(userId) {
  return `u:${String(userId || '').slice(0, 40)}`
}

export function limitsFor(planId) {
  const key = String(planId || 'free').toLowerCase()
  return PLAN_LIMITS[key] || PLAN_LIMITS.free
}

function serialize(limits, used, period) {
  return {
    plan: limits.label,
    planId: used.planId,
    period,
    sitesLimit: Number.isFinite(limits.sites) ? limits.sites : null,
    sitesUsed: used.sitesUsed,
    sites: used.sites || {},
    scansLimit: Number.isFinite(limits.scans) ? limits.scans : null,
    scansUsed: used.scansUsed,
    fixesLimit: Number.isFinite(limits.fixes) ? limits.fixes : null,
    fixesUsed: used.fixesUsed,
  }
}

/** Current counters for an identity this month (async: DB first, file fallback). */
export async function quotaStatus({ identity, planId = 'free' }) {
  const limits = limitsFor(planId)
  const period = monthKey()
  const remote = await rpc('get_plan_quota', { p_identity: identity, p_period: period })
  if (remote?.ok) {
    return {
      ...serialize(limits, {
        planId: String(planId || 'free').toLowerCase(),
        sitesUsed: remote.sites_used || 0,
        sites: remote.sites || {},
        scansUsed: remote.scans_used || 0,
        fixesUsed: remote.fixes_used || 0,
      }, period),
      store: 'supabase',
    }
  }
  const { entry } = entryFor(identity)
  return serialize(limits, {
    planId: String(planId || 'free').toLowerCase(),
    sitesUsed: Object.keys(entry.sites || {}).length,
    sites: entry.sites || {},
    scansUsed: entry.scansUsed || 0,
    fixesUsed: entry.fixesUsed || 0,
  }, entry.month)
}

/**
 * Pre-flight check. kind: 'fix' (default — also enforces site caps for new
 * hostnames) or 'scan'. Returns { ok:false, reason, code, status } on breach.
 */
export async function checkQuota({ identity, planId = 'free', hostname, kind = 'fix' }) {
  const limits = limitsFor(planId)
  const status = await quotaStatus({ identity, planId })

  if (kind === 'scan') {
    if (Number.isFinite(limits.scans) && status.scansUsed >= limits.scans) {
      return {
        ok: false,
        reason:
          `You've used all ${limits.scans} scan${limits.scans === 1 ? '' : 's'} included in the ${limits.label} plan this month. ` +
          `Upgrade to keep scanning — every plan's full feature list is on the Billing page.`,
        code: 'QUOTA_SCANS_EXHAUSTED',
        status,
      }
    }
    return { ok: true, status }
  }

  if (Number.isFinite(limits.fixes) && status.fixesUsed >= limits.fixes) {
    return {
      ok: false,
      reason:
        `You've used all ${limits.fixes} fix${limits.fixes === 1 ? '' : 'es'} included in the ${limits.label} plan this month. ` +
        `Upgrade to keep restoring — Pro ($49/mo) unlocks 10 sites with unlimited fixes.`,
      code: 'QUOTA_FIXES_EXHAUSTED',
      status,
    }
  }
  if (hostname && Number.isFinite(limits.sites) && status.sitesUsed >= limits.sites && !status.sites?.[hostname]) {
    return {
      ok: false,
      reason:
        `The ${limits.label} plan covers ${limits.sites} site${limits.sites === 1 ? '' : 's'} per month (${status.sitesUsed} already used). ` +
        `Upgrade to add more sites — every plan's full feature list is on the Billing page.`,
      code: 'QUOTA_SITES_EXHAUSTED',
      status,
    }
  }
  return { ok: true, status }
}

/** Consume one unit of `kind` for this identity. */
export async function consumeQuota({ identity, planId = 'free', hostname, kind = 'fix' }) {
  const limits = limitsFor(planId)
  const period = monthKey()
  const result = await rpc('consume_plan_quota', {
    p_identity: identity,
    p_period: period,
    p_kind: kind,
    p_hostname: kind === 'fix' ? hostname || null : null,
    p_fixes_limit: Number.isFinite(limits.fixes) ? limits.fixes : LIMITLESS,
    p_scans_limit: Number.isFinite(limits.scans) ? limits.scans : LIMITLESS,
    p_sites_limit: Number.isFinite(limits.sites) ? limits.sites : LIMITLESS,
  })
  if (result) return result

  // Local fallback mirrors the old behaviour (+scans).
  const { entry, store } = entryFor(identity)
  if (kind === 'scan') entry.scansUsed = (entry.scansUsed || 0) + 1
  else {
    entry.fixesUsed = (entry.fixesUsed || 0) + 1
    if (hostname) entry.sites[hostname] = true
  }
  writeStore(store)
  return { ok: true, fallback: true }
}
