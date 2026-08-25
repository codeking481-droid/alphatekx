// restorationBilling.mjs — per-scan credit meter for honest, observable billing
// Groq-only, 1 credit = 1 restoration (scan+fix+verify). Enforces 402 when exhausted.
import fs from 'node:fs'
import * as billing from './billing.mjs'

export const RESTORATION_COST = 1

export const RESTORATION_PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    scans: 1,
    fixes: 1,
    sites: 1,
    cta: 'Start Free',
    features: ['1 scan / month', '1 fix / month', 'Scan + report + full heal', '1 site'],
    badge: 'Free',
  },
  starter: {
    id: 'lite_9',
    name: 'Starter',
    price: 9,
    currency: 'USD',
    scans: 1, // scans aliased to sites in UI, but backend counts fixes
    fixes: 5,
    sites: 1,
    cta: 'Upgrade to Starter — $9/mo',
    features: ['1 site', '5 fixes / month', 'Scan + report + full heal'],
  },
  lite: {
    id: 'video_19',
    name: 'Lite',
    price: 19,
    currency: 'USD',
    scans: 10,
    fixes: 15,
    sites: 3,
    cta: 'Upgrade to Lite — $19/mo',
    features: ['3 sites', '15 fixes / month', '10 App Scans + Reports', '3 Video Restorations'],
  },
  pro: {
    id: 'video_49',
    name: 'Pro',
    price: 49,
    currency: 'USD',
    scans: 50,
    fixes: Infinity,
    sites: 10,
    cta: 'Upgrade to Pro — $49/mo',
    popular: true,
    features: ['10 sites', 'Unlimited fixes', '50 Full App Restorations', '25 Video Restorations'],
    badge: 'Most Popular',
  },
  business: {
    id: 'video_99',
    name: 'Business',
    price: 99,
    currency: 'USD',
    scans: 999,
    fixes: Infinity,
    sites: 25,
    cta: 'Upgrade to Business — $99/mo',
    features: ['25 sites', 'Priority healing queue', 'Unlimited Restorations', 'All video styles'],
  },
  enterprise: {
    id: 'enterprise_199',
    name: 'Enterprise',
    price: 199,
    currency: 'USD',
    scans: Infinity,
    fixes: Infinity,
    sites: Infinity,
    cta: 'Upgrade to Enterprise — $199/mo',
    features: ['Unlimited sites & fixes', 'Everything unlocked', 'Priority queue + API access', 'White-label reports'],
  },
}

// Check credits before restore. Returns { ok, remaining, error, code } — 402 if exhausted.
export async function checkRestorationCredit(user, config) {
  const credits = await billing.getUserCredits(user, config)
  if (credits < RESTORATION_COST) {
    return { ok: false, remaining: credits, error: 'Insufficient credits — 1 credit per restoration', code: 402, plans: RESTORATION_PLANS }
  }
  return { ok: true, remaining: credits }
}

// Deduct 1 credit after successful restore. Idempotent via runId.
export async function deductRestorationCredit(user, config, runId) {
  return billing.spendCredits(user, RESTORATION_COST, config, {
    reason: 'Restoration scan+fix',
    automationId: runId || `restore-${Date.now()}`,
    idempotencyKey: runId,
  })
}

// Non-blocking meter: increments scan count for analytics (NRR)
export function recordScanMetric({ userId, url, afterScore, ms, success }) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), userId, url, afterScore, ms, success }) + '\n'
    fs.mkdirSync('data', { recursive: true })
    fs.appendFileSync('data/restoration-scans.jsonl', line)
  } catch {}
}
