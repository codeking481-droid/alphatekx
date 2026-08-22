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
  try {
    const mod = await import('playwright')
    const chromium = mod.default?.chromium || mod.chromium
    if (!chromium) return { ...emptyResult(), reason: 'Playwright chromium unavailable' }
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    try {
      return await probeWithBrowser(browser, targetUrl, { timeoutMs, settleMs, viewport })
    } finally {
      await browser.close().catch(() => {})
    }
  } catch (err) {
    return { ...emptyResult(), reason: String(err?.message || err).slice(0, 200) }
  }
}

function emptyResult() {
  return {
    ok: false,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    badResponses: [],
    stats: { title: '', elements: 0, textLength: 0, imgTotal: 0, imgBroken: 0 },
    blankRender: false,
  }
}

async function probeWithBrowser(browser, targetUrl, { timeoutMs = DEFAULTS.timeoutMs, settleMs = DEFAULTS.settleMs, viewport = DEFAULTS.viewport } = {}) {
  const result = emptyResult()
  try {
    const page = await browser.newPage({ viewport, userAgent: UA })
    const deadline = Date.now() + timeoutMs

    // pageerror only fires for the MAIN frame — launcher shells hide the real
    // app inside child iframes. Bridge their uncaught errors into the console,
    // where the listener below already collects them.
    await page.addInitScript(() => {
      if (window.top === window) return
      const report = (kind, message, stack) => {
        try { console.error(`[alpha-frame:${kind}] ${message} :: ${String(stack || '').slice(0, 200)}`) } catch {}
      }
      addEventListener('error', (e) => {
        report('error', e.message || (e.error && e.error.message) || 'script error', e.error && e.error.stack)
      }, true)
      addEventListener('unhandledrejection', (e) => {
        const r = e.reason
        report('promise', String((r && r.message) || r), r && r.stack)
      }, true)
    }).catch(() => {})

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
  }
  return result
}

// ─── Multi-page render sessions ──────────────────────────────────────────────

/**
 * A reusable browser session for whole-site runs. One Chromium instance
 * serves every page probe and screenshot in the restoration — launching a
 * fresh browser per page would multiply runtime and memory on Render.
 * Returns null (never throws) when Playwright is unavailable or disabled;
 * callers fall back to static analysis.
 */
export async function createRenderSession() {
  if (!isRenderProbeAvailable()) return null
  try {
    const mod = await import('playwright')
    const chromium = mod.default?.chromium || mod.chromium
    if (!chromium) return null
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    let closed = false
    return {
      /** Probe a URL with the shared browser. Same shape as probeRenderedPage. */
      async probe(url, opts = {}) {
        if (closed) return { ...emptyResult(), reason: 'Session closed' }
        return probeWithBrowser(browser, url, opts)
      },
      /** Screenshot a URL into filePath using the shared browser. */
      async screenshot(url, filePath, opts = {}) {
        if (closed) return null
        const page = await browser.newPage({ viewport: opts.viewport || DEFAULTS.viewport, userAgent: UA }).catch(() => null)
        if (!page) return null
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
          await page.waitForTimeout(1200)
          await page.screenshot({ path: filePath, fullPage: false })
          return { filePath, filename: filePath.split(/[\\/]/).pop() }
        } catch {
          return null
        } finally {
          await page.close().catch(() => {})
        }
      },
      /**
       * Harvest LIVE design DNA from the fully-rendered page: computed-style
       * colors/fonts/spacing plus real interaction counts. Static regex over
       * the raw HTML reads zeros for React/Vue/Svelte apps — this reads what
       * the user actually sees. Returns null (never throws) on failure.
       */
      async harvest(url, opts = {}) {
        if (closed) return null
        const page = await browser.newPage({ viewport: opts.viewport || DEFAULTS.viewport, userAgent: UA }).catch(() => null)
        if (!page) return null
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
          await page.waitForTimeout(Math.max(800, opts.settleMs || 2200))
          return await page.evaluate(() => {
            const out = { colors: [], fonts: [], spacing: [], interactions: { links: 0, buttons: 0, forms: 0, hoverStates: 0, scrollListeners: 0 }, live: true }
            try {
              const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim()
              const colorSet = new Set(); const fontSet = new Set(); const spaceSet = new Set()
              const els = [...document.querySelectorAll('*')]
              let sampled = 0
              for (const el of els) {
                if (sampled >= 4000) break
                sampled++
                let cs; try { cs = getComputedStyle(el) } catch { continue }
                if (!cs) continue
                for (const prop of ['color', 'backgroundColor', 'borderTopColor']) {
                  const v = norm(cs[prop])
                  if (v && !/rgba\(0, 0, 0, 0\)/.test(v)) colorSet.add(v)
                }
                const fam = norm(cs.fontFamily).split(',')[0].replace(/["']/g, '')
                if (fam) fontSet.add(fam)
                for (const prop of ['marginTop', 'paddingLeft', 'gap', 'rowGap']) {
                  const v = norm(cs[prop])
                  if (v && v !== '0px' && v !== 'normal') spaceSet.add(v)
                }
              }
              out.colors = [...colorSet].sort().slice(0, 48)
              out.fonts = [...fontSet].sort().slice(0, 12)
              out.spacing = [...spaceSet].sort((a, b) => parseFloat(a) - parseFloat(b)).slice(0, 24)
              const ix = out.interactions
              ix.links = document.querySelectorAll('a[href]').length
              ix.buttons = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').length
              ix.forms = document.querySelectorAll('form').length
              let hover = 0
              for (const sheet of document.styleSheets) {
                let rules; try { rules = sheet.cssRules } catch { continue }
                if (!rules) continue
                for (const r of rules) { if (r.selectorText && r.selectorText.includes(':hover')) hover++ }
              }
              ix.hoverStates = hover
              let scrollables = 0
              for (const el of els) {
                let cs; try { cs = getComputedStyle(el) } catch { continue }
                if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) scrollables++
              }
              ix.scrollListeners = scrollables
            } catch {}
            return out
          }).catch(() => null)
        } catch {
          return null
        } finally {
          await page.close().catch(() => {})
        }
      },
      async close() {
        closed = true
        await browser.close().catch(() => {})
      },
    }
  } catch {
    return null
  }
}
