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
    assert.ok(conversation.messages.at(-1).text.length > 10)
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

await test('profile refresh is bounded and admin authority requires verified identity', () => {
  const auth = fs.readFileSync(new URL('../src/lib/auth.tsx', import.meta.url), 'utf8')
  const adminAccess = fs.readFileSync(new URL('../src/lib/adminAccess.ts', import.meta.url), 'utf8')
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  const billing = fs.readFileSync(new URL('../server/billing.mjs', import.meta.url), 'utf8')
  const marketplace = fs.readFileSync(new URL('../server/marketplace.mjs', import.meta.url), 'utf8')
  const composio = fs.readFileSync(new URL('../server/composioConnectorService.mjs', import.meta.url), 'utf8')
  assert.match(auth, /PROFILE_TIMEOUT_MS/)
  assert.match(auth, /withTimeout/)
  assert.match(auth, /profile refresh failed/)
  assert.match(adminAccess, /iamdan4live@gmail.com/)
  assert.match(adminAccess, /identity_data/)
  assert.match(adminAccess, /userEmail\(user\) === ADMIN_EMAIL/)
  assert.match(server, /function authUserEmail/)
  assert.match(server, /identity_data/)
  assert.match(server, /async function authenticatedAdmin/)
  assert.match(server, /function isAdminAuthUser[\s\S]*authUserEmail\(user\) === adminEmail/)
  assert.doesNotMatch(server, /x-admin-email/)
  assert.match(billing, /function userEmail/)
  assert.match(marketplace, /function userEmail/)
  assert.doesNotMatch(composio, /isAdminUser/)
  assert.match(composio, /if \(!accountBelongsToUser\(account, user\)\)/)
})

await test('auth page supports Google-only signup and canonical redirects', () => {
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const authPage = fs.readFileSync(new URL('../src/pages/Auth.tsx', import.meta.url), 'utf8')
  const renderConfig = fs.readFileSync(new URL('../render.yaml', import.meta.url), 'utf8')
  const envExample = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
  assert.match(app, /query\.has\('error'\)/)
  assert.match(app, /Navigate to=\{`\/auth\$\{location\.search\}`\}/)
  assert.match(authPage, /signInWithOAuth/)
  assert.match(authPage, /provider: 'google'/)
  assert.match(authPage, /redirectTo: authRedirectUrl\(\)/)
  assert.doesNotMatch(authPage, /signInWithPassword|type="password"|Use email instead/)
  assert.match(authPage, /https:\/\/alphatekx\.name\.ng\/auth/)
  assert.match(authPage, /SITE_URL_HELP/)
  assert.match(authPage, /OAUTH_STATE_HELP/)
  assert.match(authPage, /bad_oauth_state/)
  assert.match(authPage, /clearStaleOAuthState/)
  assert.match(authPage, /pkce\|oauth\|auth-token/)
  assert.match(renderConfig, /VITE_PUBLIC_APP_URL[\s\S]*https:\/\/alphatekx\.name\.ng/)
  assert.match(envExample, /VITE_PUBLIC_APP_URL=https:\/\/alphatekx\.name\.ng/)
})

await test('Alpha conversation reports provider configuration failures without killing the planner', () => {
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(server, /function isProviderOrConfigError/)
  assert.match(server, /function alphaConfigurationMessage/)
  assert.match(server, /function fallbackConversationResponse/)
  assert.match(server, /Alpha is online, but the AI provider is not configured correctly/)
  assert.match(server, /warning: alphaConfigurationMessage\(error\)/)
})

await test('connected apps accepts service links and shows released connectors', () => {
  const connectors = fs.readFileSync(new URL('../src/pages/Connectors.tsx', import.meta.url), 'utf8')
  const featureAccess = fs.readFileSync(new URL('../server/featureAccess.mjs', import.meta.url), 'utf8')
  assert.match(connectors, /searchParams\.get\('platform'\) \|\| searchParams\.get\('service'\)/)
  assert.match(connectors, /getConnectedApps/)
  assert.match(connectors, /composioOAuthProviders/)
  assert.match(connectors, /Public tools active/)
  assert.match(connectors, /releasedPlatforms/)
  assert.match(connectors, /publicConnectorIds/)
  for (const platform of ['LinkedIn', 'Instagram', 'Facebook', 'X', 'YouTube', 'WhatsApp']) {
    assert.match(connectors, new RegExp(`name: '${platform}'`))
  }
  assert.doesNotMatch(connectors, /name: 'Google'/)
  assert.doesNotMatch(connectors, /name: 'Telegram'/)
  assert.match(featureAccess, /defaultFeature\?\.state === 'public'/)
  assert.match(featureAccess, /const featureIds = new Set/)
})

await test('Meta, WhatsApp, Instagram and X use the correct configuration paths', () => {
  const connectors = fs.readFileSync(new URL('../src/pages/Connectors.tsx', import.meta.url), 'utf8')
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  const composio = fs.readFileSync(new URL('../server/composioConnectorService.mjs', import.meta.url), 'utf8')
  assert.match(connectors, /composioOAuthProviders = new Set\(\['whatsapp', 'facebook', 'instagram', 'x', 'youtube'\]\)/)
  assert.match(connectors, /serverManagedProviders = new Set<string>\(\)/)
  assert.match(server, /META_APP_ID and META_APP_SECRET/)
  assert.match(server, /WHATSAPP_ACCESS_TOKEN/)
  assert.match(composio, /COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID/)
  assert.match(composio, /COMPOSIO_X_AUTH_CONFIG_ID/)
  assert.match(composio, /requiredEnvironment/)
})

await test('api clients omit browser cookies to avoid oversized header failures', () => {
  const apiClient = fs.readFileSync(new URL('../src/lib/apiClient.ts', import.meta.url), 'utf8')
  const integrations = fs.readFileSync(new URL('../src/lib/integrations.ts', import.meta.url), 'utf8')
  assert.match(apiClient, /credentials: 'omit'/)
  assert.match(integrations, /credentials: 'omit'/)
  assert.match(apiClient, /response\.status === 431/)
  assert.match(integrations, /response\.status === 431/)
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
