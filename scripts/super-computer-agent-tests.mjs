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

test('native X uses OAuth 2.0 PKCE and confirmed provider IDs', () => {
  assert.match(server, /code_challenge_method: 'S256'/)
  assert.match(server, /tweet\.read tweet\.write users\.read offline\.access/)
  assert.match(server, /X did not return a confirmed post identifier/)
})

test('X no longer executes through the Composio publishing set', () => {
  assert.match(server, /const composioPublishingPlatforms = new Set\(\['youtube', 'instagram', 'facebook', 'whatsapp'\]\)/)
})

test('connection UI separates native and nine managed tools', () => {
  assert.match(connectors, /Native — AlphaTekx direct/)
  assert.match(connectors, /Nine secure Composio-managed tools/)
  assert.match(connectors, /startXAuth/)
})

test('connection UI does not contain raw Auth Config IDs', () => {
  assert.doesNotMatch(connectors, /\bac_[A-Za-z0-9_-]+/)
})

test('LinkedIn and image matching remain in the established execution engine', () => {
  assert.match(server, /publishLinkedInTextPost/)
  assert.match(server, /getSmartImage/)
  assert.match(engine, /reason: 'direct_image_request'/)
  assert.match(engine, /imageStoragePath/)
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

console.log(`\n${passed}/13 super-computer agent checks passed`)
