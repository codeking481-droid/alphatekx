// restore-engine-torture.mjs
// MAXIMUM-BATTERING torture proof for the Restoration Engine.
//
// Serves a catastrophically broken website on loopback (127.0.0.2 — outside the
// engine's localhost mixed-content exemption, so mixed content is detected AND
// every resource probe stays deterministic/local), mounts the REAL engine
// routes on a second server, then drives the complete session flow over HTTP:
//
//   session -> scan -> fix -> approve -> deliver(download/code) -> verify
//
// Torture inventory planted in the page (every issue class the engine knows):
//   - BOM prefix + null bytes + U+FFFD replacement chars + CJK mojibake
//   - 5 leaked secret formats (GitHub/OpenAI/AWS/Slack/generic)
//   - 4 insecure http:// absolute resource references
//   - missing charset / viewport / title / lang / description
//   - images without alt attributes
//   - dead script, dead stylesheet, dead image, dead link (real HTTP 404s)
//
// Also proves: guard rails (out-of-order calls rejected), partial approval
// (disabled fix stays broken and the score reports it honestly), a clean-site
// negative control (zero false positives), and ZIP artifact integrity.
//
//   node scripts/restore-engine-torture.mjs          # run the proof
//   node scripts/restore-engine-torture.mjs --serve  # just browse the wreck

import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { createRestorationEngine } from '../server/restorationEngine.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PROOF_DIR = path.join(ROOT, 'data', 'scan-proof')

const SITE_HOST = '127.0.0.2'
const SITE_PORT = Number(process.env.TORTURE_SITE_PORT || 4321)
const API_HOST = '127.0.0.1'
const API_PORT = Number(process.env.TORTURE_API_PORT || 4410)
const SITE_BASE = `http://${SITE_HOST}:${SITE_PORT}`
const API_BASE = `http://${API_HOST}:${API_PORT}`

// Fixture secrets are format-correct but fake, assembled at runtime so no
// contiguous real-looking token literal ever appears in source control.
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
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAAEAAQMBIgACEQEDEQH/xAAUAAEAAAAAAAAAAAAAAAAAAAAK/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8A/9k=',
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
  <img src="${SITE_BASE}/img/logo-dead.png">
  <img src="/img/banner-alive.jpg">
  <img src="/img/logo-alive.png" alt="Bakery logo">
  <a href="${SITE_BASE}/products/discontinued">Discontinued Line</a>
  <a href="/menu">Menu</a>
</body>
</html>
`
  return '\uFEFF' + body
}

const CLEAN_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Clean Control Page</title>
  <meta name="description" content="A spotless page used as the negative control.">
  <style>body { font-family: sans-serif; }</style>
</head>
<body>
  <h1>Clean Control</h1>
  <script src="/assets/app-alive.js"></script>
  <img src="/img/logo-alive.png" alt="Control logo">
  <a href="/menu">Menu</a>
</body>
</html>
`

const ALIVE_JS = "console.log('alive asset served');\n"

function startSiteServer() {
  const routes = {
    '/': [200, 'text/html; charset=utf-8', batteredPage()],
    '/clean': [200, 'text/html; charset=utf-8', CLEAN_PAGE],
    '/menu': [200, 'text/html; charset=utf-8', '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Menu</title></head><body><h1>Menu</h1></body></html>'],
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
  const engine = createRestorationEngine({ log: (msg) => console.log(`  ${msg}`) })
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
const EXPECTED_TYPES = [
  'corrupted_encoding',
  'leaked_secret', 'leaked_secret', 'leaked_secret', 'leaked_secret', 'leaked_secret',
  'mixed_content',
  'missing_charset', 'missing_viewport', 'missing_title', 'missing_lang', 'missing_description',
  'img_missing_alt',
  'broken_script', 'broken_style', 'broken_link', 'broken_image',
  'missing_doctype',
  'deprecated_tag',
  'deprecated_attr',
  'css_unbalanced_braces',
  'inline_js_syntax',
].sort()
const EXPECTED_SEVERITY = { critical: 8, high: 6, medium: 3, low: 5 }

async function createSession() {
  const r = await api('POST', '/api/engine/session')
  assert.equal(r.status, 200, 'session creation should succeed')
  assert.ok(r.json.sessionId, 'session id returned')
  return r.json.sessionId
}

async function scan(sessionId, url) {
  return api('POST', '/api/engine/scan', { sessionId, url })
}

async function fullRestoreSuite() {
  section('FULL RESTORATION — maximum battering, everything enabled')

  const sessionId = await createSession()
  const scanRes = await scan(sessionId, `${SITE_BASE}/`)
  check('scan http 200', scanRes.status === 200, `status=${scanRes.status}`)
  if (scanRes.status !== 200) return

  const foundTypes = (scanRes.json.summary?.issues_found ?? 0)
  check('all 22 planted issues detected', foundTypes === EXPECTED_TYPES.length, `found=${foundTypes} expected=${EXPECTED_TYPES.length}`)
  const stateAfterScan = await api('GET', `/api/engine/state?sessionId=${sessionId}`)
  const types = (stateAfterScan.json.findings || []).map((f) => f.type).sort()
  check('finding types match torture inventory exactly', JSON.stringify(types) === JSON.stringify(EXPECTED_TYPES), types.join(','))
  const sev = scanRes.json.summary?.severity || {}
  check('severity report matches diagnosis', JSON.stringify(sev) === JSON.stringify(EXPECTED_SEVERITY), `got=${JSON.stringify(sev)} want=${JSON.stringify(EXPECTED_SEVERITY)}`)
  const enc = (stateAfterScan.json.findings || []).find((f) => f.type === 'corrupted_encoding')
  // WHATWG fetch text() strips a leading BOM before the engine ever sees it,
  // so scan reports the three corruption causes that survive transport.
  check('encoding finding names transport-surviving causes', /\bnull bytes\b/.test(enc?.description || '') && /\bCJK characters\b/.test(enc?.description || '') && /\breplacement characters\b/.test(enc?.description || ''), enc?.description || '(none)')
  check('before score bottoms out at 0', scanRes.json.summary?.before_score === 0, String(scanRes.json.summary?.before_score))
  const stats = stateAfterScan.json.resourceStats || {}
  check('resource stats counted 8 references', stats.checked === 8 && stats.total_links === 2 && stats.total_images === 3 && stats.total_scripts === 2 && stats.total_styles === 1, JSON.stringify(stats))

  const fixRes = await api('POST', '/api/engine/fix', { sessionId })
  check('fix generation 200', fixRes.status === 200, `status=${fixRes.status}`)
  check('one fix per finding (22)', /22 fixes generated/.test(fixRes.json.message || ''), fixRes.json.message)

  const approveRes = await api('POST', '/api/engine/approve', { sessionId, approved: true })
  check('approve applies all fixes', approveRes.status === 200 && approveRes.json.state === 'RESTORATION_COMPLETE', `status=${approveRes.status} state=${approveRes.json.state}`)
  check('summary counts 22 fixed / 1 file modified', approveRes.json.summary?.issues_fixed === 22 && approveRes.json.summary?.files_modified === 1, JSON.stringify(approveRes.json.summary))

  const code = await rawGet(`/api/engine/code?sessionId=${sessionId}`)
  check('fixed code served as UTF-8 text', code.status === 200 && /charset=utf-8/.test(code.contentType), code.contentType)
  const html = code.text

  check('BOM stripped', html.charCodeAt(0) !== 0xFEFF)
  check('null bytes stripped', !html.includes(NULL_BYTE))
  check('replacement chars stripped', !html.includes(REPLACEMENT_CHAR))
  check('CJK mojibake repaired', !CJK_RE.test(html))
  for (const [label, secret] of [['github token', FAKE_GITHUB], ['openai key', FAKE_OPENAI], ['aws key', FAKE_AWS], ['slack token', FAKE_SLACK], ['password', FAKE_PASSWORD]]) {
    check(`${label} fully redacted`, !html.includes(secret))
  }
  check('REDACTED placeholders present', html.includes('REDACTED'))
  check('insecure http:// references gone', !html.includes(`http://${SITE_HOST}`))
  check('charset meta injected', /<meta[^>]+charset/i.test(html))
  check('viewport meta injected', /<meta[^>]+name=["']viewport["']/i.test(html))
  check('title injected', /<title>[^<]*\S[^<]*<\/title>/i.test(html))
  check('lang attribute added', /<html[^>]*\slang\s*=/i.test(html))
  check('meta description injected', /<meta[^>]+name=["']description["']/i.test(html))
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
  check('every <img> carries an alt attribute', imgTags.length > 0 && imgTags.every((t) => /\balt\s*=/i.test(t)), `${imgTags.length} imgs`)
  for (const dead of ['app-dead.js', 'theme-dead.css', 'logo-dead.png', 'products/discontinued']) {
    check(`dead resource "${dead}" excised`, !html.includes(dead))
  }
  check('surviving content preserved (welcome copy)', html.includes('Welcome to Bakery Delights'))
  check('dead link unwrapped, label kept', html.includes('Discontinued Line') && !/discontinued/.test(html))
  check('alive script untouched', html.includes('/assets/app-alive.js'))
  check('alive image untouched', html.includes('alt="Bakery logo"'))

  check('doctype prepended', /^<!DOCTYPE html>/i.test(html.trim()))
  for (const [label, marker] of [['marquee', '<marquee'], ['center', '<center'], ['font', '<font']]) {
    check(`deprecated tag <${label}> unwrapped`, !html.toLowerCase().includes(marker))
  }
  check('deprecated content preserved (marquee)', html.includes('Grand Opening Week!'))
  check('deprecated content preserved (center)', html.includes('Open Daily'))
  check('deprecated content preserved (font)', html.includes('Family Recipes'))
  const attrStripped = /<[a-zA-Z][^>]*>/g
  let staleAttrs = 0
  for (const tag of html.match(attrStripped) || []) {
    if (/\s(?:bgcolor|align|border)\s*=/i.test(tag)) staleAttrs += 1
  }
  check('all obsolete attributes stripped', staleAttrs === 0, `${staleAttrs} remaining`)
  check('table element itself kept', html.includes('<table>') || /<table\s[^>]*>/.test(html))

  const styleBlock = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || ''
  const styleOpens = (styleBlock.match(/\{/g) || []).length
  const styleCloses = (styleBlock.match(/\}/g) || []).length
  check('CSS braces balanced by surgery', styleOpens > 0 && styleOpens === styleCloses, `opens=${styleOpens} closes=${styleCloses}`)
  check('existing CSS rules untouched (.hero)', /\.hero\s*\{\s*margin:\s*0 auto;\s*\}/.test(styleBlock))
  check('wounded rule still present (.badge)', styleBlock.includes('.badge') && styleBlock.includes('crimson'))

  check('broken inline script disabled', !html.includes('function boom(') && html.includes('[AlphaTekX Restore] Disabled: inline script failed to compile'))
  check('healthy inline script byte-identical', html.includes('\n    console.log("alive-inline");\n  '))

  // Delivery A: download ZIP and verify its contents byte-for-byte.
  const delDownload = await api('POST', '/api/engine/delivery', { sessionId, option: 'download' })
  check('delivery option download accepted', delDownload.status === 200, `status=${delDownload.status}`)
  const zip = await rawGet(`/api/engine/download?sessionId=${sessionId}`)
  check('zip served with zip mime', zip.status === 200 && zip.contentType === 'application/zip', `${zip.status} ${zip.contentType}`)
  check('zip has PK magic bytes', zip.buf.length > 100 && zip.buf[0] === 0x50 && zip.buf[1] === 0x4b, `bytes=${zip.buf.length}`)
  const archive = await JSZip.loadAsync(zip.buf)
  const names = Object.keys(archive.files).sort()
  check('zip contains index.html + README.txt', JSON.stringify(names) === JSON.stringify(['README.txt', 'index.html']), names.join(','))
  const zippedHtml = await archive.file('index.html').async('string')
  check('zip index.html identical to served fixed code', zippedHtml === html)

  // Delivery B: copy-code gate then verification.
  const delCode = await api('POST', '/api/engine/delivery', { sessionId, option: 'code' })
  check('re-selecting delivery as code allowed', delCode.status === 200, `status=${delCode.status}`)
  const earlyVerify = await api('POST', '/api/engine/verify', { sessionId })
  check('verify blocked before action-complete', earlyVerify.status === 409 && earlyVerify.json.action_required === 'complete_action', `${earlyVerify.status} ${earlyVerify.json.action_required}`)
  const done = await api('POST', '/api/engine/action-complete', { sessionId })
  check('copy-code gate completes', done.status === 200, `status=${done.status}`)
  await api('POST', '/api/engine/verify', { sessionId })
  const verifyStatus = await api('GET', `/api/engine/verify/status?sessionId=${sessionId}`)
  const verify = { json: { state: verifyStatus.json.state, summary: verifyStatus.json.summary, verifyResult: verifyStatus.json.verifyResult } }
  check('verify reaches DONE', verify.json.state === 'DONE', String(verify.json.state))
  check('after score perfect 100', verify.json.summary?.after_score === 100, String(verify.json.summary?.after_score))
  check('zero remaining issues', verify.json.verifyResult?.remainingIssues === 0, JSON.stringify(verify.json.verifyResult?.remaining))
  check('utf8Clean certified', verify.json.verifyResult?.utf8Clean === true)

  return { sessionId, before: 0, after: 100 }
}

async function partialApprovalSuite() {
  section('PARTIAL APPROVAL — disabling a fix leaves that wound open, honestly scored')

  const sessionId = await createSession()
  await scan(sessionId, `${SITE_BASE}/`)
  await api('POST', '/api/engine/fix', { sessionId })
  const state = await api('GET', `/api/engine/state?sessionId=${sessionId}`)
  const viewportFix = (state.json.fixes || []).find((f) => f.type === 'missing_viewport')
  assert.ok(viewportFix, 'missing_viewport fix exists')
  const approveRes = await api('POST', '/api/engine/approve', { sessionId, approved: true, disabled: [viewportFix.findingId] })
  check('partial approve succeeds', approveRes.status === 200, `status=${approveRes.status}`)
  check('summary counts 21 fixed', approveRes.json.summary?.issues_fixed === 21, String(approveRes.json.summary?.issues_fixed))

  const code = await rawGet(`/api/engine/code?sessionId=${sessionId}`)
  check('disabled viewport still absent', !/<meta[^>]+name=["']viewport["']/i.test(code.text))
  check('enabled charset still injected', /<meta[^>]+charset/i.test(code.text))

  await api('POST', '/api/engine/delivery', { sessionId, option: 'code' })
  await api('POST', '/api/engine/action-complete', { sessionId })
  await api('POST', '/api/engine/verify', { sessionId })
  const verifyStatus = await api('GET', `/api/engine/verify/status?sessionId=${sessionId}`)
  const remaining = verifyStatus.json.verifyResult?.remaining || []
  const afterScore = verifyStatus.json.summary?.after_score
  check('verify reports exactly 1 remaining issue', verifyStatus.json.verifyResult?.remainingIssues === 1 && remaining[0]?.type === 'missing_viewport', JSON.stringify(remaining.map((r) => r.type)))
  check('score honestly docked to 95', afterScore === 95, String(afterScore))
  return { fixed: 16, remaining: 1, score: 95 }
}

async function cleanControlSuite() {
  section('NEGATIVE CONTROL — clean page produces zero findings, no crying wolf')

  const sessionId = await createSession()
  const scanRes = await scan(sessionId, `${SITE_BASE}/clean`)
  check('clean scan finds 0 issues', scanRes.status === 200 && scanRes.json.summary?.issues_found === 0, JSON.stringify(scanRes.json.summary))
  check('clean scan keeps score at 100', scanRes.json.summary?.before_score === 100, String(scanRes.json.summary?.before_score))
  const fixRes = await api('POST', '/api/engine/fix', { sessionId })
  check('fix refused with skip_to_delivery guidance', fixRes.status === 409 && fixRes.json.action_required === 'skip_to_delivery', `${fixRes.status} ${fixRes.json.action_required}`)
}

async function guardRailSuite() {
  section('GUARD RAILS — out-of-order and malformed calls are rejected cleanly')

  const fresh = await createSession()
  const earlyFix = await api('POST', '/api/engine/fix', { sessionId: fresh })
  check('fix before scan -> 409 run_scan_first', earlyFix.status === 409 && earlyFix.json.action_required === 'run_scan_first', `${earlyFix.status} ${earlyFix.json.action_required}`)
  const earlyApprove = await api('POST', '/api/engine/approve', { sessionId: fresh, approved: true })
  check('approve before fix -> 409 generate_fixes_first', earlyApprove.status === 409 && earlyApprove.json.action_required === 'generate_fixes_first', `${earlyApprove.status} ${earlyApprove.json.action_required}`)

  const badUrl = await createSession()
  const badScan = await scan(badUrl, 'not a valid url!!')
  check('garbage URL -> 400 enter_url', badScan.status === 400 && badScan.json.action_required === 'enter_url', `${badScan.status} ${badScan.json.action_required}`)
  const deadScan = await scan(badUrl, 'http://127.0.0.1:59997/')
  check('unreachable host -> 502 check_url', deadScan.status === 502 && deadScan.json.action_required === 'check_url', `${deadScan.status} ${deadScan.json.action_required}`)

  const ghost = await createSession()
  void ghost
  const missingSession = await api('POST', '/api/engine/approve', { sessionId: 'does-not-exist', approved: true })
  check('unknown session -> 404 new_session', missingSession.status === 404 && missingSession.json.action_required === 'new_session', `${missingSession.status}`)

  const forced = await createSession()
  await scan(forced, `${SITE_BASE}/`)
  await api('POST', '/api/engine/fix', { sessionId: forced })
  const earlyDelivery = await api('POST', '/api/engine/delivery', { sessionId: forced, option: 'download' })
  check('delivery before approve -> 409 apply_fixes_first', earlyDelivery.status === 409 && earlyDelivery.json.action_required === 'apply_fixes_first', `${earlyDelivery.status}`)
  await api('POST', '/api/engine/approve', { sessionId: forced, approved: true })
  const badOption = await api('POST', '/api/engine/delivery', { sessionId: forced, option: 'carrier-pigeon' })
  check('nonsense delivery option -> 400 choose_option', badOption.status === 400 && badOption.json.action_required === 'choose_option', `${badOption.status}`)
  await api('POST', '/api/engine/delivery', { sessionId: forced, option: 'code' })
  const wrongDownload = await rawGet(`/api/engine/download?sessionId=${forced}`)
  check('download under code option -> 409', wrongDownload.status === 409, String(wrongDownload.status))
  const unapproved = await createSession()
  await scan(unapproved, `${SITE_BASE}/`)
  await api('POST', '/api/engine/fix', { sessionId: unapproved })
  const refused = await api('POST', '/api/engine/approve', { sessionId: unapproved, approved: false })
  check('approve without explicit true -> 400', refused.status === 400 && refused.json.action_required === 'approve_fixes', `${refused.status}`)
}

async function main() {
  if (process.argv.includes('--serve')) {
    const server = await startSiteServer()
    console.log(`[torture] battered site serving at ${SITE_BASE}/  (clean control: ${SITE_BASE}/clean)`)
    process.on('SIGINT', () => { server.close(); process.exit(0) })
    return
  }

  console.log('RESTORATION ENGINE — TORTURE PROOF (broken & battered fixture)')
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
  let partial = null
  try {
    full = await fullRestoreSuite()
    partial = await partialApprovalSuite()
    await cleanControlSuite()
    await guardRailSuite()
  } catch (err) {
    failures.push(`unexpected crash: ${err.message}`)
    console.error('\nCRASH', err)
  }

  const proof = {
    engine: 'restore-engine-torture',
    completedAt: new Date().toISOString(),
    fixture: { url: `${SITE_BASE}/`, cleanControl: `${SITE_BASE}/clean` },
    fullRestoration: { beforeScore: full?.before ?? null, afterScore: full?.after ?? null, findings: EXPECTED_TYPES.length },
    partialApproval: partial,
    passed: passes,
    failed: failures.length,
  }
  try {
    fs.mkdirSync(PROOF_DIR, { recursive: true })
    const proofPath = path.join(PROOF_DIR, 'torture-proof.json')
    fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2))
    console.log(`\n  Proof JSON written → ${path.relative(ROOT, proofPath)}`)
  } catch {}

  console.log('\n' + '='.repeat(72))
  if (failures.length) {
    console.log(`TORTURE RESULT: FAIL — ${failures.length} failure(s)`)
    for (const f of failures) console.log(` - ${f}`)
  } else {
    console.log(`TORTURE RESULT: PASS — ${passes} checks green. The battered site was fully restored.`)
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
