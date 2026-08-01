import assert from 'node:assert/strict'
import fs from 'node:fs'

const popup = fs.readFileSync(new URL('../src/components/agents/CampaignPreview.tsx', import.meta.url), 'utf8')
const agents = fs.readFileSync(new URL('../src/pages/Agents.tsx', import.meta.url), 'utf8')
const wizard = fs.readFileSync(new URL('../src/components/automation/MatureAutomationWizard.tsx', import.meta.url), 'utf8')
const home = fs.readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8')
const connectors = fs.readFileSync(new URL('../src/pages/Connectors.tsx', import.meta.url), 'utf8')
const engine = fs.readFileSync(new URL('../server/alpha/conversationEngine.mjs', import.meta.url), 'utf8')
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')

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
  ['native LinkedIn status is visible before planning begins', () => {
    assert.match(agents, /LinkedIn <span[\s\S]{0,180}>Native<\/span>/)
    assert.match(agents, /Connected · Personal profile publishing ready/)
    assert.match(agents, /connected-apps\?service=linkedin/)
  }],
  ['one approval publishes now and exits review without a second publish action', () => {
    assert.match(popup, /Real post confirmed/)
    assert.match(popup, /Provider ID:/)
    assert.match(popup, /View real post/)
    assert.match(popup, /onActivated\(data\.agent\)/)
    assert.doesNotMatch(popup, /if \(postingOption !== 'now'\) onActivated/)
    assert.match(popup, /if \(result\?\.id\) confirmations\.push/)
  }],
  ['chat approval persists post approval and immediately executes once-now work', () => {
    assert.match(engine, /post\.status = 'scheduled'[\s\S]*post\.approved = true/)
    assert.match(engine, /publishingMode === 'once_now'/)
    assert.match(engine, /await executeAgent\(draft, user\)/)
    assert.match(engine, /Approved and published/)
    assert.match(server, /executeAgent: \(agent, user\) => runAgent\(agent, 'manual', user\)/)
  }],
  ['go live never fails as a silent disabled click', () => {
    assert.match(popup, /const activationBlocker =/)
    assert.match(popup, /Cannot go live yet:/)
    assert.match(popup, /disabled=\{activating\}/)
    assert.doesNotMatch(popup, /disabled=\{!canActivate \|\| activating\}/)
    assert.doesNotMatch(popup, /await saveAgent\(approvedAgent\)/)
    assert.match(popup, /postingOption === 'now' \? 180_000 : 45_000/)
  }],
  ['connect actions preserve the stopped campaign and return to it', () => {
    assert.match(popup, /returnTo=\$\{encodeURIComponent\(`\/automations\?resume=\$\{draft\.id\}`\)\}/)
  }],
  ['wizard Go Live performs one explicit confirmed activation', () => {
    assert.doesNotMatch(wizard, /await generateContent\(\)\s*\n\s*\/\/ Auto-activate[\s\S]*?await autoActivate\(\)/)
    assert.match(wizard, /if \(saving\) return/)
    assert.match(wizard, /Activating securely/)
    assert.match(wizard, /server did not confirm activation/i)
    assert.match(wizard, /status: 'awaiting_approval'/)
    assert.match(wizard, /const hasEnoughCredits = isAdmin \|\| creditBalance >= totalCreditsNeeded/)
    assert.match(wizard, /immediateConfirmed/)
    assert.match(wizard, /role="alert" aria-live="assertive"/)
  }],
  ['automation planning and approval stay inside Alpha chat without popup entry points', () => {
    assert.doesNotMatch(agents, /MatureAutomationWizard|CampaignPreview|WorkflowPlan|wizard\.openWizard/)
    assert.doesNotMatch(home, /MatureAutomationWizard|useMatureWizard/)
    assert.match(agents, /Approve and activate in chat/)
    assert.match(agents, /awaiting_content_review' \? 'approve all' : 'approve'/)
    assert.match(agents, /Plan ready in chat/)
  }],
  ['Alpha chat uses the resilient session client for admin and standard accounts', () => {
    assert.match(agents, /postJson<Record<string, unknown>>\(endpoint, body/)
    assert.doesNotMatch(agents, /fetchWithTimeout\(endpoint/)
    assert.doesNotMatch(agents, /const authHeaders =/)
  }],
  ['starter suggestions are editable and never activate work on click', () => {
    assert.match(agents, /setInput\(example\.prompt\)/)
    assert.match(agents, /Click to edit this prompt before sending/)
    assert.doesNotMatch(agents, /onClick=\{\(\) => void send\(example/)
  }],
  ['connections, Alpha, and running work form one guided workspace', () => {
    assert.match(connectors, /aria-label="Automation workflow"/)
    assert.match(connectors, /navigate\('\/automations'\)/)
    assert.match(connectors, /navigate\('\/active-automations'\)/)
    assert.match(connectors, /Return to Alpha/)
    assert.match(agents, /\/connected-apps\?service=/)
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
