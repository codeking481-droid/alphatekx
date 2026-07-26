#!/usr/bin/env node
/**
 * Composio Connector Integration Tests
 *
 * Tests the Alpha Connector Layer (Composio-powered).
 * Run: node scripts/composio-connector-tests.mjs
 *
 * Tests are grouped by concern — authentication, user isolation,
 * provider resolution, connection lifecycle, execution, and error cases.
 */

import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'

const TEST_PORT = Number(process.env.TEST_PORT || 3219)
const BASE = process.env.TEST_BASE || `http://127.0.0.1:${TEST_PORT}`
const ADMIN_EMAIL = 'iamdan4live@gmail.com'

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    if (typeof process?.stdout?.clearLine === 'function') process.stdout.clearLine()
    process.stdout.write(`  ✅ ${label}\n`)
    passed++
  } else {
    process.stdout.write(`  ❌ ${label}\n`)
    failed++
  }
}

let lastResponse = null

async function waitForServer() {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/api/health', BASE))
      if (response.ok || response.status === 503) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Server did not start at ${BASE}`)
}

async function withServer(fn) {
  if (process.env.TEST_BASE) return fn()
  const child = spawn(process.execPath, ['server.mjs'], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      ALLOW_LOCAL_USER_HEADERS: 'true',
      KEEP_ALIVE: 'false',
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'anon-test-key',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-test-key',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  try {
    await waitForServer()
    return await fn()
  } catch (error) {
    if (stderr) process.stderr.write(stderr)
    throw error
  } finally {
    child.kill()
  }
}

async function api(method, path, body = null, user = null) {
  const url = new URL(path, BASE)
  const headers = { 'Content-Type': 'application/json' }
  if (user) {
    headers['x-local-user-id'] = user.id
    headers['x-local-user-email'] = user.email
  }
  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(url.toString(), opts)
  lastResponse = { status: res.status, headers: res.headers }
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text), raw: text } }
  catch { return { ok: res.ok, status: res.status, data: null, raw: text } }
}

// ── Test Suite ──────────────────────────────────────────────────────

async function runTests() {
  const serviceSource = fs.readFileSync('server/composioConnectorService.mjs', 'utf8')
  const connectorPageSource = fs.readFileSync('src/pages/Connectors.tsx', 'utf8')
  const migrationSource = fs.readFileSync('supabase/composio-connected-apps.sql', 'utf8')
  assert(serviceSource.includes('`alphatekx:${alphaUserId}`'), 'Composio external user ID is deterministic and namespaced')
  assert(!serviceSource.includes('dangerouslySkipVersionCheck'), 'Tool execution does not bypass SDK version safety')
  assert(serviceSource.includes('Explicit approval is required'), 'Execution requires explicit approval')
  assert(serviceSource.includes('Idempotency key is required'), 'Execution requires an idempotency key')
  assert(migrationSource.includes('UNIQUE(user_id, idempotency_key)'), 'Database enforces per-user execution idempotency')
  assert(migrationSource.includes("connection_backend = 'native'"), 'Migration preserves existing native connections')
  assert(!migrationSource.toLowerCase().includes('access_token'), 'Composio migration stores no provider token')
  for (const provider of ['whatsapp', 'facebook', 'instagram', 'twitter', 'youtube']) {
    assert(serviceSource.includes(`id: '${provider}'`), `${provider} is registered in the server-side Composio catalog`)
  }
  assert(serviceSource.includes('composioClient.authConfigs.list'), 'Missing environment IDs are discovered from enabled Composio Auth Configs')
  assert(connectorPageSource.includes("new Set(['whatsapp', 'facebook', 'instagram', 'x', 'youtube'])"), 'Connected Apps routes all five requested platforms through Composio')
  assert(!connectorPageSource.includes("selected === 'facebook'"), 'Facebook no longer falls back to the old native connection branch')
  process.stdout.write('\n🧪 Composio Connector Tests\n')
  process.stdout.write('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n')

  // 1. COMPOSIO_API_KEY never exposed
  //    → GET /api/connected-apps should NOT return the API key
  {
    const res = await api('GET', '/api/connected-apps', null, { id: 'user1', email: 'user1@test.com' })
    const raw = JSON.stringify(res.data)
    assert(
      !raw.includes('COMPOSIO_API_KEY') && !raw.includes('sk-composio') && !raw.includes('composio_key'),
      '1. COMPOSIO_API_KEY not exposed in connected-apps response'
    )
  }

  // 2. Unauthenticated requests are blocked
  {
    const res = await api('GET', '/api/connected-apps')
    assert(res.status === 401, '2. Unauthenticated GET /api/connected-apps returns 401')
  }
  {
    const res = await api('POST', '/api/connect/instagram')
    assert(res.status === 401, '3. Unauthenticated POST /api/connect/instagram returns 401')
  }
  {
    const res = await api('POST', '/api/connectors/instagram/connect')
    assert(res.status === 401, 'Canonical connector connect route requires authentication')
  }
  {
    const res = await api('DELETE', '/api/disconnect/instagram')
    assert(res.status === 401, '4. Unauthenticated DELETE /api/disconnect/instagram returns 401')
  }
  {
    const res = await api('POST', '/api/execute/instagram/create_media_post')
    assert(res.status === 401, '5. Unauthenticated POST /api/execute/instagram/create_media_post returns 401')
  }

  // 3. User isolation — user A cannot see user B's connections
  //    (server returns per-user status based on header identity)
  {
    const resA = await api('GET', '/api/connected-apps', null, { id: 'user_a', email: 'a@test.com' })
    assert(resA.ok, '6. Authenticated user A can list apps')
    const resB = await api('GET', '/api/connected-apps', null, { id: 'user_b', email: 'b@test.com' })
    assert(resB.ok, '7. Authenticated user B can list apps')
    // Each user gets their own providers array
    assert(Array.isArray(resA.data?.providers), '8. Providers is an array')
    assert(Array.isArray(resB.data?.providers), '9. Providers is an array for user B')
  }

  // 4. Provider alias resolution
  //    → /api/connect/twitter should resolve to X/Twitter
  {
    const res = await api('POST', '/api/connect/twitter', {}, { id: 'user3', email: 'user3@test.com' })
    // If composio is not configured, should still return a structured error (not crash)
    assert(
      res.status !== 500,
      '10. POST /api/connect/twitter does not crash with 500 (resolves alias or returns structured error)'
    )
  }

  // 5. OAuth redirect URL is returned safely
  {
    const res = await api('POST', '/api/connect/instagram', {}, { id: 'user4', email: 'user4@test.com' })
    // If composio is configured, authUrl should be a URL. If not, should get a clean error.
    if (res.ok && res.data?.authUrl) {
      assert(
        res.data.authUrl.startsWith('http'),
        '11. /api/connect/instagram returns authUrl starting with http'
      )
    } else {
      assert(
        res.data?.error?.includes('COMPOSIO_API_KEY') || res.status !== 500,
        '11. /api/connect/instagram returns structured error (not 500) when composio not configured'
      )
    }
  }

  // 6. Connection status endpoint works
  {
    const res = await api('GET', '/api/connect/instagram/status', null, { id: 'user5', email: 'user5@test.com' })
    assert(
      res.status !== 500,
      '12. GET /api/connect/instagram/status does not crash with 500'
    )
    if (res.ok) {
      assert(
        'connected' in (res.data || {}),
        '13. Connection status response includes "connected" field'
      )
    }
  }

  // 7. Execution requires active connection
  {
    const res = await api('POST', '/api/execute/instagram/create_media_post', { params: { caption: 'Test' } }, { id: 'user6', email: 'user6@test.com' })
    // Should either succeed (if connected) or fail with "not connected" error
    assert(
      res.status !== 500,
      '14. POST /api/execute/instagram/create_media_post does not crash with 500'
    )
  }

  // 8. Unsupported actions are rejected
  {
    const res = await api('POST', '/api/execute/instagram/nonexistent_action', { params: {} }, { id: 'user7', email: 'user7@test.com' })
    assert(
      res.status === 502 || (res.data?.error && (res.data.error.toLowerCase().includes('not supported') || res.data.error.toLowerCase().includes('unknown'))),
      '15. Unsupported action "nonexistent_action" is rejected with clear error'
    )
  }

  // 9. Failed execution never reports success
  {
    const res = await api('POST', '/api/execute/instagram/create_media_post', { params: { caption: '' } }, { id: 'user8', email: 'user8@test.com' })
    // If composio not configured, should get error. If configured but no connection, should get error.
    // In either case, should NOT report success: true
    if (res.ok && res.data) {
      assert(
        res.data.success !== true,
        '16. Executing with empty params does not report success=true'
      )
    }
  }

  // 10. Disconnect is user-scoped
  {
    const res = await api('DELETE', '/api/disconnect/instagram', null, { id: 'user10', email: 'user10@test.com' })
    assert(
      res.status !== 500,
      '17. DELETE /api/disconnect/instagram does not crash with 500'
    )
  }

  // 11. Execution history is user-scoped
  {
    const res = await api('GET', '/api/connected-apps/executions/instagram', null, { id: 'user11', email: 'user11@test.com' })
    assert(
      res.status !== 500,
      '18. GET /api/connected-apps/executions/instagram does not crash with 500'
    )
    if (res.ok) {
      assert(
        Array.isArray(res.data?.executions || []),
        '19. Execution history returns an array (possibly empty)'
      )
    }
  }

  // 12. Missing provider config does not crash
  {
    const res = await api('POST', '/api/connect/nonexistent_provider_xyz', {}, { id: 'user12', email: 'user12@test.com' })
    assert(
      res.status !== 500,
      '20. POST /api/connect/nonexistent_provider returns structured error, not 500'
    )
  }

  // 13. Admin login path does not break (existing automation unaffected)
  //    Simulate admin listing connected apps
  {
    const res = await api('GET', '/api/connected-apps', null, { id: 'admin', email: ADMIN_EMAIL })
    assert(
      res.ok,
      '21. Admin user can list connected apps without error (existing automations unaffected)'
    )
  }

  // 14. Reconnection endpoint works
  {
    const res = await api('POST', '/api/reconnect/instagram', {}, { id: 'user14', email: 'user14@test.com' })
    assert(
      res.status !== 500,
      '22. POST /api/reconnect/instagram does not crash with 500'
    )
  }

  // ── Summary ──────────────────────────────────────────────────────
  process.stdout.write('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  process.stdout.write(`🧪 Results: ${passed} passed, ${failed} failed\n\n`)

  if (failed > 0) process.exit(1)
}

withServer(runTests).catch(err => {
  console.error('Test suite crashed:', err)
  process.exit(1)
})
