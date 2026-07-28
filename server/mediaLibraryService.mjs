import { createHash, randomUUID } from 'node:crypto'
import { supabaseServiceHeaders } from './supabaseHeaders.mjs'

const BUCKET = 'media-library'
const MAX_FILE_SIZE = 500 * 1024 * 1024
const ALLOWED_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'])

function headers(service, extra = {}) {
  return supabaseServiceHeaders(service, extra)
}

function assertConfig(config) {
  if (!config?.url || !config?.service) {
    const error = new Error('Media Library database is not configured.')
    error.code = 'DB_ERROR'
    throw error
  }
}

async function responseJson(response) {
  const raw = await response.text()
  let payload = null
  try { payload = raw ? JSON.parse(raw) : null } catch {}
  if (!response.ok) {
    const message = payload?.message || payload?.error || payload?.hint || raw || `HTTP ${response.status}`
    const error = new Error(message)
    error.code = /relation|schema cache|bucket not found/i.test(message) ? 'DB_ERROR' : 'MEDIA_ERROR'
    throw error
  }
  return payload
}

function safeName(value) {
  let name = String(value || 'upload')
  try { name = decodeURIComponent(name) } catch {}
  const cleaned = name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.slice(0, 120) || 'upload'
}

function fileKind(mime) {
  return String(mime).startsWith('video/') ? 'video' : 'image'
}

async function signedUrl(config, storagePath, expiresIn = 3600) {
  const response = await fetch(`${config.url}/storage/v1/object/sign/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: headers(config.service, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn }),
  })
  const payload = await responseJson(response)
  const signed = payload?.signedURL || payload?.signedUrl
  return signed ? new URL(signed, config.url).toString() : null
}

async function decorateRows(config, rows) {
  return Promise.all((rows || []).map(async row => ({
    ...row,
    file_url: await signedUrl(config, row.storage_path).catch(() => null),
    thumbnail_url: row.thumbnail_path ? await signedUrl(config, row.thumbnail_path).catch(() => null) : null,
  })))
}

export async function listMedia(config, user) {
  assertConfig(config)
  const response = await fetch(
    `${config.url}/rest/v1/media_library?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc`,
    { headers: headers(config.service) },
  )
  return decorateRows(config, await responseJson(response))
}

export async function uploadMedia(config, user, req) {
  assertConfig(config)
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  const size = Number(req.headers['content-length'] || 0)
  if (!ALLOWED_TYPES.has(mime)) {
    const error = new Error('Use an MP4, WebM, MOV, JPEG, PNG, or WebP file.')
    error.code = 'INVALID_MEDIA'
    throw error
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE) {
    const error = new Error('File size must be between 1 byte and 500MB.')
    error.code = 'INVALID_MEDIA'
    throw error
  }
  const originalName = safeName(req.headers['x-file-name'])
  const storagePath = `${user.id}/uploads/${Date.now()}-${randomUUID()}-${originalName}`
  const uploaded = await fetch(`${config.url}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: headers(config.service, { 'Content-Type': mime, 'Content-Length': String(size), 'x-upsert': 'false' }),
    body: req,
    duplex: 'half',
  })
  await responseJson(uploaded)

  const record = {
    user_id: user.id,
    storage_path: storagePath,
    file_name: originalName,
    file_type: fileKind(mime),
    mime_type: mime,
    file_size: size,
    title: originalName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
  }
  try {
    const created = await fetch(`${config.url}/rest/v1/media_library`, {
      method: 'POST',
      headers: headers(config.service, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(record),
    })
    const rows = await responseJson(created)
    return (await decorateRows(config, rows))[0]
  } catch (error) {
    await fetch(`${config.url}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: 'DELETE',
      headers: headers(config.service),
    }).catch(() => {})
    throw error
  }
}

export async function updateMedia(config, user, id, patch) {
  assertConfig(config)
  const allowed = {}
  if (typeof patch.title === 'string') allowed.title = patch.title.trim().slice(0, 160)
  if (typeof patch.description === 'string') allowed.description = patch.description.trim().slice(0, 5000)
  if (Array.isArray(patch.tags)) allowed.tags = patch.tags.map(String).map(v => v.trim()).filter(Boolean).slice(0, 30)
  if (Array.isArray(patch.platform_target)) allowed.platform_target = patch.platform_target.map(String).slice(0, 5)
  if (['ready', 'scheduled'].includes(patch.status)) allowed.status = patch.status
  if (patch.scheduled_for === null || typeof patch.scheduled_for === 'string') allowed.scheduled_for = patch.scheduled_for
  allowed.updated_at = new Date().toISOString()
  const response = await fetch(
    `${config.url}/rest/v1/media_library?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
    {
      method: 'PATCH',
      headers: headers(config.service, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(allowed),
    },
  )
  const rows = await responseJson(response)
  if (!rows?.[0]) throw new Error('Media item was not found.')
  return (await decorateRows(config, rows))[0]
}

export async function deleteMedia(config, user, id) {
  assertConfig(config)
  const find = await fetch(
    `${config.url}/rest/v1/media_library?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&select=storage_path`,
    { headers: headers(config.service) },
  )
  const rows = await responseJson(find)
  if (!rows?.[0]) return { deleted: true }
  const removed = await fetch(
    `${config.url}/rest/v1/media_library?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
    { method: 'DELETE', headers: headers(config.service) },
  )
  await responseJson(removed)
  await fetch(`${config.url}/storage/v1/object/${BUCKET}/${rows[0].storage_path}`, {
    method: 'DELETE',
    headers: headers(config.service),
  }).catch(() => {})
  return { deleted: true }
}

const STOP_WORDS = new Set(['about', 'after', 'again', 'also', 'and', 'because', 'business', 'create', 'every', 'from', 'have', 'into', 'post', 'social', 'that', 'the', 'their', 'this', 'with', 'your'])
function keywordsFor(content) {
  const counts = new Map()
  for (const word of String(content || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []) {
    if (!STOP_WORDS.has(word)) counts.set(word, (counts.get(word) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([word]) => word)
}

async function downloadImage(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'image/*' } })
    if (!response.ok) throw new Error(`Image provider returned HTTP ${response.status}.`)
    const mime = String(response.headers.get('content-type') || 'image/jpeg').split(';')[0]
    if (!ALLOWED_TYPES.has(mime) || !mime.startsWith('image/')) throw new Error('Image provider did not return a supported image.')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error('Generated image was empty or too large.')
    return { bytes, mime }
  } finally { clearTimeout(timeout) }
}

async function persistGenerated(config, user, bytes, mime, metadata) {
  const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  const storagePath = `${user.id}/auto-generated/${Date.now()}-${randomUUID()}.${extension}`
  const upload = await fetch(`${config.url}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: headers(config.service, { 'Content-Type': mime, 'x-upsert': 'false' }),
    body: bytes,
  })
  await responseJson(upload)
  const cache = await fetch(`${config.url}/rest/v1/image_cache`, {
    method: 'POST',
    headers: headers(config.service, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ user_id: user.id, storage_path: storagePath, ...metadata }),
  })
  await responseJson(cache)
  return { image_url: await signedUrl(config, storagePath, 86400), image_prompt: metadata.prompt, image_source: metadata.source }
}

export async function findSmartImage(config, user, content) {
  assertConfig(config)
  const keywords = keywordsFor(content)
  if (!keywords.length) throw new Error('Add a clear topic before Alpha selects an image.')
  const query = keywords.join(' ')
  const queryHash = createHash('sha256').update(query).digest('hex')

  const vault = await fetch(
    `${config.url}/rest/v1/media_library?user_id=eq.${encodeURIComponent(user.id)}&file_type=eq.image&tags=ov.{${keywords.map(encodeURIComponent).join(',')}}&select=storage_path&limit=1`,
    { headers: headers(config.service) },
  )
  const vaultRows = await responseJson(vault).catch(() => [])
  if (vaultRows?.[0]) return { image_url: await signedUrl(config, vaultRows[0].storage_path, 86400), image_prompt: query, image_source: 'vault' }

  const cached = await fetch(
    `${config.url}/rest/v1/image_cache?user_id=eq.${encodeURIComponent(user.id)}&query_hash=eq.${queryHash}&select=*&limit=1`,
    { headers: headers(config.service) },
  )
  const cachedRows = await responseJson(cached).catch(() => [])
  if (cachedRows?.[0]) return { image_url: await signedUrl(config, cachedRows[0].storage_path, 86400), image_prompt: cachedRows[0].prompt, image_source: cachedRows[0].source }

  const prompt = `professional photograph of ${keywords.join(', ')}, 4k photorealistic, sharp focus, professional studio lighting, DSLR, ultra detailed, vibrant colors, premium commercial photography`
  let source = 'pollinations'
  let remoteUrl = ''
  if (process.env.PEXELS_API_KEY) {
    const pexels = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, {
      headers: { Authorization: process.env.PEXELS_API_KEY },
    }).then(responseJson).catch(() => null)
    remoteUrl = pexels?.photos?.[0]?.src?.large2x || ''
    if (remoteUrl) source = 'pexels'
  }
  if (!remoteUrl) {
    const negative = 'cartoon, illustration, painting, drawing, blurry, low quality, distorted, text, watermark, logo'
    remoteUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=1024&height=1024&enhance=true&nologo=true&negative=${encodeURIComponent(negative)}&seed=${Date.now()}`
  }
  const { bytes, mime } = await downloadImage(remoteUrl)
  return persistGenerated(config, user, bytes, mime, { query_hash: queryHash, query, prompt, source })
}

async function patchQueueItem(config, id, patch, query = '') {
  const response = await fetch(`${config.url}/rest/v1/media_library?id=eq.${encodeURIComponent(id)}${query}`, {
    method: 'PATCH',
    headers: headers(config.service, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  })
  return responseJson(response)
}

export async function runDueMedia(config, executeProviderAction, now = new Date()) {
  assertConfig(config)
  const dueResponse = await fetch(
    `${config.url}/rest/v1/media_library?status=in.(scheduled,waiting_credits)&scheduled_for=lte.${encodeURIComponent(now.toISOString())}&claimed_at=is.null&select=*&order=scheduled_for.asc&limit=20`,
    { headers: headers(config.service) },
  )
  const due = await responseJson(dueResponse)
  const results = []
  for (const item of due || []) {
    const executionKey = `vault:${item.id}:${item.scheduled_for}`
    const claimed = await patchQueueItem(config, item.id, {
      status: 'processing', claimed_at: now.toISOString(), execution_key: executionKey, last_error: null,
    }, `&status=eq.${encodeURIComponent(item.status)}&claimed_at=is.null`)
    if (!claimed?.[0]) continue
    try {
      const profileResponse = await fetch(
        `${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(item.user_id)}&select=id,email&limit=1`,
        { headers: headers(config.service) },
      )
      const profile = (await responseJson(profileResponse))?.[0]
      if (!profile?.email) throw new Error('The owner profile has no email for its connected account.')
      const videoUrl = await signedUrl(config, item.storage_path, 3600)
      if (!videoUrl) throw new Error('Alpha could not create a secure video URL.')
      const title = String(item.title || item.file_name).slice(0, 100)
      const result = await executeProviderAction(
        { id: item.user_id, email: profile.email },
        'youtube',
        'upload_video',
        {
          title,
          description: String(item.description || `${title}\n\nPublished by AlphaTekx after explicit vault scheduling approval.`),
          tags: Array.isArray(item.tags) ? item.tags.slice(0, 20) : [],
          privacyStatus: 'public',
          video_url: videoUrl,
          idempotencyKey: executionKey,
          approvalId: `vault:${item.id}`,
        },
      )
      await patchQueueItem(config, item.id, {
        status: 'published',
        published_at: new Date().toISOString(),
        provider_id: result.providerId,
        last_error: null,
      })
      results.push({ id: item.id, status: 'published', providerId: result.providerId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const waiting = /insufficient credits/i.test(message)
      await patchQueueItem(config, item.id, {
        status: waiting ? 'waiting_credits' : 'failed',
        claimed_at: waiting ? null : now.toISOString(),
        last_error: message.slice(0, 1000),
      })
      results.push({ id: item.id, status: waiting ? 'waiting_credits' : 'failed', error: message })
    }
  }
  return results
}
