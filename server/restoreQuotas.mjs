/**
 * RESTORE QUOTAS — the advertised pricing, enforced for real.
 *
 *   Free trial      1 site  · 1 fix
 *   Lite     $9     1 site  · 5 fixes
 *   Starter  $19    3 sites · 15 fixes
 *   Pro      $49    10 sites · unlimited fixes
 *   Business $99    25 sites · unlimited fixes · priority queue
 *   Enterprise $199 unlimited sites & fixes
 *
 * Counters persist per identity per calendar month at
 * data/user-restore-quotas.json. Identity is `u:<userId>` for signed-in
 * users or `ip:<hash>` for anonymous visitors (they get the free trial).
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const PLAN_LIMITS = {
  free: { label: 'Free Trial', price: 0, sites: 1, fixes: 1 },
  lite_9: { label: 'Lite', price: 9, sites: 1, fixes: 5 },
  video_19: { label: 'Starter', price: 19, sites: 3, fixes: 15 },
  video_49: { label: 'Pro', price: 49, sites: 10, fixes: Infinity },
  video_99: { label: 'Business', price: 99, sites: 25, fixes: Infinity, priority: true },
  enterprise_199: { label: 'Enterprise', price: 199, sites: Infinity, fixes: Infinity, priority: true },
}

const STORE = path.resolve(process.cwd(), 'data', 'user-restore-quotas.json')

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

function monthKey() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function ipIdentity(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  return `ip:${createHash('sha256').update(ip).digest('hex').slice(0, 16)}`
}

export function userIdentity(userId) {
  return `u:${String(userId || '').slice(0, 40)}`
}

function entryFor(identity) {
  const store = readStore()
  const month = monthKey()
  let entry = store[identity]
  if (!entry || entry.month !== month) {
    entry = { month, fixesUsed: 0, sites: {} }
    store[identity] = entry
    writeStore(store)
  }
  return { entry, store }
}

export function limitsFor(planId) {
  const key = String(planId || 'free').toLowerCase()
  return PLAN_LIMITS[key] || PLAN_LIMITS.free
}

export function quotaStatus({ identity, planId = 'free' }) {
  const limits = limitsFor(planId)
  const { entry } = entryFor(identity)
  const sitesUsed = Object.keys(entry.sites || {}).length
  return {
    plan: limits.label,
    planId: String(planId || 'free').toLowerCase(),
    sitesLimit: Number.isFinite(limits.sites) ? limits.sites : null,
    sitesUsed,
    fixesLimit: Number.isFinite(limits.fixes) ? limits.fixes : null,
    fixesUsed: entry.fixesUsed || 0,
    month: entry.month,
  }
}

export function checkQuota({ identity, planId = 'free', hostname }) {
  const limits = limitsFor(planId)
  const status = quotaStatus({ identity, planId })
  const newSite = hostname && !entryFor(identity).entry.sites[hostname]

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
  if (Number.isFinite(limits.sites) && newSite && status.sitesUsed >= limits.sites) {
    return {
      ok: false,
      reason:
        `The ${limits.label} plan covers ${limits.sites} site${limits.sites === 1 ? '' : 's'} per month (${status.sitesUsed} already used). ` +
        `Upgrade to add more sites — every plan's full feature list is on the Billing page.`,
      code: 'QUOTA_SITES_EXHAUSTED',
      status,
    }
  }
  return { ok: true, status, isNewSite: Boolean(newSite) }
}

export function consumeQuota({ identity, planId = 'free', hostname }) {
  const { entry, store } = entryFor(identity)
  entry.fixesUsed = (entry.fixesUsed || 0) + 1
  if (hostname) entry.sites[hostname] = true
  writeStore(store)
  return quotaStatus({ identity, planId })
}
