import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createConversationEngine } from '../server/alpha/conversationEngine.mjs'
import { runCommand } from '../server/projectWorkspace.mjs'

const tests = []
async function test(name, fn) {
  try { await fn(); tests.push({ name, ok: true }) }
  catch (error) { tests.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }) }
}

function testEngine() {
  const records = new Map()
  let modelCalls = 0
  let creditCharges = 0
  const engine = createConversationEngine({
    saveServerAgent: async record => { records.set(record.id, structuredClone(record)); return record },
    getServerAgent: async id => structuredClone(records.get(id)),
    getUserCredits: async () => 30,
    spendUserCredits: async () => { creditCharges += 1; return true },
    getIntegrationStatus: async () => ({ connected: true, ready: true }),
    callLLMForRole: async () => { modelCalls += 1; throw new Error('Model should not be required by this test') },
  })
  return { engine, records, get modelCalls() { return modelCalls }, get creditCharges() { return creditCharges } }
}

for (const greeting of ['Hi', 'Hello', 'Good morning', 'How are you?']) {
  await test(`greeting stays out of planning: ${greeting}`, async () => {
    const fixture = testEngine()
    const conversation = await fixture.engine.start({ id: `user-${greeting}`, email: 'owner@example.com' }, greeting)
    assert.equal(conversation.conversationStage, 'chatting')
    assert.equal(conversation.automationDraft, null)
    assert.equal(conversation.messages.at(-1).text, 'Hi! What would you like me to automate today?')
    assert.equal(fixture.modelCalls, 0)
  })
}

await test('a genuine request after a greeting enters deterministic planning', async () => {
  const fixture = testEngine()
  const user = { id: 'follow-up-user', email: 'iamdan4live@gmail.com' }
  let conversation = await fixture.engine.start(user, 'Hello')
  conversation = await fixture.engine.continue(conversation.id, user, 'Save invoice attachments to Google Drive')
  assert.equal(conversation.conversationStage, 'awaiting_approval')
  assert.equal(conversation.automationDraft.actions[0].action, 'save_attachments_to_drive')
  assert.equal(fixture.modelCalls, 0)
})

await test('approval persists a separate active automation without charging credits', async () => {
  const fixture = testEngine()
  const user = { id: 'creation-user', email: 'iamdan4live@gmail.com' }
  let conversation = await fixture.engine.start(user, 'Save invoice attachments to Google Drive')
  conversation = await fixture.engine.continue(conversation.id, user, 'approve')
  const automation = conversation.automationDraft
  assert.equal(conversation.conversationStage, 'created')
  assert.equal(conversation.status, 'completed')
  assert.equal(automation.status, 'running')
  assert.equal(automation.approved, true)
  assert.equal(fixture.creditCharges, 0)
  assert.equal(fixture.records.get(automation.id).type === 'conversation', false)
  assert.equal(fixture.records.get(conversation.id).type, 'conversation')
})

await test('planning success screen contains only the required completion action', () => {
  const source = fs.readFileSync(new URL('../src/pages/Agents.tsx', import.meta.url), 'utf8')
  assert.match(source, /Automation created successfully\./)
  assert.match(source, /Visit Automation/)
  assert.doesNotMatch(source, /Start another automation/)
  assert.doesNotMatch(source, /Your automation is now available in Active Automations/)
})

await test('connected-app rendering requires backend connected and ready state', () => {
  const connectors = fs.readFileSync(new URL('../src/pages/Connectors.tsx', import.meta.url), 'utf8')
  const workflow = fs.readFileSync(new URL('../src/components/agents/WorkflowPlan.tsx', import.meta.url), 'utf8')
  assert.match(connectors, /state\.connected && state\.ready/)
  assert.match(connectors, /service\(id\)\.connected && service\(id\)\.ready/)
  assert.match(workflow, /s\.connected && s\.ready/)
})

await test('cancelled child processes terminate on Windows without hanging the planner', async () => {
  const controller = new AbortController()
  const started = Date.now()
  const pending = runCommand(process.cwd(), process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    signal: controller.signal,
    timeoutMs: 10_000,
    label: 'stability cancellation test',
  })
  setTimeout(() => controller.abort(), 200)
  const result = await pending
  assert.equal(result.ok, false)
  assert.ok(Date.now() - started < 8_000, `child termination took ${Date.now() - started}ms`)
})

const failed = tests.filter(item => !item.ok)
console.log('PLATFORM_STABILITY_TESTS:')
for (const item of tests) console.log(`- ${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` — ${item.error}` : ''}`)
console.log(`- Total: ${tests.length}, Passed: ${tests.length - failed.length}, Failed: ${failed.length}`)
if (failed.length) process.exit(1)
console.log('PLATFORM_STABILITY_TESTS_OK')
