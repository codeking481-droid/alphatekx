import assert from 'node:assert/strict'
import fs from 'node:fs'
import { classifyIntent, INTENT_CATEGORIES } from '../server/alpha/intentClassifier.mjs'
import { createConversationEngine } from '../server/alpha/conversationEngine.mjs'

const conversational = [
  'Hi', 'Hello', 'Good morning', 'How are you?', 'Who are you?',
  'What is your name?', 'Thank you', 'Tell me a joke', 'What can you do?',
  'Explain AlphaTekx', 'I am tired', 'I need advice', 'I want to think about my life',
]
const automations = [
  'Post on LinkedIn every morning.',
  'Send Gmail every Friday.',
  'Remind me every day at 8 AM.',
]

for (const prompt of conversational) {
  assert.equal(classifyIntent(prompt).category, INTENT_CATEGORIES.conversation, prompt)
}
for (const prompt of automations) {
  const result = classifyIntent(prompt)
  assert.equal(result.category, INTENT_CATEGORIES.automation, prompt)
  assert.ok(result.confidence >= 0.8, prompt)
}
assert.equal(classifyIntent('How do I connect LinkedIn?').category, INTENT_CATEGORIES.help)
assert.equal(classifyIntent('Help me connect LinkedIn').category, INTENT_CATEGORIES.help)
assert.equal(classifyIntent('How do credits work?').category, INTENT_CATEGORIES.help)
assert.equal(classifyIntent('Post for me.').category, INTENT_CATEGORIES.clarification)
assert.equal(classifyIntent('Blue clouds maybe').category, INTENT_CATEGORIES.unknown)
assert.equal(classifyIntent('Every morning.', { hasPlanningContext: true }).category, INTENT_CATEGORIES.followUp)

const records = new Map()
let modelCalls = 0
let creditCharges = 0
const engine = createConversationEngine({
  saveServerAgent: async record => { records.set(record.id, structuredClone(record)); return record },
  getServerAgent: async id => structuredClone(records.get(id)),
  getUserCredits: async () => 30,
  spendUserCredits: async () => { creditCharges += 1; return true },
  getIntegrationStatus: async () => ({ connected: true, ready: true }),
  callLLMForRole: async () => { modelCalls += 1; throw new Error('Planner called for non-automation message') },
})

for (const [index, prompt] of conversational.entries()) {
  const conversation = await engine.start({ id: `conversation-${index}` }, prompt)
  assert.equal(conversation.conversationStage, 'chatting', prompt)
  assert.equal(conversation.automationDraft, null, prompt)
  assert.equal(conversation.approvalRequired, false, prompt)
  assert.deepEqual(conversation.actions, [], prompt)
}
for (const [index, prompt] of ['How do I connect LinkedIn?', 'How do credits work?', 'Blue clouds maybe'].entries()) {
  const conversation = await engine.start({ id: `safe-${index}` }, prompt)
  assert.equal(conversation.conversationStage, 'chatting', prompt)
  assert.equal(conversation.automationDraft, null, prompt)
}
assert.equal(modelCalls, 0)
assert.equal(creditCharges, 0)

for (const relative of [
  '../server/alpha/conversationEngine.mjs',
  '../src/pages/Agents.tsx',
  '../src/components/agents/WorkflowPlan.tsx',
]) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Get Automation Brain Name|Create Automation Node/)
}

const engineSource = fs.readFileSync(new URL('../server/alpha/conversationEngine.mjs', import.meta.url), 'utf8')
assert.match(engineSource, /supportedActions\.length !== actions\.length/)
assert.match(engineSource, /conversation\.automationDraft = null[\s\S]*conversation\.conversationStage = 'unsupported'/)

const agentStoreSource = fs.readFileSync(new URL('../src/lib/agents/agentStore.ts', import.meta.url), 'utf8')
assert.match(agentStoreSource, /localStorage\.removeItem\(STORAGE_KEY\)/)
assert.match(agentStoreSource, /supabase\?\.auth\.refreshSession\(\)/)

const workspaceSource = fs.readFileSync(new URL('../src/pages/Agents.tsx', import.meta.url), 'utf8')
assert.match(workspaceSource, /PLANNING_OWNER_KEY/)
assert.match(workspaceSource, /\/api\/alpha\/conversation\/\$\{encodeURIComponent\(conversation\.id\)\}\/create/)
assert.doesNotMatch(workspaceSource, /await saveAgent\(agent\)/)

console.log('INTENT_CLASSIFICATION_TESTS_OK')
