// Shared Playwright browser pool for the AlphaTekX scanner.
// One chromium process is reused across scans; each scan leases an isolated context.

import { chromium } from 'playwright'

const DEFAULT_MAX_CONTEXTS = Number(process.env.SCANNER_MAX_CONTEXTS || 4)
const IDLE_SHUTDOWN_MS = Number(process.env.SCANNER_IDLE_SHUTDOWN_MS || 5 * 60 * 1000)

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

let browserPromise = null
let activeContexts = 0
let idleTimer = null
const waiters = []

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

function scheduleIdleShutdown() {
  clearIdleTimer()
  if (activeContexts > 0 || !browserPromise) return
  idleTimer = setTimeout(() => {
    void closeBrowserPool()
  }, IDLE_SHUTDOWN_MS)
  idleTimer.unref?.()
}

async function getBrowser() {
  if (browserPromise) {
    const cached = await browserPromise.catch(() => null)
    if (cached?.isConnected()) return cached
    browserPromise = null
  }

  const launch = chromium
    .launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    })
    .then((browser) => {
      // A crashed or externally killed chromium must not stay cached.
      browser.on('disconnected', () => {
        if (browserPromise === launch) browserPromise = null
      })
      return browser
    })
    .catch((error) => {
      if (browserPromise === launch) browserPromise = null
      throw error
    })

  browserPromise = launch
  return launch
}

async function acquireSlot() {
  if (activeContexts < DEFAULT_MAX_CONTEXTS) {
    activeContexts += 1
    return
  }
  await new Promise((resolve) => waiters.push(resolve))
  activeContexts += 1
}

function releaseSlot() {
  activeContexts = Math.max(0, activeContexts - 1)
  const next = waiters.shift()
  if (next) next()
  else scheduleIdleShutdown()
}

// Runs `fn` with a fresh isolated browser context and always releases the slot.
export async function withContext(fn, options = {}) {
  await acquireSlot()
  clearIdleTimer()

  let context = null
  try {
    const browser = await getBrowser()
    context = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent: USER_AGENT,
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
      ...options,
    })
    context.setDefaultTimeout(Number(process.env.SCANNER_TIMEOUT_MS || 30000))
    return await fn(context)
  } finally {
    await context?.close().catch(() => {})
    releaseSlot()
  }
}

export async function closeBrowserPool() {
  clearIdleTimer()
  const pending = browserPromise
  browserPromise = null
  if (!pending) return
  const browser = await pending.catch(() => null)
  await browser?.close().catch(() => {})
}

export function poolStats() {
  return { activeContexts, queued: waiters.length, maxContexts: DEFAULT_MAX_CONTEXTS, launched: Boolean(browserPromise) }
}
