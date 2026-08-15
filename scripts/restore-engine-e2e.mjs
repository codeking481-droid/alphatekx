// Full server e2e for the Restore Engine v2 pipeline.
// Spawns the leaky demo app + the real server.mjs, then drives:
//   POST /api/restore/scan   (admin email → SSRF allowPrivate)
//   GET  /api/restore/proof/:scanId/meta.json
//   GET  /api/restore/proof/:scanId/proof-before.png
//   POST /api/watcher
//   POST /api/fix
//   POST /api/verify/:scanId
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const ROOT = process.cwd()
const LEAKY_PORT = 4319
const SERVER_PORT = 3999

function startNode(args, env = {}) {
  const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  const logs = []
  child.stdout.on('data', d => logs.push(String(d)))
  child.stderr.on('data', d => logs.push(String(d)))
  return { child, logs, all: () => logs.join('') }
}

async function waitForPort(port, label, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) })
      if (res) return true
    } catch {
      await new Promise(r => setTimeout(r, 700))
    }
  }
  return false
}

function postJson(url, body, timeoutMs = 120000) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
}

async function main() {
  const leaky = startNode(['scripts/restore-engine-test.mjs', '--serve'])
  const server = startNode(['--experimental-strip-types', 'server.mjs'], { PORT: String(SERVER_PORT) })

  const leakyUp = await waitForPort(LEAKY_PORT, 'leaky')
  const serverUp = await waitForPort(SERVER_PORT, 'server')
  if (!leakyUp || !serverUp) {
    console.error('STARTUP FAIL', leaky.all(), server.all())
    leaky.child.kill()
    server.child.kill()
    process.exit(1)
  }
  console.log('STARTUP OK')

  const ADMIN = 'iamdan4live@gmail.com'
  const target = `http://127.0.0.1:${LEAKY_PORT}/`
  const failures = []

  const check = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ->  ${detail}`)
    if (!ok) failures.push(label)
  }

  // --- 1) Full scan ---
  let scanRes
  try {
    const r = await postJson(`http://127.0.0.1:${SERVER_PORT}/api/restore/scan`, { email: ADMIN, url: target })
    scanRes = await r.json()
    check('scan http 200', r.status === 200, `status=${r.status}`)
    check('scan engine v2', scanRes.engine === 'restore-engine-v2', scanRes.engine)
    check('scanId present', Boolean(scanRes.scanId), scanRes.scanId)
    check('scan.isExposed true', scanRes.scan?.isExposed === true, String(scanRes.scan?.isExposed))
    check('25 paths probed', scanRes.scan?.paths?.length === 25, `paths=${scanRes.scan?.paths?.length}`)
    check('exposed paths > 0', (scanRes.scan?.exposedPaths?.length || 0) > 0, `exposed=${scanRes.scan?.exposedPaths?.length}`)
    check('maskedValue not raw', typeof scanRes.scan?.maskedValue === 'string' && !scanRes.scan.maskedValue.includes('51AbCdEfGhIjKlMnOpQrStUvWxYz'), scanRes.scan?.maskedValue)
    check('secrets masked only', Array.isArray(scanRes.scan?.secrets) && scanRes.scan.secrets.every(s => !('value' in s)), `secrets=${scanRes.scan?.secrets?.length}`)
    check('risk object', Boolean(scanRes.scan?.risk?.score && scanRes.scan.risk.grade), `${scanRes.scan?.risk?.score} ${scanRes.scan?.risk?.grade}`)
    check('aiBuild present', Boolean(scanRes.scan?.aiBuild), JSON.stringify(scanRes.scan?.aiBuild || {}))
    check('gitHistory present', Boolean(scanRes.scan?.gitHistory), `localGitExposed=${scanRes.scan?.gitHistory?.localGitExposed}`)
    check('liveSecrets array', Array.isArray(scanRes.scan?.liveSecrets), `n=${scanRes.scan?.liveSecrets?.length}`)
    check('proof files', Boolean(scanRes.scan?.proof?.proofBefore), scanRes.scan?.proof?.proofBefore)
    check('plan object', Boolean(scanRes.plan?.id), scanRes.plan?.name)
    check('watching paywall shape', 'paywall' in (scanRes.watching || {}), JSON.stringify(scanRes.watching))
    check('fixPlan gate', scanRes.scan?.fixPlan?.status === 'blocked' || scanRes.scan?.fixPlan?.status === 'ready', scanRes.scan?.fixPlan?.status)
  } catch (err) {
    check('scan request', false, err instanceof Error ? err.message : String(err))
  }

  const scanId = scanRes?.scanId
  if (scanId) {
    // --- 2) Proof meta.json served ---
    try {
      const r = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/restore/proof/${scanId}/meta.json`, { signal: AbortSignal.timeout(5000) })
      const meta = await r.json()
      check('proof meta.json 200', r.status === 200 && Boolean(meta.scanId), `status=${r.status}`)
    } catch (err) {
      check('proof meta.json 200', false, err instanceof Error ? err.message : String(err))
    }
    // --- 3) Proof PNG served ---
    try {
      const r = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/restore/proof/${scanId}/proof-before.png`, { signal: AbortSignal.timeout(5000) })
      const buf = Buffer.from(await r.arrayBuffer())
      check('proof-before.png 200 png', r.status === 200 && r.headers.get('content-type') === 'image/png' && buf.length > 1000, `bytes=${buf.length}`)
    } catch (err) {
      check('proof-before.png 200 png', false, err instanceof Error ? err.message : String(err))
    }
  }

  // --- 4) Watcher paywall ---
  try {
    const r = await postJson(`http://127.0.0.1:${SERVER_PORT}/api/watcher`, { email: ADMIN }, 10000)
    const body = await r.json()
    check('watcher ok for admin', r.status === 200 && body.ok === true, `ok=${body.ok} paywall=${body.paywall}`)
  } catch (err) {
    check('watcher ok for admin', false, err instanceof Error ? err.message : String(err))
  }

  // --- 5) Fix (admin, no GITHUB_FIX_TOKEN → partial guidance) ---
  if (scanId) {
    try {
      const r = await postJson(`http://127.0.0.1:${SERVER_PORT}/api/fix`, { email: ADMIN, scanId }, 30000)
      const body = await r.json()
      check('fix returns plan', r.status === 200 && Array.isArray(body.fix?.steps), `status=${r.status} steps=${body.fix?.steps?.length}`)
      check('fix non-destructive', body.fix?.backupBranch === '' || body.fix?.backupBranch.startsWith('alphatekx/'), body.fix?.backupBranch)
    } catch (err) {
      check('fix returns plan', false, err instanceof Error ? err.message : String(err))
    }

    // --- 6) Verify ---
    try {
      const r = await postJson(`http://127.0.0.1:${SERVER_PORT}/api/verify/${scanId}`, { email: ADMIN }, 120000)
      const body = await r.json()
      check('verify engine', body.engine === 'restore-engine-verify', body.engine)
      check('verify verdict set', typeof body.verdict === 'string', body.verdict)
      check('verify after score', typeof body.after?.score === 'number', `after=${body.after?.score}`)
    } catch (err) {
      check('verify engine', false, err instanceof Error ? err.message : String(err))
    }
  }

  // --- 7) SSRF guard via route (localhost blocked for non-admin) ---
  try {
    const r = await postJson(`http://127.0.0.1:${SERVER_PORT}/api/restore/scan`, { email: 'anon@example.com', url: 'http://127.0.0.1:9999/' }, 15000)
    const body = await r.json()
    check('ssrf blocks private for non-admin', r.status === 400 && /SSRF/i.test(body.error || ''), `status=${r.status} ${body.error}`)
  } catch (err) {
    check('ssrf blocks private for non-admin', false, err instanceof Error ? err.message : String(err))
  }

  console.log('\n' + (failures.length ? `E2E FAILURES: ${failures.length}\n- ${failures.join('\n- ')}` : 'ALL E2E CHECKS PASSED'))
  leaky.child.kill()
  server.child.kill()
  process.exitCode = failures.length ? 1 : 0
}

main().catch(err => { console.error('E2E CRASH', err); process.exitCode = 1 })
