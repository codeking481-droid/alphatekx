/**
 * WATCH MODE — Alpha remembers your sites and watches for future breakage.
 *
 * - Registry persisted at data/watch-sites.json
 * - Every 60s tick: any site whose interval elapsed gets a health probe
 *   (fetch + full static diagnosis)
 * - Degraded sites trigger a full automatic restoration (one at a time,
 *   6h per-site cooldown) using the same V3 pipeline as manual restores
 *
 * Routes:
 *   GET  /api/watch/list                  — all watched sites + last results
 *   GET  /api/watch/status                — scheduler status
 *   POST /api/watch/add    {url,interval} — start watching
 *   POST /api/watch/remove {id}           — stop watching
 */

import fs from 'node:fs'
import path from 'node:path'

const REGISTRY_PATH = path.resolve(process.cwd(), 'data', 'watch-sites.json')
const TICK_MS = 60_000
const REPAIR_COOLDOWN_MS = 6 * 60 * 60 * 1000
const HEALTHY_ISSUE_THRESHOLD = 2
const AUTO_REPAIR = String(process.env.ALPHA_WATCH_AUTOREPAIR ?? '1') !== '0'

const scheduler = {
  timer: null,
  startedAt: null,
  repairing: false,
  lastTickAt: null,
  repairsRun: 0,
}

function readRegistry() {
  try {
    const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))
    if (Array.isArray(raw?.sites)) return raw
  } catch {}
  return { sites: [] }
}

function writeRegistry(reg) {
  try {
    fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true })
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2))
  } catch {}
}

function normalizeTargetUrl(raw) {
  let url = String(raw || '').trim()
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '')
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

async function probeSite(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlphaTekXWatch/1.0)' },
    signal: AbortSignal.timeout(30_000),
    redirect: 'follow',
  })
  const html = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { diagnose } = await import('./alphaRestorationPipeline.mjs')
  const diagnosis = await diagnose(html)
  return {
    reachable: true,
    issueCount: Number(diagnosis?.summary?.total ?? 0),
    criticalCount: Number(diagnosis?.summary?.critical ?? 0),
    score: Number(diagnosis?.score ?? 100),
    topIssues: (diagnosis?.issues || []).slice(0, 5).map((i) => i.description || i.type),
  }
}

async function repairSite(site) {
  scheduler.repairing = true
  site.status = 'repairing'
  site.repairStartedAt = new Date().toISOString()
  try {
    const mod = await import('./alphaRestorationPipeline.mjs')
    const events = []
    const result = await mod.runRestorationPipeline({
      targetUrl: site.url,
      mode: 'full',
      origin: process.env.PUBLIC_APP_URL || 'http://localhost:3001',
      cookieHeader: '',
      maxPages: 1,
      sendEvent: (event) => {
        if (event?.type === 'restore_complete' || event?.type === 'error') events.push(event)
      },
      sendStep: () => {},
    })
    const complete = events.find((e) => e.type === 'restore_complete')
    const failed = events.find((e) => e.type === 'error')
    site.lastRestorationId = complete?.restorationId || null
    site.lastScoreAfter = complete?.data?.summary?.after_score ?? result?.score ?? null
    site.status = complete ? 'repaired' : failed ? 'repair_failed' : 'repair_unknown'
    if (failed) site.lastError = String(failed.message || '').slice(0, 300)
    else delete site.lastError
    scheduler.repairsRun += 1
  } catch (err) {
    site.status = 'repair_failed'
    site.lastError = String(err instanceof Error ? err.message : err).slice(0, 300)
  } finally {
    site.repairStartedAt = null
    scheduler.repairing = false
    writeRegistry(readRegistry())
  }
}

async function tick() {
  scheduler.lastTickAt = new Date().toISOString()
  const reg = readRegistry()
  const now = Date.now()
  for (const site of reg.sites) {
    if (scheduler.repairing) break
    if (site.status === 'repairing') continue
    const last = Date.parse(site.lastCheckedAt || '') || 0
    const intervalMs = Math.max(15, Number(site.intervalMinutes) || 720) * 60_000
    if (now - last < intervalMs) continue

    site.lastCheckedAt = new Date().toISOString()
    try {
      const probe = await probeSite(site.url)
      Object.assign(site, probe, { status: 'monitoring' })
      site.lastError = null
      const degraded = probe.issueCount > HEALTHY_ISSUE_THRESHOLD || probe.criticalCount > 0
      const cooledDown = now - (Date.parse(site.lastRepairedAt || '') || 0) > REPAIR_COOLDOWN_MS
      if (degraded && AUTO_REPAIR && cooledDown && !site.lastRestorationId) {
        site.lastRepairedAt = new Date().toISOString()
        writeRegistry(reg)
        await repairSite(site)
      } else if (degraded) {
        site.status = 'degraded'
      }
    } catch (err) {
      site.status = 'down'
      site.lastError = String(err instanceof Error ? err.message : err).slice(0, 300)
      site.issueCount = null
      site.score = null
    }
    writeRegistry(reg)
  }
}

export function startWatchScheduler() {
  if (scheduler.timer) return
  scheduler.startedAt = new Date().toISOString()
  scheduler.timer = setInterval(() => {
    void tick().catch(() => {})
  }, TICK_MS)
}

startWatchScheduler()

async function readJsonBody(req) {
  let body = ''
  for await (const chunk of req) body += chunk
  try {
    return JSON.parse(body || '{}')
  } catch {
    return {}
  }
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

export async function handleWatchRoute(req, res) {
  const parsed = new URL(req.url, 'http://localhost')

  if (req.method === 'GET' && parsed.pathname === '/api/watch/status') {
    const reg = readRegistry()
    return json(res, 200, {
      running: Boolean(scheduler.timer),
      startedAt: scheduler.startedAt,
      lastTickAt: scheduler.lastTickAt,
      repairing: scheduler.repairing,
      repairsRun: scheduler.repairsRun,
      autoRepair: AUTO_REPAIR,
      watching: reg.sites.length,
    })
  }

  if (req.method === 'GET' && parsed.pathname === '/api/watch/list') {
    const reg = readRegistry()
    return json(res, 200, { sites: reg.sites })
  }

  if (req.method === 'POST' && parsed.pathname === '/api/watch/add') {
    const body = await readJsonBody(req)
    const url = normalizeTargetUrl(body.url)
    if (!url) return json(res, 400, { error: 'A valid http(s) URL is required' })
    const reg = readRegistry()
    if (reg.sites.some((s) => s.url === url)) return json(res, 409, { error: 'Already watched' })
    const site = {
      id: `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      url,
      intervalMinutes: Math.min(20160, Math.max(15, parseInt(body.intervalMinutes, 10) || 720)),
      createdAt: new Date().toISOString(),
      lastCheckedAt: null,
      lastRepairedAt: null,
      lastRestorationId: null,
      status: 'pending',
    }
    reg.sites.push(site)
    writeRegistry(reg)
    return json(res, 200, { success: true, site })
  }

  if (req.method === 'POST' && parsed.pathname === '/api/watch/remove') {
    const body = await readJsonBody(req)
    const reg = readRegistry()
    const before = reg.sites.length
    reg.sites = reg.sites.filter((s) => s.id !== String(body.id || ''))
    if (reg.sites.length === before) return json(res, 404, { error: 'Not found' })
    writeRegistry(reg)
    return json(res, 200, { success: true })
  }

  return json(res, 404, { error: 'Unknown watch route' })
}
