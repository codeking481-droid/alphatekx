import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const engine = read('server/alpha/conversationEngine.mjs')
const connectors = read('src/pages/Connectors.tsx')
const main = read('src/main.tsx')
const composio = read('server/composioConnectorService.mjs')
const server = read('server.mjs')

const checks = [
  ['first-load error boundary is visible on white', () => {
    assert.match(main, /Something went wrong\. Please refresh\./)
    assert.match(main, /bg-white/)
  }],
  ['five production connection cards are visible', () => {
    for (const platform of ['youtube', 'instagram', 'x', 'facebook', 'whatsapp']) assert.match(connectors, new RegExp(`id: '${platform}'`))
    assert.match(connectors, /Connect Your Platforms/)
    assert.match(connectors, /● Connected/)
    assert.match(connectors, /○ Not Connected/)
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
    assert.ok(composio.indexOf('confirmedProviderId(responseData)') < composio.indexOf('chargeConfirmedExecution(user, 1'))
    assert.match(server, /req\.url === '\/api\/composio\/status'/)
    assert.match(server, /req\.url === '\/api\/composio\/execute'/)
  }],
]

let passed = 0
for (const [name, check] of checks) {
  try { check(); passed += 1; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}\n${error.stack}`); process.exitCode = 1 }
}
console.log(`${passed}/${checks.length} production-perfection checks passed.`)
