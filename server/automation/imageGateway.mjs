const adapters = new Map()

export function registerImageProvider(id, adapter) {
  if (!id || typeof adapter?.generate !== 'function') throw new Error('Image provider adapter must expose generate()')
  adapters.set(id, adapter)
}

export function listImageProviders() {
  return Array.from(adapters.keys())
}

export function buildImagePrompt({ mission = '', topic = '', audience = '', tone = '', brand = {}, previousConcepts = [] }) {
  return [
    `Create one original social-post image concept for: ${topic || mission}.`,
    audience ? `Audience: ${audience}.` : '',
    tone ? `Tone: ${tone}.` : '',
    brand.visualStyle ? `Visual style: ${brand.visualStyle}.` : '',
    brand.preferredColors ? `Preferred colors: ${brand.preferredColors}.` : '',
    'Do not invent logos, customers, awards, statistics, or product claims.',
    previousConcepts.length ? `Avoid these previous concepts: ${previousConcepts.join('; ')}.` : '',
  ].filter(Boolean).join(' ')
}

export async function generateImage(request, options = {}) {
  const provider = options.provider || process.env.ALPHA_IMAGE_PROVIDER || ''
  const adapter = adapters.get(provider)
  if (!adapter) {
    const error = new Error('Image generation is not configured yet. Continue without an image or try again later.')
    error.code = 'IMAGE_PROVIDER_UNAVAILABLE'
    error.chargeable = false
    throw error
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(options.timeoutMs || 45_000)))
  try {
    const result = await adapter.generate({ ...request, prompt: request.prompt || buildImagePrompt(request), signal: controller.signal })
    if (!result?.url && !result?.data) throw new Error('Image provider returned no image')
    return { ...result, provider, generatedAt: new Date().toISOString() }
  } catch (cause) {
    const error = new Error(cause?.name === 'AbortError' ? 'Image generation timed out.' : cause?.message || 'Image generation failed.')
    error.code = cause?.name === 'AbortError' ? 'IMAGE_TIMEOUT' : 'IMAGE_PROVIDER_ERROR'
    error.chargeable = false
    throw error
  } finally { clearTimeout(timer) }
}
