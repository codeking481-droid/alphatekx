import assert from 'node:assert/strict'
import fs from 'node:fs'
import { hookPatternCount, selectHookExamples } from '../server/automation/viralHooks.mjs'

const read = file => fs.readFileSync(file, 'utf8')
const migration = read('supabase/money-loop.sql')
const service = read('server/moneyLoopService.mjs')
const server = read('server.mjs')
const page = read('src/pages/Leads.tsx')
const legacy = read('src/pages/FoundersLegacy.tsx')
const app = read('src/App.tsx')
const landing = read('src/pages/Landing.tsx')
const engine = read('server/alpha/conversationEngine.mjs')

const checks = [
  ['lead and performance records are owner-scoped', migration.includes('auth.uid() = user_id') && migration.includes('unique(user_id, platform, provider_comment_id)')],
  ['outreach requires an approval state', migration.includes("'awaiting_approval','sending','sent','failed'") && migration.includes('outreach_approved_at')],
  ['lead APIs require authentication', server.includes("'/api/money-loop/leads'") && server.includes("if (!user) return json(res, 401")],
  ['lead updates are owner-filtered', service.includes('&user_id=eq.${encodeURIComponent(user.id)}')],
  ['Money Loop UI never claims invented leads', page.includes('Alpha will never invent leads or send unapproved messages')],
  ['Money Loop has honest loading and empty states', page.includes('animate-spin') && page.includes('No captured leads yet')],
  ['founder legacy route is public and linked', app.includes('path="/founders-legacy"') && landing.includes('Built with grind at 6AM')],
  ['founder legacy contains the requested permanent marker', legacy.includes('6:53AM on 28/07/2026') && legacy.includes('9f78c3f569ae5ea8416b2f6a89634ce7cb008009')],
  ['hook registry is used by the existing brain', engine.includes('selectHookExamples') && hookPatternCount() >= 20],
  ['hook selection is deterministic and niche-aware', JSON.stringify(selectHookExamples('thrift store')) === JSON.stringify(selectHookExamples('thrift store')) && selectHookExamples('thrift store')[0].text.includes('thrift store')],
  ['native LinkedIn is not routed through Money Loop or Composio', !service.toLowerCase().includes('linkedin') && !migration.toLowerCase().includes('w_member_social')],
]

let passed = 0
for (const [name, condition] of checks) {
  assert.equal(condition, true, name)
  console.log(`PASS ${name}`)
  passed += 1
}
console.log(`${passed}/${checks.length} Money Loop checks passed.`)
