import fs from 'node:fs'
import path from 'node:path'
import { createHmac, randomUUID } from 'node:crypto'

const adminEmail = 'iamdan4live@gmail.com'
const DEFAULT_CREDITS = 30
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

function serviceHeaders(serviceKey) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
}

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    priceKobo: 0,
    monthlyCredits: 0,
    maxActiveAutomations: 1,
    features: ['30 welcome credits (one-time)', '1 active automation', 'Basic automations', 'Execution history'],
  },
  pro_early_access: {
    id: 'pro_early_access',
    name: 'Pro Early Access',
    priceKobo: 350000,
    monthlyCredits: 500,
    maxActiveAutomations: 5,
    features: ['500 credits every month', 'Up to 5 active automations', 'Scheduled automations', 'Connected app support', 'Email notifications', 'Most Popular'],
    badge: 'Most Popular',
  },
}

export const CREDIT_PACKS = [
  { id: 'credits_100', credits: 100, amountKobo: 70000, label: '100 Credits', description: 'Top up for light usage' },
  { id: 'credits_500', credits: 500, amountKobo: 250000, label: '500 Credits', description: 'Best for regular automations' },
  { id: 'credits_1500', credits: 1500, amountKobo: 600000, label: '1,500 Credits', description: 'For creators and small teams' },
  { id: 'credits_5000', credits: 5000, amountKobo: 1750000, label: '5,000 Credits', description: 'High-volume automation' },
]

export function getPlan(id) { return PLANS[id] || PLANS.free }
export function getCreditPack(id) { return CREDIT_PACKS.find(p => p.id === id) }

function isAdmin(user) { return String(user?.email || '').toLowerCase() === adminEmail }

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
  if (!profile) profile = { id: user.id, email: user.email || '', credits: DEFAULT_CREDITS, plan: 'free' }
  const balance = readLocalBalance(user.id)
  const total = Number(profile.credits) || 0
  const monthly = Number(profile.monthly_credits ?? balance.monthly_credits) || 0
  const purchased = Number(profile.purchased_credits ?? balance.purchased_credits) || 0
  const totalSpent = Number(profile.total_credits_spent ?? balance.total_credits_spent) || 0
  // If split columns are missing, treat all credits as purchased so spending works
  const normalizedPurchased = (monthly === 0 && purchased === 0 && total > 0) ? total : purchased
  // Reset the erroneous 100-credit welcome default back to 30 for new free users who have not purchased or spent anything.
  if (!isAdmin(user) && String(profile.plan || 'free') === 'free' && monthly === 0 && purchased === 0 && totalSpent === 0 && total === 100) {
    await writeProfile(user, config, { credits: DEFAULT_CREDITS })
    return {
      ...profile,
      id: user.id,
      email: user.email || profile.email || local?.email || '',
      credits: DEFAULT_CREDITS,
      plan: 'free',
      monthly_credits: 0,
      purchased_credits: 0,
      monthly_credits_used: 0,
      total_credits_spent: 0,
      subscription_renews_at: profile.subscription_renews_at || balance.subscription_renews_at || null,
    }
  }
  return {
    id: user.id,
    email: user.email || profile.email || local?.email || '',
    credits: total,
    plan: String(profile.plan || 'free'),
    monthly_credits: monthly,
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

export async function getUserCredits(user, config) {
  if (isAdmin(user)) return Infinity
  const profile = await readProfile(user, config)
  if (!profile) return 0
  return Number(profile.credits) || 0
}

export async function getUserBilling(user, config) {
  if (isAdmin(user)) {
    return {
      credits: 1000000000,
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
  return all.some(t => t.user_id === userId && t.reference === reference && (t.type === 'purchase' || t.type === 'subscription' || t.type === 'plan_change'))
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
  await writeProfile(user, config, {
    plan: plan.id,
    credits: total,
    monthly_credits: monthly,
    monthly_credits_used: 0,
    subscription_renews_at: renewal.toISOString(),
  })
  await recordTransaction(user.id, { type: 'plan_change', creditsAdded: monthly, balanceAfter: total, reason: `Upgraded to ${plan.name}`, metadata: { plan: plan.id } })
  return { ok: true, remaining: total, plan: plan.id, renewalDate: renewal.toISOString() }
}

export async function canCreateAgent(user, config, activeCount) {
  if (isAdmin(user)) return { ok: true }
  const billing = await getUserBilling(user, config)
  const plan = getPlan(billing.plan)
  if (activeCount >= plan.maxActiveAutomations) return { ok: false, reason: `Your ${plan.name} plan supports up to ${plan.maxActiveAutomations} active automation${plan.maxActiveAutomations === 1 ? '' : 's'}.`, plan: plan.id }
  return { ok: true }
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
      await writeProfile(user, config, { credits: total, monthly_credits: plan.monthlyCredits, monthly_credits_used: 0, subscription_renews_at: nextRenew.toISOString() })
      await recordTransaction(userId, { type: 'subscription', creditsAdded: plan.monthlyCredits, balanceAfter: total, reason: `Monthly credits reset for ${plan.name}`, metadata: { plan: plan.id } })
      profilesToUpdate.push(userId)
    }
  }
  return profilesToUpdate.length
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

async function initializePaystack(user, item, config) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  const isSubscription = item.type === 'subscription'
  const pack = isSubscription ? null : getCreditPack(item.packId)
  const plan = isSubscription ? getPlan(item.planId) : null
  if (!isSubscription && !pack) throw new Error('Invalid credit pack')
  if (isSubscription && !plan) throw new Error('Invalid plan')
  const amount = isSubscription ? plan.priceKobo : pack.amountKobo
  const credits = isSubscription ? plan.monthlyCredits : pack.credits
  const source = isSubscription ? `subscription_${plan.id}` : `credits_${pack.id}`
  const email = String(user.email || '')
  const reference = `alphatekx_${source}_${user.id.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const pending = readJsonFile(path.resolve(dataDir, 'pending-transactions.json'), {})
  pending[reference] = { userId: user.id, email, credits, amount, source, status: 'pending', createdAt: nowIso(), item }
  writeJsonFile(path.resolve(dataDir, 'pending-transactions.json'), pending)
  const callback = String(process.env.PAYSTACK_CALLBACK_URL || `${publicAppUrl()}/settings`)
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('Paystack secret key is not configured')
    // Dev mode: immediately redirect back with the reference for simulated verification
    return { authorization_url: `${callback}?reference=${encodeURIComponent(reference)}`, reference, credits, amount, source, provider: 'paystack', mock: true }
  }
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, amount, reference, callback_url: callback, metadata: { user_id: user.id, credits, source, plan: isSubscription ? plan.id : undefined, pack: !isSubscription ? pack.id : undefined } })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Paystack initialization failed')
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
  const data = await response.json()
  if (!response.ok || data.data?.status !== 'success') return { ok: false, reference, message: data.message || 'Payment not successful' }
  const pending = readJsonFile(path.resolve(dataDir, 'pending-transactions.json'), {})
  const pendingRecord = pending[reference]
  const meta = data.data?.metadata || pendingRecord?.item || {}
  const userId = data.data?.metadata?.user_id || pendingRecord?.userId
  const source = String(data.data?.metadata?.source || pendingRecord?.source || '')
  const planId = data.data?.metadata?.plan || meta?.planId || (source.startsWith('subscription_') ? source.replace('subscription_', '') : null)
  const packId = data.data?.metadata?.pack || meta?.packId || (source.startsWith('credits_') ? source.replace('credits_', '') : null)
  const credits = Number(data.data?.metadata?.credits || pendingRecord?.credits || 0)
  if (!userId || !credits) return { ok: false, reference, message: 'Missing metadata' }
  const user = { id: userId, email: data.data.customer?.email || pendingRecord?.email || '' }
  let result
  if (planId) {
    result = await setPlan(user, planId, config, { reference })
  } else if (packId) {
    const pack = getCreditPack(packId)
    result = await addCredits(user, credits, config, { reference, type: 'purchase', reason: `Credit pack: ${pack?.label || packId}`, metadata: { packId, provider: 'paystack' } })
  } else {
    result = await addCredits(user, credits, config, { reference, type: 'purchase', metadata: { source, provider: 'paystack' } })
  }
  if (pendingRecord) { pendingRecord.status = 'completed'; writeJsonFile(path.resolve(dataDir, 'pending-transactions.json'), pending) }
  const paidAt = data.data.paid_at || nowIso()
  return { ok: true, reference, credits, balance: result.remaining, plan: result.plan, paidAt, provider: 'paystack', amount: Number(data.data?.amount || 0) / 100, user }
}

export async function verifyPaystackWebhook(body, secret) {
  if (body.event !== 'charge.success') return null
  return body.data?.reference
}

registerPaymentProvider('paystack', { initialize: initializePaystack, verify: verifyPaystack, verifyWebhook: verifyPaystackWebhook })
