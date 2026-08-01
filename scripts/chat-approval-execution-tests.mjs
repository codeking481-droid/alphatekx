import assert from 'node:assert/strict'
import { contentGenerationMissingFields, createConversationEngine, heuristicParseRequest, publishingModeFromPrompt } from '../server/alpha/conversationEngine.mjs'

const user = { id: 'approval-test-user', email: 'approval@test.local' }

const exactFacebookPrompt = `Create and publish one Facebook post now about AlphaTekx.
Goal: attract startup founders, creators, freelancers, and small business owners.
Tone: confident, professional, friendly, and human.
Generate and attach one clear, professional technology image that matches the post.
This is a one-time post, not a recurring campaign.
Show me the final text and image for review. After I approve it once, publish immediately.`
const parsedFacebookPrompt = heuristicParseRequest(exactFacebookPrompt)
assert.equal(publishingModeFromPrompt(exactFacebookPrompt), 'once_now', 'explicit one-time Publish Now language must override the word recurring in a negation')
assert.equal(publishingModeFromPrompt('yes now'), 'once_now', 'a stale scheduling conversation must recover when the user confirms now')
assert.equal(parsedFacebookPrompt.knownFields.publishingMode, 'once_now')
assert.equal(parsedFacebookPrompt.knownFields.frequency, 'once')
assert.equal(parsedFacebookPrompt.knownFields.totalPosts, 1)
assert.equal(parsedFacebookPrompt.knownFields.audience, 'startup founders, creators, freelancers, and small business owners')
assert.deepEqual(contentGenerationMissingFields(parsedFacebookPrompt.intent, parsedFacebookPrompt.knownFields), [], 'the complete Facebook request must not ask for frequency, time, timezone, start date, or publishing mode')

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
    conversationStage: 'awaiting_content_review',
    status: 'draft',
    messages: [],
    generatedContent: [{ id: 'content-1', approved: false }],
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
  const continued = await engine.continue(conversation.id, user, 'approve')
  const result = continued.automationDraft
  return { result, conversation: records.get(conversation.id), executions }
}

const immediate = await runScenario('once_now')
assert.equal(immediate.executions, 1, 'one preview approval must publish once-now work during the same request')
assert.equal(immediate.result.campaign.posts[0].status, 'posted')
assert.equal(immediate.result.campaign.posts[0].providerPostId, 'provider-post-1')
assert.equal(immediate.conversation.conversationStage, 'created')
assert.match(immediate.conversation.messages.at(-1).text, /Approved and published/)

const scheduled = await runScenario('once_later')
assert.equal(scheduled.executions, 0, 'one preview approval must activate scheduled work without executing it early')
assert.equal(scheduled.result.campaign.posts[0].status, 'scheduled')
assert.equal(scheduled.result.campaign.posts[0].approved, true)

console.log('CHAT_APPROVAL_EXECUTION_TESTS_OK')
