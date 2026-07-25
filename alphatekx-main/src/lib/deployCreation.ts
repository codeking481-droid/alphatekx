import type { Creation } from './types'
import { supabase } from './supabase'

export function slugifyCreation(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'my-app'
}

function localUserHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('alphatekx:local-user')
    if (!raw) return {}
    const u = JSON.parse(raw)
    if (u?.id && u?.email) return { 'x-local-user-id': String(u.id), 'x-local-user-email': String(u.email) }
  } catch {}
  return {}
}

export type AvailabilityResult = { available: boolean; name: string; slug: string; reserved?: boolean; invalid?: boolean; reason?: string; suggestions?: string[]; urlPreview?: string; pathPreview?: string }

export async function checkNameAvailability(name: string): Promise<AvailabilityResult> {
  const response = await fetch(`/api/projects/check-availability?name=${encodeURIComponent(name)}`, { headers: localUserHeaders() })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Availability check failed.')
  return payload as AvailabilityResult
}

export async function publishCreationPath(creation: Creation, requestedSlug: string) {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  const slug = slugifyCreation(requestedSlug)
  const response = await fetch('/api/creations/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...localUserHeaders(),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ creationId: creation.id, slug, title: creation.title, code: creation.code }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Publication failed.')
  return payload as { slug: string; path: string; url: string; subdomainUrl: string }
}

export async function deployPastedHtml(input: { title: string; slug: string; html: string }) {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  const title = input.title.trim().slice(0, 120)
  const slug = slugifyCreation(input.slug)
  const html = input.html.trim()
  if (!title) throw new Error('Enter an app name.')
  if (!/<(?:!doctype\s+html|html|body)[\s>]/i.test(html)) throw new Error('Paste a complete HTML document.')
  if (new Blob([html]).size > 900_000) throw new Error('HTML must be smaller than 900 KB.')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 45_000)
  try {
    const response = await fetch('/api/creations/publish-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...localUserHeaders(),
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ title, slug, html }),
      signal: controller.signal,
    })
    const raw = await response.text()
    let payload: Record<string, unknown> = {}
    try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {} } catch {}
    if (!response.ok) throw new Error(String(payload.error || raw || `Deployment server returned HTTP ${response.status}.`))
    return payload as { creationId: string; slug: string; pathUrl: string; subdomainUrl: string }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Deployment timed out. Render may be waking up; try once more.')
    if (error instanceof TypeError) throw new Error('Could not reach the deployment server. Confirm Render is running the Web Service with `npm start`.')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
