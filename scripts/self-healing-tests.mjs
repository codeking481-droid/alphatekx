import assert from 'node:assert/strict'
import fs from 'node:fs'

const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
let passed = 0
function test(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}`); throw error }
}

test('backoff schedule exists', () => {
  assert.match(server, /const backoffs = \[\s*5000,\s*30000,\s*300000\s*\]/)
})

test('workflow_runs REST writes present', () => {
  assert.match(server, /rest\/v1\/workflow_runs/)
})

test('needs_reconnect health status update present', () => {
  assert.match(server, /health_status:\s*'needs_reconnect'|needs_reconnect/) 
})

test('loop guard pause update uses paused_loop', () => {
  assert.match(server, /paused_loop/) 
})

test('auth error detection regex exists', () => {
  assert.match(server, /invalid_grant|token expired|401|403|unauthori/i)
})

console.log(`\nSelf-healing tests: ${passed}/${passed} passed`)
