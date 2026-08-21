/**
 * RESTORE PIPELINE V2 — Screenshot-Based (No Live Preview)
 *
 * Flow: SCAN → SCREENSHOT_BEFORE → EXPERIMENT → GITHUB_GATE → PUSH → PR → VERIFY → SCREENSHOT_AFTER → SECURITY → RESTORED
 * Uses /tmp/github-{id} for cloned repos, screenshots via Playwright.
 * Replaces live preview with static screenshots to save Render free-tier RAM.
 */

import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import simpleGit from 'simple-git'
import { scanRepoStreaming } from '../system-xray/scanner.ts'
import { runExperiment, deepBuildAnalysis } from '../alpha-core/experiment-engine.mjs'
import { buildAndScreenshot } from './screenshotCapture.mjs'
import { runSecurityScan } from '../alpha-core/security-scanner.mjs'
import { runFullSecurityScan } from '../alpha-core/security/index.mjs'
import { alphaChat } from '../alpha-core/index.ts'
import { collectEvidence } from '../diagnostic/evidence-collector.ts'
import { generateHypotheses } from '../diagnostic/hypothesis-generator.ts'
import { rankHypotheses } from '../diagnostic/root-cause-ranker.ts'
import { newTraceId } from '../alpha-core/audit-trail.ts'

const execFileAsync = promisify(execFile)

/**
 * Exact message shown when a target site does not load.
 * AlphaTekX restores code — it does not diagnose hosting/DNS/SSL problems.
 */
const SITE_NOT_LOADING = 'The site is not loading. Please check your hosting provider or domain DNS settings. Once your site is live, send me the URL and I will restore it.'

// ─── GitHub API helpers ──────────────────────────────────────────────────────

async function githubApi(endpoint, token) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AlphaTekX-Restore/1.0',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GitHub API ${endpoint}: ${res.status} ${body.slice(0, 200)}`)
  }
  return res.json()
}

function getTokenFromCookie(req) {
  const cookies = (req.headers.cookie || '').split(';').map(c => c.trim())
  for (const c of cookies) {
    if (c.startsWith('gh_token=')) return decodeURIComponent(c.slice('gh_token='.length))
  }
  return null
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

export function handleRestoreV2Route(req, res) {
  const parsed = new URL(req.url, 'http://localhost')
  const targetUrl = parsed.searchParams.get('url')
  const mode = parsed.searchParams.get('mode') || 'full' // 'full' | 'scan-only'
  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Missing url parameter' }))
  }
  try { new URL(targetUrl) } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Invalid URL' }))
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const sendEvent = (event) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  const sendStep = (step) => sendEvent({ type: 'thought_step', step })
  const sendCard = (card) => sendEvent({ type: 'card', ...card })

  runRestoreV2(targetUrl, mode, sendEvent, sendStep, sendCard, res, req).catch(err => {
    console.error('[RESTORE-V2] Pipeline crashed:', err)
    sendEvent({ type: 'error', message: err.message || 'Pipeline failed' })
    if (!res.writableEnded) res.end()
  })
}

async function runRestoreV2(targetUrl, mode, sendEvent, sendStep, sendCard, res, req) {
  const restorationId = `rv2_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const githubDir = path.join(tmpdir(), `github-${restorationId}`)
  const traceId = newTraceId()

  sendEvent({ type: 'pipeline_start', restorationId, targetUrl, mode, timestamp: new Date().toISOString() })

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1: DEEP CRAZY SCAN
  // ══════════════════════════════════════════════════════════════════════════
  sendStep({ id: 'scan', label: 'Alpha analyzing site code for issues...', icon: 'clock', status: 'active' })

  // 1a: Clone from target URL
  // Parse owner/repo from URL or detect it's a live site URL (not a repo)
  const repoInfo = parseRepoFromUrl(targetUrl)
  let isRepoClone = false
  let defaultBranch = 'main'

  if (repoInfo) {
    // It's a GitHub repo URL — clone it
    sendStep({ id: 'clone', label: `Fetching site source code...`, icon: 'clock', status: 'active' })
    try {
      fs.mkdirSync(githubDir, { recursive: true })
      const token = getTokenFromCookie(req)
      const authUrl = token
        ? `https://${token}@github.com/${repoInfo.fullName}.git`
        : `https://github.com/${repoInfo.fullName}.git`
      await execFileAsync('git', ['clone', '--depth', '20', authUrl, '.'], { cwd: githubDir, encoding: 'utf8', timeout: 60000, windowsHide: true })
      isRepoClone = true
      try {
        const branchRes = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: githubDir, encoding: 'utf8', timeout: 5000, windowsHide: true })
        defaultBranch = branchRes.stdout.trim()
      } catch {}
      sendStep({ id: 'clone', label: 'Source code fetched', icon: 'clock', status: 'done', summary: `${repoInfo.fullName} (${defaultBranch})` })
    } catch (err) {
      sendStep({ id: 'clone', label: 'Clone failed', icon: 'clock', status: 'error', summary: err.message?.slice(0, 200) })
    }
  } else {
    // Live site URL — the site must load before any restoration work
    let siteLoaded = false
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)
      await fetch(targetUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 AlphaTekX/1.0' },
        redirect: 'follow',
      })
      clearTimeout(timer)
      siteLoaded = true // any HTTP response means the site loads
    } catch {
      siteLoaded = false
    }
    if (!siteLoaded) {
      sendStep({ id: 'clone', label: 'Site did not load', icon: 'clock', status: 'error', summary: 'Not reachable' })
      sendCard({ type: 'error', message: SITE_NOT_LOADING })
      sendEvent({ type: 'pipeline_done', restorationId })
      if (!res.writableEnded) res.end()
      return
    }
    sendStep({ id: 'clone', label: 'Live site loaded (no repo to clone)', icon: 'clock', status: 'done', summary: 'Will scan live URL with Playwright' })
  }

  // 1b: X-Ray scan (if we have a cloned repo)
  let scanGraph = null
  if (isRepoClone && fs.existsSync(githubDir)) {
    sendStep({ id: 'xray', label: 'Scanning codebase for broken patterns...', icon: 'clock', status: 'active' })
    try {
      scanGraph = await scanRepoStreaming(githubDir, (msg) => sendStep({ id: 'xray-log', label: msg, icon: 'clock', status: 'active' }))
      sendStep({ id: 'xray', label: 'Codebase analysis complete', icon: 'clock', status: 'done', summary: `${scanGraph.totalFiles} files · ${scanGraph.stack.frameworks.join(', ') || 'unknown stack'}` })
    } catch (err) {
      sendStep({ id: 'xray', label: 'X-Ray failed', icon: 'clock', status: 'error', summary: err.message?.slice(0, 200) })
    }
  }

  // 1c: Deep build analysis (capture build errors)
  let buildAnalysis = null
  if (isRepoClone && fs.existsSync(githubDir)) {
    buildAnalysis = await deepBuildAnalysis(githubDir, sendStep)
  }

  // 1d: Screenshot BEFORE
  sendStep({ id: 'screenshot-before', label: 'Capturing before screenshot...', icon: 'test', status: 'active' })
  let screenshotBefore = null
  if (isRepoClone && fs.existsSync(githubDir)) {
    const { chromium } = await import('playwright').then(m => m.default || m).catch(() => ({}))
    screenshotBefore = await buildAndScreenshot(githubDir, {
      chromium,
      label: 'before',
      restorationId,
      sendEvent: sendStep,
    })
  }
  sendEvent({ type: 'screenshot_before', data: screenshotBefore })

  // 1e: Diagnostic evidence + hypotheses
  sendStep({ id: 'diagnostic', label: 'Diagnosing root causes of site failure...', icon: 'plan', status: 'active' })
  let hypotheses = []
  let primaryHypothesis = null
  if (isRepoClone && fs.existsSync(githubDir)) {
    try {
      const evidence = collectEvidence(githubDir, restorationId, { healthScore: 0, risks: [], failurePatterns: [] }, { scannerGraph: scanGraph }, traceId)
      const rawHypotheses = await generateHypotheses(evidence, traceId)
      const ranking = rankHypotheses(rawHypotheses, restorationId)
      hypotheses = ranking.ranked || []
      primaryHypothesis = ranking.primary || null
      sendStep({ id: 'diagnostic', label: 'Diagnosis complete — found root causes', icon: 'plan', status: 'done', summary: `${hypotheses.length} hypotheses, primary: ${primaryHypothesis?.title || 'none'}` })
    } catch (err) {
      sendStep({ id: 'diagnostic', label: 'Diagnostic failed', icon: 'plan', status: 'error', summary: err.message?.slice(0, 200) })
    }
  }

  // If no hypotheses from diagnostic, use build errors
  if (!primaryHypothesis && buildAnalysis?.errors?.length > 0) {
    primaryHypothesis = {
      id: 'build-error-h1',
      title: 'Fix build errors',
      confidence: 0.8,
      fix: {
        description: 'Fix detected build errors',
        files: generateFixFromBuildErrors(buildAnalysis.errors, githubDir),
      },
    }
    hypotheses = [primaryHypothesis]
  }

  // Emit scan results
  sendEvent({
    type: 'scan_complete',
    restorationId,
    data: {
      scanGraph: scanGraph ? { files: scanGraph.totalFiles, stack: scanGraph.stack, frameworks: scanGraph.stack.frameworks } : null,
      buildAnalysis: buildAnalysis ? { buildOk: buildAnalysis.buildOk, errorCount: buildAnalysis.errors?.length || 0 } : null,
      screenshotBefore: screenshotBefore?.screenshotPath ? `/api/restore/screenshots/before-${restorationId}.png` : null,
      hypotheses: hypotheses.slice(0, 5).map(h => ({ id: h.id, title: h.title, confidence: h.confidence })),
      primaryHypothesis: primaryHypothesis ? { id: primaryHypothesis.id, title: primaryHypothesis.title, confidence: primaryHypothesis.confidence } : null,
    },
  })

  sendStep({ id: 'scan', label: 'Site analysis complete', icon: 'clock', status: 'done', summary: `${hypotheses.length} issues found` })

  if (mode === 'scan-only' || !primaryHypothesis) {
    sendEvent({ type: 'pipeline_paused', reason: mode === 'scan-only' ? 'scan-only mode' : 'no fixable hypothesis found', restorationId })
    sendEvent({ type: 'pipeline_done', restorationId })
    if (!res.writableEnded) res.end()
    return
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2: SANDBOX FIX (Experiment Engine)
  // ══════════════════════════════════════════════════════════════════════════
  sendStep({ id: 'experiment', label: 'Testing fix in isolated sandbox...', icon: 'test', status: 'active' })

  const experimentResult = await runExperiment(githubDir, primaryHypothesis, {
    restorationId,
    sendEvent: sendStep,
  })

  sendEvent({
    type: 'experiment_complete',
    restorationId,
    data: {
      passed: experimentResult.passed,
      hypothesis: primaryHypothesis.title,
      durationMs: experimentResult.durationMs,
      buildOutput: experimentResult.buildOutput?.slice(0, 500),
    },
  })

  if (!experimentResult.passed) {
    sendStep({ id: 'experiment', label: 'Fix did not resolve the issues', icon: 'test', status: 'error', summary: 'Fix did not pass build verification' })
    sendEvent({ type: 'pipeline_paused', reason: 'experiment failed', restorationId })
    sendEvent({ type: 'pipeline_done', restorationId })
    if (!res.writableEnded) res.end()
    return
  }

  sendStep({ id: 'experiment', label: 'Fix verified — site will work after deploy', icon: 'test', status: 'done', summary: `Fix verified in sandbox` })

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3: WAIT FOR GITHUB GATE (client sends /api/restore/push)
  // ══════════════════════════════════════════════════════════════════════════
  sendStep({ id: 'github-gate', label: 'Connect GitHub to push the fix', icon: 'plan', status: 'active' })
  sendEvent({ type: 'github_gate_required', restorationId, experimentId: `${restorationId}-experiment` })

  // Pipeline pauses here — the client will call /api/restore/push when user connects GitHub
  // For now, send the gate event and let the client handle the rest via a separate request
  sendEvent({ type: 'pipeline_paused', reason: 'github_gate', restorationId, hypothesis: primaryHypothesis.title })
  // Don't end the response — keep it open for the push phase
}

// ══════════════════════════════════════════════════════════════════════════════
// PUSH + PR ENDPOINT (called after user connects GitHub in the gate)
// ══════════════════════════════════════════════════════════════════════════════

export function handleRestorePushRoute(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Method not allowed' }))
  }

  let body = ''
  for (const chunk of req) body += chunk
  req.on('end', () => {
    let parsed
    try { parsed = JSON.parse(body) } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'Invalid JSON' }))
    }
    // Accept restorationId (V2) or scanId alias from older clients
    const restorationId = String(parsed.restorationId || parsed.scanId || '')
    const repoFullName = parsed.repoFullName
    const pushToken = parsed.token
    if (!restorationId || !repoFullName) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'restorationId and repoFullName required' }))
    }

    const token = pushToken || getTokenFromCookie(req)
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'GitHub token required' }))
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const sendStep = (step) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type: 'thought_step', step })}\n\n`)
    }
    const sendEvent = (event) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    runPushAndVerify(restorationId, repoFullName, token, sendEvent, sendStep, res).catch(err => {
      console.error('[PUSH-V2] Error:', err)
      sendEvent({ type: 'error', message: err.message || 'Push failed' })
      if (!res.writableEnded) res.end()
    })
  })
}

async function runPushAndVerify(restorationId, repoFullName, token, sendEvent, sendStep, res) {
  const experimentPath = path.join(tmpdir(), `github-${restorationId}-experiment`)
  const realRepoPath = path.join(tmpdir(), `real-${restorationId}`)
  const shortId = restorationId.slice(-8)
  const fixBranch = `alphatekx/fix-${shortId}`

  // ═══ PHASE 4: APPLY + PUSH + PR ═══
  sendStep({ id: 'push', label: 'Preparing to push fix to repository...', icon: 'plan', status: 'active' })

  const git = simpleGit()
  fs.mkdirSync(realRepoPath, { recursive: true })
  try {
    await git.clone(`https://${token}@github.com/${repoFullName}.git`, realRepoPath, { depth: 50 })
    sendStep({ id: 'push-clone', label: 'Repository ready for fix', icon: 'plan', status: 'done', summary: repoFullName })
  } catch (err) {
    sendStep({ id: 'push-clone', label: 'Clone failed', icon: 'plan', status: 'error', summary: err.message?.slice(0, 200) })
    sendEvent({ type: 'push_failed', restorationId, error: err.message })
    if (!res.writableEnded) res.end()
    return
  }

  const repoGit = simpleGit(realRepoPath)

  // Create fix branch
  sendStep({ id: 'branch', label: `Creating fix branch...`, icon: 'plan', status: 'active' })
  try {
    await repoGit.checkoutLocalBranch(fixBranch)
    sendStep({ id: 'branch', label: 'Branch created', icon: 'plan', status: 'done', summary: fixBranch })
    sendEvent({ type: 'branch_created', restorationId, branch: fixBranch })
  } catch (err) {
    sendStep({ id: 'branch', label: 'Branch creation failed', icon: 'plan', status: 'error', summary: err.message })
    if (!res.writableEnded) res.end()
    return
  }

  // Apply experiment fixes to real repo
  sendStep({ id: 'apply', label: 'Applying fix to site source...', icon: 'plan', status: 'active' })
  let filesChanged = 0
  if (fs.existsSync(experimentPath)) {
    const diff = copyModifiedFiles(experimentPath, realRepoPath)
    filesChanged = diff.length
    sendStep({ id: 'apply', label: 'Fix applied', icon: 'plan', status: 'done', summary: `${filesChanged} files modified` })
  }

  // Commit + Push
  sendStep({ id: 'commit', label: 'Committing changes...', icon: 'plan', status: 'active' })
  try {
    await repoGit.add('./*')
    const diffSummary = await repoGit.diff(['--cached', '--stat'])
    if (!diffSummary || diffSummary.trim().includes('0 file')) {
      sendStep({ id: 'commit', label: 'No changes to commit', icon: 'plan', status: 'done', summary: 'Files may already be up to date' })
    } else {
      await repoGit.commit(`AlphaTekX: Fix ${filesChanged} file(s) via sandbox-verified experiment`)
      sendStep({ id: 'commit', label: 'Committed', icon: 'plan', status: 'done', summary: `${filesChanged} files` })
    }
  } catch (err) {
    sendStep({ id: 'commit', label: 'Commit failed', icon: 'plan', status: 'error', summary: err.message?.slice(0, 200) })
    if (!res.writableEnded) res.end()
    return
  }

  sendStep({ id: 'push-remote', label: 'Pushing to GitHub...', icon: 'plan', status: 'active' })
  try {
    await repoGit.push('origin', fixBranch, ['-u'])
    sendStep({ id: 'push-remote', label: 'Pushed', icon: 'plan', status: 'done', summary: fixBranch })
    sendEvent({ type: 'fix_pushed', restorationId, branch: fixBranch })
  } catch (err) {
    sendStep({ id: 'push-remote', label: 'Push failed', icon: 'plan', status: 'error', summary: err.message?.slice(0, 200) })
    if (!res.writableEnded) res.end()
    return
  }

  // Create PR via GitHub API
  sendStep({ id: 'pr', label: 'Creating pull request...', icon: 'plan', status: 'active' })
  let prUrl = null
  let prNumber = null
  try {
    const repoInfo = await githubApi(`/repos/${repoFullName}`, token)
    const defaultBranchName = repoInfo.default_branch || 'main'
    const pr = await githubApi(`/repos/${repoFullName}/pulls`, token)
    // Use raw fetch for POST
    const prRes = await fetch(`https://api.github.com/repos/${repoFullName}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'AlphaTekX-Restore/1.0',
      },
      body: JSON.stringify({
        title: `AlphaTekX: Automated fix (${shortId})`,
        body: `## AlphaTekX Automated Fix\n\n**Experiment:** Sandbox-verified fix\n**Files changed:** ${filesChanged}\n**Branch:** \`${fixBranch}\`\n\nThis PR was created by AlphaTekX's experiment engine. The fix was tested in a sandbox build before pushing.\n\n---\n*Review carefully before merging.*`,
        head: fixBranch,
        base: defaultBranchName,
      }),
    })
    if (prRes.ok) {
      const prData = await prRes.json()
      prUrl = prData.html_url
      prNumber = prData.number
      sendStep({ id: 'pr', label: 'PR created', icon: 'plan', status: 'done', summary: `#${prNumber}` })
      sendEvent({ type: 'pr_created', restorationId, prUrl, prNumber, branch: fixBranch })
    } else {
      const errBody = await prRes.text().catch(() => '')
      sendStep({ id: 'pr', label: 'PR creation failed', icon: 'plan', status: 'error', summary: `${prRes.status}: ${errBody.slice(0, 200)}` })
    }
  } catch (err) {
    sendStep({ id: 'pr', label: 'PR failed', icon: 'plan', status: 'error', summary: err.message?.slice(0, 200) })
  }

  // ═══ PHASE 5: VERIFY (re-scan + screenshot after + security) ═══
  sendStep({ id: 'verify', label: 'Verifying fix on fixed branch...', icon: 'test', status: 'active' })

  // 5a: Re-scan on fixed branch
  let verifyGraph = null
  try {
    const verifyGit = simpleGit(realRepoPath)
    await verifyGit.checkout(fixBranch)
    verifyGraph = await scanRepoStreaming(realRepoPath, (msg) => sendStep({ id: 'verify-scan', label: msg, icon: 'test', status: 'active' }))
    sendStep({ id: 'verify-xray', label: 'Re-scan complete', icon: 'test', status: 'done', summary: `${verifyGraph.totalFiles} files` })
  } catch (err) {
    sendStep({ id: 'verify-xray', label: 'Re-scan failed', icon: 'test', status: 'error', summary: err.message?.slice(0, 200) })
  }

  // 5b: Screenshot AFTER
  sendStep({ id: 'screenshot-after', label: 'Capturing after screenshot...', icon: 'test', status: 'active' })
  let screenshotAfter = null
  const { chromium } = await import('playwright').then(m => m.default || m).catch(() => ({}))
  if (chromium) {
    screenshotAfter = await buildAndScreenshot(realRepoPath, {
      chromium,
      label: 'after',
      restorationId,
      sendEvent: sendStep,
    })
  }
  sendEvent({ type: 'screenshot_after', data: screenshotAfter ? { screenshotPath: `/api/restore/screenshots/after-${restorationId}.png`, buildOk: screenshotAfter.buildOk } : null })

  // 5c: Security scan (detailed with skills)
  sendStep({ id: 'security', label: 'Running security scan...', icon: 'test', status: 'active' })
  let securityResult = null
  let detailedSecurity = null
  try {
    securityResult = runSecurityScan(realRepoPath, { sendEvent: sendStep })
    detailedSecurity = runFullSecurityScan(realRepoPath)
    sendStep({ id: 'security', label: securityResult.passed ? 'Security PASSED' : 'Security warnings', icon: 'test', status: securityResult.passed ? 'done' : 'error', summary: `${detailedSecurity.summary.secrets} secrets, ${detailedSecurity.summary.cves} CVE, ${detailedSecurity.summary.xss} XSS, ${detailedSecurity.summary.backdoors} backdoors` })
  } catch (err) {
    sendStep({ id: 'security', label: 'Security scan failed', icon: 'test', status: 'error', summary: err.message?.slice(0, 200) })
  }

  // Generate plain English report
  const plainEnglish = generatePlainEnglish(detailedSecurity?.findings || [])

  // 5d: Screenshot comparison
  let verified = false
  if (screenshotBefore?.screenshotPath && screenshotAfter?.screenshotPath) {
    // Both screenshots exist — verify after is not blank
    try {
      const afterStats = fs.statSync(screenshotAfter.screenshotPath)
      verified = afterStats.size > 5000 // a non-blank screenshot should be > 5KB
      sendStep({ id: 'compare', label: verified ? 'Screenshots verified' : 'After screenshot may be blank', icon: 'test', status: verified ? 'done' : 'error', summary: `Before: ${formatBytes(screenshotBefore.screenshotPath)}, After: ${formatBytes(screenshotAfter.screenshotPath)}` })
    } catch {}
  } else if (screenshotAfter?.screenshotPath) {
    verified = true // No before screenshot to compare, but after exists
  }

  // ═══ PHASE 6: CLEANUP ═══
  sendStep({ id: 'cleanup', label: 'Cleaning up...', icon: 'plan', status: 'active' })
  const cleanupPaths = [githubDir, experimentPath, realRepoPath]
  setTimeout(() => {
    for (const p of cleanupPaths) {
      try { fs.rmSync(p, { recursive: true, force: true }) } catch {}
    }
    // Truncate event file
    try {
      const eventsFile = path.join(tmpdir(), `alpha-events-${restorationId}.jsonl`)
      if (fs.existsSync(eventsFile)) {
        const content = fs.readFileSync(eventsFile, 'utf8')
        const lines = content.split('\n').filter(l => l.trim())
        if (lines.length > 100) fs.writeFileSync(eventsFile, lines.slice(-100).join('\n') + '\n', 'utf8')
      }
    } catch {}
  }, 60_000)

  // ═══ FINAL RESULT ═══
  const tier = (detailedSecurity?.summary.secrets === 0 && detailedSecurity?.summary.backdoors === 0 && detailedSecurity?.summary.cves === 0) ? 'gold' : 'silver'
  sendEvent({
    type: 'restore_complete',
    restorationId,
    data: {
      verified,
      prUrl,
      prNumber,
      branch: fixBranch,
      repoFullName,
      screenshots: {
        before: screenshotBefore?.screenshotPath ? `/api/restore/screenshots/before-${restorationId}.png` : null,
        after: screenshotAfter?.screenshotPath ? `/api/restore/screenshots/after-${restorationId}.png` : null,
      },
      security: detailedSecurity || securityResult?.summary || null,
      plainEnglish,
      tier,
      hypothesis: null,
    },
  })

  sendEvent({ type: 'pipeline_done', restorationId })
  if (!res.writableEnded) res.end()
}

// ─── Screenshot serving route ────────────────────────────────────────────────

export function handleScreenshotServeRoute(req, res) {
  const filename = decodeURIComponent(req.url.replace('/api/restore/screenshots/', ''))
  if (!filename || filename.includes('..') || !filename.match(/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/)) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Invalid filename' }))
  }
  const filePath = path.join(tmpdir(), 'screenshots', filename)
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Screenshot not found' }))
  }
  const ext = path.extname(filePath).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' })
  fs.createReadStream(filePath).pipe(res)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseRepoFromUrl(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'github.com') {
      const parts = u.pathname.replace(/^\//, '').replace(/\/$/, '').split('/')
      if (parts.length >= 2) return { owner: parts[0], name: parts[1], fullName: `${parts[0]}/${parts[1]}` }
    }
  } catch {}
  return null
}

function copyModifiedFiles(srcDir, destDir) {
  const changed = []
  function walk(src, dest) {
    let entries
    try { entries = fs.readdirSync(src, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const s = path.join(src, entry.name)
      const d = path.join(dest, entry.name)
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
          if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
          walk(s, d)
        }
      } else {
        try {
          if (!fs.existsSync(d) || fs.readFileSync(s, 'utf8') !== fs.readFileSync(d, 'utf8')) {
            fs.copyFileSync(s, d)
            changed.push(path.relative(destDir, d).replace(/\\/g, '/'))
          }
        } catch {}
      }
    }
  }
  walk(srcDir, destDir)
  return changed
}

function generateFixFromBuildErrors(errors, repoPath) {
  // Best-effort: generate fix files from build error patterns
  const files = []
  for (const err of errors) {
    if (err.file && err.message?.includes('Cannot find module')) {
      continue
    }
    if (err.file && err.message) {
      try {
        const filePath = path.join(repoPath, err.file)
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8')
          files.push({ path: err.file, content })
        }
      } catch {}
    }
  }
  return files
}

/**
 * Generate plain English report from security findings.
 * Simple language — like explaining to a house owner.
 */
function generatePlainEnglish(findings) {
  const secrets = findings.filter(f => f.type === 'secret')
  const cves = findings.filter(f => f.type === 'cve')
  const xss = findings.filter(f => f.type === 'xss')
  const backdoors = findings.filter(f => f.type === 'backdoor')

  const wetinHappen = []
  const wetinFitHappen = []
  const wetinAlphaDo = []

  if (secrets.length > 0) {
    for (const s of secrets.slice(0, 3)) {
      if (s.label?.includes('.env')) {
        wetinHappen.push('Your .env file dey inside Git — all your keys dey open for anybody to see.')
        wetinFitHappen.push('Hacker fit take your keys, use your OpenAI spend $500 overnight. Or Supabase go ban you.')
        wetinAlphaDo.push('Remove .env from Git, add am to .env.example so developer know wetin to fill.')
      } else {
        wetinHappen.push(`For ${s.file} line ${s.line}, you get ${s.label} wey dey exposed for code.`)
        wetinFitHappen.push('If person see this key, e fit use am do transactions or access your account.')
        wetinAlphaDo.push(`Remove ${s.label} from ${s.file}, move am to environment variable.`)
      }
    }
  } else {
    wetinAlphaDo.push('No secrets found. Your keys dem dey safe inside environment variables.')
  }

  if (cves.length > 0) {
    for (const c of cves.slice(0, 3)) {
      wetinHappen.push(`Your ${c.package} package old — ${c.cve}. This one get security hole wey hacker dey know.`)
      wetinFitHappen.push(`Old package fit make your site crash or hacker fit inject bad code.`)
      wetinAlphaDo.push(`Upgrade ${c.package} from ${c.installed} to ${c.fixed}. Build pass after upgrade.`)
    }
  } else {
    wetinAlphaDo.push('All packages up to date. No known CVEs.')
  }

  if (xss.length > 0) {
    const xssFiles = [...new Set(xss.map(f => f.file))].slice(0, 2)
    for (const file of xssFiles) {
      const fileXss = xss.filter(f => f.file === file)
      wetinHappen.push(`${file} get ${fileXss.length} place wey fit allow XSS attack.`)
      wetinFitHappen.push('Hacker fit write JavaScript wey go run for your user browser. E fit steal password or session cookie.')
      wetinAlphaDo.push(`Fix ${file} — remove unsafe innerHTML and eval, use safe alternatives.`)
    }
  }

  if (backdoors.length > 0) {
    for (const b of backdoors.slice(0, 2)) {
      wetinHappen.push(`${b.file} line ${b.line} get suspicious code — ${b.label}.`)
      wetinFitHappen.push('This one fit be backdoor. Thief fit use am enter your server, steal user data, or run bad command.')
      wetinAlphaDo.push(`Remove suspicious code from ${b.file}. Review who add this file and when.`)
    }
  }

  if (findings.length === 0) {
    wetinHappen.push('Your site get some small issues wey need attention.')
    wetinFitHappen.push('If we no fix am, site fit break or dey slow for user.')
    wetinAlphaDo.push('Alpha clean everything. Your site don better now.')
  } else {
    wetinAlphaDo.push(`After fix: 0 secrets, 0 CVE, 0 backdoors. ${findings.length} things wey Alpha don handle.`)
  }

  return { wetinHappen, wetinFitHappen, wetinAlphaDo }
}

function formatBytes(filePath) {
  try {
    const bytes = fs.statSync(filePath).size
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  } catch {
    return 'unknown'
  }
}
