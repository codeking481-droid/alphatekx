import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAutomationLifecycle } from '../server/automation/lifecycle.mjs'

test('normalizes an approved automation to running state', () => {
  const agent = normalizeAutomationLifecycle({
    id: 'agent-1',
    name: 'Launch campaign',
    status: 'awaiting_approval',
    approved: true,
    campaign: {
      name: 'Launch campaign',
      description: 'Test campaign',
      brand: { business: 'Acme', audience: 'founders', tone: 'confident', website: '' },
      meta: { platforms: ['linkedin'], slots: [], durationDays: 1, postsPerDay: 1, totalPosts: 1, startDate: '', timezone: 'UTC', frequencyText: 'once' },
      posts: [{ id: 'post-1', day: 1, slot: '1', scheduledAt: '2026-01-01T09:00:00.000Z', platforms: ['linkedin'], topic: 'Launch', postType: 'announcement', captions: {}, status: 'pending_approval', approved: false }],
      totalCredits: 0,
      status: 'pending_approval',
      charged: false,
      approved: true,
      autoPublish: true,
    },
    trigger: { type: 'campaign', cron: 'campaign' },
    actions: [],
    executionHistory: [],
    successRate: 0,
    permissions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(agent.status, 'running')
  assert.equal(agent.approved, true)
  assert.equal(agent.campaign?.status, 'running')
  assert.equal(agent.campaign?.approved, true)
  assert.equal(agent.campaign?.posts?.[0]?.status, 'scheduled')
  assert.equal(agent.campaign?.posts?.[0]?.approved, true)
})

test('keeps approved running campaigns from drifting back to approval states', () => {
  const agent = normalizeAutomationLifecycle({
    id: 'agent-2',
    name: 'Recurring campaign',
    status: 'pending',
    approved: false,
    campaign: {
      name: 'Recurring campaign',
      description: 'Recurring launch',
      brand: { business: 'Acme', audience: 'founders', tone: 'confident', website: '' },
      meta: { platforms: ['linkedin'], slots: [], durationDays: 3, postsPerDay: 1, totalPosts: 3, startDate: '', timezone: 'UTC', frequencyText: 'recurring' },
      posts: [{ id: 'post-2', day: 1, slot: '1', scheduledAt: '2026-01-01T09:00:00.000Z', platforms: ['linkedin'], topic: 'Launch', postType: 'announcement', captions: {}, status: 'scheduled', approved: true }],
      totalCredits: 0,
      status: 'running',
      charged: false,
      approved: true,
      autoPublish: true,
    },
    trigger: { type: 'campaign', cron: 'campaign' },
    actions: [],
    executionHistory: [],
    successRate: 0,
    permissions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(agent.status, 'running')
  assert.equal(agent.campaign?.status, 'running')
})
