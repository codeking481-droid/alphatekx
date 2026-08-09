import assert from 'assert'
import { ensureValidToken } from '../impls/tokenManager.impl.js'

function createMockSupabase() {
  const db = { connections: [] }
  return {
    db,
    from(table) {
      return {
        select: function () { return { eq: async (col, val) => db.connections.filter(r => r[col] === val) } },
        update: function (patch) { return { eq: async (col, val) => { const row = db.connections.find(r => r[col] === val); if (row) Object.assign(row, patch); return [row] } } },
      }
    }
  }
}

async function testNoRefreshToken() {
  const supabase = createMockSupabase()
  supabase.db.connections.push({ id: 'c1', user_id: 'u1', status: 'connected' })
  const res = await ensureValidToken(supabase, 'c1')
  assert.strictEqual(res.status, 'needs_reconnect')
}

async function testRefreshSuccess() {
  const supabase = createMockSupabase()
  supabase.db.connections.push({ id: 'c2', user_id: 'u2', refresh_token: 'rt', status: 'connected' })
  const res = await ensureValidToken(supabase, 'c2')
  assert.strictEqual(res.status, 'ok')
  assert.ok(res.access_token && typeof res.access_token === 'string')
}

export default async function run() {
  console.log('Running tokenManager tests...')
  await testNoRefreshToken(); console.log('  no-refresh-token passed')
  await testRefreshSuccess(); console.log('  refresh-success passed')
  console.log('tokenManager tests passed')
}

if (import.meta.url === `file://${process.argv[1]}`) run().catch(e => { console.error(e); process.exit(1) })
