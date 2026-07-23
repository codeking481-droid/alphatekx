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
const ownerHeaders = { 'content-type': 'application/json', 'x-local-user-id': ownerId, 'x-local-user-email': `${ownerId}@test.local` }
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
    const listed = (await (await request('/api/agents')).json()).agents.find(item => item.id === agentId)
    assert.equal(listed.status, 'paused')
  })

  await test('delete archives without losing history or altering credit evidence', async () => {
    const response = await request(`/api/agents/${agentId}`, { method: 'DELETE' })
    const payload = await response.json()
    assert.equal(response.status, 200, JSON.stringify(payload))
    const { agent } = payload
    assert.equal(agent.status, 'deleted')
    assert.equal(agent.executionHistory.length, 1)
    assert.equal(agent.executionHistory[0].credits_used, 3)
    assert.equal(agent.trigger.nextRun, null)
    const visible = (await (await request('/api/agents')).json()).agents
    assert.equal(visible.some(item => item.id === agentId), false)
  })

  await test('duplicate delete and missing automation return honest conflicts', async () => {
    assert.equal((await request(`/api/agents/${agentId}`, { method: 'DELETE' })).status, 409)
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
