import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import fs from 'node:fs'
import { buildCapabilityPlan, detectCapability } from '../server/automation/capabilityRegistry.mjs'
import { createConversationEngine } from '../server/alpha/conversationEngine.mjs'
import { connectorFeatureAccess, refreshFeatureConfig } from '../server/featureAccess.mjs'
import {
  applyWhatsAppStatusEvent,
  executeApprovedWhatsAppMessage,
  sendWhatsAppText,
  verifyWhatsAppWebhookSignature,
  whatsappCredentials,
  whatsappWebhookEvents,
  WHATSAPP_FIRST_MESSAGE,
} from '../server/whatsapp.mjs'

const tests = []
async function test(name, fn) {
  try { await fn(); tests.push({ name, ok: true }) }
  catch (error) { tests.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }) }
}

const credentials = {
  configured: true,
  accessToken: 'server-secret-token',
  phoneNumberId: '123456',
  businessAccountId: '654321',
  verifyToken: 'verify-secret',
  appSecret: 'app-secret',
  apiVersion: 'v23.0',
  missing: [],
}

function fixture(overrides = {}) {
  const executions = new Map()
  let sends = 0
  let charges = 0
  const deps = {
    featureEnabled: true,
    credentials,
    allowedRecipients: new Set(['2348012345678']),
    isAdmin: false,
    getCredits: async () => 30,
    claim: async execution => {
      if (executions.has(execution.id)) return false
      executions.set(execution.id, structuredClone(execution))
      return true
    },
    getExecution: async id => structuredClone(executions.get(id)),
    save: async execution => { executions.set(execution.id, structuredClone(execution)); return execution },
    spendCredits: async () => { charges++; return true },
    verifyRegistration: async () => ({ id: credentials.phoneNumberId }),
    send: async () => { sends++; return { providerMessageId: 'wamid.test-confirmed', status: 'accepted' } },
    ...overrides,
  }
  return { deps, executions, get sends() { return sends }, get charges() { return charges } }
}

await refreshFeatureConfig({}, true)
await test('public user can access released WhatsApp tool', () => {
  assert.equal(connectorFeatureAccess({ email: 'public@example.com' }, 'whatsapp', true).enabled, true)
  assert.equal(connectorFeatureAccess({ email: 'public@example.com' }, 'whatsapp', true).availability, 'available')
})
await test('admin user can access released WhatsApp tool', () => {
  assert.equal(connectorFeatureAccess({ email: 'iamdan4live@gmail.com' }, 'whatsapp', true).enabled, true)
})
await test('capability creates one exact explicitly approved action', () => {
  assert.equal(detectCapability('Send Hi from AlphaTekx to WhatsApp +2348012345678')?.id, 'whatsapp-first-message')
  const plan = buildCapabilityPlan('Send Hi from AlphaTekx to WhatsApp +2348012345678')
  assert.equal(plan.actions.length, 1)
  assert.equal(plan.actions[0].params.message, WHATSAPP_FIRST_MESSAGE)
  assert.equal(plan.actions[0].requiresApproval, true)
  assert.equal(plan.executionPolicy, 'run_once')
})
await test('Alpha routes the first-message plan deterministically without an LLM', async () => {
  const records = new Map()
  let modelCalls = 0
  const engine = createConversationEngine({
    saveServerAgent: async record => { records.set(record.id, structuredClone(record)); return record },
    getServerAgent: async id => structuredClone(records.get(id)),
    getUserCredits: async () => 30,
    spendUserCredits: async () => true,
    getIntegrationStatus: async () => ({ connected: true, ready: true }),
    callLLMForRole: async () => { modelCalls++; throw new Error('LLM should not be needed') },
  })
  const conversation = await engine.start({ id: 'wa-admin', email: 'iamdan4live@gmail.com' }, 'Send Hi from AlphaTekx to WhatsApp +2348012345678')
  assert.equal(modelCalls, 0)
  assert.equal(conversation.conversationStage, 'awaiting_approval')
  assert.equal(conversation.automationDraft.actions[0].params.message, WHATSAPP_FIRST_MESSAGE)
  assert.equal(conversation.automationDraft.actions[0].requiresApproval, true)
})
await test('missing credentials produces Setup Required', async () => {
  const f = fixture({ credentials: { ...credentials, configured: false, missing: ['accessToken'] } })
  const result = await executeApprovedWhatsAppMessage({ user: { id: 'u1' }, recipient: '2348012345678', approved: true, idempotencyKey: 'one' }, f.deps)
  assert.equal(result.status, 'setup_required')
  assert.equal(f.sends, 0)
})
await test('unregistered number produces Needs Attention', async () => {
  const f = fixture({ verifyRegistration: async () => { throw new Error('The WhatsApp phone number needs attention in Meta before Alpha can send.') } })
  const result = await executeApprovedWhatsAppMessage({ user: { id: 'u2' }, recipient: '2348012345678', approved: true, idempotencyKey: 'one' }, f.deps)
  assert.equal(result.status, 'needs_attention')
  assert.equal(f.sends, 0)
  assert.equal(f.charges, 0)
})
await test('message cannot send without explicit approval', async () => {
  const f = fixture()
  const result = await executeApprovedWhatsAppMessage({ user: { id: 'u3' }, recipient: '2348012345678', approved: false, idempotencyKey: 'one' }, f.deps)
  assert.equal(result.status, 'awaiting_approval')
  assert.equal(result.message, WHATSAPP_FIRST_MESSAGE)
  assert.equal(f.sends, 0)
})
await test('successful API response must include a provider message ID', async () => {
  const result = await sendWhatsAppText(credentials, { recipient: '2348012345678', text: WHATSAPP_FIRST_MESSAGE }, {
    fetchImpl: async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200, headers: { 'content-type': 'application/json' } }),
  })
  assert.equal(result.providerMessageId, 'wamid.1')
})
await test('missing provider message ID is failure', async () => {
  await assert.rejects(() => sendWhatsAppText(credentials, { recipient: '2348012345678', text: WHATSAPP_FIRST_MESSAGE }, {
    fetchImpl: async () => new Response(JSON.stringify({ messages: [{}] }), { status: 200, headers: { 'content-type': 'application/json' } }),
  }), /confirmed message identifier/)
})
await test('duplicate approval does not send or charge twice', async () => {
  const f = fixture()
  const input = { user: { id: 'u4' }, recipient: '2348012345678', approved: true, idempotencyKey: 'stable' }
  const first = await executeApprovedWhatsAppMessage(input, f.deps)
  const second = await executeApprovedWhatsAppMessage(input, f.deps)
  assert.equal(first.ok, true)
  assert.equal(second.duplicate, true)
  assert.equal(f.sends, 1)
  assert.equal(f.charges, 1)
})
await test('failed send does not charge credits', async () => {
  const f = fixture({ send: async () => { throw new Error('Provider unavailable') } })
  const result = await executeApprovedWhatsAppMessage({ user: { id: 'u5' }, recipient: '2348012345678', approved: true, idempotencyKey: 'fail' }, f.deps)
  assert.equal(result.ok, false)
  assert.equal(f.charges, 0)
})
await test('accepted send charges exactly once', async () => {
  const f = fixture()
  const result = await executeApprovedWhatsAppMessage({ user: { id: 'u6' }, recipient: '2348012345678', approved: true, idempotencyKey: 'accepted' }, f.deps)
  assert.equal(result.status, 'accepted')
  assert.equal(result.providerMessageId, 'wamid.test-confirmed')
  assert.equal(f.charges, 1)
})
await test('webhook verification requires the configured signature', () => {
  const raw = Buffer.from('{"object":"whatsapp_business_account"}')
  const signature = `sha256=${createHmac('sha256', credentials.appSecret).update(raw).digest('hex')}`
  assert.equal(verifyWhatsAppWebhookSignature(raw, signature, credentials.appSecret), true)
  assert.equal(verifyWhatsAppWebhookSignature(raw, 'sha256=00', credentials.appSecret), false)
})
await test('delivery and incoming test events parse without message content', () => {
  const events = whatsappWebhookEvents({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered', timestamp: '1' }], messages: [{ id: 'wamid.in', from: '2348012345678', type: 'text', text: { body: 'private' } }] } }] }] })
  assert.deepEqual(events.map(event => event.status || event.type), ['delivered', 'incoming'])
  assert.equal(JSON.stringify(events).includes('private'), false)
})
await test('duplicate webhook status does not duplicate history', () => {
  const event = { type: 'status', providerMessageId: 'wamid.1', status: 'delivered', errorCode: '' }
  const first = applyWhatsAppStatusEvent({ providerMessageId: 'wamid.1', status: 'accepted', history: [] }, event, '2026-01-01T00:00:00.000Z')
  const duplicate = applyWhatsAppStatusEvent(first.execution, event, '2026-01-01T00:01:00.000Z')
  assert.equal(first.changed, true)
  assert.equal(duplicate.changed, false)
  assert.equal(duplicate.execution.history.length, 1)
  assert.equal(duplicate.execution.status, 'delivered')
})
await test('anti-spam rejects recipients outside the server allowlist', async () => {
  const f = fixture()
  const result = await executeApprovedWhatsAppMessage({ user: { id: 'u7' }, recipient: '2348099999999', approved: true, idempotencyKey: 'spam' }, f.deps)
  assert.equal(result.code, 'RECIPIENT_NOT_ALLOWED')
  assert.equal(f.sends, 0)
  assert.equal(f.charges, 0)
})
await test('server routes persist webhook updates idempotently without exposing secrets', () => {
  const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(source, /\/api\/connectors\/whatsapp\/webhook/)
  assert.match(source, /applyWhatsAppStatusEvent\(execution, event\)/)
  assert.doesNotMatch(source, /json\(res,[^\n]+WHATSAPP_ACCESS_TOKEN/)
  assert.equal(whatsappCredentials({}).configured, false)
})

const failed = tests.filter(item => !item.ok)
console.log('WHATSAPP_TESTS:')
for (const item of tests) console.log(`- ${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` — ${item.error}` : ''}`)
console.log(`- Total: ${tests.length}, Passed: ${tests.length - failed.length}, Failed: ${failed.length}`)
if (failed.length) process.exit(1)
console.log('WHATSAPP_TESTS_OK')
