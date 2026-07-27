import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateFreeCampaign } from '../server/automation/freePlanPolicy.mjs'

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
let passed = 0
function test(name, fn) {
  try { fn(); passed++; process.stdout.write(`✓ ${name}\n`) }
  catch (error) { process.stderr.write(`✗ ${name}\n${error.stack}\n`); process.exitCode = 1 }
}

test('landing uses bold white premium foundation', () => {
  const source = read('src/pages/Landing.tsx')
  assert.match(source, /Turn Your Idea Into Reality/)
  assert.match(source, /#6941C6/)
  assert.doesNotMatch(source, /bg-black/)
})
test('signup offers both explicit credit paths', () => {
  const source = read('src/pages/Auth.tsx')
  for (const phrase of ['Sign up with Google', '1 credit', 'Sign up with WhatsApp', '10 credits', 'RECOMMENDED']) assert.match(source, new RegExp(phrase))
})
test('phone credits are verified and idempotent', () => {
  assert.match(read('server/firebasePhoneAuth.mjs'), /verifyIdToken\(idToken, true\)/)
  assert.match(read('server/firebasePhoneAuth.mjs'), /firebase-phone:/)
  assert.doesNotMatch(read('supabase/phone-auth-and-welcome-credits.sql'), /phone_number\s+text/i)
})
test('onboarding routes verified platforms into Command Centre', () => {
  const source = read('src/pages/Home.tsx')
  assert.match(source, /What do you want to automate today\?/)
  assert.match(source, /Go to Command Centre/)
  for (const platform of ['Twitter', 'Instagram', 'LinkedIn', 'Gmail', 'YouTube']) assert.match(source, new RegExp(platform))
})
test('guided flow asks one scheduling decision at a time', () => {
  const source = read('src/pages/Agents.tsx')
  for (const phrase of ['What days should it run', 'What time', 'How long should Alpha run this job', 'Approve & Schedule', 'last 10']) assert.match(source, new RegExp(phrase, 'i'))
})
test('running automations includes progress and calendar', () => {
  const source = read('src/pages/ActiveAutomations.tsx')
  for (const phrase of ['Running Automations', 'CalendarView', 'Edit schedule — free', 'executionsDone']) assert.match(source, new RegExp(phrase))
})
test('free plan blocks schedules beyond seven days', () => {
  const result = validateFreeCampaign([{ scheduledAt: new Date(Date.now() + 8 * 86400000).toISOString(), captions: { x: 'Unique post' } }])
  assert.equal(result.code, 'FREE_SCHEDULE_WINDOW')
})
test('free plan blocks two posts in one hour', () => {
  const start = Date.now() + 60000
  const result = validateFreeCampaign([
    { scheduledAt: new Date(start).toISOString(), captions: { x: 'First unique post' } },
    { scheduledAt: new Date(start + 30 * 60000).toISOString(), captions: { x: 'Second different update' } },
  ])
  assert.equal(result.code, 'FREE_HOURLY_LIMIT')
})
test('duplicate captions are rejected', () => {
  const start = Date.now() + 60000
  const result = validateFreeCampaign([
    { scheduledAt: new Date(start).toISOString(), captions: { linkedin: 'A caption that must never repeat.' } },
    { scheduledAt: new Date(start + 2 * 3600000).toISOString(), captions: { linkedin: 'A caption that must never repeat.' } },
  ])
  assert.equal(result.code, 'DUPLICATE_CONTENT')
})
test('billing catalog has all requested packs and tiers', () => {
  const source = read('server/billing.mjs')
  for (const value of ['spark_5', 'creator_20', 'builder_40', 'scale_100', 'creator_monthly', 'builder_monthly', 'scale_monthly']) assert.match(source, new RegExp(value))
  for (const value of ['monthlyCredits: 150', 'monthlyCredits: 400', 'monthlyCredits: 1200', 'maxActiveAutomations: 2', 'maxActiveAutomations: 10']) assert.match(source, new RegExp(value))
})

if (!process.exitCode) process.stdout.write(`\n${passed}/10 bold-white automation-flow checks passed.\n`)
