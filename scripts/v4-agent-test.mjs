#!/usr/bin/env node
/**
 * ALPHATEKX V4 AGENT TEST — proves the restoration agent's new intelligence.
 *
 * Boots a deliberately broken fixture site + a healthy one, then drives the
 * REAL pipeline over SSE (LLM keys forced off to prove graceful degradation):
 *
 *   Broken fixture: inline script that throws, 404 stylesheet, 404 script,
 *   404 image, near-empty body (blank render) → expects runtime_error,
 *   failed_asset, blank_render findings, multi-cycle loop, and a restored.html
 *   with the crashing code neutralized / dead references stripped.
 *
 *   Healthy fixture → expects zero-issue fast path still works end-to-end.
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { rmSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PORT = 3998
const FIXTURE_PORT = 4599

let passed = 0
let failed = 0
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.error(`✖ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
const BROKEN_HTML = `<!doctype html>
<html><head>
<title>Broken Shop</title>
<link rel="stylesheet" href="/missing-styles.css">
<script src="/missing-analytics.js"></script>
</head>
<body>
<header><h1>Shop</h1></header>
<nav><a href="/about">About</a> · <a href="/pricing">Pricing</a></nav>
<main id="app"></main>
<img src="/missing-hero.png" alt="hero">
<script>
  // Simulates a real crash: undefined function called at load.
  initCarouselThatDoesNotExist({ autoplay: true });
</script>
</body></html>`

const HEALTHY_HTML = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Clean Site</title><meta name="description" content="A clean site.">
<style>body{font-family:sans-serif;color:#222;margin:2rem}h1{color:#123456}</style>
</head><body><h1>Welcome to the clean site</h1>
<p>This page is perfectly healthy and has plenty of visible text so the blank-render detector stays quiet. It talks about services, pricing, and contact details at length.</p>
<a href="/about">About us</a>
</body></html>`

function innerPage(title) {
  return `<!doctype html>
<html><head>
<title>${title}</title>
<link rel="stylesheet" href="/missing-styles.css">
<script src="/missing-analytics.js"></script>
</head>
<body>
<header><h1>${title}</h1></header>
<p>Readable content for ${title} so blank-render detection stays honest.</p>
<nav><a href="/broken">Home</a></nav>
<main id="app"></main>
<script>
  initCarouselThatDoesNotExist({ page: '${title}' });
</script>
</body></html>`
}

const fixture = createServer((req, res) => {
  const path = new URL(req.url || '/', 'http://x').pathname
  const send = (status, body, type = 'text/html; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type })
    res.end(body)
  }
  if (path === '/broken') return send(200, BROKEN_HTML)
  if (path === '/healthy') return send(200, HEALTHY_HTML)
  if (path === '/about') return send(200, innerPage('About Us'))
  if (path === '/pricing') return send(200, innerPage('Pricing'))
  if (path === '/sitemap.xml') {
    return send(200, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>http://127.0.0.1:${FIXTURE_PORT}/broken</loc></url>
<url><loc>http://127.0.0.1:${FIXTURE_PORT}/about</loc></url>
<url><loc>http://127.0.0.1:${FIXTURE_PORT}/pricing</loc></url>
</urlset>`, 'application/xml')
  }
  return send(404, 'not found', 'text/plain')
})

// ─── SSE pipeline driver ──────────────────────────────────────────────────────
async function runPipeline(targetUrl, mode = 'full', pages = 0) {
  // This suite tests the restoration engine, not billing quotas — reset the
  // free-trial counters before each run so full/whole-site runs aren't 402'd.
  try { rmSync(join(root, 'data', 'user-restore-quotas.json'), { force: true }) } catch {}
  const events = []
  const pagesParam = pages > 0 ? `&pages=${pages}` : ''
  const response = await fetch(`http://127.0.0.1:${PORT}/api/restore/v3?url=${encodeURIComponent(targetUrl)}&mode=${mode}${pagesParam}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try { events.push(JSON.parse(line.slice(6))) } catch {}
      }
    }
  }
  return events
}

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'development',
    ALPHATEKX_DISABLE_RENDER_PROBE: process.env.ALPHATEKX_DISABLE_RENDER_PROBE || '',
    GROQ_API_KEY: '',
    GROQ_API_KEY_1: '',
    GROQ_API_KEY_2: '',
    GROQ_API_KEY_3: '',
    GROQ_API_KEY_4: '',
    OPENAI_API_KEY: '',
    SUPABASE_URL: '',
    VITE_SUPABASE_URL: '',
    SUPABASE_SERVICE_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let bootLog = ''
child.stdout.on('data', d => { bootLog += d })
child.stderr.on('data', d => { bootLog += d })

try {
  // Start the broken-site fixture on its own port
  await new Promise(resolve => fixture.listen(FIXTURE_PORT, '127.0.0.1', resolve))
  const brokenUrl = `http://127.0.0.1:${FIXTURE_PORT}/broken`
  const healthyUrl = `http://127.0.0.1:${FIXTURE_PORT}/healthy`
  const fixtureUp = await fetch(brokenUrl).then(r => r.ok).catch(() => false)
  check('fixture serving', fixtureUp)

  // Wait for server
  let up = false
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise(r => setTimeout(r, 400))
    up = await fetch(`http://127.0.0.1:${PORT}/api/health`).then(r => r.ok).catch(() => false)
  }
  check('server booted', up)

  // ── SCAN-ONLY on broken fixture: browser-eye checks must surface ──
  const scanEvents = await runPipeline(brokenUrl, 'scan-only')
  const scanIssues = scanEvents.find(e => e.type === 'issues_found')?.data?.issues || []
  const types = new Set(scanIssues.map(i => i.type))
  check('scan-only completes', scanEvents.some(e => e.type === 'pipeline_done'))
  check('runtime_error detected', types.has('runtime_error'), JSON.stringify([...types]))
  check('blank_render detected (near-empty fixture body)', types.has('blank_render'))
  const doneSummaryScan = scanEvents.find(e => e.type === 'v3_summary')?.message || ''

  // ── FULL run on broken fixture ──
  const fullEvents = await runPipeline(brokenUrl, 'full')
  const eventTypes = fullEvents.map(e => e.type)
  const fullIssues = fullEvents.find(e => e.type === 'issues_found')?.data?.issues || []
  const fullTypes = new Set(fullIssues.map(i => i.type))
  check('full run completes without crash', eventTypes.includes('pipeline_done'), `last=${JSON.stringify(fullEvents.at(-1)).slice(0, 200)}\nboot tail: ${bootLog.slice(-300)}`)
  check('failed_asset detected', fullTypes.has('failed_asset'))
  check('runtime_error carried into full diagnosis', fullTypes.has('runtime_error'))

  // Agent loop evidence
  const verifications = fullEvents.filter(e => e.type === 'verification_complete')
  check('verification emitted', verifications.length >= 1)
  const finalVerification = verifications.find(e => e.data?.final)?.data?.verification || verifications.at(-1)?.data?.verification
  check('final verification improves or holds score', Boolean(finalVerification && Number(finalVerification.after.score) >= Number(finalVerification.before.score)), JSON.stringify(finalVerification))

  // Restored HTML quality — fetch the fixed artifact through the content route
  const restoreComplete = fullEvents.find(e => e.type === 'restore_complete')
  const restorationId = restoreComplete?.restorationId
  check('restore_complete carries deliverables', Boolean(restoreComplete?.data?.deliverables?.download?.restored))
  if (restorationId) {
    const fixedRes = await fetch(`http://127.0.0.1:${PORT}/api/restore/v3/content/${restorationId}/fixed.html?base=1`)
    const fixedHtml = await fixedRes.text()
    // The removal comment mentions the name too — assert the CALL itself is gone.
    check('crashing function call neutralized in restored HTML', !/\binitCarouselThatDoesNotExist\s*\(/.test(fixedHtml), 'crash call survived')
    check('dead stylesheet reference removed', !fixedHtml.includes('/missing-styles.css'))
    check('dead analytics script reference removed', !fixedHtml.includes('/missing-analytics.js'))
    check('document structure intact', /<html[\s>]/i.test(fixedHtml) && /<\/html>/i.test(fixedHtml))
  }

  // ── Healthy fast path ──
  const healthyEvents = await runPipeline(healthyUrl, 'scan-only')
  const healthyIssues = healthyEvents.find(e => e.type === 'issues_found')?.data?.issues || []
  check('healthy site scans clean of runtime damage', !healthyIssues.some(i => ['runtime_error', 'blank_render'].includes(i.type)), JSON.stringify(healthyIssues.map(i => i.type)))
  check('healthy scan-only summary delivered', (healthyEvents.find(e => e.type === 'v3_summary')?.message || '').length > 10)

  // ── WHOLE-SITE mode: crawl + restore every page ──
  const siteEvents = await runPipeline(brokenUrl, 'full', 5)
  const siteEventTypes = siteEvents.map(e => e.type)
  check('whole-site run completes without crash', siteEventTypes.includes('pipeline_done'), `last=${JSON.stringify(siteEvents.at(-1)).slice(0, 200)}\nboot tail: ${bootLog.slice(-700)}`)
  const crawlData = siteEvents.find(e => e.type === 'crawl_complete')?.data
  check('crawler mapped all 3 fixture pages (links + sitemap)', crawlData?.count === 3, JSON.stringify(crawlData))
  const pageResults = siteEvents.filter(e => e.type === 'page_result')
  check('page_result emitted for every page', pageResults.length === 3, `got ${pageResults.length}`)
  check('every page improved or held its score', pageResults.every(p => Number(p.data.after_score ?? -1) >= Number(p.data.before_score)), JSON.stringify(pageResults.map(p => p.data)))
  const siteComplete = siteEvents.find(e => e.type === 'restore_complete')
  check('restore_complete carries site block', siteComplete?.data?.site?.page_count === 3, JSON.stringify(siteComplete?.data?.site))
  const siteId = siteComplete?.restorationId
  if (siteId) {
    const pagesRes = await fetch(`http://127.0.0.1:${PORT}/api/restore/v3/artifact/${siteId}/pages.json`)
    const pagesMap = await pagesRes.json().catch(() => null)
    const keys = pagesMap && typeof pagesMap === 'object' ? Object.keys(pagesMap) : []
    check('pages.json artifact lists every page', keys.length === 3 && keys.includes('/broken') && keys.includes('/about') && keys.includes('/pricing'), JSON.stringify(keys))
    const aboutHtml = String(pagesMap?.['/about'] || '')
    check('internal links rewritten to relative paths', aboutHtml.includes('../broken/') && !aboutHtml.includes(`http://127.0.0.1:${FIXTURE_PORT}/broken"`), aboutHtml.slice(0, 200))
    check('crash neutralized on non-entry pages too', !/\binitCarouselThatDoesNotExist\s*\(/.test(String(pagesMap?.['/pricing'] || '')) && !/\binitCarouselThatDoesNotExist\s*\(/.test(aboutHtml))
    check('dead stylesheet stripped on every page', !aboutHtml.includes('/missing-styles.css'))
  }

  void doneSummaryScan
} finally {
  child.kill('SIGTERM')
  fixture.close()
  setTimeout(() => process.exit(failed > 0 ? 1 : 0), 250).unref()
}
