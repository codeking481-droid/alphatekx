// Telegram V1 — Native Provider
// One official AlphaTekX bot. No user-supplied tokens.
// Uses telegram_chat_bindings table for secure user-chat linking.
// Uses feature_flags table for beta gating.

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

const ADMIN_EMAIL = 'iamdan4live@gmail.com'

// ─── State Token ──────────────────────────────────────────────────────
// Format: base64url({ userId, email, nonce, expires }).base64url(HMAC)

function stateSecret() {
  return process.env.TELEGRAM_CONNECTION_STATE_SECRET || process.env.API_KEY_ENCRYPTION_KEY || 'telegram-v1-dev-secret'
}

function encryptState(payload) {
  const key = createHmac('sha256', stateSecret()).digest()
  const json = JSON.stringify(payload)
  const iv = randomBytes(12)
  const cipher = createHmac('sha256', key).update(json).digest('base64url')
  const body = Buffer.from(json).toString('base64url')
  return `${body}.${cipher}`
}

function decryptState(value) {
  const [body, signature] = String(value || '').split('.')
  if (!body || !signature) throw new Error('Invalid connection state')
  const key = createHmac('sha256', stateSecret()).digest()
  const expected = createHmac('sha256', key).update(Buffer.from(body, 'base64url')).digest()
  const received = Buffer.from(signature, 'base64url')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error('Invalid connection state')
  }
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
}

export function createConnectionState(userId, email) {
  const payload = {
    userId,
    email,
    nonce: randomBytes(16).toString('hex'),
    expires: Date.now() + 5 * 60 * 1000, // 5 min expiry
  }
  return encryptState(payload)
}

export function verifyConnectionState(value) {
  const parsed = decryptState(value)
  if (!parsed.userId || !parsed.email) throw new Error('Invalid connection state payload')
  if (Number(parsed.expires) < Date.now()) throw new Error('Connection state expired. Please try again.')
  return { userId: parsed.userId, email: parsed.email, nonce: parsed.nonce }
}

// Used for replay protection (store nonces in memory)
const usedNonces = new Set()
setInterval(() => usedNonces.clear(), 10 * 60 * 1000) // GC every 10min

export function isReplay(nonce) {
  if (usedNonces.has(nonce)) return true
  usedNonces.add(nonce)
  return false
}

// ─── Feature Management ────────────────────────────────────────────────

export function requireFeatureAccess(flagName, user, featureFlags) {
  if (!user) throw new Error('Authentication required')
  const flag = (featureFlags || []).find(f => f.flag_name === flagName)
  // If no flag found, feature is not ready
  if (!flag) throw new Error(`${flagName} is not available yet.`)
  // Admin always has access
  if (user.email?.toLowerCase() === ADMIN_EMAIL) return true
  // Beta testers have access
  if (flag.enabled && Array.isArray(flag.beta_testers) && flag.beta_testers.includes(user.email?.toLowerCase())) {
    return true
  }
  // Flag enabled for all
  if (flag.enabled && (!Array.isArray(flag.beta_testers) || flag.beta_testers.length === 0)) {
    return true
  }
  throw new Error('Telegram is in beta. Only approved testers can access it.')
}

// ─── Webhook Verification ──────────────────────────────────────────────

export function verifyWebhookSecret(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) return true // No secret configured = skip check (dev mode)
  const received = String(req.headers['x-telegram-bot-api-secret-token'] || '')
  if (!received) throw new Error('Missing Telegram webhook secret header')
  const expBuf = Buffer.from(expected)
  const recBuf = Buffer.from(received)
  if (expBuf.length !== recBuf.length || !timingSafeEqual(expBuf, recBuf)) {
    throw new Error('Invalid Telegram webhook secret')
  }
  return true
}

// ─── Database Helpers ──────────────────────────────────────────────────

function serviceHeaders(serviceKey) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
}

export async function fetchFeatureFlags(config) {
  if (!config?.url || !config?.service) return []
  try {
    const res = await fetch(`${config.url}/rest/v1/feature_flags?select=flag_name,enabled,beta_testers`, {
      headers: serviceHeaders(config.service),
    })
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

export async function getActiveBinding(config, userId) {
  if (!config?.url || !config?.service) return null
  try {
    const res = await fetch(
      `${config.url}/rest/v1/telegram_chat_bindings?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&select=*`,
      { headers: serviceHeaders(config.service) }
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0] || null
  } catch { return null }
}

export async function getBindingByChatId(config, chatId) {
  if (!config?.url || !config?.service) return null
  try {
    const res = await fetch(
      `${config.url}/rest/v1/telegram_chat_bindings?telegram_chat_id=eq.${encodeURIComponent(String(chatId))}&is_active=eq.true&select=*`,
      { headers: serviceHeaders(config.service) }
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0] || null
  } catch { return null }
}

export async function upsertBinding(config, userId, chatId, telegramUserId, telegramUsername) {
  if (!config?.url || !config?.service) return null
  try {
    const existing = await getBindingByChatId(config, chatId)
    if (existing && existing.user_id !== userId) {
      throw new Error('This Telegram chat is already connected to another AlphaTekX account.')
    }
    const record = {
      user_id: userId,
      telegram_chat_id: String(chatId),
      telegram_user_id: telegramUserId ? Number(telegramUserId) : null,
      telegram_username: telegramUsername ? String(telegramUsername) : null,
      verified_at: new Date().toISOString(),
      is_active: true,
      updated_at: new Date().toISOString(),
    }
    if (existing) {
      // Update existing
      const res = await fetch(
        `${config.url}/rest/v1/telegram_chat_bindings?id=eq.${encodeURIComponent(existing.id)}`,
        {
          method: 'PATCH',
          headers: serviceHeaders(config.service),
          body: JSON.stringify(record),
        }
      )
      return res.ok
    }
    // Insert new
    const res = await fetch(`${config.url}/rest/v1/telegram_chat_bindings`, {
      method: 'POST',
      headers: { ...serviceHeaders(config.service), Prefer: 'return=minimal' },
      body: JSON.stringify(record),
    })
    return res.ok
  } catch (error) {
    throw error
  }
}

export async function deactivateBinding(config, userId) {
  if (!config?.url || !config?.service) return false
  try {
    const res = await fetch(
      `${config.url}/rest/v1/telegram_chat_bindings?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true`,
      {
        method: 'PATCH',
        headers: serviceHeaders(config.service),
        body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
      }
    )
    return res.ok
  } catch { return false }
}

// ─── Telegram Bot API Calls ────────────────────────────────────────────

function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN || ''
}

export async function sendTelegramMessage(chatId, text, parseMode = 'HTML') {
  const token = botToken()
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  })
  const data = await res.json()
  if (!res.ok || !data.ok) {
    throw new Error(data.description || `Telegram sendMessage failed with HTTP ${res.status}`)
  }
  return {
    success: true,
    message_id: data.result?.message_id,
    chat_id: data.result?.chat?.id || chatId,
    date: data.result?.date,
  }
}

// ─── Webhook Setup (admin only) ────────────────────────────────────────

export async function setupWebhook(publicUrl) {
  const token = botToken()
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  const webhookUrl = `${String(publicUrl).replace(/\/$/, '')}/api/telegram/webhook`
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || ''
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret || undefined,
      allowed_updates: ['message'],
      max_connections: 10,
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.ok) {
    throw new Error(data.description || 'Telegram setWebhook failed')
  }
  return { ok: true, url: webhookUrl, description: data.description }
}

// ─── Webhook Handler ───────────────────────────────────────────────────

export async function handleTelegramWebhook(req, res, { json, supabaseConfig, currentOrLocalUser }) {
  const body = await (async () => {
    let raw = ''
    req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) throw new Error('Webhook too large') })
    return new Promise((resolve, reject) => {
      req.on('end', () => {
        try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('Invalid JSON')) }
      })
      req.on('error', reject)
    })
  })()

  // 1. Verify webhook secret header
  try { verifyWebhookSecret(req) } catch (error) {
    return json(res, 403, { ok: false, error: error.message })
  }

  // 2. Extract message data
  const message = body.message
  if (!message) return json(res, 200, { ok: true, ignored: 'no_message' })

  const chat = message.chat || {}
  const chatId = chat.id
  const from = message.from || {}
  const telegramUserId = from.id
  const telegramUsername = from.username || from.first_name || ''
  const text = String(message.text || '').trim()

  // 3. Only handle /start <state> commands
  const startMatch = text.match(/^\/start\s+(.+)$/)
  if (!startMatch || !startMatch[1]) {
    // Unknown command
    await sendTelegramMessage(chatId, 'Welcome to AlphaTekX! Use the Connect button in the app to link your account.')
    return json(res, 200, { ok: true, ignored: 'not_start_command' })
  }

  const stateToken = startMatch[1].trim()

  // 4. Verify connection state
  let state
  try {
    state = verifyConnectionState(stateToken)
  } catch (error) {
    await sendTelegramMessage(chatId, `❌ Connection failed: ${error.message}`)
    return json(res, 200, { ok: true, error: error.message })
  }

  // 5. Replay protection
  if (isReplay(state.nonce)) {
    await sendTelegramMessage(chatId, '✅ Already connected!')
    return json(res, 200, { ok: true, ignored: 'replay' })
  }

  // 6. Link the user
  const config = supabaseConfig()
  if (!config.url || !config.service) {
    await sendTelegramMessage(chatId, '❌ AlphaTekX database is not configured.')
    return json(res, 200, { ok: true, error: 'no_db' })
  }

  try {
    await upsertBinding(config, state.userId, chatId, telegramUserId, telegramUsername)
  } catch (error) {
    await sendTelegramMessage(chatId, `❌ ${error.message}`)
    return json(res, 200, { ok: true, error: error.message })
  }

  // 7. Confirm to user
  await sendTelegramMessage(
    chatId,
    '✅ Telegram connected successfully to AlphaTekX.\n\nYou can now receive messages and notifications from your automations.'
  )

  return json(res, 200, { ok: true, connected: true, userId: state.userId })
}

// ─── Send Flow (called from connector execution) ───────────────────────

export async function executeTelegramSend(user, action, { config, getUserCredits, spendUserCredits, featureFlags, addAgentLog }) {
  const text = String(action.params?.text || action.params?.message || '')
  if (!text) throw new Error('Telegram message text is required')

  // 1. Verify authenticated user
  if (!user?.id) throw new Error('Authentication required')

  // 2. Verify Telegram feature access
  requireFeatureAccess('telegram_integration', user, featureFlags)

  // 3. Load only this user's active Telegram binding
  const binding = await getActiveBinding(config, user.id)
  if (!binding) throw new Error('Telegram is not connected. Connect via the Connectors page first.')

  // 4. Verify credits
  const balance = await getUserCredits(user, config)
  if (balance < 2) throw new Error('Insufficient credits. You need at least 2 credits to send a Telegram message.')

  // 5. Require explicit approval
  if (action.params?.requiresApproval !== false && action.params?.approvalStatus !== 'approved') {
    throw new Error('AWAITING_APPROVAL')
  }

  // 6. Send via Bot API
  const result = await sendTelegramMessage(binding.telegram_chat_id, text)

  // 7. Only record success if Telegram confirms message_id
  if (!result.message_id) throw new Error('Telegram did not confirm delivery (no message_id)')

  // 8. Deduct credits exactly once
  const charged = await spendUserCredits(user, 2, {
    automationId: action.params?.automationId,
    reason: 'telegram/send_message',
    step: 'Send Telegram message',
  })
  if (!charged) throw new Error('Could not deduct credits')

  // 9. Save history
  if (typeof addAgentLog === 'function') {
    await addAgentLog({
      agentId: action.params?.agentId || 'manual',
      connectorType: 'telegram',
      action: 'send_message',
      content: text.slice(0, 500),
      status: 'success',
      response: JSON.stringify({ message_id: result.message_id }),
      credits_used: 2,
    })
  }

  return {
    ok: true,
    message_id: result.message_id,
    chat_id: result.chat_id,
    status: 'Sent',
  }
}

// ─── Disconnect ────────────────────────────────────────────────────────

export async function disconnectTelegram(config, userId) {
  // 1. Deactivate the binding
  const ok = await deactivateBinding(config, userId)
  if (!ok) throw new Error('Could not disconnect Telegram')

  // 2. Send a final notification (best-effort)
  try {
    const binding = await getActiveBinding(config, userId)
    if (binding) {
      await sendTelegramMessage(binding.telegram_chat_id, '🔌 Telegram disconnected from AlphaTekX.')
    }
  } catch { /* best-effort */ }

  return { disconnected: true }
}
