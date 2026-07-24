import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const WHATSAPP_FIRST_MESSAGE = 'Hi from AlphaTekx.'
export const WHATSAPP_MESSAGE_CREDITS = 2

export function whatsappCredentials(env = process.env) {
  const credentials = {
    accessToken: String(env.WHATSAPP_ACCESS_TOKEN || ''),
    phoneNumberId: String(env.WHATSAPP_PHONE_NUMBER_ID || ''),
    businessAccountId: String(env.WHATSAPP_BUSINESS_ACCOUNT_ID || ''),
    verifyToken: String(env.WHATSAPP_VERIFY_TOKEN || ''),
    appSecret: String(env.WHATSAPP_APP_SECRET || ''),
    apiVersion: String(env.WHATSAPP_API_VERSION || ''),
  }
  const missing = Object.entries(credentials).filter(([, value]) => !value).map(([key]) => key)
  return { ...credentials, configured: missing.length === 0, missing }
}

export function normalizeWhatsAppRecipient(value) {
  const normalized = String(value || '').trim().replace(/[^\d+]/g, '').replace(/^\+/, '')
  return /^\d{8,15}$/.test(normalized) ? normalized : ''
}

export function allowedWhatsAppRecipients(env = process.env) {
  return new Set(String(env.WHATSAPP_ALLOWED_RECIPIENTS || '').split(',').map(normalizeWhatsAppRecipient).filter(Boolean))
}

function graphBase(credentials) {
  if (!/^v\d+\.\d+$/.test(credentials.apiVersion)) throw new Error('WhatsApp API version is not configured correctly.')
  return `https://graph.facebook.com/${credentials.apiVersion}`
}

export async function verifyWhatsAppPhoneRegistration(credentials, options = {}) {
  const fetchImpl = options.fetchImpl || fetch
  const response = await fetchImpl(`${graphBase(credentials)}/${encodeURIComponent(credentials.phoneNumberId)}?fields=id,display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.error || !data.id) throw new Error('The WhatsApp phone number needs attention in Meta before Alpha can send.')
  return { id: String(data.id), displayPhoneNumber: String(data.display_phone_number || ''), verifiedName: String(data.verified_name || '') }
}

export async function sendWhatsAppText(credentials, { recipient, text }, options = {}) {
  const fetchImpl = options.fetchImpl || fetch
  const to = normalizeWhatsAppRecipient(recipient)
  if (!to) throw new Error('Enter a valid WhatsApp recipient number including the country code.')
  if (text !== WHATSAPP_FIRST_MESSAGE) throw new Error('This test can send only the approved first-message text.')
  const response = await fetchImpl(`${graphBase(credentials)}/${encodeURIComponent(credentials.phoneNumberId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text } }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.error) throw new Error(data.error?.message || 'WhatsApp did not accept the message.')
  const providerMessageId = String(data.messages?.[0]?.id || '')
  if (!providerMessageId) throw new Error('WhatsApp did not return a confirmed message identifier.')
  return { providerMessageId, status: 'accepted', recipient: to }
}

export function verifyWhatsAppWebhookSignature(rawBody, signature, appSecret) {
  if (!appSecret || !String(signature || '').startsWith('sha256=')) return false
  const received = Buffer.from(String(signature).slice(7), 'hex')
  const expected = createHmac('sha256', appSecret).update(rawBody).digest()
  return received.length === expected.length && timingSafeEqual(received, expected)
}

export function whatsappWebhookEvents(payload) {
  const events = []
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {}
      for (const status of value.statuses || []) {
        const state = ['sent', 'delivered', 'read', 'failed'].includes(status.status) ? status.status : 'accepted'
        events.push({ type: 'status', providerMessageId: String(status.id || ''), status: state, timestamp: String(status.timestamp || ''), errorCode: String(status.errors?.[0]?.code || '') })
      }
      for (const message of value.messages || []) {
        events.push({ type: 'incoming', providerMessageId: String(message.id || ''), from: normalizeWhatsAppRecipient(message.from), messageType: String(message.type || 'unknown'), timestamp: String(message.timestamp || '') })
      }
    }
  }
  return events.filter(event => event.providerMessageId)
}

export function applyWhatsAppStatusEvent(execution, event, now = new Date().toISOString()) {
  if (!execution || event.type !== 'status' || execution.providerMessageId !== event.providerMessageId) return { changed: false, execution }
  const history = Array.isArray(execution.history) ? execution.history : []
  if (execution.status === event.status || history.some(item => item.status === event.status && item.providerMessageId === event.providerMessageId)) return { changed: false, execution }
  return {
    changed: true,
    execution: {
      ...execution,
      status: event.status,
      updatedAt: now,
      history: [...history, { status: event.status, providerMessageId: event.providerMessageId, at: now, errorCode: event.errorCode || '' }],
    },
  }
}

export function whatsappExecutionId(userId, idempotencyKey) {
  return `whatsapp-first:${createHash('sha256').update(`${userId}:${idempotencyKey}`).digest('hex').slice(0, 40)}`
}

export async function executeApprovedWhatsAppMessage(input, deps) {
  const recipient = normalizeWhatsAppRecipient(input.recipient)
  if (!input.approved) return { ok: false, status: 'awaiting_approval', message: WHATSAPP_FIRST_MESSAGE, creditsCharged: 0 }
  if (!recipient) return { ok: false, status: 'failed', code: 'INVALID_RECIPIENT', message: 'Enter a valid WhatsApp recipient number including the country code.', creditsCharged: 0 }
  if (!input.idempotencyKey) return { ok: false, status: 'failed', code: 'IDEMPOTENCY_REQUIRED', message: 'Refresh the review and approve again.', creditsCharged: 0 }
  if (!deps.featureEnabled) return { ok: false, status: 'failed', code: 'FEATURE_UNAVAILABLE', message: 'WhatsApp testing is not available for this account.', creditsCharged: 0 }
  if (!deps.credentials.configured) return { ok: false, status: 'setup_required', code: 'SETUP_REQUIRED', message: 'WhatsApp setup is incomplete. Add the server credentials before testing.', creditsCharged: 0 }
  if (!deps.allowedRecipients.has(recipient)) return { ok: false, status: 'failed', code: 'RECIPIENT_NOT_ALLOWED', message: 'This number is not approved for the current WhatsApp test.', creditsCharged: 0 }
  if (!deps.isAdmin && await deps.getCredits() < WHATSAPP_MESSAGE_CREDITS) return { ok: false, status: 'waiting_for_credits', code: 'INSUFFICIENT_CREDITS', message: 'Add credits before sending this WhatsApp test message.', creditsCharged: 0 }

  const id = whatsappExecutionId(input.user.id, input.idempotencyKey)
  const execution = { id, agentId: 'whatsapp-first-message', userId: input.user.id, userEmail: input.user.email, at: new Date().toISOString(), status: 'sending', provider: 'whatsapp', providerMessageId: '', credits_used: 0, history: [{ status: 'sending', at: new Date().toISOString() }] }
  if (!await deps.claim(execution)) {
    const existing = await deps.getExecution(id)
    return { ok: existing?.status === 'accepted' || existing?.status === 'delivered' || existing?.status === 'read', duplicate: true, status: existing?.status || 'sending', providerMessageId: existing?.providerMessageId || '', creditsCharged: existing?.credits_used || 0 }
  }

  try {
    await deps.verifyRegistration(deps.credentials)
    const sent = await deps.send(deps.credentials, { recipient, text: WHATSAPP_FIRST_MESSAGE })
    execution.status = 'accepted'
    execution.providerMessageId = sent.providerMessageId
    execution.history.push({ status: 'accepted', at: new Date().toISOString() })
    if (!deps.isAdmin) {
      const charged = await deps.spendCredits(WHATSAPP_MESSAGE_CREDITS, { idempotencyKey: id, providerMessageId: sent.providerMessageId, reason: 'Confirmed WhatsApp message acceptance' })
      if (!charged) throw new Error('The message was accepted, but the credit record needs attention. Alpha will not send it again.')
      execution.credits_used = WHATSAPP_MESSAGE_CREDITS
    }
    await deps.save(execution)
    return { ok: true, status: 'accepted', providerMessageId: sent.providerMessageId, creditsCharged: execution.credits_used }
  } catch (error) {
    execution.status = 'failed'
    execution.error_code = error instanceof Error && error.message.includes('needs attention') ? 'PHONE_NOT_REGISTERED' : 'PROVIDER_FAILURE'
    execution.log = error instanceof Error ? error.message : 'WhatsApp send failed.'
    execution.history.push({ status: 'failed', at: new Date().toISOString() })
    await deps.save(execution)
    return { ok: false, status: execution.error_code === 'PHONE_NOT_REGISTERED' ? 'needs_attention' : 'failed', code: execution.error_code, message: execution.log, creditsCharged: 0 }
  }
}
