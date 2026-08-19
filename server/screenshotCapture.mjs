/**
 * SCREENSHOT CAPTURE — Before/After for Website Restore
 *
 * Clones a repo, builds it, serves it on localhost, and takes a Playwright screenshot.
 * Used for "before" (pre-fix) and "after" (post-fix) verification.
 */

import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomInt } from 'node:crypto'
import http from 'node:http'

const execFileAsync = promisify(execFile)
const SCREENSHOT_DIR = path.join(tmpdir(), 'screenshots')

export function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

/**
 * Build a repo and take a screenshot of the built output.
 * @param {string} repoPath - path to cloned repo
 * @param {object} opts - { chromium, label: 'before'|'after', restorationId, sendEvent }
 * @returns {{ screenshotPath: string, buildOk: boolean, buildOutput: string, buildDurationMs: number }}
 */
export async function buildAndScreenshot(repoPath, opts = {}) {
  const { chromium, label = 'before', restorationId = 'unknown', sendEvent = () => {} } = opts
  ensureScreenshotDir()
  const screenshotPath = path.join(SCREENSHOT_DIR, `${label}-${restorationId}.png`)
  const startMs = Date.now()

  // sendStep wrapper: caller passes sendStep which already wraps {type:'thought_step',step}
  // So we send raw step objects via sendEvent (which IS sendStep)
  const step = (s) => sendEvent(s)

  // Step 1: npm install
  step({ id: `${label}-install`, label: `Installing deps (${label})...`, icon: 'plan', status: 'active' })
  let installOk = false
  try {
    await execFileAsync('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], {
      cwd: repoPath, timeout: 120_000, encoding: 'utf8', windowsHide: true,
    })
    installOk = true
    step({ id: `${label}-install`, label: `Deps installed (${label})`, icon: 'plan', status: 'done', summary: 'npm install OK' })
  } catch (err) {
    step({ id: `${label}-install`, label: `Install failed (${label})`, icon: 'plan', status: 'error', summary: err.message?.slice(0, 200) })
  }

  // Step 2: npm run build (try common build commands)
  step({ id: `${label}-build`, label: `Building project (${label})...`, icon: 'test', status: 'active' })
  let buildOk = false
  let buildOutput = ''
  const pkg = readPackageJson(repoPath)
  const buildCmd = detectBuildCommand(pkg)

  if (installOk && buildCmd) {
    try {
      const result = await execFileAsync(buildCmd.cmd, buildCmd.args, {
        cwd: repoPath, timeout: 120_000, encoding: 'utf8', windowsHide: true,
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' },
      })
      buildOk = true
      buildOutput = result.stdout?.slice(0, 2000) || 'Build OK'
      step({ id: `${label}-build`, label: `Build passed (${label})`, icon: 'test', status: 'done', summary: buildCmd.cmd + ' ' + buildCmd.args.join(' ') })
    } catch (err) {
      buildOutput = (err.stdout || '') + '\n' + (err.stderr || '')
      buildOutput = buildOutput.slice(0, 2000)
      step({ id: `${label}-build`, label: `Build failed (${label})`, icon: 'test', status: 'error', summary: err.message?.slice(0, 200) })
    }
  } else if (!installOk) {
    buildOutput = 'Skipped: npm install failed'
    step({ id: `${label}-build`, label: `Build skipped (${label})`, icon: 'test', status: 'error', summary: 'Deps not installed' })
  } else {
    buildOutput = 'No build command detected in package.json'
    step({ id: `${label}-build`, label: `Build skipped (${label})`, icon: 'test', status: 'done', summary: 'No build script' })
  }

  // Step 3: Serve and screenshot
  step({ id: `${label}-screenshot`, label: `Capturing screenshot (${label})...`, icon: 'test', status: 'active' })
  let screenshotOk = false

  const distDir = findDistDir(repoPath)
  if (buildOk && distDir && chromium) {
    const port = randomInt(20000, 40000)
    let server = null
    try {
      server = await serveStatic(distDir, port)
      // Wait for server to be ready
      await waitForPort(port, 5000)
      const page = await chromium.newPage({ viewport: { width: 1920, height: 1080 } })
      try {
        await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle', timeout: 15000 })
        await page.waitForTimeout(2000) // let animations settle
        await page.screenshot({ path: screenshotPath, fullPage: false })
        screenshotOk = true
        step({ id: `${label}-screenshot`, label: `Screenshot captured (${label})`, icon: 'test', status: 'done', summary: screenshotPath })
      } catch (err) {
        // Try /dashboard as fallback
        try {
          await page.goto(`http://localhost:${port}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 })
          await page.waitForTimeout(1000)
          await page.screenshot({ path: screenshotPath, fullPage: false })
          screenshotOk = true
          step({ id: `${label}-screenshot`, label: `Screenshot captured (${label})`, icon: 'test', status: 'done', summary: screenshotPath })
        } catch {
          step({ id: `${label}-screenshot`, label: `Screenshot failed (${label})`, icon: 'test', status: 'error', summary: err.message?.slice(0, 200) })
        }
      } finally {
        await page.close().catch(() => {})
      }
    } catch (err) {
      step({ id: `${label}-screenshot`, label: `Screenshot failed (${label})`, icon: 'test', status: 'error', summary: err.message?.slice(0, 200) })
    } finally {
      if (server) server.close(() => {})
    }
  } else {
    const reason = !chromium ? 'Playwright not available' : !distDir ? 'No dist directory found' : 'Build failed'
    step({ id: `${label}-screenshot`, label: `Screenshot skipped (${label})`, icon: 'test', status: 'done', summary: reason })
  }

  return {
    screenshotPath: screenshotOk ? screenshotPath : null,
    buildOk,
    buildOutput: buildOutput.slice(0, 2000),
    buildDurationMs: Date.now() - startMs,
  }
}

function readPackageJson(repoPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

function detectBuildCommand(pkg) {
  if (!pkg?.scripts) return null
  const scripts = pkg.scripts
  // Prefer: build, then next build, then vite build, then production
  if (scripts.build) return { cmd: 'npm', args: ['run', 'build'] }
  if (scripts.production) return { cmd: 'npm', args: ['run', 'production'] }
  if (scripts.start?.includes('next')) return { cmd: 'npx', args: ['next', 'build'] }
  return null
}

function findDistDir(repoPath) {
  const candidates = ['dist', 'build', '.next', 'out', 'public']
  for (const c of candidates) {
    const p = path.join(repoPath, c)
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
  }
  return null
}

const MIME_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain',
}

function serveStatic(dirPath, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(dirPath, req.url === '/' ? 'index.html' : req.url)
      const ext = path.extname(filePath)
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'
      fs.readFile(filePath, (err, data) => {
        if (err) {
          fs.readFile(path.join(dirPath, 'index.html'), (err2, fallback) => {
            if (err2) { res.writeHead(404); res.end(); return }
            res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fallback)
          })
          return
        }
        res.writeHead(200, { 'Content-Type': contentType }); res.end(data)
      })
    })
    server.listen(port, '127.0.0.1', () => resolve(server))
    server.on('error', reject)
  })
}

function waitForPort(port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume()
        resolve(true)
      })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) resolve(false)
        else setTimeout(check, 100)
      })
      req.end()
    }
    check()
  })
}
