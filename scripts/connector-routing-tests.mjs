import assert from 'node:assert/strict'
import fs from 'node:fs'

const connectors = fs.readFileSync(new URL('../src/pages/Connectors.tsx', import.meta.url), 'utf8')
const creations = fs.readFileSync(new URL('../src/pages/Creations.tsx', import.meta.url), 'utf8')
const service = fs.readFileSync(new URL('../server/composioConnectorService.mjs', import.meta.url), 'utf8')
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')

const tests = [
  ['LinkedIn remains the only native connection on Connected Apps', () => {
    assert.match(connectors, /id: 'linkedin'[\s\S]{0,180}native: true/)
    assert.doesNotMatch(connectors, /id: 'gmail'[\s\S]{0,180}native: true/)
    assert.match(connectors, /platformId === 'linkedin'/)
  }],
  ['Gmail connection and test execution use Composio', () => {
    assert.doesNotMatch(connectors, /startGmailConnection/)
    assert.match(creations, /connectProvider\('gmail'/)
    assert.match(creations, /executeComposioAction\('gmail', 'send_email'/)
    assert.doesNotMatch(creations, /sendGmail|startGmailConnection|disconnectGmail/)
  }],
  ['Gmail agent execution uses the managed Composio connector', () => {
    assert.match(service, /'gmail\.send_email'/)
    assert.match(server, /composioAutomationConnectors = new Set\(\['gmail'/)
    assert.match(server, /action\.connector === 'gmail' && \['send_email', 'list_messages'\]/)
    assert.match(server, /executeProviderAction\(user, 'gmail', action\.action/)
  }],
  ['social publishing keeps Composio platforms separate from native LinkedIn', () => {
    assert.match(server, /composioPublishingPlatforms = new Set\(\['youtube', 'instagram', 'facebook', 'whatsapp', 'x', 'twitter'\]\)/)
    assert.doesNotMatch(server, /composioPublishingPlatforms = new Set\([^\n]*'linkedin'/)
    assert.match(server, /case 'linkedin': result = await postToLinkedIn/)
  }],
]

let failed = 0
console.log('CONNECTOR_ROUTING_TESTS:')
for (const [name, run] of tests) {
  try { run(); console.log(`- PASS: ${name}`) }
  catch (error) { failed += 1; console.log(`- FAIL: ${name} — ${error.message}`) }
}
console.log(`- Total: ${tests.length}, Passed: ${tests.length - failed}, Failed: ${failed}`)
if (failed) process.exit(1)
console.log('CONNECTOR_ROUTING_TESTS_OK')
