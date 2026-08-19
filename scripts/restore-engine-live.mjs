// Live browser test: playwrightScanner + gitHistoryScanner
// against a real public site. Must not throw and must produce the v2 shape.
import { chromium } from 'playwright'
import { createRestoreScanner, assertSafeUrl, RAW_SECRETS } from '../server/scanEngine/playwrightScanner.js'
import { gitHistoryScanner } from '../server/scanEngine/gitHistoryScanner.js'
import { liveVerifier } from '../server/scanEngine/liveVerifier.js'
import { calculateRisk } from '../server/scanEngine/riskScorer.js'

const target = process.argv[2] || 'https://example.com'
const started = Date.now()

assertSafeUrl(target)

const scanner = createRestoreScanner({ chromium })
const scan = await scanner(target, { allowPrivate: true, allowWatching: true })
console.log('SCAN', JSON.stringify({
  url: scan.url,
  statusCode: scan.statusCode,
  isExposed: scan.isExposed,
  paths: scan.paths.length,
  exposedPaths: scan.exposedPaths.length,
  secrets: scan.secrets.length,
  risk: scan.risk,
  score: scan.score,
  screenshot: scan.screenshotPath,
  tookMs: scan.tookMs,
}))

const candidates = scan[RAW_SECRETS] || []
let browser = null
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  let homepageHtml = ''
  try {
    const r = await context.request.get(target, { timeout: 10000 })
    homepageHtml = r.ok() ? await r.text() : ''
  } catch { /* ignore */ }
  const git = await gitHistoryScanner(target, { context, sourceHtml: homepageHtml, headers: {} })
  console.log('GIT', JSON.stringify({ repoOwner: git.repoOwner, repoName: git.repoName, isPublic: git.isPublic, localGitExposed: git.localGitExposed, commitCount: git.commitCount, commitMsgs: git.commitMessagesWithSecrets.length, deleted: git.deletedSecretFiles.length }))
} finally {
  await browser?.close().catch(() => {})
}

const live = await liveVerifier(candidates)
console.log('LIVE', JSON.stringify(live.map(s => ({ kind: s.kind, isLive: s.isLive, masked: s.maskedValue }))))

const risk = calculateRisk({
  exposedPaths: scan.exposedPaths || [],
  secrets: scan.secrets || [],
  liveSecrets: live,
  gitLeaks: [],
  commitMessages: [],
  deletedSecretFiles: [],
  builderConfidence: 0.2,
  usesSupabase: false,
})
console.log('RISK', JSON.stringify({ score: risk.score, grade: risk.grade, verdict: risk.verdict }))
console.log('TOTAL_MS', Date.now() - started)
process.exitCode = 0
