import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  connectorFeatureAccess,
  featureStatusForUser,
  unavailableConnectorMessage,
  updateFeature,
} from '../server/featureAccess.mjs'

const tests = []
async function test(name, fn) {
  try { await fn(); tests.push({ name, ok: true }) }
  catch (error) { tests.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }) }
}

const admin = { id: 'admin', email: 'iamdan4live@gmail.com' }
const publicUser = { id: 'public', email: 'public@example.com' }

await test('admin account is treated like a normal user for launch', () => {
  const status = featureStatusForUser(admin)
  assert.equal(status.admin, false)
  assert.equal(connectorFeatureAccess(admin, 'facebook').admin, false)
})

await test('released tools are controlled by code and remain public', () => {
  for (const platform of ['linkedin', 'facebook', 'instagram', 'whatsapp', 'x', 'google', 'gmail', 'google_drive', 'notion', 'youtube', 'telegram', 'slack', 'discord']) {
    const access = connectorFeatureAccess(publicUser, platform)
    assert.equal(access.enabled, true, `${platform} should be enabled`)
    assert.equal(access.availability, 'available', `${platform} should be available`)
  }
})

await test('unreleased tools stay disabled', () => {
  for (const platform of ['tiktok', 'company_builder', 'image_generator', 'video_generator']) {
    const access = connectorFeatureAccess(publicUser, platform)
    assert.equal(access.enabled, false, `${platform} should stay disabled`)
    assert.equal(access.availability, 'coming_soon')
  }
})

await test('feature update API is retired for launch', async () => {
  await assert.rejects(
    updateFeature({}, 'facebook', { state: 'disabled', stopExisting: true }, admin),
    /Feature management is disabled for launch/
  )
  assert.equal(connectorFeatureAccess(publicUser, 'facebook').enabled, true)
  assert.equal(unavailableConnectorMessage('tiktok'), 'TikTok integration is coming soon. LinkedIn is available now.')
})

await test('admin feature management UI and routes are removed from workspace', () => {
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const layout = fs.readFileSync(new URL('../src/components/workspace/WorkspaceLayout.tsx', import.meta.url), 'utf8')
  const connectors = fs.readFileSync(new URL('../src/pages/Connectors.tsx', import.meta.url), 'utf8')
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /AdminFeatures/)
  assert.match(app, /path="\/admin\/features" element=\{toDashboard\}/)
  assert.doesNotMatch(layout, /Feature Management/)
  assert.doesNotMatch(layout, /isAdmin/)
  assert.match(connectors, /Public tools active/)
  assert.doesNotMatch(connectors, /Admin access active/)
  assert.match(server, /Feature management is disabled for launch/)
})

await test('admin credit bypass is removed from client and server paths', () => {
  const adminAccess = fs.readFileSync(new URL('../src/lib/adminAccess.ts', import.meta.url), 'utf8')
  const creditStore = fs.readFileSync(new URL('../src/lib/creditStore.ts', import.meta.url), 'utf8')
  const auth = fs.readFileSync(new URL('../src/lib/auth.tsx', import.meta.url), 'utf8')
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(adminAccess, /return false/)
  assert.doesNotMatch(creditStore, /999999|result\.admin|iamdan4live@gmail.com/)
  assert.doesNotMatch(auth, /999999|plan: 'admin'/)
  assert.match(server, /function isAdminAuthUser[\s\S]*return false/)
})

await test('stale local identity is not mixed with bearer authentication', () => {
  const integrations = fs.readFileSync(new URL('../src/lib/integrations.ts', import.meta.url), 'utf8')
  const auth = fs.readFileSync(new URL('../src/lib/auth.tsx', import.meta.url), 'utf8')
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(integrations, /\.\.\.\(!authToken \? getLocalUserHeader\(\) : \{\}\)/)
  assert.match(integrations, /refreshSession/)
  assert.match(auth, /localStorage\.removeItem\(LOCAL_USER_KEY\)/)
  assert.match(server, /headers\.authorization.*Bearer/)
})

const failed = tests.filter(item => !item.ok)
console.log('ADMIN_FEATURE_MANAGEMENT_TESTS:')
for (const item of tests) console.log(`- ${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` — ${item.error}` : ''}`)
console.log(`- Total: ${tests.length}, Passed: ${tests.length - failed.length}, Failed: ${failed.length}`)
if (failed.length) process.exit(1)
console.log('ADMIN_FEATURE_MANAGEMENT_TESTS_OK')
