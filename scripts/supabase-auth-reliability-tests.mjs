import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isModernSupabaseSecret, supabaseServiceHeaders } from '../server/supabaseHeaders.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.resolve(root, file), 'utf8')
const tests = []
const test = (name, run) => tests.push({ name, run })

test('modern Supabase secret keys are never sent as Bearer JWTs', () => {
  const headers = supabaseServiceHeaders('sb_secret_example')
  assert.equal(isModernSupabaseSecret('sb_secret_example'), true)
  assert.equal(headers.apikey, 'sb_secret_example')
  assert.equal(headers.Authorization, undefined)
})

test('legacy service-role JWTs retain Authorization compatibility', () => {
  const headers = supabaseServiceHeaders('eyJlegacy.service.role')
  assert.equal(headers.apikey, 'eyJlegacy.service.role')
  assert.equal(headers.Authorization, 'Bearer eyJlegacy.service.role')
})

test('all server persistence modules share the safe header implementation', () => {
  for (const file of ['server.mjs', 'server/alphaBrain.mjs', 'server/billing.mjs', 'server/featureAccess.mjs']) {
    const source = read(file)
    assert.match(source, /supabaseServiceHeaders/)
    assert.doesNotMatch(source, /Authorization:\s*`Bearer \$\{(?:config\.)?service/)
  }
})

test('Google OAuth always starts a fresh account-specific flow', () => {
  const source = read('src/pages/Auth.tsx')
  assert.match(source, /signOut\(\{ scope: 'local' \}\)/)
  assert.match(source, /skipBrowserRedirect: true/)
  assert.match(source, /prompt: 'select_account'/)
  assert.match(source, /window\.location\.replace\(data\.url\)/)
})

test('deep health reports durable Supabase and AI readiness without secrets', () => {
  const source = read('server.mjs')
  assert.match(source, /searchParams\.get\('deep'\) !== '1'/)
  assert.match(source, /supabaseAuth: authStatus/)
  assert.match(source, /durableAgents: databaseStatus/)
  assert.match(source, /aiProvider: providers\.length \? 'ready' : 'missing'/)
})

let passed = 0
for (const item of tests) {
  await item.run()
  passed += 1
  process.stdout.write(`PASS ${item.name}\n`)
}
process.stdout.write(`\n${passed}/${tests.length} Supabase auth reliability tests passed.\n`)
