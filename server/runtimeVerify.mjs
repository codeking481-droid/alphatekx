import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

let puppeteerModule = null
try {
  puppeteerModule = await import('puppeteer-core')
} catch {}

const CHROME_CDP_HOST = process.env.CHROME_CDP_HOST || 'localhost:29229'

async function getCdpEndpoint() {
  try {
    const res = await fetch(`http://${CHROME_CDP_HOST}/json/version`)
    if (!res.ok) return null
    const json = await res.json()
    return json.webSocketDebuggerUrl || null
  } catch {
    return null
  }
}

function findChromeExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const first = fs.readFileSync(candidate, 'utf8').slice(0, 30)
      if (!first.includes('curl')) return candidate
    }
  }
  return null
}

function getLocalIp() {
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') return iface.address
    }
  }
  return '127.0.0.1'
}

function serveStatic(distDir, base = '/') {
  const resolvedDist = path.resolve(distDir)
  return http.createServer((req, res) => {
    let pathname = req.url || '/'
    if (base && base !== '/' && pathname.startsWith(base)) pathname = pathname.slice(base.length) || '/'
    if (!pathname.startsWith('/')) pathname = '/' + pathname
    if (pathname === '/') pathname = '/index.html'
    const filePath = path.resolve(resolvedDist, `.${pathname}`)
    if (!filePath.startsWith(resolvedDist + path.sep)) { res.writeHead(403); res.end(); return }
    let target = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(filePath, 'index.html')
    if (!fs.existsSync(target)) target = path.join(resolvedDist, 'index.html')
    if (!fs.existsSync(target)) { res.writeHead(404); res.end('Not found'); return }
    const ext = path.extname(target).toLowerCase()
    const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' }[ext] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type })
    fs.createReadStream(target).pipe(res)
  })
}

async function connectBrowser() {
  const p = puppeteerModule?.default || puppeteerModule
  if (!p) return null
  const cdp = await getCdpEndpoint()
  if (cdp) return { browser: await p.connect({ browserWSEndpoint: cdp }), launchedLocally: false }
  const executablePath = findChromeExecutable()
  if (!executablePath) return null
  return {
    browser: await p.launch({ executablePath, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] }),
    launchedLocally: true,
  }
}

export async function verifyRuntime({ distDir, base = '/', timeoutMs = 30_000, screenshot = true, expectedFeatures = [] }) {
  const connection = await connectBrowser()
  if (!connection) return { ok: false, skipped: true, reason: 'No Chrome CDP or Chrome executable found' }
  const { browser, launchedLocally } = connection

  const port = 10000 + Math.floor(Math.random() * 30000)
  const host = getLocalIp()
  const server = serveStatic(distDir, base)
  await new Promise((resolve, reject) => { server.listen(port, host, resolve); server.on('error', reject) })
  const url = `http://${host}:${port}${base}`

  let page
  try {
    page = await browser.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto(url, { waitUntil: 'networkidle0', timeout: timeoutMs })
    await new Promise(r => setTimeout(r, 2000))
    if (expectedFeatures.some(f => /cart|checkout|add\s*to\s*cart/i.test(f))) {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')]
        const add = btns.find(b => /add\s*to\s*cart/i.test(b.textContent || ''))
        if (add) add.click()
      })
      await new Promise(r => setTimeout(r, 800))
    }
    const mounted = await page.evaluate(() => {
      const root = document.getElementById('root')
      return root ? root.innerHTML.trim().length > 0 : false
    })

    const bodyText = await page.evaluate(() => document.body?.textContent || '').catch(() => '')
    const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML || '').catch(() => '')
    const blank = bodyText.trim().length === 0 && rootHtml.trim().length === 0

    const missing = expectedFeatures.filter(f => !bodyText.toLowerCase().includes(f.toLowerCase()))
    const screenshotPath = screenshot ? path.join(distDir, `runtime-${Date.now()}.png`) : null
    if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})

    const ok = !blank && pageErrors.length === 0 && missing.length === 0
    return { ok, mounted, blank, consoleErrors, pageErrors, bodyTextPreview: bodyText.slice(0, 300), missingFeatures: missing, screenshotPath, url }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  } finally {
    try { await page?.close() } catch {}
    try {
      if (launchedLocally) await browser.close()
      else browser.disconnect()
    } catch {}
    try { server.close() } catch {}
  }
}
