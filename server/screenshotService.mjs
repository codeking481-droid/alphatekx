/**
 * AlphaTekx Screenshot Service
 *
 * Captures full-page screenshots of any URL using Playwright.
 * Stores locally in data/screenshots/<id>/ and serves via API.
 *
 * Exports:
 *   captureScreenshot(url, options)  — capture a screenshot, return metadata
 *   getScreenshotPath(id, label)     — get absolute path for a stored screenshot
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const SHOTS_ROOT = path.join(process.cwd(), 'data', 'screenshots')

// ─── Capture ────────────────────────────────────────────────────────────────

/**
 * Capture a full-page screenshot of a URL.
 * @param {string} url - Target URL
 * @param {object} [opts]
 * @param {string} [opts.label]       - 'before' | 'after' | custom label
 * @param {string} [opts.scanId]      - Group screenshots under a scan ID
 * @param {number} [opts.width]       - Viewport width (default 1440)
 * @param {number} [opts.height]      - Viewport height (default 900)
 * @param {number} [opts.timeout]     - Navigation timeout ms (default 25000)
 * @param {boolean} [opts.fullPage]   - Capture full scrollable page (default false)
 * @returns {Promise<{id, url, filePath, width, height, capturedAt}>}
 */
export async function captureScreenshot(url, opts = {}) {
  const { withContext } = await import('../scanner/browserPool.mjs')

  const label = opts.label || 'capture'
  const scanId = opts.scanId || crypto.randomBytes(8).toString('hex')
  const shotId = `${scanId}-${label}-${Date.now().toString(36)}`
  const dir = path.join(SHOTS_ROOT, scanId)

  fs.mkdirSync(dir, { recursive: true })

  let result = null

  await withContext(async (context) => {
    const page = await context.newPage()
    try {
      const navRes = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: opts.timeout || 25000,
      })

      // Wait for network to settle
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

      // Small delay for rendering
      await page.waitForTimeout(1500)

      const fileName = `${label}.png`
      const filePath = path.join(dir, fileName)

      await page.screenshot({
        path: filePath,
        fullPage: opts.fullPage || false,
        type: 'png',
      })

      const meta = page.viewportSize() || { width: opts.width || 1440, height: opts.height || 900 }

      result = {
        id: shotId,
        scanId,
        label,
        url,
        filePath,
        fileName,
        width: meta.width,
        height: meta.height,
        statusCode: navRes?.status() || null,
        capturedAt: new Date().toISOString(),
        serveUrl: `/api/screenshot/${scanId}/${fileName}`,
      }
    } finally {
      await page.close().catch(() => {})
    }
  })

  if (!result) throw new Error('Screenshot capture failed')
  return result
}

// ─── Path helpers ───────────────────────────────────────────────────────────

/**
 * Get the absolute filesystem path for a stored screenshot.
 */
export function getScreenshotPath(scanId, label = 'before') {
  return path.join(SHOTS_ROOT, scanId, `${label}.png`)
}

/**
 * List all screenshots for a scan ID.
 */
export function listScreenshots(scanId) {
  const dir = path.join(SHOTS_ROOT, scanId)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.png'))
    .map(f => ({
      label: f.replace('.png', ''),
      fileName: f,
      filePath: path.join(dir, f),
      serveUrl: `/api/screenshot/${scanId}/${f}`,
      size: fs.statSync(path.join(dir, f)).size,
    }))
}

/**
 * Generate a diff overlay between two screenshots using sharp.
 * Highlights changed regions in yellow/red.
 */
export async function generateDiff(scanId) {
  const beforePath = getScreenshotPath(scanId, 'before')
  const afterPath = getScreenshotPath(scanId, 'after')
  if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) return null

  const sharp = (await import('sharp')).default

  const before = sharp(beforePath).resize(1440, 900, { fit: 'cover' })
  const after = sharp(afterPath).resize(1440, 900, { fit: 'cover' })

  const beforeMeta = await before.metadata()
  const afterMeta = await after.metadata()

  const width = Math.max(beforeMeta.width || 1440, afterMeta.width || 1440)
  const height = Math.max(beforeMeta.height || 900, afterMeta.height || 900)

  const beforeBuf = await before.raw().toBuffer()
  const afterBuf = await after.raw().toBuffer()

  // Create diff: pixel-by-pixel comparison with tolerance
  const diffChannels = 3
  const diffBuf = Buffer.alloc(width * height * diffChannels)
  let changedPixels = 0
  const totalPixels = width * height
  const tolerance = 30 // per-channel difference threshold

  for (let i = 0; i < beforeBuf.length && i < afterBuf.length && i < diffBuf.length; i += diffChannels) {
    const rDiff = Math.abs(beforeBuf[i] - afterBuf[i])
    const gDiff = Math.abs(beforeBuf[i + 1] - afterBuf[i + 1])
    const bDiff = Math.abs(beforeBuf[i + 2] - afterBuf[i + 2])

    if (rDiff > tolerance || gDiff > tolerance || bDiff > tolerance) {
      // Highlight changed pixels in magenta
      diffBuf[i] = 255      // R
      diffBuf[i + 1] = 0    // G
      diffBuf[i + 2] = 255  // B
      changedPixels++
    } else {
      // Unchanged: dim grayscale
      const gray = Math.round((beforeBuf[i] + afterBuf[i]) / 2 * 0.3)
      diffBuf[i] = gray
      diffBuf[i + 1] = gray
      diffBuf[i + 2] = gray
    }
  }

  const diffPath = getScreenshotPath(scanId, 'diff')
  await sharp(diffBuf, { raw: { width, height, channels: diffChannels } })
    .png()
    .toFile(diffPath)

  return {
    scanId,
    diffUrl: `/api/screenshot/${scanId}/diff.png`,
    changedPixels,
    totalPixels,
    changePercent: ((changedPixels / totalPixels) * 100).toFixed(1),
    capturedAt: new Date().toISOString(),
  }
}
