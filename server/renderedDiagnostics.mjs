/**
 * ALPHATEKX RENDERED DIAGNOSTICS — the browser eye of the restoration agent.
 *
 * Loads a page in headless Chromium and captures what static analysis can
 * never see:
 *   - console errors / warnings emitted by real JavaScript execution
 *   - uncaught exceptions (pageerror)
 *   - failed network requests (DNS, aborted, TLS) and 4xx/5xx subresources
 *   - rendered DOM stats: element count, visible text, broken images
 *   - blank-render detection (page loads but shows nothing)
 *
 * Every probe is deadline-bounded and fails soft: any internal error returns
 * { ok:false } and the pipeline continues on static analysis alone.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 AlphaTekX-Restoration/4.0'

const DEFAULTS = {
  timeoutMs: 30_000,
  settleMs: 1500,
  viewport: { width: 1440, height: 900 },
}

export function isRenderProbeAvailable() {
  return Boolean(process.env.ALPHATEKX_DISABLE_RENDER_PROBE !== '1')
}

/**
 * Probe a fully-rendered page.
 * @returns {Promise<{ok:boolean, reason?:string, consoleErrors:Array, consoleWarnings:Array,
 *   pageErrors:Array, failedRequests:Array, badResponses:Array,
 *   stats:{title:string, elements:number, textLength:number, imgTotal:number, imgBroken:number},
 *   blankRender:boolean}>}
 */
export async function probeRenderedPage(targetUrl, opts = {}) {
  const { timeoutMs, settleMs, viewport } = { ...DEFAULTS, ...opts }
  const result = {
    ok: false,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    badResponses: [],
    stats: { title: '', elements: 0, textLength: 0, imgTotal: 0, imgBroken: 0 },
    blankRender: false,
  }

  let browser
  try {
    const mod = await import('playwright')
    const chromium = mod.default?.chromium || mod.chromium
    if (!chromium) return { ...result, reason: 'Playwright chromium unavailable' }
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })

    const page = await browser.newPage({ viewport, userAgent: UA })
    const deadline = Date.now() + timeoutMs

    page.on('console', (msg) => {
      try {
        if (msg.type() === 'error' && result.consoleErrors.length < 15) {
          result.consoleErrors.push({ text: String(msg.text()).slice(0, 300), location: msg.location()?.url || '' })
        } else if (msg.type() === 'warning' && result.consoleWarnings.length < 10) {
          result.consoleWarnings.push({ text: String(msg.text()).slice(0, 200), location: msg.location()?.url || '' })
        }
      } catch {}
    })
    page.on('pageerror', (err) => {
      if (result.pageErrors.length < 10) {
        result.pageErrors.push({ message: String(err?.message || err).slice(0, 300) })
      }
    })
    page.on('requestfailed', (req) => {
      if (result.failedRequests.length >= 12) return
      const failure = req.failure()?.errorText || 'unknown'
      // Ignore aborts caused by our own navigation timeouts — noise.
      if (failure === 'context or browser has been closed') return
      result.failedRequests.push({ url: req.url().slice(0, 300), resourceType: req.resourceType(), failure })
    })
    page.on('response', (res) => {
      if (result.badResponses.length >= 12) return
      const status = res.status()
      if (status < 400) return
      // Navigations are handled by goto; here we care about subresources.
      if (res.request().resourceType() === 'document') return
      result.badResponses.push({ url: res.url().slice(0, 300), status, resourceType: res.request().resourceType() })
    })

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 25000) }).catch((err) => {
      result.gotoError = String(err?.message || err).slice(0, 200)
    })

    const settleBudget = Math.max(200, Math.min(settleMs, deadline - Date.now()))
    await page.waitForTimeout(settleBudget).catch(() => {})

    result.stats = await page.evaluate(() => {
      try {
        const imgs = [...document.images]
        return {
          title: document.title || '',
          elements: document.querySelectorAll('*').length,
          textLength: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().length,
          imgTotal: imgs.length,
          imgBroken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
        }
      } catch {
        return { title: '', elements: 0, textLength: 0, imgTotal: 0, imgBroken: 0 }
      }
    }).catch(() => result.stats)

    // Blank render = loaded fine but shows essentially nothing after JS had its chance.
    result.blankRender = !result.gotoError && result.stats.textLength < 40 && result.stats.elements < 60

    result.ok = true
    await page.close().catch(() => {})
  } catch (err) {
    result.reason = String(err?.message || err).slice(0, 200)
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
  return result
}
