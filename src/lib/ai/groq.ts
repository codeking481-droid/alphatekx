import Groq from 'groq-sdk'

const apiKey = (typeof process !== 'undefined' ? process.env.GROQ_API_KEY : undefined)
  || (typeof import.meta !== 'undefined' ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_GROQ_API_KEY : undefined)
  || ''

const groq = apiKey ? new Groq({ apiKey }) : null

export type PostLength = 'short' | 'medium' | 'long'

function countWords(content: string) {
  return content.split(/\s+/).filter(Boolean).length
}

function targetRange(length: PostLength) {
  if (length === 'short') return { min: 30, max: 60 }
  if (length === 'medium') return { min: 80, max: 120 }
  return { min: 150, max: 250 }
}

function fallbackPost(topic: string, length: PostLength) {
  const sample = `Build a clear, valuable post around ${topic}. Lead with a strong hook, share one practical insight, and end with a simple CTA that invites the audience to act now.`
  if (length === 'short') return sample.split(/\s+/).slice(0, 45).join(' ')
  if (length === 'medium') return sample.split(/\s+/).slice(0, 95).join(' ')
  return `${sample} ${sample}`.split(/\s+/).slice(0, 190).join(' ')
}

function normalizeContent(content: string) {
  return content.replace(/\s+/g, ' ').trim()
}

export async function generatePost({ topic, goal, audience, tone, length, platform }: {
  topic: string
  goal: string
  audience: string
  tone: string
  length: PostLength
  platform: string
}): Promise<string> {
  const target = targetRange(length)
  const prompt = `Write one ${platform || 'social'} post about ${topic}. Goal: ${goal}. Audience: ${audience}. Tone: ${tone}. Keep it sharp, engaging, and useful. Return plain text only. The post must contain between ${target.min} and ${target.max} words.`
  const maxTokens = length === 'long' ? 700 : length === 'medium' ? 420 : 240

  if (!groq) return fallbackPost(topic, length)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are AlphaTekX, a senior social copywriter. Write one polished post that respects the requested word count exactly and returns only the post content.' },
        { role: 'user', content: prompt },
      ],
      temperature: attempt === 0 ? 0.8 : 0.6,
      max_tokens: maxTokens,
    })

    const raw = normalizeContent(response.choices[0]?.message?.content || '')
    const words = countWords(raw)
    if (words >= target.min && words <= target.max) return raw
  }

  return fallbackPost(topic, length)
}