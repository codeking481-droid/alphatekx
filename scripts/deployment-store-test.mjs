#!/usr/bin/env node
/**
 * ALPHATEKX — DEPLOYMENT STORE E2E TEST
 *
 * Boots a mock Supabase (PostgREST wire format), starts the real server
 * against it, and verifies the full deployment lifecycle now lives in the
 * permanent Supabase `deployments` table — never on the filesystem:
 *
 *   1. POST /api/deploy              → row written to deployments table
 *   2. GET  /app/{slug}              → served from deployments table, UTF-8 intact
 *   3. GET  /api/deploy/sites        → listed from deployments table
 *   4. Name conflict                 → 409 driven by deployments table
 *   5. DELETE other user's site      → 403
 *   6. DELETE own site               → row removed from deployments table
 *   7. No *.json files written under data/deployments/deployed
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PORT = 3999
const BASE = `http://127.0.0.1:${PORT}`
const SLUG = 'e2e-store-test'
const MARKER = 'Café ☕ AlphaTekx-UTF8-✓'
const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>E2E</title></head><body><h1>${MARKER}</h1></body></html>`

const OWNER_A = { 'x-local-user-id': '11111111-1111-1111-1111-111111111111', 'x-local-user-email': 'owner-a@test.local' }
const OWNER_B = { 'x-local-user-id': '22222222-2222-2222-2222-222222222222', 'x-local-user-email': 'owner-b@test.local' }

let passed = 0
let failed = 0
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.error(`✖ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ─── Mock Supabase (PostgREST subset for the deployments table) ───────────────
const table = new Map() // name → row
// Simulates the real-world failure: PostgREST's schema cache is stale and
// reports the deployments table as missing until a schema reload is requested.
let cacheStale = true
// Simulates a hand-created table missing owner_id / owner_email / pages columns.
let legacyColumns = false
function startMockSupabase() {
  return new Promise(resolvePromise => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://mock')
      const respond = (status, payload) => {
        const body = JSON.stringify(payload)
        res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
        res.end(body)
      }
      if (!url.pathname.startsWith('/rest/v1/')) return respond(404, { message: 'not found' })
      // The creations mirror does not exist in this test environment.
      if (url.pathname === '/rest/v1/creations') return respond(404, { code: '42P01', message: 'relation "public.creations" does not exist' })
      if (url.pathname === '/rest/v1/rpc/reload_pgrst_schema') {
        if (req.method !== 'POST') return respond(405, { message: 'method not allowed' })
        cacheStale = false
        res.writeHead(204)
        return res.end()
      }
      if (url.pathname !== '/rest/v1/deployments') return respond(404, { message: 'unknown table' })
      const columnError = { code: 'PGRST204', message: "Could not find the 'owner_email' column of 'deployments' in the schema cache" }
      if (cacheStale && req.method === 'GET') {
        return respond(404, { code: 'PGRST205', message: "Could not find the table 'public.deployments' in the schema cache" })
      }
      if (legacyColumns && req.method === 'GET') {
        const sel = url.searchParams.get('select') || ''
        if (/owner_|title|pages/.test(sel)) return respond(404, columnError)
      }

      const filters = {}
      for (const [key, value] of url.searchParams.entries()) {
        if (['select', 'limit', 'order', 'onConflict'].includes(key)) continue
        const eq = value.startsWith('eq.') ? value.slice(3) : null
        if (eq) filters[key] = eq
      }
      const matchRows = () => [...table.values()].filter(row => Object.entries(filters).every(([col, val]) => String(row[col]) === val))

      if (req.method === 'GET') {
        let rows = matchRows()
        const order = url.searchParams.get('order')
        if (order) {
          const [col, dir] = order.split('.')
          rows = rows.slice().sort((a, b) => String(a[col] || '').localeCompare(String(b[col] || '')))
          if (dir === 'desc') rows.reverse()
        }
        const limit = Number(url.searchParams.get('limit') || 0)
        if (limit > 0) rows = rows.slice(0, limit)
        const select = url.searchParams.get('select') || ''
        if (select && !select.includes('html')) rows = rows.map(({ html, ...rest }) => rest)
        return respond(200, rows)
      }
      if (req.method === 'POST') {
        let raw = ''
        req.on('data', chunk => { raw += chunk })
        req.on('end', () => {
          try {
            const rowsIn = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [JSON.parse(raw)]
            if (legacyColumns && rowsIn.some(r => 'owner_id' in r || 'owner_email' in r || 'pages' in r)) {
              return respond(404, columnError)
            }
            const conflictCol = url.searchParams.get('onConflict') || 'name'
            const out = []
            for (const row of rowsIn) {
              const key = String(row[conflictCol])
              const existing = table.get(key)
              const stored = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), owner_id: null, owner_email: null, title: null, ...existing, ...row }
              table.set(key, stored)
              out.push(stored)
            }
            respond(201, out)
          } catch (error) { respond(400, { message: error.message }) }
        })
        return
      }
      if (req.method === 'DELETE') {
        const victims = matchRows()
        for (const row of victims) table.delete(String(row.name))
        return respond(200, victims)
      }
      respond(405, { message: 'method not allowed' })
    })
    server.listen(0, '127.0.0.1', () => resolvePromise(server))
  })
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function request(path, options = {}, headers = {}) {
  const response = await fetch(`${BASE}${path}`, { ...options, headers: { 'content-type': 'application/json', ...headers } })
  const text = await response.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = text }
  return { status: response.status, body, headers: response.headers }
}

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`).catch(() => null)
      if (response?.ok || response?.status) return true
    } catch {}
    await new Promise(r => setTimeout(r, 300))
  }
  return false
}

// ─── Run ──────────────────────────────────────────────────────────────────────
const deployedDirBefore = existsMtime(join(root, 'data', 'deployments', 'deployed'))
const mock = await startMockSupabase()
const mockPort = mock.address().port

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'development',
    PUBLIC_APP_URL: BASE,
    SUPABASE_URL: `http://127.0.0.1:${mockPort}`,
    SUPABASE_SERVICE_KEY: 'test-service-key',
    VITE_SUPABASE_URL: `http://127.0.0.1:${mockPort}`,
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let bootLog = ''
child.stdout.on('data', d => { bootLog += d })
child.stderr.on('data', d => { bootLog += d })

try {
  check('server booted', await waitForServer())
  await new Promise(r => setTimeout(r, 2500)) // allow boot health log + self-heal retry to flush

  // Boot health probe should report the store ready
  check('boot health probe reports Supabase connected + table found',
    /✅ Supabase connected successfully/.test(bootLog) && /✅ Table 'deployments' found/.test(bootLog), bootLog.slice(-400))

  // Stale schema cache must be auto-healed at boot (self-healing retry)
  check('stale schema cache auto-healed at boot', /schema cache reload requested/.test(bootLog), bootLog.slice(-600))

  // Diagnostics endpoint reveals connection + table state
  const statusRes = await request('/api/supabase-status')
  check('supabase-status reports configured + connected', statusRes.body.configured === true && statusRes.body.connected === true, JSON.stringify(statusRes.body))
  check('supabase-status shows deployments table ready', statusRes.body.tableReady === true, JSON.stringify(statusRes.body))
  check('supabase-status never leaks secrets', !JSON.stringify(statusRes.body).toLowerCase().includes('key='), JSON.stringify(statusRes.body))

  // 1. Deploy → permanent storage
  const deployRes = await request('/api/deploy', {
    method: 'POST',
    body: JSON.stringify({ name: SLUG, title: 'E2E Store Test', html: HTML }),
  }, OWNER_A)
  check('POST /api/deploy succeeds', deployRes.status === 200 && deployRes.body?.success === true, JSON.stringify(deployRes.body).slice(0, 300))
  check('returns canonical /app/ URL', deployRes.body?.url === `${BASE}/app/${SLUG}`, deployRes.body?.url)
  check('row landed in Supabase deployments table', table.has(SLUG) && table.get(SLUG)?.html?.includes(MARKER))

  // 2. Serving
  const served = await request(`/app/${SLUG}`)
  check('GET /app/{slug} serves 200', served.status === 200, `status=${served.status}`)
  check('served HTML contains UTF-8 marker', String(served.body).includes(MARKER))
  check('charset=utf-8 header', String(served.headers.get('content-type') || '').includes('charset=utf-8'))

  // 3. Listing
  const listRes = await request('/api/deploy/sites', {}, OWNER_A)
  const listed = Array.isArray(listRes.body?.sites) ? listRes.body.sites.find(s => s.slug === SLUG) : null
  check('GET /api/deploy/sites lists the site', Boolean(listed), JSON.stringify(listRes.body).slice(0, 300))
  check('listing has no sizeBytes (metadata-only read)', listed ? listed.sizeBytes === 0 : false)

  // 4. Conflict detection from permanent storage
  const conflictRes = await request('/api/deploy', {
    method: 'POST',
    body: JSON.stringify({ name: SLUG, title: 'Hijack', html: HTML }),
  }, OWNER_B)
  check('foreign redeploy rejected with 409', conflictRes.status === 409 && conflictRes.body?.available === false, JSON.stringify(conflictRes.body).slice(0, 300))

  // 5. Ownership guard on delete
  const foreignDelete = await request(`/api/deploy/sites/${SLUG}`, { method: 'DELETE' }, OWNER_B)
  check("foreign DELETE blocked with 403", foreignDelete.status === 403, `status=${foreignDelete.status}`)
  check('site still present after blocked delete', table.has(SLUG))

  // 6. Owner delete removes the permanent row
  const deleteRes = await request(`/api/deploy/sites/${SLUG}`, { method: 'DELETE' }, OWNER_A)
  check('owner DELETE succeeds', deleteRes.status === 200 && deleteRes.body?.success === true, JSON.stringify(deleteRes.body).slice(0, 300))
  check('row removed from deployments table', !table.has(SLUG))
  const goneRes = await request(`/app/${SLUG}`)
  check('site no longer served after delete', goneRes.status === 404, `status=${goneRes.status}`)

  // 7. Filesystem untouched
  const deployedDirAfter = existsMtime(join(root, 'data', 'deployments', 'deployed'))
  check(
    'no filesystem writes to data/deployments/deployed during lifecycle',
    deployedDirAfter === deployedDirBefore,
    deployedDirAfter === null && deployedDirBefore === null ? 'both null' : `before=${deployedDirBefore} after=${deployedDirAfter}`,
  )

  // 8. Legacy table (missing owner/title/pages columns) still deploys
  legacyColumns = true
  const LEGACY_SLUG = 'legacy-table-test'
  const legacyRes = await request('/api/deploy', {
    method: 'POST',
    body: JSON.stringify({ name: LEGACY_SLUG, title: 'Legacy Test', html: HTML }),
  }, OWNER_A)
  check('legacy table without owner columns still deploys', legacyRes.status === 200 && legacyRes.body?.success === true, JSON.stringify(legacyRes.body).slice(0, 300))
  const legacyServe = await fetch(`${BASE}/app/${LEGACY_SLUG}`)
  check('legacy-deployed site serves with UTF-8 intact', legacyServe.status === 200 && (await legacyServe.text()).includes(MARKER), `status=${legacyServe.status}`)
} finally {
  child.kill('SIGTERM')
  mock.close()
  setTimeout(() => process.exit(failed > 0 ? 1 : 0), 250).unref()
}

/** Latest mtime of any file in dir, or null when missing/empty-ish. */
function existsMtime(dir) {
  try {
    const files = readdirSync(dir)
    if (!files.length) return null
    return Math.max(...files.map(f => statSync(join(dir, f)).mtimeMs))
  } catch { return null }
}
