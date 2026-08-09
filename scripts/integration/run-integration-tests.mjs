#!/usr/bin/env node
import runSmartRetryTests from './tests/smartRetry.test.mjs'

async function run() {
  console.log('Integration test runner — starting component tests')
  await runSmartRetryTests()
  console.log('Integration tests completed successfully')
}

run().catch(err => {
  console.error('Integration tests failed', err)
  process.exit(1)
})
