import type { SupabaseClient } from '@supabase/supabase-js'

function hashTopic(topic: string) {
  let hash = 0
  const text = String(topic || '').trim().toLowerCase()
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function buildPremiumPrompt(userInput: string) {
  const safeInput = String(userInput || 'modern professional brand growth').trim() || 'modern professional brand growth'
  const isAutomotive = /\b(car|vehicle|automobile|motorbike|truck|suv)\b/i.test(safeInput)
  const normalized = isAutomotive
    ? `${safeInput}, premium automotive brand scene, clean studio composition, polished surfaces`
    : `${safeInput}, modern African business aesthetic, premium brand imagery`

  return [
    `Professional LinkedIn banner image of ${normalized}`,
    'ultra-detailed 8K, photorealistic, crisp focus, clean modern aesthetic, premium brand photography, elegant editorial composition, subtle background, no text, no watermark, no logo, no blur, no noise',
    'aspect ratio 16:9, 1600x900, cinematic natural lighting, stylish corporate look, high-end minimal visual'
  ].join(', ')
}

export async function generateAndUploadImage(topic: string, index: number, supabase: SupabaseClient | null) {
  const prompt = buildPremiumPrompt(topic)
  const encoded = encodeURIComponent(prompt)
  const seed = Date.now() + index + Math.floor(Math.random() * 10000) + hashTopic(topic)
  const url = `https://gen.pollinations.ai/image/${encoded}?model=flux&width=1600&height=900&enhance=true&nologo=true&seed=${seed}&t=${Date.now()}`

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Pollination image request failed (${response.status})`)

    const blob = await response.blob()
    const filename = `post-${Date.now()}-${index}-${seed}.webp`

    if (supabase) {
      try {
        const { error } = await supabase.storage.from('post-images').upload(filename, blob, { contentType: 'image/webp', upsert: true })
        if (!error) {
          const { data } = supabase.storage.from('post-images').getPublicUrl(filename)
          return data.publicUrl || url
        }
      } catch {
        // fall back to the direct pollination URL when storage upload is unavailable
      }
    }
  } catch {
    // Always fall back to the direct Pollination URL so the automation still gets a usable visual.
  }

  return url
}
