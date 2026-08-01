import assert from 'node:assert/strict'
import fs from 'node:fs'

const popup = fs.readFileSync(new URL('../src/components/agents/CampaignPreview.tsx', import.meta.url), 'utf8')

const tests = [
  ['LinkedIn is explicitly presented as native personal-profile publishing', () => {
    assert.match(popup, /LinkedIn uses AlphaTekX native secure publishing/)
    assert.match(popup, /Native personal-profile publishing/)
    assert.match(popup, /LinkedIn personal profile ready/)
  }],
  ['connected LinkedIn without publishing readiness requests reconnection', () => {
    assert.match(popup, /Reconnect to approve LinkedIn publishing/)
    assert.match(popup, /state\.connected \? 'Reconnect' : 'Connect'/)
  }],
  ['review actions use the selected platform instead of hardcoding LinkedIn', () => {
    assert.match(popup, /JSON\.stringify\(\{ postId, platform, action, tone \}\)/)
    assert.doesNotMatch(popup, /platform: 'linkedin', action/)
  }],
  ['popup uses the locked one-content-item credit rule', () => {
    assert.match(popup, /const total = Math\.max\(1, campaign\.posts\.length\)/)
    assert.match(popup, /One content item publishes adapted versions/)
    assert.doesNotMatch(popup, /AI writing: 3 credits/)
  }],
  ['activation feedback names all platforms and confirmed provider IDs', () => {
    assert.match(popup, /Published successfully to/)
    assert.match(popup, /providerIds/)
    assert.doesNotMatch(popup, /Published successfully\. LinkedIn post ID/)
  }],
  ['mobile modal is bounded, scroll-safe, and has a full-width approval action', () => {
    assert.match(popup, /h-\[100dvh\]/)
    assert.match(popup, /max-w-full/)
    assert.match(popup, /overflow-y-auto overscroll-contain/)
    assert.match(popup, /shrink-0 border-t/)
    assert.match(popup, /w-full items-center justify-center/)
    assert.match(popup, /document\.body\.style\.overflow = 'hidden'/)
  }],
  ['publish now requires reviewed captions and required matched images', () => {
    assert.match(popup, /const previewReady = !missingCaptions && !missingImages/)
    assert.match(popup, /Prepare captions & matched images/)
    assert.match(popup, /canAfford && startValid && previewReady/)
    assert.doesNotMatch(popup, /void fetch\(`\/api\/automations\/\$\{encodeURIComponent\(approvedAgent\.id\)\}\/generate-background/)
  }],
  ['popup has accessible dialog labeling and keyboard dismissal', () => {
    assert.match(popup, /aria-labelledby="campaign-preview-title"/)
    assert.match(popup, /event\.key === 'Escape'/)
    assert.match(popup, /aria-live="polite"/)
  }],
]

let failed = 0
console.log('CAMPAIGN_POPUP_TESTS:')
for (const [name, run] of tests) {
  try { run(); console.log(`- PASS: ${name}`) }
  catch (error) { failed += 1; console.log(`- FAIL: ${name} — ${error.message}`) }
}
console.log(`- Total: ${tests.length}, Passed: ${tests.length - failed}, Failed: ${failed}`)
if (failed) process.exit(1)
console.log('CAMPAIGN_POPUP_TESTS_OK')
