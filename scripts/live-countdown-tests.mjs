import assert from 'node:assert/strict'
import { formatCountdown } from '../src/lib/scheduling/countdown.mjs'

const now = 1_700_000_000_000
assert.equal(formatCountdown(new Date(now + 90_000).toISOString(), now), 'Starts in 1m')
assert.equal(formatCountdown(new Date(now + 3_600_000).toISOString(), now), 'Starts in 1h 0m')
assert.equal(formatCountdown(new Date(now - 10_000).toISOString(), now), 'Live now')
console.log('LIVE_COUNTDOWN_TESTS_OK')
