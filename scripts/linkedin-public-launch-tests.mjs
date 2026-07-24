import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createConversationEngine } from '../server/alpha/conversationEngine.mjs'
import { connectorFeatureAccess, featureStatusForUser, unavailableConnectorMessage } from '../server/featureAccess.mjs'

const tests = []
async function test(name, fn) {
  try { await fn(); tests.push({ name, ok: true }) }
  catch (error) { tests.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }) }
}

function engineFixture() {
  const records = new Map()
  let modelCalls = 0
  const engine = createConversationEngine({
    saveServerAgent: async record => { records.set(record.id, structuredClone(record)); return record },
    getServerAgent: async id => structuredClone(records.get(id)),
    getUserCredits: async () => 30,
    spendUserCredits: async () => { throw new Error('Planning must not charge credits') },
    getIntegrationStatus: async () => ({ connected: true, ready: true }),
    callLLMForRole: async () => {
      modelCalls += 1
      return { provider: 'test', model: 'test', result: { calendar: [{ day: 1, slot: 'morning', scheduledAt: '2026-07-25T10:00:00.000Z', platforms: ['linkedin'], topic: 'AlphaTekx', postType: 'product', captions: { linkedin: 'Meet AlphaTekx, your AI Employee. #AlphaTekx #Founders' } }] } }
    },
  })
  return { engine, records, get modelCalls() { return modelCalls } }
}

const publicUser = { id: 'public-user', email: 'member@example.com' }
const adminUser = { id: 'admin-user', email: 'iamdan4live@gmail.com' }

await test('public user sees LinkedIn as available', () => {
  assert.equal(connectorFeatureAccess(publicUser, 'linkedin').availability, 'available')
})

for (const platform of ['facebook', 'instagram', 'whatsapp', 'x']) {
  await test(`public user sees ${platform} as Coming Soon`, () => {
    const access = connectorFeatureAccess(publicUser, platform)
    assert.equal(access.enabled, false)
    assert.equal(access.availability, 'coming_soon')
  })
}

await test('admin account can access internal connector testing', () => {
  const status = featureStatusForUser(adminUser)
  assert.equal(status.admin, true)
  for (const platform of ['facebook', 'instagram', 'whatsapp', 'x']) {
    assert.equal(status.connectors[platform].enabled, true)
    assert.equal(status.connectors[platform].availability, 'testing')
  }
})

await test('an untrusted email header cannot claim the admin override', () => {
  const access = connectorFeatureAccess(adminUser, 'facebook', false)
  assert.equal(access.admin, false)
  assert.equal(access.enabled, false)
})

for (const platform of ['Facebook', 'WhatsApp']) {
  await test(`public ${platform} request does not create an automation`, async () => {
    const fixture = engineFixture()
    const conversation = await fixture.engine.start(publicUser, `${platform === 'WhatsApp' ? 'Send WhatsApp messages' : 'Post on Facebook'}`)
    assert.equal(conversation.conversationStage, 'chatting')
    assert.equal(conversation.automationDraft, null)
    assert.equal(conversation.messages.at(-1).text, unavailableConnectorMessage(platform))
    assert.equal(fixture.modelCalls, 0)
  })
}

for (const message of ['Hi', 'Hello', 'Good morning', 'How are you?', 'Thank you', 'What can AlphaTekx do?']) {
  await test(`ordinary conversation stays out of planning: ${message}`, async () => {
    const fixture = engineFixture()
    const conversation = await fixture.engine.start(publicUser, message)
    assert.equal(conversation.conversationStage, 'chatting')
    assert.equal(conversation.automationDraft, null)
  })
}

await test('LinkedIn planning remains available to public users', async () => {
  const fixture = engineFixture()
  const conversation = await fixture.engine.start(publicUser, 'Create one LinkedIn post about AlphaTekx for founders in a professional tone at 10:00 UTC tomorrow')
  assert.notEqual(conversation.conversationStage, 'chatting')
  assert.ok(conversation.automationDraft)
  assert.ok(conversation.automationDraft.campaign?.meta?.platforms?.includes('linkedin'))
})

await test('public users cannot unlock hidden connectors through direct API payloads', () => {
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(server, /requireConnectorFeature\(req, res, user, 'facebook'\)/)
  assert.match(server, /const incomingConnectors = new Set/)
  assert.match(server, /const blockedConnector = \[\.\.\.incomingConnectors\]/)
  assert.match(server, /connectorFeatureAccess\(user, action\?\.connector, true\)/)
  assert.match(server, /trustedFeatureIdentity/)
})

await test('Connected Apps is server-driven and labels internal access', () => {
  const source = fs.readFileSync(new URL('../src/pages/Connectors.tsx', import.meta.url), 'utf8')
  assert.match(source, /status\._access\?\.connectors/)
  assert.match(source, /Coming soon\. We are testing this integration before releasing it publicly\./)
  assert.match(source, /Internal Beta/)
  assert.doesNotMatch(source, /localStorage.*admin/i)
})

const failed = tests.filter(item => !item.ok)
console.log('LINKEDIN_PUBLIC_LAUNCH_TESTS:')
for (const item of tests) console.log(`- ${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` — ${item.error}` : ''}`)
console.log(`- Total: ${tests.length}, Passed: ${tests.length - failed.length}, Failed: ${failed.length}`)
if (failed.length) process.exit(1)
console.log('LINKEDIN_PUBLIC_LAUNCH_TESTS_OK')
