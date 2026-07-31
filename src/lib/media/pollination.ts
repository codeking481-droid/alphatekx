import type { SupabaseClient } from '@supabase/supabase-js'

export async function generateAndUploadImage(topic: string, index: number, supabase: SupabaseClient | null) {
  const prompt = `${topic} unique angle ${index}`
  const encoded = encodeURIComponent(`${prompt}, high quality, 1080x1080, polished, professional, no text errors`)
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1080&nologo=true&seed=${Date.now() + index}&model=flux`

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