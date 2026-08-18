import { createHash, randomUUID } from 'node:crypto'

export function normalizeContent(value) {
  return String(value || '').toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/#[\p{L}\p{N}_-]+/gu, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

export function contentFingerprint(value) {
  return createHash('sha256').update(normalizeContent(value)).digest('hex')
}

function tokens(value) {
  return new Set(normalizeContent(value).split(' ').filter(token => token.length > 2))
}

export function contentSimilarity(left, right) {
  const a = tokens(left)
  const b = tokens(right)
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection++
  return intersection / (a.size + b.size - intersection)
}

export function extractContentSignals(content) {
  const text = String(content || '').trim()
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean)
  const hashtags = Array.from(text.matchAll(/#[\p{L}\p{N}_-]+/gu), match => match[0].toLowerCase())
  const sentences = text.split(/[.!?]\s+/).map(sentence => sentence.trim()).filter(Boolean)
  return {
    hook: lines[0] || sentences[0] || '',
    cta: [...sentences].reverse().find(sentence => /\b(comment|tell me|share|try|start|learn|follow|visit|join|what do you|how do you)\b/i.test(sentence)) || '',
    hashtags,
  }
}

export function findDuplicate(content, memory = [], threshold = 0.82) {
  const fingerprint = contentFingerprint(content)
  for (const item of memory) {
    if (item.contentFingerprint === fingerprint) return { duplicate: true, reason: 'exact_content', item }
    const similarity = contentSimilarity(content, item.content)
    if (similarity >= threshold) return { duplicate: true, reason: 'near_duplicate', similarity, item }
    const currentHook = normalizeContent(extractContentSignals(content).hook)
    const previousHook = normalizeContent(item.hook || extractContentSignals(item.content).hook)
    if (currentHook && previousHook && currentHook === previousHook) return { duplicate: true, reason: 'repeated_hook', item }
  }
  return { duplicate: false }
}

export function calendarHasDuplicates(calendar = [], memory = []) {
  const seen = [...memory]
  for (const post of calendar) {
    const content = Object.values(post.captions || {}).find(value => typeof value === 'string' && value.trim()) || ''
    const duplicate = findDuplicate(content, seen)
    if (duplicate.duplicate) return duplicate
    const signals = extractContentSignals(content)
    seen.push({ content, contentFingerprint: contentFingerprint(content), ...signals })
  }
  return { duplicate: false }
}

export function createContentMemoryRecord({ automationId, platform, content, post = {}, status = 'published', creditsUsed = 0 }) {
  const signals = extractContentSignals(content)
  return {
    id: randomUUID(), automationId, platform, content, contentFingerprint: contentFingerprint(content),
    semanticTopic: post.topic || '', hook: signals.hook, cta: signals.cta, hashtags: signals.hashtags,
    imageConcept: post.imageConcept || '', imageAssetId: post.imageAssetId || '', scheduledAt: post.scheduledAt || null,
    publishedAt: post.postedAt || null, providerPostId: post.providerPostId || null, status, creditsUsed,
    userEdits: post.edited ? [content] : [], createdAt: new Date().toISOString(),
  }
}
