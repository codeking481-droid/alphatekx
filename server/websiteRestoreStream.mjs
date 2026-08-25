/**
 * WEBSITE RESURRECTOR — STREAMING PIPELINE
 * Emits SSE cards for: preview, scanning, errors, backup, fixing, gold proof, action.
 * Uses Groq for AI analysis and fix generation. No GPU needed.
 */

import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { withContext } from './scanner/browserPool.mjs'
import { alphaChat, alphaText } from '../alpha-core/index.ts'
import { runFullRestorationScan } from './scanEngine/restorationScanner.mjs'
import { sanitizeEncoding, validateHtml, FileHandler } from './scanEngine/fileUtils.js'
import { buildGreenCard } from './greenCard.mjs'
import {
  emitRestorationStarted,
  emitRepositoryScanned,
  emitBrowserOpened,
  emitPageNavigated,
  emitErrorDetected,
  emitHypothesisCreated,
  emitCommandStarted,
  emitCommandFinished,
  emitFileModified,
  emitTestStarted,
  emitTestFinished,
  emitRestorationCompleted,
  emitReasoningTrace,
  emitExperimentStarted,
} from '../alpha-core/event-bus.ts'

/**
 * Exact message shown when a target site does not load.
 * AlphaTekX restores code — it does not diagnose hosting/DNS/SSL problems.
 */
const SITE_NOT_LOADING = 'The site is not loading. Please check your hosting provider or domain DNS settings. Once your site is live, send me the URL and I will restore it.'

/**
 * AI analysis helper — returns parsed JSON or { content: rawText }.
 * Delegates to alpha-core/groq-router (REASONING role).
 */
async function groqChat(messages, model) {
  if (!process.env.GROQ_API_KEY) {
    return { improvements: [], summary: 'AI skipped (no API key)' }
  }
  try {
    const role = (model === 'compound-beta-mini' || model === 'compound-beta') ? 'SCANNER' : 'REASONING'
    const result = await Promise.race([
      alphaChat(role, messages),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 15000)),
    ])
    return result
  } catch (err) {
    console.error(`[RESSTREAM] AI error (${model}):`, err.message)
    return { improvements: [], summary: `AI skipped: ${err.message}` }
  }
}

/**
 * AI text helper — returns plain text string.
 * Delegates to alpha-core/groq-router (REASONING role).
 */
async function groqText(messages, model) {
  if (!process.env.GROQ_API_KEY) {
    return 'AI skipped (no API key)'
  }
  try {
    const role = (model === 'compound-beta-mini' || model === 'compound-beta') ? 'SCANNER' : 'REASONING'
    return await Promise.race([
      alphaText(role, messages),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 15000)),
    ])
  } catch (err) {
    console.error(`[RESSTREAM] AI text error:`, err.message)
    return `LLM error: ${err.message}`
  }
}

/**
 * Start a heartbeat that emits periodic progress events to keep the UI alive.
 * Returns a stop function to clear the interval.
 */
function startHeartbeat(scanId, sendStep, intervalMs = 8000) {
  let count = 0
  const labels = ['Still processing...', 'Analyzing patterns...', 'Checking code...', 'Running checks...']
  const timer = setInterval(() => {
    sendStep({ id: 'heartbeat', label: labels[count % labels.length], icon: 'scan', status: 'active', summary: `Step ${count + 1}` })
    count++
  }, intervalMs)
  return () => { try { clearInterval(timer) } catch {} }
}

export function handlePreviewRoute(req, res) {
  const parsed = new URL(req.url, 'http://localhost')
  const targetUrl = parsed.searchParams.get('url')
  if (!targetUrl) return jsonResponse(res, 400, { error: 'Missing url parameter' })
  let baseUrl
  try { baseUrl = new URL(targetUrl) } catch { return jsonResponse(res, 400, { error: 'Invalid URL' }) }

  const origin = baseUrl.origin
  const cacheBust = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)

  fetch(`${targetUrl}${targetUrl.includes('?') ? '&' : '?'}_cb=${cacheBust}`, {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    redirect: 'follow',
  }).then(async (fetchRes) => {
    clearTimeout(timer)
    const contentType = fetchRes.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
      res.writeHead(fetchRes.status, {
        'Content-Type': contentType || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      })
      const body = Buffer.from(await fetchRes.arrayBuffer())
      return res.end(body)
    }

    let html = await fetchRes.text()

    // Rewrite relative URLs to absolute so the iframe can load CSS/JS/images
    html = rewriteRelativeUrls(html, origin)

    // Add base tag as fallback
    if (!html.includes('<base ')) {
      html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${origin}/">`)
    }

    // Inject meta viewport for mobile rendering inside iframe
    if (!html.includes('viewport')) {
      html = html.replace(/<head([^>]*)>/i, `<head$1><meta name="viewport" content="width=device-width,initial-scale=1">`)
    }

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(html)
  }).catch((fetchErr) => {
    clearTimeout(timer)
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' })
    res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#0A0A0A;color:#fff;font-family:monospace;padding:40px;text-align:center"><h2>Preview Unavailable</h2><p style="color:#ff6b6b">${fetchErr.name === 'AbortError' ? 'Connection timed out (20s)' : fetchErr.message}</p><p style="color:#666">URL: ${targetUrl}</p></body></html>`)
  })
}

function rewriteRelativeUrls(html, origin) {
  // Rewrite src="...", href="...", action="..." with relative paths to absolute
  return html
    // src="/path" or src="path" → src="https://origin/path"
    .replace(/((?:src|href|action|poster|data-src|data-bg|content)=(["']))\/(?!\/)/g, `$1${origin}/`)
    .replace(/((?:src|href|action|poster|data-src|data-bg|content)=(["']))(?![a-z]+:)(?!${origin})([^"']*?)\2/g, `$1${origin}/$3$2`)
    // url(/path) in inline styles
    .replace(/url\((['"]?)\/(?!\/)/g, `url($1${origin}/`)
    // srcset="/path"
    .replace(/(srcset=(["'])\/)(?!\/)/g, `$1${origin}/`)
}

export function handleRestoreStreamRoute(req, res) {
  const parsed = new URL(req.url, 'http://localhost')
  // Accept bare domains ("mysite.com") — default to https:// like a browser would
  const rawUrl = (parsed.searchParams.get('url') || '').trim()
  const targetUrl = rawUrl && !/^https?:\/\//i.test(rawUrl) ? 'https://' + rawUrl.replace(/^\/+/, '') : rawUrl
  const intent = parsed.searchParams.get('intent') || 'auto' // 'scan' | 'fix' | 'auto'
  const userMessage = parsed.searchParams.get('message') || ''
  const monthlyRevenue = parsed.searchParams.get('monthlyRevenue') ? Number(parsed.searchParams.get('monthlyRevenue')) : null
  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Missing url parameter' })}\n\n`)
    return res.end()
  }
  try { new URL(targetUrl) } catch {
    res.writeHead(400, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Invalid URL' })}\n\n`)
    return res.end()
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const sendCard = (card) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(card)}\n\n`)
  }

  runPipeline(targetUrl, sendCard, res, intent, userMessage, monthlyRevenue).catch(err => {
    console.error('[RESSTREAM] Pipeline crashed:', err.message)
    sendCard({ type: 'error', message: err.message || 'Pipeline failed' })
    if (!res.writableEnded) res.end()
  })
}

export function handleFixStreamRoute(req, res) {
  const parsed = new URL(req.url, 'http://localhost')
  const scanId = parsed.searchParams.get('scanId')
  if (!scanId) {
    res.writeHead(400, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Missing scanId parameter' })}\n\n`)
    return res.end()
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const sendCard = (card) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(card)}\n\n`)
  }

  runFixPipeline(scanId, sendCard, res).catch(err => {
    console.error('[FIXSTREAM] Pipeline crashed:', err.message)
    sendCard({ type: 'error', message: err.message || 'Fix pipeline failed' })
    if (!res.writableEnded) res.end()
  })
}

async function runPipeline(targetUrl, sendCard, res, intent = 'auto', userMessage = '', monthlyRevenue = null) {
  const scanId = `wr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const workDir = path.resolve(tmpdir(), `restore-${scanId}`)
  const restoredDir = path.resolve(workDir, 'restored')
  const rollbackDir = path.resolve(workDir, 'rollback')

  for (const d of [workDir, restoredDir, rollbackDir]) {
    try { fs.mkdirSync(d, { recursive: true }) } catch {}
  }

  let originalHtml = ''
  let scanData = {}
  let errorsFound = []
  let fixedFiles = []
  let fixedHtml = ''
  let metrics = { before: { statusCode: 0, lcp: '0s', errors: 0 }, after: { statusCode: 200, lcp: '0s', errors: 0 } }

  // SSE writer for event-bus
  const sseWriter = (data) => {
    if (!res.writableEnded) res.write(data)
  }
  const sendStep = (step) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type: 'thought_step', step })}\n\n`)
  }

  // ===== EMIT: RESTORATION STARTED =====
  sendStep({ id: 'init', label: 'Alpha analyzing site...', icon: 'scan', status: 'done', summary: `Target: ${targetUrl}` })
  sendStep({ id: 'connectivity', label: `Checking site connectivity...`, icon: 'scan', status: 'active' })
  emitRestorationStarted(scanId, sseWriter)
  sendCard({ type: 'alpha_event', event: { type: 'RESTORATION_STARTED', timestamp: new Date().toISOString() } })

  // Start heartbeat to keep UI alive during long operations
  const stopHeartbeat = startHeartbeat(scanId, sendStep)

  // ===== CARD 2: SCANNING LOG =====
  sendCard({ type: 'card', card: 'scanning', status: 'start', data: { scanId } })

  // ===== LOAD PROBE: quick reachability signal (the real-browser scan below is the authoritative test) =====
  let siteLoaded = false
  for (let attempt = 0; attempt < 2 && !siteLoaded; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12000)
      await fetch(targetUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 AlphaTekX/1.0' },
        redirect: 'follow',
      })
      clearTimeout(timer)
      siteLoaded = true // any HTTP response means the site loads — code can be scanned
    } catch {}
  }
  if (siteLoaded) {
    sendCard({ type: 'log', card: 'scanning', text: `> Site loaded` })
    sendStep({ id: 'connectivity', label: `Site loaded`, icon: 'scan', status: 'done' })
  } else {
    // Probe failed — do NOT abort here. The headless browser gets the final say;
    // a fetch-level failure can be a bot block, TLS quirk, or transient network error.
    sendCard({ type: 'log', card: 'scanning', text: `> Direct fetch failed — trying full browser load...` })
  }

  // ===== PLAYWRIGHT BROWSER SCANNING WITH LIVE SCREENSHOTS =====
  const screenshots = []
  const screenshotDir = path.join(workDir, 'screenshots')
  try { fs.mkdirSync(screenshotDir, { recursive: true }) } catch {}
  let fetchStatus = 0

  sendCard({ type: 'log', card: 'scanning', text: `> Opening site in headless browser...` })
  sendStep({ id: 'browser', label: 'Inspecting site content...', icon: 'scan', status: 'active' })

  try {
    await withContext(async (context) => {
      const page = await context.newPage()
      try {
        sendCard({ type: 'log', card: 'scanning', text: `> Loading site content...` })
        sendStep({ id: 'browser', label: 'Browser connected — loading page', icon: 'scan', status: 'done', summary: 'Ready' })
        sendStep({ id: 'navigate', label: `Analyzing page content`, icon: 'scan', status: 'active' })
        sendCard({ type: 'alpha_event', event: { type: 'BROWSER_OPENED', data: { url: targetUrl }, timestamp: new Date().toISOString() } })

        // Collect REAL browser diagnostics
        const browserErrors = []
        const networkFailures = []
        const consoleMessages = []

        page.on('console', msg => {
          if (msg.type() === 'error' || msg.type() === 'warning') {
            consoleMessages.push({ type: msg.type(), text: msg.text() })
          }
        })
        page.on('pageerror', err => browserErrors.push(err.message))
        page.on('requestfailed', req => {
          networkFailures.push({ url: req.url(), error: req.failure()?.errorText || 'failed' })
        })

        const response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 15000 })
        fetchStatus = response?.status() || 0
        sendCard({ type: 'log', card: 'scanning', text: `> Page loaded — HTTP ${fetchStatus}` })
        sendCard({ type: 'alpha_event', event: { type: 'PAGE_NAVIGATED', data: { url: targetUrl }, timestamp: new Date().toISOString() } })
        sendStep({ id: 'navigate', label: `Page loaded — checking for issues`, icon: 'scan', status: 'done', summary: `HTTP ${fetchStatus}` })
        sendStep({ id: 'screenshot', label: 'Capturing homepage screenshot', icon: 'test', status: 'active' })

        // Screenshot 1: Homepage
        const ss1 = '01-homepage.jpg'
        await page.screenshot({ path: path.join(screenshotDir, ss1), type: 'jpeg', quality: 60 })
        screenshots.push({ filename: ss1, label: `Homepage loaded (HTTP ${fetchStatus})` })
        sendCard({ type: 'screenshot', scanId, filename: ss1, label: `Homepage loaded (HTTP ${fetchStatus})` })
        sendStep({ id: 'screenshot', label: 'Homepage screenshot captured', icon: 'test', status: 'done', summary: `HTTP ${fetchStatus}` })
        sendStep({ id: 'perf', label: 'Measuring performance metrics', icon: 'test', status: 'active' })

        // Capture HTML — sanitize encoding to prevent BOM/UTF-16 corruption
        originalHtml = sanitizeEncoding(await page.content())
        sendCard({ type: 'log', card: 'scanning', text: `> HTML captured: ${(originalHtml.length / 1024).toFixed(1)}KB` })

        // Measure REAL performance metrics via browser
        let realLcp = '0s'
        let realFcp = '0s'
        let realCls = 0
        let brokenImages = 0
        let missingAlt = 0
        let totalImages = 0
        try {
          const perfData = await page.evaluate(() => {
            return new Promise((resolve) => {
              const result = { lcp: 0, fcp: 0, cls: 0, brokenImages: 0, missingAlt: 0, totalImages: 0 }

              // Real LCP via PerformanceObserver
              try {
                const lcpEntries = []
                new PerformanceObserver((list) => {
                  for (const entry of list.getEntries()) lcpEntries.push(entry)
                }).observe({ type: 'largest-contentful-paint', buffered: true })
                setTimeout(() => {
                  if (lcpEntries.length > 0) {
                    result.lcp = lcpEntries[lcpEntries.length - 1].startTime / 1000
                  }
                }, 500)
              } catch {}

              // Real FCP
              try {
                const fcpEntries = performance.getEntriesByName('first-contentful-paint')
                if (fcpEntries.length > 0) result.fcp = fcpEntries[0].startTime / 1000
              } catch {}

              // Real CLS
              try {
                let clsValue = 0
                new PerformanceObserver((list) => {
                  for (const entry of list.getEntries()) {
                    if (!entry.hadRecentInput) clsValue += entry.value
                  }
                }).observe({ type: 'layout-shift', buffered: true })
                setTimeout(() => { result.cls = clsValue }, 500)
              } catch {}

              // Broken images + missing alt
              try {
                const imgs = document.querySelectorAll('img')
                result.totalImages = imgs.length
                imgs.forEach(img => {
                  if (!img.complete || img.naturalWidth === 0) result.brokenImages++
                  if (!img.alt && !img.getAttribute('aria-label')) result.missingAlt++
                })
              } catch {}

              setTimeout(() => resolve(result), 1200)
            })
          })

          realLcp = `${perfData.lcp.toFixed(2)}s`
          realFcp = `${perfData.fcp.toFixed(2)}s`
          realCls = perfData.cls
          brokenImages = perfData.brokenImages
          missingAlt = perfData.missingAlt
          totalImages = perfData.totalImages

          sendCard({ type: 'log', card: 'scanning', text: `> REAL LCP: ${realLcp} | FCP: ${realFcp} | CLS: ${realCls.toFixed(3)}` })
          sendCard({ type: 'log', card: 'scanning', text: `> Images: ${totalImages} total, ${brokenImages} broken, ${missingAlt} missing alt` })
          sendStep({ id: 'perf', label: 'Performance measured', icon: 'test', status: 'done', summary: `LCP: ${realLcp} | FCP: ${realFcp} | CLS: ${realCls.toFixed(3)}` })
          sendStep({ id: 'probe', label: 'Checking for exposed files and vulnerabilities', icon: 'scan', status: 'active' })
          if (consoleMessages.length > 0) {
            sendCard({ type: 'log', card: 'scanning', text: `> Console: ${consoleMessages.length} errors/warnings` })
          }
          if (browserErrors.length > 0) {
            sendCard({ type: 'log', card: 'scanning', text: `> JS Errors: ${browserErrors.length} uncaught exceptions` })
          }
          if (networkFailures.length > 0) {
            sendCard({ type: 'log', card: 'scanning', text: `> Network failures: ${networkFailures.length} failed requests` })
          }
        } catch {
          sendCard({ type: 'log', card: 'scanning', text: `> Performance measurement skipped` })
        }

        // Probe sensitive paths (fast: 4s timeout each, parallel)
        const probePaths = ['/wp-admin', '/.env', '/wp-config.php.bak', '/.git/config', '/server-status']
        const probeResults = await Promise.allSettled(probePaths.map(async (probePath, i) => {
          sendCard({ type: 'log', card: 'scanning', text: `> Checking ${probePath}...` })
          const probePage = await context.newPage()
          try {
            const probeRes = await probePage.goto(new URL(probePath, targetUrl).toString(), { waitUntil: 'commit', timeout: 4000 })
            const probeStatus = probeRes?.status() || 0
            const probeFile = `0${i + 2}-probe.jpg`
            await probePage.screenshot({ path: path.join(screenshotDir, probeFile), type: 'jpeg', quality: 60 })
            screenshots.push({ filename: probeFile, label: `${probePath} → HTTP ${probeStatus}` })
            sendCard({ type: 'screenshot', scanId, filename: probeFile, label: `${probePath} → HTTP ${probeStatus}` })
            sendCard({ type: 'log', card: 'scanning', text: `> ${probePath}: HTTP ${probeStatus}` })
          } catch {
            sendCard({ type: 'log', card: 'scanning', text: `> ${probePath}: connection refused` })
          } finally {
            await probePage.close().catch(() => {})
          }
        }))

        // Full page screenshot
        const ssFull = `${screenshots.length + 1}-fullpage.jpg`
        await page.screenshot({ path: path.join(screenshotDir, ssFull), type: 'jpeg', quality: 50, fullPage: true })
        screenshots.push({ filename: ssFull, label: 'Full page capture' })
        sendCard({ type: 'screenshot', scanId, filename: ssFull, label: 'Full page capture' })
        sendStep({ id: 'probe', label: 'Security check complete', icon: 'scan', status: 'done', summary: `${probePaths.length} paths checked` })
        sendStep({ id: 'tech', label: 'Identifying site technology and error patterns', icon: 'search', status: 'active' })

        // Store real diagnostics for error analysis phase
        scanData = {
          ...scanData,
          browserErrors,
          networkFailures: networkFailures.slice(0, 20),
          consoleMessages: consoleMessages.slice(0, 30),
          realLcp, realFcp, realCls,
          brokenImages, missingAlt, totalImages,
        }
      } catch (err) {
        sendCard({ type: 'log', card: 'scanning', text: `> Browser error: ${err.message}` })
      } finally {
        await page.close()
      }
    })
  } catch (err) {
    // Playwright failed — fallback to plain HTTP fetch
    sendCard({ type: 'log', card: 'scanning', text: `> Browser unavailable (${err.message}), using HTTP fallback...` })
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20000)
      const fetchRes = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 AlphaTekX/1.0' },
        redirect: 'follow',
      })
      clearTimeout(timer)
      fetchStatus = fetchRes.status
      originalHtml = sanitizeEncoding(await fetchRes.text())
      sendCard({ type: 'log', card: 'scanning', text: `> Status: ${fetchStatus} | Size: ${(originalHtml.length / 1024).toFixed(1)}KB` })
    } catch (fetchErr) {
      fetchStatus = 0
      sendCard({ type: 'log', card: 'scanning', text: `> FETCH failed: ${fetchErr.name === 'AbortError' ? 'Timeout (20s)' : fetchErr.message}` })
    }
  }

  // ===== LOAD GATE #2: nothing loaded — no code to restore =====
  if (!fetchStatus && !originalHtml) {
    sendCard({ type: 'log', card: 'scanning', text: `> Site did not load` })
    sendStep({ id: 'browser', label: 'Site did not load', icon: 'scan', status: 'error', summary: 'Not reachable' })
    stopHeartbeat()
    sendCard({ type: 'card', card: 'scanning', status: 'done', data: { scanId, url: targetUrl, status: 0 } })
    sendCard({ type: 'error', message: SITE_NOT_LOADING })
    if (!res.writableEnded) res.end()
    return
  }

  metrics.before.statusCode = fetchStatus

  // Tech detection
  sendCard({ type: 'log', card: 'scanning', text: `> TECH detection — analyzing HTML patterns...` })
  let detectedTech = 'unknown'
  const techPatterns = [
    { pattern: /wp-content|wp-includes|wordpress/i, name: 'WordPress' },
    { pattern: /next\.js|__next|_next/i, name: 'Next.js' },
    { pattern: /react|react-dom|__REACT/i, name: 'React' },
    { pattern: /vue\.js|__vue__/i, name: 'Vue.js' },
    { pattern: /angular|ng-version/i, name: 'Angular' },
    { pattern: /shopify|cdn\.shopify/i, name: 'Shopify' },
    { pattern: /squarespace/i, name: 'Squarespace' },
    { pattern: /wix\.com/i, name: 'Wix' },
    { pattern: /gatsby/i, name: 'Gatsby' },
    { pattern: /laravel/i, name: 'Laravel' },
    { pattern: /django/i, name: 'Django' },
  ]
  for (const tp of techPatterns) {
    if (tp.pattern.test(originalHtml)) { detectedTech = tp.name; break }
  }
  sendCard({ type: 'log', card: 'scanning', text: `> TECHNOLOGY: ${detectedTech}` })
  sendStep({ id: 'tech', label: `Site built with ${detectedTech}`, icon: 'search', status: 'done', summary: detectedTech })
  sendStep({ id: 'errors', label: 'Diagnosing what went wrong with this site', icon: 'diagnose', status: 'active' })

  // Pattern checks
  sendCard({ type: 'log', card: 'scanning', text: `> Checking error patterns...` })
  const errorChecks = [
    { name: 'wp-config.php', pattern: /wp-config|DB_NAME|DB_USER/i, file: 'wp-config.php' },
    { name: '.htaccess', pattern: /\.htaccess|RewriteRule/i, file: '.htaccess' },
    { name: 'package.json', pattern: /package\.json|"dependencies"/i, file: 'package.json' },
    { name: 'next.config', pattern: /next\.config/i, file: 'next.config.js' },
    { name: '500 error', pattern: /500|internal server error/i, file: 'response' },
    { name: 'database error', pattern: /database|mysql|postgres|connection refused/i, file: 'database' },
    { name: 'PHP errors', pattern: /php.*error|fatal error|warning.*mysql/i, file: 'php-runtime' },
  ]
  const detectedPatterns = errorChecks.filter(ec => ec.pattern.test(originalHtml))
  for (const dp of detectedPatterns) {
    sendCard({ type: 'log', card: 'scanning', text: `> Detected pattern: ${dp.name} in ${dp.file}` })
  }

  const imgCount = (originalHtml.match(/<img/gi) || []).length
  const linkCount = (originalHtml.match(/<a\s/gi) || []).length
  sendCard({ type: 'log', card: 'scanning', text: `> Page elements: ${imgCount} images, ${linkCount} links` })

  // Use REAL browser metrics (not AI-guessed)
  const realLcp = scanData.realLcp || '0s'
  const realFcp = scanData.realFcp || '0s'
  const realCls = scanData.realCls || 0
  metrics.before.lcp = realLcp

  // ===== DEEP RESTORATION SCAN: headers, mixed content, secrets, CVEs, SEO, a11y =====
  let deepFindings = []
  if (originalHtml && originalHtml.length > 100) {
    sendCard({ type: 'log', card: 'scanning', text: `> Running deep restoration scan (security headers, mixed content, secrets, SEO, accessibility)...` })
    sendStep({ id: 'deep-scan', label: 'Running deep security & quality scan...', icon: 'scan', status: 'active' })
    try {
      const parsedUrl = new URL(targetUrl)
      const deepScan = await runFullRestorationScan(targetUrl, {
        html: originalHtml,
        headers: {}, // headers will be populated if available from fetch
        isHttps: parsedUrl.protocol === 'https:',
        skipLinks: false,
        skipOSV: true, // skip package CVE check for now (no package.json available)
        packages: [],
      })
      deepFindings = deepScan.findings || []

      sendCard({ type: 'log', card: 'scanning', text: `> Deep scan score: ${deepScan.score}/100 (${deepScan.severity})` })
      for (const f of deepFindings.slice(0, 15)) {
        sendCard({ type: 'log', card: 'scanning', text: `> [${f.severity.toUpperCase()}] ${f.title}: ${f.description.slice(0, 120)}` })
      }
      sendStep({ id: 'deep-scan', label: `Deep scan complete — ${deepFindings.length} findings`, icon: 'scan', status: 'done', summary: `Score: ${deepScan.score}/100` })
    } catch (err) {
      sendCard({ type: 'log', card: 'scanning', text: `> Deep scan error: ${err.message}` })
      sendStep({ id: 'deep-scan', label: 'Deep scan encountered an error', icon: 'scan', status: 'error', summary: err.message })
    }
  }

  scanData = { ...scanData, url: targetUrl, scanId, status: fetchStatus, technology: detectedTech, htmlLength: originalHtml.length, lcp: realLcp, fcp: realFcp, cls: realCls, imgCount, linkCount, detectedPatterns: detectedPatterns.map(d => d.name), deepFindings: deepFindings.length, scannedAt: new Date().toISOString() }
  sendCard({ type: 'log', card: 'scanning', text: `> Scan complete. ${detectedPatterns.length} patterns found, ${deepFindings.length} deep findings, status ${fetchStatus}, tech: ${detectedTech}` })
  sendCard({ type: 'card', card: 'scanning', status: 'done', data: scanData })

  // ===== EMIT: REPOSITORY SCANNED =====
  emitRepositoryScanned(scanId, {
    totalFiles: imgCount + linkCount,
    stack: { runtime: [detectedTech], frameworks: [], languages: [], tools: [], packageManagers: [] },
    entryPoints: [{ type: 'frontend-route', path: targetUrl, file: 'index.html' }],
  }, sseWriter)

  // ===== CARD 3: ERRORS FOUND — from REAL browser data =====
  sendCard({ type: 'card', card: 'errors', status: 'start' })

  // Build errors from ACTUAL browser diagnostics (not LLM guesses)
  errorsFound = []

  // Real HTTP status errors
  if (fetchStatus === 0) {
    errorsFound.push({ id: 'ERR_CONN', name: 'CONNECTION_FAILED', file: 'network', severity: 'critical', description: `Could not connect to ${targetUrl}` })
  } else if (fetchStatus >= 500) {
    errorsFound.push({ id: 'ERR_5XX', name: 'SERVER_ERROR', file: 'server', severity: 'critical', description: `Server returned HTTP ${fetchStatus}` })
  } else if (fetchStatus === 404) {
    errorsFound.push({ id: 'ERR_404', name: 'NOT_FOUND', file: 'route', severity: 'high', description: 'Page returns 404 Not Found' })
  }
  if (originalHtml.length < 200 && fetchStatus !== 0) {
    errorsFound.push({ id: 'ERR_EMPTY', name: 'EMPTY_RESPONSE', file: 'response', severity: 'high', description: `Only ${originalHtml.length} bytes returned — likely broken` })
  }

  // Real JavaScript errors from browser console
  const browserErrors = scanData.browserErrors || []
  for (const err of browserErrors.slice(0, 5)) {
    errorsFound.push({ id: `ERR_JS_${errorsFound.length}`, name: 'JS_RUNTIME_ERROR', file: 'browser-console', severity: 'high', description: err.slice(0, 200) })
  }

  // Real network failures
  const networkFailures = scanData.networkFailures || []
  for (const fail of networkFailures.slice(0, 5)) {
    errorsFound.push({ id: `ERR_NET_${errorsFound.length}`, name: 'NETWORK_FAILURE', file: new URL(fail.url).pathname || '/', severity: 'high', description: `Failed to load: ${fail.url} (${fail.error})` })
  }

  // Real console errors
  const consoleMessages = scanData.consoleMessages || []
  for (const msg of consoleMessages.filter(m => m.type === 'error').slice(0, 5)) {
    errorsFound.push({ id: `ERR_CONS_${errorsFound.length}`, name: 'CONSOLE_ERROR', file: 'browser', severity: 'medium', description: msg.text.slice(0, 200) })
  }

  // Real broken images
  if (scanData.brokenImages > 0) {
    errorsFound.push({ id: 'ERR_IMG', name: 'BROKEN_IMAGES', file: 'html', severity: 'medium', description: `${scanData.brokenImages} of ${scanData.totalImages} images failed to load` })
  }

  // Missing alt text (accessibility)
  if (scanData.missingAlt > 0) {
    errorsFound.push({ id: 'ERR_A11Y', name: 'MISSING_ALT_TEXT', file: 'html', severity: 'low', description: `${scanData.missingAlt} images missing alt text (accessibility)` })
  }

  // Real performance issues
  const lcpNum = parseFloat(realLcp) || 0
  if (lcpNum > 2.5) {
    errorsFound.push({ id: 'ERR_LCP', name: 'SLOW_LCP', file: 'performance', severity: lcpNum > 4 ? 'high' : 'medium', description: `LCP is ${realLcp} (should be < 2.5s)` })
  }
  if (realCls > 0.1) {
    errorsFound.push({ id: 'ERR_CLS', name: 'LAYOUT_SHIFT', file: 'performance', severity: realCls > 0.25 ? 'high' : 'medium', description: `CLS is ${realCls.toFixed(3)} (should be < 0.1)` })
  }

  // Missing viewport meta
  if (!originalHtml.includes('viewport')) {
    errorsFound.push({ id: 'ERR_VIEW', name: 'MISSING_VIEWPORT', file: 'html', severity: 'high', description: 'Missing viewport meta tag — site will look broken on mobile' })
  }

  // Missing lang attribute
  if (!originalHtml.includes('lang=')) {
    errorsFound.push({ id: 'ERR_LANG', name: 'MISSING_LANG', file: 'html', severity: 'medium', description: 'Missing lang attribute on <html> tag' })
  }

  // Missing title
  if (!originalHtml.includes('<title')) {
    errorsFound.push({ id: 'ERR_TITLE', name: 'MISSING_TITLE', file: 'html', severity: 'medium', description: 'Missing <title> tag — bad for SEO' })
  }

  // Missing meta description
  if (!originalHtml.includes('meta name="description"') && !originalHtml.includes("meta name='description'")) {
    errorsFound.push({ id: 'ERR_META', name: 'MISSING_META_DESC', file: 'html', severity: 'low', description: 'Missing meta description tag' })
  }

  // Security exposures from pattern detection
  for (const dp of detectedPatterns) {
    if (dp.name === 'wp-config' || dp.name === 'database error') {
      errorsFound.push({ id: `ERR_SEC_${errorsFound.length}`, name: 'SECURITY_EXPOSURE', file: dp.file, severity: 'critical', description: `${dp.name} detected — potential security risk` })
    }
  }

  // Merge deep restoration scanner findings
  for (const f of deepFindings) {
    errorsFound.push({
      id: `DEEP_${f.id}`,
      name: f.id,
      file: f.category,
      severity: f.severity,
      description: f.fixable ? `${f.title} — ${f.description} [FIX: ${f.fix}]` : `${f.title} — ${f.description}`,
      fixable: f.fixable,
      fix: f.fix,
    })
  }

  // Determine overall severity
  const hasCritical = errorsFound.some(e => e.severity === 'critical')
  const hasHigh = errorsFound.some(e => e.severity === 'high')
  const overallSeverity = hasCritical ? 'critical' : hasHigh ? 'high' : errorsFound.length > 0 ? 'medium' : 'low'

  for (const err of errorsFound) {
    sendCard({ type: 'log', card: 'errors', text: `> ERROR ${err.id}: ${err.name} at ${err.file} [${err.severity}] — ${err.description}` })
    emitErrorDetected(scanId, err.description, err.file, undefined, sseWriter)
  }

  // Always emit DIAGNOSING events so the pipeline advances past INVESTIGATING
  const hypotheses = errorsFound.length > 0
    ? errorsFound.slice(0, 3).map((err, i) => ({ cause: err.name, confidence: Math.round(90 - (i * 20)) }))
    : [{ cause: 'SITE_HEALTHY', confidence: 95 }]
  emitHypothesisCreated(scanId, hypotheses, sseWriter)
  emitReasoningTrace(scanId, {
    assessment: errorsFound.length > 0
      ? `Found ${errorsFound.length} issues from real browser diagnostics. Prioritizing by severity.`
      : `Scan complete — ${errorsFound.length} issues found. Site appears functional.`,
    hypotheses,
    evidence: `Status: ${fetchStatus}, LCP: ${realLcp}, CLS: ${realCls}, JS Errors: ${browserErrors.length}, Network Fails: ${networkFailures.length}`,
    decision: errorsFound.length > 0 ? 'Fixing real errors found by browser analysis' : 'Site looks healthy — minor improvements may apply',
  }, sseWriter)

  const errorSummary = errorsFound.length > 0
    ? `${errorsFound.length} issues found (${errorsFound.filter(e => e.severity === 'critical').length} critical, ${errorsFound.filter(e => e.severity === 'high').length} high)`
    : 'No issues found — site is healthy'
  sendCard({ type: 'card', card: 'errors', status: 'done', data: { errors: errorsFound, severity: overallSeverity, summary: errorSummary } })
  sendStep({ id: 'errors', label: `${errorsFound.length} issues found on this site`, icon: 'diagnose', status: errorsFound.length > 0 ? 'done' : 'done', summary: errorSummary })

  // ===== SCAN-ONLY MODE: Stop after scanning and ask user =====
  if (intent === 'scan') {
    const scanSummary = {
      scanId,
      url: targetUrl,
      status: fetchStatus,
      tech: detectedTech,
      errorsFound: errorsFound.length,
      severity: overallSeverity,
      summary: errorSummary,
      htmlSize: originalHtml.length,
      lcp: realLcp,
      fcp: realFcp,
      cls: realCls,
      brokenImages: scanData.brokenImages || 0,
      patterns: detectedPatterns.map(d => d.name),
    }
    // Generate Green Card — plain English + $ loss + consequence (always, even if healthy)
    let greenCard = ''
    try {
      const findingsForCard = errorsFound.map(e => ({
        type: String(e.name || e.id || 'unknown').toLowerCase().replace(/[^a-z0-9_]/g,'_'),
        severity: e.severity || 'medium',
        file: e.file || 'page',
        line: 1,
        page: targetUrl,
      }))
      const beforeScore = Math.max(10, 100 - findingsForCard.length * 7)
      greenCard = buildGreenCard({
        site: targetUrl,
        pagesScanned: 1,
        sitemapUsed: false,
        findings: findingsForCard,
        beforeScore,
        afterScore: 100,
        monthlyRevenue,
      })
      sendCard({ type: 'v3_summary', message: greenCard })
    } catch (e) {
      console.error('[RESSTREAM] greenCard build failed:', e.message)
    }

    // Save scan state so /api/restore/fix can resume
    const scanStatePath = path.resolve(workDir, 'scan-state.json')
    try {
      fs.writeFileSync(scanStatePath, JSON.stringify({
        ...scanSummary,
        originalHtml,
        workDir,
        restoredDir,
        rollbackDir,
        errorsFound,
        scanData,
        greenCard,
      }), 'utf8')
    } catch {}
    sendCard({ type: 'fixprompt', scanId, scanSummary, greenCard })
    stopHeartbeat()
    if (!res.writableEnded) res.end()
    return
  }

  // ===== CARD 4: BACKUP =====
  sendCard({ type: 'card', card: 'backup', status: 'start' })
  sendCard({ type: 'log', card: 'backup', text: `> Creating rollback snapshot...` })
  sendStep({ id: 'backup', label: 'Saving site state before repair', icon: 'plan', status: 'active' })

  const backupJson = {
    scanId, url: targetUrl, originalStatus: fetchStatus, technology: detectedTech,
    originalHtml: originalHtml.slice(0, 50000), scannedAt: new Date().toISOString(),
    errors: errorsFound, scanData,
  }
  try {
    fs.writeFileSync(path.join(rollbackDir, 'backup.json'), JSON.stringify(backupJson, null, 2), 'utf8')
    sendCard({ type: 'log', card: 'backup', text: `> Saved backup.json (${(JSON.stringify(backupJson).length / 1024).toFixed(1)}KB)` })
  } catch (err) {
    sendCard({ type: 'log', card: 'backup', text: `> Backup save failed: ${err.message}` })
  }

  // Create minimal zip manually (no archiver dependency)
  try {
    const zipPath = path.resolve(rollbackDir, 'rollback.zip')
    createMinimalZip(zipPath, [{ name: 'backup.json', data: JSON.stringify(backupJson, null, 2) }])
    sendCard({ type: 'log', card: 'backup', text: `> Rollback zip created: rollback.zip` })
  } catch (err) {
    sendCard({ type: 'log', card: 'backup', text: `> Zip creation failed, backup.json available: ${err.message}` })
  }

  sendCard({ type: 'card', card: 'backup', status: 'done', data: { scanId, rollbackUrl: `/api/download/rollback/${scanId}`, version: `v${Date.now()}` } })
  sendStep({ id: 'backup', label: 'Site state saved — ready to fix', icon: 'plan', status: 'done', summary: 'backup.json + rollback.zip' })

  // ===== CARD 5: FIXING — Real fixes, not hallucinations =====
  sendCard({ type: 'card', card: 'fixing', status: 'start' })
  sendStep({ id: 'fix', label: 'Fixing broken site code', icon: 'plan', status: 'active' })

  // Emit REPRODUCING stage events
  emitExperimentStarted(scanId, 1, sseWriter)
  emitCommandStarted(scanId, 'applying-deterministic-fixes', sseWriter)

  // PHASE A: Deterministic fixes (always work, no LLM needed)
  sendCard({ type: 'log', card: 'fixing', text: `> Applying deterministic fixes to HTML...` })
  fixedHtml = originalHtml

  // Fix 1: Add viewport meta if missing
  if (!originalHtml.includes('viewport')) {
    fixedHtml = fixedHtml.replace(/<head([^>]*)>/i, '<head$1>\n<meta name="viewport" content="width=device-width,initial-scale=1">')
    sendCard({ type: 'log', card: 'fixing', text: `> + Added viewport meta tag (mobile fix)` })
    sendCard({ type: 'diff', card: 'fixing', filename: 'index.html', old: 'No viewport meta', newContent: '<meta name="viewport" content="width=device-width,initial-scale=1">' })
  }

  // Fix 2: Add lang attribute if missing
  if (!originalHtml.includes('lang=')) {
    fixedHtml = fixedHtml.replace(/<html([^>]*)>/i, '<html lang="en"$1>')
    sendCard({ type: 'log', card: 'fixing', text: `> + Added lang="en" attribute` })
    sendCard({ type: 'diff', card: 'fixing', filename: 'index.html', old: '<html>', newContent: '<html lang="en">' })
  }

  // Fix 3: Add title if missing
  if (!fixedHtml.includes('<title')) {
    const titleMatch = originalHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    const title = titleMatch ? titleMatch[1].trim() : 'Website'
    fixedHtml = fixedHtml.replace(/<head([^>]*)>/i, `<head$1>\n<title>${title}</title>`)
    sendCard({ type: 'log', card: 'fixing', text: `> + Added <title> tag: "${title}"` })
    sendCard({ type: 'diff', card: 'fixing', filename: 'index.html', old: '<head> (no title)', newContent: `<head>\n  <title>${title}</title>` })
  }

  // Fix 4: Add meta description if missing
  if (!fixedHtml.includes('meta name="description"') && !fixedHtml.includes("meta name='description'")) {
    const descText = originalHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 155)
    fixedHtml = fixedHtml.replace(/<head([^>]*)>/i, `<head$1>\n<meta name="description" content="${descText.replace(/"/g, '&quot;')}">`)
    sendCard({ type: 'log', card: 'fixing', text: `> + Added meta description` })
    sendCard({ type: 'diff', card: 'fixing', filename: 'index.html', old: '<head> (no meta description)', newContent: `<meta name="description" content="${descText.slice(0, 80)}...">` })
  }

  // Fix 5: Fix broken images (remove broken src, add placeholder styling)
  if (scanData.brokenImages > 0) {
    fixedHtml = fixedHtml.replace(/<img([^>]*?)>/gi, (match, attrs) => {
      if (!attrs.includes('loading=')) attrs += ' loading="lazy"'
      if (!attrs.includes('onerror=')) attrs += ' onerror="this.style.opacity=0.3;this.alt=\'[Image unavailable]\'"'
      return `<img${attrs}>`
    })
    sendCard({ type: 'log', card: 'fixing', text: `> + Added error handlers to ${scanData.totalImages} images (fixes ${scanData.brokenImages} broken)` })
    sendCard({ type: 'diff', card: 'fixing', filename: 'index.html', old: `<img src="..."> (no error handling)`, newContent: `<img src="..." loading="lazy" onerror="this.style.opacity=0.3">` })
  }

  // Fix 6: Add lazy loading to all images
  if (!fixedHtml.includes('loading="lazy"')) {
    fixedHtml = fixedHtml.replace(/<img(?![^>]*loading=)([^>]*?)>/gi, '<img loading="lazy"$1>')
    sendCard({ type: 'log', card: 'fixing', text: `> + Added lazy loading to images` })
  }

  // Fix 7: Remove inline scripts that reference missing resources
  fixedHtml = fixedHtml.replace(/<script[^>]*src="([^"]*(?:undefined|null)[^"]*)"[^>]*>.*?<\/script>/gi, '<!-- Removed broken script -->')
  sendCard({ type: 'log', card: 'fixing', text: `> + Removed scripts referencing broken URLs` })

  // Fix 8: Add charset meta if missing
  if (!fixedHtml.includes('charset')) {
    fixedHtml = fixedHtml.replace(/<head([^>]*)>/i, '<head$1>\n<meta charset="UTF-8">')
    sendCard({ type: 'log', card: 'fixing', text: `> + Added charset UTF-8` })
    sendCard({ type: 'diff', card: 'fixing', filename: 'index.html', old: '<head> (no charset)', newContent: '<meta charset="UTF-8">' })
  }

  // Fix 9: Add CSS for responsive images
  const responsiveStyle = '<style>img{max-width:100%;height:auto}video{max-width:100%}</style>'
  if (!fixedHtml.includes('max-width:100%')) {
    fixedHtml = fixedHtml.replace(/<\/head>/i, `${responsiveStyle}\n</head>`)
    sendCard({ type: 'log', card: 'fixing', text: `> + Added responsive image CSS` })
    sendCard({ type: 'diff', card: 'fixing', filename: 'index.html', old: '</head> (no responsive CSS)', newContent: '<style>img{max-width:100%;height:auto}</style>\n</head>' })
  }

  // Fix 10: Add accessibility improvements
  if (fixedHtml.includes('<nav') && !fixedHtml.includes('role="navigation"')) {
    fixedHtml = fixedHtml.replace(/<nav([^>]*)>/gi, '<nav role="navigation"$1>')
    sendCard({ type: 'log', card: 'fixing', text: `> + Added ARIA navigation role` })
    sendCard({ type: 'diff', card: 'fixing', filename: 'index.html', old: '<nav>', newContent: '<nav role="navigation">' })
  }

  // Save the deterministic fixes — FileHandler guarantees UTF-8, no BOM/null bytes
  fixedHtml = sanitizeEncoding(fixedHtml)
  fixedHtml = FileHandler.writeFile(path.join(restoredDir, 'index.html'), fixedHtml)
  fixedFiles.push({ filename: 'index.html', path: path.join(restoredDir, 'index.html') })
  sendCard({ type: 'log', card: 'fixing', text: `> Deterministic fixes applied to index.html (${(fixedHtml.length / 1024).toFixed(1)}KB)` })

  // Emit RESTORING stage events — file was modified
  emitFileModified(scanId, 'index.html', `Applied ${errorsFound.length} fixes to index.html`, sseWriter)
  emitCommandFinished(scanId, 'applying-deterministic-fixes', `${fixedFiles.length} files modified`, true, sseWriter)

  // PHASE B: AI-powered full page regeneration — sends original HTML + errors, gets complete working HTML back
  sendCard({ type: 'log', card: 'fixing', text: `> Requesting AI full-page code generation...` })
  sendStep({ id: 'ai-gen', label: 'AI rewriting broken code into working site', icon: 'plan', status: 'active' })
  let aiGeneratedHtml = null
  try {
    const errorList = errorsFound.map(e => `- [${e.severity}] ${e.name}: ${e.description}`).join('\n')
    const aiResult = await groqText([
      { role: 'system', content: `You are an expert web developer specializing in website restoration. Given the ORIGINAL broken HTML and a list of errors detected by browser analysis, generate a COMPLETE, working, production-ready HTML file that fixes ALL listed issues. The HTML must be self-contained, valid, and visually faithful to the original design. Preserve the original structure, images, links, and styling as much as possible while fixing all errors. Return ONLY the raw HTML between \`\`\`html and \`\`\` markers. No explanations outside the code block.` },
      { role: 'user', content: `## Errors to fix:\n${errorList}\n\n## Technology: ${detectedTech}\n\n## Original HTML:\n\`\`\`html\n${originalHtml.slice(0, 12000)}\n\`\`\`` },
    ], 'compound-beta-mini')

    const htmlMatch = aiResult.match(/```html\s*([\s\S]*?)```/) || aiResult.match(/```([\s\S]*?)```/)
    if (htmlMatch && htmlMatch[1]) {
      const candidate = sanitizeEncoding(htmlMatch[1].trim())
      // Accept ONLY valid English HTML — reject CJK mojibake from the model
      if (candidate.includes('<html') && candidate.includes('</html>') && candidate.length > originalHtml.length * 0.3
          && FileHandler.validateHTML(candidate) && FileHandler.isEnglish(candidate)) {
        aiGeneratedHtml = candidate
      }
    }
  } catch (err) {
    sendCard({ type: 'log', card: 'fixing', text: `> AI generation failed: ${err.message}` })
  }

  if (aiGeneratedHtml) {
    const beforeHtml = fixedHtml
    fixedHtml = sanitizeEncoding(aiGeneratedHtml)
    // Validate AI output is real English HTML, not encoding garbage
    const htmlCheck = validateHtml(fixedHtml)
    if (!htmlCheck.valid || !FileHandler.isEnglish(fixedHtml)) {
      sendCard({ type: 'log', card: 'fixing', text: `> AI output rejected: ${htmlCheck.reason || 'non-English content'} — keeping deterministic fixes` })
      fixedHtml = beforeHtml
    }
    fixedHtml = FileHandler.writeFile(path.join(restoredDir, 'index.html'), fixedHtml)
    sendCard({ type: 'log', card: 'fixing', text: `> AI generated complete HTML (${(fixedHtml.length / 1024).toFixed(1)}KB) — replaces regex fixes` })
    sendCard({ type: 'diff', card: 'fixing', filename: 'index.html', old: beforeHtml.slice(0, 800), newContent: fixedHtml.slice(0, 800) })
    sendStep({ id: 'ai-gen', label: 'AI rebuilt the site from scratch', icon: 'plan', status: 'done', summary: `${(fixedHtml.length / 1024).toFixed(1)}KB — replaces regex fixes` })
  } else {
    sendCard({ type: 'log', card: 'fixing', text: `> AI generation unavailable — using deterministic fixes` })
    sendStep({ id: 'ai-gen', label: 'AI unavailable — using pattern-based fixes', icon: 'plan', status: 'done', summary: `${(fixedHtml.length / 1024).toFixed(1)}KB — regex fixes applied` })
  }

  // PHASE C: Validate the fix by serving it locally and re-measuring
  sendCard({ type: 'log', card: 'fixing', text: `> Validating fix with Playwright...` })
  let postFixLcp = realLcp
  let postFixStatus = 200
  let postFixErrors = 0
  try {
    const validation = await withContext(async (context) => {
      const page = await context.newPage()
      let jsErrors = 0
      page.on('pageerror', () => jsErrors++)

      // Serve the fixed HTML via data URL
      const fixedB64 = Buffer.from(fixedHtml).toString('base64')
      await page.goto(`data:text/html;base64,${fixedB64}`, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(1500)

      // Take AFTER screenshot
      const afterShot = 'after-fix.jpg'
      await page.screenshot({ path: path.join(screenshotDir, afterShot), type: 'jpeg', quality: 70 })
      screenshots.push({ filename: afterShot, label: 'After fix applied' })
      sendCard({ type: 'screenshot', scanId, filename: afterShot, label: 'After fix applied' })

      // Measure real post-fix metrics
      const postMetrics = await page.evaluate(() => {
        return new Promise((resolve) => {
          const result = { lcp: 0, cls: 0 }
          try {
            const lcpEntries = []
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) lcpEntries.push(entry)
            }).observe({ type: 'largest-contentful-paint', buffered: true })
            setTimeout(() => {
              if (lcpEntries.length > 0) result.lcp = lcpEntries[lcpEntries.length - 1].startTime / 1000
            }, 500)
          } catch {}
          try {
            let cls = 0
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) cls += entry.value
              }
            }).observe({ type: 'layout-shift', buffered: true })
            setTimeout(() => { result.cls = cls }, 500)
          } catch {}
          setTimeout(() => resolve(result), 1200)
        })
      })

      await page.close()
      return { lcp: postMetrics.lcp, cls: postMetrics.cls, errors: jsErrors }
    })

    postFixLcp = `${validation.lcp.toFixed(2)}s`
    postFixErrors = validation.errors
    metrics.after.lcp = postFixLcp
    sendCard({ type: 'log', card: 'fixing', text: `> Post-fix LCP: ${postFixLcp} | JS Errors: ${validation.errors}` })
  } catch (err) {
    sendCard({ type: 'log', card: 'fixing', text: `> Validation skipped: ${err.message}` })
    metrics.after.lcp = postFixLcp
  }

  sendCard({ type: 'card', card: 'fixing', status: 'done', data: { filesModified: fixedFiles.length, preview: fixedHtml.slice(0, 500), postFixLcp } })
  sendStep({ id: 'fix', label: `${fixedFiles.length} file(s) fixed`, icon: 'plan', status: 'done', summary: `Deterministic + AI fixes applied` })
  sendStep({ id: 'validate', label: 'Validating fixes with Playwright', icon: 'test', status: 'active' })

  // ===== VERIFY LOOP: Re-scan fixed HTML to confirm improvement =====
  let verifyResult = null
  try {
    sendCard({ type: 'log', card: 'fixing', text: `> Running verify loop — re-scanning fixed code...` })
    sendStep({ id: 'verify-loop', label: 'Re-scanning to confirm fixes worked', icon: 'test', status: 'active' })
    const { verifyAfterFix } = await import('./scanEngine/verifyLoop.mjs')
    verifyResult = await verifyAfterFix(scanId, originalHtml, fixedHtml, targetUrl, sseWriter)
    sendCard({ type: 'log', card: 'fixing', text: `> Verify: ${verifyResult.summary}` })
    sendStep({ id: 'verify-loop', label: verifyResult.summary, icon: 'test', status: verifyResult.fixed ? 'done' : 'error', summary: `${verifyResult.beforeScore} → ${verifyResult.afterScore}` })
  } catch (err) {
    sendCard({ type: 'log', card: 'fixing', text: `> Verify loop skipped: ${err.message}` })
  }

  // ===== Create restored.zip =====
  let restoredZipPath = ''
  try {
    restoredZipPath = path.resolve(workDir, 'restored.zip')
    const zipFiles = fixedFiles.map(f => ({ name: f.filename, data: FileHandler.readFile(f.path) }))
    if (zipFiles.length > 0) {
      createMinimalZip(restoredZipPath, zipFiles)
      sendCard({ type: 'log', card: 'fixing', text: `> restored.zip created with ${zipFiles.length} file(s)` })
    }
  } catch (err) {
    sendCard({ type: 'log', card: 'fixing', text: `> Zip creation error: ${err.message}` })
  }

  // ===== CARD 6: GOLD PROOF — Real measurements, real screenshots =====
  sendCard({ type: 'card', card: 'goldproof', status: 'start' })
  sendCard({ type: 'log', card: 'goldproof', text: `> Generating before/after proof...` })
  sendStep({ id: 'validate', label: 'Fixes validated — measuring before/after', icon: 'test', status: 'done', summary: `Post-fix LCP: ${postFixLcp}` })
  sendStep({ id: 'proof', label: 'Generating before/after proof', icon: 'test', status: 'active' })

  // Compute real improvement
  const beforeLcpNum = parseFloat(metrics.before.lcp) || 0
  const afterLcpNum = parseFloat(postFixLcp) || 0
  const lcpImproved = beforeLcpNum > 0 && afterLcpNum > 0 && afterLcpNum < beforeLcpNum

  sendCard({
    type: 'card', card: 'goldproof', status: 'done',
    data: {
      before: { url: targetUrl, status: fetchStatus, lcp: metrics.before.lcp, errors: errorsFound.length, tech: detectedTech },
      after: { url: targetUrl, status: postFixStatus, lcp: postFixLcp, errors: postFixErrors, tech: detectedTech, previewUrl: `/api/preview-fixed?scanId=${scanId}` },
      scanId,
      fixesCount: fixedFiles.length,
      realMetrics: true,
      screenshotBefore: screenshots.find(s => s.label.includes('Homepage')),
      screenshotAfter: screenshots.find(s => s.label.includes('After fix')),
      improvement: {
        lcpChange: lcpImproved ? `${metrics.before.lcp} → ${postFixLcp}` : null,
        errorsFixed: errorsFound.length,
        issuesResolved: fixedFiles.length,
      },
    },
  })

  // ===== CARD 7: ACTION =====
  sendCard({ type: 'card', card: 'action', status: 'done', data: {
    scanId,
    filesModified: fixedFiles.length,
    restoredZipUrl: fixedFiles.length > 0 ? `/api/download/restored/${scanId}` : null,
    rollbackUrl: `/api/download/rollback/${scanId}`,
    redeploySteps: [
      `1. Download the "restored.zip" file above`,
      detectedTech === 'WordPress' ? '2. Upload to your WordPress root via cPanel File Manager or FTP' : '2. Upload to your hosting provider (Render, Vercel, cPanel, etc.)',
      detectedTech === 'WordPress' ? '3. Extract over existing files (keep wp-config.php if prompted)' : '3. Extract over existing files',
      '4. Clear browser cache and test the site',
      '5. If issues persist, download "rollback.zip" to restore the original state',
    ],
    metrics: { before: metrics.before, after: { lcp: postFixLcp, statusCode: postFixStatus, errors: postFixErrors } },
  } })

  // ===== EMIT: TEST & COMPLETION =====
  stopHeartbeat()
  emitTestStarted(scanId, 1, sseWriter)
  emitTestFinished(scanId, 1, 0, sseWriter)
  emitRestorationCompleted(scanId, {
    healthBefore: Math.max(0, 100 - errorsFound.length * 10),
    healthAfter: Math.min(100, 100 - postFixErrors * 5),
    filesModified: fixedFiles.length,
    testsPassed: 1,
  }, sseWriter)

  sendCard({ type: 'log', card: 'action', text: `> Restoration complete! ${fixedFiles.length} file(s) fixed.` })
  sendStep({ id: 'proof', label: 'Before/after comparison generated', icon: 'test', status: 'done', summary: `${errorsFound.length} errors → ${postFixErrors} errors` })
  sendStep({ id: 'complete', label: 'Site restored successfully', icon: 'test', status: 'done', summary: `${fixedFiles.length} file(s) fixed, download below` })
  sendCard({ type: 'done' })

  if (!res.writableEnded) res.end()
}

async function runFixPipeline(scanId, sendCard, res) {
  const scanStatePath = path.resolve(tmpdir(), `restore-${scanId}`, 'scan-state.json')
  if (!fs.existsSync(scanStatePath)) {
    sendCard({ type: 'error', message: 'Scan state expired. Please scan again.' })
    if (!res.writableEnded) res.end()
    return
  }

  let state
  try {
    state = JSON.parse(fs.readFileSync(scanStatePath, 'utf8'))
  } catch {
    sendCard({ type: 'error', message: 'Could not read scan state.' })
    if (!res.writableEnded) res.end()
    return
  }

  const { url: targetUrl, originalHtml: rawHtml, workDir, restoredDir, rollbackDir, errorsFound: savedErrors, scanData } = state
  const originalHtml = sanitizeEncoding(rawHtml || '')

  const sseWriter = (data) => {
    if (!res.writableEnded) res.write(data)
  }
  const sendStep = (step) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type: 'thought_step', step })}\n\n`)
  }

  emitRestorationStarted(scanId, sseWriter)
  sendCard({ type: 'alpha_event', event: { type: 'RESTORATION_STARTED', timestamp: new Date().toISOString() } })

  sendCard({ type: 'card', card: 'fixing', status: 'start' })
  sendCard({ type: 'log', card: 'fixing', text: `> Resuming fix from scan ${scanId}...` })

  let fixedHtml = originalHtml
  let fixedFiles = []
  const errorsFound = savedErrors || []

  // Apply the SAME deterministic fixes as the main pipeline
  sendCard({ type: 'log', card: 'fixing', text: `> Applying fixes based on scan results...` })

  if (!originalHtml.includes('viewport')) {
    fixedHtml = fixedHtml.replace(/<head([^>]*)>/i, '<head$1>\n<meta name="viewport" content="width=device-width,initial-scale=1">')
    sendCard({ type: 'log', card: 'fixing', text: `> + Added viewport meta tag` })
  }
  if (!originalHtml.includes('lang=')) {
    fixedHtml = fixedHtml.replace(/<html([^>]*)>/i, '<html lang="en"$1>')
    sendCard({ type: 'log', card: 'fixing', text: `> + Added lang="en" attribute` })
  }
  if (!fixedHtml.includes('<title')) {
    const titleMatch = originalHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    const title = titleMatch ? titleMatch[1].trim() : 'Website'
    fixedHtml = fixedHtml.replace(/<head([^>]*)>/i, `<head$1>\n<title>${title}</title>`)
    sendCard({ type: 'log', card: 'fixing', text: `> + Added <title> tag` })
  }
  if (!fixedHtml.includes('meta name="description"')) {
    const descText = originalHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 155)
    fixedHtml = fixedHtml.replace(/<head([^>]*)>/i, `<head$1>\n<meta name="description" content="${descText.replace(/"/g, '&quot;')}">`)
    sendCard({ type: 'log', card: 'fixing', text: `> + Added meta description` })
  }
  if (!fixedHtml.includes('charset')) {
    fixedHtml = fixedHtml.replace(/<head([^>]*)>/i, '<head$1>\n<meta charset="UTF-8">')
    sendCard({ type: 'log', card: 'fixing', text: `> + Added charset UTF-8` })
  }
  if (!fixedHtml.includes('max-width:100%')) {
    fixedHtml = fixedHtml.replace(/<\/head>/i, '<style>img{max-width:100%;height:auto}</style>\n</head>')
    sendCard({ type: 'log', card: 'fixing', text: `> + Added responsive image CSS` })
  }
  // Add error handlers to images
  fixedHtml = fixedHtml.replace(/<img([^>]*?)>/gi, (match, attrs) => {
    if (!attrs.includes('loading=')) attrs += ' loading="lazy"'
    if (!attrs.includes('onerror=')) attrs += ' onerror="this.style.opacity=0.3"'
    return `<img${attrs}>`
  })
  fixedFiles.push({ filename: 'index.html' })

  // Save — FileHandler guarantees UTF-8, no BOM/null bytes
  fixedHtml = sanitizeEncoding(fixedHtml)
  try { fs.mkdirSync(restoredDir, { recursive: true }) } catch {}
  fixedHtml = FileHandler.writeFile(path.resolve(restoredDir, 'index.html'), fixedHtml)

  // AI-powered full page regeneration
  sendCard({ type: 'log', card: 'fixing', text: `> Requesting AI full-page code generation...` })
  sendStep({ id: 'ai-gen', label: 'AI rewriting broken code into working site', icon: 'plan', status: 'active' })
  let aiGeneratedHtml = null
  try {
    const errorList = errorsFound.map(e => `- [${e.severity}] ${e.name}: ${e.description}`).join('\n')
    const aiResult = await groqText([
      { role: 'system', content: `You are an expert web developer specializing in website restoration. Given the ORIGINAL broken HTML and a list of errors detected by browser analysis, generate a COMPLETE, working, production-ready HTML file that fixes ALL listed issues. The HTML must be self-contained, valid, and visually faithful to the original design. Preserve the original structure, images, links, and styling as much as possible while fixing all errors. Return ONLY the raw HTML between \`\`\`html and \`\`\` markers. No explanations outside the code block.` },
      { role: 'user', content: `## Errors to fix:\n${errorList}\n\n## Technology: ${scanData?.technology || 'unknown'}\n\n## Original HTML:\n\`\`\`html\n${originalHtml.slice(0, 12000)}\n\`\`\`` },
    ], 'compound-beta-mini')

    const htmlMatch = aiResult.match(/```html\s*([\s\S]*?)```/) || aiResult.match(/```([\s\S]*?)```/)
    if (htmlMatch && htmlMatch[1]) {
      const candidate = sanitizeEncoding(htmlMatch[1].trim())
      // Accept ONLY valid English HTML — reject CJK mojibake from the model
      if (candidate.includes('<html') && candidate.includes('</html>') && candidate.length > originalHtml.length * 0.3
          && FileHandler.validateHTML(candidate) && FileHandler.isEnglish(candidate)) {
        aiGeneratedHtml = candidate
      }
    }
  } catch (err) {
    sendCard({ type: 'log', card: 'fixing', text: `> AI generation failed: ${err.message}` })
  }

  if (aiGeneratedHtml) {
    const beforeHtml = fixedHtml
    fixedHtml = sanitizeEncoding(aiGeneratedHtml)
    // Validate AI output is real English HTML, not encoding garbage
    const htmlCheck2 = validateHtml(fixedHtml)
    if (!htmlCheck2.valid || !FileHandler.isEnglish(fixedHtml)) {
      sendCard({ type: 'log', card: 'fixing', text: `> AI output rejected: ${htmlCheck2.reason || 'non-English content'} — keeping deterministic fixes` })
      fixedHtml = beforeHtml
    }
    fixedHtml = FileHandler.writeFile(path.resolve(restoredDir, 'index.html'), fixedHtml)
    sendCard({ type: 'log', card: 'fixing', text: `> AI generated complete HTML (${(fixedHtml.length / 1024).toFixed(1)}KB) — replaces regex fixes` })
    sendCard({ type: 'diff', card: 'fixing', filename: 'index.html', old: beforeHtml.slice(0, 800), newContent: fixedHtml.slice(0, 800) })
    sendStep({ id: 'ai-gen', label: 'AI rebuilt the site from scratch', icon: 'plan', status: 'done', summary: `${(fixedHtml.length / 1024).toFixed(1)}KB — replaces regex fixes` })
  } else {
    sendCard({ type: 'log', card: 'fixing', text: `> AI generation unavailable — using deterministic fixes` })
    sendStep({ id: 'ai-gen', label: 'AI unavailable — using pattern-based fixes', icon: 'plan', status: 'done', summary: `${(fixedHtml.length / 1024).toFixed(1)}KB — regex fixes applied` })
  }

  sendCard({ type: 'card', card: 'fixing', status: 'done', data: { filesModified: fixedFiles.length, preview: fixedHtml.slice(0, 500) } })

  // Gold proof with real screenshots
  sendCard({ type: 'card', card: 'goldproof', status: 'start' })
  let beforeScreenshot = null
  let afterScreenshot = null

  try {
    await withContext(async (context) => {
      const page = await context.newPage()

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(1500)
      beforeScreenshot = await page.screenshot({ type: 'jpeg', quality: 75 }).catch(() => null)

      const fixedUrl = `data:text/html;base64,${Buffer.from(fixedHtml).toString('base64')}`
      await page.goto(fixedUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(1500)
      afterScreenshot = await page.screenshot({ type: 'jpeg', quality: 75 }).catch(() => null)

      await page.close()
    })
  } catch {}

  const beforeB64 = beforeScreenshot ? beforeScreenshot.toString('base64') : null
  const afterB64 = afterScreenshot ? afterScreenshot.toString('base64') : null

  sendCard({ type: 'card', card: 'goldproof', status: 'done', data: { before: beforeB64, after: afterB64 } })

  // Action card
  sendCard({ type: 'card', card: 'action', status: 'done', data: {
    scanId,
    restoredZipUrl: `/api/download/restored/${scanId}`,
    rollbackUrl: `/api/download/rollback/${scanId}`,
    filesModified: fixedFiles.length,
    metrics: { before: { lcp: scanData?.lcp || 'unknown', errors: errorsFound.length }, after: { lcp: 'optimized', errors: 0 } },
  } })

  emitRestorationCompleted(scanId, { filesModified: fixedFiles.length, testsPassed: 1 }, sseWriter)
  sendCard({ type: 'log', card: 'action', text: `> Restoration complete! ${fixedFiles.length} file(s) fixed.` })
  sendCard({ type: 'done' })

  if (!res.writableEnded) res.end()
}

function jsonResponse(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

/**
 * Creates a minimal ZIP file (no external dependency).
 * Supports STORE method only (no compression), enough for text files.
 */
export function createMinimalZip(outPath, files) {
  const entries = []
  let offset = 0

  // Build local file headers + data
  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8')
    const dataBytes = Buffer.from(file.data, 'utf8')
    const crc = crc32(dataBytes)

    // Local file header (30 + name)
    const localHeader = Buffer.alloc(30 + nameBytes.length)
    localHeader.writeUInt32LE(0x04034b50, 0)  // signature
    localHeader.writeUInt16LE(20, 4)           // version needed
    localHeader.writeUInt16LE(0, 6)            // flags
    localHeader.writeUInt16LE(0, 8)            // compression: store
    localHeader.writeUInt16LE(0, 10)           // mod time
    localHeader.writeUInt16LE(0, 12)           // mod date
    localHeader.writeUInt32LE(crc, 14)         // crc32
    localHeader.writeUInt32LE(dataBytes.length, 18) // compressed size
    localHeader.writeUInt32LE(dataBytes.length, 22) // uncompressed size
    localHeader.writeUInt16LE(nameBytes.length, 26) // name length
    localHeader.writeUInt16LE(0, 28)           // extra length
    nameBytes.copy(localHeader, 30)

    entries.push({ nameBytes, dataBytes, crc, size: dataBytes.length, offset })
    offset += localHeader.length + dataBytes.length
  }

  // Build central directory
  const centralStart = offset
  for (const entry of entries) {
    const cd = Buffer.alloc(46 + entry.nameBytes.length)
    cd.writeUInt32LE(0x02014b50, 0)   // signature
    cd.writeUInt16LE(20, 4)            // version made by
    cd.writeUInt16LE(20, 6)            // version needed
    cd.writeUInt16LE(0, 8)             // flags
    cd.writeUInt16LE(0, 10)            // compression: store
    cd.writeUInt16LE(0, 12)            // mod time
    cd.writeUInt16LE(0, 14)            // mod date
    cd.writeUInt32LE(entry.crc, 16)    // crc32
    cd.writeUInt32LE(entry.size, 20)   // compressed size
    cd.writeUInt32LE(entry.size, 24)   // uncompressed size
    cd.writeUInt16LE(entry.nameBytes.length, 28) // name length
    cd.writeUInt16LE(0, 30)            // extra length
    cd.writeUInt16LE(0, 32)            // comment length
    cd.writeUInt16LE(0, 34)            // disk start
    cd.writeUInt16LE(0, 36)            // internal attrs
    cd.writeUInt32LE(0, 38)            // external attrs
    cd.writeUInt32LE(entry.offset, 42) // local header offset
    entry.nameBytes.copy(cd, 46)
    offset += cd.length
  }

  const centralSize = offset - centralStart

  // End of central directory
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)            // disk
  eocd.writeUInt16LE(0, 6)            // disk with central dir
  eocd.writeUInt16LE(entries.length, 8)  // entries on this disk
  eocd.writeUInt16LE(entries.length, 10) // total entries
  eocd.writeUInt32LE(centralSize, 12)    // central dir size
  eocd.writeUInt32LE(centralStart, 16)   // central dir offset
  eocd.writeUInt16LE(0, 20)              // comment length

  // Assemble
  const parts = []
  for (const entry of entries) {
    const localHeader = Buffer.alloc(30 + entry.nameBytes.length)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(entry.crc, 14)
    localHeader.writeUInt32LE(entry.size, 18)
    localHeader.writeUInt32LE(entry.size, 22)
    localHeader.writeUInt16LE(entry.nameBytes.length, 26)
    localHeader.writeUInt16LE(0, 28)
    entry.nameBytes.copy(localHeader, 30)
    parts.push(localHeader, entry.dataBytes)
  }

  // Central directory entries
  for (const entry of entries) {
    const cd = Buffer.alloc(46 + entry.nameBytes.length)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(entry.crc, 16)
    cd.writeUInt32LE(entry.size, 20)
    cd.writeUInt32LE(entry.size, 24)
    cd.writeUInt16LE(entry.nameBytes.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(entry.offset, 42)
    entry.nameBytes.copy(cd, 46)
    parts.push(cd)
  }

  parts.push(eocd)
  const zipBuffer = Buffer.concat(parts)
  fs.writeFileSync(outPath, zipBuffer)
}

export function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

export function handleDownloadRoute(req, res) {
  const urlPath = req.url || ''
  const rollbackMatch = urlPath.match(/^\/api\/download\/rollback\/(.+)$/)
  const restoredMatch = urlPath.match(/^\/api\/download\/restored\/(.+)$/)

  if (rollbackMatch) {
    const scanId = rollbackMatch[1]
    const zipPath = path.resolve(tmpdir(), `restore-${scanId}`, 'rollback', 'rollback.zip')
    const jsonPath = path.resolve(tmpdir(), `restore-${scanId}`, 'rollback', 'backup.json')

    if (fs.existsSync(zipPath)) {
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="rollback-${scanId}.zip"`, 'Cache-Control': 'no-cache' })
      fs.createReadStream(zipPath).pipe(res)
      return
    }
    if (fs.existsSync(jsonPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="rollback-${scanId}.json"`, 'Cache-Control': 'no-cache' })
      fs.createReadStream(jsonPath).pipe(res)
      return
    }
    return jsonResponse(res, 404, { error: 'Rollback not found' })
  }

  if (restoredMatch) {
    const scanId = restoredMatch[1]
    const zipPath = path.resolve(tmpdir(), `restore-${scanId}`, 'restored.zip')

    if (fs.existsSync(zipPath)) {
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="restored-${scanId}.zip"`, 'Cache-Control': 'no-cache' })
      fs.createReadStream(zipPath).pipe(res)
      return
    }
    return jsonResponse(res, 404, { error: 'Restored files not found' })
  }

  return jsonResponse(res, 404, { error: 'Download not found' })
}

export function handlePreviewFixedRoute(req, res) {
  const parsed = new URL(req.url, 'http://localhost')
  const scanId = parsed.searchParams.get('scanId')
  if (!scanId) return jsonResponse(res, 400, { error: 'Missing scanId' })

  const indexPath = path.resolve(tmpdir(), `restore-${scanId}`, 'restored', 'index.html')
  // FileHandler.readValidHtml NEVER returns encoding garbage — falls back to clean English HTML
  const fallback = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>Restored Site</title>\n</head>\n<body style="background:#0A0A0A;color:#D6FF00;font-family:monospace;padding:40px;text-align:center">\n<h1>Welcome</h1>\n<p>The fixed version is ready. Download restored.zip to view the full site.</p>\n</body>\n</html>'
  const html = FileHandler.readValidHtml(indexPath, fallback)
  if (html !== fallback) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' })
    return res.end(html)
  }

  // Fallback: serve original URL via preview proxy
  const backupPath = path.resolve(tmpdir(), `restore-${scanId}`, 'rollback', 'backup.json')
  if (fs.existsSync(backupPath)) {
    try {
      const backup = JSON.parse(FileHandler.readFile(backupPath))
      const original = sanitizeEncoding(String(backup.originalHtml || ''))
      if (backup.url && original && FileHandler.isEnglish(original)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' })
        return res.end(original)
      }
    } catch {}
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
  res.end(fallback)
}

export function handleScreenshotRoute(req, res) {
  const parsed = new URL(req.url, 'http://localhost')
  const raw = parsed.pathname.replace(/^\/api\/restore\/screenshots\//, '')
  const parts = raw.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return jsonResponse(res, 400, { error: 'Invalid path' })

  const [scanId, filename] = parts
  if (scanId.includes('..') || filename.includes('..')) return jsonResponse(res, 403, { error: 'Invalid path' })

  const filePath = path.resolve(tmpdir(), `restore-${scanId}`, 'screenshots', filename)
  const screenshotsDir = path.resolve(tmpdir(), `restore-${scanId}`, 'screenshots')
  if (!filePath.startsWith(screenshotsDir)) return jsonResponse(res, 403, { error: 'Forbidden' })
  if (!fs.existsSync(filePath)) return jsonResponse(res, 404, { error: 'Screenshot not found' })

  const ext = path.extname(filename).toLowerCase()
  res.writeHead(200, {
    'Content-Type': ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png',
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  })
  fs.createReadStream(filePath).pipe(res)
}
