import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { buildCapabilityPlan, detectCapability } from '../server/automation/capabilityRegistry.mjs'
import { createConversationEngine } from '../server/alpha/conversationEngine.mjs'
import { publishLinkedInTextPost, validateLinkedInCredentials } from '../server/linkedin.mjs'

const tests = []
async function test(name, fn) {
  try { await fn(); tests.push({ name, ok: true }) }
  catch (error) { tests.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }) }
}

const validCredentials = { accessToken: 'token', authorUrn: 'urn:li:person:test-member', scopes: ['w_member_social'], expiry: Date.now() + 60_000 }

await test('LinkedIn capability detection and plan', () => {
  assert.equal(detectCapability('Schedule a LinkedIn post about AlphaTekx every Monday')?.id, 'linkedin-post')
  const plan = buildCapabilityPlan('Write a LinkedIn post about AlphaTekx for founders in a professional tone', { timezone: 'Africa/Lagos' })
  assert.equal(plan.actions[0].connector, 'linkedin')
  assert.equal(plan.actions[0].requiresApproval, true)
  assert.deepEqual(plan.requiredPermissions, ['w_member_social'])
})

await test('Missing-field questioning, model generation, review and explicit approval', async () => {
  const records = new Map()
  let contentCalls = 0
  const engine = createConversationEngine({
    saveServerAgent: async record => { records.set(record.id, structuredClone(record)); return record },
    getServerAgent: async id => structuredClone(records.get(id)),
    getUserCredits: async () => 30,
    spendUserCredits: async () => true,
    getIntegrationStatus: async () => ({ connected: true, ready: true, scopes: ['w_member_social'], identifier: 'urn:li:person:test-member' }),
    callLLMForRole: async (role, system) => {
      if (role !== 'content') {
        if (system.includes('Analyze the user')) return { result: { intent: 'social_content', confidence: 0.9, knownFields: {} }, provider: 'test', model: 'test' }
        return { result: {}, provider: 'test', model: 'test' }
      }
      contentCalls++
      if (system.includes('Rewrite the following')) return { result: { text: 'A stronger regenerated LinkedIn post.\n\nWhat would you automate first?\n\n#AI #Automation #Founders' }, provider: 'test', model: 'test', generationMode: 'model' }
      return { result: { calendar: [{ day: 1, slot: '09:00', platforms: ['linkedin'], topic: 'AlphaTekx', postType: 'educational', captions: { linkedin: 'Automation should feel like hiring help, not building a machine.\n\nAlphaTekx turns a clear goal into reviewed, scheduled work.\n\nWhat would you delegate first?\n\n#AI #Automation #Founders' } }] }, provider: 'test', model: 'test', generationMode: 'model' }
    },
  })
  const user = { id: 'conversation-user', email: 'conversation@test.local' }
  let conversation = await engine.start(user, 'Create a LinkedIn post about AlphaTekx')
  assert.equal(conversation.conversationStage, 'gathering_information')
  assert.equal(conversation.lastQuestion, 'audience')
  conversation = await engine.continue(conversation.id, user, 'Founders and creators')
  assert.equal(conversation.lastQuestion, 'tone')
  conversation = await engine.continue(conversation.id, user, 'Professional and conversational')
  assert.equal(conversation.conversationStage, 'awaiting_content_review', JSON.stringify({ lastQuestion: conversation.lastQuestion, missingFields: conversation.missingFields, knownFields: conversation.knownFields }))
  assert.equal(conversation.generationMode, 'model')
  assert.equal(conversation.generatedContent.length, 1)
  await engine.regenerateContent(conversation, [conversation.generatedContent[0].id])
  assert.ok(contentCalls >= 2)
  await engine.approveContent(conversation)
  assert.equal(conversation.conversationStage, 'awaiting_approval')
  assert.equal(conversation.automationDraft.approved, false)
})

await test('Expired token and missing permission are rejected', () => {
  assert.doesNotThrow(() => validateLinkedInCredentials({ ...validCredentials, scopes: ['email,openid,profile,w_member_social'] }))
  assert.throws(() => validateLinkedInCredentials({ ...validCredentials, expiry: Date.now() - 1 }), /expired/i)
  assert.throws(() => validateLinkedInCredentials({ ...validCredentials, scopes: [] }), /w_member_social/i)
  assert.throws(() => validateLinkedInCredentials({ ...validCredentials, authorUrn: 'urn:li:organization:1' }), /personal profile/i)
})

await test('Successful response requires and returns LinkedIn post ID', async () => {
  const response = await publishLinkedInTextPost(validCredentials, { text: 'Test post' }, { fetchImpl: async () => new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:123' } }) })
  assert.equal(response.id, 'urn:li:share:123')
  await assert.rejects(() => publishLinkedInTextPost(validCredentials, { text: 'Test post' }, { fetchImpl: async () => new Response('', { status: 201 }) }), /confirmed post identifier/i)
})

let providerCalls = 0
const providerRequests = []
const provider = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/rest/posts') { res.writeHead(404); res.end(); return }
  providerCalls++
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw || '{}')
  providerRequests.push(String(body.commentary || ''))
  if (String(body.commentary).includes('NO_ID')) { res.writeHead(201); res.end(); return }
  res.writeHead(201, { 'x-restli-id': `urn:li:share:${providerCalls}` })
  res.end()
})
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
const providerPort = provider.address().port

async function startApp(port) {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), KEEP_ALIVE: 'false', LINKEDIN_API_BASE_URL: `http://127.0.0.1:${providerPort}` }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return { child, output: () => output } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  child.kill('SIGTERM')
  throw new Error(`Server did not start: ${output}`)
}

await test('OAuth denial redirects to canonical Connected Apps route', async () => {
  const port = 4500 + Math.floor(Math.random() * 200)
  const app = await startApp(port)
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/connectors/linkedin/callback?error=access_denied&error_description=User%20cancelled`, { redirect: 'manual' })
    assert.equal(response.status, 302)
    assert.match(response.headers.get('location') || '', /\/connected-apps\?connected=error/)
  } finally { app.child.kill('SIGTERM') }
})

await test('Approved campaign publishes once, charges once, persists history, and survives refresh', async () => {
  const port = 4700 + Math.floor(Math.random() * 200)
  let app = await startApp(port)
  const userId = `linkedin-test-${randomUUID()}`
  const email = `${userId}@test.local`
  const headers = { 'content-type': 'application/json', 'x-local-user-id': userId, 'x-local-user-email': email }
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } })
  const agentId = `linkedin-agent-${randomUUID()}`
  try {
    let response = await request('/api/connectors/save', { method: 'POST', body: JSON.stringify({ platform: 'linkedin', tokens: { access_token: 'test-token', author_urn: 'urn:li:person:test-member', expiry: Date.now() + 3600_000 }, identifier: 'urn:li:person:test-member', scopes: ['email,openid,profile,w_member_social'] }) })
    assert.equal(response.status, 200)
    const scheduledAt = new Date(Date.now() + 1_000).toISOString()
    const agent = { id: agentId, type: 'campaign', name: 'LinkedIn test', description: 'Focused integration test', trigger: { type: 'campaign', cron: 'campaign', nextRun: scheduledAt }, status: 'awaiting_approval', approved: false, actions: [], executionHistory: [], permissions: ['linkedin'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), campaign: { name: 'LinkedIn test', description: 'test', brand: { business: 'AlphaTekx', audience: 'Founders', tone: 'Professional', website: '', dontPost: [] }, meta: { platforms: ['linkedin'], slots: [{ label: '09:00', hour: 9, minute: 0 }], durationDays: 1, postsPerDay: 1, totalPosts: 1, startDate: scheduledAt, includeImages: false, timezone: 'UTC', frequencyText: 'One time' }, posts: [{ id: `post-${randomUUID()}`, day: 1, slot: '09:00', scheduledAt, platforms: ['linkedin'], topic: 'AlphaTekx', postType: 'educational', captions: { linkedin: 'Focused LinkedIn automation integration test.' }, status: 'pending_approval', result: {}, credits: 3 }], totalCredits: 3, status: 'pending_approval', charged: false, approved: false, autoPublish: false } }
    response = await request('/api/agents', { method: 'POST', body: JSON.stringify({ agent }) })
    assert.equal(response.status, 200)
    const balanceBefore = (await (await request('/api/credits/balance')).json()).credits
    response = await request(`/api/agents/campaign/${agentId}/activate`, { method: 'POST', body: JSON.stringify({ autoPublish: true, startAt: scheduledAt }) })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).charged, 0)
    await new Promise(resolve => setTimeout(resolve, 1_100))
    response = await request('/api/agents/run-due')
    assert.equal(response.status, 200)
    const dueResult = await response.json()
    assert.ok(dueResult.results.some(result => result.agentId === agentId && result.status === 'success'))
    const callsAfterFirst = providerCalls
    response = await request(`/api/agents/${agentId}/run`, { method: 'POST', body: '{}' })
    assert.equal(response.status, 200)
    assert.equal(providerCalls, callsAfterFirst)
    const balanceAfter = (await (await request('/api/credits/balance')).json()).credits
    assert.equal(balanceBefore - balanceAfter, 3)
    let saved = (await (await request('/api/agents')).json()).agents.find(item => item.id === agentId)
    assert.match(saved.campaign.posts[0].providerPostId, /^urn:li:share:/)
    assert.equal(saved.campaign.posts[0].charged, true)
    assert.ok(saved.executionHistory.length >= 1)
    assert.equal(saved.executionsDone, 1)
    assert.equal(saved.successfulRuns, 1)
    assert.equal(saved.failedRuns, 0)
    assert.equal(saved.successRate, 100)
    assert.ok(saved.lastRunAt)
    app.child.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 500))
    app = await startApp(port)
    saved = (await (await request('/api/agents')).json()).agents.find(item => item.id === agentId)
    assert.equal(saved.campaign.posts[0].status, 'posted')
    assert.match(saved.campaign.posts[0].providerPostId, /^urn:li:share:/)
  } finally { app.child.kill('SIGTERM') }
})

await test('Provider success without post ID does not charge and records failure for retry', async () => {
  const port = 4900 + Math.floor(Math.random() * 100)
  const app = await startApp(port)
  const userId = `linkedin-failure-${randomUUID()}`
  const email = `${userId}@test.local`
  const headers = { 'content-type': 'application/json', 'x-local-user-id': userId, 'x-local-user-email': email }
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } })
  const agentId = `linkedin-failure-agent-${randomUUID()}`
  try {
    await request('/api/connectors/save', { method: 'POST', body: JSON.stringify({ platform: 'linkedin', tokens: { access_token: 'test-token', author_urn: 'urn:li:person:test-member', expiry: Date.now() + 3600_000 }, scopes: ['w_member_social'] }) })
    const scheduledAt = new Date(Date.now() + 60_000).toISOString()
    const agent = { id: agentId, type: 'campaign', name: 'Failure test', description: 'Failure test', trigger: { type: 'campaign', cron: 'campaign', nextRun: scheduledAt }, status: 'awaiting_approval', approved: false, actions: [], executionHistory: [], permissions: ['linkedin'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), campaign: { name: 'Failure test', description: 'test', brand: { business: 'AlphaTekx', audience: 'Founders', tone: 'Professional', website: '', dontPost: [] }, meta: { platforms: ['linkedin'], slots: [], durationDays: 1, postsPerDay: 1, totalPosts: 1, startDate: scheduledAt, includeImages: false, timezone: 'UTC', frequencyText: 'One time' }, posts: [{ id: `post-${randomUUID()}`, day: 1, slot: '09:00', scheduledAt, platforms: ['linkedin'], topic: 'test', postType: 'educational', captions: { linkedin: 'NO_ID' }, status: 'pending_approval', result: {}, credits: 3 }], totalCredits: 3, status: 'pending_approval', charged: false, approved: false, autoPublish: false } }
    await request('/api/agents', { method: 'POST', body: JSON.stringify({ agent }) })
    const before = (await (await request('/api/credits/balance')).json()).credits
    await request(`/api/agents/campaign/${agentId}/activate`, { method: 'POST', body: JSON.stringify({ autoPublish: true, startAt: scheduledAt }) })
    const execution = (await (await request(`/api/agents/${agentId}/run`, { method: 'POST', body: '{}' })).json()).execution
    assert.equal(execution.status, 'error')
    assert.equal(execution.credits_used, 0)
    const after = (await (await request('/api/credits/balance')).json()).credits
    assert.equal(after, before)
    const saved = (await (await request('/api/agents')).json()).agents.find(item => item.id === agentId)
    assert.equal(saved.campaign.posts[0].charged, false)
    assert.equal(saved.campaign.posts[0].status, 'scheduled')
    assert.equal(saved.campaign.posts[0].retryCount, 1)
    assert.equal(saved.executionsDone, 1)
    assert.equal(saved.successfulRuns, 0)
    assert.equal(saved.failedRuns, 1)
    assert.equal(saved.successRate, 0)
    assert.equal(saved.executionHistory[0].status, 'error')
    assert.ok(new Date(saved.trigger.nextRun).getTime() > Date.now())
  } finally { app.child.kill('SIGTERM') }
})

await test('Exact one-post review prompt creates one non-recurring draft without extra questions', async () => {
  const records = new Map()
  const calls = []
  const requiredSentence = 'Tell AlphaTekx the result you want. Watch Alpha get it done.'
  const engine = createConversationEngine({
    saveServerAgent: async record => { records.set(record.id, structuredClone(record)); return record },
    getServerAgent: async id => structuredClone(records.get(id)),
    getUserCredits: async () => 30,
    spendUserCredits: async () => true,
    getIntegrationStatus: async () => ({ connected: true, ready: true, scopes: ['w_member_social'], identifier: 'urn:li:person:test-member' }),
    callLLMForRole: async role => {
      calls.push(role)
      if (role !== 'content') return { result: {}, provider: 'test', model: 'test', generationMode: 'model' }
      return { result: { calendar: [{ day: 1, slot: 'morning', platforms: ['linkedin'], topic: 'AlphaTekx', postType: 'product', captions: { linkedin: `One intelligent AI for getting work done.\n\n${requiredSentence}\n\n#AlphaTekx #AI #Startups` } }] }, provider: 'test', model: 'test', generationMode: 'model' }
    },
  })
  const prompt = `Create one LinkedIn post introducing AlphaTekx.

Audience: startup founders, creators, freelancers, and small business owners.

Tone: confident, professional, exciting, and human.

Explain that AlphaTekx is one intelligent AI that understands what users want, asks the right questions, generates content, schedules it, and publishes it after approval.

Include this sentence:

“${requiredSentence}”

Use no more than five relevant hashtags.

Create only one post.
Do not schedule a recurring campaign.
Show me the post for review before publishing.`
  const conversation = await engine.start({ id: 'exact-prompt-user', email: 'exact@test.local' }, prompt)
  assert.deepEqual(calls, ['content'], JSON.stringify({ calls, knownFields: conversation.knownFields, missingFields: conversation.missingFields, askedFields: conversation.askedFields }))
  assert.equal(conversation.conversationStage, 'awaiting_content_review')
  assert.equal(conversation.generatedContent.length, 1)
  assert.equal(conversation.automationDraft.campaign.meta.totalPosts, 1)
  assert.equal(conversation.automationDraft.campaign.meta.durationDays, 1)
  assert.equal(conversation.automationDraft.campaign.meta.frequency, 'once')
  assert.equal(conversation.automationDraft.approved, false)
  assert.match(conversation.generatedContent[0].captions.linkedin, new RegExp(requiredSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

await test('Production regression: overdue scheduler run without LinkedIn readiness is recorded honestly', async () => {
  const port = 5000 + Math.floor(Math.random() * 100)
  const app = await startApp(port)
  const userId = `linkedin-regression-${randomUUID()}`
  const headers = { 'content-type': 'application/json', 'x-local-user-id': userId, 'x-local-user-email': `${userId}@test.local` }
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } })
  const agentId = `linkedin-regression-agent-${randomUUID()}`
  const postId = `post-${randomUUID()}`
  const overdueAt = new Date(Date.now() - 10 * 60_000).toISOString()
  const blockedCaption = `This must not be sent without a ready connection: ${randomUUID()}`
  try {
    const agent = { id: agentId, type: 'campaign', name: 'Social Content - 7 days', description: 'Regression fixture', trigger: { type: 'campaign', cron: 'campaign', nextRun: overdueAt }, status: 'running', approved: true, actions: [], executionHistory: [], executionsDone: 0, successRate: 100, permissions: ['linkedin'], createdAt: overdueAt, updatedAt: overdueAt, campaign: { name: 'Social Content - 7 days', description: 'test', brand: { business: 'AlphaTekx', audience: 'Founders', tone: 'Professional', website: '', dontPost: [] }, meta: { platforms: ['linkedin'], slots: [], durationDays: 7, postsPerDay: 1, totalPosts: 1, startDate: overdueAt, includeImages: false, timezone: 'Africa/Lagos', frequencyText: 'Daily' }, posts: [{ id: postId, day: 1, slot: '09:00', scheduledAt: overdueAt, platforms: ['linkedin'], topic: 'test', postType: 'educational', captions: { linkedin: blockedCaption }, status: 'scheduled', approved: true, charged: false, result: {}, credits: 3 }], totalCredits: 3, status: 'running', charged: false, approved: true, autoPublish: true } }
    assert.equal((await request('/api/agents', { method: 'POST', body: JSON.stringify({ agent }) })).status, 200)
    const before = (await (await request('/api/credits/balance')).json()).credits
    const due = await (await request('/api/agents/run-due')).json()
    assert.ok(due.results.some(result => result.agentId === agentId && result.status === 'error'))
    assert.equal(providerRequests.includes(blockedCaption), false)
    const after = (await (await request('/api/credits/balance')).json()).credits
    assert.equal(after, before)
    const saved = (await (await request('/api/agents')).json()).agents.find(item => item.id === agentId)
    assert.equal(saved.executionsDone, 1)
    assert.equal(saved.successRate, 0)
    assert.equal(saved.executionHistory.length, 1)
    assert.equal(saved.executionHistory[0].status, 'error')
    assert.equal(saved.campaign.completedCount, 0)
    assert.ok(new Date(saved.trigger.nextRun).getTime() > Date.now())
    assert.equal(saved.campaign.posts[0].charged, false)
  } finally { app.child.kill('SIGTERM') }
})

provider.close()
const passed = tests.filter(item => item.ok).length
console.log('LINKEDIN_TESTS:')
for (const item of tests) console.log(`- ${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` — ${item.error}` : ''}`)
console.log(`- Total: ${tests.length}, Passed: ${passed}, Failed: ${tests.length - passed}`)
if (passed !== tests.length) process.exit(1)
console.log('LINKEDIN_TESTS_OK')
