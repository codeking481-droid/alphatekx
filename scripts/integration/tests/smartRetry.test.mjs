import assert from 'assert'
import { executeWithSelfHealing } from '../impls/smartRetry.impl.js'

// Minimal mock Supabase client to capture inserts/updates
function createMockSupabase() {
  const calls = { inserts: [], updates: [] }
  return {
    calls,
    from(table) {
      return {
        insert: async (row) => { calls.inserts.push({ table, row }); return { data: [row] } },
        update: function (patch) {
          return { eq: async (col, val) => { calls.updates.push({ table, patch, eq: [col, val] }); return { data: [patch] } } }
        },
      }
    }
  }
}

async function testAuthErrorPauses() {
  const supabase = createMockSupabase()
  const automation = { id: 'aut1', user_id: 'u1' }
  let called = 0
  const taskFn = async () => {
    called += 1
    throw new Error('401 Unauthorized: token expired')
  }
  let threw = false
  try {
    await executeWithSelfHealing(supabase, automation, taskFn, 'gmail')
  } catch (err) {
    threw = true
    assert.ok(String(err).toLowerCase().includes('reconnect') || String(err).toLowerCase().includes('needs_reconnect'))
  }
  assert.ok(threw, 'Expected executeWithSelfHealing to throw on auth error')
  assert.ok(supabase.calls.updates.length >= 1, 'Expected automation update recorded')
}

async function testRateLimitThenSuccess() {
  const supabase = createMockSupabase()
  const automation = { id: 'aut2', user_id: 'u2' }
  let called = 0
  const taskFn = async () => {
    called += 1
    if (called === 1) throw new Error('429 Too Many Requests')
    return { success: true, output: 'ok' }
  }
  const res = await executeWithSelfHealing(supabase, automation, taskFn, 'x')
  assert.deepStrictEqual(res, { success: true, output: 'ok' })
  // Expect at least one insert for workflow_runs success
  const hasSuccess = supabase.calls.inserts.some(c => c.table === 'workflow_runs' && c.row && c.row.status === 'success')
  assert.ok(hasSuccess, 'Expected workflow_runs success insert')
}

async function test5xxExhaustedNeedsAttention() {
  const supabase = createMockSupabase()
  const automation = { id: 'aut3', user_id: 'u3' }
  const taskFn = async () => { throw new Error('503 Service Unavailable') }
  let threw = false
  try {
    await executeWithSelfHealing(supabase, automation, taskFn, 'facebook')
  } catch (err) {
    threw = true
    const msg = String(err).toLowerCase()
    assert.ok(msg.includes('needs') || msg.includes('attention') || msg.includes('retry'), `unexpected error message: ${msg}`)
  }
  assert.ok(threw, 'Expected executeWithSelfHealing to throw after retries exhausted')
  const failedRecorded = supabase.calls.inserts.some(c => c.table === 'workflow_runs' && c.row && c.row.status && c.row.status.startsWith('failed'))
  assert.ok(failedRecorded, 'Expected failed workflow_runs to be recorded')
}

export default async function runTests() {
  console.log('Running smartRetry component tests...')
  await testAuthErrorPauses()
  console.log('  auth error test passed')
  await testRateLimitThenSuccess()
  console.log('  rate limit then success test passed')
  await test5xxExhaustedNeedsAttention()
  console.log('  5xx exhausted test passed')
  console.log('All smartRetry tests passed')
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('smartRetry.test.mjs')) {
  runTests().catch(err => { console.error(err); process.exit(1) })
}
