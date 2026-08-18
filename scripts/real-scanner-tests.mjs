// Verifies the real scan engine against a deliberately vulnerable fixture site.
// Run: node scripts/real-scanner-tests.mjs

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

import { runRealScan, evidenceDirFor, createScanId } from '../server/scanner/realScanner.mjs'
import { findSecrets, maskSecret, redactionPairs } from '../server/scanner/secretPatterns.mjs'
import { closeBrowserPool } from '../server/scanner/browserPool.mjs'

const FIXTURE_OPENAI_KEY = 'sk-proj-FIXTUREkeyNOTreal0000000000abcd1234'
const FIXTURE_AWS_KEY = 'AKIAFIXTURE000000000'

const ENV_FILE = `NODE_ENV=production
OPENAI_API_KEY=${FIXTURE_OPENAI_KEY}
AWS_ACCESS_KEY_ID=${FIXTURE_AWS_KEY}
DATABASE_URL=postgres://app:hunter2@db.internal:5432/app
`

const BUNDLE_JS = `window.__boot=function(){var k="${FIXTURE_OPENAI_KEY}";return fetch("/api/session",{headers:{Authorization:"Bearer "+k}})};window.__boot();`

const INDEX_HTML = `<!doctype html><html><head><title>Vulnerable Fixture</title></head>
<body><h1>Fixture</h1><script src="/assets/app.js"></script></body></html>`

function startFixtureServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const send = (status, contentType, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': contentType, ...headers })
      res.end(body)
    }

    switch (url.pathname) {
      case '/':
        return send(200, 'text/html', INDEX_HTML)
      case '/assets/app.js':
        return send(200, 'application/javascript', BUNDLE_JS)
      case '/.env':
        return send(200, 'text/plain', ENV_FILE)
      case '/.git/config':
        return send(200, 'text/plain', '[core]\n\trepositoryformatversion = 0\n')
      case '/api/session':
        return send(200, 'application/json', JSON.stringify({ ok: true }), {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true',
        })
      default:
        // SPA-style catch-all: everything else returns 200 HTML. A naive scanner
        // reports these as exposures; the real engine must not.
        return send(200, 'text/html', INDEX_HTML)
    }
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

const results = []
function check(name, passed, detail = '') {
  results.push({ name, passed, detail })
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  check('maskSecret hides the body of the key', maskSecret(FIXTURE_OPENAI_KEY) === 'sk-proj-••••1234', maskSecret(FIXTURE_OPENAI_KEY))
  check('findSecrets reports a line number', findSecrets(ENV_FILE, '.env').some((s) => s.type === 'OPENAI_KEY' && s.lineNumber === 2))
  check('findSecrets never returns the raw value', !JSON.stringify(findSecrets(ENV_FILE, '.env')).includes(FIXTURE_OPENAI_KEY))
  check('redactionPairs maps the raw key to its mask', redactionPairs(ENV_FILE).some((pair) => pair.raw === FIXTURE_OPENAI_KEY && pair.masked === 'sk-proj-••••1234'))

  const { server, port } = await startFixtureServer()
  const scanId = createScanId()
  try {
    const report = await runRealScan(`http://127.0.0.1:${port}/`, { scanId })
    const byType = (type) => report.findings.filter((finding) => finding.type === type)

    check('scan completes with findings', report.findings.length > 0, `${report.findings.length} findings`)
    check('exposed .env detected with 200 status', byType('EXPOSED_ENV_FILE').some((f) => f.status === 200))
    check('exposed .env carries masked proof', byType('EXPOSED_ENV_FILE')[0]?.maskedProof === 'sk-proj-••••1234', byType('EXPOSED_ENV_FILE')[0]?.maskedProof || 'none')
    check('exposed .git detected', byType('EXPOSED_GIT_DIRECTORY').length > 0)
    check('secret in client bundle detected', byType('SECRET_IN_CLIENT_BUNDLE').length > 0)
    check('missing CSP reported', byType('MISSING_CSP').length === 1)
    check('SPA catch-all does not create false positives', byType('EXPOSED_CONFIG_FILE').length === 0 && byType('EXPOSED_BACKUP_FILE').length === 0)
    check('risk is CRITICAL', report.risk === 'CRITICAL', report.risk)
    check('report never contains a raw secret', !JSON.stringify(report).includes(FIXTURE_OPENAI_KEY))
    check('page screenshot captured', Boolean(report.screenshot) && fs.existsSync(path.join(evidenceDirFor(scanId), report.screenshot)))
    check('every finding has a timestamp', report.findings.every((finding) => Boolean(finding.timestamp)))
    check('every finding has meaning and consequence', report.findings.every((finding) => finding.meaning && finding.consequence))
  } finally {
    server.close()
    await closeBrowserPool()
  }

  const failed = results.filter((result) => !result.passed)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
