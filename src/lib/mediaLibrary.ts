import { getJson, postJson } from './apiClient'
import { supabase } from './supabase'

export type MediaItem = {
  id: string
  file_url: string | null
  thumbnail_url: string | null
  file_name: string
  file_type: 'video' | 'image'
  mime_type: string
  file_size: number
  title: string | null
  description: string | null
  tags: string[]
  platform_target: string[]
  status: 'ready' | 'scheduled' | 'processing' | 'waiting_credits' | 'published' | 'failed'
  scheduled_for: string | null
  published_at: string | null
  provider_id: string | null
  created_at: string
}

async function bearerToken() {
  const session = await supabase?.auth.getSession()
  return session?.data?.session?.access_token || ''
}

async function mediaRequest<T>(url: string, init: RequestInit): Promise<T> {
  const token = await bearerToken()
  const response = await fetch(url, {
    ...init,
    credentials: 'omit',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  })
  const raw = await response.text()
  let payload: Record<string, unknown> = {}
  try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {} } catch {}
  if (!response.ok) throw new Error(String(payload.error || raw || `Upload failed with HTTP ${response.status}.`))
  return payload as T
}

export async function listMedia() {
  return getJson<{ items: MediaItem[]; setupRequired?: boolean }>('/api/media/list')
}

export async function uploadMedia(file: File, onProgress?: (percent: number) => void) {
  const token = await bearerToken()
  return new Promise<MediaItem>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/media/upload')
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onerror = () => reject(new Error('Upload connection failed. Your file was not saved.'))
    xhr.onload = () => {
      let payload: { item?: MediaItem; error?: string } = {}
      try { payload = JSON.parse(xhr.responseText || '{}') } catch {}
      if (xhr.status < 200 || xhr.status >= 300 || !payload.item) {
        reject(new Error(payload.error || `Upload failed with HTTP ${xhr.status}.`))
        return
      }
      resolve(payload.item)
    }
    xhr.send(file)
  })
}

export async function updateMedia(id: string, patch: Partial<Pick<MediaItem, 'title' | 'description' | 'tags' | 'platform_target' | 'status' | 'scheduled_for'>>) {
  return mediaRequest<{ item: MediaItem }>(`/api/media/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export async function deleteMedia(id: string) {
  return mediaRequest<{ deleted: boolean }>(`/api/media/${id}`, { method: 'DELETE' })
}

export async function createSmartImage(content: string) {
  return postJson<{ image_url: string; image_prompt: string; image_source: string }>('/api/media/smart-image', { content })
}

export async function publishMedia(id: string) {
  return mediaRequest<{ id: string; status: 'published'; providerId: string; duplicate?: boolean }>(`/api/media/${id}/publish`, {
    method: 'POST',
  })
}
