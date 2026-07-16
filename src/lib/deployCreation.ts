import type { Creation } from './types'
import { supabase } from './supabase'

export function slugifyCreation(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'my-app'
}

export async function publishCreationPath(creation: Creation, requestedSlug: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const session = (await supabase.auth.getSession()).data.session
  if (!session) throw new Error('Sign in before publishing.')
  const slug = slugifyCreation(requestedSlug)
  const response = await fetch('/api/creations/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ creationId: creation.id, slug }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Publication failed.')
  return payload as { slug: string; path: string; url: string }
}
