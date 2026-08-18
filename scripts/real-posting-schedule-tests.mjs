import assert from 'node:assert/strict'
import { calculateNextPost, generateFullSchedule, getLiveCountdown } from '../src/lib/scheduling/nextPostCalculator.ts'

const fridayMorning = new Date('2026-07-31T07:00:00.000Z') // 08:00 WAT, exactly on the requested slot
assert.equal(calculateNextPost(['Fri'], '8:00 AM', 'Africa/Lagos', fridayMorning).toISOString(), '2026-08-07T07:00:00.000Z')

const schedule = generateFullSchedule(['Mon', 'Wed', 'Fri'], '9:00 AM', 5, 'Africa/Lagos', new Date('2026-07-31T08:00:01.000Z'))
assert.deepEqual(schedule.map(value => value.toISOString()), [
  '2026-08-03T08:00:00.000Z',
  '2026-08-05T08:00:00.000Z',
  '2026-08-07T08:00:00.000Z',
  '2026-08-10T08:00:00.000Z',
  '2026-08-12T08:00:00.000Z',
])

assert.deepEqual(getLiveCountdown('2026-08-01T10:01:02.000Z', 'Africa/Lagos', new Date('2026-08-01T10:00:00.000Z')), {
  remainingMs: 62_000,
  diff: 62_000,
  text: '1m 2s',
  days: 0,
  hours: 0,
  minutes: 1,
  seconds: 2,
  isDue: false,
  due: false,
})

console.log('REAL_POSTING_SCHEDULE_TESTS_OK')
