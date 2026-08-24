// restore-engine-v3-suite.mjs
// REAL-WORLD SCENARIO SUITE for AlphaTekX Restoration v3.0.
//
// Emulates the spec's world-class test matrix with six served fixtures:
//   1. /shop      e-commerce: broken checkout form, dead assets, duplicate IDs,
//                 unsafe target=_blank, insecure form action, broken anchors,
//                 untitled iframe, syntax-broken onclick, no structured data,
//                 plus the full v2 battering subset (encoding-free but brutal)
//   2. /clean     benchmark-grade negative control (zero false positives)
//   3. / + /about + /contact   multi-site crawl: three linked pages, each
//                 wounded, packaged into one ZIP with originals/
//   4. /spa       hash-routed app: referenced fragments must SURVIVE while a
//                 genuinely dead fragment is unwrapped
//   5. guard rails: bad URL, unreachable host, paste-html mode
//   6. intelligence: context classification, performance snapshot, history log,
//      recommendations (robots.txt probe), health capabilities
//
//   node scripts/restore-engine-v3-suite.mjs

import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { createRestorationEngineV3 } from '../server/restorationEngineV3.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const HISTORY_FILE = path.join(ROOT, 'data', 'restoration-history.jsonl')

const SITE_HOST = '127.0.0.2'
const SITE_PORT = Number(process.env.V3_SITE_PORT || 4741)
const API_HOST = '127.0.0.1'
const API_PORT = Number(process.env.V3_API_PORT || 4751)
const SITE_BASE = `http://${SITE_HOST}:${SITE_PORT}`
const API_BASE = `http://${API_HOST}:${API_PORT}`

const FAKE_KEY = `sk-${'suiteSECRET0000000000000000000000'}`
const TINY_JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAAEAAQMBIgACEQEDEQH/xAAUAAEAAAAAAAAAAAAAAAAAAAAK/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8A/9k=',
  'base64'
)

function shopPage() {
  return `<html>
<head>
  <style>
    .card { border: 1px solid #ddd; }
    .wound { color: crimson;
  </style>
  <script src="${SITE_BASE}/assets/shop-dead.js"></script>
</head>
<body bgcolor="#ffffff">
<header>
  <nav>
    <a href="#home">Home</a>
    <a href="#cart">Cart</a>
    <a href="#old-gallery">Old Gallery</a>
  </nav>
</header>
<h1>TechMart</h1>
<p>Add to cart and checkout fast. Best prices on every product.</p>
<img src="${SITE_BASE}/img/logo-dead.png" width="100" height="80">
<img src="/img/banner-alive.jpg">
<a href="${SITE_BASE}/partner-dead">Partner</a>
<a href="${SITE_BASE}/safe-page" target="_blank">Docs</a>
<a href="${SITE_BASE}/safe-page" target="_blank" rel="noopener">API</a>
<iframe src="https://www.youtube.com/embed/xyz"></iframe>
<button onclick="checkout(( ">Buy</button>
<button onclick="trackPurchase();">Track</button>
<div id="product-card">Item A</div>
<div id="product-card">Item B</div>
<form id="pay" action="${SITE_BASE}/api/pay">
  <input type="text" placeholder="Name on card">
  <input type="email" placeholder="Your email">
  <button type="submit">Pay</button>
</form>
<script>window.CONFIG = { apiKey: "${FAKE_KEY}" };</script>
<script>
  function routeToCart() { /* cart routing lives here */ }
  console.log("shop alive");
</script>
</body>
</html>
`
}

function spaPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard App</title>
<meta name="description" content="Hash-routed app control.">
<link rel="canonical" href="${SITE_BASE}/spa">
<style>body{font-family:Arial,sans-serif;}a:hover{opacity:.8;}html{scroll-behavior:smooth;}
@media(max-width:768px){.menu{display:block;}}</style>
</head>
<body>
<nav class="menu">
  <a href="#/dashboard">Dashboard</a>
  <a href="#/reports">Reports</a>
  <a href="#ghost">Ghost</a>
</nav>
<div id="root"></div>
<img src="/img/logo-alive.png" alt="App logo" loading="lazy">
<script>
  window.addEventListener('hashchange', function(){ if(location.hash === '#/dashboard') load('dashboard'); });
  function load(page){ console.log(page); }
</script>
</body>
</html>
`
}

function simpleBrokenPage(title, backLink) {
  return `<html>
<head><style>.p{padding:1rem;}</style></head>
<body>
<h1>${title}</h1>
<p>Page body copy for ${title}.</p>
<img src="${SITE_BASE}/img/dead-${title.toLowerCase()}.png">
${backLink ? `<a href="/">Back home</a>` : ''}
</body>
</html>
`
}

// Benchmark-grade control that must produce ZERO v2+v3 findings.
function cleanPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Clean Control v3</title>
<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;">
<meta http-equiv="Strict-Transport-Security" content="max-age=31536000; includeSubDomains">
<meta http-equiv="X-Content-Type-Options" content="nosniff">
<meta name="description" content="Spotless v3-era control page.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://example.com/clean">
<meta property="og:title" content="Clean Control v3">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3C/svg%3E">
<style>
html{scroll-behavior:smooth;}
body{font-family:Arial,sans-serif;}
.nav-links{display:flex;gap:2rem;list-style:none;}
.nav-links a:hover{color:#06c;}
.nav-links a:focus-visible{outline:2px solid #005fcc;}
@media (max-width:768px){.nav-links{display:none;}.nav-links.active{display:flex;flex-direction:column;}}
@media (max-width:480px){h1{font-size:1.5rem;}}
</style>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Clean Control v3","url":"https://example.com/"}</script>
</head>
<body>
<header>
  <nav>
    <ul class="nav-links" id="navLinks">
      <li><a href="#home">Home</a></li>
      <li><a href="#contact">Contact</a></li>
    </ul>
    <button class="hamburger" id="hamburger" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button>
  </nav>
</header>
<section id="home"><h1>Home</h1><a href="#contact" class="btn">Jump</a></section>
<section id="contact">
  <form id="f">
    <input type="text" placeholder="Name" required aria-required="true">
    <textarea placeholder="Message" required aria-required="true"></textarea>
    <button type="submit">Send</button>
  </form>
  <div id="status" role="status" aria-live="polite"></div>
</section>
<a href="/safe-page" target="_blank" rel="noopener noreferrer">Docs</a>
<iframe src="/embed/player" title="Player"></iframe>
<img src="/img/logo-alive.png" alt="Logo" loading="lazy" decoding="async">
<script>
document.getElementById('f').addEventListener('submit', function(e){
  e.preventDefault();
  var s = document.getElementById('status');
  s.className = 'success';
  s.textContent = 'Sent';
});
</script>
</body>
</html>
`
}

function startSiteServer() {
  const rootPage = `<!DOCTYPE html>
<html lang="en">
<head><style>.nav{display:flex;}</style></head>
<body>
<h1>Homebase</h1>
<p>Site root copy.</p>
<img src="${SITE_BASE}/img/dead-homebase.png">
<nav class="nav"><a href="/about">About</a> <a href="/contact">Contact</a></nav>
</body>
</html>
`
  const routes = {
    '/': [200, 'text/html; charset=utf-8', rootPage],
    '/shop': [200, 'text/html; charset=utf-8', shopPage()],
    '/spa': [200, 'text/html; charset=utf-8', spaPage()],
    '/clean': [200, 'text/html; charset=utf-8', cleanPage()],
    '/about': [200, 'text/html; charset=utf-8', simpleBrokenPage('About', true)],
    '/contact': [200, 'text/html; charset=utf-8', simpleBrokenPage('Contact', true)],
    '/safe-page': [200, 'text/html; charset=utf-8', '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Safe</title></head><body>Safe target page</body></html>'],
    '/img/banner-alive.jpg': [200, 'image/jpeg', TINY_JPG],
    '/img/logo-alive.png': [200, 'image/jpeg', TINY_JPG],
    '/embed/player': [200, 'text/html; charset=utf-8', '<html><body>player</body></html>'],
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
    signal: AbortSignal.timeout(120_000),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function rawGet(pathname) {
  const res = await fetch(`${API_BASE}${pathname}`, { signal: AbortSignal.timeout(60_000) })
  const buf = Buffer.from(await res.arrayBuffer())
  return { status: res.status, contentType: res.headers.get('content-type') || '', buf }
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

const EXPECTED_V3_TYPES = [
  'duplicate_ids', 'missing_focus_states', 'noopener_missing', 'insecure_form_action',
  'broken_internal_anchor', 'iframe_missing_title', 'inline_handler_syntax', 'jsonld_missing',
]

function vmCompileAll(html) {
  const errors = []
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue
    const t = (m[1].match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1]
    if (t && !/javascript|module/i.test(t)) continue
    const body = (m[2] || '').trim()
    if (!body || /^\s*(import|export)\b/m.test(body)) continue
    try { new vm.Script(body) } catch (err) { errors.push(err.message) }
  }
  return errors
}

async function main() {
  console.log('ALPHA RESTORATION v3.0 — REAL-WORLD SCENARIO SUITE')
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
    // ── Health ──
    section('HEALTH & CAPABILITIES')
    const health = await api('GET', '/api/engine/v3/health')
    check('health responds ok', health.status === 200 && health.json.ok === true)
    check('multi-page crawl declared', health.json.capabilities?.multi_page_crawl === true)

    // ── Scenario: e-commerce mega-restore ──
    section('SCENARIO 1 — E-COMMERCE (broken checkout, deep v3 classes)')
    const historyBefore = fs.existsSync(HISTORY_FILE) ? fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean).length : 0
    const shop = await api('POST', '/api/engine/v3/restore', { url: `${SITE_BASE}/shop` })
    check('restore returns 200 ok:true', shop.status === 200 && shop.json.ok === true, `status=${shop.status} ok=${shop.json.ok}`)
    if (shop.status !== 200) throw new Error('shop restore failed')
    const R = shop.json
    check('rescan clean across v2+v3', R.verification?.rescanClean === true && R.unresolved.length === 0, JSON.stringify(R.unresolved))
    check('verify iterations within budget', R.verification?.iterations >= 1 && R.verification.iterations <= 3, String(R.verification?.iterations))
    check('utf8 + english certified', R.verification?.utf8Valid === true && R.verification?.englishClean === true)
    check('all 8 v3 issue classes detected', EXPECTED_V3_TYPES.every((t) => (R.findings_by_page?.[0]?.types || []).includes(t)), (R.findings_by_page?.[0]?.types || []).join(','))
    check('context classified as ecommerce', R.context?.siteType === 'ecommerce', R.context?.siteType)
    check('performance snapshot improved', R.performance?.improved === true && R.performance?.after?.imagesWithoutLazy === 0, JSON.stringify(R.performance))

    const html = R.restored_html || ''
    check('duplicate id collapsed to one', (html.match(/id="product-card"/g) || []).length === 1)
    check('unsafe _blank gained noopener', /target="_blank"[^>]*rel="noopener noreferrer"|rel="noopener noreferrer"[^>]*target="_blank"/.test(html))
    check('already-safe _blank untouched', /rel="noopener"/.test(html) && !/rel="noopener noreferrer noopener|noopener noreferrer[^>]*rel=/.test(html))
    check('form action upgraded to https', /action="https:\/\/127\.0\.0\.2:4741\/api\/pay"/.test(html))
    check('dead anchor unwrapped, label kept', !/href="[^"]*#old-gallery/.test(html) && html.includes('Old Gallery'))
    check('second dead anchor unwrapped', !/href="[^"]*#home["]/.test(html))
    check('script-referenced anchor preserved', /href="#cart"/.test(html))
    check('iframe gained title', /<iframe[^>]*title="[^"]+"/i.test(html))
    check('syntax-broken onclick removed', !/onclick=\s*"checkout\(\( /.test(html))
    check('healthy onclick byte-preserved', html.includes('onclick="trackPurchase();"'))
    check('JSON-LD injected and parseable', (() => { const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/); if (!m) return false; try { return JSON.parse(m[1])['@type'] === 'WebSite' } catch { return false } })())
    check('focus-visible styles added', html.includes(':focus-visible') && html.includes('outline:2px solid #005fcc'))
    check('no nested style tags', !/<style[^>]*>\s*</.test(html))
    check('v2 composition: charset + viewport + title present', /<meta[^>]+charset/i.test(html) && /name=["']viewport["']/i.test(html) && /<title>[^<]*\S/i.test(html))
    check('v2 composition: hamburger wired', /id="atk-hamburger"/.test(html) && /classList\.toggle\("atk-open"\)/.test(html))
    check('v2 composition: form validation + status UI', (html.match(/required aria-required="true"/g) || []).length >= 2 && /class="atk-status"/.test(html))
    check('v2 composition: secrets redacted', !html.includes(FAKE_KEY))
    check('v2 composition: dead resources excised', !html.includes('shop-dead.js') && !html.includes('logo-dead.png') && !html.includes('partner-dead'))
    check('v2 composition: dead image -> SVG placeholder', html.includes('data:image/svg+xml') && html.includes('Image%20unavailable'))
    check('console cleanliness: every inline script compiles', vmCompileAll(html).length === 0, vmCompileAll(html).join('|').slice(0, 200))
    check('recommendations include robots.txt advisory', Array.isArray(R.recommendations) && R.recommendations.some((r) => /robots\.txt/.test(r)), JSON.stringify(R.recommendations?.slice(0, 2)))
    check('history logged', R.historyLogged === true)
    const historyAfter = fs.existsSync(HISTORY_FILE) ? fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean).length : 0
    check('history file grew', historyAfter === historyBefore + 1, `${historyBefore} -> ${historyAfter}`)

    // ── Scenario: SPA hash routing preservation ──
    section('SCENARIO 2 — SPA HASH ROUTING (referenced fragments survive)')
    const spa = await api('POST', '/api/engine/v3/restore', { url: `${SITE_BASE}/spa` })
    check('spa restore ok', spa.status === 200 && spa.json.ok === true, JSON.stringify(spa.json.unresolved || spa.json.error))
    const spaHtml = spa.json.restored_html || ''
    check('#/dashboard route preserved', spaHtml.includes('href="#/dashboard"'))
    check('#/reports route preserved', spaHtml.includes('href="#/reports"'))
    check('dead #ghost unwrapped', !/href="#ghost"/.test(spaHtml) && spaHtml.includes('Ghost'))

    // ── Scenario: multi-page crawl ──
    section('SCENARIO 3 — MULTI-PAGE CRAWL (site-wide ZIP)')
    const mp = await api('POST', '/api/engine/v3/restore', { url: `${SITE_BASE}/`, multiPage: true, maxPages: 5 })
    check('multi-page restore ok', mp.status === 200 && mp.json.ok === true, JSON.stringify(mp.json.unresolved || mp.json.error))
    check('three pages scanned', mp.json.pagesScanned === 3, String(mp.json.pagesScanned))
    check('mode reported multi-page', mp.json.mode === 'multi-page')
    check('per-page scores perfect', (mp.json.pages_restored || []).every((p) => p.afterScore === 100), JSON.stringify(mp.json.pages_restored))
    check('zip path returned', typeof mp.json.zip_path === 'string' && fs.existsSync(mp.json.zip_path))
    const zipBuf = fs.readFileSync(mp.json.zip_path)
    const archive = await JSZip.loadAsync(zipBuf)
    const names = Object.keys(archive.files).sort()
    check('zip holds 3 pages + 3 originals + report + README', ['README.txt', 'about.html', 'contact.html', 'index.html', 'originals/about.orig.html', 'originals/contact.orig.html', 'originals/index.orig.html', 'report.json'].every((n) => names.includes(n)), names.join(','))
    const aboutRestored = await archive.file('about.html').async('string')
    check('subpage fully restored', /<meta[^>]+charset/i.test(aboutRestored) && /<title>[^<]*\S/i.test(aboutRestored) && aboutRestored.includes('data:image/svg+xml'))
    const origAbout = await archive.file('originals/about.orig.html').async('string')
    check('rollback original preserved byte-exact', origAbout === simpleBrokenPage('About', true))

    // ── Negative control ──
    section('NEGATIVE CONTROL — benchmark-grade page')
    const clean = await api('POST', '/api/engine/v3/restore', { url: `${SITE_BASE}/clean` })
    check('clean finds 0 issues', clean.status === 200 && clean.json.issues_found === 0, JSON.stringify(clean.json.findings_by_page))
    check('clean scores 100 before and after', clean.json.before_score === 100 && clean.json.after_score === 100)
    check('clean needs zero iterations', clean.json.verification?.iterations === 1)

    // ── Paste-html mode ──
    section('PASTE MODE')
    const pasted = await api('POST', '/api/engine/v3/restore', { html: '<html><head><title>x</title></head><body><a href="#nope">Dead</a><div id="d">1</div><div id="d">2</div></body></html>', baseUrl: 'https://paste.example.com' })
    check('paste mode ok', pasted.status === 200 && pasted.json.ok === true, JSON.stringify(pasted.json.error))
    const pastedHtml = pasted.json.restored_html || ''
    check('paste mode fixes dup id + anchor', (pastedHtml.match(/id="d"/g) || []).length === 1 && !/href="#nope"/.test(pastedHtml), `ids=${(pastedHtml.match(/id="d"/g) || []).length} anchorGone=${!/href="#nope"/.test(pastedHtml)}`)

    // ── Guard rails ──
    section('GUARD RAILS')
    const badUrl = await api('POST', '/api/engine/v3/restore', { url: 'not a url!!' })
    check('garbage url -> 400 enter_url', badUrl.status === 400 && badUrl.json.action_required === 'enter_url')
    const deadHost = await api('POST', '/api/engine/v3/restore', { url: 'http://127.0.0.1:59998/' })
    check('unreachable host -> 502 check_url', deadHost.status === 502 && deadHost.json.action_required === 'check_url')

    // ── History endpoint ──
    const hist = await api('GET', '/api/engine/v3/history')
    check('history endpoint serves entries', hist.status === 200 && hist.json.entries.length >= 3 && hist.json.entries.every((e) => e.ts && typeof e.issuesFound === 'number'), String(hist.json.entries?.length))
  } catch (err) {
    failures.push(`unexpected crash: ${err.message}`)
    console.error('\nCRASH', err)
  }

  console.log('\n' + '='.repeat(72))
  if (failures.length) {
    console.log(`SUITE RESULT: FAIL — ${failures.length} failure(s)`)
    for (const f of failures) console.log(` - ${f}`)
  } else {
    console.log(`SUITE RESULT: PASS — ${passes} checks green.`)
  }

  site.close()
  apiServer.close()
  process.exit(failures.length ? 1 : 0)
}

main().catch((err) => {
  console.error('SUITE CRASH', err)
  process.exit(1)
})
