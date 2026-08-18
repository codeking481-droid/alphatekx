import assert from 'node:assert/strict'
import { getApprovalBadgeState } from '../src/lib/automation/approvalState.ts'
import { generateSchedule } from '../src/lib/scheduling/nextPostCalculator.ts'

const approvalState = getApprovalBadgeState({
  status: 'pending_approval',
  approved: false,
  campaign: { status: 'pending_approval', approved: false },
})
assert.equal(approvalState.label, 'Needs approval')
assert.equal(approvalState.variant, 'pending')

const schedule = generateSchedule(['Mon', 'Wed'], '9:00 AM', 3, 'Africa/Lagos')
assert.ok(Array.isArray(schedule))
assert.equal(schedule.length, 3)
assert.ok(schedule.every(date => date.getTime() > Date.now()))

console.log('WORKFLOW_BEHAVIOR_TESTS_OK')
