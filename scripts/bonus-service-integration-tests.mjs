import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'

const apiPort = 4324
const supabasePort = 4325
const profiles = new Map()
const transactions = []
const claims = []
const users = {
  'normal-a': { id: '10000000-0000-0000-0000-000000000001', email: 'a@example.com' },
  'normal-b': { id: '10000000-0000-0000-0000-000000000002', email: 'b@example.com' },
  supervisor: { id: '10000000-0000-0000-0000-000000000003', email: 'boss@example.com' },
}

const json = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value))
}
const body = req => new Promise(resolve => {
  let raw = ''
  req.on('data', chunk => { raw += chunk })
  req.on('end', () => resolve(raw ? JSON.parse(raw) : {}))
})

const mock = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${supabasePort}`)
  if (url.pathname === '/auth/v1/user') {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const user = users[token]
    if (!user) return json(res, 401, { message: 'invalid token' })
    return json(res, 200, {
      ...user,
      app_metadata: { provider: 'google' },
      user_metadata: { sub: `google-${token}` },
      identities: [{ id: `google-${token}`, provider: 'google', identity_data: { email: user.email } }],
    })
  }

  assert.equal(req.headers.apikey, 'service-role-test', 'service-role key was not used')
  if (url.pathname === '/rest/v1/profiles' && req.method === 'GET') {
    const id = url.searchParams.get('id')?.replace(/^eq\./, '')
    return json(res, 200, profiles.has(id) ? [profiles.get(id)] : [])
  }
  if (url.pathname === '/rest/v1/profiles' && req.method === 'POST') {
    const value = await body(req)
    if (!profiles.has(value.id)) profiles.set(value.id, { id: value.id, credits: value.credits || 0, purchased_credits: value.purchased_credits || 0 })
    return json(res, 201, [profiles.get(value.id)])
  }
  if (url.pathname === '/rest/v1/profiles' && req.method === 'PATCH') {
    const id = url.searchParams.get('id')?.replace(/^eq\./, '')
    profiles.set(id, { ...profiles.get(id), ...await body(req) })
    return json(res, 204, null)
  }
  if (url.pathname === '/rest/v1/credit_transactions' && req.method === 'GET') {
    const userId = url.searchParams.get('user_id')?.replace(/^eq\./, '')
    const reference = url.searchParams.get('reference')?.replace(/^eq\./, '')
    return json(res, 200, transactions.filter(item => item.user_id === userId && item.reference === reference))
  }
  if (url.pathname === '/rest/v1/credit_transactions' && req.method === 'POST') {
    const value = await body(req)
    transactions.push({ id: `tx-${transactions.length + 1}`, ...value })
    return json(res, 201, value)
  }
  if (url.pathname === '/rest/v1/device_claims' && req.method === 'GET') {
    const filter = decodeURIComponent(url.searchParams.get('or') || '')
    const fingerprint = filter.match(/fingerprint_hash\.eq\.([^,)]+)/)?.[1]
    const sub = filter.match(/google_sub\.eq\.([^,)]+)/)?.[1]
    return json(res, 200, claims.filter(item => item.fingerprint_hash === fingerprint || item.google_sub === sub))
  }
  if (url.pathname === '/rest/v1/device_claims' && req.method === 'POST') {
    const value = await body(req)
    if (claims.some(item => item.fingerprint_hash === value.fingerprint_hash || item.google_sub === value.google_sub)) return json(res, 409, { message: 'duplicate' })
    claims.push({ id: `claim-${claims.length + 1}`, ...value })
    return json(res, 201, [value])
  }
  if (url.pathname === '/rest/v1/device_claims' && req.method === 'DELETE') return json(res, 204, null)
  return json(res, 404, { message: `mock route missing: ${req.method} ${url.pathname}` })
})

const request = async (path, token, payload) => {
  const response = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  return { status: response.status, body: await response.json() }
}

await new Promise(resolve => mock.listen(supabasePort, '127.0.0.1', resolve))
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PORT: String(apiPort),
    VITE_SUPABASE_URL: `http://127.0.0.1:${supabasePort}`,
    VITE_SUPABASE_ANON_KEY: 'anon-test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    DEVICE_FINGERPRINT_SECRET: 'integration-test-secret',
    SUPER_ADMIN_EMAILS: 'boss@example.com',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
child.stdout.on('data', value => { serverOutput += value })
child.stderr.on('data', value => { serverOutput += value })

try {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${apiPort}/api/health`)).status < 500) break
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  const firstGoogle = await request('/api/auth/welcome-credit/google', 'normal-a')
  assert.equal(firstGoogle.status, 200)
  assert.equal(firstGoogle.body.credits, 1)
  const repeatedGoogle = await request('/api/auth/welcome-credit/google', 'normal-a')
  assert.equal(repeatedGoogle.body.credits, 1, 'repeat login granted another Google credit')

  const firstHuman = await request('/api/verify-bonus', 'normal-a', { fingerprintHash: 'device-fingerprint-a-123456' })
  assert.equal(firstHuman.status, 200)
  assert.equal(firstHuman.body.success, true)
  assert.equal(firstHuman.body.credits, 10)

  const secondGoogle = await request('/api/auth/welcome-credit/google', 'normal-b')
  assert.equal(secondGoogle.body.credits, 1)
  const duplicateDevice = await request('/api/verify-bonus', 'normal-b', { fingerprintHash: 'device-fingerprint-a-123456' })
  assert.equal(duplicateDevice.body.success, false)
  assert.equal(duplicateDevice.body.credits, 1)

  const supervisor = await request('/api/verify-bonus', 'supervisor')
  assert.equal(supervisor.status, 200)
  assert.equal(supervisor.body.isAdmin, true)
  assert.equal(supervisor.body.credits, 10)
  assert.equal(claims.length, 3, 'unexpected claim count: two Google markers plus one human claim expected')
  assert.equal(claims.filter(item => item.email === users.supervisor.email).length, 0, 'supervisor created a device or Google marker')
  assert.equal(transactions.length, 0, 'credit_transactions should not be read or written')
  process.stdout.write('BONUS_SERVICE_INTEGRATION_OK google=1 idempotent=1 human=10 duplicate=1 supervisor=10 claims=3 transactions=0\n')
} finally {
  child.kill('SIGTERM')
  await new Promise(resolve => mock.close(resolve))
}

if (child.exitCode && child.exitCode !== 0) throw new Error(serverOutput)
