// playwrightScanner.js — The Restore Engine
// Real-browser vulnerability scanner for non-developers.
//
// Visits a target with Playwright's Chromium and:
//   1. Probes the leak list (/.env, /config.json, /.git/config, /.DS_Store,
//      /backup.zip, /.git/logs/HEAD, /api/openapi.json) and records a REAL
//      status code + masked sample for each.
//   2. Loads the homepage, extracts every JS bundle (script src + modulepreload)
//      and hunts for OPENAI_KEY / STRIPE_KEY / AWS_KEY style secrets.
//   3. Captures a screenshot as visual proof of the exposure.
//
// Returns { url, statusCode, isExposed, maskedValue, screenshotPath, bundleFound, ... }
// so the report can show "BEFORE 200 exposed" without ever echoing the raw secret.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { huntSecrets, maskExposedBody, maskSecret, describeSecret } from './secretHunter.js'

const SENSITIVE_PATHS = [
  '/.env',
  '/config.json',
  '/.git/config',
  '/.DS_Store',
  '/backup.zip',
  '/.git/logs/HEAD',
  '/api/openapi.json',
]

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'

const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROOF_DIR = path.resolve(ENGINE_DIR, '..', '..', 'data', 'scan-proof')
const STORE_PREFIX = 'sk-proj-'

function sanitizeHostname(hostname) {
  return String(hostname || 'target').replace(/[^a-z0-9.-]/gi, '-').toLowerCase()
}

export function createRestoreScanner({ chromium } = {}) {
  if (!chromium) throw new Error('createRestoreScanner requires the playwright chromium export')

  async function probePath(context, probeUrl) {
    const result = {
      path: new URL(probeUrl).pathname,
      url: probeUrl,
      statusCode: 0,
      contentType: '',
      isExposed: false,
      maskedValue: null,
      tookMs: 0,
    }
    const startedAt = Date.now()
    try {
      // Real Playwright browser request (same network stack, cookies and UA as
      // a real visit) — unlike page.goto it also handles binary bodies such as
      // /.DS_Store and /backup.zip without treating them as downloads.
      const response = await context.request.get(probeUrl, { timeout: 10000 })
      result.statusCode = response.status()
      result.contentType = String(response.headers()['content-type'] || '').split(';')[0].trim()
      if (response.ok()) {
        const text = await response.text().catch(() => '')
        result.isExposed = true
        result.maskedValue = maskExposedBody(text)
      }
    } catch {
      // Unreachable / non-HTML responses are not proof of exposure.
    }
    result.tookMs = Date.now() - startedAt
    return result
  }

  async function collectBundles(page, context, baseUrl) {
    const scriptSources = await page
      .$$eval('script[src]', elements => elements.map(el => el.getAttribute('src')).filter(Boolean))
      .catch(() => [])
    const moduleSources = await page
      .$$eval('link[rel="modulepreload"]', elements => elements.map(el => el.getAttribute('href')).filter(Boolean))
      .catch(() => [])
    const styleSources = await page
      .$$eval('link[rel="stylesheet"]', elements => elements.map(el => el.getAttribute('href')).filter(Boolean))
      .catch(() => [])
    const entrySources = [...new Set([...scriptSources, ...moduleSources, ...styleSources])]

    const bundles = []
    const fetched = new Set()
    for (const src of entrySources) {
      let bundleUrl
      try {
        bundleUrl = new URL(src, baseUrl).toString()
      } catch {
        continue
      }
      if (fetched.has(bundleUrl)) continue
      fetched.add(bundleUrl)
      try {
        const response = await context.request.get(bundleUrl, { timeout: 10000 })
        if (response.ok()) {
          const text = await response.text()
          bundles.push({ url: bundleUrl, bytes: text.length, content: text })
        }
      } catch {
        // Skip bundles that cannot be fetched (auth walls, CORS, timeouts).
      }
    }
    return bundles
  }

  async function captureScreenshot(page, hostname) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `proof-${sanitizeHostname(hostname)}-${stamp}.png`
    try {
      fs.mkdirSync(PROOF_DIR, { recursive: true })
      const filePath = path.join(PROOF_DIR, filename)
      await page.screenshot({ path: filePath, fullPage: false })
      return `/api/restore/proof/${filename}`
    } catch {
      return null
    }
  }

  function summarize(pathResults, secrets, bundles, statusCode) {
    const exposedPaths = pathResults.filter(result => result.isExposed)
    const critical = secrets.filter(secret => describeSecret(secret.kind).severity === 'CRITICAL')
    const isExposed = exposedPaths.length > 0 || critical.length > 0

    // The single masked value used as the headline proof (spec: { maskedValue }).
    const headlineSecret = secrets[0] || null
    const maskedValue =
      exposedPaths[0]?.maskedValue ||
      (headlineSecret ? headlineSecret.maskedValue : null)

    const score = Math.max(0, Math.min(100, 100 - exposedPaths.length * 30 - critical.length * 15 - (secrets.length - critical.length) * 8))
    const risk =
      exposedPaths.length > 0 || critical.length > 0
        ? 'CRITICAL'
        : secrets.length > 0
          ? 'HIGH'
          : score >= 80
            ? 'LOW'
            : 'MEDIUM'

    return {
      statusCode,
      isExposed,
      maskedValue,
      risk,
      score,
      bundleFound: bundles.length > 0,
      bundlesScanned: bundles.length,
      exposedPaths,
      pathCount: pathResults.length,
      exposedPathCount: exposedPaths.length,
      secretCount: secrets.length,
      summary: exposedPaths.length > 0
        ? `${exposedPaths.length} sensitive file${exposedPaths.length === 1 ? '' : 's'} returned HTTP 200 on ${sanitizeHostname(new URL(pathResults[0]?.url || 'http://target').hostname)}.`
        : critical.length > 0
          ? `A critical API key was found inside a publicly loaded ${bundles.length ? 'JS bundle' : 'page'} for ${sanitizeHostname(new URL(pathResults[0]?.url || 'http://target').hostname)}.`
          : 'No sensitive files or secrets were exposed by the real browser scan.',
    }
  }

  async function scanRestoreUrl(rawUrl, options = {}) {
    const normalizedUrl = String(rawUrl || '').trim()
    if (!normalizedUrl) throw new Error('Missing URL')

    let parsed
    try {
      parsed = new URL(normalizedUrl)
    } catch {
      throw new Error('Please enter a valid http or https URL.')
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only http and https URLs are allowed.')
    }

  const baseUrl = parsed.origin
  const hostname = parsed.hostname
  const startedAt = Date.now()

  const hardTimeoutMs = Number(process.env.SCANNER_RESTORE_TIMEOUT_MS || 75000)
  const scanBody = (async () => {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    })
    try {
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        userAgent: USER_AGENT,
        viewport: { width: 1280, height: 800 },
      })
      const page = await context.newPage()

      // 1) Probe every sensitive path with the real browser (parallel, bounded).
      const pathResults = []
      const PROBE_CONCURRENCY = 4
      let probeCursor = 0
      async function probeWorker() {
        while (probeCursor < SENSITIVE_PATHS.length) {
          const sensitivePath = SENSITIVE_PATHS[probeCursor]
          probeCursor += 1
          const probeUrl = new URL(sensitivePath, baseUrl).toString()
          // eslint-disable-next-line no-await-in-loop
          pathResults.push(await probePath(context, probeUrl))
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(PROBE_CONCURRENCY, SENSITIVE_PATHS.length) }, () => probeWorker())
      )
      pathResults.sort((a, b) => SENSITIVE_PATHS.indexOf(a.path) - SENSITIVE_PATHS.indexOf(b.path))

      // 2) Load the homepage (gives us the real status code + title + bundles).
      let statusCode = 0
      let pageTitle = ''
      let finalUrl = normalizedUrl
      try {
        const homeResponse = await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
        if (homeResponse) {
          statusCode = homeResponse.status()
          finalUrl = homeResponse.url() || normalizedUrl
        }
        pageTitle = await page.title().catch(() => '')
      } catch {
        // The leak probes already succeeded; a hostile homepage should not kill the scan.
      }

      // 3) Extract + hunt JS bundles.
      const bundles = await collectBundles(page, context, baseUrl)
      const secrets = []
      for (const bundle of bundles) {
        const found = huntSecrets(bundle.content, { source: bundle.url })
        for (const hit of found) {
          const merged = {
            ...hit,
            source: bundle.url,
            severity: describeSecret(hit.kind).severity,
          }
          // Hide the raw value now; only the masked proof is ever serialised.
          delete merged.value
          secrets.push(merged)
        }
      }
      const htmlSecrets = huntSecrets(await page.content().catch(() => ''), { source: 'page-html' })
      for (const hit of htmlSecrets) {
        const merged = { ...hit, severity: describeSecret(hit.kind).severity }
        delete merged.value
        secrets.push(merged)
      }

      // 4) Screenshot proof.
      const screenshotPath = await captureScreenshot(page, hostname)

      const summary = summarize(pathResults, secrets, bundles, statusCode)

      const publicPaths = pathResults.map(result => ({
        path: result.path,
        url: result.url,
        statusCode: result.statusCode,
        contentType: result.contentType,
        isExposed: result.isExposed,
        maskedValue: result.maskedValue,
        tookMs: result.tookMs,
      }))

      return {
        // Spec contract (Step 1):
        url: finalUrl,
        statusCode: summary.statusCode,
        isExposed: summary.isExposed,
        maskedValue: summary.maskedValue,
        screenshotPath,
        bundleFound: summary.bundleFound,
        // Rich report:
        hostname,
        scannedAt: new Date().toISOString(),
        tookMs: Date.now() - startedAt,
        pageTitle,
        risk: summary.risk,
        score: summary.score,
        bundlesScanned: summary.bundlesScanned,
        paths: publicPaths,
        exposedPaths: publicPaths.filter(result => result.isExposed),
        secrets,
        summary: summary.summary,
        watchingAvailable: Boolean(options.allowWatching),
        storePrefix: STORE_PREFIX,
      }
    } finally {
      await browser.close().catch(() => {})
    }
  })()

  return await Promise.race([
    scanBody,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Restore scan timed out after 75s. The site is too slow or is blocking automated traffic.')), hardTimeoutMs)
    ),
  ])
}

  return scanRestoreUrl
}
