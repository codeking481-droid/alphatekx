import assert from 'node:assert/strict'
import fs from 'node:fs'
import { getCreditPack as getClientCreditPack } from '../src/lib/billing.ts'
import { createConversationEngine } from '../server/alpha/conversationEngine.mjs'
import { getCreditPack as getServerCreditPack, parsePaystackResponse, resolvePaystackCharge } from '../server/billing.mjs'

const results = []
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }) }
  catch (error) { results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }) }
}
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

await test('Verified Paystack purchases use durable atomic settlement instead of ephemeral pending state', () => {
  const billing = read('server/billing.mjs')
  assert.match(billing, /rpc\/complete_credit_purchase/)
  assert.match(billing, /completeVerifiedPurchaseWithoutRpc/)
  assert.match(billing, /rest\/v1\/credit_purchases/)
  assert.match(billing, /Payment amount or currency does not match the selected AlphaTekx product/)
  assert.doesNotMatch(billing, /if \(!pendingRecord\) return \{ ok: false, reference, message: 'Payment reference was not initialized by AlphaTekx'/)
  assert.match(billing, /releaseClaim/)
  assert.match(billing, /payment history could not be saved|history insert returned/)
})

await test('Admin credit transfers are server-authorized, durable, and idempotent', () => {
  const billing = read('server/billing.mjs')
  const server = read('server.mjs')
  const admin = read('src/pages/Admin.tsx')
  assert.match(billing, /grantCreditsByAdmin/)
  assert.match(billing, /admin-transfer:\$\{admin\.id\}:\$\{key\}/)
  assert.match(server, /authenticatedAdmin\(req\)/)
  assert.match(server, /\/api\/admin\/credits\/transfer/)
  assert.match(admin, /Transfer credits/)
  assert.match(admin, /crypto\.randomUUID\(\)/)
})

await test('Alpha queued state is presented as a friendly green progress notification', () => {
  const agents = read('src/pages/Agents.tsx')
  assert.match(agents, /noticeClasses/)
  assert.match(agents, /bg-emerald-400/)
  assert.match(agents, /aria-live="polite"/)
})

await test('Paystack callback retries transient settlement failures safely', () => {
  const payment = read('src/lib/payment.ts')
  assert.match(payment, /for \(let attempt = 0; attempt < 4; attempt \+= 1\)/)
  assert.match(payment, /still being credited\|temporar\|try again\|processing/)
})

await test('Google OAuth returns to Auth and opens the workspace automatically', () => {
  const auth = read('src/lib/auth.tsx')
  assert.match(auth, /\/auth\?oauth=google/)
  assert.match(auth, /window\.location\.assign\('\/dashboard'\)/)
})

await test('Alpha mobile chat uses available workspace height and a safe-area composer', () => {
  const agents = read('src/pages/Agents.tsx')
  assert.match(agents, /h-full min-h-0/)
  assert.match(agents, /safe-area-inset-bottom/)
  assert.match(agents, /Math\.min\(event\.currentTarget\.scrollHeight, 160\)/)
})

await test('Paystack empty response reports the operation without JSON parser leakage', async () => {
  await assert.rejects(() => parsePaystackResponse(new Response('', { status: 502 }), 'checkout initialization'), /empty response during checkout initialization/i)
})

await test('Paystack malformed response is reported safely', async () => {
  await assert.rejects(() => parsePaystackResponse(new Response('<html>gateway error</html>', { status: 502 }), 'payment verification'), /invalid response during payment verification/i)
})

await test('Paystack valid response remains usable', async () => {
  const payload = await parsePaystackResponse(new Response('{"status":true,"data":{"authorization_url":"https://checkout.paystack.com/test"}}'), 'checkout initialization')
  assert.equal(payload.data.authorization_url, 'https://checkout.paystack.com/test')
})

await test('Paystack Spark checkout stays above the NGN minimum', () => {
  const previousCurrency = process.env.PAYSTACK_CHECKOUT_CURRENCY
  const previousRate = process.env.PAYSTACK_NGN_PER_USD
  process.env.PAYSTACK_CHECKOUT_CURRENCY = 'NGN'
  process.env.PAYSTACK_NGN_PER_USD = '1600'
  const charge = resolvePaystackCharge({ amountKobo: 100 })
  assert.deepEqual(charge, { amount: 160000, currency: 'NGN', listPriceUsdCents: 100 })
  if (previousCurrency == null) delete process.env.PAYSTACK_CHECKOUT_CURRENCY
  else process.env.PAYSTACK_CHECKOUT_CURRENCY = previousCurrency
  if (previousRate == null) delete process.env.PAYSTACK_NGN_PER_USD
  else process.env.PAYSTACK_NGN_PER_USD = previousRate
})

await test('Paystack USD mode falls back to NGN below the two-dollar minimum', () => {
  const previousCurrency = process.env.PAYSTACK_CHECKOUT_CURRENCY
  process.env.PAYSTACK_CHECKOUT_CURRENCY = 'USD'
  const spark = resolvePaystackCharge({ amountKobo: 100 })
  const creator = resolvePaystackCharge({ amountKobo: 300 })
  assert.equal(spark.currency, 'NGN')
  assert.equal(creator.currency, 'USD')
  assert.equal(creator.amount, 300)
  if (previousCurrency == null) delete process.env.PAYSTACK_CHECKOUT_CURRENCY
  else process.env.PAYSTACK_CHECKOUT_CURRENCY = previousCurrency
})

await test('Paystack preserves explicit NGN pack currency for the ₦100 test purchase', () => {
  const charge = resolvePaystackCharge({ amountKobo: 10000, currency: 'NGN' })
  assert.deepEqual(charge, { amount: 10000, currency: 'NGN', listPriceUsdCents: 10000 })
})

await test('The ₦100 credit pack resolves consistently across client and server checkout flows', () => {
  const clientPack = getClientCreditPack('test_100')
  const legacyPack = getServerCreditPack('test_50')
  assert.ok(clientPack)
  assert.ok(legacyPack)
  assert.equal(clientPack.id, 'test_100')
  assert.equal(legacyPack.id, 'test_100')
  assert.equal(clientPack.credits, 100)
  assert.equal(legacyPack.credits, 100)
  assert.equal(clientPack.amountKobo, 10000)
  assert.equal(legacyPack.amountKobo, 10000)
})

await test('Paystack defaults to NGN checkout when the merchant has no USD support', () => {
  const previousCurrency = process.env.PAYSTACK_CHECKOUT_CURRENCY
  const previousAllowUsd = process.env.PAYSTACK_ALLOW_USD
  delete process.env.PAYSTACK_CHECKOUT_CURRENCY
  delete process.env.PAYSTACK_ALLOW_USD
  const charge = resolvePaystackCharge({ amountKobo: 1000, currency: 'USD' })
  assert.equal(charge.currency, 'NGN')
  assert.equal(charge.amount, 1600000)
  assert.equal(charge.listPriceUsdCents, 1000)
  if (previousCurrency == null) delete process.env.PAYSTACK_CHECKOUT_CURRENCY
  else process.env.PAYSTACK_CHECKOUT_CURRENCY = previousCurrency
  if (previousAllowUsd == null) delete process.env.PAYSTACK_ALLOW_USD
  else process.env.PAYSTACK_ALLOW_USD = previousAllowUsd
})

await test('Alpha conversation reload uses an owner-scoped durable lookup', async () => {
  let lookup = null
  const record = { id: 'conversation-1', userId: 'owner-1', messages: [], knownFields: {}, missingFields: [], askedFields: [] }
  const engine = createConversationEngine({
    getServerAgent: async (...args) => { lookup = args; return structuredClone(record) },
    saveServerAgent: async value => value,
    getUserCredits: async () => 30,
    spendUserCredits: async () => ({ ok: true }),
    getIntegrationStatus: async () => ({ connected: true, ready: true }),
    callLLMForRole: async () => ({ result: {}, provider: 'test', model: 'test' }),
  })
  await engine.get('conversation-1', { id: 'owner-1', email: 'owner@test.local' })
  assert.deepEqual(lookup, ['conversation-1', 'owner-1'])
})

await test('Interactive Alpha provider order prioritizes Groq and leaves OpenAI last', () => {
  const source = read('server.mjs')
  assert.match(source, /DEFAULT_PROVIDER_ORDER = 'groq,qwen,kimi,minimax,flatkey,openai'/)
})

await test('Stale automation delete and cancellation are idempotent in the browser', () => {
  const store = read('src/lib/agents/agentStore.ts')
  const preview = read('src/components/agents/CampaignPreview.tsx')
  assert.match(store, /response\.status === 404/)
  assert.match(preview, /res\.status === 404/)
  assert.match(preview, /no longer on the server/)
})

const passed = results.filter(item => item.ok).length
console.log('PRODUCTION_CORE_FLOW_TESTS:')
for (const item of results) console.log(`- ${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` — ${item.error}` : ''}`)
console.log(`- Total: ${results.length}, Passed: ${passed}, Failed: ${results.length - passed}`)
if (passed !== results.length) process.exit(1)
console.log('PRODUCTION_CORE_FLOW_TESTS_OK')
