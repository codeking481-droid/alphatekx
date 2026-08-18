import assert from 'node:assert/strict'
import { buildCapabilityPlan, detectCapability, isSupportedAction } from '../server/automation/capabilityRegistry.mjs'
import { generateAdvancedImagePrompt, pollinationsImageUrl } from '../server/mediaLibraryService.mjs'

const user = { id: 'available-platform-test', email: 'owner@example.com', timezone: 'Africa/Lagos' }

const cases = [
  ['Create a GitHub issue called Fix login in codeking481-droid/alphatekx', 'github-issue', 'github', 'create_issue'],
  ['Create a Google Doc titled Launch brief', 'google-doc', 'googledocs', 'create_document'],
  ['Send a message hello team to Discord in #general', 'discord-message', 'discord', 'send_message'],
  ['Create one LinkedIn post about AlphaTekx for startup founders in a professional tone', 'linkedin-post', 'linkedin', 'post'],
  ['Send an email to hello@example.com about the launch', 'send-email', 'gmail', 'send_email'],
  ['Append this order to Google Sheets', 'append-sheets', 'google_sheets', 'append_row'],
]

for (const [prompt, capabilityId, connector, action] of cases) {
  assert.equal(detectCapability(prompt)?.id, capabilityId, `${capabilityId} should route deterministically`)
  const plan = buildCapabilityPlan(prompt, user)
  assert.equal(plan?.actions?.[0]?.connector, connector)
  assert.equal(plan?.actions?.[0]?.action, action)
  assert.equal(isSupportedAction(connector, action), true, `${connector}.${action} must be allowlisted`)
}

for (const prompt of cases.slice(0, 4).map(item => item[0])) {
  const plan = buildCapabilityPlan(prompt, user)
  assert.equal(plan.approved, false, 'side-effecting work must require explicit approval')
  assert.equal(plan.approvalPolicy || 'explicit', 'explicit')
}

const image = generateAdvancedImagePrompt(
  'AlphaTekx helps founders automate approved work while they sleep.',
  'Show a credible AI operations workspace for growing companies.',
  'linkedin',
)
assert.match(image.advancedPrompt, /crystal-clear premium commercial photograph/i)
assert.match(image.negativePrompt, /watermark/i)
const imageUrl = new URL(pollinationsImageUrl(image.advancedPrompt, image.negativePrompt, 481))
assert.equal(imageUrl.hostname, 'gen.pollinations.ai')
assert.equal(imageUrl.searchParams.get('model'), 'flux')
assert.equal(imageUrl.searchParams.get('width'), '1200')
assert.equal(imageUrl.searchParams.get('height'), '628')
assert.equal(imageUrl.searchParams.get('nologo'), 'true')

console.log('AVAILABLE_PLATFORM_AGENT_TESTS_OK')
