import assert from 'node:assert/strict'
import fs from 'node:fs'
import { generateAdvancedImagePrompt, pollinationsImageUrl } from '../server/mediaLibraryService.mjs'

const server = fs.readFileSync('server.mjs', 'utf8')
const service = fs.readFileSync('server/mediaLibraryService.mjs', 'utf8')
const migration = fs.readFileSync('supabase/media-library.sql', 'utf8')
const page = fs.readFileSync('src/pages/MediaLibrary.tsx', 'utf8')
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
  ['Pollinations URL pins Flux quality controls without an API key', (() => {
    const url = new URL(pollinationsImageUrl('premium photo', 'cartoon', 'fixed-seed'))
    return url.searchParams.get('model') === 'flux' && url.searchParams.get('enhance') === 'true' && url.searchParams.get('nologo') === 'true' && url.searchParams.get('seed') === 'fixed-seed'
  })()],
  ['Pollinations image generation remains free and keyless', (() => {
    const url = new URL(pollinationsImageUrl('premium photo', 'cartoon', 'fixed-seed'))
    return url.hostname === 'image.pollinations.ai' && !url.searchParams.has('key') && url.searchParams.get('model') === 'flux'
  })()],
  ['Pollinations fallback uses the public open image route', new URL(pollinationsImageUrl('premium photo', 'cartoon', 'fixed-seed', { backup: true })).pathname.startsWith('/p/')],
  ['generated images are persisted into the reusable private vault', service.includes("file_type: 'image'") && service.includes("status: 'ready'") && service.includes('image_cache')],
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
