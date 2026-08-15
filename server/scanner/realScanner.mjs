// AlphaTekX real scan engine.
// Drives a live Playwright browser against the target, intercepts fetch/XHR traffic,
// probes for exposed files and captures screenshot evidence. Every credential it finds
// is masked before it leaves this module.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { withContext } from './browserPool.mjs'
import { findSecrets, redactionPairs } from './secretPatterns.mjs'
import { interpret } from './interpretations.mjs'

const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_SCANNED_RESPONSES = 60
const EVIDENCE_ROOT = process.env.SCANNER_EVIDENCE_DIR || path.join(process.cwd(), '.tmp', 'scans')

const SENSITIVE_TARGETS = [
  { path: '/.env', type: 'EXPOSED_ENV_FILE', title: 'Environment file (.env) is publicly downloadable', validate: looksLikeEnvFile },
  { path: '/.env.local', type: 'EXPOSED_ENV_FILE', title: 'Environment file (.env.local) is publicly downloadable', validate: looksLikeEnvFile },
  { path: '/.env.production', type: 'EXPOSED_ENV_FILE', title: 'Environment file (.env.production) is publicly downloadable', validate: looksLikeEnvFile },
  { path: '/.git/config', type: 'EXPOSED_GIT_DIRECTORY', title: 'Git repository config is exposed', validate: (body) => /\[core\]/i.test(body) },
  { path: '/.git/HEAD', type: 'EXPOSED_GIT_DIRECTORY', title: 'Git repository is exposed (.git/HEAD)', validate: (body) => /^ref:\s+refs\//im.test(body) },
  { path: '/config.json', type: 'EXPOSED_CONFIG_FILE', title: 'config.json is publicly readable', validate: looksLikeConfigJson },
  { path: '/appsettings.json', type: 'EXPOSED_CONFIG_FILE', title: 'appsettings.json is publicly readable', validate: looksLikeConfigJson },
  { path: '/docker-compose.yml', type: 'EXPOSED_CONFIG_FILE', title: 'docker-compose.yml is publicly readable', validate: (body) => /^\s*services:/im.test(body) },
  { path: '/.aws/credentials', type: 'EXPOSED_CONFIG_FILE', title: 'AWS credentials file is exposed', validate: (body) => /aws_access_key_id/i.test(body) },
  { path: '/backup.sql', type: 'EXPOSED_BACKUP_FILE', title: 'Database backup is publicly downloadable', validate: looksLikeSqlDump },
  { path: '/dump.sql', type: 'EXPOSED_BACKUP_FILE', title: 'Database dump is publicly downloadable', validate: looksLikeSqlDump },
  { path: '/wp-config.php.bak', type: 'EXPOSED_BACKUP_FILE', title: 'WordPress config backup is exposed', validate: (body) => /DB_PASSWORD/i.test(body) },
]

const SECURITY_HEADERS = [
  { header: 'strict-transport-security', type: 'MISSING_HSTS', title: 'Missing Strict-Transport-Security header', severity: 'high', httpsOnly: true },
  { header: 'content-security-policy', type: 'MISSING_CSP', title: 'Missing Content-Security-Policy header', severity: 'high' },
  { header: 'x-frame-options', type: 'MISSING_X_FRAME_OPTIONS', title: 'Missing X-Frame-Options header', severity: 'medium', alternative: (headers) => /frame-ancestors/i.test(headers['content-security-policy'] || '') },
  { header: 'x-content-type-options', type: 'MISSING_X_CONTENT_TYPE_OPTIONS', title: 'Missing X-Content-Type-Options header', severity: 'medium' },
  { header: 'referrer-policy', type: 'MISSING_REFERRER_POLICY', title: 'Missing Referrer-Policy header', severity: 'low' },
]

const SEVERITY_WEIGHT = { critical: 30, high: 18, medium: 9, low: 4, info: 1 }

function looksLikeHtml(body) {
  return /^\s*(?:<!doctype html|<html\b|<head\b)/i.test(body)
}

function looksLikeEnvFile(body) {
  if (looksLikeHtml(body)) return false
  return /^[\t ]*(?:export[\t ]+)?[A-Z][A-Z0-9_]{2,}\s*=/m.test(body)
}

function looksLikeConfigJson(body) {
  if (looksLikeHtml(body)) return false
  try {
    const parsed = JSON.parse(body)
    return Boolean(parsed) && typeof parsed === 'object'
  } catch {
    return false
  }
}

function looksLikeSqlDump(body) {
  if (looksLikeHtml(body)) return false
  return /(CREATE TABLE|INSERT INTO|PostgreSQL database dump|MySQL dump)/i.test(body)
}

function normalizeTarget(rawUrl) {
  const trimmed = String(rawUrl || '').trim()
  if (!trimmed) throw new Error('Missing URL')

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed
  try {
    parsed = new URL(withScheme)
  } catch {
    throw new Error('Please enter a valid http or https URL.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http and https URLs are allowed.')
  if (!parsed.hostname.includes('.')) throw new Error('Please enter a full domain, for example https://example.com')
  return parsed
}

export function createScanId() {
  return `scn_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`
}

export function evidenceDirFor(scanId) {
  return path.join(EVIDENCE_ROOT, String(scanId).replace(/[^a-z0-9_-]/gi, ''))
}

async function captureScreenshot(page, dir, name, options = {}) {
  try {
    await fs.promises.mkdir(dir, { recursive: true })
    const file = `${name}.png`
    await page.screenshot({ path: path.join(dir, file), fullPage: false, ...options })
    return file
  } catch {
    return null
  }
}

// Replaces raw credentials with their masked form in the live DOM so the stored
// screenshot proves the exposure without becoming a copy of the secret.
async function redactSecretsInDom(page, body) {
  const pairs = redactionPairs(body)
  if (pairs.length === 0) return
  await page
    .evaluate((replacements) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const nodes = []
      while (walker.nextNode()) nodes.push(walker.currentNode)
      for (const node of nodes) {
        let text = node.nodeValue || ''
        for (const { raw, masked } of replacements) text = text.split(raw).join(masked)
        if (text !== node.nodeValue) node.nodeValue = text
      }
    }, pairs)
    .catch(() => {})
}

function buildFinding({ id, type, severity, title, url, status, maskedProof = null, lineNumber = null, screenshot = null, evidence = null }) {
  const { meaning, consequence } = interpret(type)
  return {
    id,
    type,
    severity,
    title,
    url,
    status,
    maskedProof,
    lineNumber,
    screenshot,
    evidence,
    meaning,
    consequence,
    timestamp: new Date().toISOString(),
  }
}

function scoreFrom(findings) {
  const weight = findings.reduce((total, finding) => total + (SEVERITY_WEIGHT[finding.severity] || 1), 0)
  return Math.max(0, 100 - weight)
}

function riskFrom(score, findings) {
  if (findings.some((finding) => finding.severity === 'critical')) return 'CRITICAL'
  if (score < 55) return 'HIGH'
  if (score < 75) return 'MEDIUM'
  if (score < 90) return 'LOW'
  return 'SECURE'
}

/**
 * Runs a real browser-driven scan.
 *
 * @param {string} targetUrl
 * @param {{ scanId?: string, onEvent?: (event: object) => void }} [options]
 * @returns {Promise<object>} scan report with masked proof only
 */
export async function runRealScan(targetUrl, options = {}) {
  const parsed = normalizeTarget(targetUrl)
  const scanId = options.scanId || createScanId()
  let hardTimeoutReached = false
  const emit = (event) => {
    if (hardTimeoutReached) return
    if (typeof options.onEvent === 'function') options.onEvent(event)
  }
  const evidenceDir = evidenceDirFor(scanId)
  const startedAt = Date.now()

  const findings = []
  const discoveredEndpoints = []
  const pushFinding = (finding) => {
    findings.push(finding)
    emit({ type: 'finding', finding })
  }

  // Sensitive paths get dedicated exposed-file findings, so their bodies are not
  // re-reported by the traffic interceptor.
  const sensitiveUrls = new Set(SENSITIVE_TARGETS.map((target) => new URL(target.path, parsed.origin).toString()))

  const hardTimeoutMs = Number(process.env.SCANNER_HARD_TIMEOUT_MS || 75000)
  const browserTimeoutMs = 25000 // 25 second timeout just for browser launch
  
  // Emit started event immediately so frontend knows scan is active
  emit({ type: 'progress', progress: 1, message: 'Starting scan...' })
  
  const scan = (async () => {
    let contextReady = false
    const contextTimeoutPromise = new Promise((_, reject) =>
      setTimeout(() => {
        if (!contextReady) {
          reject(new Error('Browser launch timed out after 25s. Playwright may not be installed or the system is under heavy load. Try again in a moment.'))
        }
      }, browserTimeoutMs)
    )
    
    const contextPromise = withContext(async (context) => {
      contextReady = true
      const page = await context.newPage()
      const bodyTasks = []
      let scannedResponses = 0

      context.on('response', (response) => {
      const request = response.request()
      const resourceType = request.resourceType()
      if (!['xhr', 'fetch', 'script', 'document'].includes(resourceType)) return
      if (scannedResponses >= MAX_SCANNED_RESPONSES) return
      scannedResponses += 1

      const responseUrl = response.url()
      if (sensitiveUrls.has(responseUrl)) return
      if (['xhr', 'fetch'].includes(resourceType)) {
        try {
          const endpoint = new URL(responseUrl)
          if (endpoint.hostname === parsed.hostname) {
            const label = `${request.method()} ${endpoint.pathname}`
            if (!discoveredEndpoints.includes(label)) discoveredEndpoints.push(label)
          }
        } catch {
          // ignore malformed URLs
        }
      }

      bodyTasks.push(
        (async () => {
          const buffer = await Promise.race([
            response.body(),
            new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
          ]).catch(() => null)
          if (!buffer || buffer.byteLength > MAX_BODY_BYTES) return
          const text = buffer.toString('utf8')
          if (!text) return

          const sourceLabel = responseUrl.length > 180 ? `${responseUrl.slice(0, 177)}...` : responseUrl
          const secretType =
            resourceType === 'document' ? 'SECRET_IN_HTML' : resourceType === 'script' ? 'SECRET_IN_CLIENT_BUNDLE' : 'SECRET_IN_API_RESPONSE'

          for (const secret of findSecrets(text, sourceLabel)) {
            pushFinding(
              buildFinding({
                id: `${secretType}-${secret.type}-${findings.length}`,
                type: secretType,
                severity: 'critical',
                title: `${secret.label} exposed in ${resourceType === 'document' ? 'page HTML' : resourceType === 'script' ? 'client JavaScript' : 'API response'}`,
                url: responseUrl,
                status: response.status(),
                maskedProof: secret.maskedProof,
                lineNumber: secret.lineNumber,
                evidence: { secretType: secret.type, source: secret.source, resourceType },
              })
            )
          }
        })()
      )
    })

    emit({ type: 'progress', progress: 8, message: 'Launching browser and loading target...' })

    const response = await page
      .goto(parsed.toString(), { waitUntil: 'domcontentloaded', timeout: 45000 })
      .catch(async (err) => {
        if (!/Timeout/i.test(err instanceof Error ? err.message : String(err))) throw err
        return page.goto(parsed.toString(), { waitUntil: 'commit', timeout: 30000 })
      })
    if (!response) throw new Error('The target page did not return a response.')

    const status = response.status()
    if (status === 401) throw new Error('Unauthorized (HTTP 401). This URL requires authentication.')
    if (status === 403) throw new Error('Access denied (HTTP 403). The site is blocking automated traffic.')
    if (status >= 500) throw new Error(`Target responded with HTTP ${status}.`)

    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})

    emit({ type: 'progress', progress: 26, message: 'Capturing page evidence...' })
    const pageScreenshot = await captureScreenshot(page, evidenceDir, 'target')

    const pageTitle = await page.title().catch(() => '')
    const headers = response.headers() || {}
    const finalUrl = response.url() || parsed.toString()

    emit({ type: 'progress', progress: 38, message: 'Inspecting security headers...' })
    for (const rule of SECURITY_HEADERS) {
      if (rule.httpsOnly && new URL(finalUrl).protocol !== 'https:') continue
      if (headers[rule.header]) continue
      if (rule.alternative && rule.alternative(headers)) continue
      pushFinding(
        buildFinding({
          id: `${rule.type}`,
          type: rule.type,
          severity: rule.severity,
          title: rule.title,
          url: finalUrl,
          status,
          evidence: { header: rule.header, present: false, observedHeaders: Object.keys(headers).length },
        })
      )
    }

    emit({ type: 'progress', progress: 48, message: 'Testing cross-origin policy...' })
    const corsProbe = await context.request
      .get(finalUrl, { headers: { Origin: 'https://alphatekx-cors-probe.invalid' }, failOnStatusCode: false, timeout: 20000 })
      .catch(() => null)
    if (corsProbe) {
      const corsHeaders = corsProbe.headers() || {}
      const allowOrigin = corsHeaders['access-control-allow-origin']
      const allowCredentials = String(corsHeaders['access-control-allow-credentials'] || '').toLowerCase() === 'true'
      const reflectsOrigin = allowOrigin === 'https://alphatekx-cors-probe.invalid'
      if (allowOrigin === '*' || reflectsOrigin) {
        pushFinding(
          buildFinding({
            id: allowCredentials ? 'CORS_WILDCARD_WITH_CREDENTIALS' : 'CORS_WILDCARD',
            type: allowCredentials ? 'CORS_WILDCARD_WITH_CREDENTIALS' : 'CORS_WILDCARD',
            severity: allowCredentials ? 'critical' : 'medium',
            title: allowCredentials
              ? 'Any website can read your responses with user credentials attached'
              : 'Cross-origin requests are allowed from any website',
            url: finalUrl,
            status: corsProbe.status(),
            evidence: { 'access-control-allow-origin': allowOrigin, 'access-control-allow-credentials': allowCredentials, reflectsOrigin },
          })
        )
      }
    }

    emit({ type: 'progress', progress: 58, message: 'Probing for exposed files...' })
    const probePage = await context.newPage()
    const PROBE_CONCURRENCY = 4
    let probesDone = 0
    const exposedProbes = []
    async function runProbe(target) {
      const probeUrl = new URL(target.path, parsed.origin).toString()
      const probe = await context.request
        .get(probeUrl, { failOnStatusCode: false, timeout: 10000, maxRedirects: 0 })
        .catch(() => null)
      probesDone += 1
      emit({
        type: 'progress',
        progress: 58 + Math.round((probesDone / SENSITIVE_TARGETS.length) * 14),
        message: `Probing ${target.path}...`,
      })
      if (!probe || probe.status() !== 200) return
      const body = (await probe.text().catch(() => '')) || ''
      if (!target.validate(body)) return
      exposedProbes.push({ target, probeUrl, body, probe })
    }
    let probeCursor = 0
    async function probeWorker() {
      while (probeCursor < SENSITIVE_TARGETS.length) {
        const target = SENSITIVE_TARGETS[probeCursor]
        probeCursor += 1
        // eslint-disable-next-line no-await-in-loop
        await runProbe(target)
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(PROBE_CONCURRENCY, SENSITIVE_TARGETS.length) }, () => probeWorker())
    )
    for (const { target, probeUrl, body, probe } of exposedProbes) {
      const screenshot = await probePage
        .goto(probeUrl, { waitUntil: 'domcontentloaded', timeout: 12000 })
        .then(() => redactSecretsInDom(probePage, body))
        .then(() => captureScreenshot(probePage, evidenceDir, `evidence-${target.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`))
        .catch(() => null)

      const secrets = findSecrets(body, target.path)
      pushFinding(
        buildFinding({
          id: `exposed-${target.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`,
          type: target.type,
          severity: 'critical',
          title: target.title,
          url: probeUrl,
          status: 200,
          screenshot,
          maskedProof: secrets[0]?.maskedProof || null,
          lineNumber: secrets[0]?.lineNumber || null,
          evidence: {
            path: target.path,
            contentType: (probe.headers() || {})['content-type'] || 'unknown',
            bytes: Buffer.byteLength(body),
            secretsFound: secrets.map(({ type, label, maskedProof, lineNumber }) => ({ type, label, maskedProof, lineNumber })),
          },
        })
      )
    }

    emit({ type: 'progress', progress: 74, message: 'Checking for published source maps...' })
    const scriptSources = await page
      .$$eval('script[src]', (nodes) => nodes.map((node) => node.getAttribute('src')).filter(Boolean))
      .catch(() => [])
    const sameOriginScripts = scriptSources
      .map((src) => {
        try {
          return new URL(src, finalUrl)
        } catch {
          return null
        }
      })
      .filter((url) => url && url.hostname === parsed.hostname && url.pathname.endsWith('.js'))
      .slice(0, 8)

    for (const scriptUrl of sameOriginScripts) {
      const mapUrl = `${scriptUrl.toString()}.map`
      const mapProbe = await context.request.get(mapUrl, { failOnStatusCode: false, timeout: 15000 }).catch(() => null)
      if (!mapProbe || mapProbe.status() !== 200) continue
      const mapBody = (await mapProbe.text().catch(() => '')) || ''
      if (!/"sources"\s*:/.test(mapBody)) continue
      pushFinding(
        buildFinding({
          id: `sourcemap-${scriptUrl.pathname.replace(/[^a-z0-9]+/gi, '-')}`,
          type: 'EXPOSED_SOURCE_MAP',
          severity: 'medium',
          title: 'Production source map is published',
          url: mapUrl,
          status: 200,
          evidence: { script: scriptUrl.toString(), bytes: Buffer.byteLength(mapBody) },
        })
      )
      break
    }

    emit({ type: 'progress', progress: 88, message: 'Analysing intercepted traffic...' })
    await Promise.allSettled(bodyTasks)
    await probePage.close().catch(() => {})
    await page.close().catch(() => {})

    const score = scoreFrom(findings)
    return {
      scanId,
      url: parsed.toString(),
      scannedUrl: finalUrl,
      host: parsed.hostname,
      status,
      pageTitle,
      screenshot: pageScreenshot,
      engine: 'playwright',
      score,
      risk: riskFrom(score, findings),
      findings,
      counts: findings.reduce((acc, finding) => ({ ...acc, [finding.severity]: (acc[finding.severity] || 0) + 1 }), {}),
      totalFindings: findings.length,
      discoveredEndpoints,
      responseHeaders: Object.keys(headers),
      durationMs: Date.now() - startedAt,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date().toISOString(),
    }
  })

    const report = await Promise.race([
      contextPromise,
      contextTimeoutPromise,
    ])

    await fs.promises.mkdir(evidenceDir, { recursive: true }).catch(() => {})
    await fs.promises.writeFile(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8').catch(() => {})

    emit({ type: 'progress', progress: 100, message: 'Scan complete' })
    return report
  })()

  return await Promise.race([
    scan,
    new Promise((_, reject) =>
      setTimeout(() => {
        hardTimeoutReached = true
        reject(new Error(`Scan timed out after ${Math.round(hardTimeoutMs / 1000)}s. The site is too slow or is blocking automated traffic.`))
      }, hardTimeoutMs)
    ),
  ])
}

export async function loadStoredReport(scanId) {
  const file = path.join(evidenceDirFor(scanId), 'report.json')
  const raw = await fs.promises.readFile(file, 'utf8').catch(() => null)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
