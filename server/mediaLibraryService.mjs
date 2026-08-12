import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import ffmpegPath from 'ffmpeg-static'
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

function parseJsonSafe(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const cleaned = raw.replace(/^[^\[\{]+/, '').replace(/\u0000/g, '')
  try { return JSON.parse(cleaned) } catch {}
  return null
}

function getGroqApiKey() {
  return [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_1].map(String).find(k => k.trim())?.trim() || ''
}

function getPexelsApiKey() {
  return [process.env.PEXELS_API_KEY, process.env.PEXELS_API_KEY_1, process.env.PEXELS_API_KEY_2, process.env.PEXELS_API_KEY_3]
    .map(String)
    .find(k => k.trim())
    ?.trim() || ''
}

function pexelsOrientation(aspectRatio) {
  return aspectRatio === '9:16' ? 'portrait' : 'landscape'
}

function ffmpegBinary() {
  const binary = String(ffmpegPath || process.env.FFMPEG_PATH || '').trim()
  if (!binary) throw new Error('Video processing requires FFmpeg. Add ffmpeg-static to the project or configure FFMPEG_PATH.')
  return binary
}

function ffmpegScaleFilter(aspectRatio) {
  if (aspectRatio === '9:16') {
    return 'scale=w=720:h=1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black'
  }
  return 'scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black'
}

async function runFfmpeg(args, cwd) {
  const result = spawnSync(ffmpegBinary(), args, { cwd, encoding: 'utf8', windowsHide: true })
  if (result.status === 0) return result
  const stderr = String(result.stderr || result.stdout || '').trim()
  throw new Error(stderr || 'FFmpeg failed without output.')
}

function normalizeVideoPlanScenes(scenes, prompt, duration) {
  const normalized = Array.isArray(scenes) ? scenes.slice(0, 3).map((scene, index) => {
    const description = String(scene?.description || scene?.pexelsQuery || scene?.query || prompt || '').trim().replace(/\s+/g, ' ') || prompt
    return {
      description,
      query: String(scene?.pexelsQuery || scene?.query || description).trim() || prompt,
      durationSeconds: Number(scene?.durationSeconds) || 0,
      index,
    }
  }) : []
  if (!normalized.length) return [{ description: prompt, query: prompt, durationSeconds: duration, index: 0 }]
  const total = normalized.reduce((sum, scene) => sum + scene.durationSeconds, 0)
  if (total <= 0) {
    const each = Math.max(1, Math.floor(duration / normalized.length))
    normalized.forEach(scene => { scene.durationSeconds = each })
  } else if (total !== duration) {
    let remaining = duration
    normalized.forEach((scene, index) => {
      if (index === normalized.length - 1) {
        scene.durationSeconds = remaining
      } else {
        const ratio = scene.durationSeconds / total
        const rounded = Math.max(1, Math.round(duration * ratio))
        scene.durationSeconds = rounded
        remaining -= rounded
      }
    })
  }
  return normalized.map(scene => ({ ...scene, durationSeconds: Math.max(1, Math.min(scene.durationSeconds, duration)) }))
}

async function buildVideoPlan(prompt, duration, aspectRatio) {
  const cleanPrompt = String(prompt || '').trim()
  const key = getGroqApiKey()
  if (!key) return [{ description: cleanPrompt, query: cleanPrompt, durationSeconds: duration, index: 0 }]
  const model = String(process.env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim()
  const system = `You are a premium commercial video director. Convert the request into a short plan for ${duration}-second stock video that can be sourced from Pexels. Return valid JSON only.`
  const user = `Request: ${cleanPrompt}\nAspect ratio: ${aspectRatio}\nTarget duration: ${duration} seconds.\nReturn an array of 1 to 3 scenes. Each scene must include: description, pexelsQuery, durationSeconds.`
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        max_tokens: 260,
      }),
    })
    const data = await response.json()
    const content = String(data?.choices?.[0]?.message?.content || '').trim()
    const parsed = parseJsonSafe(content)
    const scenes = normalizeVideoPlanScenes(parsed, cleanPrompt, duration)
    return scenes
  } catch (error) {
    console.warn(`[AlphaTekX] Groq video plan failed: ${error instanceof Error ? error.message : error}`)
    return [{ description: cleanPrompt, query: cleanPrompt, durationSeconds: duration, index: 0 }]
  }
}

function choosePexelsFile(video) {
  if (!video || !Array.isArray(video.video_files) || video.video_files.length === 0) return null
  const candidates = video.video_files.filter(file => String(file.file_type || '').toLowerCase() === 'video/mp4')
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const qualityOrder = { hq: 3, hd: 2, sd: 1 }
    const aQuality = qualityOrder[String(a.quality || '').toLowerCase()] || 0
    const bQuality = qualityOrder[String(b.quality || '').toLowerCase()] || 0
    if (bQuality !== aQuality) return bQuality - aQuality
    return (b.width || 0) - (a.width || 0)
  })
  return candidates[0]
}

async function searchPexelsClips(query, aspectRatio) {
  const apiKey = getPexelsApiKey()
  if (!apiKey) return []
  const response = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${encodeURIComponent(pexelsOrientation(aspectRatio))}`,
    { headers: { Authorization: apiKey } },
  )
  const data = await responseJson(response)
  if (!Array.isArray(data?.videos)) return []
  return data.videos
}

async function fetchPexelsClip(planScene, aspectRatio) {
  const queries = [planScene.query, planScene.description].filter(Boolean)
  for (const query of queries) {
    try {
      const clips = await searchPexelsClips(query, aspectRatio)
      for (const clip of clips) {
        const file = choosePexelsFile(clip)
        if (file?.link) {
          return { url: String(file.link), description: planScene.description, durationSeconds: planScene.durationSeconds }
        }
      }
    } catch (error) {
      console.warn(`[AlphaTekX] Pexels search failed for query "${query}": ${error instanceof Error ? error.message : error}`)
    }
  }
  return null
}

async function transcodeClip(inputPath, outputPath, durationSeconds, aspectRatio) {
  const filter = ffmpegScaleFilter(aspectRatio)
  const args = [
    '-y',
    '-i', inputPath,
    '-t', String(durationSeconds),
    '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    outputPath,
  ]
  try {
    return runFfmpeg(args, path.dirname(outputPath))
  } catch (error) {
    const fallback = [
      '-y',
      '-i', inputPath,
      '-t', String(durationSeconds),
      '-vf', filter,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-an',
      outputPath,
    ]
    return runFfmpeg(fallback, path.dirname(outputPath))
  }
}

async function concatenateClips(tempDir, clipPaths, outputPath) {
  const listFile = path.join(tempDir, 'concat-list.txt')
  const content = clipPaths.map(clip => `file '${path.basename(clip).replace(/'/g, "'\\''")}'`).join('\n')
  await fs.promises.writeFile(listFile, content, 'utf8')
  const args = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', path.basename(listFile),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    path.basename(outputPath),
  ]
  return runFfmpeg(args, tempDir)
}

async function renderPexelsVideo(prompt, duration, aspectRatio) {
  const plan = await buildVideoPlan(prompt, duration, aspectRatio)
  const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'alpha-video-'))
  const outputPath = path.join(tempDir, 'alpha-output.mp4')
  try {
    const clipPaths = []
    for (const scene of plan) {
      const clip = await fetchPexelsClip(scene, aspectRatio)
      if (!clip) continue
      const sourcePath = path.join(tempDir, `scene-${scene.index}-source.mp4`)
      const downloaded = await downloadVideo(clip.url, 180_000)
      await fs.promises.writeFile(sourcePath, downloaded.bytes)
      const trimmedPath = path.join(tempDir, `scene-${scene.index}-trimmed.mp4`)
      await transcodeClip(sourcePath, trimmedPath, scene.durationSeconds, aspectRatio)
      clipPaths.push(trimmedPath)
    }
    if (!clipPaths.length) throw new Error('Pexels did not return any usable clips for this request.')
    if (clipPaths.length === 1) {
      await fs.promises.copyFile(clipPaths[0], outputPath)
    } else {
      await concatenateClips(tempDir, clipPaths, outputPath)
    }
    const bytes = await fs.promises.readFile(outputPath)
    return { bytes, mime: 'video/mp4' }
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function generateLegacyPollinationsVideo(config, user, prompt, options = {}) {
  const key = String(process.env.POLLINATIONS_API_KEY || '').trim()
  if (!key) {
    const error = new Error('Video generation is not configured yet. Add POLLINATIONS_API_KEY on Render, then redeploy.')
    error.code = 'VIDEO_PROVIDER_NOT_CONFIGURED'
    throw error
  }
  const cleanPrompt = String(prompt || '').trim()
  const model = String(process.env.POLLINATIONS_VIDEO_MODEL || 'wan-fast').trim()
  const duration = Math.min(10, Math.max(4, Number(options.duration) || 5))
  const aspectRatio = options.aspectRatio === '9:16' ? '9:16' : '16:9'
  const params = new URLSearchParams({ model, duration: String(duration), aspectRatio, enhance: 'true' })
  const url = `https://gen.pollinations.ai/video/${encodeURIComponent(cleanPrompt)}?${params.toString()}`
  const delays = [0, 2_000, 5_000]
  let downloaded = null
  let lastError = null
  for (let attempt = 0; attempt < 3 && !downloaded; attempt += 1) {
    if (delays[attempt]) await wait(delays[attempt])
    try { downloaded = await downloadVideo(url, 180_000, { Authorization: `Bearer ${key}` }) }
    catch (error) {
      lastError = error
      console.warn(`[AlphaTekX] Pollinations video attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : error}`)
    }
  }
  if (!downloaded) throw Object.assign(new Error(`Alpha could not verify a generated video after three attempts. ${lastError instanceof Error ? lastError.message : ''}`.trim()), { code: 'VIDEO_PROVIDER_ERROR' })
  return downloaded
}

const OPTIONAL_MEDIA_COLUMNS = new Set([
  'mime_type', 'file_size', 'title', 'description', 'tags', 'platform_target',
  'status', 'scheduled_for', 'published_at', 'provider_id', 'execution_key',
  'claimed_at', 'last_error', 'thumbnail_path', 'updated_at',
])

function missingMediaColumn(error) {
  const message = String(error?.message || '')
  return message.match(/Could not find the ['"]([^'"]+)['"] column of ['"]media_library['"]/i)?.[1] || ''
}

async function insertMediaRecord(config, record, prefer = 'return=representation') {
  const compatible = { ...record }
  for (let attempt = 0; attempt <= OPTIONAL_MEDIA_COLUMNS.size; attempt += 1) {
    try {
      const response = await fetch(`${config.url}/rest/v1/media_library`, {
        method: 'POST',
        headers: headers(config.service, { 'Content-Type': 'application/json', Prefer: prefer }),
        body: JSON.stringify(compatible),
      })
      return await responseJson(response)
    } catch (error) {
      const column = missingMediaColumn(error)
      if (!column || !OPTIONAL_MEDIA_COLUMNS.has(column) || !(column in compatible)) throw error
      delete compatible[column]
      console.warn(`[AlphaTekX] media_library.${column} is unavailable; saving verified media with the compatible schema.`)
    }
  }
  throw Object.assign(new Error('Media Library could not save a compatible record.'), { code: 'DB_ERROR' })
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

export function isMissingMediaSchema(error) {
  return error?.code === 'DB_ERROR' && /media_library|schema cache|relation|does not exist/i.test(String(error?.message || ''))
}

function extensionForMime(mime) {
  return {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  }[mime] || ''
}

export function nameForMime(value, mime) {
  const name = safeName(value)
  const expected = extensionForMime(mime)
  if (!expected) return name
  const current = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || ''
  const aliases = mime === 'image/jpeg' ? new Set(['jpg', 'jpeg']) : new Set([expected])
  if (aliases.has(current)) return name
  return `${name.replace(/\.[^.]+$/, '') || 'upload'}.${expected}`
}

async function ensureBucket(config) {
  const current = await fetch(`${config.url}/storage/v1/bucket/${BUCKET}`, {
    headers: headers(config.service),
  })
  if (current.ok) return true
  if (current.status !== 404) await responseJson(current)

  const created = await fetch(`${config.url}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers(config.service, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: MAX_FILE_SIZE,
      allowed_mime_types: [...ALLOWED_TYPES],
    }),
  })
  // Another request may have created it between the GET and POST.
  if (!created.ok && created.status !== 409) await responseJson(created)
  return true
}

async function hasMediaTable(config) {
  const response = await fetch(`${config.url}/rest/v1/media_library?select=id&limit=1`, {
    headers: headers(config.service),
  })
  await responseJson(response)
  return true
}

export async function mediaSetupStatus(config) {
  assertConfig(config)
  const status = { activated: false, tableReady: false, bucketReady: false }
  try {
    status.bucketReady = await ensureBucket(config)
  } catch (error) {
    status.bucketError = error instanceof Error ? error.message : 'Private storage could not be prepared.'
  }
  try {
    status.tableReady = await hasMediaTable(config)
  } catch (error) {
    status.tableError = error instanceof Error ? error.message : 'Media records are not available.'
  }
  status.activated = status.bucketReady && status.tableReady
  return status
}

async function signedUrl(config, storagePath, expiresIn = 3600) {
  const response = await fetch(`${config.url}/storage/v1/object/sign/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: headers(config.service, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn }),
  })
  const payload = await responseJson(response)
  const signed = payload?.signedURL || payload?.signedUrl
  if (!signed) return null
  if (/^https?:\/\//i.test(signed)) return signed
  const path = String(signed).startsWith('/storage/v1/')
    ? String(signed)
    : `/storage/v1/${String(signed).replace(/^\/+/, '')}`
  return new URL(path, config.url).toString()
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
  const setup = await mediaSetupStatus(config)
  if (!setup.activated) {
    const error = new Error(setup.tableError || setup.bucketError || 'Media Library storage is not ready.')
    error.code = 'DB_ERROR'
    error.setup = setup
    throw error
  }
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
  const originalName = nameForMime(req.headers['x-file-name'], mime)
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
    const rows = await insertMediaRecord(config, record)
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
function keywordsFor(content, objective = '', platform = '') {
  const counts = new Map()
  const combined = `${objective} ${content}`.toLowerCase()
  for (const word of combined.match(/[a-z0-9]{3,}/g) || []) {
    if (!STOP_WORDS.has(word)) counts.set(word, (counts.get(word) || 0) + 1)
  }
  const base = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([word]) => word)
  const context = String(platform || 'social').replace('twitter', 'x')
  return base.map((word, index) => index === 0 ? `${word} premium real-world scene` : index === 1 ? `${word} professional commercial setting` : `${word} authentic ${context} campaign`)
}

const NEGATIVE_IMAGE_PHRASE = 'no stock photo, no blurry, no watermark, no text, no words, no low quality, no cartoon, no old design'

function randomPollinationsSeed() {
  return Math.floor(Math.random() * 9999999)
}

async function enhanceImagePrompt(topic, platform = 'linkedin') {
  const cleanTopic = String(topic || '').replace(/\s+/g, ' ').trim().slice(0, 500)
  const cleanPlatform = String(platform || 'linkedin').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'linkedin'
  const system = `You are a premium commercial visual director. Convert a topic into one precise ${cleanPlatform} campaign image prompt. Describe a single clear subject, environment, composition, camera angle, lighting, materials, and restrained brand palette. Require photorealistic editorial quality, sharp focus, natural anatomy, and clean negative space. Never request typography, logos, watermarks, UI screenshots, or duplicated subjects.`
  const user = `topic = "${cleanTopic}"`
  const key = String(process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 || '')
  const model = String(process.env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim()

  if (key) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.6,
          max_tokens: 180,
        }),
      })
      if (response.ok) {
        const data = await response.json()
        const candidate = String(data?.choices?.[0]?.message?.content || '').trim()
        if (candidate) return candidate
      }
    } catch (error) {
      console.warn(`[AlphaTekX] Groq prompt enhancement failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return `Premium ${cleanPlatform} campaign visual for ${cleanTopic}. One unmistakable focal subject, photorealistic editorial composition, sharp natural detail, cinematic but credible lighting, restrained deep-indigo and warm-gold accents, uncluttered background with useful negative space, no text, no logo, no watermark, no duplicated subjects.`
}

export function generateAdvancedImagePrompt(content, objective = '', platform = '') {
  const keywords = keywordsFor(content, objective, platform)
  if (!keywords.length) throw new Error('Add a clear topic before Alpha selects an image.')
  const subject = String(objective || content).replace(/\s+/g, ' ').trim().slice(0, 500)
  return {
    keywords,
    advancedPrompt: `Create one crystal-clear premium commercial photograph that directly represents: ${subject}. Main visual subjects: ${keywords.join(', ')}. Photorealistic editorial composition, clearly defined subject, tack-sharp focus, natural textures, balanced contrast, professional studio lighting, DSLR quality, 8k-level detail, clean background, social-media campaign ready, no typography in the image`,
    negativePrompt: 'blurry, soft focus, haze, pixelated, low resolution, compression artifacts, distorted, deformed, duplicate subjects, illegible text, letters, words, watermark, logo, cartoon, illustration, painting, amateur',
  }
}

async function buildPremiumPollinationsPrompt(topic, platform = 'linkedin') {
  const prompt = await enhanceImagePrompt(topic, platform)
  return `${prompt}, premium commercial photography, ${NEGATIVE_IMAGE_PHRASE}`
}

export function pollinationsImageUrl(advancedPrompt, negativePrompt, seed = randomPollinationsSeed(), options = {}) {
  // Pollinations expects a numeric seed. Previous timestamp labels containing
  // hyphens were rejected by some image workers before generation started.
  const numericSeed = Number.isSafeInteger(Number(seed))
    ? Math.abs(Number(seed)) % 2147483647
    : parseInt(createHash('sha256').update(String(seed)).digest('hex').slice(0, 8), 16) % 2147483647
  const params = new URLSearchParams({
    model: 'flux',
    width: '1200',
    height: '628',
    enhance: 'true',
    nologo: 'true',
    negative: negativePrompt,
    seed: String(numericSeed),
    t: String(Date.now()),
  })
  const host = options.legacy || options.backup ? 'https://image.pollinations.ai/prompt' : 'https://gen.pollinations.ai/image'
  return `${host}/${encodeURIComponent(advancedPrompt)}?${params.toString()}`
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function downloadImage(url, minimumBytes = 50 * 1024, timeoutMs = 60_000, requestHeaders = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'image/*', ...requestHeaders } })
    if (!response.ok) throw new Error(`Image provider returned HTTP ${response.status}.`)
    const mime = String(response.headers.get('content-type') || 'image/jpeg').split(';')[0]
    if (!ALLOWED_TYPES.has(mime) || !mime.startsWith('image/')) throw new Error('Image provider did not return a supported image.')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length < minimumBytes || bytes.length > 15 * 1024 * 1024) throw new Error('Generated image failed the quality-size check.')
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
  await insertMediaRecord(config, {
      user_id: user.id,
      storage_path: storagePath,
      file_name: `alpha-${metadata.query_hash.slice(0, 12)}.${extension}`,
      file_type: 'image',
      mime_type: mime,
      file_size: bytes.length,
      title: metadata.query,
      description: metadata.prompt,
      tags: metadata.keywords || [],
      status: 'ready',
    }, 'return=minimal')
  const cache = await fetch(`${config.url}/rest/v1/image_cache`, {
    method: 'POST',
    headers: headers(config.service, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({
      user_id: user.id,
      storage_path: storagePath,
      query_hash: metadata.query_hash,
      query: metadata.query,
      prompt: metadata.prompt,
      source: metadata.source,
    }),
  })
  await responseJson(cache).catch(error => {
    console.warn(`[AlphaTekX] Verified image saved without optional image cache: ${error instanceof Error ? error.message : error}`)
  })
  return {
    image_url: await signedUrl(config, storagePath, 86400),
    image_storage_path: storagePath,
    image_prompt: metadata.prompt,
    image_keywords: metadata.keywords || [],
    image_source: metadata.source,
  }
}

async function downloadVideo(url, timeoutMs = 180_000, requestHeaders = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'video/mp4,video/*', ...requestHeaders } })
    if (!response.ok) throw new Error(`Video provider returned HTTP ${response.status}.`)
    const mime = String(response.headers.get('content-type') || 'video/mp4').split(';')[0]
    if (!mime.startsWith('video/')) throw new Error('Video provider did not return a video.')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length < 100 * 1024 || bytes.length > 500 * 1024 * 1024) throw new Error('Generated video failed the quality-size check.')
    return { bytes, mime: ALLOWED_TYPES.has(mime) ? mime : 'video/mp4' }
  } finally { clearTimeout(timeout) }
}

export async function generateVideo(config, user, prompt, options = {}) {
  assertConfig(config)
  await ensureBucket(config)
  const cleanPrompt = String(prompt || '').trim()
  if (cleanPrompt.length < 10) throw Object.assign(new Error('Describe the video in at least 10 characters.'), { code: 'INVALID_CONTENT' })
  const duration = Math.min(10, Math.max(4, Number(options.duration) || 5))
  const aspectRatio = options.aspectRatio === '9:16' ? '9:16' : '16:9'
  let downloaded = null
  let model = 'groq+pexels'
  try {
    downloaded = await renderPexelsVideo(cleanPrompt, duration, aspectRatio)
  } catch (primaryError) {
    console.warn(`[AlphaTekX] Pexels video pipeline failed: ${primaryError instanceof Error ? primaryError.message : primaryError}`)
    try {
      downloaded = await generateLegacyPollinationsVideo(config, user, cleanPrompt, { duration, aspectRatio })
      model = String(process.env.POLLINATIONS_VIDEO_MODEL || 'wan-fast').trim()
    } catch (fallbackError) {
      const error = fallbackError instanceof Error ? fallbackError : new Error('Video generation failed.')
      throw Object.assign(error, { code: error.code || 'VIDEO_PROVIDER_ERROR' })
    }
  }
  const extension = extensionForMime(downloaded.mime) || 'mp4'
  const storagePath = `${user.id}/auto-generated-video/${Date.now()}-${randomUUID()}.${extension}`
  await responseJson(await fetch(`${config.url}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: headers(config.service, { 'Content-Type': downloaded.mime, 'x-upsert': 'false' }),
    body: downloaded.bytes,
  }))
  const rows = await insertMediaRecord(config, {
      user_id: user.id,
      storage_path: storagePath,
      file_name: `alpha-video-${Date.now()}.${extension}`,
      file_type: 'video',
      mime_type: downloaded.mime,
      file_size: downloaded.bytes.length,
      title: cleanPrompt.slice(0, 120),
      description: cleanPrompt,
      tags: ['alpha-generated', model],
      status: 'ready',
    })
  const item = rows?.[0]
  if (!item?.id) throw Object.assign(new Error('The generated video was stored but its media record could not be confirmed.'), { code: 'DB_ERROR' })
  const fileUrl = await signedUrl(config, storagePath, 86400)
  return { item: { ...item, file_url: fileUrl }, video_url: fileUrl, video_storage_path: storagePath, model }
}

export async function findSmartImage(config, user, content, objective = '', platform = '', options = {}) {
  assertConfig(config)
  await ensureBucket(config)
  const { keywords, advancedPrompt, negativePrompt } = generateAdvancedImagePrompt(content, objective, platform)
  const promptTopic = String(objective || content || platform || 'premium LinkedIn SaaS visual').trim()
  const premiumPrompt = await buildPremiumPollinationsPrompt(promptTopic, platform)
  const query = keywords.join(' ')
  const uniqueNonce = options.forceUnique === true ? String(options.uniqueNonce || `${Date.now()}-${Math.random()}`) : ''
  const queryHash = createHash('sha256').update(`${platform}:${query}:${uniqueNonce}`).digest('hex')

  const vault = options.forceUnique === true ? null : await fetch(
    `${config.url}/rest/v1/media_library?user_id=eq.${encodeURIComponent(user.id)}&file_type=eq.image&tags=ov.{${keywords.map(encodeURIComponent).join(',')}}&select=storage_path&limit=1`,
    { headers: headers(config.service) },
  )
  const vaultRows = vault ? await responseJson(vault).catch(() => []) : []
  if (vaultRows?.[0]) return { image_url: await signedUrl(config, vaultRows[0].storage_path, 86400), image_storage_path: vaultRows[0].storage_path, image_prompt: advancedPrompt, image_keywords: keywords, image_source: 'vault' }

  const cached = options.forceUnique === true ? null : await fetch(
    `${config.url}/rest/v1/image_cache?user_id=eq.${encodeURIComponent(user.id)}&query_hash=eq.${queryHash}&select=*&limit=1`,
    { headers: headers(config.service) },
  )
  const cachedRows = cached ? await responseJson(cached).catch(() => []) : []
  if (cachedRows?.[0]) return { image_url: await signedUrl(config, cachedRows[0].storage_path, 86400), image_storage_path: cachedRows[0].storage_path, image_prompt: cachedRows[0].prompt, image_keywords: keywords, image_source: cachedRows[0].source }

  let source = 'pollinations'
  let remoteUrl = ''
  let downloaded = null
  const pollinationsKey = String(process.env.POLLINATIONS_API_KEY || '').trim()
  const pollinationsHeaders = pollinationsKey ? { Authorization: `Bearer ${pollinationsKey}` } : {}
  const delays = [0, 2_000, 5_000]
  for (let attempt = 0; attempt < (pollinationsKey ? 3 : 0) && !downloaded; attempt += 1) {
    if (delays[attempt]) await wait(delays[attempt])
    remoteUrl = pollinationsImageUrl(premiumPrompt, negativePrompt, `${Date.now()}-${attempt}-${Math.floor(Math.random() * 100000)}`)
    downloaded = await downloadImage(remoteUrl, 10 * 1024, 60_000, pollinationsHeaders).catch(error => {
      console.warn(`[AlphaTekX] Pollinations authenticated image attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : error}`)
      return null
    })
  }
  if (!downloaded) {
    source = 'pollinations-legacy'
    for (let attempt = 0; attempt < 3 && !downloaded; attempt += 1) {
      if (delays[attempt]) await wait(delays[attempt])
      remoteUrl = pollinationsImageUrl(premiumPrompt, negativePrompt, `${Date.now()}-legacy-${attempt}`, { legacy: true })
      downloaded = await downloadImage(remoteUrl, 10 * 1024, 60_000).catch(error => {
        console.warn(`[AlphaTekX] Pollinations public image attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : error}`)
        return null
      })
    }
  }
  if (!downloaded) {
    await wait(2_000)
    source = 'pollinations-legacy-backup'
    remoteUrl = pollinationsImageUrl(premiumPrompt, negativePrompt, `${Date.now()}-backup`, { backup: true })
    downloaded = await downloadImage(remoteUrl, 10 * 1024, 60_000).catch(error => {
      console.warn(`[AlphaTekX] Pollinations backup image attempt failed: ${error instanceof Error ? error.message : error}`)
      return null
    })
  }
  if (!downloaded && process.env.PEXELS_API_KEY) {
    const pexels = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, {
      headers: { Authorization: process.env.PEXELS_API_KEY },
    }).then(responseJson).catch(() => null)
    remoteUrl = pexels?.photos?.[0]?.src?.large2x || ''
    if (remoteUrl) {
      source = 'pexels'
      downloaded = await downloadImage(remoteUrl).catch(() => null)
    }
  }
  if (!downloaded) throw new Error('Alpha could not fetch a verified topic-matched image after three attempts.')
  try {
    return await persistGenerated(config, user, downloaded.bytes, downloaded.mime, { query_hash: queryHash, query, prompt: advancedPrompt, keywords, source })
  } catch (error) {
    if (options.allowEphemeral === true) {
      let publicUrl = /^https:\/\/(?:image\.)?pollinations\.ai\//i.test(remoteUrl) ? remoteUrl : ''
      if (!publicUrl) {
        publicUrl = pollinationsImageUrl(advancedPrompt, negativePrompt, `${Date.now()}-chat`, { backup: true })
        const publicImage = await downloadImage(publicUrl, 10 * 1024, 60_000).catch(() => null)
        if (!publicImage) throw error
      }
      return {
        image_url: publicUrl,
        image_storage_path: null,
        image_prompt: advancedPrompt,
        image_keywords: keywords,
        image_source: source,
        persistence_warning: error instanceof Error ? error.message : 'Media Library persistence is unavailable.',
      }
    }
    throw error
  }
}

export async function refreshMediaUrl(config, user, storagePath, expiresIn = 3600) {
  assertConfig(config)
  if (!String(storagePath || '').startsWith(`${user.id}/`)) throw new Error('Media ownership could not be verified.')
  return signedUrl(config, storagePath, expiresIn)
}

export async function previewMedia(config, user, id, expiresIn = 3600) {
  assertConfig(config)
  const response = await fetch(
    `${config.url}/rest/v1/media_library?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,
    { headers: headers(config.service) },
  )
  const item = (await responseJson(response))?.[0]
  if (!item) throw new Error('Media item was not found.')
  const previewUrl = await signedUrl(config, item.storage_path, expiresIn)
  if (!previewUrl) throw new Error('Alpha could not create a secure preview URL.')
  return { item: { ...item, file_url: previewUrl }, previewUrl, expiresIn }
}

async function patchQueueItem(config, id, patch, query = '') {
  const response = await fetch(`${config.url}/rest/v1/media_library?id=eq.${encodeURIComponent(id)}${query}`, {
    method: 'PATCH',
    headers: headers(config.service, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  })
  return responseJson(response)
}

async function executeMediaItem(config, item, executeProviderAction, user) {
  if (item.file_type !== 'video') throw new Error('Only videos can be published from the Media Library.')
  const executionKey = item.execution_key || `vault:${item.id}:${item.scheduled_for || 'publish-now'}`
  const videoUrl = await signedUrl(config, item.storage_path, 3600)
  if (!videoUrl) throw new Error('Alpha could not create a secure video URL.')
  const title = String(item.title || item.file_name).slice(0, 100)
  const result = await executeProviderAction(user, 'youtube', 'upload_video', {
    title,
    description: String(item.description || `${title}\n\nPublished by AlphaTekx after explicit Media Library approval.`),
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 20) : [],
    privacyStatus: 'public',
    video_url: videoUrl,
    idempotencyKey: executionKey,
    approvalId: `vault:${item.id}`,
  })
  if (!result?.providerId) throw new Error('YouTube did not return a confirmed video ID. No credit was charged.')
  await patchQueueItem(config, item.id, {
    status: 'published',
    published_at: new Date().toISOString(),
    provider_id: result.providerId,
    execution_key: executionKey,
    last_error: null,
  })
  return { id: item.id, status: 'published', providerId: result.providerId }
}

export async function publishMediaNow(config, user, id, executeProviderAction) {
  assertConfig(config)
  const response = await fetch(
    `${config.url}/rest/v1/media_library?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,
    { headers: headers(config.service) },
  )
  const item = (await responseJson(response))?.[0]
  if (!item) throw new Error('Media item was not found.')
  if (item.status === 'published' && item.provider_id) {
    return { id: item.id, status: 'published', providerId: item.provider_id, duplicate: true }
  }
  if (!['ready', 'failed'].includes(item.status)) throw new Error('This video is already scheduled or being processed.')
  const executionKey = item.execution_key || `vault:${item.id}:publish-now`
  const claimed = await patchQueueItem(config, item.id, {
    status: 'processing', claimed_at: new Date().toISOString(), execution_key: executionKey, last_error: null,
  }, `&user_id=eq.${encodeURIComponent(user.id)}&status=in.(ready,failed)`)
  if (!claimed?.[0]) throw new Error('This video is already being published.')
  try {
    return await executeMediaItem(config, { ...item, execution_key: executionKey }, executeProviderAction, user)
  } catch (error) {
    await patchQueueItem(config, item.id, {
      status: 'failed',
      claimed_at: new Date().toISOString(),
      last_error: String(error instanceof Error ? error.message : error).slice(0, 1000),
    })
    throw error
  }
}

export async function runDueMedia(config, executeProviderAction, now = new Date()) {
  assertConfig(config)
  const dueResponse = await fetch(
    `${config.url}/rest/v1/media_library?status=in.(scheduled,waiting_credits)&scheduled_for=lte.${encodeURIComponent(now.toISOString())}&claimed_at=is.null&select=*&order=scheduled_for.asc&limit=20`,
    { headers: headers(config.service) },
  )
  let due
  try {
    due = await responseJson(dueResponse)
  } catch (error) {
    // A deployment can briefly serve before its database migration reaches the
    // PostgREST schema cache. There is no queue to process in that state, and
    // repeatedly logging the raw schema error every minute is misleading.
    if (isMissingMediaSchema(error)) return []
    throw error
  }
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
      results.push(await executeMediaItem(
        config,
        { ...item, execution_key: executionKey },
        executeProviderAction,
        { id: item.user_id, email: profile.email },
      ))
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
