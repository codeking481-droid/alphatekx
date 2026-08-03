import type { SupabaseClient } from '@supabase/supabase-js'

export function buildPremiumPrompt(userInput: string) {
  const safeInput = String(userInput || 'modern professional brand growth').trim() || 'modern professional brand growth'
  const normalized = safeInput.toLowerCase().includes('car') || safeInput.toLowerCase().includes('vehicle') || safeInput.toLowerCase().includes('automobile')
    ? `${safeInput}, premium automotive brand scene, clean studio composition, polished surfaces`
    : safeInput

  return [
    `Professional LinkedIn banner image of ${normalized}`,
    'ultra-detailed 8K, photorealistic, crisp focus, clean modern aesthetic, premium SaaS brand photography, elegant neutral studio background, subtle product styling, high-end editorial composition, no text, no watermark, no logo, no low quality, no cartoon, no blurry artifacts, no heavy gradients, no clutter',
    'aspect ratio 16:9, 1600x900, cinematic natural lighting, premium corporate feel, polished and minimal'
  ].join(', ')
}

export async function generateAndUploadImage(topic: string, index: number, supabase: SupabaseClient | null) {
  const prompt = buildPremiumPrompt(topic)
  const encoded = encodeURIComponent(prompt)
  const seed = Math.floor(Math.random() * 9999999)
  const url = `https://gen.pollinations.ai/image/${encoded}?model=flux&width=1600&height=900&enhance=true&nologo=true&seed=${seed}&t=${Date.now()}`

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Pollination image request failed (${response.status})`)

    const blob = await response.blob()
    const filename = `post-${Date.now()}-${index}.webp`

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