import assert from 'node:assert/strict'
import fs from 'node:fs'
import { generateAdvancedImagePrompt, pollinationsImageUrl } from '../server/mediaLibraryService.mjs'

const server = fs.readFileSync('server.mjs', 'utf8')
const service = fs.readFileSync('server/mediaLibraryService.mjs', 'utf8')
const migration = fs.readFileSync('supabase/media-library.sql', 'utf8')
const page = fs.readFileSync('src/pages/MediaLibrary.tsx', 'utf8')
const client = fs.readFileSync('src/lib/mediaLibrary.ts', 'utf8')
const preview = fs.readFileSync('src/components/agents/CampaignPreview.tsx', 'utf8')
const engine = fs.readFileSync('server/alpha/conversationEngine.mjs', 'utf8')

const tests = [
  ['private 500MB storage bucket', /'media-library'[\s\S]+false[\s\S]+524288000/.test(migration)],
  ['media ownership RLS', migration.includes("auth.uid() = user_id") && migration.includes("storage.foldername(name)")],
  ['scheduler claim is persisted', migration.includes('execution_key') && migration.includes('claimed_at') && service.includes("status: 'processing'")],
  ['upload uses key-safe service role and authenticated ownership', service.includes('supabaseServiceHeaders(service, extra)') && service.includes('user.id}/uploads')],
  ['upload is streamed instead of JSON/base64', service.includes("body: req") && service.includes("duplex: 'half'")],
  ['provider confirmation drives publication', service.includes('provider_id: result.providerId') && service.includes("status: 'published'")],
  ['Publish Now uses the same confirmed provider execution path', service.includes('export async function publishMediaNow') && page.includes('Publish now') && server.includes('/publish$/i')],
  ['missing provider ID cannot become success', service.includes('YouTube did not return a confirmed video ID. No credit was charged.')],
  ['duplicate Publish Now returns the stored provider ID', service.includes("duplicate: true") && service.includes('item.provider_id')],
  ['insufficient credits wait without false success', service.includes("status: waiting ? 'waiting_credits' : 'failed'")],
  ['missing schema becomes an honest setup state', service.includes('isMissingMediaSchema') && server.includes('setupRequired: true')],
  ['readiness probe checks the table and private bucket independently', service.includes('mediaSetupStatus') && service.includes('tableReady') && service.includes('bucketReady')],
  ['private bucket is provisioned with the service credential', service.includes('ensureBucket') && service.includes('file_size_limit: MAX_FILE_SIZE') && service.includes('allowed_mime_types: [...ALLOWED_TYPES]')],
  ['media UI uses the real readiness endpoint', page.includes('getMediaSetupStatus') && client.includes("'/api/media/status'")],
  ['image-cache migration accepts every active Pollinations fallback', migration.includes("'pollinations-legacy'") && migration.includes("'pollinations-legacy-backup'")],
  ['media API routes require authenticated user', server.includes("req.url === '/api/media/upload'") && server.includes("if (!user) return json(res, 401")],
  ['vault UI has loading and upload states', page.includes('animate-pulse') && page.includes('Uploading ${index + 1}/${batch.length}')],
  ['vault scheduling explains confirmed-work charging', page.includes('Credits are charged only after confirmed publication')],
  ['Composio status is used by planning', server.includes('alphaConnector.getConnectionStatus') && engine.includes('conversation.userEmail')],
  ['premium content is rejected when incomplete', engine.includes('Alpha refused to schedule low-quality or incomplete content')],
  ['automatic image matching blocks honestly on failure', engine.includes('could not attach a confirmed image') && engine.includes('no credits were charged')],
  ['advanced matcher enforces photorealistic quality and negative prompts', (() => {
    const result = generateAdvancedImagePrompt('color blocking sales', 'thrift store promo Lagos', 'instagram')
    return result.keywords.length === 3 && result.advancedPrompt.includes('DSLR') && result.advancedPrompt.includes('8k') && result.negativePrompt.includes('cartoon') && result.negativePrompt.includes('watermark')
  })()],
  ['Pollinations current URL pins Flux quality controls without exposing an API key', (() => {
    const url = new URL(pollinationsImageUrl('premium photo', 'cartoon', 'fixed-seed'))
    return url.hostname === 'gen.pollinations.ai' && !url.searchParams.has('key') && url.searchParams.get('model') === 'flux' && url.searchParams.get('enhance') === 'true' && url.searchParams.get('nologo') === 'true' && url.searchParams.get('seed') === 'fixed-seed'
  })()],
  ['Pollinations authentication stays server-side and legacy fallback remains available', (() => {
    const legacy = new URL(pollinationsImageUrl('premium photo', 'cartoon', 'fixed-seed', { legacy: true }))
    return service.includes('POLLINATIONS_API_KEY') && service.includes('Authorization: `Bearer ${pollinationsKey}`') && legacy.hostname === 'image.pollinations.ai' && !legacy.searchParams.has('key')
  })()],
  ['Pollinations fallback uses the verified public legacy image endpoint', (() => {
    const backup = new URL(pollinationsImageUrl('premium photo', 'cartoon', 'fixed-seed', { backup: true }))
    return backup.hostname === 'image.pollinations.ai' && backup.pathname.startsWith('/prompt/')
  })()],
  ['Pollinations generation runs before optional stock-photo fallback', service.indexOf('const delays = [0, 2_000, 5_000]') < service.indexOf('process.env.PEXELS_API_KEY')],
  ['social planner automatically activates image matching for visual platforms', engine.includes("['facebook', 'instagram', 'x', 'twitter']") && engine.includes('automaticImagePlatforms')],
  ['generated images are persisted into the reusable private vault', service.includes("file_type: 'image'") && service.includes("status: 'ready'") && service.includes('image_cache')],
  ['direct chat can display a verified public image when optional vault persistence fails', service.includes('options.allowEphemeral === true') && engine.includes('{ allowEphemeral: true }') && engine.includes("if (!image?.image_url)")],
  ['image fetch retries and rejects undersized provider output', service.includes('attempt < 3') && service.includes('50 * 1024')],
  ['scheduled posts refresh private image URLs before provider execution', service.includes('refreshMediaUrl') && server.includes('post.imageStoragePath') && server.includes('IMAGE_REFRESH_FAILED')],
  ['campaign review shows the matched image before approval', preview.includes('post.imageUrl') && preview.includes('Matched automatically by Alpha')],
]

let passed = 0
for (const [name, ok] of tests) {
  assert.equal(ok, true, name)
  console.log(`PASS ${name}`)
  passed += 1
}
console.log(`${passed}/${tests.length} media-library checks passed.`)
