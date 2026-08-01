import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8')
const wizard = await readFile(new URL('../src/components/automation/MatureAutomationWizard.tsx', import.meta.url), 'utf8')
const active = await readFile(new URL('../src/pages/ActiveAutomations.tsx', import.meta.url), 'utf8')
const migration = await readFile(new URL('../supabase/automations-setup.sql', import.meta.url), 'utf8')

assert.match(wizard, /Authorization: `Bearer \$\{accessToken\}`/, 'campaign activation must authenticate the signed-in user')
assert.match(active, /\/progress`, \{\s*headers: accessToken \? \{ Authorization:/s, 'progress polling must authenticate the signed-in user')
assert.match(server, /if \(prepared\) agent\.campaign\.posts\[index\] = prepared/, 'background generation must update scheduler-owned campaign posts')
assert.doesNotMatch(server, /generatedPosts: generated\.slice/, 'generation must not persist a disconnected shadow post list')
assert.match(server, /backgroundGeneration\?\.status === 'generating'/, 'duplicate background generation must be locked')
assert.match(server, /confirmedPreviousResult\?\.status === 'success' && confirmedPreviousResult\?\.id/, 'partial retries must not republish a platform with a confirmed provider ID')
assert.match(server, /dueCutoff = trigger === 'manual'.*now\.getTime\(\)/, 'only explicit manual runs may use the early execution window')
assert.match(server, /Alpha will retry automatically at \$\{nextRun\}/, 'retryable provider failures must keep their scheduled retry reachable')
assert.match(server, /status = 'warning'[\s\S]{0,180}campaign\.status = 'running'/, 'a transient failure must not pause the campaign before its retry')
assert.match(server, /failureDetails\.join\('\s*\|\s*'\)/, 'execution history must expose the exact provider or preparation failure')
assert.match(server, /No credits were charged/, 'unconfirmed retryable posts must report no charge')
assert.doesNotMatch(migration, /DROP TABLE IF EXISTS public\.(?:posts|automations)/i, 'production automation migrations must never erase schedules or evidence')

console.log('REAL_POSTING_ENGINE_TESTS_OK')
