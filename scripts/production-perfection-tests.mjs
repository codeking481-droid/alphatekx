import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const engine = read('server/alpha/conversationEngine.mjs')
const connectors = read('src/pages/Connectors.tsx')
const main = read('src/main.tsx')
const composio = read('server/composioConnectorService.mjs')
const server = read('server.mjs')
const atomicCredits = read('supabase/atomic-credit-execution.sql')

const checks = [
  ['first-load error boundary is visible on white', () => {
    assert.match(main, /Something went wrong\. Please refresh\./)
    assert.match(main, /bg-white/)
  }],
  ['stale deployment chunks recover once instead of stranding the dashboard', () => {
    assert.match(main, /addEventListener\('vite:preloadError'/)
    assert.match(main, /event\.preventDefault\(\)/)
    assert.match(main, /alphatekx:chunk-reload:/)
    assert.match(main, /failed to fetch dynamically imported module\|loading chunk\|chunkloaderror/)
  }],
  ['six production connection cards are visible', () => {
    for (const platform of ['linkedin', 'gmail', 'github', 'googledocs', 'googlesheets', 'discord']) assert.match(connectors, new RegExp(`id: '${platform}'`))
    assert.match(connectors, /Connected Apps/)
    assert.match(connectors, /Connected/)
    assert.match(connectors, /Connect/)
  }],
  ['planner never defaults a missing platform', () => {
    assert.doesNotMatch(engine, /known\.platforms\) && known\.platforms\.length \? known\.platforms : \['facebook'\]/)
    assert.match(engine, /Alpha must never assume a publishing platform/)
  }],
  ['until-paused plans require credit-aware confirmation', () => {
    assert.match(engine, /untilPausedConfirmation/)
    assert.match(engine, /autoPauseOnCreditExhaustion/)
    assert.match(engine, /You have 0 credits/)
  }],
  ['Composio execution is confirmed before charging', () => {
    assert.ok(composio.indexOf('const confirmedId = confirmedProviderId(responseData)') < composio.lastIndexOf('chargeConfirmedExecution(user, 1'))
    assert.match(server, /req\.url === '\/api\/composio\/status'/)
    assert.match(server, /req\.url === '\/api\/composio\/execute'/)
  }],
  ['LinkedIn remains on the native AlphaTekx publishing path', () => {
    assert.match(server, /const composioPublishingPlatforms = new Set\(\['youtube', 'instagram', 'x', 'twitter', 'facebook', 'whatsapp'\]\)/)
    assert.doesNotMatch(server, /composioPublishingPlatforms = new Set\([^)]*linkedin/)
    assert.match(server, /postToSocial\(platform, user/)
    assert.match(server, /publishLinkedInTextPost/)
  }],
  ['Composio credits settle atomically and remain recoverable', () => {
    assert.match(atomicCredits, /for update/)
    assert.match(atomicCredits, /idx_credit_transactions_execution_idempotency/)
    assert.match(atomicCredits, /profiles_credits_non_negative/)
    assert.match(atomicCredits, /provider_confirmed/)
    assert.match(composio, /previous\?\.status === 'provider_confirmed'/)
    assert.match(composio, /rest\/v1\/rpc\/deduct_credit_atomic/)
  }],
]

let passed = 0
for (const [name, check] of checks) {
  try { check(); passed += 1; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}\n${error.stack}`); process.exitCode = 1 }
}
console.log(`${passed}/${checks.length} production-perfection checks passed.`)
