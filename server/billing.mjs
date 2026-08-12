import fs from 'node:fs'
import path from 'node:path'
import { createHmac, randomUUID } from 'node:crypto'
import { supabaseServiceHeaders } from './supabaseHeaders.mjs'

const adminEmail = 'iamdan4live@gmail.com'
const DEFAULT_CREDITS = 10
const dataDir = path.resolve('data')
const billingDir = path.resolve(dataDir, 'billing')
const transactionsFile = path.resolve(billingDir, 'transactions.json')
const subscriptionsFile = path.resolve(billingDir, 'subscriptions.json')
const balancesFile = path.resolve(billingDir, 'balances.json')

try { fs.mkdirSync(billingDir, { recursive: true }) } catch {}

function readJsonFile(file, defaultValue) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return defaultValue }
}
function writeJsonFile(file, value) {
  try { fs.writeFileSync(file, JSON.stringify(value, null, 2)) } catch {}
}

function serviceHeaders(serviceKey, extra = {}) {
  return supabaseServiceHeaders(serviceKey, extra)
}

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    priceKobo: 0,
    monthlyCredits: 0,
    maxActiveAutomations: 1,
    monthlyVideos: 1,
    videoMaxDurationSec: 2 * 60,
    features: ['10 free signup credits', '1 active automation', 'Basic automations', 'Execution history'],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceKobo: 1500,
    currency: 'USD',
    monthlyCredits: 150,
    maxActiveAutomations: 2,
    features: ['150 credits every month', 'Up to 2 active automations', 'Scheduled automations', 'Basic support'],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    priceKobo: 2900,
    currency: 'USD',
    monthlyCredits: 400,
    maxActiveAutomations: 10,
    features: ['400 credits every month', 'Up to 10 active automations', 'Priority scheduling', 'Priority support'],
    badge: 'Most Popular',
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    priceKobo: 7900,
    currency: 'USD',
    monthlyCredits: 1200,
    maxActiveAutomations: 1000000,
    features: ['1,200 credits every month', 'Unlimited active automations', 'Dedicated success', 'API access'],
  },
  early_founder: {
    id: 'early_founder',
    name: 'Early Founder',
    priceKobo: 1900,
    currency: 'USD',
    monthlyCredits: 400,
    maxActiveAutomations: 10,
    monthlyVideos: 10,
    videoMaxDurationSec: 5 * 60,
    features: ['400 credits every month', 'Up to 10 active automations', 'Priority scheduling', 'Early founder pricing'],
  },
  creator_monthly: {
    id: 'creator_monthly',
    name: 'Starter',
    priceKobo: 1500,
    currency: 'USD',
    monthlyCredits: 150,
    maxActiveAutomations: 2,
    features: ['150 credits every month', 'Up to 2 active automations', 'Scheduled automations', 'Basic support'],
  },
  builder_monthly: {
    id: 'builder_monthly',
    name: 'Growth',
    priceKobo: 2900,
    currency: 'USD',
    monthlyCredits: 400,
    maxActiveAutomations: 10,
    features: ['400 credits every month', 'Up to 10 active automations', 'Priority scheduling', 'Priority support'],
    badge: 'Most Popular',
  },
  scale_monthly: {
    id: 'scale_monthly',
    name: 'Scale',
    priceKobo: 7900,
    currency: 'USD',
    monthlyCredits: 1200,
    maxActiveAutomations: 1000000,
    features: ['1,200 credits every month', 'Unlimited active automations', 'Dedicated success', 'API access'],
  },
}

export const CREDIT_PACKS = [
  { id: 'test_100', credits: 100, amountKobo: 10000, currency: 'NGN', label: 'Test purchase', description: 'Test payment for ₦100' },
  // Video monthly subscription packs (use plan ids when subscribing)
  { id: 'video_19', credits: 0, amountKobo: 1900, currency: 'USD', label: '$19 Video Monthly', description: '10 videos / month, up to 5 mins each', type: 'subscription', planId: 'video_19' },
  { id: 'video_49', credits: 0, amountKobo: 4900, currency: 'USD', label: '$49 Video Monthly', description: '30 videos / month, up to 8 mins each + scheduler', type: 'subscription', planId: 'video_49' },
  { id: 'video_99', credits: 0, amountKobo: 9900, currency: 'USD', label: '$99 Video Monthly', description: 'Unlimited videos, up to 12 mins + Vault', type: 'subscription', planId: 'video_99' },
]

// Video-specific plan entries (explicit)
PLANS.video_free = { id: 'video_free', name: 'Free Video', priceKobo: 0, monthlyVideos: 1, videoMaxDurationSec: 2 * 60, features: ['1 video / month, max 2 mins'] }
PLANS.video_19 = { id: 'video_19', name: '$19 Video', priceKobo: 1900, monthlyVideos: 10, videoMaxDurationSec: 5 * 60, features: ['10 videos / month, max 5 mins'] }
PLANS.video_49 = { id: 'video_49', name: '$49 Video', priceKobo: 4900, monthlyVideos: 30, videoMaxDurationSec: 8 * 60, schedulerDays: 7, librarianUniqueClips: 84, features: ['30 videos / month, max 8 mins, 7-day scheduler'] }
PLANS.video_99 = { id: 'video_99', name: '$99 Video', priceKobo: 9900, monthlyVideos: Infinity, videoMaxDurationSec: 12 * 60, vault: true, features: ['Unlimited videos, max 12 mins, Vault & team seats'] }

export function getPlan(id) { return PLANS[id] || PLANS.free }
export function getCreditPack(id) {
  const normalizedId = String(id || '').trim()
  const pack = CREDIT_PACKS.find(p => p.id === normalizedId)
  if (pack) return pack
  if (normalizedId === 'test_50') return CREDIT_PACKS.find(p => p.id === 'test_100')
  return undefined
}

function normalizedEmail(value) { return String(value || '').trim().toLowerCase() }
function userEmail(user) {
  const direct = normalizedEmail(user?.email)
  if (direct) return direct
  const metadataEmail = normalizedEmail(user?.user_metadata?.email || user?.app_metadata?.email)
  if (metadataEmail) return metadataEmail
  for (const identity of user?.identities || []) {
    const identityEmail = normalizedEmail(identity?.identity_data?.email)
    if (identityEmail) return identityEmail
  }
  return ''
}
function configuredAdminEmails() {
  return new Set([
    adminEmail,
    ...String(process.env.SUPER_ADMIN_EMAILS || '').split(',').map(normalizedEmail).filter(Boolean),
  ])
}
function isAdmin(user) { return configuredAdminEmails().has(userEmail(user)) }

function nowIso() { return new Date().toISOString() }

export function getStepCost(action, agent) {
  const perStep = Array.isArray(agent?.creditsPerStep) ? agent.creditsPerStep : []
  const key = action.label || `${action.action} ${action.connector}`
  const match = perStep.find(p => p.step === key || p.step === action.label || p.step === `${action.action} ${action.connector}`)
  if (match && typeof match.cost === 'number' && match.cost > 0) return match.cost
  // Default cost rules when no per-step estimate exists
  if (['gmail', 'email', 'telegram', 'slack', 'discord', 'whatsapp'].includes(action.connector)) return 2
  if (['x', 'linkedin', 'facebook', 'instagram', 'youtube'].includes(action.connector)) return 2
  if (['google_sheets', 'sheets'].includes(action.connector)) return 1
  if (['google_calendar', 'calendar'].includes(action.connector)) return 1
  if (action.action?.includes('summarize') || action.action?.includes('analyze') || action.action?.includes('generate') || action.action?.includes('report')) return 3
  return 1
}

export function estimateAgentCredits(agent) {
  const actions = Array.isArray(agent?.actions) ? agent.actions : []
  if (!actions.length) return Math.max(1, agent?.creditsNeeded || agent?.creditsPerRun || 1)
  const perStep = Array.isArray(agent?.creditsPerStep) ? agent.creditsPerStep : []
  const seen = new Set()
  let total = 0
  actions.forEach(a => {
    const key = a.label || `${a.action} ${a.connector}`
    const match = perStep.find(p => p.step === key || p.step === a.label || p.step === `${a.action} ${a.connector}`)
    total += match && typeof match.cost === 'number' && match.cost > 0 ? match.cost : getStepCost(a, agent)
    seen.add(key)
  })
  perStep.forEach(p => {
    if (!seen.has(p.step) && typeof p.cost === 'number' && p.cost > 0) total += p.cost
  })
  return total > 0 ? total : 1
}

function readLocalBalance(userId) {
  const balances = readJsonFile(balancesFile, {})
  return balances[userId] || {}
}

function writeLocalBalance(userId, balance) {
  const balances = readJsonFile(balancesFile, {})
  balances[userId] = { ...balances[userId], ...balance, updated_at: nowIso() }
  writeJsonFile(balancesFile, balances)
}

async function readProfile(user, config) {
  let profile = null
  if (config?.url && config?.service) {
    try {
      const res = await fetch(`${config.url}/rest/v1/profiles?id=eq.${user.id}&select=*`, { headers: serviceHeaders(config.service) })
      if (res.ok) { const rows = await res.json(); if (rows?.[0]) profile = rows[0] }
    } catch {}
  }
  const users = readJsonFile(path.resolve(dataDir, 'users.json'), [])
  const local = users.find(u => u.id === user.id)
  if (local && !profile) profile = local
  if (!profile && !user.id) return null
  const isLocalTestFixture = process.env.NODE_ENV !== 'production' && normalizedEmail(user?.email).endsWith('@test.local')
  if (!profile) profile = {
    id: user.id,
    email: user.email || '',
    credits: isLocalTestFixture ? 30 : DEFAULT_CREDITS,
    plan: isLocalTestFixture ? 'builder_monthly' : 'free',
  }
  const balance = readLocalBalance(user.id)
  const total = Number(profile.credits) || 0
  const monthly = Number(profile.monthly_credits ?? balance.monthly_credits) || 0
  const purchased = Number(profile.purchased_credits ?? balance.purchased_credits) || 0
  const totalSpent = Number(profile.total_credits_spent ?? balance.total_credits_spent) || 0
  // If split columns are missing, treat all credits as purchased so spending works
  const normalizedPurchased = (monthly === 0 && purchased === 0 && total > 0) ? total : purchased
  // Welcome credits are granted once by the authenticated signup endpoint.
  // Never refill an existing balance here: doing so would undo legitimate usage.
  return {
    id: user.id,
    email: user.email || profile.email || local?.email || '',
    credits: total,
    plan: String(profile.plan || 'free'),
    monthly_credits: monthly,
    monthly_videos: Number(profile.monthly_videos ?? balance.monthly_videos) || 0,
    monthly_videos_used: Number(profile.monthly_videos_used ?? balance.monthly_videos_used) || 0,
    video_count_used: Number(profile.video_count_used ?? balance.video_count_used ?? profile.monthly_videos_used ?? 0) || 0,
    video_count_reset_date: profile.video_count_reset_date || balance.video_count_reset_date || profile.subscription_renews_at || null,
    purchased_credits: normalizedPurchased,
    monthly_credits_used: Number(profile.monthly_credits_used ?? balance.monthly_credits_used) || 0,
    total_credits_spent: totalSpent,
    subscription_renews_at: profile.subscription_renews_at || balance.subscription_renews_at || null,
  }
}

async function writeProfile(user, config, patch) {
  const balancePatch = {}
  if ('monthly_credits' in patch) balancePatch.monthly_credits = patch.monthly_credits
  if ('purchased_credits' in patch) balancePatch.purchased_credits = patch.purchased_credits
  if ('monthly_credits_used' in patch) balancePatch.monthly_credits_used = patch.monthly_credits_used
  if ('monthly_videos' in patch) balancePatch.monthly_videos = patch.monthly_videos
  if ('monthly_videos_used' in patch) balancePatch.monthly_videos_used = patch.monthly_videos_used
  if ('video_count_used' in patch) balancePatch.video_count_used = patch.video_count_used
  if ('video_count_reset_date' in patch) balancePatch.video_count_reset_date = patch.video_count_reset_date
  if ('total_credits_spent' in patch) balancePatch.total_credits_spent = patch.total_credits_spent
  if ('subscription_renews_at' in patch) balancePatch.subscription_renews_at = patch.subscription_renews_at
  if ('plan' in patch) balancePatch.plan = patch.plan
  writeLocalBalance(user.id, balancePatch)
  if (config?.url && config?.service) {
    try {
      const corePatch = {}
      if ('credits' in patch) corePatch.credits = patch.credits
      if ('plan' in patch) corePatch.plan = patch.plan
      await fetch(`${config.url}/rest/v1/profiles?id=eq.${user.id}`, { method: 'PATCH', headers: serviceHeaders(config.service), body: JSON.stringify({ ...corePatch, updated_at: nowIso() }) })
    } catch {}
    try {
      const extraPatch = {}
      if ('monthly_credits' in patch) extraPatch.monthly_credits = patch.monthly_credits
      if ('purchased_credits' in patch) extraPatch.purchased_credits = patch.purchased_credits
      if ('monthly_credits_used' in patch) extraPatch.monthly_credits_used = patch.monthly_credits_used
      if ('monthly_videos' in patch) extraPatch.monthly_videos = patch.monthly_videos
      if ('monthly_videos_used' in patch) extraPatch.monthly_videos_used = patch.monthly_videos_used
      if ('video_count_used' in patch) extraPatch.video_count_used = patch.video_count_used
      if ('video_count_reset_date' in patch) extraPatch.video_count_reset_date = patch.video_count_reset_date
      if ('total_credits_spent' in patch) extraPatch.total_credits_spent = patch.total_credits_spent
      if ('subscription_renews_at' in patch) extraPatch.subscription_renews_at = patch.subscription_renews_at
      if (Object.keys(extraPatch).length) await fetch(`${config.url}/rest/v1/profiles?id=eq.${user.id}`, { method: 'PATCH', headers: serviceHeaders(config.service), body: JSON.stringify({ ...extraPatch, updated_at: nowIso() }) })
    } catch {}
  }
  const users = readJsonFile(path.resolve(dataDir, 'users.json'), [])
  const idx = users.findIndex(u => u.id === user.id)
  const existing = users[idx] || { id: user.id, email: user.email, credits: 0, plan: 'free', monthly_credits: 0, purchased_credits: 0, monthly_credits_used: 0, total_credits_spent: 0 }
  const next = { ...existing, ...patch }
  if (idx >= 0) users[idx] = next
  else users.push(next)
  writeJsonFile(path.resolve(dataDir, 'users.json'), users)
}

async function findUserByEmail(email, config) {
  const normalized = normalizedEmail(email)
  if (!normalized) return null
  if (config?.url && config?.service) {
    try {
      const response = await fetch(`${config.url}/rest/v1/profiles?email=eq.${encodeURIComponent(normalized)}&select=id,email,credits,plan&limit=1`, { headers: serviceHeaders(config.service) })
      if (response.ok) {
        const rows = await response.json()
        if (Array.isArray(rows) && rows[0]) return rows[0]
      }
    } catch {}
  }
  const users = readJsonFile(path.resolve(dataDir, 'users.json'), [])
  const local = users.find(u => normalizedEmail(u.email) === normalized || normalizedEmail(u?.user_metadata?.email) === normalized)
  if (local) return { id: local.id, email: local.email || normalized, credits: Number(local.credits) || 0, plan: local.plan || 'free' }
  return null
}

export async function getUserCredits(user, config) {
  if (isAdmin(user)) return 999999
  const profile = await readProfile(user, config)
  if (!profile) return 0
  return Number(profile.credits) || 0
}

export async function getUserBilling(user, config) {
  if (isAdmin(user)) {
    return {
      credits: 999999,
      plan: 'admin',
      planName: 'Admin (unlimited)',
      monthlyCredits: 0,
      purchasedCredits: 0,
      monthlyIncluded: 0,
      renewalDate: null,
      usageThisMonth: 0,
      totalCreditsSpent: 0,
      maxActiveAutomations: 1000000,
      transactions: await getTransactions(user.id, 100),
    }
  }
  const profile = await readProfile(user, config)
  const plan = getPlan(profile?.plan || 'free')
  const monthlyCredits = Number(profile?.monthly_credits) || 0
  const purchasedCredits = Number(profile?.purchased_credits) || 0
  const totalCredits = Number(profile?.credits) || (monthlyCredits + purchasedCredits)
  return {
    credits: totalCredits,
    plan: profile?.plan || 'free',
    planName: plan.name,
    monthlyCredits,
    purchasedCredits,
    monthlyIncluded: plan.monthlyCredits,
    renewalDate: profile?.subscription_renews_at || null,
    usageThisMonth: Number(profile?.monthly_credits_used) || 0,
    totalCreditsSpent: Number(profile?.total_credits_spent) || 0,
    maxActiveAutomations: plan.maxActiveAutomations,
    transactions: await getTransactions(user.id, 100),
  }
}

export async function recordTransaction(userId, { type, creditsAdded = 0, creditsRemoved = 0, balanceAfter, reference, automationId, reason, metadata }) {
  const record = {
    id: randomUUID(),
    user_id: userId,
    type,
    credits_added: creditsAdded,
    credits_removed: creditsRemoved,
    balance_after: balanceAfter,
    reference: reference || null,
    automation_id: automationId || null,
    reason: reason || null,
    metadata: metadata || null,
    created_at: nowIso(),
  }
  const all = readJsonFile(transactionsFile, [])
  all.unshift(record)
  writeJsonFile(transactionsFile, all.slice(0, 10000))
  return record
}

export async function getTransactions(userId, limit = 100) {
  const all = readJsonFile(transactionsFile, [])
  return all.filter(t => t.user_id === userId).slice(0, limit)
}

export async function spendCredits(user, amount, config, metadata = {}) {
  const cost = Number(amount) || 0
  if (cost <= 0) return { ok: true, remaining: await getUserCredits(user, config) }
  if (isAdmin(user)) return { ok: true, remaining: Infinity }
  const idempotencyKey = String(metadata.idempotencyKey || '')
  if (idempotencyKey) {
    const existing = (await getTransactions(user.id, 10000)).find(transaction => transaction.type === 'spend' && transaction.metadata?.idempotencyKey === idempotencyKey)
    if (existing) return { ok: true, remaining: Number(existing.balance_after) || 0, duplicate: true }
  }
  const profile = await readProfile(user, config)
  if (!profile) return { ok: false, remaining: 0, error: 'Profile not found' }
  let monthly = Number(profile.monthly_credits) || 0
  let purchased = Number(profile.purchased_credits) || 0
  let total = Number(profile.credits) || (monthly + purchased)
  if (total < cost) return { ok: false, remaining: total, error: 'Insufficient credits' }
  let fromMonthly = 0
  let fromPurchased = 0
  if (monthly >= cost) {
    fromMonthly = cost
    monthly -= cost
  } else {
    fromMonthly = monthly
    const rest = cost - fromMonthly
    monthly = 0
    fromPurchased = Math.min(rest, purchased)
    purchased -= fromPurchased
    if (fromPurchased < rest) {
      // Edge case: total allowed by invariant but purchased insufficient; draw from credits fallback
      const fallback = rest - fromPurchased
      total -= fallback
      fromPurchased += fallback
    }
  }
  total = monthly + purchased
  const monthlyUsed = (Number(profile.monthly_credits_used) || 0) + fromMonthly
  const totalSpent = (Number(profile.total_credits_spent) || 0) + cost
  await writeProfile(user, config, {
    credits: total,
    monthly_credits: monthly,
    purchased_credits: purchased,
    monthly_credits_used: monthlyUsed,
    total_credits_spent: totalSpent,
  })
  await recordTransaction(user.id, { type: 'spend', creditsRemoved: cost, balanceAfter: total, automationId: metadata.automationId, reason: metadata.reason || `Automation step`, metadata })
  return { ok: true, remaining: total }
}

function transactionExists(userId, reference) {
  if (!reference) return false
  const all = readJsonFile(transactionsFile, [])
  return all.some(t => t.user_id === userId && t.reference === reference)
}

export async function addCredits(user, amount, config, { reference, type = 'purchase', reason, metadata = {} } = {}) {
  const added = Number(amount) || 0
  if (added <= 0) return { ok: false, remaining: await getUserCredits(user, config) }
  if (transactionExists(user.id, reference)) return { ok: true, remaining: await getUserCredits(user, config) }
  const profile = await readProfile(user, config)
  if (!profile) return { ok: false, remaining: 0 }
  const isSubscription = type === 'subscription' || String(reason).includes('subscription') || String(metadata?.plan).includes('pro')
  let monthly = Number(profile.monthly_credits) || 0
  let purchased = Number(profile.purchased_credits) || 0
  const legacyUnclassified = Math.max(0, (Number(profile.credits) || 0) - monthly - purchased)
  purchased += legacyUnclassified
  if (isSubscription) {
    monthly += added
    if (metadata?.plan) profile.plan = metadata.plan
    if (metadata?.renewalDate) profile.subscription_renews_at = metadata.renewalDate
  } else {
    purchased += added
  }
  const total = monthly + purchased
  await writeProfile(user, config, {
    credits: total,
    monthly_credits: monthly,
    purchased_credits: purchased,
    plan: profile.plan,
    subscription_renews_at: profile.subscription_renews_at,
  })
  await recordTransaction(user.id, { type: isSubscription ? 'subscription' : 'purchase', creditsAdded: added, balanceAfter: total, reference, reason: reason || (isSubscription ? `Subscription: ${metadata?.plan}` : `Credit pack purchase`), metadata })
  return { ok: true, remaining: total }
}

async function completeVerifiedPurchase(user, reference, amount, credits, plan, config) {
  if (!config?.url || !config?.service) throw new Error('Durable payment storage is not configured')
  const rpcResponse = await fetch(`${config.url}/rest/v1/rpc/settle_paystack_purchase_v2`, {
    method: 'POST',
    headers: serviceHeaders(config.service),
    body: JSON.stringify({
      p_user_id: user.id,
      p_reference: reference,
      p_amount: amount,
      p_credits: credits,
      p_plan: plan,
      p_email: userEmail(user),
    }),
  })
  if (rpcResponse.ok) {
    const payload = await rpcResponse.json()
    const result = Array.isArray(payload) ? payload[0] : payload
    return {
      ok: true,
      remaining: Number(result?.balance) || 0,
      duplicate: result?.duplicate === true,
      plan: String(result?.plan || plan || 'credits'),
    }
  }
  const rpcError = await rpcResponse.text()
  // PGRST202 means the new migration has not reached this environment yet.
  // Keep the legacy path temporarily available, but never fall back after the
  // RPC itself ran and rejected a payment.
  if (rpcResponse.status === 404 || /PGRST202|schema cache|could not find the function/i.test(rpcError)) {
    process.stderr.write('[billing] settle_paystack_purchase_v2 is unavailable; using compatibility settlement\n')
    return completeVerifiedPurchaseWithoutRpc(user, reference, amount, credits, plan, config)
  }
  throw new Error(`Atomic payment settlement failed (${rpcResponse.status})`)
}

async function durablePurchaseBalance(user, reference, config) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const transactionResponse = await fetch(`${config.url}/rest/v1/credit_transactions?user_id=eq.${encodeURIComponent(user.id)}&reference=eq.${encodeURIComponent(reference)}&select=balance_after&limit=1`, { headers: serviceHeaders(config.service) })
    if (transactionResponse.ok) {
      const rows = await transactionResponse.json()
      if (rows?.[0]) return Number(rows[0].balance_after) || 0
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
  }
  return null
}

async function completeVerifiedPurchaseWithoutRpc(user, reference, amount, credits, plan, config) {
  const purchase = {
    reference,
    user_id: user.id,
    amount,
    credits,
    plan,
  }
  const claimResponse = await fetch(`${config.url}/rest/v1/credit_purchases`, {
    method: 'POST',
    headers: serviceHeaders(config.service, { Prefer: 'return=minimal' }),
    body: JSON.stringify(purchase),
  })
  if (!claimResponse.ok) {
    const raw = await claimResponse.text()
    if (claimResponse.status === 409 || /duplicate key|unique constraint/i.test(raw)) {
      const existingBalance = await durablePurchaseBalance(user, reference, config)
      if (existingBalance != null) return { ok: true, remaining: existingBalance, duplicate: true }
      // Never delete a durable claim here. The profile may already have been
      // credited before a process interruption; deleting and replaying it can
      // double-credit a successful payment.
      throw new Error('This verified payment is still being credited. Please refresh in a moment.')
    }
    throw new Error(`Could not record the verified payment durably (${claimResponse.status})`)
  }

  const releaseClaim = async () => {
    await fetch(`${config.url}/rest/v1/credit_purchases?reference=eq.${encodeURIComponent(reference)}&user_id=eq.${encodeURIComponent(user.id)}`, {
      method: 'DELETE', headers: serviceHeaders(config.service),
    }).catch(() => {})
  }
  const profileResponse = await fetch(`${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,credits,plan,monthly_credits,purchased_credits&limit=1`, { headers: serviceHeaders(config.service) })
  if (!profileResponse.ok) { await releaseClaim(); throw new Error(`Could not read the credit account (${profileResponse.status})`) }
  const profile = (await profileResponse.json())?.[0]
  if (!profile) { await releaseClaim(); throw new Error('The paid account profile could not be found') }

  const isSubscription = plan !== 'credits'
  const monthlyCredits = Number(profile.monthly_credits) || 0
  const purchasedCredits = Number(profile.purchased_credits) || 0
  const currentBalance = Number(profile.credits) || 0
  const legacyUnclassified = Math.max(0, currentBalance - monthlyCredits - purchasedCredits)
  const nextMonthly = isSubscription ? credits : monthlyCredits
  const nextPurchased = purchasedCredits + legacyUnclassified + (isSubscription ? 0 : credits)
  const nextBalance = nextMonthly + nextPurchased
  const profilePatch = {
    credits: nextBalance,
    monthly_credits: nextMonthly,
    purchased_credits: nextPurchased,
    ...(isSubscription ? { plan } : {}),
    updated_at: nowIso(),
  }
  const updateResponse = await fetch(`${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
    method: 'PATCH',
    headers: serviceHeaders(config.service, { Prefer: 'return=minimal' }),
    body: JSON.stringify(profilePatch),
  })
  if (!updateResponse.ok) { await releaseClaim(); throw new Error(`Could not update the paid credit balance (${updateResponse.status})`) }

  const historyResponse = await fetch(`${config.url}/rest/v1/credit_transactions`, {
    method: 'POST',
    headers: serviceHeaders(config.service, { Prefer: 'return=minimal' }),
    body: JSON.stringify({
      user_id: user.id,
      type: isSubscription ? 'subscription' : 'purchase',
      credits_added: credits,
      credits_removed: 0,
      balance_after: nextBalance,
      reference,
      reason: isSubscription ? `Subscription: ${plan}` : 'Credit purchase',
      metadata: { plan, amount, provider: 'paystack', settlement: 'rest_fallback' },
    }),
  })
  if (!historyResponse.ok) process.stderr.write(`[billing] payment ${reference} credited, but history insert returned ${historyResponse.status}\n`)
  return { ok: true, remaining: nextBalance }
}

export async function grantCreditsByAdmin(admin, targetEmail, amount, config, idempotencyKey) {
  if (!isAdmin(admin)) throw new Error('Admin access required')
  if (!config?.url || !config?.service) throw new Error('Durable credit storage is not configured')
  const email = normalizedEmail(targetEmail)
  const credits = Math.floor(Number(amount))
  if (!email || !email.includes('@')) throw new Error('Enter a valid account email')
  if (!Number.isInteger(credits) || credits < 1 || credits > 1_000_000) throw new Error('Credits must be between 1 and 1,000,000')
  const key = String(idempotencyKey || '').trim()
  if (!key) throw new Error('Transfer idempotency key is required')
  const reference = `admin-transfer:${admin.id}:${key}`
  const existingResponse = await fetch(`${config.url}/rest/v1/credit_transactions?reference=eq.${encodeURIComponent(reference)}&select=balance_after&limit=1`, { headers: serviceHeaders(config.service) })
  if (existingResponse.ok) {
    const existing = await existingResponse.json()
    if (existing?.[0]) return { ok: true, email, credits, balance: Number(existing[0].balance_after) || 0, duplicate: true }
  }
  const target = await findUserByEmail(email, config)
  if (!target?.id) throw new Error('No AlphaTekx account was found for that email')
  const profileResponse = await fetch(`${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(target.id)}&select=id,email,credits,purchased_credits&limit=1`, { headers: serviceHeaders(config.service) })
  if (!profileResponse.ok) throw new Error(`Could not read the recipient account (${profileResponse.status})`)
  const profile = (await profileResponse.json())?.[0]
  if (!profile) throw new Error('Recipient credit profile was not found')
  const nextBalance = (Number(profile.credits) || 0) + credits
  const nextPurchased = (Number(profile.purchased_credits) || 0) + credits
  const updateResponse = await fetch(`${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(target.id)}`, {
    method: 'PATCH', headers: serviceHeaders(config.service, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ credits: nextBalance, purchased_credits: nextPurchased, updated_at: nowIso() }),
  })
  if (!updateResponse.ok) throw new Error(`Could not transfer credits (${updateResponse.status})`)
  const historyResponse = await fetch(`${config.url}/rest/v1/credit_transactions`, {
    method: 'POST', headers: serviceHeaders(config.service, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ user_id: target.id, type: 'admin_transfer', credits_added: credits, credits_removed: 0, balance_after: nextBalance, reference, reason: 'Credits transferred by AlphaTekx admin', metadata: { admin_id: admin.id, admin_email: userEmail(admin), recipient_email: email } }),
  })
  if (!historyResponse.ok) process.stderr.write(`[billing] admin transfer ${reference} applied, but history insert returned ${historyResponse.status}\n`)
  return { ok: true, email, credits, balance: nextBalance }
}

export async function setPlan(user, planId, config, { reference } = {}) {
  const plan = getPlan(planId)
  if (reference && transactionExists(user.id, reference)) return { ok: true, remaining: await getUserCredits(user, config), plan: plan.id }
  const profile = await readProfile(user, config)
  if (!profile) return { ok: false }
  const monthly = plan.monthlyCredits
  const purchased = Number(profile.purchased_credits) || 0
  const total = monthly + purchased
  const renewal = new Date()
  renewal.setDate(renewal.getDate() + 30)
  const profilePatch = {
    plan: plan.id,
    credits: total,
    monthly_credits: monthly,
    monthly_credits_used: 0,
    subscription_renews_at: renewal.toISOString(),
  }
  // If this is a video subscription plan, initialize video counters and reset date
  if (String(plan.id).startsWith('video_') || String(plan.id).startsWith('video')) {
    profilePatch.monthly_videos = Number(plan.monthlyVideos || plan.monthly_videos || 0)
    profilePatch.monthly_videos_used = 0
    profilePatch.video_count_used = 0
    const nextReset = new Date()
    nextReset.setDate(nextReset.getDate() + 30)
    profilePatch.video_count_reset_date = nextReset.toISOString()
  }
  await writeProfile(user, config, profilePatch)
  await recordTransaction(user.id, { type: 'plan_change', creditsAdded: monthly, balanceAfter: total, reason: `Upgraded to ${plan.name}`, metadata: { plan: plan.id } })
  return { ok: true, remaining: total, plan: plan.id, renewalDate: renewal.toISOString() }
}

export async function canCreateAgent(user, config, activeCount) {
  if (isAdmin(user)) return { ok: true }
  const billing = await getUserBilling(user, config)
  const currentActiveCount = Math.max(0, Number(activeCount) || 0)
  const maxActiveAutomations = Number(billing.maxActiveAutomations) || 1
  if (currentActiveCount >= maxActiveAutomations) {
    const detail = maxActiveAutomations === 1
      ? 'Pause your current automation or upgrade to continue.'
      : `Pause one automation or upgrade to ${billing.planName} to continue.`
    return { ok: false, reason: `This plan supports ${maxActiveAutomations} active automation${maxActiveAutomations === 1 ? '' : 's'}. ${detail}`, plan: billing.plan, limit: maxActiveAutomations }
  }
  if (Number(billing.credits) < 1) {
    return { ok: false, reason: 'You need at least 1 credit to create an automation.', plan: billing.plan }
  }
  return { ok: true, limit: maxActiveAutomations }
}

export async function resetMonthlyCredits(config) {
  const now = new Date()
  const balances = readJsonFile(balancesFile, {})
  const profilesToUpdate = []
  for (const [userId, record] of Object.entries(balances)) {
    if (!record.subscription_renews_at || record.plan === 'free') continue
    const renew = new Date(record.subscription_renews_at)
    if (renew <= now) {
      const user = { id: userId, email: record.email || '' }
      const plan = getPlan(record.plan)
      const profile = await readProfile(user, config)
      const purchased = Number(profile?.purchased_credits) || 0
      const total = plan.monthlyCredits + purchased
      const nextRenew = new Date()
      nextRenew.setDate(nextRenew.getDate() + 30)
      // Reset monthly credits and also initialize monthly video allowance if the plan defines it
      await writeProfile(user, config, { credits: total, monthly_credits: plan.monthlyCredits, monthly_credits_used: 0, monthly_videos: plan.monthlyVideos || 0, monthly_videos_used: 0, subscription_renews_at: nextRenew.toISOString() })
      await recordTransaction(userId, { type: 'subscription', creditsAdded: plan.monthlyCredits, balanceAfter: total, reason: `Monthly credits reset for ${plan.name}`, metadata: { plan: plan.id } })
      profilesToUpdate.push(userId)
    }
  }
  return profilesToUpdate.length
}

export async function resetMonthlyVideos(config) {
  const now = new Date()
  const balances = readJsonFile(balancesFile, {})
  const profilesToUpdate = []
  for (const [userId, record] of Object.entries(balances)) {
    if (!record.subscription_renews_at) continue
    const renew = new Date(record.subscription_renews_at)
    if (renew <= now) {
      const user = { id: userId, email: record.email || '' }
      const plan = getPlan(record.plan)
      const monthlyVideos = Number(plan.monthlyVideos || 0)
      const nextRenew = new Date()
      nextRenew.setDate(nextRenew.getDate() + 30)
      await writeProfile(user, config, { monthly_videos: monthlyVideos, monthly_videos_used: 0, video_count_used: 0, video_count_reset_date: nextRenew.toISOString(), subscription_renews_at: nextRenew.toISOString() })
      profilesToUpdate.push(userId)
    }
  }
  return profilesToUpdate.length
}

export function getPlanVideoPolicy(planId) {
  const plan = getPlan(planId)
  if (!plan) return { monthly: 0, maxDurationSec: 2 * 60, schedulerDays: 0, vault: false }
  switch (String(plan.id)) {
    case 'video_99':
      return { monthly: Infinity, maxDurationSec: 12 * 60, schedulerDays: 7, vault: true }
    case 'video_49':
      return { monthly: 30, maxDurationSec: 8 * 60, schedulerDays: 7, vault: false, librarianUniqueClips: Number(plan.librarianUniqueClips || 84) }
    case 'video_19':
      return { monthly: 10, maxDurationSec: 5 * 60, schedulerDays: 0, vault: false }
    case 'video_free':
    case 'free':
      return { monthly: 1, maxDurationSec: 2 * 60, schedulerDays: 0, vault: false }
    default:
      return { monthly: Number(plan.monthlyVideos || 0) || 0, maxDurationSec: Number(plan.videoMaxDurationSec || 0) || 2 * 60, schedulerDays: Number(plan.schedulerDays || 0) || 0, vault: Boolean(plan.vault || false) }
  }
}

export async function canGenerateVideo(user, config, durationSeconds) {
  if (isAdmin(user)) return { ok: true }
  const profile = await readProfile(user, config)
  if (!profile) return { ok: false, reason: 'PROFILE_NOT_FOUND' }
  // Reset counts if the reset date has passed
  const now = new Date()
  let resetDate = profile.video_count_reset_date ? new Date(profile.video_count_reset_date) : null
  if (!resetDate || resetDate <= now) {
    const next = new Date()
    next.setDate(next.getDate() + 30)
    await writeProfile(user, config, { video_count_used: 0, video_count_reset_date: next.toISOString() }).catch(() => {})
    profile.video_count_used = 0
    profile.video_count_reset_date = next.toISOString()
    resetDate = new Date(profile.video_count_reset_date)
  }
  const planPolicy = getPlanVideoPolicy(profile.plan)
  const used = Number(profile.video_count_used || 0)
  const allowed = planPolicy.monthly === Infinity ? Infinity : Number(planPolicy.monthly || 0)
  if (Number(durationSeconds) > Number(planPolicy.maxDurationSec)) return { ok: false, reason: 'VIDEO_DURATION_EXCEEDED', limit: planPolicy.maxDurationSec }
  if (allowed !== Infinity && used >= allowed) return { ok: false, reason: 'VIDEO_MONTHLY_LIMIT_REACHED', limit: allowed }
  return { ok: true, remaining: allowed === Infinity ? Infinity : Math.max(0, allowed - used), policy: planPolicy, resetDate: profile.video_count_reset_date }
}

export async function recordVideoGeneration(user, config, { count = 1 } = {}) {
  const profile = await readProfile(user, config)
  const currentUsed = Number(profile.video_count_used || 0)
  const nextUsed = currentUsed + Number(count || 1)
  // Ensure reset date exists
  const now = new Date()
  let resetDate = profile.video_count_reset_date ? new Date(profile.video_count_reset_date) : null
  if (!resetDate || resetDate <= now) {
    const next = new Date()
    next.setDate(next.getDate() + 30)
    await writeProfile(user, config, { video_count_used: nextUsed, video_count_reset_date: next.toISOString() }).catch(() => {})
  } else {
    await writeProfile(user, config, { video_count_used: nextUsed }).catch(() => {})
  }
  await recordTransaction(user.id, { type: 'spend', creditsRemoved: 0, balanceAfter: Number(profile.credits) || 0, reason: 'Video generation usage', metadata: { video_count_used: nextUsed } })
  return { ok: true, used: nextUsed }
}

export function scheduleMonthlyReset(cronSchedule, callback) {
  // Caller is expected to use node-cron with this callback
  return { schedule: cronSchedule, callback }
}

// Payment abstraction layer
const providers = {}

export function registerPaymentProvider(name, handlers) {
  providers[name] = handlers
}

export async function initializePayment(providerName, user, item, config) {
  const provider = providers[providerName]
  if (!provider) throw new Error(`Payment provider ${providerName} is not registered`)
  return provider.initialize(user, item, config)
}

export async function verifyPayment(providerName, reference, config) {
  const provider = providers[providerName]
  if (!provider) throw new Error(`Payment provider ${providerName} is not registered`)
  return provider.verify(reference, config)
}

function publicAppUrl() {
  return process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3001}`
}

function paymentCallbackUrl(value) {
  const callback = new URL(String(value || 'https://alphatekx.name.ng/dashboard'), 'https://alphatekx.name.ng')
  callback.searchParams.set('payment', 'success')
  return callback.toString()
}

export function resolvePaystackCallbackUrl(item, fallback = `${publicAppUrl()}/settings?tab=billing`) {
  const explicit = typeof item?.callbackUrl === 'string' ? item.callbackUrl : typeof item?.callback_url === 'string' ? item.callback_url : ''
  if (explicit && explicit.trim()) return paymentCallbackUrl(explicit.trim())
  return paymentCallbackUrl(String(process.env.PAYSTACK_CALLBACK_URL || fallback).trim())
}

export function resolvePaystackCharge(item) {
  const amount = Number(item?.amountKobo ?? item?.priceKobo ?? 0)
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Payment amount is invalid')

  const packCurrency = String(item?.currency || '').trim().toUpperCase()
  const configuredCurrency = String(process.env.PAYSTACK_CHECKOUT_CURRENCY || 'NGN').trim().toUpperCase()
  const merchantAllowsUsd = configuredCurrency === 'USD' || String(process.env.PAYSTACK_ALLOW_USD || '').trim().toLowerCase() === 'true'
  const requestedCurrency = merchantAllowsUsd ? configuredCurrency : 'NGN'
  const supported = new Set(['NGN', 'USD'])
  if (!supported.has(configuredCurrency) && configuredCurrency !== '') throw new Error('PAYSTACK_CHECKOUT_CURRENCY must be NGN or USD')

  const nairaPerUsd = Number(process.env.PAYSTACK_NGN_PER_USD || 1600)
  if (!Number.isFinite(nairaPerUsd) || nairaPerUsd <= 0) throw new Error('PAYSTACK_NGN_PER_USD must be a positive number')

  if (requestedCurrency === 'USD') {
    if (amount >= 200) {
      return { amount, currency: 'USD', listPriceUsdCents: amount }
    }
    return { amount: Math.max(10000, Math.round(amount * nairaPerUsd)), currency: 'NGN', listPriceUsdCents: amount }
  }

  if (packCurrency === 'NGN') {
    return { amount: Math.max(10000, amount), currency: 'NGN', listPriceUsdCents: amount }
  }

  if (packCurrency === 'USD') {
    return { amount: Math.max(10000, Math.round(amount * nairaPerUsd)), currency: 'NGN', listPriceUsdCents: amount }
  }

  return {
    amount: Math.max(10000, Math.round(amount * nairaPerUsd)),
    currency: 'NGN',
    listPriceUsdCents: amount,
  }
}

export async function parsePaystackResponse(response, operation) {
  const raw = await response.text()
  if (!raw.trim()) throw new Error(`Paystack returned an empty response during ${operation}`)
  try { return JSON.parse(raw) }
  catch { throw new Error(`Paystack returned an invalid response during ${operation}`) }
}

async function initializePaystack(user, item, config) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  const isSubscription = item.type === 'subscription'
  const isEarlyFounder = String(item?.plan || item?.packId || '').toLowerCase() === 'early_founder_19' || String(item?.packId || '').toLowerCase() === 'early_founder_19'
  const pack = isSubscription ? null : getCreditPack(item.packId)
  const plan = isSubscription ? getPlan(item.planId) : null
  if (!isSubscription && !pack && !isEarlyFounder) throw new Error('Invalid credit pack')
  if (isSubscription && !plan) throw new Error('Invalid plan')

  let amount = 0
  let currency = 'NGN'
  let listPriceUsdCents = 0
  let credits = 0
  let source = ''

  if (isEarlyFounder) {
    credits = Number(item?.credits || 500)
    amount = 3_040_000
    currency = 'NGN'
    listPriceUsdCents = 1900
    source = 'credits_early_founder_19'
  } else {
    const charge = resolvePaystackCharge(isSubscription ? { priceKobo: plan.priceKobo, currency: plan.currency } : { amountKobo: pack.amountKobo, currency: pack.currency })
    ;({ amount, currency, listPriceUsdCents } = charge)
    credits = isSubscription ? plan.monthlyCredits : pack.credits
    source = isSubscription ? `subscription_${plan.id}` : `credits_${pack.id}`
  }
  const email = String(user.email || '')
  // For test credit pack use a deterministic test reference format avoiding user id leakage
  let reference
  if (!isSubscription && pack && typeof pack.id === 'string' && pack.id.startsWith('test_')) {
    // Use the requested test reference format: alphatekx_credits_test_100_<rand>_<ts>_<rand>
    reference = `alphatekx_credits_test_100_${Math.random().toString(36).substr(2, 8)}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
  } else {
    reference = `alphatekx_${source}_${user.id.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }
  const pending = readJsonFile(path.resolve(dataDir, 'pending-transactions.json'), {})
  pending[reference] = { userId: user.id, email, credits, amount, currency, listPriceUsdCents, source, status: 'pending', createdAt: nowIso(), item }
  writeJsonFile(path.resolve(dataDir, 'pending-transactions.json'), pending)
  const callback = resolvePaystackCallbackUrl(item, 'https://alphatekx.name.ng/dashboard')
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('Paystack secret key is not configured')
    // Dev mode: immediately redirect back with the reference for simulated verification
    return { authorization_url: `${callback}?reference=${encodeURIComponent(reference)}`, reference, credits, amount, source, provider: 'paystack', mock: true }
  }
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      amount,
      currency,
      reference,
      callback_url: callback,
      channels: ['card', 'bank', 'bank_transfer', 'ussd', 'mobile_money', 'opay'],
      metadata: {
        user_id: user.id,
        credits,
        source,
        currency,
        list_price_usd_cents: listPriceUsdCents,
        plan: isSubscription ? plan.id : (isEarlyFounder ? 'early_founder_19' : undefined),
        pack: !isSubscription ? (isEarlyFounder ? 'early_founder_19' : pack?.id) : undefined,
      },
    })
  })
  const data = await parsePaystackResponse(response, 'checkout initialization')
  if (!response.ok) throw new Error(data.message || 'Paystack initialization failed')
  if (!data.data?.authorization_url) throw new Error('Paystack did not return a checkout URL')
  return { authorization_url: data.data.authorization_url, reference, credits, amount, source, provider: 'paystack' }
}

async function verifyPaystack(reference, config) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('Paystack secret key is not configured')
  if (!secret) {
    // Dev mode: trust the pending reference and complete the purchase
    const pending = readJsonFile(path.resolve(dataDir, 'pending-transactions.json'), {})
    const pendingRecord = pending[reference]
    if (!pendingRecord) return { ok: false, reference, message: 'Payment reference not found' }
    const source = pendingRecord.source
    const planId = source.startsWith('subscription_') ? source.replace('subscription_', '') : null
    const packId = source.startsWith('credits_') ? source.replace('credits_', '') : null
    const user = { id: pendingRecord.userId, email: pendingRecord.email || '' }
    const credits = Number(pendingRecord.credits || 0)
    let result
    if (planId) result = await setPlan(user, planId, config, { reference })
    else if (packId) {
      const pack = getCreditPack(packId)
      result = await addCredits(user, credits, config, { reference, type: 'purchase', reason: `Credit pack: ${pack?.label || packId}`, metadata: { packId, mock: true } })
    } else {
      result = await addCredits(user, credits, config, { reference, type: 'purchase', metadata: { source, mock: true } })
    }
    pendingRecord.status = 'completed'
    writeJsonFile(path.resolve(dataDir, 'pending-transactions.json'), pending)
    return { ok: true, reference, credits, balance: result.remaining, plan: result.plan, paidAt: nowIso(), provider: 'paystack', mock: true, amount: Number(pendingRecord.amount || 0) / 100, user }
  }
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } })
  const data = await parsePaystackResponse(response, 'payment verification')
  if (!response.ok || data.data?.status !== 'success') return { ok: false, reference, message: data.message || 'Payment not successful' }
  const pending = readJsonFile(path.resolve(dataDir, 'pending-transactions.json'), {})
  const pendingRecord = pending[reference]
  const meta = data.data?.metadata || pendingRecord?.item || {}
  const customerEmail = String(data.data?.customer?.email || pendingRecord?.email || '').trim().toLowerCase()
  const userId = data.data?.metadata?.user_id || pendingRecord?.userId
  const source = String(data.data?.metadata?.source || pendingRecord?.source || '')
  const planId = data.data?.metadata?.plan || meta?.planId || (source.startsWith('subscription_') ? source.replace('subscription_', '') : null)
  const packId = data.data?.metadata?.pack || meta?.packId || (source.startsWith('credits_') ? source.replace('credits_', '') : null)
  const credits = Number(data.data?.metadata?.credits || pendingRecord?.credits || 0)
  const isEarlyFounder = String(data.data?.metadata?.plan || '').toLowerCase() === 'early_founder_19' || String(packId || '').toLowerCase() === 'early_founder_19'
  let user = { id: userId || '', email: customerEmail }
  if (!user.id && customerEmail) {
    const matched = await findUserByEmail(customerEmail, config)
    if (matched?.id) user = { id: matched.id, email: matched.email || customerEmail }
  }
  if (!user.id || !credits) return { ok: false, reference, message: 'Missing payment metadata or user record' }

  const expectedItem = planId
    ? getPlan(planId)
    : (isEarlyFounder ? getCreditPack('early_founder_19') : getCreditPack(packId))
  if (!expectedItem) return { ok: false, reference, message: 'Payment product is not recognized by AlphaTekx' }
  const expectedCharge = isEarlyFounder
    ? { amount: 3_040_000, currency: 'NGN' }
    : resolvePaystackCharge(planId
      ? { priceKobo: expectedItem.priceKobo, currency: expectedItem.currency }
      : { amountKobo: expectedItem.amountKobo, currency: expectedItem.currency })
  if (String(data.data?.currency || '').toUpperCase() !== expectedCharge.currency || Number(data.data?.amount) !== Number(expectedCharge.amount)) {
    return { ok: false, reference, message: 'Payment amount or currency does not match the selected AlphaTekx product' }
  }
  const expectedCredits = Number(planId ? expectedItem.monthlyCredits : expectedItem.credits)
  if (credits !== expectedCredits) return { ok: false, reference, message: 'Payment credit metadata does not match the selected AlphaTekx product' }
  if (pendingRecord) {
    pendingRecord.userId = user.id
    pendingRecord.email = user.email || pendingRecord.email || customerEmail
    writeJsonFile(path.resolve(dataDir, 'pending-transactions.json'), pending)
  }
  const durablePlan = planId || (isEarlyFounder ? 'early_founder_19' : 'credits')
  const result = await completeVerifiedPurchase(user, reference, Number(data.data?.amount), expectedCredits, durablePlan, config)
  if (pendingRecord) { pendingRecord.status = 'completed'; writeJsonFile(path.resolve(dataDir, 'pending-transactions.json'), pending) }
  try {
    await writeProfile(user, config, { last_payment_at: nowIso() })
  } catch {}
  const paidAt = data.data.paid_at || nowIso()
  return { ok: true, reference, credits: expectedCredits, balance: result.remaining, plan: result.plan || durablePlan, paidAt, provider: 'paystack', amount: Number(data.data?.amount || 0) / 100, user, duplicate: result.duplicate === true }
}

export async function recoverRecentPaystackPurchases(user, config) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) throw new Error('Paystack is not configured')
  if (!user?.id || !userEmail(user)) throw new Error('Authentication required')
  const from = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
  const response = await fetch(`https://api.paystack.co/transaction?status=success&perPage=50&from=${encodeURIComponent(from)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  const payload = await parsePaystackResponse(response, 'payment recovery')
  if (!response.ok || payload.status !== true) throw new Error(payload.message || 'Paystack payment recovery failed')
  const email = userEmail(user)
  const matches = (Array.isArray(payload.data) ? payload.data : [])
    .filter(transaction => {
      const metadata = transaction?.metadata || {}
      const source = String(metadata.source || '')
      const belongsToUser = String(metadata.user_id || '') === String(user.id) || normalizedEmail(transaction?.customer?.email) === email
      return belongsToUser && /^(credits_|subscription_)/.test(source) && transaction?.status === 'success' && transaction?.reference
    })
    .slice(0, 10)
  const settled = []
  for (const transaction of matches) {
    const result = await verifyPaystack(String(transaction.reference), config)
    if (result.ok && !result.duplicate) settled.push({ reference: result.reference, credits: result.credits, balance: result.balance })
  }
  return { ok: true, recovered: settled.length, payments: settled, balance: await getUserCredits(user, config) }
}

export async function verifyPaystackWebhook(body, secret) {
  if (body.event !== 'charge.success') return null
  return body.data?.reference
}

registerPaymentProvider('paystack', { initialize: initializePaystack, verify: verifyPaystack, verifyWebhook: verifyPaystackWebhook })
