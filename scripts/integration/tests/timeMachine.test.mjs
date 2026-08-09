import assert from 'assert'
import { saveVersion, rollbackToVersion } from '../impls/timeMachine.impl.js'

function createMockSupabase() {
  const db = { automations_versions: [], automations: [] }
  return {
    db,
    from(table) {
      return {
        insert: async (row) => { const id = `${table}-${db[table].length+1}`; db[table].push({ id, ...row }); return [row] },
        select: function () { return { eq: async (col, val) => db[table].filter(r => r[col] === val) } },
        update: function (patch) { return { eq: async (col, val) => { const row = db[table].find(r => r[col] === val); if (row) Object.assign(row, patch); return [row] } } },
      }
    }
  }
}

async function testSaveAndRollback() {
  const supabase = createMockSupabase()
  const automationId = 'a1'
  const data = { name: 'Auto 1', status: 'active' }
  const res = await saveVersion(supabase, automationId, data)
  assert.ok(res.ok)
  const versions = supabase.db.automations_versions.filter(v => v.automation_id === automationId)
  assert.strictEqual(versions.length, 1)
  const v = versions[0]
  supabase.db.automations.push({ id: automationId, name: 'old', status: 'old' })
  const r = await rollbackToVersion(supabase, automationId, v.id)
  assert.ok(r.ok)
}

export default async function run() {
  console.log('Running timeMachine tests...')
  await testSaveAndRollback(); console.log('  save+rollback passed')
  console.log('timeMachine tests passed')
}

if (import.meta.url === `file://${process.argv[1]}`) run().catch(e => { console.error(e); process.exit(1) })
