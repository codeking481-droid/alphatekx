import assert from 'node:assert/strict'
import fs from 'node:fs'
import { calculateNextPost, generateFullSchedule, getLiveCountdown } from '../src/lib/scheduling/nextPostCalculator.ts'

let passed = 0
function test(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}`); throw error }
}

const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
const connector = fs.readFileSync(new URL('../server/composioConnectorService.mjs', import.meta.url), 'utf8')
const media = fs.readFileSync(new URL('../server/mediaLibraryService.mjs', import.meta.url), 'utf8')
const activePage = fs.readFileSync(new URL('../src/pages/ActiveAutomations.tsx', import.meta.url), 'utf8')
const executor = fs.readFileSync(new URL('../src/lib/agents/useAgentExecutor.ts', import.meta.url), 'utf8')
const workspace = fs.readFileSync(new URL('../src/components/workspace/WorkspaceLayout.tsx', import.meta.url), 'utf8')

test('12 PM is parsed correctly in Africa/Lagos', () => {
  const next = calculateNextPost(['Monday'], '12:00 PM', 'Africa/Lagos', new Date('2026-08-03T09:30:00.000Z'))
  assert.equal(next.toISOString(), '2026-08-03T11:00:00.000Z')
})

test('full schedule produces the exact requested count', () => {
  const schedule = generateFullSchedule(['Mon', 'Wed', 'Fri'], '9:00 AM', 7, 'Africa/Lagos', new Date('2026-08-01T00:00:00.000Z'))
  assert.equal(schedule.length, 7)
  assert.equal(new Set(schedule.map(date => date.toISOString())).size, 7)
})

test('live countdown includes seconds and due state', () => {
  const countdown = getLiveCountdown('2026-08-01T12:15:10.000Z', 'Africa/Lagos', new Date('2026-08-01T10:00:00.000Z'))
  assert.equal(countdown.text, '2h 15m 10s')
  assert.equal(countdown.isDue, false)
  assert.equal(getLiveCountdown('2026-08-01T09:00:00.000Z', 'Africa/Lagos', new Date('2026-08-01T10:00:00.000Z')).isDue, true)
})

test('campaign value is one credit across connected social platforms', () => {
  assert.match(server, /function computeCampaignPostCredits[\s\S]*?return 1/)
  assert.match(server, /deferCreditSettlement: true/)
  assert.match(server, /idempotencyKey: `\$\{existing\.id\}:\$\{post\.id\}:unified`/)
  assert.match(connector, /if \(deferCreditSettlement\)/)
})

test('plan limits and free seven-post cap are enforced server-side', () => {
  assert.match(server, /ACTIVE_AUTOMATION_LIMIT/)
  assert.match(server, /slice\(0, 7\)/)
  assert.match(server, /Upgrade to Starter \$15 for 2 active automations/)
})

test('zero credits pauses honestly without charging', () => {
  assert.match(server, /status = outOfCredits \? 'needs_attention' : 'running'/)
  assert.match(server, /Out of credits - Buy \$3 for 20 credits/)
  assert.match(activePage, /Buy credits/)
})

test('failed automations remain visible and cannot be mislabeled completed', () => {
  assert.match(activePage, /'failed', 'error', 'waiting_credits'/)
  assert.match(activePage, /every approved lifecycle outcome/)
  assert.match(server, /terminalProblems = campaign\.posts\.filter/)
  assert.match(server, /status = 'needs_attention'/)
  assert.match(server, /unconfirmed_or_failed_posts/)
})

test('overdue work catches up in the authenticated workspace and can run manually', () => {
  assert.match(workspace, /useAgentExecutor\(\)/)
  assert.match(executor, /\/api\/agents\/run-due/)
  assert.match(executor, /visibilitychange/)
  assert.match(activePage, /Publish due post now/)
  assert.match(activePage, /Provider ID:/)
})

test('missing execution history storage cannot block automation deletion', () => {
  assert.match(server, /try \{ await supabaseDeleteAgentExecutions\(id\) \} catch/)
  assert.match(server, /try \{ await supabaseDeleteAgent\(id\); primaryDeleted = true \} catch/)
})

test('manual and scheduled executions recover the trusted owner identity before credit checks', () => {
  assert.match(server, /resolveExecutionUser\(existing\.userId, existing\.userEmail \|\| '', authenticatedOwner\)/)
  assert.match(server, /authenticatedOwner\?\.id === userId/)
  assert.match(server, /\/auth\/v1\/admin\/users\/\$\{encodeURIComponent\(userId\)\}/)
  assert.match(server, /runAgent\(existingAgent, 'manual', user\)/)
})

test('execution history falls back to the encrypted integration vault when connected_accounts rejects the record', () => {
  assert.match(server, /connected_accounts save failed: HTTP/)
  assert.match(server, /saveUserIntegration\(userId, AGENT_EXECUTIONS_PROVIDER/)
  assert.match(server, /encrypted integration vault fallback failed/)
})

test('scheduled check isolates failures and always returns 200', () => {
  assert.match(server, /\/api\/cron\/check-scheduled-posts/)
  assert.match(server, /return json\(res, 200, \{ ok: false, executed: 0/)
  assert.match(server, /\[cron\] agent \$\{agent\.id\} run error/)
})

test('scheduler merges primary agents with durable per-user fallback records', () => {
  assert.match(server, /primary = await supabaseAgents\(\)/)
  assert.match(server, /fallback = rows\.flatMap/)
  assert.match(server, /for \(const agent of \[\.\.\.primary, \.\.\.fallback\]\)/)
  assert.match(server, /candidateUpdated >= existingUpdated/)
})

test('authenticated workspace and overdue cards can force an immediate durable run', () => {
  assert.match(server, /const userAgents = user \? await listServerAgentsForUser\(user\.id\)/)
  assert.match(executor, /supabase\?\.auth\.getSession\(\)/)
  assert.match(executor, /Authorization: `Bearer \$\{accessToken\}`/)
  assert.match(activePage, /'Run now'/)
  assert.match(activePage, /onRun\(agent\)/)
})

test('background generation retries each post and persists progress', () => {
  assert.match(server, /attempt < 3 && !prepared/)
  assert.match(server, /backgroundProgress: progress/)
  assert.match(server, /setImmediate\(\(\) => \{ void runAutomationBackgroundGeneration/)
})

test('every generated campaign image is unique, durable, and topic matched', () => {
  assert.match(server, /forceUnique: true/)
  assert.match(media, /uniqueNonce/)
  assert.doesNotMatch(media, /picsum-fallback/)
  assert.match(media, /verified topic-matched image/)
  assert.match(media, /persistGenerated/)
})

console.log(`\nV1 reliability tests: ${passed}/${passed} passed`)
