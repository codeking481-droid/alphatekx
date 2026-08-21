// Smoke test: Restoration Engine full lifecycle
// session -> scan -> fix -> approve (UTF-8 gates) -> code/download/verify + deploy path + error shapes
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const mainPort = 3990
const fixturePort = 3991
const root = path.resolve('.')
const registryFile = path.join(root, 'deployed', 'deployments.json')

let pass = 0, fail = 0
const check = (label, ok, extra = '') => {
  if (ok) { pass++; console.log(`PASS ${label}`) } else { fail++; console.log(`FAIL ${label} ${extra}`) }
}

const BROKEN_HTML = '\uFEFF<!DOCTYPE html>\n<html>\n<head>\n<title></title>\n</head>\n<body>\u0000\n' +
  '<img src="http://cdn.example-broken.test/logo.png">\n' +
  '<a href="http://insecure.example-broken.test/page">insecure link</a>\n' +
  '<script>var apiKey = "sk-proj-abcdefghijklmnop1234567890";</script>\n' +
  '</body>\n</html>'

const fixture = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(BROKEN_HTML)
})
await new Promise((r) => fixture.listen(fixturePort, '127.0.0.1', r))

const server = spawn(process.execPath, ['--experimental-strip-types', 'server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(mainPort), NODE_ENV: 'development', PUBLIC_APP_URL: `http://127.0.0.1:${mainPort}` },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stderr.on('data', d => process.stderr.write(d))
await new Promise(resolve => {
  const t = setInterval(() => {
    fetch(`http://127.0.0.1:${mainPort}/api/health`).then(r => r.ok ? (clearInterval(t), resolve()) : null).catch(() => null)
  }, 500)
  setTimeout(() => { clearInterval(t); resolve() }, 25000)
})

const base = `http://127.0.0.1:${mainPort}`
const localHeaders = { 'content-type': 'application/json', 'x-local-user-id': 'smoke-user-1', 'x-local-user-email': 'smoke@alphatekx.test' }
const post = (p, body, headers = { 'content-type': 'application/json' }) =>
  fetch(`${base}${p}`, { method: 'POST', headers, body: JSON.stringify(body) })

try {
  const fixtureUrl = `http://127.0.0.1:${fixturePort}/broken.html`

  // 1. Create session
  const r1 = await post('/api/engine/session', {})
  const j1 = await r1.json()
  check('session created', r1.status === 200 && j1.state === 'IDLE' && !!j1.sessionId, JSON.stringify(j1))
  const sid = j1.sessionId

  // 2. Error shape: fix before scan
  const r2 = await post('/api/engine/fix', { sessionId: sid })
  const j2 = await r2.json()
  check('fix before scan rejected with spec error shape', r2.status === 409 && j2.step === 'error' && j2.retry === true && typeof j2.action_required === 'string', JSON.stringify(j2))

  // 3. Scan the broken fixture page
  const r3 = await post('/api/engine/scan', { sessionId: sid, url: fixtureUrl })
  const j3 = await r3.json()
  const state3 = await fetch(`${base}/api/engine/state?sessionId=${sid}`).then(r => r.json())
  const types3 = (state3.findings || []).map(f => f.type)
  check('scan success shape', r3.status === 200 && j3.status === 'success' && j3.step === 'scan_complete', JSON.stringify(j3).slice(0, 300))
  check('scan detects corrupted encoding', types3.includes('corrupted_encoding'), JSON.stringify(types3))
  check('scan detects leaked secret', types3.includes('leaked_secret'), JSON.stringify(types3))
  check('scan detects mixed content', types3.includes('mixed_content'), JSON.stringify(types3))
  check('scan detects missing charset/viewport/title/lang/desc/img-alt',
    ['missing_charset', 'missing_viewport', 'missing_title', 'missing_lang', 'missing_description', 'img_missing_alt'].every(t => types3.includes(t)), JSON.stringify(types3))
  check('before score degraded below 50', typeof j3.summary.before_score === 'number' && j3.summary.before_score < 50, String(j3.summary.before_score))

  // 4. Scan status endpoint
  const r4 = await fetch(`${base}/api/engine/scan/status?sessionId=${sid}`)
  const j4 = await r4.json()
  check('scan status reports complete', r4.status === 200 && j4.scanning === false && j4.state === 'SCAN_COMPLETE', JSON.stringify(j4))

  // 5. Generate fixes
  const r5 = await post('/api/engine/fix', { sessionId: sid })
  const j5 = await r5.json()
  check('fix generation success', r5.status === 200 && j5.step === 'fixes_ready' && j5.status === 'success', JSON.stringify(j5).slice(0, 200))

  // 6. Approve must be explicit
  const r6 = await post('/api/engine/approve', { sessionId: sid, approved: false })
  const j6 = await r6.json()
  check('approve requires approved:true', r6.status === 400 && j6.step === 'error' && j6.action_required === 'approve_fixes', JSON.stringify(j6))

  // 7. Approve and apply
  const r7 = await post('/api/engine/approve', { sessionId: sid, approved: true })
  const j7 = await r7.json()
  check('apply success reaches restoration_complete', r7.status === 200 && j7.step === 'restoration_complete', JSON.stringify(j7).slice(0, 300))
  check('summary counts fixes and files', j7.summary.issues_fixed > 0 && j7.summary.files_modified >= 1, JSON.stringify(j7.summary))
  check('apply lists four delivery actions', Array.isArray(j7.actions) && j7.actions.length === 4, JSON.stringify(j7.actions))

  // 8. Fixed code is UTF-8 clean and fully repaired
  const r8 = await fetch(`${base}/api/engine/code?sessionId=${sid}`)
  const code8 = await r8.text()
  check('code served as utf-8 text', r8.headers.get('content-type').includes('utf-8'), String(r8.headers.get('content-type')))
  check('code has charset meta', /<meta charset="utf-8">/i.test(code8))
  check('code has viewport meta', /name="viewport"/i.test(code8))
  check('code has lang attr', /<html[^>]*lang=/i.test(code8))
  check('code has title', /<title>[^<]*\S/i.test(code8))
  check('code has description meta', /name="description"/i.test(code8))
  check('BOM stripped', code8.charCodeAt(0) !== 0xFEFF)
  check('null bytes stripped', !code8.includes('\u0000'))
  check('secret redacted', !code8.includes('sk-proj-abcdefghijklmnop') && code8.includes('REDACTED'))
  check('mixed content upgraded to https', !/(src|href)=["']http:\/\//i.test(code8))
  check('img alt added', /<img[^>]*alt="/i.test(code8))

  // 9. Delivery gating: verify blocked before action completes
  await post('/api/engine/delivery', { sessionId: sid, option: 'download' })
  const r9 = await post('/api/engine/verify', { sessionId: sid })
  const j9 = await r9.json()
  check('verify blocked until action completed', r9.status === 409 && j9.action_required === 'complete_action', JSON.stringify(j9))

  // 10. Download zip
  const r10 = await fetch(`${base}/api/engine/download?sessionId=${sid}`)
  const buf10 = Buffer.from(await r10.arrayBuffer())
  check('download returns zip', r10.status === 200 && r10.headers.get('content-type') === 'application/zip' && buf10.length > 100, `status ${r10.status} len ${buf10.length}`)
  check('zip magic bytes PK', buf10[0] === 0x50 && buf10[1] === 0x4b)

  // 11. Verify after download action
  const r11 = await post('/api/engine/verify', { sessionId: sid })
  const j11 = await r11.json()
  check('verify reaches done', r11.status === 200 && j11.step === 'done', JSON.stringify(j11).slice(0, 300))
  check('after score perfect 100', j11.summary.after_score === 100, JSON.stringify(j11.summary))
  check('score improved after restore', j11.summary.after_score > j11.summary.before_score, JSON.stringify(j11.summary))
  const st11 = await fetch(`${base}/api/engine/state?sessionId=${sid}`).then(r => r.json())
  check('utf8Clean verified', st11.verifyResult?.utf8Clean === true, JSON.stringify(st11.verifyResult))

  // 12. Copy-code option gating via action-complete
  const sid2 = (await (await post('/api/engine/session', {})).json()).sessionId
  await post('/api/engine/scan', { sessionId: sid2, url: fixtureUrl })
  await post('/api/engine/fix', { sessionId: sid2 })
  await post('/api/engine/approve', { sessionId: sid2, approved: true })
  const r12a = await post('/api/engine/action-complete', { sessionId: sid2 })
  check('action-complete rejected for wrong option', r12a.status === 409, `status ${r12a.status}`)
  await post('/api/engine/delivery', { sessionId: sid2, option: 'code' })
  const r12b = await post('/api/engine/action-complete', { sessionId: sid2 })
  const j12b = await r12b.json()
  check('action-complete marks copy done', r12b.status === 200 && j12b.status === 'success', JSON.stringify(j12b))
  const r12c = await post('/api/engine/verify', { sessionId: sid2 })
  check('copy path verifies to done', r12c.status === 200 && (await r12c.json()).step === 'done')

  // 13. Deploy path end-to-end
  const sid3 = (await (await post('/api/engine/session', {})).json()).sessionId
  await post('/api/engine/scan', { sessionId: sid3, url: fixtureUrl })
  await post('/api/engine/fix', { sessionId: sid3 })
  await post('/api/engine/approve', { sessionId: sid3, approved: true })
  await post('/api/engine/delivery', { sessionId: sid3, option: 'deploy' })
  const siteName = `enginetest${Date.now() % 100000}`
  const r13 = await post('/api/engine/deploy', { sessionId: sid3, name: siteName }, localHeaders)
  const j13 = await r13.json()
  check('engine deploy success', r13.status === 200 && j13.status === 'success' && String(j13.actions?.[0]?.url || '').endsWith(`/app/${siteName}`), JSON.stringify(j13).slice(0, 300))
  const reg13 = JSON.parse(fs.readFileSync(registryFile, 'utf8'))
  check('engine deploy registered in deployments.json', reg13.sites.some(s => s.name === siteName), JSON.stringify(reg13.sites.slice(-2)))
  const r13b = await post('/api/engine/deploy', { sessionId: sid3, name: siteName }, localHeaders)
  const j13b = await r13b.json()
  check('owner engine redeploy updates site', r13b.status === 200 && j13b.status === 'success' && /updated/i.test(j13b.message || ''), `status ${r13b.status}`)
  const otherHeaders = { 'content-type': 'application/json', 'x-local-user-id': 'smoke-user-2', 'x-local-user-email': 'other@alphatekx.test' }
  const sid3b = (await (await post('/api/engine/session', {})).json()).sessionId
  await post('/api/engine/scan', { sessionId: sid3b, url: fixtureUrl })
  await post('/api/engine/fix', { sessionId: sid3b })
  await post('/api/engine/approve', { sessionId: sid3b, approved: true })
  await post('/api/engine/delivery', { sessionId: sid3b, option: 'deploy' })
  const r13b2 = await post('/api/engine/deploy', { sessionId: sid3b, name: siteName }, otherHeaders)
  check('other user engine deploy rejected 409', r13b2.status === 409, `status ${r13b2.status}`)
  const r13c = await post('/api/engine/deploy', { sessionId: sid3, name: siteName }, { 'content-type': 'application/json' })
  check('unauthenticated engine deploy 401', r13c.status === 401, `status ${r13c.status}`)
  const r13d = await post('/api/engine/verify', { sessionId: sid3 })
  const j13d = await r13d.json()
  const st13 = await fetch(`${base}/api/engine/state?sessionId=${sid3}`).then(r => r.json())
  check('deploy path verify hits live URL', r13d.status === 200 && st13.verifyResult?.liveStatus === 200, JSON.stringify(st13.verifyResult))

  // 14. GitHub without token -> connect_github action required
  const sid4 = (await (await post('/api/engine/session', {})).json()).sessionId
  await post('/api/engine/scan', { sessionId: sid4, url: fixtureUrl })
  await post('/api/engine/fix', { sessionId: sid4 })
  await post('/api/engine/approve', { sessionId: sid4, approved: true })
  await post('/api/engine/delivery', { sessionId: sid4, option: 'github' })
  const r14 = await post('/api/engine/github', { sessionId: sid4, repo: 'someone/somerepo' })
  const j14 = await r14.json()
  check('github without token asks to connect', r14.status === 401 && j14.action_required === 'connect_github', JSON.stringify(j14))

  // 15. Unknown engine route -> spec error shape, no fallthrough
  const r15 = await post('/api/engine/nonsense', {})
  const j15 = await r15.json()
  check('unknown engine route spec error', r15.status === 404 && j15.step === 'error' && j15.retry === true, JSON.stringify(j15))

  // 16. Invalid URL rejected
  const sid5 = (await (await post('/api/engine/session', {})).json()).sessionId
  const r16 = await post('/api/engine/scan', { sessionId: sid5, url: 'not a url' })
  check('invalid scan URL rejected', r16.status === 400 && (await r16.json()).action_required === 'enter_url')
} catch (err) {
  fail++
  console.error('SMOKE ERROR:', err)
} finally {
  server.kill()
  fixture.close()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
