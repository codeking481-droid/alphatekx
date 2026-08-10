import Groq from 'groq-sdk'

const apiKey = (typeof process !== 'undefined' ? process.env.GROQ_API_KEY : undefined)
  || (typeof import.meta !== 'undefined' ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_GROQ_API_KEY : undefined)
  || ''

const groq = apiKey ? new Groq({ apiKey }) : null

export type PostLength = 'short' | 'medium' | 'long'

function countWords(content: string) {
  return content.split(/\s+/).filter(Boolean).length
}

function countSentences(content: string) {
  return (content.match(/[^.!?]+[.!?]+/g) || []).length
}

function countHashtags(content: string) {
  return (content.match(/#[\p{L}\p{N}_-]+/gu) || []).length
}

function hasCTA(content: string) {
  return /\b(action|learn|join|discover|get|start|book|try|visit|reply|comment|share|connect|follow|apply|claim)\b/i.test(content)
}

function targetRange(length: PostLength) {
  if (length === 'short') return { min: 30, max: 60 }
  if (length === 'medium') return { min: 80, max: 120 }
  return { min: 150, max: 250 }
}

function fallbackPost(topic: string, length: PostLength) {
  const sample = `Build a clear, valuable post about ${topic}. Lead with a strong hook, share one practical insight, then end with a direct call to action. #growth #brand #strategy`
  const words = sample.split(/\s+/).filter(Boolean)
  if (length === 'short') return words.slice(0, 45).join(' ')
  if (length === 'medium') return words.slice(0, 95).join(' ')
  return words.concat(words).slice(0, 190).join(' ')
}

function normalizeContent(content: string) {
  return content.replace(/\s+/g, ' ').trim()
}

function validateGeneratedPost(raw: string, length: PostLength) {
  const normalized = normalizeContent(raw)
  const words = countWords(normalized)
  const sentences = countSentences(normalized)
  const hashtags = countHashtags(normalized)
  return (
    words >= targetRange(length).min &&
    words <= targetRange(length).max &&
    sentences >= 2 &&
    sentences <= 4 &&
    normalized.length >= 80 &&
    hashtags >= 3 &&
    hashtags <= 5 &&
    hasCTA(normalized)
  )
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
  const prompt = `Write one ${platform || 'social'} post about ${topic}. Goal: ${goal}. Audience: ${audience}. Tone: ${tone}. Use 2-3 full sentences, include a clear value or benefit, end with a strong call to action, and include 3-5 hashtags. Return only plain text with no markdown or bullet points. The post must contain between ${target.min} and ${target.max} words.`
  const maxTokens = length === 'long' ? 700 : length === 'medium' ? 420 : 240

  if (!groq) return fallbackPost(topic, length)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are AlphaTekX, a world-class viral content writer for African and global audiences. Write polished social copy that is ready to publish.' },
        { role: 'user', content: prompt },
      ],
      temperature: attempt === 0 ? 0.75 : 0.6,
      max_tokens: maxTokens,
    })

    const raw = normalizeContent(response.choices[0]?.message?.content || '')
    if (validateGeneratedPost(raw, length)) return raw
  }

  return fallbackPost(topic, length)
}
