import test from 'node:test'
import assert from 'node:assert/strict'
import { applyBackgroundGenerationOutcomeToPost, createBackgroundGenerationOutcome } from '../src/lib/automation/backgroundGeneration.ts'

test('createBackgroundGenerationOutcome falls back gracefully when generation fails', async () => {
  const outcome = await createBackgroundGenerationOutcome({
    topic: 'AI for founders',
    goal: 'Grow trust',
    audience: 'founders',
    tone: 'confident',
    length: 'medium',
    platform: 'linkedin',
    index: 1,
    scheduledFor: new Date('2026-01-01T09:00:00.000Z'),
    generateContent: async () => {
      throw new Error('content failed')
    },
    generateImage: async () => {
      throw new Error('image failed')
    },
  })

  assert.equal(outcome.status, 'scheduled')
  assert.match(outcome.content, /AI for founders/i)
  assert.equal(outcome.imageUrl, '')
})

test('applyBackgroundGenerationOutcomeToPost populates the campaign post payload', () => {
  const post = {
    id: 'post-1',
    platforms: ['linkedin'],
    captions: {},
  }

  const outcome = {
    content: 'A real post draft for the launch',
    imageUrl: 'https://cdn.example.com/post.png',
    scheduledFor: '2026-01-01T09:00:00.000Z',
    status: 'scheduled' as const,
    createdAt: '2026-01-01T08:00:00.000Z',
  }

  const updated = applyBackgroundGenerationOutcomeToPost(post, outcome, 'linkedin')

  assert.equal(updated.captions.linkedin, outcome.content)
  assert.equal(updated.imageUrl, outcome.imageUrl)
  assert.equal(updated.image_url, outcome.imageUrl)
})
