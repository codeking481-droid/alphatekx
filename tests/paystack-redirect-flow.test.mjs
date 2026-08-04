import assert from 'node:assert/strict'
import { resolvePaystackCallbackUrl } from '../server/billing.mjs'

const cases = [
  {
    name: 'uses explicit callback url',
    item: { callback_url: 'https://example.com/thanks' },
    fallback: 'https://alphatekx.name.ng/dashboard',
    expected: 'https://example.com/thanks',
  },
  {
    name: 'uses callbackUrl field',
    item: { callbackUrl: 'https://example.com/callback' },
    fallback: 'https://alphatekx.name.ng/dashboard',
    expected: 'https://example.com/callback',
  },
  {
    name: 'falls back to environment value',
    item: {},
    fallback: 'https://alphatekx.name.ng/dashboard',
    expected: 'https://alphatekx.name.ng/dashboard',
  },
]

for (const testCase of cases) {
  const result = resolvePaystackCallbackUrl(testCase.item, testCase.fallback)
  assert.equal(result, testCase.expected, testCase.name)
}

console.log('Paystack redirect callback tests passed')
