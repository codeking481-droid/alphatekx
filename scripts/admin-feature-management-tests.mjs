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

await test('verified admin account regains admin authority', () => {
  const status = featureStatusForUser(admin)
  assert.equal(status.admin, true)
  assert.equal(connectorFeatureAccess(admin, 'facebook').admin, true)
})

await test('released native tools remain public', () => {
  for (const platform of ['linkedin', 'google', 'gmail', 'google_drive', 'youtube', 'telegram', 'discord']) {
    const access = connectorFeatureAccess(publicUser, platform)
    assert.equal(access.enabled, true, `${platform} should be enabled`)
    assert.equal(access.availability, 'available', `${platform} should be available`)
  }
})

await test('Composio and Meta beta tools are limited to trusted testers', () => {
  for (const platform of ['notion', 'slack', 'airtable', 'shopify', 'facebook', 'instagram', 'whatsapp', 'x']) {
    assert.equal(connectorFeatureAccess(publicUser, platform).enabled, false, `${platform} should not be public`)
    assert.equal(connectorFeatureAccess(admin, platform).enabled, true, `${platform} should be available to admin beta testing`)
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
  assert.equal(connectorFeatureAccess(publicUser, 'facebook').enabled, false)
  assert.equal(unavailableConnectorMessage('tiktok'), 'TikTok integration is coming soon. LinkedIn is available now.')
})

await test('admin operations return while feature toggles remain retired', () => {
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const layout = fs.readFileSync(new URL('../src/components/workspace/WorkspaceLayout.tsx', import.meta.url), 'utf8')
  const connectors = fs.readFileSync(new URL('../src/pages/Connectors.tsx', import.meta.url), 'utf8')
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /AdminFeatures/)
  assert.equal(app.includes('path="/admin" element={protectedPage(<Admin />)}'), true)
  assert.match(app, /path="\/admin\/features" element=\{toDashboard\}/)
  assert.doesNotMatch(layout, /Feature Management/)
  assert.match(layout, /isAdminUser/)
  assert.match(layout, />Admin<\/NavLink>/)
  assert.match(connectors, /Public tools active/)
  assert.doesNotMatch(connectors, /Admin access active/)
  assert.match(server, /Feature management is disabled for launch/)
})

await test('verified admin receives admin credit authority only after authenticated identity', () => {
  const adminAccess = fs.readFileSync(new URL('../src/lib/adminAccess.ts', import.meta.url), 'utf8')
  const creditStore = fs.readFileSync(new URL('../src/lib/creditStore.ts', import.meta.url), 'utf8')
  const auth = fs.readFileSync(new URL('../src/lib/auth.tsx', import.meta.url), 'utf8')
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(adminAccess, /userEmail\(user\) === ADMIN_EMAIL/)
  assert.doesNotMatch(creditStore, /999999|result\.admin|iamdan4live@gmail.com/)
  assert.doesNotMatch(auth, /999999|plan: 'admin'/)
  assert.match(server, /function isAdminAuthUser[\s\S]*authUserEmail\(user\) === adminEmail/)
  assert.match(server, /if \(isAdminAuthUser\(user\)\) return json\(res, 200, \{ ok: true, admin: true/)
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
