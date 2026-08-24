// restore-engine-v2-torture.mjs
// MAXIMUM-BATTERING torture proof for the Restoration Engine v2.0 (100% spec).
//
// Serves a catastrophically broken website on loopback (127.0.0.2 — outside the
// localhost mixed-content exemption), mounts the REAL v2 engine routes on a
// second server, then drives the complete session flow over HTTP:
//
//   session -> scan -> fix -> approve -> deliver(download/code) -> verify
//
// Torture inventory planted in the page (every issue class the v2 engine fixes):
//   v1 classes: BOM/null/CJK/replacement encoding, 5 leaked secrets, mixed
//     content, missing charset/viewport/title/lang/description/doctype, imgs
//     without alt, deprecated tags & attrs, unbalanced CSS braces, syntax-broken
//     inline JS, dead script/stylesheet/link/image (real HTTP 404s)
//   v2 classes: no media queries, no font stack/fallback, no hover states,
//     no smooth scroll, form without validation/status/loading state, unlabeled
//     field, unnamed button, images without lazy loading, no Open Graph,
//     no canonical, no robots meta, no favicon, no security headers,
//     nav with no mobile hamburger
//
// Also proves: the one-shot /restore endpoint, guard rails, partial approval
// honesty, and a benchmark-grade clean-site negative control (zero false
// positives on code that meets the 100% standard).
//
//   node scripts/restore-engine-v2-torture.mjs          # run the proof
//   node scripts/restore-engine-v2-torture.mjs --serve  # just browse the wreck

import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { createRestorationEngineV2 } from '../server/restorationEngineV2.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PROOF_DIR = path.join(ROOT, 'data', 'scan-proof')

const SITE_HOST = '127.0.0.2'
const SITE_PORT = Number(process.env.TORTURE_V2_SITE_PORT || 4521)
const API_HOST = '127.0.0.1'
const API_PORT = Number(process.env.TORTURE_V2_API_PORT || 4610)
const SITE_BASE = `http://${SITE_HOST}:${SITE_PORT}`
const API_BASE = `http://${API_HOST}:${API_PORT}`

const FAKE_GITHUB = `ghp_${'ZzYyXwWvUuTtSsRrQqPpOoNnMmAaBbCcDdEe'}`
const FAKE_OPENAI = `sk-${'projTORTURE000000000000000000000000'}`
const FAKE_AWS = `AKIA${'TORTURE00EXAMPL3'}`
const FAKE_SLACK = `xoxb-${'1234567890-torture'}`
const FAKE_PASSWORD = 'hunter2-torture-secret'

const CJK_MOJIBAKE = '\u4e2d\u6587\u6d4b\u8bd5\u30c7\u30fc\u30bf'
const NULL_BYTE = '\u0000'
const REPLACEMENT_CHAR = '\uFFFD'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const TINY_JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAAEAAQMBIgACEQEDEQH/xAAUAAEAAAAAAAAAAAAAAAAAAAAK/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8A/9k=',
  'base64'
)

function batteredPage() {
  const body = `<html>
<head>
  <style>
    .hero { margin: 0 auto; }
    .badge { color: crimson;
  </style>
  <link rel="stylesheet" href="${SITE_BASE}/theme-dead.css">
</head>
<body bgcolor="#ffffff">
<header>
  <nav>
    <a href="#home">Home</a>
    <a href="#services">Services</a>
    <a href="#contact">Contact</a>
  </nav>
</header>
  <h1>Bakery Delights${NULL_BYTE}</h1>
  <p>Welcome to Bakery Delights — artisan bread since 1998.</p>
  <p align="center">Visit our bakery.</p>
  <p>Order telemetry: ${CJK_MOJIBAKE}${NULL_BYTE}</p>
  <span>${REPLACEMENT_CHAR}Thanks for visiting.</span>
  <marquee>Grand Opening Week!</marquee>
  <center>Open Daily</center>
  <font size="4">Family Recipes</font>
  <table border="1"><tr><td>Mon–Sat 7am</td></tr></table>
  <script>
    function boom( {
      console.log("boom");
    }
  </script>
  <script>
    console.log("alive-inline");
  </script>
  <script src="${SITE_BASE}/assets/app-dead.js"></script>
  <script src="/assets/app-alive.js"></script>
  <script>window.CONFIG = { apiKey: "${FAKE_PASSWORD}", githubToken: "${FAKE_GITHUB}", awsKey: "${FAKE_AWS}", slackToken: "${FAKE_SLACK}", openaiKey: "${FAKE_OPENAI}" };</script>
  <img src="${SITE_BASE}/img/logo-dead.png" width="120" height="90">
  <img src="/img/banner-alive.jpg">
  <a href="${SITE_BASE}/products/discontinued">Discontinued Line</a>
  <form id="signup">
    <input type="text" placeholder="Your name">
    <input type="text">
    <input type="email" placeholder="Your email">
    <textarea placeholder="Message"></textarea>
    <button type="submit">Send</button>
  </form>
  <button class="icon-btn" id="closeX"></button>
  <footer><a href="#home">Back to top</a></footer>
</body>
</html>
`
  return '\uFEFF' + body
}

// Negative control: benchmark-grade page that already meets the v2.0 standard.
const CLEAN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Clean Control Page</title>
    <meta name="description" content="A spotless page used as the negative control." />
    <link rel="canonical" href="https://example.com/clean" />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="Clean Control Page" />
    <meta property="og:description" content="A spotless page used as the negative control." />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23000'/%3E%3C/svg%3E" />
    <style>
        html { scroll-behavior: smooth; }
        body { font-family: Arial, sans-serif; }
        .nav-links { display: flex; gap: 2rem; list-style: none; }
        .nav-links a:hover { color: #00b4db; }
        @media (max-width: 768px) {
            .nav-links { display: none; }
            .nav-links.active { display: flex; flex-direction: column; }
            .hamburger { display: flex; flex-direction: column; gap: 5px; background: transparent; border: none; }
        }
    </style>
</head>
<body>
    <header>
        <nav>
            <ul class="nav-links" id="navLinks">
                <li><a href="#home">Home</a></li>
                <li><a href="#contact">Contact</a></li>
            </ul>
            <button class="hamburger" id="hamburger" aria-label="Toggle menu" aria-expanded="false">
                <span></span><span></span><span></span>
            </button>
        </nav>
    </header>
    <section id="home"><h1>Clean Control</h1><a href="#contact" class="btn">Get started</a></section>
    <section id="contact">
        <form id="contactForm">
            <input type="text" id="name" placeholder="Your name" required aria-required="true" />
            <input type="email" id="email" placeholder="Your email" required aria-required="true" />
            <textarea id="message" placeholder="Message" required aria-required="true"></textarea>
            <button type="submit" id="submitBtn">Send</button>
        </form>
        <div id="formStatus" role="status" aria-live="polite"></div>
    </section>
    <img src="/img/logo-alive.png" alt="Control logo" loading="lazy" decoding="async">
    <script src="/assets/app-alive.js"></script>
    <script>
        document.getElementById('contactForm').addEventListener('submit', function(e) {
            e.preventDefault();
            var status = document.getElementById('formStatus');
            status.className = 'success';
            status.textContent = 'Sent';
        });
    </script>
</body>
</html>
`

const ALIVE_JS = "console.log('alive asset served');\n"

function startSiteServer() {
  const routes = {
    '/': [200, 'text/html; charset=utf-8', batteredPage()],
    '/clean': [200, 'text/html; charset=utf-8', CLEAN_PAGE],
    '/assets/app-alive.js': [200, 'application/javascript', ALIVE_JS],
    '/img/logo-alive.png': [200, 'image/png', TINY_PNG],
    '/img/banner-alive.jpg': [200, 'image/jpeg', TINY_JPG],
  }
  const server = http.createServer((req, res) => {
    const route = routes[(req.url || '/').split('?')[0]]
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }
    const [status, contentType, payload] = route
    res.writeHead(status, { 'Content-Type': contentType })
    res.end(payload)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(SITE_PORT, SITE_HOST, () => resolve(server))
  })
}

function startApiServer() {
  const engine = createRestorationEngineV2({ log: () => {} })
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
      } else {
        res.end()
      }
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(API_PORT, API_HOST, () => resolve(server))
  })
}

async function api(method, pathname, body) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function rawGet(pathname) {
  const res = await fetch(`${API_BASE}${pathname}`, { signal: AbortSignal.timeout(60_000) })
  const buf = Buffer.from(await res.arrayBuffer())
  return { status: res.status, contentType: res.headers.get('content-type') || '', buf, text: buf.toString('utf8') }
}

let failures = []
let passes = 0
function check(label, ok, detail = '') {
  if (ok) {
    passes += 1
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failures.push(label)
    console.log(`  FAIL  ${label}  ->  ${detail}`)
  }
}
function section(title) {
  console.log(`\n▶ ${title}`)
}

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/

const V1_TYPES = [
  'corrupted_encoding',
  'leaked_secret', 'leaked_secret', 'leaked_secret', 'leaked_secret', 'leaked_secret',
  'mixed_content',
  'missing_charset', 'missing_viewport', 'missing_title', 'missing_lang', 'missing_description', 'missing_doctype',
  'img_missing_alt',
  'deprecated_tag', 'deprecated_attr',
  'css_unbalanced_braces', 'inline_js_syntax',
  'broken_script', 'broken_style', 'broken_link', 'broken_image',
]
const V2_TYPES = [
  'no_media_queries', 'font_fallback_missing', 'no_hover_states', 'smooth_scroll_missing',
  'forms_missing_validation', 'inputs_missing_labels', 'buttons_missing_names', 'images_missing_lazy',
  'og_tags_missing', 'canonical_missing', 'robots_missing', 'favicon_missing', 'security_headers_missing',
  'mobile_nav_missing',
]
const EXPECTED_TYPES = [...V1_TYPES, ...V2_TYPES].sort()
const EXPECTED_SEVERITY = { critical: 8, high: 10, medium: 5, low: 13 }

async function createSession() {
  const r = await api('POST', '/api/engine/v2/session')
  assert.equal(r.status, 200, 'session creation should succeed')
  assert.ok(r.json.sessionId, 'session id returned')
  return r.json.sessionId
}

function compileAllInlineScripts(html) {
  const errors = []
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || ''
    if (/\bsrc\s*=/i.test(attrs)) continue
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)
    if (typeMatch && !/javascript|module/i.test(typeMatch[1])) continue
    let body = (m[2] || '').trim()
    if (!body) continue
    if (/^\s*(import|export)\b/m.test(body)) continue
    try {
      new vm.Script(body, { filename: 'restored-inline.js' })
    } catch (err) {
      errors.push(err.message)
    }
  }
  return errors
}

async function fullRestoreSuite() {
  section('FULL RESTORATION — maximum battering across every v2.0 category')

  const sessionId = await createSession()
  const scanRes = await api('POST', '/api/engine/v2/scan', { sessionId, url: `${SITE_BASE}/` })
  check('scan http 200', scanRes.status === 200, `status=${scanRes.status}`)
  if (scanRes.status !== 200) return

  const foundCount = scanRes.json.summary?.issues_found ?? 0
  check(`all ${EXPECTED_TYPES.length} planted issues detected`, foundCount === EXPECTED_TYPES.length, `found=${foundCount} expected=${EXPECTED_TYPES.length}`)
  const stateAfterScan = await api('GET', `/api/engine/v2/state?sessionId=${sessionId}`)
  const types = (stateAfterScan.json.findings || []).map((f) => f.type).sort()
  check('finding types match torture inventory exactly', JSON.stringify(types) === JSON.stringify(EXPECTED_TYPES), types.join(','))
  const sev = scanRes.json.summary?.severity || {}
  check('severity report matches diagnosis', JSON.stringify(sev) === JSON.stringify(EXPECTED_SEVERITY), `got=${JSON.stringify(sev)} want=${JSON.stringify(EXPECTED_SEVERITY)}`)
  check('before score bottoms out at 0', scanRes.json.summary?.before_score === 0, String(scanRes.json.summary?.before_score))

  // ── Deliverable 2: log of all findings before fixing ──
  const findingsLogged = (stateAfterScan.json.findings || []).length === foundCount
    && (stateAfterScan.json.findings || []).every((f) => f.id && f.type && f.severity && f.description)
  check('analysis phase logged complete findings (id/type/severity/description)', findingsLogged)

  const fixRes = await api('POST', '/api/engine/v2/fix', { sessionId })
  check('fix generation 200', fixRes.status === 200, `status=${fixRes.status}`)
  check(`one fix per finding (${EXPECTED_TYPES.length})`, new RegExp(`${EXPECTED_TYPES.length} fixes generated`).test(fixRes.json.message || ''), fixRes.json.message)

  const approveRes = await api('POST', '/api/engine/v2/approve', { sessionId, approved: true })
  check('approve applies all fixes to RESTORATION_COMPLETE', approveRes.status === 200 && approveRes.json.state === 'RESTORATION_COMPLETE', `status=${approveRes.status} state=${approveRes.json.state}`)
  check(`summary counts ${EXPECTED_TYPES.length} fixed`, approveRes.json.summary?.issues_fixed === EXPECTED_TYPES.length, String(approveRes.json.summary?.issues_fixed))
  check('rescan after fixes is clean: unresolved empty', Array.isArray(approveRes.json.unresolved) && approveRes.json.unresolved.length === 0, JSON.stringify(approveRes.json.unresolved))
  check('improvements reported', Array.isArray(approveRes.json.improvements) && approveRes.json.improvements.length >= 5, JSON.stringify((approveRes.json.improvements || []).map((i) => i.type)))

  const code = await rawGet(`/api/engine/v2/code?sessionId=${sessionId}`)
  check('fixed code served as UTF-8 text', code.status === 200 && /charset=utf-8/.test(code.contentType), code.contentType)
  const html = code.text

  // ── HTML integrity ──
  check('BOM stripped', html.charCodeAt(0) !== 0xFEFF)
  check('null bytes stripped', !html.includes(NULL_BYTE))
  check('replacement chars stripped', !html.includes(REPLACEMENT_CHAR))
  check('CJK mojibake repaired', !CJK_RE.test(html))
  check('doctype prepended', /^<!DOCTYPE html>/i.test(html.trim()))
  check('lang attribute added', /<html[^>]*\blang\s*=/i.test(html))

  // ── Secrets & mixed content ──
  for (const [label, secret] of [['github token', FAKE_GITHUB], ['openai key', FAKE_OPENAI], ['aws key', FAKE_AWS], ['slack token', FAKE_SLACK], ['password', FAKE_PASSWORD]]) {
    check(`${label} fully redacted`, !html.includes(secret))
  }
  check('insecure http:// references gone', !html.includes(`http://${SITE_HOST}`))

  // ── Assets: placeholders instead of deletions ──
  for (const dead of ['app-dead.js', 'theme-dead.css', 'products/discontinued']) {
    check(`dead resource "${dead}" excised`, !html.includes(dead))
  }
  check('dead image replaced with working SVG placeholder', !html.includes('logo-dead.png') && html.includes('data:image/svg+xml') && html.includes('Image%20unavailable'), '')
  const placeholderSrc = (html.match(/src="(data:image\/svg\+xml[^"]+)"/) || [])[1] || ''
  let decodedPlaceholder = ''
  try { decodedPlaceholder = decodeURIComponent(placeholderSrc) } catch {}
  check('placeholder keeps original dimensions', decodedPlaceholder.includes("width='120'") && decodedPlaceholder.includes("height='90'"), `decoded=${decodedPlaceholder.slice(0, 80)}`)
  check('alive script untouched', html.includes('/assets/app-alive.js'))
  check('alive image untouched + upgraded', /<img[^>]*src="\/img\/banner-alive\.jpg"[^>]*>/i.test(html))

  // ── Checklist: fonts ──
  const styleCss = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
  check('font fallback defined (sans-serif generic in stack)', /font-family:[^;"}]*(Segoe UI|system-ui)[^;"}]*sans-serif/.test(styleCss), '')

  // ── Checklist: responsiveness ──
  check('tablet breakpoint present (@media 768px)', /@media\s*\(max-width:\s*768px\)/i.test(styleCss))
  check('mobile breakpoint present (@media 480px)', /@media\s*\(max-width:\s*480px\)/i.test(styleCss))
  check('grid/flex stacks on mobile (display:block override)', /display:block !important/.test(styleCss))
  check('fluid media rule present', /img,video,canvas,iframe,svg\{max-width:100%;height:auto;\}/.test(styleCss.replace(/\s+/g, '')) || /max-width:100%;height:auto/.test(styleCss.replace(/\s+/g, '')))

  // ── Checklist: hamburger menu ──
  const hamburgerTag = /<button[^>]*id="atk-hamburger"[^>]*>([\s\S]*?)<\/button>/i.exec(html)
  check('hamburger injected with 3 lines', Boolean(hamburgerTag) && (hamburgerTag[1].match(/<span><\/span>/gi) || []).length === 3)
  check('hamburger ARIA-labelled + expanded state', /id="atk-hamburger"[^>]*aria-label="Toggle navigation menu"/i.test(html) && /aria-expanded="false"/i.test(hamburgerTag?.[0] || ''))
  check('hamburger click handler wired', /getElementById\("atk-hamburger"\)/.test(html) && /classList\.toggle\("atk-open"\)/.test(html))
  check('menu closes on link click', /querySelectorAll\("a"\)/.test(html) && /remove\("atk-open"\)/.test(html))

  // ── Checklist: smooth scrolling + hover polish ──
  check('smooth scrolling enabled', /scroll-behavior:smooth/.test(styleCss.replace(/\s+/g, '')))
  check(':hover effects added', /:hover/.test(styleCss))
  check('transitions added for interactivity', /transition:/.test(styleCss))

  // ── Checklist: form validation, status styling, loading state ──
  const requiredCount = (html.match(/required aria-required="true"/gi) || []).length
  check('all fillable fields marked required + aria-required', requiredCount >= 4, `${requiredCount} fields`)
  check('client-side email validation present', /valid email address/.test(html) && /\[\\s@\]/.test(html))
  check('status region with role=status + aria-live', /role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"/.test(html))
  check('success state styled green', /\.atk-status\.success\{color:#0a7e3c;background:#e6f9ed;\}/.test(styleCss.replace(/\s+/g, '')))
  check('error state styled red', /\.atk-status\.error\{color:#b91c1c;background:#fde8e8;\}/.test(styleCss.replace(/\s+/g, '')))
  check('loading state on submit (disabled + Sending...)', /btn\.disabled=true/.test(html) && /Sending\.\.\./.test(html))
  check('form resets after success', /form\.reset\(\)/.test(html))

  // ── Checklist: accessibility ──
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
  check('every <img> carries an alt attribute', imgTags.length > 0 && imgTags.every((t) => /\balt\s*=/i.test(t)), `${imgTags.length} imgs`)
  check('previously-unlabeled field gained aria-label', /aria-label="(Input field|[A-Z])[^"]*">/i.test(html))
  check('unnamed icon button gained aria-label', /<button[^>]*aria-label="closex"/i.test(html))
  const lazyCount = imgTags.filter((t) => /\bloading="lazy"/i.test(t)).length
  check('every image lazy-loads', imgTags.length > 0 && lazyCount === imgTags.length, `${lazyCount}/${imgTags.length}`)

  // ── Checklist: SEO pack ──
  check('title present', /<title>[^<]*\S[^<]*<\/title>/i.test(html))
  check('meta description present', /<meta[^>]+name=["']description["'][^>]+content\s*=\s*["'][^"']+\S/i.test(html))
  check('og:title present', /<meta[^>]+property=["']og:title["']/i.test(html))
  check('og:description present', /<meta[^>]+property=["']og:description["']/i.test(html))
  check('og:image present', /<meta[^>]+property=["']og:image["']/i.test(html))
  check('canonical link present', /<link[^>]+rel=["']canonical["']/i.test(html))
  check('robots meta present', /<meta[^>]+name=["']robots["'][^>]+content=["']index, follow["']/i.test(html))
  check('favicon present (inline SVG)', /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']data:image\/svg\+xml/i.test(html))

  // ── Checklist: security headers ──
  check('Content-Security-Policy header present', /<meta[^>]+http-equiv=["']Content-Security-Policy["']/i.test(html))
  check('X-Content-Type-Options header present', /<meta[^>]+http-equiv=["']X-Content-Type-Options["'][^>]+content=["']nosniff["']/i.test(html))
  check('Strict-Transport-Security header present', /<meta[^>]+http-equiv=["']Strict-Transport-Security["']/i.test(html))

  // ── Console cleanliness: every inline script compiles + rejection net ──
  const compileErrors = compileAllInlineScripts(html)
  check('zero JS syntax errors across all inline scripts', compileErrors.length === 0, compileErrors.join(' | ').slice(0, 300))
  check('unhandled promise rejection safety net installed', /addEventListener\("unhandledrejection"/.test(html))

  // ── Preservation doctrine ──
  check('surviving content preserved (welcome copy)', html.includes('Welcome to Bakery Delights'))
  check('dead link unwrapped, label kept', html.includes('Discontinued Line') && !/discontinued/i.test(html.replace(/<!--[^>]*-->/g, '')))
  check('charset meta injected', /<meta[^>]+charset/i.test(html))
  check('viewport meta injected', /<meta[^>]+name=["']viewport["']/i.test(html))
  for (const [label, marker] of [['marquee', '<marquee'], ['center', '<center'], ['font', '<font']]) {
    check(`deprecated tag <${label}> unwrapped`, !html.toLowerCase().includes(marker))
  }
  check('deprecated content preserved (marquee)', html.includes('Grand Opening Week!'))
  check('deprecated content preserved (center)', html.includes('Open Daily'))
  check('deprecated content preserved (font)', html.includes('Family Recipes'))
  let staleAttrs = 0
  for (const tag of html.match(/<[a-zA-Z][^>]*>/g) || []) {
    if (/\s(?:bgcolor|align|border)\s*=/i.test(tag)) staleAttrs += 1
  }
  check('all obsolete attributes stripped', staleAttrs === 0, `${staleAttrs} remaining`)
  const firstStyle = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || ''
  const opens = (firstStyle.match(/\{/g) || []).length
  const closes = (firstStyle.match(/\}/g) || []).length
  check('CSS braces balanced by surgery', opens > 0 && opens === closes, `opens=${opens} closes=${closes}`)
  check('existing CSS rules untouched (.hero)', /\.hero\s*\{\s*margin:\s*0 auto;\s*\}/.test(firstStyle))
  check('wounded rule still present (.badge)', firstStyle.includes('.badge') && firstStyle.includes('crimson'))
  check('broken inline script disabled', !html.includes('function boom(') && html.includes('[AlphaTekX Restore] Disabled'))
  check('healthy inline script byte-identical', html.includes('\n    console.log("alive-inline");\n  '))
  check('injected restore script tagged once', (html.match(/AlphaTekX Restoration v2\.0/g) || []).length === 1)

  // ── Delivery: ZIP contains restored site + full report ──
  await api('POST', '/api/engine/v2/delivery', { sessionId, option: 'download' })
  const zip = await rawGet(`/api/engine/v2/download?sessionId=${sessionId}`)
  check('zip served with zip mime', zip.status === 200 && zip.contentType === 'application/zip', `${zip.status} ${zip.contentType}`)
  check('zip has PK magic bytes', zip.buf.length > 100 && zip.buf[0] === 0x50 && zip.buf[1] === 0x4b, `bytes=${zip.buf.length}`)
  const archive = await JSZip.loadAsync(zip.buf)
  const names = Object.keys(archive.files).sort()
  check('zip contains index.html + report.json + README.txt', JSON.stringify(names) === JSON.stringify(['README.txt', 'index.html', 'report.json']), names.join(','))
  const zippedHtml = await archive.file('index.html').async('string')
  check('zip index.html identical to served fixed code', zippedHtml === html)
  const zippedReport = JSON.parse(await archive.file('report.json').async('string'))
  check('zip report documents findings + fixes + improvements', zippedReport.findings?.length === EXPECTED_TYPES.length && zippedReport.fixesApplied?.length === EXPECTED_TYPES.length && Array.isArray(zippedReport.improvements))

  // ── Verify loop reaches DONE with perfect score ──
  await api('POST', '/api/engine/v2/delivery', { sessionId, option: 'code' })
  await api('POST', '/api/engine/v2/action-complete', { sessionId })
  const verifyRes = await api('POST', '/api/engine/v2/verify', { sessionId })
  check('verify reaches DONE', verifyRes.json.state === 'DONE', String(verifyRes.json.state))
  check('after score perfect 100', verifyRes.json.summary?.after_score === 100, String(verifyRes.json.summary?.after_score))
  check('zero remaining issues on re-scan', verifyRes.json.verifyResult?.remainingIssues === 0, JSON.stringify(verifyRes.json.verifyResult?.remaining))
  check('utf8Clean certified', verifyRes.json.verifyResult?.utf8Clean === true)

  return { before: 0, after: 100 }
}

async function oneShotSuite() {
  section('ONE-SHOT RESTORE — paste-html mode, single call')

  const r = await api('POST', '/api/engine/v2/restore', { html: batteredPage(), baseUrl: 'https://bakery.example.com' })
  check('one-shot returns ok:true', r.status === 200 && r.json.ok === true, `status=${r.status} ok=${r.json.ok}`)
  check('one-shot finds all static issue classes', r.json.issues_found === 32, String(r.json.issues_found))
  check('one-shot fixes everything it finds', r.json.issues_fixed === r.json.issues_found, `${r.json.issues_fixed}/${r.json.issues_found}`)
  check('one-shot re-scan clean (score 100)', r.json.after_score === 100 && r.json.unresolved.length === 0, `score=${r.json.after_score}`)
  check('one-shot canonical uses provided baseUrl', /rel="canonical" href="https:\/\/bakery\.example\.com\//.test(r.json.restored_html || ''))
  const compileErrors = compileAllInlineScripts(r.json.restored_html || '')
  check('one-shot output compiles clean', compileErrors.length === 0, compileErrors.join(' | ').slice(0, 200))
}

async function partialApprovalSuite() {
  section('PARTIAL APPROVAL — disabling a fix leaves that wound open, honestly scored')

  const sessionId = await createSession()
  await api('POST', '/api/engine/v2/scan', { sessionId, url: `${SITE_BASE}/` })
  await api('POST', '/api/engine/v2/fix', { sessionId })
  const state = await api('GET', `/api/engine/v2/state?sessionId=${sessionId}`)
  const faviconFix = (state.json.fixes || []).find((f) => f.type === 'favicon_missing')
  assert.ok(faviconFix, 'favicon_missing fix exists')
  const approveRes = await api('POST', '/api/engine/v2/approve', { sessionId, approved: true, disabled: [faviconFix.findingId] })
  check('partial approve succeeds', approveRes.status === 200, `status=${approveRes.status}`)
  check('summary counts 35 fixed', approveRes.json.summary?.issues_fixed === 35, String(approveRes.json.summary?.issues_fixed))
  check('disabled favicon honestly listed unresolved', (approveRes.json.unresolved || []).some((f) => f.type === 'favicon_missing'))

  await api('POST', '/api/engine/v2/delivery', { sessionId, option: 'code' })
  await api('POST', '/api/engine/v2/action-complete', { sessionId })
  await api('POST', '/api/engine/v2/verify', { sessionId })
  const verifyStatus = await api('GET', `/api/engine/v2/verify/status?sessionId=${sessionId}`)
  const remaining = verifyStatus.json.verifyResult?.remaining || []
  check('verify reports exactly 1 remaining issue', verifyStatus.json.verifyResult?.remainingIssues === 1 && remaining[0]?.type === 'favicon_missing', JSON.stringify(remaining.map((r) => r.type)))
  check('score honestly docked to 98', verifyStatus.json.verifyResult && verifyStatus.json.summary?.after_score === 98, String(verifyStatus.json.summary?.after_score))
}

async function cleanControlSuite() {
  section('NEGATIVE CONTROL — benchmark-grade page produces zero findings')

  const sessionId = await createSession()
  const scanRes = await api('POST', '/api/engine/v2/scan', { sessionId, url: `${SITE_BASE}/clean` })
  check('clean scan finds 0 issues', scanRes.status === 200 && scanRes.json.summary?.issues_found === 0, JSON.stringify(scanRes.json.summary))
  check('clean scan keeps score at 100', scanRes.json.summary?.before_score === 100, String(scanRes.json.summary?.before_score))
  const fixRes = await api('POST', '/api/engine/v2/fix', { sessionId })
  check('fix refused with skip_to_delivery guidance', fixRes.status === 409 && fixRes.json.action_required === 'skip_to_delivery', `${fixRes.status} ${fixRes.json.action_required}`)
}

async function guardRailSuite() {
  section('GUARD RAILS — out-of-order and malformed calls are rejected cleanly')

  const fresh = await createSession()
  const earlyFix = await api('POST', '/api/engine/v2/fix', { sessionId: fresh })
  check('fix before scan -> 409 run_scan_first', earlyFix.status === 409 && earlyFix.json.action_required === 'run_scan_first', `${earlyFix.status} ${earlyFix.json.action_required}`)

  const badUrl = await createSession()
  const badScan = await api('POST', '/api/engine/v2/scan', { sessionId: badUrl, url: 'not a valid url!!' })
  check('garbage URL -> 400 enter_url', badScan.status === 400 && badScan.json.action_required === 'enter_url', `${badScan.status} ${badScan.json.action_required}`)
  const deadScan = await api('POST', '/api/engine/v2/scan', { sessionId: badUrl, url: 'http://127.0.0.1:59997/' })
  check('unreachable host -> 502 check_url', deadScan.status === 502 && deadScan.json.action_required === 'check_url', `${deadScan.status} ${deadScan.json.action_required}`)

  const missingSession = await api('POST', '/api/engine/v2/approve', { sessionId: 'does-not-exist', approved: true })
  check('unknown session -> 404 new_session', missingSession.status === 404 && missingSession.json.action_required === 'new_session', `${missingSession.status}`)

  const forced = await createSession()
  await api('POST', '/api/engine/v2/scan', { sessionId: forced, url: `${SITE_BASE}/` })
  await api('POST', '/api/engine/v2/fix', { sessionId: forced })
  const earlyDelivery = await api('POST', '/api/engine/v2/delivery', { sessionId: forced, option: 'download' })
  check('delivery before approve -> 409 apply_fixes_first', earlyDelivery.status === 409 && earlyDelivery.json.action_required === 'apply_fixes_first', `${earlyDelivery.status}`)
  await api('POST', '/api/engine/v2/approve', { sessionId: forced, approved: true })
  const badOption = await api('POST', '/api/engine/v2/delivery', { sessionId: forced, option: 'carrier-pigeon' })
  check('nonsense delivery option -> 400 choose_option', badOption.status === 400 && badOption.json.action_required === 'choose_option', `${badOption.status}`)
  const refused = await createSession()
  await api('POST', '/api/engine/v2/scan', { sessionId: refused, url: `${SITE_BASE}/` })
  await api('POST', '/api/engine/v2/fix', { sessionId: refused })
  const notApproved = await api('POST', '/api/engine/v2/approve', { sessionId: refused, approved: false })
  check('approve without explicit true -> 400', notApproved.status === 400 && notApproved.json.action_required === 'approve_fixes', `${notApproved.status}`)
}

async function main() {
  if (process.argv.includes('--serve')) {
    const server = await startSiteServer()
    console.log(`[torture-v2] battered site serving at ${SITE_BASE}/  (clean control: ${SITE_BASE}/clean)`)
    process.on('SIGINT', () => { server.close(); process.exit(0) })
    return
  }

  console.log('RESTORATION ENGINE v2.0 — TORTURE PROOF (100% restoration standard)')
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

  let full = null
  try {
    full = await fullRestoreSuite()
    await oneShotSuite()
    await partialApprovalSuite()
    await cleanControlSuite()
    await guardRailSuite()
  } catch (err) {
    failures.push(`unexpected crash: ${err.message}`)
    console.error('\nCRASH', err)
  }

  const proof = {
    engine: 'restore-engine-v2-torture',
    completedAt: new Date().toISOString(),
    fixture: { url: `${SITE_BASE}/`, cleanControl: `${SITE_BASE}/clean` },
    fullRestoration: { beforeScore: full?.before ?? null, afterScore: full?.after ?? null, findings: EXPECTED_TYPES.length },
    passed: passes,
    failed: failures.length,
  }
  try {
    fs.mkdirSync(PROOF_DIR, { recursive: true })
    const proofPath = path.join(PROOF_DIR, 'torture-proof-v2.json')
    fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2))
    console.log(`\n  Proof JSON written → ${path.relative(ROOT, proofPath)}`)
  } catch {}

  console.log('\n' + '='.repeat(72))
  if (failures.length) {
    console.log(`TORTURE RESULT: FAIL — ${failures.length} failure(s)`)
    for (const f of failures) console.log(` - ${f}`)
  } else {
    console.log(`TORTURE RESULT: PASS — ${passes} checks green. The battered site was restored to 100%.`)
  }

  site.close()
  apiServer.close()
  process.exitCode = failures.length ? 1 : 0
  process.exit(process.exitCode)
}

main().catch((err) => {
  console.error('TORTURE CRASH', err)
  process.exit(1)
})
