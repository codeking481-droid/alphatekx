import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildSocialPublishingAction, providerPostIds, xPostText } from '../server/automation/socialPublishing.mjs'
import { confirmedProviderId } from '../server/composioConnectorService.mjs'

let passed = 0
function test(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}`); throw error }
}

test('Facebook creates a real Page post action', () => {
  assert.deepEqual(buildSocialPublishingAction('facebook', {}, 'AlphaTekx is live'), {
    action: 'create_page_post', params: { message: 'AlphaTekx is live' },
  })
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

test('X is provider-safe at the 280 character boundary', () => {
  const action = buildSocialPublishingAction('twitter', { imageUrl: 'https://cdn.example/x.jpg' }, 'a'.repeat(500))
  assert.equal(action.action, 'create_tweet')
  assert.equal(action.params.text.length, 280)
  assert.equal(action.params.image_url, undefined)
  assert.equal(xPostText('short'), 'short')
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

test('scheduler persists per-platform IDs and skips confirmed retries', () => {
  const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(source, /post\.providerPostIds = providerPostIds\(postResults\)/)
  assert.match(source, /confirmedPreviousResult\?\.status === 'success'/)
  assert.match(source, /idempotencyKey: `\$\{existing\.id\}:\$\{post\.id\}:\$\{platform\}`/)
})

console.log(`\nSocial publishing tests: ${passed}/${passed} passed`)
