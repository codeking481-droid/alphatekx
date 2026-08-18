import assert from 'node:assert/strict'
import { buildCampaignSchedulePlan } from '../src/lib/scheduling/nextPostCalculator.ts'

const plan = buildCampaignSchedulePlan({
  postTime: '8:00 AM',
  postDays: ['Fri'],
  timezone: 'Africa/Lagos',
  totalRuns: 1,
  now: new Date('2026-07-31T00:00:00.000Z'),
})

assert.equal(plan.firstLocalDate, '2026-07-31')
assert.equal(plan.firstLocalTime, '08:00')
assert.equal(plan.scheduledDates[0], '2026-07-31T07:00:00.000Z')
console.log('schedule timezone test passed')
