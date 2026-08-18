import assert from 'node:assert/strict'
import { resolvePaystackCallbackUrl } from '../server/billing.mjs'
import fs from 'node:fs'

const dashboard = fs.readFileSync(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8')
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')

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

assert.match(dashboard, /fetch\('\/api\/paystack\/verify', \{[\s\S]*method: 'POST'/, 'dashboard must verify through the authenticated JSON API')
assert.match(dashboard, /await refreshProfile\(\)/, 'successful verification must refresh the displayed credit balance')
assert.match(server, /\['GET', 'POST'\]\.includes\(req\.method \|\| ''\)/, 'Paystack callback verification must tolerate browser GET callbacks and authenticated POST verification')
console.log('Paystack instant credit refresh contracts passed')
