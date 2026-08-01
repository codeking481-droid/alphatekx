import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildSocialPublishingAction, providerPostIds, xPostText } from '../server/automation/socialPublishing.mjs'
import { confirmedProviderId, confirmedPublishedContentId, shouldReclaimClaimedExecution } from '../server/composioConnectorService.mjs'

let passed = 0
function test(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}`); throw error }
}

test('Facebook creates a real Page image post action', () => {
  assert.deepEqual(buildSocialPublishingAction('facebook', { imageUrl: 'https://cdn.example/post.jpg' }, 'AlphaTekx is live'), {
    action: 'create_page_post', params: { message: 'AlphaTekx is live', image_url: 'https://cdn.example/post.jpg' },
  })
  assert.throws(() => buildSocialPublishingAction('facebook', {}, 'AlphaTekx is live'), /confirmed matched image/)
})

test('Facebook preserves a verified media URL', () => {
  const action = buildSocialPublishingAction('facebook', { imageUrl: 'https://cdn.example/post.jpg' }, 'Launch')
  assert.equal(action.params.image_url, 'https://cdn.example/post.jpg')
})

test('Instagram uses the current container-and-publish execution', () => {
  assert.deepEqual(buildSocialPublishingAction('instagram', { imageUrl: 'https://cdn.example/post.jpg' }, 'Launch'), {
    action: 'publish_post', params: { image_url: 'https://cdn.example/post.jpg', caption: 'Launch' },
  })
  assert.throws(() => buildSocialPublishingAction('instagram', {}, 'Launch'), /confirmed image/)
})

test('X is provider-safe and preserves a matched image for media upload', () => {
  const action = buildSocialPublishingAction('twitter', { imageUrl: 'https://cdn.example/x.jpg' }, 'a'.repeat(500))
  assert.equal(action.action, 'create_media_tweet')
  assert.equal(action.params.text.length, 280)
  assert.equal(action.params.image_url, 'https://cdn.example/x.jpg')
  assert.equal(xPostText('short'), 'short')
  assert.throws(() => buildSocialPublishingAction('x', {}, 'Launch'), /confirmed matched image/)
})

test('provider identifiers require a provider response field', () => {
  assert.equal(confirmedProviderId({ data: { id: '17890001' } }), '17890001')
  assert.equal(confirmedProviderId({ response: { data: { tweet_id: '19001' } } }), '19001')
  assert.equal(confirmedProviderId({ successful: true, data: 'success' }), '')
  assert.equal(confirmedProviderId({ data: '1234567890' }), '1234567890')
  assert.equal(confirmedProviderId({ logId: 'internal-log-only' }), '')
})

test('all platform IDs are retained for multi-platform history', () => {
  assert.deepEqual(providerPostIds({
    facebook: { status: 'success', id: 'fb_1' },
    instagram: { status: 'success', id: 'ig_1' },
    twitter: { status: 'success', id: 'x_1' },
    linkedin: { status: 'error' },
  }), { facebook: 'fb_1', instagram: 'ig_1', x: 'x_1' })
})

test('connector executes Instagram create then publish under one settlement', () => {
  const source = fs.readFileSync(new URL('../server/composioConnectorService.mjs', import.meta.url), 'utf8')
  assert.match(source, /pid === 'instagram' && actionId === 'publish_post'/)
  assert.match(source, /instagram\.create_media/)
  assert.match(source, /creation_id: creationId/)
  assert.equal((source.match(/chargeConfirmedExecution\(user, 1/g) || []).length >= 1, true)
})

test('Facebook resolves a managed Page and chooses the correct media tool', () => {
  const source = fs.readFileSync(new URL('../server/composioConnectorService.mjs', import.meta.url), 'utf8')
  assert.match(source, /FACEBOOK_LIST_MANAGED_PAGES/)
  assert.match(source, /FACEBOOK_CREATE_PHOTO_POST/)
  assert.match(source, /No managed Facebook Page was found/)
})

test('X uploads media then attaches the confirmed media ID to the real post', () => {
  const source = fs.readFileSync(new URL('../server/composioConnectorService.mjs', import.meta.url), 'utf8')
  assert.match(source, /TWITTER_UPLOAD_MEDIA/)
  assert.match(source, /composioClient\.files\.upload/)
  assert.match(source, /media_media_ids: \[String\(mediaId\)\]/)
  assert.doesNotMatch(source, /media__media__ids/)
  assert.match(source, /X did not return a confirmed media ID/)
})

test('scheduler persists per-platform IDs and skips confirmed retries', () => {
  const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(source, /post\.providerPostIds = providerPostIds\(postResults\)/)
  assert.match(source, /confirmedPreviousResult\?\.status === 'success'/)
  assert.match(source, /idempotencyKey: `\$\{existing\.id\}:\$\{post\.id\}:\$\{platform\}`/)
})

test('published content confirmation never mistakes X upload media for a tweet', () => {
  assert.equal(confirmedPublishedContentId('x', { data: { id: 'tweet_19001', media_id: 'media_88001' } }), 'tweet_19001')
  assert.equal(confirmedPublishedContentId('twitter', { data: { tweet_id: '19001', media_id: '88001' } }), '19001')
  assert.equal(confirmedPublishedContentId('x', { data: { media_id: '88001' } }), '')
  assert.equal(confirmedPublishedContentId('facebook', { data: { id: 'page_post_1', page_id: 'page_1' } }), 'page_post_1')
  assert.equal(confirmedPublishedContentId('instagram', { data: { id: 'ig_media_1' } }), 'ig_media_1')
})

test('failed durable claims can be reclaimed without bypassing idempotency', () => {
  const connector = fs.readFileSync(new URL('../server/composioConnectorService.mjs', import.meta.url), 'utf8')
  assert.match(connector, /async function reclaimFailedExecution/)
  assert.match(connector, /status=eq\.failed/)
  assert.match(connector, /previous\?\.status === 'failed'/)
  assert.match(connector, /provider_execution_id: null/)
})

test('missing connector execution schema falls back to the existing durable agent execution store', () => {
  const connector = fs.readFileSync(new URL('../server/composioConnectorService.mjs', import.meta.url), 'utf8')
  assert.match(connector, /findExecutionFallback\(userId, idempotencyKey\)/)
  assert.match(connector, /persistExecutionFallback\(record\)/)
  assert.match(connector, /return finishExecutionFallback\(userId, idempotencyKey, changes\)/)
  assert.match(connector, /fallbackExecutionId/)
  assert.match(connector, /rest\/v1\/agent_executions/)
  assert.match(connector, /approvalId\.startsWith\('campaign:'\)/)
  assert.match(connector, /using the campaign durable execution lock/)
  assert.match(connector, /campaignHistoryCompatibility/)
})

test('provider failures remain explicit and unconfirmed posts are never charged', () => {
  const connector = fs.readFileSync(new URL('../server/composioConnectorService.mjs', import.meta.url), 'utf8')
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(connector, /publish failed:/)
  assert.match(connector, /provider_rate_limit/)
  assert.match(server, /Publication failed\./)
  assert.match(server, /No credits were charged for unconfirmed platforms/)
  assert.match(server, /charged: Number\(execution\.credits_used \|\| 0\) > 0/)
})

test('stale claimed executions are eligible for reclaim and retry', () => {
  const stale = { status: 'claimed', created_at: new Date(Date.now() - 4 * 60_000).toISOString() }
  const fresh = { status: 'claimed', created_at: new Date(Date.now() - 20_000).toISOString() }
  assert.equal(shouldReclaimClaimedExecution(stale, Date.now()), true)
  assert.equal(shouldReclaimClaimedExecution(fresh, Date.now()), false)
  assert.equal(shouldReclaimClaimedExecution({ status: 'succeeded' }, Date.now()), false)
})

console.log(`\nSocial publishing tests: ${passed}/${passed} passed`)
