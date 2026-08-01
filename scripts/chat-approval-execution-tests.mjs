import assert from 'node:assert/strict'
import { createConversationEngine } from '../server/alpha/conversationEngine.mjs'

const user = { id: 'approval-test-user', email: 'approval@test.local' }

function fixture(mode) {
  const now = new Date().toISOString()
  const automation = {
    id: `automation-${mode}`,
    type: 'campaign',
    name: `${mode} campaign`,
    status: 'awaiting_approval',
    approved: false,
    trigger: { type: 'campaign', cron: 'campaign', nextRun: now },
    actions: [],
    campaign: {
      name: `${mode} campaign`,
      status: 'pending_approval',
      approved: false,
      charged: false,
      meta: { platforms: ['linkedin'], publishingMode: mode, scheduleSource: 'user_confirmed', durationSource: 'user_confirmed', timezone: 'UTC' },
      posts: [{ id: `post-${mode}`, status: 'scheduled', approved: false, charged: false, scheduledAt: now, platforms: ['linkedin'], captions: { linkedin: 'Approved test post.' }, result: {}, credits: 1 }],
    },
  }
  return {
    id: `conversation-${mode}`,
    type: 'conversation',
    userId: user.id,
    userEmail: user.email,
    name: 'Approval test conversation',
    conversationStage: 'awaiting_approval',
    status: 'draft',
    messages: [],
    generatedContent: [{ id: 'content-1', approved: true }],
    automationDraft: automation,
  }
}

async function runScenario(mode) {
  const conversation = fixture(mode)
  const records = new Map([[conversation.id, conversation]])
  let executions = 0
  const engine = createConversationEngine({
    callLLMForRole: async () => ({ result: {} }),
    saveServerAgent: async record => { records.set(record.id, structuredClone(record)); return record },
    getServerAgent: async id => records.get(id) ? structuredClone(records.get(id)) : null,
    getUserCredits: async () => 10,
    spendUserCredits: async () => true,
    getIntegrationStatus: async () => ({ connected: true, ready: true }),
    getSmartImage: async () => ({ image_url: 'https://example.com/image.jpg' }),
    executeAgent: async agent => {
      executions += 1
      const published = structuredClone(agent)
      published.campaign.posts[0] = { ...published.campaign.posts[0], status: 'posted', providerPostId: 'provider-post-1', result: { linkedin: { status: 'success', id: 'provider-post-1' } } }
      records.set(agent.id, published)
      return { status: 'success', log: 'Published', steps: [{ result: { linkedin: { status: 'success', id: 'provider-post-1' } } }] }
    },
  })
  const result = await engine.approveAndCreate(conversation.id, user)
  return { result, conversation: records.get(conversation.id), executions }
}

const immediate = await runScenario('once_now')
assert.equal(immediate.executions, 1, 'Publish Now must execute during the approval request')
assert.equal(immediate.result.campaign.posts[0].status, 'posted')
assert.equal(immediate.result.campaign.posts[0].providerPostId, 'provider-post-1')
assert.equal(immediate.conversation.conversationStage, 'created')
assert.match(immediate.conversation.messages.at(-1).text, /Approved and published/)

const scheduled = await runScenario('once_later')
assert.equal(scheduled.executions, 0, 'Scheduled work must not execute during approval')
assert.equal(scheduled.result.campaign.posts[0].status, 'scheduled')
assert.equal(scheduled.result.campaign.posts[0].approved, true)

console.log('CHAT_APPROVAL_EXECUTION_TESTS_OK')
