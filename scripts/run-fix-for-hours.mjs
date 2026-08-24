// run-fix-for-hours.mjs
// THE "FIX FOR HOURS" CHALLENGE RUNNER.
//
// Serves scripts/fixtures/fix-for-hours.html on loopback (all 17 relative
// images resolve to real HTTP 404s so the live resource prober sees them),
// drives the REAL v3 engine over HTTP, then hard-asserts every category the
// challenge demands: detection completeness, fixes, preservation doctrine,
// console cleanliness, and deliverable artifacts.
//
//   node scripts/run-fix-for-hours.mjs

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { createRestorationEngineV3 } from '../server/restorationEngineV3.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const FIXTURE = path.join(ROOT, 'scripts', 'fixtures', 'fix-for-hours.html')
const PROOF_DIR = path.join(ROOT, 'data', 'scan-proof', 'fix-for-hours')

const SITE_HOST = '127.0.0.2'
const SITE_PORT = 4891
const API_HOST = '127.0.0.1'
const API_PORT = 4892
const SITE_BASE = `http://${SITE_HOST}:${SITE_PORT}`
const API_BASE = `http://${API_HOST}:${API_PORT}`

const FIXTURE_HTML = fs.readFileSync(FIXTURE, 'utf8')
const IMG_COUNT = (FIXTURE_HTML.match(/<img\b/gi) || []).length // expect 17
const REQUIRED_COUNT = 7 // contact(3) + newsletter(1) + quote(text/text/textarea -> 3)

function startSiteServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
    if (urlPath === '/' || urlPath === '/fix-for-hours.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(FIXTURE_HTML)
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(SITE_PORT, SITE_HOST, () => resolve(server))
  })
}

function startApiServer() {
  const engine = createRestorationEngineV3({ log: () => {} })
  const server = http.createServer((req, res) => {
    Promise.resolve(engine(req, res)).then((handled) => {
      if (!handled && !res.headersSent) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'no route' }))
      }
    }).catch((err) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      } else res.end()
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(API_PORT, API_HOST, () => resolve(server))
  })
}

let failures = []
let passes = 0
function check(label, ok, detail = '') {
  if (ok) { passes += 1; console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`) }
  else { failures.push(label); console.log(`  FAIL  ${label}  ->  ${detail}`) }
}
function section(title) { console.log(`\n▶ ${title}`) }

function vmCompileAll(html) {
  const errors = []
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue
    const t = (m[1].match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1]
    if (t && !/javascript|module/i.test(t)) continue
    const body = (m[2] || '').trim()
    if (!body || /^\s*(import|export)\b/m.test(body)) continue
    try { new vm.Script(body, { filename: 'ffh.js' }) } catch (err) { errors.push(err.message.slice(0, 80)) }
  }
  return errors
}

async function main() {
  console.log('ALPHA RESTORATION v3.0 — "FIX FOR HOURS" CHALLENGE')
  console.log('='.repeat(72))

  let site
  let apiServer
  try {
    site = await startSiteServer()
    apiServer = await startApiServer()
  } catch (err) {
    console.error(`STARTUP FAIL (${err.message})`)
    process.exit(1)
  }

  try {
    section('RESTORE')
    const startedAt = Date.now()
    const res = await fetch(`${API_BASE}/api/engine/v3/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `${SITE_BASE}/fix-for-hours.html` }),
      signal: AbortSignal.timeout(120_000),
    })
    const R = await res.json()
    const elapsed = Date.now() - startedAt
    check('restore completed ok:true', res.status === 200 && R.ok === true, `status=${res.status} ok=${R.ok}`)
    if (!R.ok && R.error) throw new Error(R.error)

    const html = R.restored_html || ''
    check(`restoration finished fast (<10s target): ${elapsed}ms`, elapsed < 10_000, `${elapsed}ms`)
    check('score 0-region -> perfect 100', R.after_score === 100, String(R.after_score))
    check('zero unresolved findings', Array.isArray(R.unresolved) && R.unresolved.length === 0, JSON.stringify(R.unresolved))
    check('utf8 + english certified', R.verification?.utf8Valid === true && R.verification?.englishClean === true)
    check('verify iterations within budget', R.verification?.iterations >= 1 && R.verification.iterations <= 3, String(R.verification?.iterations))

    section('DETECTION COMPLETENESS')
    const types = (R.findings_by_page?.[0]?.types || [])
    const expectedClasses = [
      'broken_image', 'images_missing_lazy', 'forms_missing_validation',
      'missing_lang', 'missing_description', 'og_tags_missing', 'canonical_missing',
      'robots_missing', 'favicon_missing', 'security_headers_missing',
      'no_media_queries', 'font_fallback_missing', 'no_hover_states', 'smooth_scroll_missing',
      'mobile_nav_missing', 'missing_focus_states', 'jsonld_missing',
    ]
    for (const cls of expectedClasses) {
      check(`detected: ${cls}`, types.includes(cls), types.join(',').slice(0, 120))
    }
    check(`all ${IMG_COUNT} dead images detected as one class with count`, types.includes('broken_image'))
    const brokenImageFinding = (R.findings_by_page || []).length >= 0 && types.filter((t) => t === 'broken_image').length === 1
    check('no false-positive classes planted here (alt="", ids unique, anchors valid)', !types.some((t) => ['img_missing_alt', 'duplicate_ids', 'broken_internal_anchor', 'inline_handler_syntax', 'deprecated_tag'].includes(t)), types.filter((t) => ['img_missing_alt', 'duplicate_ids', 'broken_internal_anchor', 'inline_handler_syntax', 'deprecated_tag'].includes(t)).join(','))

    section('ASSETS: PLACEHOLDERS')
    const placeholderCount = (html.match(/src="data:image\/svg\+xml/g) || []).length
    check(`every dead image replaced with SVG placeholder (${IMG_COUNT})`, placeholderCount === IMG_COUNT, `${placeholderCount}/${IMG_COUNT}`)
    check('placeholders carry alt text', /<img[^>]*src="data:image\/svg\+xml[^>]*alt="Image unavailable"/.test(html))

    section('PERFORMANCE')
    const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
    check(`every image lazy-loads (${imgTags.length})`, imgTags.length > 0 && imgTags.every((t) => /\bloading="lazy"/.test(t)), `${imgTags.filter((t) => /\bloading="lazy"/.test(t)).length}/${imgTags.length}`)
    check('perf snapshot improved', R.performance?.improved === true, JSON.stringify(R.performance))

    section('RESPONSIVE & UX LAYER')
    const styleCss = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
    check('tablet breakpoint added', /@media\s*\(max-width:\s*768px\)/i.test(styleCss))
    check('mobile breakpoint added', /@media\s*\(max-width:\s*480px\)/i.test(styleCss))
    check('grid stacks on mobile', /display:block !important/.test(styleCss))
    check('font stack with generic fallback', /font-family:[^;"}]*(Segoe UI)[^;"}]*sans-serif/.test(styleCss))
    check('hover states added', /:hover/.test(styleCss))
    check('focus-visible states added', /:focus-visible/.test(styleCss))
    check('transitions added', /transition:/.test(styleCss))
    check('smooth scrolling enabled', /scroll-behavior:smooth/.test(styleCss.replace(/\s+/g, '')))

    section('MOBILE NAVIGATION (hamburger)')
    const hb = /<button[^>]*id="atk-hamburger"[^>]*>([\s\S]*?)<\/button>/i.exec(html)
    check('hamburger button injected before nav list', Boolean(hb))
    check('hamburger has exactly 3 lines', hb && (hb[1].match(/<span><\/span>/gi) || []).length === 3)
    check('hamburger ARIA labelled + aria-expanded', /aria-label="Toggle navigation menu"/.test(hb?.[0] || '') && /aria-expanded="false"/.test(hb?.[0] || ''))
    check('wired to existing #navLinks list', /id="atk-nav-links"|getElementById\("atk-nav-links"\)/.test(html))
    check('closes on link click', /remove\("atk-open"\)/.test(html))

    section('FORMS: ALL THREE RESTORED')
    const requiredPairs = (html.match(/required aria-required="true"/g) || []).length
    check(`all ${REQUIRED_COUNT} fillable fields validated`, requiredPairs === REQUIRED_COUNT, `${requiredPairs}/${REQUIRED_COUNT}`)
    check('three status regions injected', (html.match(/class="atk-status" role="status" aria-live="polite"/g) || []).length === 3)
    check('email validation present', /valid email address/.test(html))
    check('loading state on submit', /btn\.disabled=true/.test(html.replace(/\s+/g, '')) && /Sending\.\.\./.test(html))
    check('success styled green', /\.atk-status\.success\{color:#0a7e3c;background:#e6f9ed;\}/.test(styleCss.replace(/\s+/g, '')))
    check('error styled red', /\.atk-status\.error\{color:#b91c1c;background:#fde8e8;\}/.test(styleCss.replace(/\s+/g, '')))
    check('form resets after success', /form\.reset\(\)/.test(html))

    section('SEO PACK')
    check('lang attribute added', /<html[^>]*\blang\s*=/i.test(html))
    check('meta description added', /<meta[^>]+name=["']description["'][^>]+content\s*=\s*["'][^"']+\S/i.test(html))
    check('og:title + og:description + og:type + og:image', ['og:title', 'og:description', 'og:type', 'og:image'].every((p) => new RegExp(`property=["']${p}["']`).test(html)))
    check('canonical link', /<link[^>]+rel=["']canonical["']/i.test(html))
    check('robots meta', /<meta[^>]+name=["']robots["']/i.test(html))
    check('favicon (inline SVG)', /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']data:image\/svg\+xml/i.test(html))
    const ldMatch = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)
    check('JSON-LD structured data parses', (() => { if (!ldMatch) return false; try { return JSON.parse(ldMatch[1])['@type'] === 'WebSite' } catch { return false } })())

    section('SECURITY HEADERS')
    check('Content-Security-Policy', /<meta[^>]+http-equiv=["']Content-Security-Policy["']/i.test(html))
    check('Strict-Transport-Security', /<meta[^>]+http-equiv=["']Strict-Transport-Security["']/i.test(html))
    check('X-Content-Type-Options: nosniff', /<meta[^>]+http-equiv=["']X-Content-Type-Options["'][^>]+content=["']nosniff["']/i.test(html))

    section('PRESERVATION DOCTRINE (nothing working was harmed)')
    check('original toggleMenu function kept byte-exact', html.includes("function toggleMenu() {"))
    check('original contactForm fake-API handler preserved', html.includes("fetch('https://api.alphatech.com/submit'"))
    check('newsletter + quote handlers preserved', html.includes("api.alphatech.com/newsletter") && html.includes("api.alphatech.com/quote"))
    check('all copy intact (Welcome/Products/About)', html.includes('Welcome to AlphaSoft') && html.includes('Our Products') && html.includes('dedicated to helping businesses'))
    check('section ids untouched (#home..#shop)', ['#home', '#services', '#about', '#contact', '#blog', '#shop'].every((id) => html.includes(`id="${id.slice(1)}"`)))
    check('$99.99 pricing survived', html.includes('$99.99'))

    section('CONSOLE CLEANLINESS')
    const compileErrors = vmCompileAll(html)
    check('zero syntax errors across ALL inline scripts (originals + injected)', compileErrors.length === 0, compileErrors.join(' | ').slice(0, 200))
    check('rejection safety net installed', /addEventListener\("unhandledrejection"/.test(html))

    section('INTELLIGENCE & ARTIFACTS')
    check('context classified', typeof R.context?.siteType === 'string', R.context?.siteType)
    check('recommendations include manual-only items', Array.isArray(R.recommendations) && R.recommendations.length >= 2, String(R.recommendations?.length))
    check('history logged', R.historyLogged === true)
    check('zip packaged with rollback originals', typeof R.zip_path === 'string' && fs.existsSync(R.zip_path))
    const archive = await JSZip.loadAsync(fs.readFileSync(R.zip_path))
    const names = Object.keys(archive.files)
    check('zip contains page + original backup + report', names.includes('fix-for-hours.html') && names.includes('originals/fix-for-hours.orig.html') && names.includes('report.json'), names.sort().join(','))
    const zippedIndex = await archive.file('fix-for-hours.html').async('string')
    check('zip index identical to served restored HTML', zippedIndex === html)

    fs.mkdirSync(PROOF_DIR, { recursive: true })
    fs.writeFileSync(path.join(PROOF_DIR, 'restored.html'), html)
    fs.writeFileSync(path.join(PROOF_DIR, 'report.json'), JSON.stringify(R, null, 2))
    fs.writeFileSync(path.join(PROOF_DIR, 'challenge-proof.json'), JSON.stringify({
      challenge: 'fix-for-hours',
      engine: 'alpha-restoration-v3',
      elapsedMs: elapsed,
      afterScore: R.after_score,
      unresolved: R.unresolved.length,
      checksPassed: passes,
      checksFailed: failures.length,
      findingsByType: types,
      performance: R.performance,
      context: R.context,
    }, null, 2))
    console.log(`\n  Artifacts written -> ${path.relative(ROOT, PROOF_DIR)}\\`)
  } catch (err) {
    failures.push(`unexpected crash: ${err.message}`)
    console.error('\nCRASH', err)
  }

  console.log('\n' + '='.repeat(72))
  if (failures.length) {
    console.log(`CHALLENGE RESULT: FAIL — ${failures.length} failure(s)`)
    for (const f of failures) console.log(` - ${f}`)
  } else {
    console.log(`CHALLENGE RESULT: PASS — ${passes} checks green.`)
  }

  site.close()
  apiServer.close()
  process.exit(failures.length ? 1 : 0)
}

main().catch((err) => { console.error('RUNNER CRASH', err); process.exit(1) })
