// playwrightScanner.js — The Restore Engine
// Real-browser vulnerability scanner for non-developers.
//
// Visits a target with Playwright's Chromium and:
//   1. Enforces the SSRF guard (no localhost / private IPs / metadata hosts
//      unless explicitly allowed for admin / local proofs).
//   2. Probes the 25 sensitive-path leak list (/.env, /.git/config,
//      /config.js, /openapi.json, /supabase/config.toml, ...) with a REAL
//      Playwright network request, recording status code, content type, masked
//      sample, size and a masked HTML snippet per path.
//   3. Loads the homepage, extracts every JS bundle + the page HTML and hunts
//      for OPENAI_KEY / STRIPE_KEY / AWS_KEY style secrets (140+ patterns).
//   4. Captures a homepage screenshot plus a per-exposed-path screenshot as
//      visual proof.
//   5. Keeps raw found values ONLY in a non-serialisable Symbol field so the
//      API layer can live-verify them transiently without ever persisting them.
//
// Returns { url, statusCode, isExposed, maskedValue, screenshotPath, bundleFound,
//           paths, exposedPaths, secrets, risk, score, ... }

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { huntSecrets, maskExposedBody, maskSecret, describeSecret, redactionPairs } from './secretHunter.js'

export const RAW_SECRETS = Symbol('restoreEngine.rawSecrets')

const SENSITIVE_PATHS = [
  { path: '/.env', kind: 'env-file', weight: 5 },
  { path: '/.env.production', kind: 'env-file', weight: 5 },
  { path: '/.env.local', kind: 'env-file', weight: 5 },
  { path: '/env.js', kind: 'env-bundle', weight: 4 },
  { path: '/env-config.js', kind: 'env-bundle', weight: 4 },
  { path: '/runtime-config.js', kind: 'env-bundle', weight: 4 },
  { path: '/config.js', kind: 'config-bundle', weight: 3 },
  { path: '/config.json', kind: 'config-bundle', weight: 3 },
  { path: '/.git/config', kind: 'git-data', weight: 5 },
  { path: '/.git/HEAD', kind: 'git-data', weight: 4 },
  { path: '/.git/logs/HEAD', kind: 'git-data', weight: 4 },
  { path: '/.git/objects/info/packs', kind: 'git-data', weight: 3 },
  { path: '/.DS_Store', kind: 'mac-meta', weight: 2 },
  { path: '/backup.zip', kind: 'backup', weight: 5 },
  { path: '/backup.tar.gz', kind: 'backup', weight: 5 },
  { path: '/backup.sql', kind: 'backup', weight: 5 },
  { path: '/wp-config.php', kind: 'cms-config', weight: 5 },
  { path: '/admin/config.php', kind: 'cms-config', weight: 4 },
  { path: '/.htaccess', kind: 'server-config', weight: 3 },
  { path: '/api/openapi.json', kind: 'api-docs', weight: 3 },
  { path: '/openapi.json', kind: 'api-docs', weight: 3 },
  { path: '/swagger.json', kind: 'api-docs', weight: 3 },
  { path: '/api-docs', kind: 'api-docs', weight: 2 },
  { path: '/supabase/config.toml', kind: 'builder-config', weight: 4 },
  { path: '/vercel.json', kind: 'builder-config', weight: 2 },
]

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'

const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROOF_DIR = path.resolve(ENGINE_DIR, '..', '..', 'data', 'scan-proof')
const STORE_PREFIX = 'sk-proj-'

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------
const PRIVATE_IP_PREFIXES = ['127.', '10.', '192.168.', '169.254.', '0.']
const PRIVATE_HOSTNAMES = new Set([
  'localhost', '127.0.0.1', '::1', '0.0.0.0',
  'metadata.google.internal', 'metadata.google', '169.254.169.254',
  'kubernetes.default.svc', 'docker.for.mac.host.internal', 'host.docker.internal',
])

function isPrivateIp(hostname) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false
  if (PRIVATE_IP_PREFIXES.some(prefix => hostname.startsWith(prefix))) return true
  const [first, second] = hostname.split('.').map(Number)
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first >= 224) return true
  return false
}

/**
 * Validate that a scan target is a safe, public http(s) URL.
 * @param {string} rawUrl
 * @param {{allowPrivate?: boolean}} [options] allowPrivate skips the SSRF block
 *   (used for local proof servers and admin-email scans).
 * @returns {URL} parsed URL
 */
export function assertSafeUrl(rawUrl, { allowPrivate = false } = {}) {
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
  if (allowPrivate) return parsed

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (PRIVATE_HOSTNAMES.has(hostname) || hostname.endsWith('.internal')) {
    throw new Error('SSRF guard: private / internal hostnames are not allowed.')
  }
  if (isPrivateIp(hostname)) {
    throw new Error('SSRF guard: private, link-local or metadata IP addresses are not allowed.')
  }
  return parsed
}

function sanitizeHostname(hostname) {
  return String(hostname || 'target').replace(/[^a-z0-9.-]/gi, '-').toLowerCase()
}

function safeSnippet(text) {
  const raw = String(text || '')
  if (!raw) return ''
  const pairs = redactionPairs(raw.slice(0, 2000))
  let clean = raw.slice(0, 2000)
  for (const pair of pairs) clean = clean.split(pair.raw).join(pair.masked)
  return clean.slice(0, 320)
}

export function createRestoreScanner({ chromium } = {}) {
  if (!chromium) throw new Error('createRestoreScanner requires the playwright chromium export')

  async function probePath(context, sensitivePath, baseUrl, index, hostname) {
    const probeUrl = new URL(sensitivePath.path, baseUrl).toString()
    const result = {
      path: sensitivePath.path,
      kind: sensitivePath.kind,
      url: probeUrl,
      statusCode: 0,
      contentType: '',
      isExposed: false,
      maskedValue: null,
      htmlSnippet: '',
      fullContentLength: 0,
      screenshotPath: null,
      tookMs: 0,
    }
    const startedAt = Date.now()
    try {
      const response = await context.request.get(probeUrl, { timeout: 10000 })
      result.statusCode = response.status()
      result.contentType = String(response.headers()['content-type'] || '').split(';')[0].trim()
      if (response.ok()) {
        const text = await response.text().catch(() => '')
        result.isExposed = true
        result.fullContentLength = Number(response.headers()['content-length'] || text.length)
        result.maskedValue = maskExposedBody(text)
        result.htmlSnippet = safeSnippet(text)
        const shotStamp = new Date().toISOString().replace(/[:.]/g, '-')
        const shotFile = path.join(PROOF_DIR, `proof-${sanitizeHostname(hostname)}-${index}-${shotStamp}.png`)
        fs.mkdirSync(PROOF_DIR, { recursive: true })
        try {
          const shotPage = await context.newPage()
          await shotPage.goto(probeUrl, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {})
          await shotPage.screenshot({ path: shotFile }).catch(() => {})
          await shotPage.close().catch(() => {})
          if (fs.existsSync(shotFile)) {
            result.screenshotPath = `/api/restore/proof/${path.basename(shotFile)}`
          }
        } catch {
          // Screenshot of a binary/redirecting path is a nice-to-have.
        }
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
    const parsed = assertSafeUrl(rawUrl, { allowPrivate: Boolean(options.allowPrivate) })

    const baseUrl = parsed.origin
    const hostname = parsed.hostname
    const startedAt = Date.now()

    const hardTimeoutMs = Number(process.env.SCANNER_RESTORE_TIMEOUT_MS || 90000)
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
            const index = probeCursor
            probeCursor += 1
            // eslint-disable-next-line no-await-in-loop
            pathResults.push(await probePath(context, sensitivePath, baseUrl, index, hostname))
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(PROBE_CONCURRENCY, SENSITIVE_PATHS.length) }, () => probeWorker())
        )
        pathResults.sort((a, b) => SENSITIVE_PATHS.findIndex(s => s.path === a.path) - SENSITIVE_PATHS.findIndex(s => s.path === b.path))

        // 2) Load the homepage (real status code + title + bundles).
        let statusCode = 0
        let pageTitle = ''
        let finalUrl = String(rawUrl)
        let homepageHtml = ''
        try {
          const homeResponse = await page.goto(String(rawUrl), { waitUntil: 'domcontentloaded', timeout: 30000 })
          if (homeResponse) {
            statusCode = homeResponse.status()
            finalUrl = homeResponse.url() || String(rawUrl)
          }
          pageTitle = await page.title().catch(() => '')
          homepageHtml = await page.content().catch(() => '')
        } catch {
          // The leak probes already succeeded; a hostile homepage should not kill the scan.
        }

        // 3) Extract + hunt JS bundles + page HTML.
        const bundles = await collectBundles(page, context, baseUrl)
        const secrets = []
        const candidates = []
        const absorbHits = (hits, source) => {
          for (const hit of hits) {
            candidates.push({ kind: hit.kind, keyName: hit.keyName, value: hit.value })
            const merged = {
              ...hit,
              source,
              severity: describeSecret(hit.kind).severity,
            }
            // Hide the raw value now; only the masked proof is ever serialised.
            delete merged.value
            secrets.push(merged)
          }
        }
        for (const bundle of bundles) {
          absorbHits(huntSecrets(bundle.content, { source: bundle.url }), bundle.url)
        }
        absorbHits(huntSecrets(homepageHtml, { source: 'page-html' }), 'page-html')

        // 4) Homepage screenshot first, then per-exposed-path screenshots.
        const screenshotPath = await captureScreenshot(page, hostname)

        const summary = summarize(pathResults, secrets, bundles, statusCode)

        const publicPaths = pathResults.map(result => ({
          path: result.path,
          kind: result.kind,
          url: result.url,
          statusCode: result.statusCode,
          contentType: result.contentType,
          isExposed: result.isExposed,
          maskedValue: result.maskedValue,
          htmlSnippet: result.htmlSnippet,
          fullContentLength: result.fullContentLength,
          screenshotPath: result.screenshotPath,
          tookMs: result.tookMs,
        }))

        const result = {
          url: finalUrl,
          statusCode: summary.statusCode,
          isExposed: summary.isExposed,
          maskedValue: summary.maskedValue,
          screenshotPath,
          bundleFound: summary.bundleFound,
          hostname,
          scannedAt: new Date().toISOString(),
          tookMs: Date.now() - startedAt,
          pageTitle,
          risk: summary.risk,
          score: summary.score,
          bundlesScanned: summary.bundlesScanned,
          paths: publicPaths,
          exposedPaths: publicPaths.filter(item => item.isExposed),
          secrets,
          summary: summary.summary,
          ssrf: { guard: 'active', target: parsed.origin },
          storePrefix: STORE_PREFIX,
        }
        // Raw values only for transient live-verification — never serialised
        // (Symbol keys are dropped by JSON.stringify).
        result[RAW_SECRETS] = candidates
        return result
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

export { maskSecret, describeSecret }
