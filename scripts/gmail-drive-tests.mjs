import assert from 'node:assert/strict'
import { buildCapabilityPlan, detectCapability, isSupportedAction } from '../server/automation/capabilityRegistry.mjs'
import { createConversationEngine } from '../server/alpha/conversationEngine.mjs'

const results = []
async function test(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

await test('detects the exact invoice attachment request', () => {
  assert.equal(detectCapability('Save invoice attachments to Google Drive.')?.id, 'gmail-attachments-to-drive')
})

await test('deterministically detects common Gmail attachment wording', () => {
  const requests = [
    'Back up email attachments in Google Drive',
    'Copy attachments from Gmail into Drive',
    'Archive receipt files from my inbox on Google Drive',
    'Put Gmail PDF attachments into Google Drive every day at 9 AM',
  ]
  for (const request of requests) {
    assert.equal(detectCapability(request)?.id, 'gmail-attachments-to-drive', request)
  }
})

await test('builds a deterministic executable plan without an AI provider', () => {
  const plan = buildCapabilityPlan('Save invoice attachments to Google Drive.', { email: 'owner@example.com' })
  assert.equal(plan.status, 'awaiting_approval')
  assert.deepEqual(plan.missing, [])
  assert.deepEqual(plan.integrations, ['Gmail', 'Google Drive'])
  assert.equal(plan.trigger.cron, '*/15 * * * *')
  assert.deepEqual(plan.actions, [{
    connector: 'gmail',
    action: 'save_attachments_to_drive',
    label: 'Save matching Gmail attachments to Google Drive',
    params: { q: 'has:attachment invoice', maxMessages: 20 },
  }])
})

await test('registers the cross-connector execution action', () => {
  assert.equal(isSupportedAction('gmail', 'save_attachments_to_drive'), true)
})

await test('extracts safe Gmail filters and schedules without AI interpretation', () => {
  const plan = buildCapabilityPlan(
    'Every day at 9 AM save unread PDF invoice attachments from billing@example.com to Google Drive.',
    { email: 'owner@example.com' },
  )
  assert.equal(plan.trigger.cron, '0 9 * * *')
  assert.equal(plan.schedule.frequency, 'daily')
  assert.equal(plan.actions[0].params.q, 'has:attachment invoice filename:pdf from:billing@example.com is:unread')
})

await test('bypasses LLM classification for Gmail attachment variants', async () => {
  const records = new Map()
  let modelCalls = 0
  const engine = createConversationEngine({
    saveServerAgent: async record => {
      records.set(record.id, structuredClone(record))
      return record
    },
    getServerAgent: async id => structuredClone(records.get(id)),
    getUserCredits: async () => 30,
    spendUserCredits: async () => true,
    getIntegrationStatus: async () => ({ connected: true, ready: true }),
    callLLMForRole: async () => {
      modelCalls += 1
      throw new Error('The deterministic capability should not need a model')
    },
  })
  const conversation = await engine.start(
    { id: 'gmail-drive-user', email: 'owner@example.com' },
    'Copy unread PDF attachments from Gmail into Google Drive every hour.',
  )
  assert.equal(modelCalls, 0)
  assert.equal(conversation.intent, 'gmail_attachments_to_drive')
  assert.equal(conversation.conversationStage, 'awaiting_approval')
  assert.equal(conversation.automationDraft.actions[0].action, 'save_attachments_to_drive')
  assert.equal(conversation.lastQuestion || '', '')
})

const failed = results.filter(result => !result.ok)
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`)
}
console.log(`\nGmail-to-Drive tests: ${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)
