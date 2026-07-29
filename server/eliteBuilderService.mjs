import { randomUUID } from 'node:crypto'
import { supabaseServiceHeaders } from './supabaseHeaders.mjs'

export const BUILDER_COST = 2
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/

const missingTable = message => /builder_projects|schema cache|does not exist|relation .* does not exist/i.test(String(message || ''))
const headers = config => supabaseServiceHeaders(config.service)

async function request(config, path, init = {}) {
  if (!config.url || !config.service) throw new Error('Builder database is not configured on the server.')
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(config), ...(init.headers || {}) },
  })
  const raw = await response.text()
  let payload = null
  try { payload = raw ? JSON.parse(raw) : null } catch { payload = raw }
  if (!response.ok) {
    const message = payload?.message || payload?.error || `Builder database returned HTTP ${response.status}.`
    if (missingTable(message)) throw new Error('Builder needs one administrator database activation. Apply supabase/elite-builder.sql once.')
    throw new Error(String(message))
  }
  return payload
}

export function normalizeBuilderCode(value) {
  let code = String(value || '').trim()
  const fence = code.match(/```(?:jsx|tsx|javascript|js)?\s*([\s\S]*?)```/i)
  if (fence) code = fence[1].trim()
  code = code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/\bexport\s+default\s+function\s+App\b/, 'function App')
    .replace(/\bexport\s+default\s+App\s*;?/g, '')
    .replace(/\bexport\s+(?=(?:const|function|class)\s+)/g, '')
    .trim()
  return code
}

export function validateBuilderCode(value) {
  const raw = String(value || '')
  const code = normalizeBuilderCode(value)
  const errors = []
  if (code.length < 300) errors.push('The generated application was incomplete.')
  if (!/(?:function|const)\s+App\b/.test(code)) errors.push('The generated application did not define App.')
  if (!/\breturn\s*\(?\s*</.test(code)) errors.push('The generated application did not render interface markup.')
  if (/\b(?:eval|Function)\s*\(/.test(code)) errors.push('The generated application contained unsafe dynamic execution.')
  if (/<script\b/i.test(code)) errors.push('The generated component contained an embedded script tag.')
  if (/^\s*import\s/m.test(raw)) errors.push('The generated application depended on unavailable imports.')
  if (/\b(?:ReactDOM\.)?createRoot\s*\(/.test(code)) errors.push('The generated application attempted to mount itself.')
  if (/(?<!React\.)\b(?:useState|useEffect|useMemo|useReducer|useRef)\s*\(/.test(code)) errors.push('The generated application used an unavailable bare React hook.')
  return { code, errors }
}

export async function listProjects(config, user) {
  const rows = await request(config, `builder_projects?user_id=eq.${encodeURIComponent(user.id)}&charged=eq.true&select=id,slug,title,prompt,code,provider,public_url,published,views,created_at,updated_at&order=created_at.desc&limit=50`)
  return Array.isArray(rows) ? rows : []
}

export async function findProjectByRequest(config, user, requestId) {
  const rows = await request(config, `builder_projects?user_id=eq.${encodeURIComponent(user.id)}&request_id=eq.${encodeURIComponent(requestId)}&select=*&limit=1`)
  return rows?.[0] || null
}

export async function saveGeneratedProject(config, user, input) {
  const id = input.id || randomUUID()
  const record = {
    id,
    user_id: user.id,
    // A private draft slug keeps this compatible with older installations
    // where the original builder_projects.slug column was declared NOT NULL.
    slug: `draft-${String(id).replace(/-/g, '').slice(0, 20)}`,
    title: String(input.title || 'Untitled build').trim().slice(0, 120),
    prompt: String(input.prompt || '').trim().slice(0, 6000),
    code: String(input.code || ''),
    provider: String(input.provider || 'alpha'),
    request_id: String(input.requestId || id),
    charged: false,
    published: false,
    updated_at: new Date().toISOString(),
  }
  const rows = await request(config, 'builder_projects', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(record),
  })
  return rows?.[0] || record
}

export async function markProjectCharged(config, user, id) {
  const rows = await request(config, `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ charged: true, updated_at: new Date().toISOString() }),
  })
  if (!rows?.length) throw new Error('Builder could not finalize the verified project.')
  return rows[0]
}

export async function deleteProject(config, user, id) {
  await request(config, `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })
}

export async function deployProject(config, user, input, baseUrl) {
  const id = String(input.id || '')
  const slug = String(input.slug || '').trim().toLowerCase()
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Object.assign(new Error('Select a generated project before deploying.'), { status: 400 })
  if (!SLUG_PATTERN.test(slug)) throw Object.assign(new Error('Use 3–30 lowercase letters, numbers, or hyphens. Start and end with a letter or number.'), { status: 400 })
  const conflict = await request(config, `builder_projects?slug=eq.${encodeURIComponent(slug)}&id=neq.${encodeURIComponent(id)}&select=id&limit=1`)
  if (conflict?.length) throw Object.assign(new Error('That Builder address is already taken. Choose another slug.'), { status: 409 })
  const publicUrl = `${String(baseUrl).replace(/\/$/, '')}/b/${slug}`
  const rows = await request(config, `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ slug, public_url: publicUrl, published: true, updated_at: new Date().toISOString() }),
  })
  if (!rows?.length) throw Object.assign(new Error('This build could not be found in your account.'), { status: 404 })
  return { project: rows[0], publicUrl }
}

export async function getPublicProject(config, slug) {
  if (!SLUG_PATTERN.test(String(slug || ''))) return null
  const rows = await request(config, `builder_projects?slug=eq.${encodeURIComponent(slug)}&published=eq.true&select=id,slug,title,code,public_url,views,created_at&limit=1`)
  const project = rows?.[0]
  if (!project) return null
  void request(config, `builder_projects?id=eq.${encodeURIComponent(project.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ views: Number(project.views || 0) + 1 }),
  }).catch(() => {})
  return project
}
