import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dataDir = path.resolve(root, 'data')
const uploadsDir = path.resolve(dataDir, 'uploads')

try { fs.mkdirSync(dataDir, { recursive: true }) } catch {}
try { fs.mkdirSync(uploadsDir, { recursive: true }) } catch {}

const customersFile = path.resolve(dataDir, 'customers.json')
const paymentsFile = path.resolve(dataDir, 'payments.json')
const memoryFile = path.resolve(dataDir, 'memory.json')
const goalsFile = path.resolve(dataDir, 'goals.json')
const healingFile = path.resolve(dataDir, 'healing.json')
const predictionsFile = path.resolve(dataDir, 'predictions.json')

function readJsonFile(file, defaultValue) {
  try {
    if (!fs.existsSync(file)) return defaultValue
    const data = fs.readFileSync(file, 'utf8')
    return data ? JSON.parse(data) : defaultValue
  } catch { return defaultValue }
}

function writeJsonFile(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
    return true
  } catch { return false }
}

function serviceHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

function nowIso() { return new Date().toISOString() }

function stripSecrets(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(stripSecrets)
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof k === 'string' && /token|key|secret|password|authorization/i.test(k)) continue
    out[k] = typeof v === 'object' ? stripSecrets(v) : v
  }
  return out
}

export function createAlphaBrain(deps) {
  const { currentOrLocalUser, getUser, supabaseConfig, json, readBody, callLLMJSON } = deps

  // ---------- local + Supabase generic store ----------

  function localList(file, userId, filterFn) {
    const all = readJsonFile(file, [])
    const mine = all.filter(r => r.user_id === userId || r.userId === userId)
    return filterFn ? mine.filter(filterFn) : mine
  }

  function localGet(file, id) {
    return readJsonFile(file, []).find(r => r.id === id) || null
  }

  function localUpsert(file, record) {
    const all = readJsonFile(file, [])
    const idx = all.findIndex(r => r.id === record.id)
    if (idx >= 0) all[idx] = record
    else all.unshift(record)
    writeJsonFile(file, all)
    return record
  }

  function localDelete(file, id) {
    const all = readJsonFile(file, []).filter(r => r.id !== id)
    writeJsonFile(file, all)
  }

  async function sbList(table, userId, query = '') {
    const c = supabaseConfig()
    if (!c.url || !c.service) return null
    const q = `user_id=eq.${encodeURIComponent(userId)}${query ? '&' + query : ''}&order=created_at.desc`
    const res = await fetch(`${c.url}/rest/v1/${table}?${q}`, { headers: serviceHeaders(c.service) })
    if (!res.ok) throw new Error(`Supabase ${table} list failed`)
    return res.json()
  }

  async function sbUpsert(table, data) {
    const c = supabaseConfig()
    if (!c.url || !c.service) return null
    const res = await fetch(`${c.url}/rest/v1/${table}?on_conflict=id`, {
      method: 'POST',
      headers: { ...serviceHeaders(c.service), Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`Supabase ${table} upsert failed`)
    const rows = await res.json().catch(() => [data])
    return rows?.[0] || data
  }

  async function sbDelete(table, id) {
    const c = supabaseConfig()
    if (!c.url || !c.service) return null
    const res = await fetch(`${c.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: serviceHeaders(c.service) })
    if (!res.ok) throw new Error(`Supabase ${table} delete failed`)
    return true
  }

  // ---------- customers ----------

  async function upsertCustomer(userId, input) {
    const id = input.id || randomUUID()
    const record = {
      id,
      user_id: userId,
      userId,
      name: String(input.name || '').trim(),
      email: String(input.email || '').trim().toLowerCase(),
      phone: String(input.phone || '').trim(),
      what_they_bought: String(input.what_they_bought || input.whatTheyBought || '').trim(),
      amount: Number(input.amount || 0),
      paid_at: input.paid_at || input.paidAt || nowIso(),
      refund_reason: String(input.refund_reason || input.refundReason || '').trim(),
      metadata: stripSecrets(input.metadata || {}),
      created_at: input.created_at || nowIso(),
      updated_at: nowIso(),
    }
    const local = localUpsert(customersFile, record)
    try { await sbUpsert('customers', stripSecrets(record)) } catch {}
    return local
  }

  async function listCustomers(userId) {
    try {
      const rows = await sbList('customers', userId)
      if (rows) return rows
    } catch {}
    return localList(customersFile, userId)
  }

  async function getCustomer(userId, id) {
    const all = await listCustomers(userId)
    return all.find(r => r.id === id) || null
  }

  // ---------- payments ----------

  async function addPayment(userId, input) {
    const id = input.id || randomUUID()
    const record = {
      id,
      user_id: userId,
      userId,
      customer_id: input.customer_id || input.customerId || null,
      amount: Number(input.amount || 0),
      status: String(input.status || 'completed'),
      reference: String(input.reference || '').trim(),
      refund_reason: String(input.refund_reason || input.refundReason || '').trim(),
      metadata: stripSecrets(input.metadata || {}),
      paid_at: input.paid_at || input.paidAt || nowIso(),
      created_at: input.created_at || nowIso(),
    }
    const local = localUpsert(paymentsFile, record)
    try { await sbUpsert('payments', stripSecrets(record)) } catch {}
    await syncGoalProgress(userId)
    return local
  }

  async function listPayments(userId) {
    try {
      const rows = await sbList('payments', userId)
      if (rows) return rows
    } catch {}
    return localList(paymentsFile, userId)
  }

  // ---------- memory ----------

  async function logMemory(userId, event) {
    const id = event.id || randomUUID()
    const category = String(event.category || event.event_type || event.eventType || 'note').toLowerCase().replace(/\s+/g, '_')
    const record = {
      id,
      user_id: userId,
      userId,
      customer_id: event.customer_id || event.customerId || null,
      event_type: category,
      category,
      pinned: !!event.pinned,
      summary: String(event.summary || event.note || event.content || '').slice(0, 2000),
      source_workflow_id: String(event.source_workflow_id || event.sourceWorkflowId || '').slice(0, 100),
      metadata: stripSecrets(event.metadata || {}),
      created_at: event.created_at || nowIso(),
    }
    const local = localUpsert(memoryFile, record)
    try { await sbUpsert('alpha_memory', stripSecrets(record)) } catch {}
    return local
  }

  async function updateMemory(userId, id, patch) {
    const all = readJsonFile(memoryFile, [])
    const idx = all.findIndex(r => r.id === id && (r.user_id === userId || r.userId === userId))
    if (idx < 0) throw new Error('Memory not found')
    const current = all[idx]
    const next = { ...current }
    if (patch.summary != null) next.summary = String(patch.summary).slice(0, 2000)
    if (patch.category != null || patch.event_type != null) {
      const category = String(patch.category || patch.event_type || current.event_type || 'note').toLowerCase().replace(/\s+/g, '_')
      next.category = category
      next.event_type = category
    }
    if (patch.pinned != null) next.pinned = !!patch.pinned
    if (patch.metadata != null) next.metadata = stripSecrets(patch.metadata)
    next.updated_at = nowIso()
    all[idx] = next
    writeJsonFile(memoryFile, all)
    try { await sbUpsert('alpha_memory', stripSecrets(next)) } catch {}
    return next
  }

  async function deleteMemory(userId, id) {
    const all = readJsonFile(memoryFile, []).filter(r => !(r.id === id && (r.user_id === userId || r.userId === userId)))
    writeJsonFile(memoryFile, all)
    try { await sbDelete('alpha_memory', id) } catch {}
    return { id, deleted: true }
  }

  async function listMemory(userId, filters = {}) {
    try {
      let query = ''
      if (filters.event_type || filters.category) query += `&event_type=eq.${encodeURIComponent(String(filters.event_type || filters.category).toLowerCase().replace(/\s+/g, '_'))}`
      const rows = await sbList('alpha_memory', userId, query)
      if (rows) return rows
    } catch {}
    return localList(memoryFile, userId, r => {
      if (filters.event_type && r.event_type !== filters.event_type) return false
      if (filters.category && r.category !== filters.category) return false
      if (filters.query) {
        const q = filters.query.toLowerCase()
        const text = `${r.summary || ''} ${JSON.stringify(r.metadata || {})}`.toLowerCase()
        return text.includes(q)
      }
      return true
    })
  }

  async function answerMemoryQuery(userId, question) {
    const [memories, customers, payments] = await Promise.all([listMemory(userId, { query: question }), listCustomers(userId), listPayments(userId)])
    const q = question.toLowerCase()
    const relevantCustomers = customers.filter(c => `${c.name || ''} ${c.email || ''} ${c.what_they_bought || ''} ${c.refund_reason || ''}`.toLowerCase().includes(q.replace(/who is|why did|what did|and|the|we|did|him|her/g, ' ').trim()) || q.includes(String(c.name || '').toLowerCase()))
    const relevantPayments = payments.filter(p => `${p.reference || ''} ${p.status || ''}`.toLowerCase().includes(q) || (p.customer_id && relevantCustomers.some(c => c.id === p.customer_id)))
    const combined = [
      ...memories.slice(0, 10),
      ...relevantCustomers.slice(0, 5).map(c => ({ id: c.id, event_type: 'customer', summary: `${c.name}${c.email ? ` (${c.email})` : ''} bought ${c.what_they_bought || 'something'} for ₦${Number(c.amount).toLocaleString()}${c.refund_reason ? `. Refund reason: ${c.refund_reason}` : ''}`, created_at: c.paid_at || c.created_at, metadata: c })),
      ...relevantPayments.slice(0, 5).map(p => ({ id: p.id, event_type: 'payment', summary: `Payment ${p.reference || p.id.slice(0,8)} for ₦${Number(p.amount).toLocaleString()} — ${p.status}`, created_at: p.paid_at || p.created_at, metadata: p })),
    ]
    if (!combined.length) {
      return { answer: "I don't have any memory records matching that. Once your workflows run, I'll be able to answer questions like this.", sources: [] }
    }
    const context = combined.map((m, i) => `${i + 1}. [${m.event_type}] ${new Date(m.created_at).toLocaleString()}: ${m.summary}${m.metadata ? ' ' + JSON.stringify(stripSecrets(m.metadata)) : ''}`).join('\n')
    const prompt = `You are Alpha, a helpful business assistant with long-term memory. The user asked: "${question}". Here are the relevant memory, customer, and payment records:\n${context}\n\nAnswer the question using the records. Cite dates, amounts, names, and sources. If the answer is not in the records, say so. Return JSON: { answer: string, sources: array of { event_type, summary, created_at } }.`
    try {
      const result = await callLLMJSON('You answer from provided memory records only. Always return valid JSON.', prompt)
      if (result && typeof result.answer === 'string') return { answer: result.answer, sources: result.sources || [] }
    } catch {}
    // Fallback keyword summary
    const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3).map(w => w.replace(/[.,?!]/g, ''))
    const best = combined.filter(m => keywords.some(k => `${m.summary || ''} ${JSON.stringify(m.metadata || {})}`.toLowerCase().includes(k)))
    const top = best.length ? best : combined
    const summary = top.slice(0, 5).map(m => `From your ${m.event_type} records on ${new Date(m.created_at).toLocaleString()}: ${m.summary}`).join('. ')
    return { answer: `Based on your memory: ${summary}`, sources: top.slice(0, 5) }
  }

  // ---------- goals ----------

  function inferGoalType(goalText) {
    const t = String(goalText || '').toLowerCase()
    if (t.includes('naira') || t.includes('revenue') || t.includes('sales') || t.includes('income') || t.includes('money')) return 'revenue'
    if (t.includes('lead') || t.includes('signup') || t.includes('subscriber') || t.includes('customer')) return 'leads'
    if (t.includes('response') || t.includes('reply') || t.includes('minute') || t.includes('hour')) return 'response_time'
    if (t.includes('post') || t.includes('content') || t.includes('publish')) return 'content'
    return 'custom'
  }

  async function createGoal(userId, input) {
    const id = input.id || randomUUID()
    const goalText = String(input.goal_text || input.goal || '').trim()
    if (!goalText) throw new Error('Goal description is required')
    const target = Number(input.target_value || input.target || 0)
    if (!target) throw new Error('Target value is required')
    const deadline = input.deadline ? new Date(input.deadline).toISOString() : null
    const record = {
      id,
      user_id: userId,
      userId,
      goal_text: goalText,
      target_value: target,
      current_value: Number(input.current_value || input.current || 0),
      deadline,
      progress_percent: 0,
      required_workflows: input.required_workflows || input.requiredWorkflows || [],
      status: 'active',
      metadata: stripSecrets(input.metadata || {}),
      type: inferGoalType(goalText),
      created_at: input.created_at || nowIso(),
      updated_at: nowIso(),
    }
    const local = localUpsert(goalsFile, record)
    try { await sbUpsert('goals', stripSecrets(record)) } catch {}
    await syncGoalProgress(userId)
    return local
  }

  async function listGoals(userId) {
    try {
      const rows = await sbList('goals', userId)
      if (rows) return rows
    } catch {}
    return localList(goalsFile, userId)
  }

  async function updateGoal(userId, id, patch) {
    const goals = readJsonFile(goalsFile, [])
    const idx = goals.findIndex(g => g.id === id && (g.user_id === userId || g.userId === userId))
    if (idx < 0) throw new Error('Goal not found')
    const current = goals[idx]
    const next = { ...current, ...patch, updated_at: nowIso() }
    if (patch.current_value != null || patch.current != null) {
      next.current_value = Number(patch.current_value ?? patch.current ?? current.current_value)
      next.progress_percent = Math.min(100, Math.max(0, Math.round((next.current_value / next.target_value) * 100)))
    }
    goals[idx] = next
    writeJsonFile(goalsFile, goals)
    try { await sbUpsert('goals', stripSecrets(next)) } catch {}
    return next
  }

  async function syncGoalProgress(userId) {
    const goals = readJsonFile(goalsFile, []).filter(g => g.user_id === userId || g.userId === userId)
    if (!goals.length) return
    const payments = readJsonFile(paymentsFile, []).filter(p => p.user_id === userId || p.userId === userId)
    const customers = readJsonFile(customersFile, []).filter(c => c.user_id === userId || c.userId === userId)
    const memory = readJsonFile(memoryFile, []).filter(m => m.user_id === userId || m.userId === userId)
    const today = new Date().toISOString()

    for (const goal of goals) {
      if (goal.status !== 'active') continue
      let current = goal.current_value || 0
      const type = goal.type || inferGoalType(goal.goal_text)
      if (type === 'revenue') {
        current = payments.reduce((s, p) => s + (p.status === 'refunded' ? 0 : Number(p.amount || 0)), 0)
      } else if (type === 'leads') {
        current = customers.length
      } else if (type === 'response_time') {
        const responseEvents = memory.filter(m => m.event_type === 'response')
        if (responseEvents.length) {
          current = responseEvents.reduce((s, m) => s + Number(m.metadata?.minutes || 0), 0) / responseEvents.length
        }
      } else if (type === 'content') {
        current = memory.filter(m => m.event_type === 'post').length
      }
      const progress = Math.min(100, Math.max(0, Math.round((current / goal.target_value) * 100)))
      goal.current_value = current
      goal.progress_percent = progress
      goal.updated_at = today
      if (goal.deadline && new Date(goal.deadline) < new Date() && progress < 100) goal.status = 'behind'
      if (progress >= 100) goal.status = 'completed'
    }
    writeJsonFile(goalsFile, readJsonFile(goalsFile, []).map(g => (g.user_id === userId || g.userId === userId) ? goals.find(x => x.id === g.id) || g : g))
    try {
      for (const goal of goals) await sbUpsert('goals', stripSecrets(goal))
    } catch {}
  }

  async function goalReport(userId, goalId) {
    const goals = await listGoals(userId)
    const goal = goals.find(g => g.id === goalId)
    if (!goal) throw new Error('Goal not found')
    const remaining = Math.max(0, goal.target_value - goal.current_value)
    const daysLeft = goal.deadline ? Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null
    const pace = daysLeft ? (remaining / daysLeft).toFixed(2) : null
    const status = goal.progress_percent >= 100 ? 'completed' : goal.status === 'behind' ? 'behind' : 'on_track'
    return {
      goal,
      summary: `Goal: ${goal.goal_text}. Current: ${goal.current_value}/${goal.target_value} (${goal.progress_percent}%).${remaining ? ` Remaining: ${remaining}.` : ''}${daysLeft ? ` ${daysLeft} days left${pace ? `; need ~${pace} per day` : ''}.` : ''}`,
      status,
      recommendedActions: goal.required_workflows || [],
    }
  }

  // ---------- self healing ----------

  async function recordHealing(userId, agentId, errorPattern, attemptedFix, result = 'pending') {
    const id = randomUUID()
    const record = {
      id,
      user_id: userId,
      userId,
      agent_id: agentId,
      error_pattern: String(errorPattern || '').slice(0, 500),
      attempted_fix: String(attemptedFix || '').slice(0, 500),
      result: String(result).slice(0, 50),
      retries: 1,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    const all = readJsonFile(healingFile, [])
    const existing = all.find(h => (h.user_id === userId || h.userId === userId) && h.agent_id === agentId && h.error_pattern === record.error_pattern)
    if (existing) {
      existing.retries = (existing.retries || 0) + 1
      existing.attempted_fix = record.attempted_fix
      existing.updated_at = nowIso()
      writeJsonFile(healingFile, all)
      try { await sbUpsert('self_healing_logs', stripSecrets(existing)) } catch {}
      return existing
    }
    all.unshift(record)
    writeJsonFile(healingFile, all)
    try { await sbUpsert('self_healing_logs', stripSecrets(record)) } catch {}
    return record
  }

  async function listHealing(userId) {
    try {
      const rows = await sbList('self_healing_logs', userId)
      if (rows) return rows
    } catch {}
    return localList(healingFile, userId)
  }

  function suggestFix(errorMessage, connector) {
    const msg = String(errorMessage || '').toLowerCase()
    if (msg.includes('token') || msg.includes('expired') || msg.includes('unauthorized') || msg.includes('invalid credentials')) return `Refresh or reconnect your ${connector} account in Connectors.`
    if (msg.includes('rate limit') || msg.includes('too many requests')) return `Wait and retry with slower scheduling.`
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('econnrefused')) return `Check your network connection and retry.`
    if (msg.includes('missing') || msg.includes('required field')) return `Open the agent and fill the missing field.`
    if (msg.includes('duplicate')) return `The record already exists; workflow paused to avoid duplicates.`
    return `Review the ${connector} connection and agent settings.`
  }

  async function selfHealCheck(userId, agentId, errorMessage, connector) {
    const healing = await recordHealing(userId, agentId, errorMessage, suggestFix(errorMessage, connector), 'pending')
    if (healing.retries >= 3) return { healed: false, fix: healing.attempted_fix, message: 'Max retries reached. Manual fix needed.' }
    // Token-based auto-heal attempts are connector-specific and currently logged for user action.
    return { healed: false, fix: healing.attempted_fix, retries: healing.retries, message: `Issue logged. Suggested fix: ${healing.attempted_fix}` }
  }

  // ---------- predictions ----------

  async function generatePredictions(userId) {
    const payments = readJsonFile(paymentsFile, []).filter(p => p.user_id === userId || p.userId === userId)
    const memory = readJsonFile(memoryFile, []).filter(m => m.user_id === userId || m.userId === userId)
    const goals = readJsonFile(goalsFile, []).filter(g => g.user_id === userId || g.userId === userId)
    const user = await getUser(userId, '')
    const credits = user?.credits || 0

    const today = new Date()
    const last14 = memory.filter(m => new Date(m.created_at) >= new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000))
    const creditEvents = last14.filter(m => m.event_type === 'credit_spend' || m.event_type === 'spend')
    const dailySpend = creditEvents.length ? creditEvents.reduce((s, m) => s + Number(m.metadata?.credits || 1), 0) / 14 : 0
    const daysLeft = dailySpend > 0 ? Math.floor(credits / dailySpend) : null

    const newPredictions = []
    if (dailySpend > 0 && daysLeft !== null && daysLeft <= 7) {
      newPredictions.push({ type: 'credit_prediction', title: 'Credits running low', description: `You use about ${dailySpend.toFixed(1)} credits/day. At this pace you will run out in ${daysLeft} day(s). Top up?`, severity: daysLeft <= 2 ? 'warning' : 'info' })
    }

    const paystackEvents = last14.filter(m => m.event_type === 'payment')
    const dailyPayments = paystackEvents.length ? paystackEvents.length / 14 : 0
    const todayPayments = paystackEvents.filter(m => new Date(m.created_at).toDateString() === today.toDateString()).length
    if (dailyPayments > 0 && todayPayments < dailyPayments * 0.5) {
      newPredictions.push({ type: 'anomaly', title: 'Payment activity dropped', description: `You normally get ~${dailyPayments.toFixed(1)} payments/day. Today you have ${todayPayments}. Check your payment page or follow up.`, severity: 'warning' })
    }

    const responseEvents = memory.filter(m => m.event_type === 'response')
    if (responseEvents.length >= 3) {
      const avgRecent = responseEvents.slice(-7).reduce((s, m) => s + Number(m.metadata?.minutes || 0), 0) / responseEvents.slice(-7).length
      const avgOlder = responseEvents.slice(-14, -7).reduce((s, m) => s + Number(m.metadata?.minutes || 0), 0) / Math.max(1, responseEvents.slice(-14, -7).length)
      if (avgRecent > avgOlder * 1.5) {
        newPredictions.push({ type: 'business_prediction', title: 'Response time slowing', description: `Average response time went from ${avgOlder.toFixed(1)} to ${avgRecent.toFixed(1)} minutes. Sales may drop if this continues.`, severity: 'warning' })
      }
    }

    const customers = readJsonFile(customersFile, []).filter(c => c.user_id === userId || c.userId === userId)
    const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    const twoMonthsAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000)
    const boughtLastMonth = customers.filter(c => c.paid_at && new Date(c.paid_at) >= oneMonthAgo).length
    const boughtTwoMonthsAgo = customers.filter(c => c.paid_at && new Date(c.paid_at) >= twoMonthsAgo && new Date(c.paid_at) < oneMonthAgo).length
    if (boughtTwoMonthsAgo > boughtLastMonth) {
      const atRisk = boughtTwoMonthsAgo - boughtLastMonth
      newPredictions.push({ type: 'opportunity', title: 'Re-engage past customers', description: `You have ${atRisk} customer(s) who bought 30-60 days ago but not in the last 30 days. Want me to start a re-engagement campaign?`, severity: 'info' })
    }

    const behindGoals = goals.filter(g => g.status === 'behind' || (g.progress_percent < 50 && g.deadline && new Date(g.deadline) < new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)))
    for (const goal of behindGoals) {
      newPredictions.push({ type: 'goal', title: `Goal behind: ${goal.goal_text}`, description: `${goal.progress_percent}% complete with deadline approaching. Activate your ${(goal.required_workflows || []).join(', ') || 'workflows'}?`, severity: 'warning' })
    }

    if (newPredictions.length === 0) {
      newPredictions.push({ type: 'info', title: 'All systems normal', description: 'No anomalies detected. I will keep watching.', severity: 'info' })
    }

    const all = readJsonFile(predictionsFile, [])
    const next = all.filter(p => p.user_id !== userId && p.userId !== userId)
    for (const p of newPredictions) {
      next.unshift({ id: randomUUID(), user_id: userId, userId, ...p, dismissed: false, created_at: nowIso() })
    }
    writeJsonFile(predictionsFile, next.slice(0, 500))
    try {
      for (const p of newPredictions) await sbUpsert('predictions', stripSecrets({ id: p.id || randomUUID(), user_id: userId, userId, ...p, dismissed: false, created_at: nowIso() }))
    } catch {}
    return newPredictions
  }

  async function listPredictions(userId) {
    try {
      const rows = await sbList('predictions', userId, 'dismissed=eq.false')
      if (rows) return rows
    } catch {}
    return readJsonFile(predictionsFile, []).filter(p => (p.user_id === userId || p.userId === userId) && !p.dismissed).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }

  async function dismissPrediction(userId, id) {
    const all = readJsonFile(predictionsFile, [])
    const idx = all.findIndex(p => p.id === id && (p.user_id === userId || p.userId === userId))
    if (idx >= 0) {
      all[idx].dismissed = true
      all[idx].updated_at = nowIso()
      writeJsonFile(predictionsFile, all)
    }
    try {
      const c = supabaseConfig()
      if (c.url && c.service) {
        await fetch(`${c.url}/rest/v1/predictions?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: serviceHeaders(c.service), body: JSON.stringify({ dismissed: true, updated_at: nowIso() }) })
      }
    } catch {}
    return { dismissed: true }
  }

  // ---------- voice ----------

  async function processVoice(userId, body) {
    const transcript = String(body.transcript || body.text || '').trim()
    const audio = body.audio || body.file
    let savedAudio = null
    if (audio && String(audio).startsWith('data:')) {
      const match = audio.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        const mime = match[1]
        const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp3') ? 'mp3' : 'webm'
        const buf = Buffer.from(match[2], 'base64')
        const filename = `voice-${randomUUID()}.${ext}`
        const filePath = path.resolve(uploadsDir, filename)
        fs.writeFileSync(filePath, buf)
        savedAudio = `/uploads/${filename}`
      }
    }
    if (!transcript && !savedAudio) return { intent: 'none', summary: 'No audio or transcript received.' }
    if (!transcript) {
      return { intent: 'voice_received', summary: 'Voice note saved. Transcription engine is not configured; please paste the transcript or connect Whisper.', audio: savedAudio }
    }
    const lower = transcript.toLowerCase()
    let intent = 'general'
    if (/(post|publish|schedule|content|social)/.test(lower)) intent = 'content_employee'
    else if (/(email|send|message|follow up|follow-up)/.test(lower)) intent = 'messaging'
    else if (/(pay|payment|refund|customer|who|why)/.test(lower)) intent = 'memory_query'
    else if (/(goal|target|make|revenue|lead)/.test(lower)) intent = 'goal'
    else if (/(build|create|app|website)/.test(lower)) intent = 'builder'

    const platforms = []
    if (lower.includes('facebook')) platforms.push('facebook')
    if (lower.includes('linkedin')) platforms.push('linkedin')
    if (lower.includes('x ') || lower.includes('twitter')) platforms.push('x')
    if (lower.includes('whatsapp')) platforms.push('whatsapp')
    if (lower.includes('telegram')) platforms.push('telegram')
    if (lower.includes('slack')) platforms.push('slack')
    if (lower.includes('discord')) platforms.push('discord')

    const frequencyMatch = lower.match(/every\s+((morning|evening|night|day|week|month|[0-9]+\s*(minutes?|hours?)))/)
    const frequency = frequencyMatch ? frequencyMatch[0] : 'one-time'

    return {
      intent,
      transcript,
      command: transcript,
      platforms,
      frequency,
      summary: `Heard: "${transcript}". Intent: ${intent}. Platforms: ${platforms.join(', ') || 'none'}.`,
      requiresApproval: ['post', 'publish', 'send', 'charge', 'pay'].some(k => lower.includes(k)),
      audio: savedAudio,
    }
  }

  // ---------- vision ----------

  async function processVision(userId, body) {
    const image = body.image || body.url || ''
    if (!image) throw new Error('No image or URL provided')
    let savedImage = null
    let mime = 'image/png'
    let base64 = ''
    if (String(image).startsWith('data:')) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/)
      if (match) { mime = match[1]; base64 = match[2] }
    } else if (/^https?:\/\//.test(image)) {
      savedImage = image
      try {
        const res = await fetch(image)
        const buf = Buffer.from(await res.arrayBuffer())
        base64 = buf.toString('base64')
        mime = res.headers.get('content-type') || 'image/png'
      } catch {}
    } else {
      base64 = image
      mime = body.mime || 'image/png'
    }
    if (!savedImage && base64) {
      const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'webp'
      const filename = `vision-${randomUUID()}.${ext}`
      const filePath = path.resolve(uploadsDir, filename)
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
      savedImage = `/uploads/${filename}`
    }

    const c = supabaseConfig()
    const openaiKey = c.openai || process.env.OPENAI_API_KEY || ''
    let extractedText = ''
    let documentType = 'image'
    let suggestedAction = ''

    if (openaiKey && base64) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You extract document data. Return JSON with document_type, extracted_text (all text), and suggested_action (one sentence).' },
              { role: 'user', content: [{ type: 'text', text: 'Extract all text and identify the document type. Return JSON only.' }, { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }] },
            ],
            response_format: { type: 'json_object' },
          }),
        })
        const data = await res.json()
        const content = String(data.choices?.[0]?.message?.content || '{}')
        const parsed = JSON.parse(content.replace(/```json\s*|```/gi, '').trim())
        extractedText = String(parsed.extracted_text || parsed.text || '')
        documentType = String(parsed.document_type || parsed.documentType || 'image')
        suggestedAction = String(parsed.suggested_action || parsed.suggestedAction || '')
      } catch (err) { /* fall through */ }
    }

    if (!extractedText) {
      return { image: savedImage, documentType: 'unknown', extractedText: '', suggestedAction: 'I can see the image but no OCR/vision API is configured. Tell me what to do with it or connect OpenAI for automatic extraction.' }
    }

    const finalSuggested = suggestedAction || (documentType.includes('invoice') ? 'Save to payments and create a reminder to pay.' : documentType.includes('receipt') ? 'Log as a payment record.' : documentType.includes('contact') || documentType.includes('flyer') ? 'Extract contacts and create a lead.' : 'What would you like me to do with this?')
    return { image: savedImage, documentType, extractedText: extractedText.slice(0, 4000), suggestedAction: finalSuggested }
  }

  // ---------- route handler ----------

  async function handler(req, res) {
    const config = supabaseConfig()
    const user = await currentOrLocalUser(req, config.url, config.anon)
    if (!user) return json(res, 401, { error: 'Authentication required' })
    const url = new URL(req.url || '/', 'http://localhost')
    const segments = url.pathname.replace(/^\/api\/brain\/?/, '').split('/').filter(Boolean)
    const resource = segments[0] || ''
    const id = segments[1] || ''

    try {
      if (req.method === 'GET' && resource === 'memory') {
        const query = url.searchParams.get('query') || ''
        const event_type = url.searchParams.get('event_type') || ''
        if (query) return json(res, 200, await answerMemoryQuery(user.id, query))
        return json(res, 200, { memories: await listMemory(user.id, { query, event_type }) })
      }
      if (req.method === 'POST' && resource === 'memory' && segments[1] === 'ask') {
        const body = await readBody(req)
        return json(res, 200, await answerMemoryQuery(user.id, String(body.question || body.query || '')))
      }
      if (req.method === 'POST' && resource === 'memory' && segments[1] === 'clear') {
        const all = readJsonFile(memoryFile, []).filter(r => !(r.user_id === user.id || r.userId === user.id))
        writeJsonFile(memoryFile, all)
        try {
          const c = supabaseConfig()
          if (c.url && c.service) await fetch(`${c.url}/rest/v1/alpha_memory?user_id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: serviceHeaders(c.service) })
        } catch {}
        return json(res, 200, { cleared: true })
      }
      if (req.method === 'POST' && resource === 'memory') {
        const body = await readBody(req)
        const record = await logMemory(user.id, body)
        return json(res, 201, record)
      }
      if (req.method === 'PATCH' && resource === 'memory' && id) {
        const body = await readBody(req)
        const record = await updateMemory(user.id, id, body)
        return json(res, 200, record)
      }
      if (req.method === 'DELETE' && resource === 'memory' && id) {
        return json(res, 200, await deleteMemory(user.id, id))
      }

      if (req.method === 'GET' && resource === 'customers') {
        return json(res, 200, { customers: await listCustomers(user.id) })
      }
      if (req.method === 'POST' && resource === 'customers') {
        const body = await readBody(req)
        return json(res, 201, await upsertCustomer(user.id, body))
      }

      if (req.method === 'GET' && resource === 'payments') {
        return json(res, 200, { payments: await listPayments(user.id) })
      }
      if (req.method === 'POST' && resource === 'payments') {
        const body = await readBody(req)
        return json(res, 201, await addPayment(user.id, body))
      }

      if (req.method === 'GET' && resource === 'goals') {
        if (id) return json(res, 200, await goalReport(user.id, id))
        return json(res, 200, { goals: await listGoals(user.id) })
      }
      if (req.method === 'POST' && resource === 'goals') {
        const body = await readBody(req)
        return json(res, 201, await createGoal(user.id, body))
      }
      if (req.method === 'PATCH' && resource === 'goals' && id) {
        const body = await readBody(req)
        return json(res, 200, await updateGoal(user.id, id, body))
      }
      if (req.method === 'POST' && resource === 'goals' && segments[1] === 'sync') {
        await syncGoalProgress(user.id)
        return json(res, 200, { goals: await listGoals(user.id) })
      }

      if (req.method === 'GET' && resource === 'self-heal') {
        return json(res, 200, { logs: await listHealing(user.id) })
      }
      if (req.method === 'POST' && resource === 'self-heal') {
        const body = await readBody(req)
        return json(res, 200, await selfHealCheck(user.id, String(body.agentId || ''), String(body.error || ''), String(body.connector || '')))
      }

      if (req.method === 'GET' && resource === 'predictions') {
        return json(res, 200, { predictions: await listPredictions(user.id) })
      }
      if (req.method === 'POST' && resource === 'predictions' && segments[1] === 'generate') {
        return json(res, 200, { predictions: await generatePredictions(user.id) })
      }
      if (req.method === 'POST' && resource === 'predictions' && id === 'dismiss') {
        const body = await readBody(req)
        return json(res, 200, await dismissPrediction(user.id, String(body.id || id)))
      }

      if (req.method === 'POST' && resource === 'voice') {
        const body = await readBody(req)
        return json(res, 200, await processVoice(user.id, body))
      }
      if (req.method === 'POST' && resource === 'vision') {
        const body = await readBody(req)
        return json(res, 200, await processVision(user.id, body))
      }

      return json(res, 404, { error: 'Brain route not found' })
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : 'Brain request failed' })
    }
  }

  return {
    handler,
    logMemory,
    upsertCustomer,
    addPayment,
    createGoal,
    updateGoal: updateGoal,
    syncGoalProgress,
    recordHealing,
    selfHealCheck,
    generatePredictions,
    processVoice,
    processVision,
  }
}
