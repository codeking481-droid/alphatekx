import assert from 'node:assert/strict'
import fs from 'node:fs'
import { answerFromBrain, calculateDaysUntilQuestion } from '../server/alpha/brainKnowledge.mjs'
import { classifyIntent, INTENT_CATEGORIES } from '../server/alpha/intentClassifier.mjs'

let passed = 0
function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
const connectors = fs.readFileSync(new URL('../src/pages/Connectors.tsx', import.meta.url), 'utf8')
const engine = fs.readFileSync(new URL('../server/alpha/conversationEngine.mjs', import.meta.url), 'utf8')
const capabilityRegistry = fs.readFileSync(new URL('../server/automation/capabilityRegistry.mjs', import.meta.url), 'utf8')
const ceoPage = fs.readFileSync(new URL('../src/pages/CeoInbox.tsx', import.meta.url), 'utf8')
const agentPage = fs.readFileSync(new URL('../src/pages/Agents.tsx', import.meta.url), 'utf8')
const appRoutes = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const workspaceLayout = fs.readFileSync(new URL('../src/components/workspace/WorkspaceLayout.tsx', import.meta.url), 'utf8')
const connectorIcons = fs.readFileSync(new URL('../src/components/agents/ConnectorIcon.tsx', import.meta.url), 'utf8')

test('calculates days to a named date deterministically', () => {
  assert.equal(calculateDaysUntilQuestion('how many days to Dec 31', new Date('2026-07-29T12:00:00Z')), 'There are **155 days** until 31 December 2026.')
})

test('calculates days to Christmas without an LLM', () => {
  assert.equal(calculateDaysUntilQuestion('how many days to Christmas', new Date('2026-07-29T12:00:00Z')), 'There are **149 days** until 25 December 2026.')
})

test('answers capture from permanent brain knowledge', () => {
  assert.match(answerFromBrain('what is capture'), /photograph|photo/i)
})

test('does not invent the undocumented meaning of tonebi', () => {
  assert.match(answerFromBrain('what is tonebi'), /not been documented/i)
})

test('Facebook and LinkedIn post request enters automation planning', () => {
  const result = classifyIntent('post on Facebook and LinkedIn about AlphaTekx which is amazing')
  assert.equal(result.category, INTENT_CATEGORIES.automation)
})

test('brain is loaded before generic unknown-intent handling', () => {
  assert.match(engine, /answerFromBrain\(prompt\)/)
  assert.match(engine, /knowledgeSource: 'alphatekx-brain'/)
})

test('X uses the configured Composio Auth Config and confirmed provider IDs', () => {
  const authConfigs = fs.readFileSync(new URL('../server/composioAuthConfigs.mjs', import.meta.url), 'utf8')
  const composioService = fs.readFileSync(new URL('../server/composioConnectorService.mjs', import.meta.url), 'utf8')
  assert.match(authConfigs, /TWITTER: 'ac_75GBYAXRovfm'/)
  assert.match(composioService, /defaultAuthConfigId: AUTH_CONFIGS\.TWITTER/)
  assert.match(composioService, /authMode: 'custom'/)
  assert.match(composioService, /validateProviderConfig\(pid\)/)
  assert.match(composioService, /'twitter\.create_post'/)
  assert.match(composioService, /confirmedProviderId/)
  assert.match(server, /alphaConnector\.startConnection\(user, 'x'/)
  assert.doesNotMatch(server, /req\.url === '\/api\/x\/auth'\) \{\s*try \{ return await startXConnection/)
})

test('X executes through the Composio publishing set', () => {
  assert.match(server, /const composioPublishingPlatforms = new Set\(\['youtube', 'instagram', 'facebook', 'whatsapp', 'x', 'twitter'\]\)/)
})

test('connection UI uses one secure experience with LinkedIn native and X through Composio', () => {
  assert.match(connectors, /const nativeOAuthProviders = new Set\(\['linkedin'\]\)/)
  assert.match(connectors, /composioOAuthProviders = new Set\(\[[^\n]*'x'\]\)/)
  assert.match(connectors, /startLinkedInAuth/)
  assert.doesNotMatch(connectors, /startXAuth/)
  assert.doesNotMatch(connectors, /Native — AlphaTekx direct/)
  assert.doesNotMatch(connectors, /Managed connections/)
})

test('connection UI does not contain raw Auth Config IDs', () => {
  assert.doesNotMatch(connectors, /\bac_[A-Za-z0-9_-]+/)
})

test('connection cards use official brand SVG data', () => {
  for (const mark of ['siX', 'siGmail', 'siGithub', 'siGoogledocs', 'siGooglesheets', 'siYoutube', 'siDiscord', 'siWhatsapp', 'siFacebook', 'siInstagram']) {
    assert.match(connectorIcons, new RegExp(`\\b${mark}\\b`))
  }
  assert.match(connectorIcons, /<path fill="currentColor" d=\{brand\.path\}/)
})

test('Money Loop and CEO Inbox are removed from the product surface without deleting data', () => {
  assert.doesNotMatch(workspaceLayout, /Money Loop|CEO Inbox/)
  assert.match(appRoutes, /<Route path="\/leads" element=\{toDashboard\}/)
  assert.match(appRoutes, /<Route path="\/ceo" element=\{toDashboard\}/)
})

test('LinkedIn and image matching remain in the established execution engine', () => {
  assert.match(server, /publishLinkedInTextPost/)
  assert.match(server, /getSmartImage/)
  assert.match(engine, /reason: 'direct_image_request'/)
  assert.match(engine, /imageStoragePath/)
  assert.match(engine, /\{ allowEphemeral: true \}/)
  assert.match(engine, /if \(!image\?\.image_url\)/)
})

test('CEO mode persists suggestions and requires an atomic approval claim', () => {
  assert.match(server, /claimPendingAction/)
  assert.match(server, /idempotencyKey: `ceo:/)
  assert.match(server, /schedule\('\*\/5 \* \* \* \*'/)
  assert.match(server, /CEO_WATCHER_ENABLED/)
  assert.match(ceoPage, /Pending Approvals/)
  assert.match(ceoPage, /Approve/)
})

test('builder mode creates an unmerged GitHub pull request only from reviewed files', () => {
  assert.match(capabilityRegistry, /github-pull-request/)
  assert.match(capabilityRegistry, /mergePolicy: 'separate_explicit_approval'/)
  assert.match(server, /GitHub pull request requires reviewed file paths and complete contents/)
  assert.match(server, /draft: params\.draft !== false/)
})

test('agent workspace is full-screen, mobile-safe, and renders generated images', () => {
  assert.match(agentPage, /alpha-chat-screen/)
  assert.match(agentPage, /h-\[calc\(100dvh-8rem\)\]/)
  assert.match(agentPage, /ReactMarkdown/)
  assert.match(connectors, /Connections are secured by Composio and AlphaTekx OAuth/)
})

console.log(`\n${passed}/16 super-computer agent checks passed`)
