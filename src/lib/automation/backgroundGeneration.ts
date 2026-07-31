import { generatePost } from '../ai/groq.ts'
import { generateAndUploadImage } from '../media/pollination.ts'

export type BackgroundGenerationOutcome = {
  content: string
  imageUrl: string
  scheduledFor: string
  status: 'scheduled'
  createdAt: string
}

type CreateBackgroundGenerationOutcomeInput = {
  topic: string
  goal: string
  audience: string
  tone: string
  length: 'short' | 'medium' | 'long'
  platform: string
  index: number
  scheduledFor: Date
  generateContent?: typeof generatePost
  generateImage?: typeof generateAndUploadImage
}

type CampaignPostLike = {
  captions?: Record<string, string>
  imageUrl?: string
  image_url?: string
  status?: string
  scheduledAt?: string
  [key: string]: unknown
}

export async function createBackgroundGenerationOutcome({
  topic,
  goal,
  audience,
  tone,
  length,
  platform,
  index,
  scheduledFor,
  generateContent = generatePost,
  generateImage = generateAndUploadImage,
}: CreateBackgroundGenerationOutcomeInput): Promise<BackgroundGenerationOutcome> {
  let content = ''
  let imageUrl = ''

  try {
    content = await generateContent({ topic, goal, audience, tone, length, platform })
  } catch {
    content = `Build a clear, useful post around ${topic}. Lead with a strong hook, then share one practical insight and a simple call to action.`
  }

  try {
    imageUrl = await generateImage(topic, index, null)
  } catch {
    imageUrl = ''
  }

  return {
    content,
    imageUrl,
    scheduledFor: scheduledFor.toISOString(),
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  }
}

export function applyBackgroundGenerationOutcomeToPost<T extends CampaignPostLike>(post: T, outcome: BackgroundGenerationOutcome, platform: string): T {
  return {
    ...post,
    captions: {
      ...(post.captions || {}),
      [platform]: outcome.content,
    },
    imageUrl: outcome.imageUrl || post.imageUrl || post.image_url || '',
    image_url: outcome.imageUrl || post.image_url || post.imageUrl || '',
    scheduledAt: outcome.scheduledFor || post.scheduledAt || '',
    status: outcome.status || post.status || 'scheduled',
  }
}
