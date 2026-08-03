import type { SupabaseClient } from '@supabase/supabase-js'

export async function generateAndUploadImage(topic: string, index: number, supabase: SupabaseClient | null) {
  const styles = [
    'dark mode SaaS, neon blue glow, premium',
    'light mode, clean white, subtle gradient, professional',
    'abstract 3D, isometric, modern tech, vibrant',
  ]
  const style = styles[Math.floor(Math.random() * styles.length)]
  const prompt = `${topic} unique angle ${index}, premium LinkedIn SaaS visual, ultra detailed 4k, cinematic lighting, modern SaaS gradient background (dark blue to electric blue), minimalist professional style, abstract tech elements, 2026 design trend, ${style}, no stock photo, no blurry, no watermark, no text, no words, no low quality, no cartoon, no old design`
  const encoded = encodeURIComponent(prompt)
  const seed = Math.floor(Math.random() * 9999999)
  const url = `https://gen.pollinations.ai/image/${encoded}?model=flux&width=1200&height=628&enhance=true&nologo=true&seed=${seed}&t=${Date.now()}`

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Pollination image request failed (${response.status})`)

    const blob = await response.blob()
    const filename = `post-${Date.now()}-${index}.jpg`

    if (supabase) {
      try {
        const { error } = await supabase.storage.from('post-images').upload(filename, blob, { contentType: 'image/jpeg', upsert: true })
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