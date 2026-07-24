import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  connectorFeatureAccess,
  featureManagementSnapshot,
  setBetaUser,
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
const betaUser = { id: 'beta', email: 'beta@example.com' }
const config = {}

await test('disabled features are blocked for public and admin users', async () => {
  await updateFeature(config, 'facebook', { state: 'disabled', stopExisting: true }, admin)
  assert.equal(connectorFeatureAccess(publicUser, 'facebook').enabled, false)
  assert.equal(connectorFeatureAccess(admin, 'facebook').enabled, false)
})

await test('beta features are available only to admins and whitelisted testers', async () => {
  await updateFeature(config, 'facebook', { state: 'beta', stopExisting: true }, admin)
  await setBetaUser(config, betaUser.email, true, admin)
  assert.equal(connectorFeatureAccess(publicUser, 'facebook').enabled, false)
  assert.equal(connectorFeatureAccess(admin, 'facebook').enabled, true)
  assert.equal(connectorFeatureAccess(betaUser, 'facebook').enabled, true)
})

await test('public state is immediately available to everyone', async () => {
  await updateFeature(config, 'facebook', { state: 'public', stopExisting: true }, admin)
  assert.equal(connectorFeatureAccess(publicUser, 'facebook').enabled, true)
})

await test('maintenance state blocks access with an honest message', async () => {
  await updateFeature(config, 'facebook', { state: 'maintenance', stopExisting: true }, admin)
  assert.equal(connectorFeatureAccess(publicUser, 'facebook').enabled, false)
  assert.equal(unavailableConnectorMessage('facebook'), 'Facebook is temporarily under maintenance.')
})

await test('feature changes record modifier, timestamp, and audit transition', () => {
  const snapshot = featureManagementSnapshot()
  const feature = snapshot.features.find(item => item.id === 'facebook')
  assert.equal(feature.updated_by, admin.email)
  assert.ok(Date.parse(feature.updated_at))
  assert.ok(snapshot.audit.some(item => item.feature_id === 'facebook' && item.changed_by === admin.email))
})

await test('admin API and UI are authenticated and server enforced', () => {
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const page = fs.readFileSync(new URL('../src/pages/AdminFeatures.tsx', import.meta.url), 'utf8')
  assert.match(server, /async function authenticatedAdmin/)
  assert.match(server, /authenticatedUser\(req, config\.url, config\.anon\)/)
  assert.match(server, /\/api\/admin\/features/)
  assert.match(server, /stop_existing/)
  assert.match(server, /featurePause\?\.featureId/)
  assert.match(server, /previousStatus/)
  assert.match(app, /\/admin\/features/)
  assert.match(page, /Feature Management/)
  assert.match(page, /Beta testers/)
  assert.match(page, /Audit log/)
  assert.match(page, /setInterval\(refresh, 5_000\)/)
})

await test('database writes use verified upserts rather than unchecked filtered updates', () => {
  const source = fs.readFileSync(new URL('../server/featureAccess.mjs', import.meta.url), 'utf8')
  assert.match(source, /features\?on_conflict=id/)
  assert.match(source, /resolution=merge-duplicates,return=representation/)
  assert.match(source, /saved\[0\]\?\.state !== state/)
})

await test('database migration defines flags, beta users, audit log, and RLS', () => {
  const sql = fs.readFileSync(new URL('../supabase/feature-management.sql', import.meta.url), 'utf8')
  assert.match(sql, /create table if not exists public\.features/)
  assert.match(sql, /feature_beta_users/)
  assert.match(sql, /feature_audit_log/)
  assert.match(sql, /enable row level security/)
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

await updateFeature(config, 'facebook', { state: 'beta', stopExisting: true }, admin)
await setBetaUser(config, betaUser.email, false, admin)

const failed = tests.filter(item => !item.ok)
console.log('ADMIN_FEATURE_MANAGEMENT_TESTS:')
for (const item of tests) console.log(`- ${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` — ${item.error}` : ''}`)
console.log(`- Total: ${tests.length}, Passed: ${tests.length - failed.length}, Failed: ${failed.length}`)
if (failed.length) process.exit(1)
console.log('ADMIN_FEATURE_MANAGEMENT_TESTS_OK')
