import test from 'node:test'
import assert from 'node:assert/strict'
import { canCreateAgent, setPlan, spendCredits } from '../server/billing.mjs'

const config = { url: '', service: '' }

function makeUser(id) {
  return { id, email: `${id}@example.com` }
}

test('limits active automation creation based on plan and budget', async () => {
  const user = makeUser('billing-v1-test-user')
  const planResult = await setPlan(user, 'creator_monthly', config)
  assert.equal(planResult.ok, true)

  const first = await canCreateAgent(user, config, 1)
  assert.equal(first.ok, true)

  const second = await canCreateAgent(user, config, 2)
  assert.equal(second.ok, false)
  assert.match(second.reason || '', /active automation/i)

  const spend = await spendCredits(user, 1, config, { reason: 'activation' })
  assert.equal(spend.ok, true)
  assert.equal(spend.remaining, 149)
})
