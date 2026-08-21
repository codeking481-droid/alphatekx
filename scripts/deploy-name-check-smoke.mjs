// Smoke test: name checking system + /api/deploy + deployments.json registry
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const port = 3987
const root = path.resolve('.')
const deployedDir = path.join(root, 'deployed')
const registryFile = path.join(deployedDir, 'deployments.json')

let pass = 0, fail = 0
const check = (label, ok, extra = '') => {
  if (ok) { pass++; console.log(`PASS ${label}`) } else { fail++; console.log(`FAIL ${label} ${extra}`) }
}

const server = spawn(process.execPath, ['--experimental-strip-types', 'server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stderr.on('data', d => process.stderr.write(d))
await new Promise(resolve => {
  const t = setInterval(() => {
    fetch(`http://127.0.0.1:${port}/api/health`).then(r => r.ok ? (clearInterval(t), resolve()) : null).catch(() => null)
  }, 500)
  setTimeout(() => { clearInterval(t); resolve() }, 20000)
})

const base = `http://127.0.0.1:${port}`
const localHeaders = { 'content-type': 'application/json', 'x-local-user-id': 'smoke-user-1', 'x-local-user-email': 'smoke@alphatekx.test' }

try {
  // 1. Available name
  const r1 = await fetch(`${base}/api/check-availability?name=smoketest${Date.now() % 100000}`)
  const j1 = await r1.json()
  check('check-availability available shape', r1.status === 200 && j1.available === true && typeof j1.message === 'string' && j1.message.includes('Available'), JSON.stringify(j1))

  // 2. Reserved name
  const r2 = await fetch(`${base}/api/check-availability?name=admin`)
  const j2 = await r2.json()
  check('check-availability reserved', j2.available === false && Array.isArray(j2.suggestions), JSON.stringify(j2))

  // 3. Invalid short name
  const r3 = await fetch(`${base}/api/check-availability?name=ab`)
  const j3 = await r3.json()
  check('check-availability invalid', j3.available === false && !!j3.message, JSON.stringify(j3))

  // 4. Deploy a site
  const siteName = `smokesite${Date.now() % 100000}`
  const html = '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>Smoke Site</title></head>\n<body><h1>Welcome</h1></body>\n</html>'
  const r4 = await fetch(`${base}/api/deploy`, { method: 'POST', headers: localHeaders, body: JSON.stringify({ name: siteName, html }) })
  const j4 = await r4.json()
  check('deploy success shape', r4.status === 200 && j4.success === true && j4.url === `${base.replace(String(port), String(port))}/app/${siteName}`.replace('127.0.0.1', '127.0.0.1') || (j4.success === true && String(j4.url).endsWith(`/app/${siteName}`)), JSON.stringify(j4))
  check('deploy message', j4.message === '✅ Site deployed successfully!', JSON.stringify(j4))

  // 5. Name now taken — anonymous sees taken, owner sees update option
  const r5 = await fetch(`${base}/api/check-availability?name=${siteName}`)
  const j5 = await r5.json()
  check('name taken for anonymous', j5.available === false && j5.owned === false && Array.isArray(j5.suggestions) && j5.suggestions.length > 0, JSON.stringify(j5))
  const r5b = await fetch(`${base}/api/check-availability?name=${siteName}`, { headers: { 'x-local-user-id': 'smoke-user-1', 'x-local-user-email': 'smoke@alphatekx.test' } })
  const j5b = await r5b.json()
  check('name owned by deploying user', j5b.available === false && j5b.owned === true && /update/i.test(j5b.message || ''), JSON.stringify(j5b))
  const r5c = await fetch(`${base}/api/check-availability?name=${siteName}`, { headers: { 'x-local-user-id': 'smoke-user-2', 'x-local-user-email': 'other@alphatekx.test' } })
  const j5c = await r5c.json()
  check('name not owned by other user', j5c.available === false && j5c.owned === false, JSON.stringify(j5c))

  // 6. Owner redeploying same name UPDATES the site; other users still get 409
  const htmlV2 = html.replace('Welcome', 'Welcome v2')
  const r6 = await fetch(`${base}/api/deploy`, { method: 'POST', headers: localHeaders, body: JSON.stringify({ name: siteName, html: htmlV2 }) })
  const j6 = await r6.json()
  check('owner redeploy updates site', r6.status === 200 && j6.success === true && j6.updated === true && /updated/i.test(j6.message || ''), `status ${r6.status} ${JSON.stringify(j6)}`)
  const r6b = await fetch(`${base}/api/deploy`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-local-user-id': 'smoke-user-2', 'x-local-user-email': 'other@alphatekx.test' }, body: JSON.stringify({ name: siteName, html }) })
  check('other user redeploy rejected 409', r6b.status === 409, `status ${r6b.status}`)

  // 7. deployments.json registry written with UTF-8, no BOM
  check('deployments.json exists', fs.existsSync(registryFile))
  if (fs.existsSync(registryFile)) {
    const raw = fs.readFileSync(registryFile, 'utf8')
    const reg = JSON.parse(raw)
    const entry = reg.sites.find(s => s.name === siteName)
    check('registry has site entry', !!entry && entry.url.endsWith(`/app/${siteName}`) && !!entry.created, JSON.stringify(entry))
    check('registry no BOM', raw.charCodeAt(0) !== 0xFEFF)
  }

  // 8. Site is actually served at /app/{name} with the UPDATED content
  const r8 = await fetch(`${base}/app/${siteName}`)
  const body8 = await r8.text()
  check('site served at /app/name', r8.status === 200 && body8.includes('Welcome v2') && body8.includes('alpha-app'), `status ${r8.status}`)

  // 9. Corrupted (CJK mojibake) HTML rejected by deploy
  const bad = '\u4E2D\u6587\u30C6\u30B9\u30C8 <!DOCTYPE html>'
  const r9 = await fetch(`${base}/api/deploy`, { method: 'POST', headers: localHeaders, body: JSON.stringify({ name: `cleansite${Date.now() % 100000}`, html: bad }) })
  const j9 = await r9.json()
  check('mojibake HTML rejected', r9.status === 400 && /UTF-8|non-English/i.test(j9.error || ''), `status ${r9.status} ${JSON.stringify(j9)}`)

  // 10. Unauthenticated deploy rejected
  const r10 = await fetch(`${base}/api/deploy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'anon123', html }) })
  check('unauthenticated deploy 401', r10.status === 401, `status ${r10.status}`)
} catch (err) {
  fail++
  console.error('SMOKE ERROR:', err)
} finally {
  server.kill()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
