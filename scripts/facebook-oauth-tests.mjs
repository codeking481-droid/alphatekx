import assert from 'node:assert/strict'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { buildCapabilityPlan, detectCapability } from '../server/automation/capabilityRegistry.mjs'

const tests = []
let publishCalls = 0
async function test(name, fn) {
  try { await fn(); tests.push({ name, ok: true }) }
  catch (error) { tests.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }) }
}

await test('Facebook one-post request is detected as a supported Page publishing capability', () => {
  const prompt = 'Create one Facebook post about AlphaTekx for startup founders. Show it for review before publishing.'
  assert.equal(detectCapability(prompt)?.id, 'facebook-post')
  const plan = buildCapabilityPlan(prompt)
  assert.equal(plan.unsupported, undefined)
  assert.equal(plan.actions[0].connector, 'facebook')
  assert.equal(plan.actions[0].requiresApproval, true)
})

const provider = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  res.setHeader('content-type', 'application/json')
  if (url.pathname === '/v22.0/oauth/access_token') {
    assert.equal(url.searchParams.get('redirect_uri'), 'https://alphatekx.name.ng/api/connectors/facebook/callback')
    res.end(JSON.stringify({ access_token: 'facebook-user-token', expires_in: 3600 }))
    return
  }
  if (url.pathname === '/v22.0/me/accounts') {
    res.end(JSON.stringify({ data: [{ id: 'page-123', name: 'AlphaTekx Test Page', access_token: 'facebook-page-token', tasks: ['CREATE_CONTENT'] }] }))
    return
  }
  if (url.pathname === '/v22.0/me') {
    res.end(JSON.stringify({ id: 'facebook-user-123', name: 'Test User', email: 'facebook@test.local' }))
    return
  }
  if (url.pathname === '/v22.0/page-123' && req.method === 'GET') {
    res.end(JSON.stringify({ id: 'page-123', name: 'AlphaTekx Test Page' }))
    return
  }
  if (url.pathname === '/v22.0/page-123/feed' && req.method === 'POST') {
    publishCalls++
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      const body = JSON.parse(raw || '{}')
      res.end(JSON.stringify(body.message === 'NO_ID' ? {} : { id: `page-123_${publishCalls}` }))
    })
    return
  }
  res.statusCode = 404
  res.end(JSON.stringify({ error: { message: 'not found' } }))
})
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
const providerPort = provider.address().port

const appPort = 42000 + Math.floor(Math.random() * 1000)
const app = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PORT: String(appPort),
    KEEP_ALIVE: 'false',
    PUBLIC_APP_URL: `http://127.0.0.1:${appPort}`,
    META_APP_ID: 'facebook-app-id',
    META_APP_SECRET: 'facebook-app-secret',
    META_REDIRECT_URI: 'https://alphatekx.name.ng/api/connectors/facebook/callback',
    FACEBOOK_GRAPH_BASE_URL: `http://127.0.0.1:${providerPort}/v22.0`,
    FACEBOOK_OAUTH_DIALOG_URL: 'https://www.facebook.com/v22.0/dialog/oauth',
    SUPABASE_SERVICE_ROLE_KEY: '',
    VITE_SUPABASE_URL: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
app.stdout.on('data', chunk => { output += chunk })
app.stderr.on('data', chunk => { output += chunk })
for (let attempt = 0; attempt < 60; attempt++) {
  try { if ((await fetch(`http://127.0.0.1:${appPort}/api/health`)).ok) break } catch {}
  if (attempt === 59) throw new Error(`Server did not start: ${output}`)
  await new Promise(resolve => setTimeout(resolve, 100))
}

const userId = `facebook-oauth-${randomUUID()}`
const headers = { 'content-type': 'application/json', 'x-local-user-id': userId, 'x-local-user-email': `${userId}@test.local` }
let state = ''

try {
  await test('Facebook OAuth start uses the exact configured redirect URI and required Page scopes', async () => {
    const response = await fetch(`http://127.0.0.1:${appPort}/api/connectors/facebook/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ redirect: '/connected-apps' }),
    })
    assert.equal(response.status, 200)
    const payload = await response.json()
    const authorization = new URL(payload.url)
    assert.equal(authorization.searchParams.get('redirect_uri'), 'https://alphatekx.name.ng/api/connectors/facebook/callback')
    assert.equal(payload.redirectUri, 'https://alphatekx.name.ng/api/connectors/facebook/callback')
    const scopes = authorization.searchParams.get('scope').split(',')
    for (const required of ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']) assert.ok(scopes.includes(required))
    state = authorization.searchParams.get('state')
    assert.ok(state)
  })

  await test('Facebook callback stores managed Pages pending explicit selection without reporting connected', async () => {
    const response = await fetch(`http://127.0.0.1:${appPort}/api/connectors/facebook/callback?code=test-code&state=${encodeURIComponent(state)}`, { redirect: 'manual' })
    assert.equal(response.status, 302)
    const destination = new URL(response.headers.get('location'))
    assert.equal(destination.pathname, '/connected-apps')
    assert.equal(destination.searchParams.get('connected'), 'facebook_select')
    const status = await (await fetch(`http://127.0.0.1:${appPort}/api/integrations/status`, { headers })).json()
    assert.equal(status.facebook.connected, false)
    const pagePayload = await (await fetch(`http://127.0.0.1:${appPort}/api/connectors/facebook/pages`, { headers })).json()
    assert.deepEqual(pagePayload.pages, [{ id: 'page-123', name: 'AlphaTekx Test Page' }])
    assert.equal(JSON.stringify(pagePayload).includes('token'), false)
  })

  await test('Selecting and verifying a Page is required before Facebook becomes connected', async () => {
    const response = await fetch(`http://127.0.0.1:${appPort}/api/connectors/facebook/select-page`, { method: 'POST', headers, body: JSON.stringify({ pageId: 'page-123' }) })
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.deepEqual(payload.page, { id: 'page-123', name: 'AlphaTekx Test Page' })
    const status = await (await fetch(`http://127.0.0.1:${appPort}/api/integrations/status`, { headers })).json()
    assert.equal(status.facebook.connected, true)
    assert.equal(status.facebook.identifier, 'page-123')
  })

  await test('Facebook OAuth denial returns safely to Connected Apps without storing success', async () => {
    const response = await fetch(`http://127.0.0.1:${appPort}/api/connectors/facebook/callback?error=access_denied&error_description=User%20cancelled`, { redirect: 'manual' })
    assert.equal(response.status, 302)
    const destination = new URL(response.headers.get('location'))
    assert.equal(destination.pathname, '/connected-apps')
    assert.equal(destination.searchParams.get('connected'), 'error')
    assert.match(destination.searchParams.get('reason'), /denied/i)
  })

  await test('Approved one-post Publish Now confirms an ID, charges once, writes history, and does not duplicate', async () => {
    const agentId = `facebook-agent-${randomUUID()}`
    const scheduledAt = new Date(Date.now() + 60_000).toISOString()
    const agent = {
      id: agentId, type: 'campaign', name: 'Facebook one post', description: 'Focused Facebook test',
      trigger: { type: 'campaign', cron: 'campaign', nextRun: scheduledAt }, status: 'awaiting_approval', approved: false,
      actions: [], executionHistory: [], permissions: ['facebook'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      campaign: {
        name: 'Facebook one post', description: 'test', brand: { business: 'AlphaTekx', audience: 'Founders', tone: 'Professional', website: '', dontPost: [] },
        meta: { platforms: ['facebook'], slots: [{ label: '09:00', hour: 9, minute: 0 }], durationDays: 1, postsPerDay: 1, totalPosts: 1, startDate: scheduledAt, includeImages: false, timezone: 'UTC', frequency: 'once', frequencyText: 'One time' },
        posts: [{ id: `post-${randomUUID()}`, day: 1, slot: '09:00', scheduledAt, platforms: ['facebook'], topic: 'AlphaTekx', postType: 'educational', captions: { facebook: 'One approved Facebook Page post.' }, status: 'pending_approval', result: {}, credits: 3 }],
        totalCredits: 3, status: 'pending_approval', charged: false, approved: false, autoPublish: false,
      },
    }
    assert.equal((await fetch(`http://127.0.0.1:${appPort}/api/agents`, { method: 'POST', headers, body: JSON.stringify({ agent }) })).status, 200)
    const reviewResponse = await fetch(`http://127.0.0.1:${appPort}/api/agents/campaign/${agentId}/review`, { method: 'POST', headers, body: JSON.stringify({ postId: agent.campaign.posts[0].id, platform: 'facebook', action: 'edit', text: 'Edited and explicitly approved Facebook Page post.' }) })
    assert.equal(reviewResponse.status, 200)
    const reviewed = await reviewResponse.json()
    assert.equal(reviewed.post.approved, false)
    assert.equal(reviewed.agent.campaign.approved, false)
    const before = (await (await fetch(`http://127.0.0.1:${appPort}/api/credits/balance`, { headers })).json()).credits
    const response = await fetch(`http://127.0.0.1:${appPort}/api/agents/campaign/${agentId}/activate`, { method: 'POST', headers, body: JSON.stringify({ autoPublish: true, postingOption: 'now', timezone: 'UTC' }) })
    const result = await response.json()
    assert.equal(response.status, 200, JSON.stringify(result))
    const post = result.agent.campaign.posts[0]
    assert.match(post.providerPostId, /^page-123_/)
    assert.equal(post.status, 'posted')
    assert.equal(post.charged, true)
    assert.equal(post.result.facebook.pageId, 'page-123')
    assert.equal(post.result.facebook.pageName, 'AlphaTekx Test Page')
    assert.equal(result.agent.executionHistory[0].status, 'success')
    assert.equal(result.agent.executionHistory[0].steps[0].content, 'Edited and explicitly approved Facebook Page post.')
    const after = (await (await fetch(`http://127.0.0.1:${appPort}/api/credits/balance`, { headers })).json()).credits
    assert.equal(before - after, 3)
    const callsAfterSuccess = publishCalls
    await fetch(`http://127.0.0.1:${appPort}/api/agents/campaign/${agentId}/activate`, { method: 'POST', headers, body: JSON.stringify({ autoPublish: true, postingOption: 'now', timezone: 'UTC' }) })
    assert.equal(publishCalls, callsAfterSuccess)
    const afterDuplicate = (await (await fetch(`http://127.0.0.1:${appPort}/api/credits/balance`, { headers })).json()).credits
    assert.equal(afterDuplicate, after)
  })

  await test('Missing Facebook post ID is a failure and never charges', async () => {
    const agentId = `facebook-no-id-${randomUUID()}`
    const scheduledAt = new Date(Date.now() + 60_000).toISOString()
    const agent = {
      id: agentId, type: 'campaign', name: 'Facebook missing ID', description: 'Failure fixture',
      trigger: { type: 'campaign', cron: 'campaign', nextRun: scheduledAt }, status: 'awaiting_approval', approved: false,
      actions: [], executionHistory: [], permissions: ['facebook'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      campaign: { name: 'Facebook missing ID', description: 'test', brand: { business: 'AlphaTekx', audience: 'Founders', tone: 'Professional', website: '', dontPost: [] }, meta: { platforms: ['facebook'], slots: [], durationDays: 1, postsPerDay: 1, totalPosts: 1, startDate: scheduledAt, includeImages: false, timezone: 'UTC', frequency: 'once', frequencyText: 'One time' }, posts: [{ id: `post-${randomUUID()}`, day: 1, slot: '09:00', scheduledAt, platforms: ['facebook'], topic: 'test', postType: 'educational', captions: { facebook: 'NO_ID' }, status: 'pending_approval', result: {}, credits: 3 }], totalCredits: 3, status: 'pending_approval', charged: false, approved: false, autoPublish: false },
    }
    await fetch(`http://127.0.0.1:${appPort}/api/agents`, { method: 'POST', headers, body: JSON.stringify({ agent }) })
    const before = (await (await fetch(`http://127.0.0.1:${appPort}/api/credits/balance`, { headers })).json()).credits
    const response = await fetch(`http://127.0.0.1:${appPort}/api/agents/campaign/${agentId}/activate`, { method: 'POST', headers, body: JSON.stringify({ autoPublish: true, postingOption: 'now', timezone: 'UTC' }) })
    assert.equal(response.status, 502)
    const saved = (await (await fetch(`http://127.0.0.1:${appPort}/api/agents`, { headers })).json()).agents.find(item => item.id === agentId)
    assert.equal(saved.campaign.posts[0].charged, false)
    assert.equal(saved.executionHistory[0].status, 'error')
    const after = (await (await fetch(`http://127.0.0.1:${appPort}/api/credits/balance`, { headers })).json()).credits
    assert.equal(after, before)
  })
} finally {
  app.kill('SIGTERM')
  provider.close()
}

const passed = tests.filter(item => item.ok).length
console.log('FACEBOOK_OAUTH_TESTS:')
for (const item of tests) console.log(`- ${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` — ${item.error}` : ''}`)
console.log(`- Total: ${tests.length}, Passed: ${passed}, Failed: ${tests.length - passed}`)
if (passed !== tests.length) process.exit(1)
console.log('FACEBOOK_OAUTH_TESTS_OK')
