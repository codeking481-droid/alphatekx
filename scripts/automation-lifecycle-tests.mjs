import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

const tests = []
async function test(name, fn) {
  try { await fn(); tests.push({ name, ok: true }) }
  catch (error) { tests.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }) }
}

const port = 41000 + Math.floor(Math.random() * 1000)
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(port), KEEP_ALIVE: 'false', SUPABASE_SERVICE_ROLE_KEY: '', VITE_SUPABASE_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })
for (let attempt = 0; attempt < 60; attempt++) {
  try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break } catch {}
  if (attempt === 59) throw new Error(`Server did not start: ${output}`)
  await new Promise(resolve => setTimeout(resolve, 100))
}

const ownerId = `lifecycle-owner-${randomUUID()}`
const otherId = `lifecycle-other-${randomUUID()}`
const ownerHeaders = { 'content-type': 'application/json', 'x-local-user-id': ownerId, 'x-local-user-email': 'iamdan4live@gmail.com' }
const otherHeaders = { 'content-type': 'application/json', 'x-local-user-id': otherId, 'x-local-user-email': `${otherId}@test.local` }
const request = (path, options = {}, headers = ownerHeaders) => fetch(`http://127.0.0.1:${port}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } })
const agentId = `lifecycle-agent-${randomUUID()}`
const oldRun = new Date(Date.now() - 3_600_000).toISOString()
const history = [{ id: randomUUID(), agentId, at: oldRun, status: 'success', duration: 10, log: 'Previously confirmed', credits_used: 3 }]
const fixture = {
  id: agentId, name: 'Lifecycle regression', description: 'Pause and delete fixture',
  status: 'paused', approved: true, trigger: { type: 'schedule', cron: '0 0 8 * * *', nextRun: oldRun },
  actions: [], executionHistory: history, executionsDone: 1, successRate: 100, permissions: [],
  createdAt: oldRun, updatedAt: oldRun,
}

try {
  await test('greetings remain conversational and never appear as active automations', async () => {
    const response = await request('/api/alpha/conversation', { method: 'POST', body: JSON.stringify({ prompt: 'Hello' }) })
    const payload = await response.json()
    assert.equal(response.status, 200, JSON.stringify(payload))
    assert.equal(payload.conversation.conversationStage, 'chatting')
    assert.equal(payload.conversation.automationDraft, null)
    const listed = (await (await request('/api/agents')).json()).agents
    assert.equal(listed.some(item => item.id === payload.conversation.id), false)
  })

  await test('approval creates a separately persisted automation and charges zero credits', async () => {
    const before = (await (await request('/api/credits/balance')).json()).credits
    const started = await request('/api/alpha/conversation', { method: 'POST', body: JSON.stringify({ prompt: 'Save invoice attachments to Google Drive' }) })
    const startPayload = await started.json()
    assert.equal(started.status, 200, JSON.stringify(startPayload))
    const continued = await request(`/api/alpha/conversation/${startPayload.conversation.id}`, { method: 'POST', body: JSON.stringify({ message: 'approve' }) })
    const payload = await continued.json()
    assert.equal(continued.status, 200, JSON.stringify(payload))
    assert.equal(payload.conversation.conversationStage, 'created')
    assert.notEqual(payload.conversation.id, payload.agent.id)
    const listed = (await (await request('/api/agents')).json()).agents
    assert.ok(listed.some(item => item.id === payload.agent.id && item.status === 'running'))
    assert.equal(listed.some(item => item.id === payload.conversation.id), false)
    const after = (await (await request('/api/credits/balance')).json()).credits
    assert.equal(after, before)
  })

  await test('Connected Apps reports readiness instead of token presence', async () => {
    const invalid = await request('/api/connectors/save', {
      method: 'POST',
      body: JSON.stringify({ platform: 'linkedin', tokens: { access_token: 'token-without-profile' }, scopes: [] }),
    })
    assert.equal(invalid.status, 200, await invalid.text())
    let status = await (await request('/api/integrations/status')).json()
    assert.equal(status.linkedin.connected, false)
    assert.equal(status.linkedin.ready, false)

    const valid = await request('/api/connectors/save', {
      method: 'POST',
      body: JSON.stringify({ platform: 'linkedin', tokens: { access_token: 'test-token', author_urn: 'urn:li:person:test-user' }, scopes: ['w_member_social'] }),
    })
    assert.equal(valid.status, 200, await valid.text())
    status = await (await request('/api/integrations/status')).json()
    assert.equal(status.linkedin.connected, true)
    assert.equal(status.linkedin.ready, true)
  })

  await test('public users cannot call hidden connector APIs directly', async () => {
    const response = await request('/api/connectors/facebook/start', {
      method: 'POST',
      body: JSON.stringify({ redirect: '/connected-apps' }),
    }, otherHeaders)
    const payload = await response.json()
    assert.equal(response.status, 403, JSON.stringify(payload))
    assert.equal(payload.code, 'FEATURE_COMING_SOON')
    assert.equal(payload.connector, 'facebook')
  })

  await test('admin feature changes apply immediately while public writes are rejected', async () => {
    const denied = await request('/api/admin/features/facebook', {
      method: 'PUT',
      body: JSON.stringify({ state: 'public', stopExisting: true }),
    }, otherHeaders)
    assert.equal(denied.status, 403, await denied.text())

    const changed = await request('/api/admin/features/facebook', {
      method: 'PUT',
      body: JSON.stringify({ state: 'maintenance', stopExisting: true }),
    })
    const changedPayload = await changed.json()
    assert.equal(changed.status, 200, JSON.stringify(changedPayload))
    assert.equal(changedPayload.feature.state, 'maintenance')

    const publicStatus = await (await request('/api/integrations/status', {}, otherHeaders)).json()
    assert.equal(publicStatus.facebook.access, 'maintenance')
    assert.equal(publicStatus.facebook.ready, false)

    const restored = await request('/api/admin/features/facebook', {
      method: 'PUT',
      body: JSON.stringify({ state: 'beta', stopExisting: true }),
    })
    assert.equal(restored.status, 200, await restored.text())
  })

  await test('disabling and re-enabling LinkedIn pauses and resumes feature-stopped automations', async () => {
    const toggleId = `linkedin-toggle-${randomUUID()}`
    const created = await request('/api/agents', {
      method: 'POST',
      body: JSON.stringify({ agent: {
        id: toggleId,
        name: 'LinkedIn toggle regression',
        status: 'running',
        approved: true,
        trigger: { type: 'schedule', cron: '0 9 * * *', nextRun: new Date(Date.now() + 86_400_000).toISOString() },
        actions: [{ connector: 'linkedin', action: 'post', params: { text: 'Approved test content' } }],
      } }),
    })
    assert.equal(created.status, 200, await created.text())

    const disabled = await request('/api/admin/features/linkedin', {
      method: 'PUT',
      body: JSON.stringify({ state: 'disabled', stopExisting: true }),
    })
    assert.equal(disabled.status, 200, await disabled.text())
    let listed = (await (await request('/api/agents')).json()).agents
    let toggled = listed.find(item => item.id === toggleId)
    assert.equal(toggled.status, 'paused')
    assert.equal(toggled.trigger.nextRun, null)
    assert.equal(toggled.featurePause.featureId, 'linkedin')

    const enabled = await request('/api/admin/features/linkedin', {
      method: 'PUT',
      body: JSON.stringify({ state: 'public', stopExisting: true }),
    })
    assert.equal(enabled.status, 200, await enabled.text())
    listed = (await (await request('/api/agents')).json()).agents
    toggled = listed.find(item => item.id === toggleId)
    assert.equal(toggled.status, 'running')
    assert.equal(toggled.approved, true)
    assert.ok(toggled.trigger.nextRun)
    assert.equal(toggled.featurePause, undefined)

    const removed = await request(`/api/agents/${toggleId}`, { method: 'DELETE' })
    assert.equal(removed.status, 200, await removed.text())
  })

  await test('fixture is persisted for its owner', async () => {
    const response = await request('/api/agents', { method: 'POST', body: JSON.stringify({ agent: fixture }) })
    assert.equal(response.status, 200, await response.text())
  })

  await test('unauthenticated and wrong-user lifecycle mutations are rejected', async () => {
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/agents/${agentId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"action":"pause"}' })).status, 401)
    assert.equal((await request(`/api/agents/${agentId}`, { method: 'PATCH', body: '{"action":"pause"}' }, otherHeaders)).status, 403)
    assert.equal((await request(`/api/agents/${agentId}`, { method: 'DELETE' }, otherHeaders)).status, 403)
  })

  await test('malformed lifecycle action is rejected', async () => {
    assert.equal((await request(`/api/agents/${agentId}`, { method: 'PATCH', body: '{"action":"explode"}' })).status, 400)
  })

  await test('resume recalculates an overdue next run safely', async () => {
    const response = await request(`/api/agents/${agentId}`, { method: 'PATCH', body: '{"action":"resume"}' })
    const payload = await response.json()
    assert.equal(response.status, 200, JSON.stringify(payload))
    const { agent } = payload
    assert.equal(agent.status, 'running')
    assert.ok(new Date(agent.trigger.nextRun).getTime() > Date.now())
  })

  await test('pause is durable and prevents scheduler eligibility', async () => {
    const response = await request(`/api/agents/${agentId}`, { method: 'PATCH', body: '{"action":"pause"}' })
    const { agent } = await response.json()
    assert.equal(response.status, 200)
    assert.equal(agent.status, 'paused')
    assert.equal(agent.trigger.nextRun, null)
    assert.equal(agent.nextRunAt, null)
    const listed = (await (await request('/api/agents')).json()).agents.find(item => item.id === agentId)
    assert.equal(listed.status, 'paused')
    assert.equal(listed.trigger.nextRun, null)
  })

  await test('delete removes the durable automation and survives a fresh client read', async () => {
    const response = await request(`/api/agents/${agentId}`, { method: 'DELETE' })
    const payload = await response.json()
    assert.equal(response.status, 200, JSON.stringify(payload))
    assert.equal(payload.deleted, true)
    assert.equal(payload.id, agentId)
    const visible = (await (await request('/api/agents')).json()).agents
    assert.equal(visible.some(item => item.id === agentId), false)
    assert.equal((await request(`/api/agents/${agentId}`)).status, 404)
  })

  await test('duplicate delete and missing automation return honest not-found responses', async () => {
    assert.equal((await request(`/api/agents/${agentId}`, { method: 'DELETE' })).status, 404)
    assert.equal((await request(`/api/agents/missing-${randomUUID()}`, { method: 'DELETE' })).status, 404)
  })
} finally {
  child.kill('SIGTERM')
}

const passed = tests.filter(item => item.ok).length
console.log('AUTOMATION_LIFECYCLE_TESTS:')
for (const item of tests) console.log(`- ${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` — ${item.error}` : ''}`)
console.log(`- Total: ${tests.length}, Passed: ${passed}, Failed: ${tests.length - passed}`)
if (passed !== tests.length) process.exit(1)
console.log('AUTOMATION_LIFECYCLE_TESTS_OK')
