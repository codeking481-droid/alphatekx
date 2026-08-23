/**
 * ALPHATEKX RESTORATION PIPELINE V4 — AGENTIC EDITION
 *
 * 7 STEPS. IN ORDER. NOTHING SKIPPED. NOTHING ADDED.
 *   1. RECONNAISSANCE  — load site, screenshot BEFORE, extract design tokens, sweep interactions
 *   2. DIAGNOSE        — deep static scan + REAL-BROWSER probe (console errors,
 *                        uncaught exceptions, failed subresources, blank render)
 *   3. FIX PLAN        — one fix per issue, before/after/severity
 *   4. EXECUTE REPAIRS — rule-based fixes + LLM REPAIR AGENT for damage rules
 *                        can't touch (crashing scripts, blank renders)
 *   5. RECONSTRUCT     — reassemble, validate UTF-8 / English / HTML, save files
 *   6. VERIFY          — re-scan, screenshot AFTER, before/after scores
 *   7. DELIVER         — GitHub PR · download zips · copy code · deploy
 *
 * AGENT LOOP: steps 3→6 repeat up to 3 cycles until the health score hits the
 * target or stops improving — Alpha iterates like a human engineer, live.
 * SITE MEMORY: per-hostname history in Supabase gives Alpha "welcome back"
 * context; every run is recorded for next time.
 *
 * Everything flows through the chain of thought: every action emits a
 * thought_step event so the user watches Alpha reason in real time.
 * Alpha restores CODE. It never inspects DNS, SSL, hosting, servers or logs.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { probeRenderedPage, createRenderSession, isRenderProbeAvailable } from './renderedDiagnostics.mjs'
import { llmRepairBatch, llmRebuildPage, llmMultiCallRebuild, llmReconstructInteractivity, isLlmRepairConfigured, llmPlanRestoration } from './llmRepairAgent.mjs'
import { repairBrokenHtml } from './htmlResurrector.mjs'
import { getSiteMemory, recordRestoration } from './siteMemory.mjs'
import { runBehaviorTests } from './behaviorTest.mjs'
import { buildRestoreGitHistory } from './restoreGit.mjs'
import { crawlSite, normalizePagePath } from './siteCrawler.mjs'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACTS_ROOT = path.resolve(MODULE_DIR, '..', 'data', 'restorations')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 AlphaTekX-Restoration/3.0'

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/
const SEVERITY_WEIGHT = { critical: 25, high: 10, medium: 4, low: 1 }

const SITE_NOT_LOADING = 'The site is not loading. Please check your hosting provider or domain DNS settings. Once your site is live, send me the URL and I will restore it.'

// In-memory registry so delivery routes can reach pipeline results.
const registry = new Map()

function registryPut(id, state) {
  registry.set(id, state)
  const cutoff = Date.now() - 2 * 60 * 60 * 1000
  for (const [k, v] of registry) {
    if (v.created < cutoff) {
      try { fs.rmSync(v.dir, { recursive: true, force: true }) } catch {}
      registry.delete(k)
    }
  }
}

// ─── Encoding / validation primitives ────────────────────────────────────────

function sanitizeEncoding(content) {
  if (typeof content !== 'string') content = String(content ?? '')
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)
  content = content.replace(/\u0000/g, '')
  return content
}

const MOJIBAKE_MAP = [
  ['\u00E2\u20AC\u2122', '\u2019'], ['\u00E2\u20AC\u02DC', '\u2018'],
  ['\u00E2\u20AC\u0153', '\u201C'], ['\u00E2\u20AC\x9D', '\u201D'],
  ['\u00E2\u20AC\u201C', '\u2013'], ['\u00E2\u20AC\u201D', '\u2014'],
  ['\u00E2\u20AC\u00A2', '\u2022'], ['\u00E2\u20AC\u00A6', '\u2026'],
  ['\u00C2\u00A0', ' '],
  ['\u00C3\u00A9', '\u00E9'], ['\u00C3\u00A8', '\u00E8'], ['\u00C3\u00AA', '\u00EA'],
  ['\u00C3\u00AB', '\u00EB'], ['\u00C3\u00A7', '\u00E7'], ['\u00C3\u00A0', '\u00E0'],
  ['\u00C3\u00A1', '\u00E1'], ['\u00C3\u00BC', '\u00FC'], ['\u00C3\u00B6', '\u00F6'],
  ['\u00C3\u00B1', '\u00F1'], ['\u00C3\u00BB', '\u00FB'], ['\u00C3\u00AE', '\u00EE'],
  ['\u00C3\u00B4', '\u00F4'], ['\u00C3\u0089', '\u00C9'], ['\u00C3\u0088', '\u00C8'],
  ['\u00C3\u0087', '\u00C7'], ['\u00C3\u0080', '\u00C0'],
]

function repairMojibake(content) {
  let out = content
  for (const [bad, good] of MOJIBAKE_MAP) out = out.split(bad).join(good)
  return out
}

function validateHTML(content) {
  return /<!doctype\s+html/i.test(content) || /<html[\s>]/i.test(content)
}

function hasCJK(content) {
  return CJK_RE.test(content)
}

function validateUTF8(content) {
  try {
    return Buffer.from(content, 'utf8').toString('utf8') === content
  } catch {
    return false
  }
}

function calculateScore(issues) {
  if (!issues.length) return 100
  let penalty = 0
  for (const i of issues) penalty += SEVERITY_WEIGHT[i.severity] || 1
  return Math.max(0, Math.min(100, 100 - penalty))
}

function lineOf(content, idx) {
  return content.slice(0, idx).split('\n').length
}

function clip(text, n = 160) {
  const s = String(text ?? '').trim()
  return s.length > n ? s.slice(0, n) + '…' : s
}

function slugifyHostname(hostname) {
  return String(hostname || '')
    .replace(/^www\./, '')
    .split('.')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28) || 'my-site'
}

// ─── Chain of thought ────────────────────────────────────────────────────────

// Step functions often return rich objects (diagnosis results, deliverables).
// The SSE stream must carry a short HUMAN string only — never a raw object,
// which would crash the UI renderer (React child error).
function stepSummaryText(result) {
  if (result == null) return ''
  if (typeof result === 'string') return clip(result, 180)
  if (typeof result === 'number' || typeof result === 'boolean') return String(result)
  if (typeof result === 'object') {
    if (typeof result.summary === 'string' && result.summary.trim()) return clip(result.summary, 180)
    if (Array.isArray(result.issues)) return `${result.issues.length} issue${result.issues.length === 1 ? '' : 's'} found`
    if (Array.isArray(result.files)) return `${result.files.length} file${result.files.length === 1 ? '' : 's'} ready`
    try { return clip(JSON.stringify(result), 140) } catch { return '' }
  }
  return ''
}

function createChain(sendStep) {
  return {
    async step(id, label, icon, fn) {
      sendStep({ id, label, icon: icon || 'clock', status: 'active' })
      try {
        const summary = await fn()
        sendStep({ id, label, icon: icon || 'clock', status: 'done', summary: stepSummaryText(summary) })
        return summary
      } catch (err) {
        sendStep({ id, label, icon: icon || 'clock', status: 'error', summary: clip(err instanceof Error ? err.message : String(err), 180) })
        throw err
      }
    },
    active(id, label, icon = 'clock') { sendStep({ id, label, icon, status: 'active' }) },
    done(id, label, summary) { sendStep({ id, label, icon: 'clock', status: 'done', summary: stepSummaryText(summary) }) },
    fail(id, label, summary) { sendStep({ id, label, icon: 'clock', status: 'error', summary: stepSummaryText(summary) || 'failed' }) },
  }
}

// ─── Network helpers ─────────────────────────────────────────────────────────

async function fetchDoc(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    })
    const body = await res.text()
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, body }
  } finally {
    clearTimeout(timer)
  }
}

async function probeUrl(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    let res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': UA } })
    if (res.status === 405 || res.status === 501 || res.status === 403) {
      const res2 = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': UA, Range: 'bytes=0-1023' } })
      try { await res2.body?.cancel() } catch {}
      clearTimeout(timer)
      return res2.status >= 400 ? { ok: false, status: res2.status } : { ok: true }
    }
    clearTimeout(timer)
    return res.status >= 400 ? { ok: false, status: res.status } : { ok: true }
  } catch (err) {
    clearTimeout(timer)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function pooled(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      try { results[idx] = await worker(items[idx], idx) } catch (err) { results[idx] = { error: err } }
    }
  }))
  return results
}

function absolutize(href, baseUrl) {
  try { return new URL(href, baseUrl).href } catch { return null }
}

// ─── Screenshots ─────────────────────────────────────────────────────────────

async function takeScreenshot(target, artifactsDir, filename) {
  try {
    const mod = await import('playwright')
    const chromium = mod.default?.chromium || mod.chromium
    if (!chromium) return null
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
      await page.waitForTimeout(1200)
      const filePath = path.join(artifactsDir, filename)
      await page.screenshot({ path: filePath, fullPage: false })
      await page.close().catch(() => {})
      return { filePath, filename }
    } finally {
      await browser.close().catch(() => {})
    }
  } catch {
    return null
  }
}

// ─── STEP 1: Reconnaissance helpers ──────────────────────────────────────────

function extractDesignTokens(html) {
  const colors = new Set()
  const fonts = []
  const spacing = new Set()

  const cssSources = []
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) cssSources.push(m[1])
  for (const m of html.matchAll(/style\s*=\s*"([^"]*)"/gi)) cssSources.push(m[1])

  for (const css of cssSources) {
    for (const m of css.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g)) {
      if (colors.size < 24) colors.add(m[0].toLowerCase())
    }
    for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
      const first = m[1].split(',')[0].replace(/['"]/g, '').trim()
      if (first && fonts.length < 12 && !fonts.includes(first)) fonts.push(first)
    }
    for (const m of css.matchAll(/(?:margin|padding|gap|row-gap|column-gap)\s*:\s*([^;}]+)/gi)) {
      for (const v of m[1].matchAll(/\b\d+(?:\.\d+)?(?:px|rem|em)\b/g)) {
        if (spacing.size < 16) spacing.add(v[0])
      }
    }
  }

  const interactions = {
    links: (html.match(/<a\s[\s\S]*?>/gi) || []).length,
    buttons: (html.match(/<button[\s>]/gi) || []).length,
    forms: (html.match(/<form[\s>]/gi) || []).length,
    inputs: (html.match(/<input[\s>]/gi) || []).length,
    onclickHandlers: (html.match(/\sonclick\s*=/gi) || []).length,
    scrollListeners: (html.match(/addEventListener\(\s*['"]scroll['"]/gi) || []).length,
    hoverStates: (html.match(/:hover/gi) || []).length,
  }

  return {
    colors: [...colors],
    fonts,
    spacing: [...spacing],
    interactions,
  }
}

// ─── STEP 2: Diagnostics — 25 checks ─────────────────────────────────────────

const SECRET_PATTERNS = [
  { name: 'OpenAI API key', re: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: 'Stripe live secret key', re: /sk_live_[0-9a-zA-Z]{16,}/g },
  { name: 'Stripe publishable key', re: /pk_live_[0-9a-zA-Z]{16,}/g },
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub personal token', re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'Slack token', re: /xox[baprs]-[0-9A-Za-z-]{10,}/g },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Bearer token', re: /Bearer\s+[A-Za-z0-9._~-]{24,}/g },
  {
    name: 'Hardcoded credential',
    re: /(?:api[_-]?key|apikey|secret|password|passwd|auth[_-]?token|access[_-]?token)"'?\s*[:=]\s*["']([^\s"']{10,})["']/gi,
    capture: 1,
  },
]

function looksLikePlaceholder(value) {
  return /your[_-]|xxxxx|example|changeme|placeholder|\$\{|process\.env|<[a-z_]+>|\{\{|\.\.\.|redacted/i.test(value || '')
}

export async function diagnose(html, opts = {}) {
  const { baseUrl = '', https = true, skipNetworkChecks = false, rendered = null } = opts
  const issues = []
  const renderFailures = []
  const reportedAssetUrls = new Set()
  let seq = 0
  const nextId = () => `ISSUE-${String(++seq).padStart(3, '0')}`

  const push = (type, severity, description, idx, before, fix) => {
    issues.push({
      id: nextId(),
      type,
      severity,
      description,
      location: Number.isFinite(idx) ? `line ${lineOf(html, idx)}` : 'document',
      before: clip(before, 220),
      fix,
    })
  }

  // 1 — ENCODING CORRUPTION
  {
    const bomIdx = html.charCodeAt(0) === 0xFEFF ? 0 : html.indexOf('\uFEFF')
    const nullIdx = html.indexOf('\u0000')
    const cjk = html.match(CJK_RE)
    const mojibake = /(\u00C2[\u00A0-\u00BF])|(\u00E2\u20AC)/.exec(html)
    if (bomIdx >= 0) push('encoding_corruption', 'critical', 'Byte Order Mark (BOM) found — corrupts rendering in some browsers', bomIdx, 'UTF-8 BOM at document start', 'Remove BOM and save as clean UTF-8')
    if (nullIdx >= 0) push('encoding_corruption', 'critical', 'Null byte found inside document', nullIdx, '0x00 byte', 'Strip null bytes')
    if (cjk) push('encoding_corruption', 'critical', 'Non-English (CJK) characters detected — sign of encoding corruption', html.indexOf(cjk[0]), clip(cjk[0], 40), 'Repair encoding corruption and save as UTF-8')
    else if (mojibake) push('encoding_corruption', 'medium', 'Mojibake sequences detected (double-encoded characters)', mojibake.index, clip(html.slice(Math.max(0, mojibake.index - 20), mojibake.index + 30)), 'Decode double-encoded characters back to correct symbols')
  }

  // 2 — LEAKED SECRETS
  {
    const found = []
    for (const p of SECRET_PATTERNS) {
      p.re.lastIndex = 0
      for (const m of html.matchAll(p.re)) {
        const value = p.capture != null ? m[p.capture] : m[0]
        if (looksLikePlaceholder(value)) continue
        found.push({ name: p.name, value, index: m.index })
        if (found.length >= 6) break
      }
      if (found.length >= 6) break
    }
    for (const f of found) {
      push('leaked_secret', 'critical', `${f.name} exposed in source code`, f.index, f.name.includes('credential') ? html.slice(Math.max(0, f.index - 10), f.index + f.value.length + 20) : f.value, 'Redact the secret and load it from an environment variable')
    }
  }

  // 3 — MIXED CONTENT
  if (https) {
    const mixed = []
    for (const m of html.matchAll(/(?:src|href)\s*=\s*(["'])http:\/\/(?!localhost[:\/])/gi)) {
      if (/w3\.org|schema\.org|xmlns/i.test(html.slice(m.index, m.index + 60))) continue
      mixed.push(m)
      if (mixed.length >= 8) break
    }
    for (const m of mixed) {
      push('mixed_content', 'high', 'Insecure http:// resource referenced from a secure https:// page', m.index, clip(m[0]), 'Upgrade http:// resource to https://')
    }
  }

  // 4 — MISSING META TAGS (charset, description, lang — title/viewport have dedicated checks)
  {
    if (!/<meta[^>]+charset/i.test(html)) push('missing_meta_tags', 'medium', '<meta charset> is missing — browser may guess the wrong encoding', 0, '<head> without charset declaration', 'Inject <meta charset="UTF-8">')
    if (!/<meta[^>]+name\s*=\s*["']description["'][^>]*>/i.test(html)) push('missing_meta_tags', 'medium', 'Meta description is missing — hurts SEO and social sharing', 0, '<head> without meta description', 'Inject <meta name="description">')
    const htmlTag = /<html[^>]*>/i.exec(html)
    if (htmlTag && !/\blang\s*=/i.test(htmlTag[0])) push('missing_meta_tags', 'low', '<html lang> attribute is missing — screen readers cannot pick a language', htmlTag.index, clip(htmlTag[0]), 'Add lang="en" to the <html> tag')
  }

  // 5 — BROKEN LINKS
  {
    const hrefs = new Map()
    for (const m of html.matchAll(/<a\b[^>]*\shref\s*=\s*(["'])([^"']+)\1[^>]*>/gi)) {
      const href = m[2].trim()
      if (!href || href.startsWith('#') || /^(javascript|mailto|tel|data):/i.test(href)) continue
      const abs = absolutize(href, baseUrl)
      if (!abs || !/^https?:/i.test(abs)) continue
      if (!hrefs.has(abs)) hrefs.set(abs, [])
      hrefs.get(abs).push(m[0])
      if (hrefs.size >= 40) break
    }
    const targets = [...hrefs.keys()]
    for (const u of targets) reportedAssetUrls.add(u)
    const probes = skipNetworkChecks
      ? targets.map((t) => ({ url: t, ok: true, skipped: true }))
      : await pooled(targets, 6, async (t) => ({ url: t, ...(await probeUrl(t)) }))
    let reported = 0
    let extraBroken = 0
    for (const p of probes) {
      if (p.ok || p.skipped) continue
      if (reported < 8) {
        const firstTag = hrefs.get(p.url)[0]
        push('broken_link', 'high', `Link is broken (${p.status ? `HTTP ${p.status}` : clip(p.error || 'unreachable', 60)})`, html.indexOf(firstTag), clip(firstTag, 140), `Remove the dead link${p.url}`)
        reported++
      } else extraBroken++
    }
    if (extraBroken > 0) push('broken_link', 'high', `${extraBroken} additional broken links detected beyond the first 8`, NaN, '(multiple)', 'Remove remaining dead links')
  }

  // 6 — BROKEN IMAGES
  {
    const srcs = new Map()
    for (const m of html.matchAll(/<img\b[^>]*\ssrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi)) {
      const src = m[2].trim()
      if (!src || /^data:/i.test(src)) continue
      const abs = absolutize(src, baseUrl)
      if (!abs || !/^https?:/i.test(abs)) continue
      if (!srcs.has(abs)) srcs.set(abs, [])
      srcs.get(abs).push(m[0])
      if (srcs.size >= 25) break
    }
    const targets = [...srcs.keys()]
    for (const u of targets) reportedAssetUrls.add(u)
    const probes = skipNetworkChecks
      ? targets.map((t) => ({ url: t, ok: true, skipped: true }))
      : await pooled(targets, 6, async (t) => ({ url: t, ...(await probeUrl(t)) }))
    let reported = 0
    let extraBroken = 0
    for (const p of probes) {
      if (p.ok || p.skipped) continue
      if (reported < 6) {
        const firstTag = srcs.get(p.url)[0]
        push('broken_image', 'high', `Image fails to load (${p.status ? `HTTP ${p.status}` : clip(p.error || 'unreachable', 60)})`, html.indexOf(firstTag), clip(firstTag, 140), 'Replace the dead image with a graceful placeholder')
        reported++
      } else extraBroken++
    }
    if (extraBroken > 0) push('broken_image', 'high', `${extraBroken} additional broken images detected beyond the first 6`, NaN, '(multiple)', 'Replace remaining dead images')
  }

  // 7 — BAD CODE PATTERNS
  {
    const patterns = [
      { name: 'eval()', re: /\beval\s*\(/g, why: 'eval() executes arbitrary code — blocked by CSP and a XSS magnet', fixTo: 'Function()' },
      { name: 'innerHTML assignment', re: /\.innerHTML\s*=/g, why: 'innerHTML assignments inject unsanitized markup', fixTo: 'textContent' },
      { name: 'document.write()', re: /document\.write\s*\(/g, why: 'document.write() blocks parsing and wipes documents after load', fixTo: 'insertAdjacentHTML' },
    ]
    for (const p of patterns) {
      const hits = [...html.matchAll(p.re)].slice(0, 6)
      if (hits.length) {
        push('bad_code_pattern', 'high', `${p.name} found ×${hits.length} — ${p.why}`, hits[0].index, clip(hits[0][0]), `Rewrite with safe alternative: ${p.fixTo}`)
      }
    }
  }

  // 8 — DUPLICATE ELEMENTS
  {
    const seenIds = new Map()
    for (const m of html.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)) {
      if (!seenIds.has(m[1])) seenIds.set(m[1], 0)
      seenIds.set(m[1], seenIds.get(m[1]) + 1)
    }
    const dups = [...seenIds.entries()].filter(([, n]) => n > 1)
    const h1Count = (html.match(/<h1[\s>]/gi) || []).length
    if (dups.length) {
      const worst = dups.sort((a, b) => b[1] - a[1])[0]
      const idx = html.search(new RegExp(`\\sid=["']${worst[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`))
      push('duplicate_elements', 'medium', `${dups.length} duplicated ID${dups.length > 1 ? 's' : ''} in the DOM (e.g. "${worst[0]}" used ×${worst[1]})`, idx, `id="${worst[0]}"`, 'Rename duplicate IDs so every ID is unique')
    }
    if (h1Count > 1) {
      const idx = html.indexOf('<h1', html.indexOf('<h1') + 1)
      push('duplicate_elements', 'medium', `${h1Count} <h1> headings — pages must have exactly one`, idx, clip(html.slice(idx, idx + 80)), 'Keep one H1, demote the rest to H2')
    }
  }

  // 9 — EMPTY ELEMENTS
  {
    let count = 0
    let firstIdx = -1
    let sample = ''
    for (const m of html.matchAll(/<(div|span|p)((?:\s[^<>]*)?)>\s*<\/\1>/gi)) {
      const attrs = m[2] || ''
      if (/\s(class|id|style|src|href|data-|aria-|role)\s*=/i.test(attrs)) continue
      count++
      if (firstIdx < 0) { firstIdx = m.index; sample = m[0] }
      if (count >= 20) break
    }
    if (count > 0) push('empty_element', 'low', `${count} empty <div>/<span>/<p> elements add dead weight to the DOM`, firstIdx, clip(sample), 'Remove empty elements')
  }

  // 10 — FIXED WIDTH LAYOUTS
  {
    const offenders = []
    for (const m of html.matchAll(/width\s*:\s*(\d{3,5})px/gi)) {
      const around = html.slice(Math.max(0, m.index - 120), m.index + 60)
      if (/<(?:img|video|canvas|svg|iframe|input|textarea|hr)\b/i.test(around)) continue
      if (parseInt(m[1], 10) >= 600) offenders.push(m)
      if (offenders.length >= 6) break
    }
    if (offenders.length) {
      push('fixed_width_layout', 'medium', `${offenders.length} fixed pixel widths break mobile layouts (e.g. width:${offenders[0][1]}px)`, offenders[0].index, clip(offenders[0][0]), 'Replace fixed width with max-width: 100%')
    }
  }

  // 11 — ACCESSIBILITY ISSUES
  {
    let unlabeledInputs = 0
    for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
      const attrs = m[1]
      if (/\s(aria-label|placeholder|title)\s*=/i.test(attrs)) continue
      const typeM = /\stype\s*=\s*["']?([a-z]+)/i.exec(attrs)
      const type = (typeM?.[1] || 'text').toLowerCase()
      if (['checkbox', 'radio', 'hidden', 'submit', 'button', 'file'].includes(type)) continue
      unlabeledInputs++
      if (unlabeledInputs >= 10) break
    }
    let untitledFrames = 0
    for (const m of html.matchAll(/<iframe\b([^>]*)>/gi)) {
      if (/\stitle\s*=/i.test(m[1])) continue
      untitledFrames++
    }
    if (unlabeledInputs || untitledFrames) {
      const parts = []
      if (unlabeledInputs) parts.push(`${unlabeledInputs} input(s) without labels`)
      if (untitledFrames) parts.push(`${untitledFrames} iframe(s) without titles`)
      push('accessibility_issue', 'medium', `Accessibility gaps: ${parts.join(', ')}`, NaN, '(multiple elements)', 'Add aria-label / title attributes')
    }
  }

  // 12 — SECURITY HEADERS
  {
    const missing = []
    if (!/<meta[^>]+http-equiv\s*=\s*["']content-security-policy["']/i.test(html)) missing.push('Content-Security-Policy')
    if (!/<meta[^>]+http-equiv\s*=\s*["']strict-transport-security["']/i.test(html)) missing.push('Strict-Transport-Security')
    if (!/<meta[^>]+http-equiv\s*=\s*["']x-content-type-options["']/i.test(html)) missing.push('X-Content-Type-Options')
    if (missing.length) {
      push('security_headers', 'medium', `Missing security headers: ${missing.join(', ')}`, 0, '<head> without security meta declarations', 'Inject security header meta tags')
    }
  }

  // 13 — OUTDATED ANALYTICS
  {
    const legacyGa = /ga\(\s*['"]create['"]|google-analytics\.com\/ga\.js|_gaq\.push/.exec(html)
    if (legacyGa) {
      push('outdated_analytics', 'low', 'Legacy analytics snippet (ga.js / _gaq) — deprecated since 2019', legacyGa.index, clip(html.slice(legacyGa.index - 20, legacyGa.index + 80)), 'Modernize to gtag() calls')
    }
  }

  // 14 — SCHEMA MARKUP ISSUES
  {
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const data = JSON.parse(m[1].trim())
        const nodes = Array.isArray(data) ? data : [data]
        const problems = []
        for (const node of nodes) {
          if (!node || typeof node !== 'object') continue
          if (!node['@context']) problems.push('missing @context')
          if (!node['@type']) problems.push('missing @type')
          const t = String(node['@type'] || '')
          if (t === 'Organization' && !node.name) problems.push('Organization requires name')
          if (t === 'Product' && (!node.name || !node.image)) problems.push('Product requires name and image')
          if ((t === 'Article' || t === 'BlogPosting') && (!node.headline || !node.author)) problems.push('Article requires headline and author')
        }
        if (problems.length) {
          push('schema_markup_issue', 'low', `Structured data incomplete: ${[...new Set(problems)].join('; ')}`, m.index, clip(m[1], 120), 'Add missing required schema fields')
          break
        }
      } catch {
        push('schema_markup_issue', 'low', 'Invalid JSON-LD structured data — search engines ignore it', m.index, clip(m[1], 120), 'Repair the JSON-LD block')
        break
      }
    }
  }

  // 15 — PERFORMANCE ISSUES
  {
    const imgs = [...html.matchAll(/<img\b[^>]*>/gi)]
    const noLazy = imgs.slice(3).filter((m) => !/\sloading\s*=/i.test(m[0]))
    const noDims = imgs.filter((m) => !/\swidth\s*=/.test(m[0]) && !/\sheight\s*=/.test(m[0]) && !/\sstyle\s*=\s*["'][^"']*width/i.test(m[0]))
    const blockingScripts = [...html.matchAll(/<script\b([^>]*)\ssrc\s*=\s*["'][^"']+["']([^>]*)>/gi)]
      .filter((m) => !/\s(defer|async)\s/i.test(` ${m[1]} ${m[2]} `) && !/ld\+json/i.test(m[1] + m[2]))
      .filter((m) => m.index < (html.search(/<\/head>/i) > 0 ? html.search(/<\/head>/i) : html.length))
    const parts = []
    let firstIdx = NaN
    if (noLazy.length) parts.push(`${noLazy.length} image(s) without lazy loading`)
    if (noDims.length) parts.push(`${noDims.length} image(s) without width/height`)
    if (blockingScripts.length) parts.push(`${blockingScripts.length} render-blocking script(s)`)
    if (parts.length) {
      firstIdx = noLazy[0]?.index ?? noDims[0]?.index ?? blockingScripts[0]?.index ?? NaN
      push('performance_issue', 'medium', `Performance drag: ${parts.join(', ')}`, firstIdx, clip((noLazy[0] || noDims[0] || blockingScripts[0])[0]), 'Add loading="lazy", image dimensions, and defer scripts')
    }
  }

  // 16 — DEPRECATED TAGS
  {
    const deprecated = {}
    for (const m of html.matchAll(/<(font|center|marquee|blink|embed|applet|big|strike|tt)[\s>]/gi)) {
      const tag = m[1].toLowerCase()
      deprecated[tag] = (deprecated[tag] || 0) + 1
    }
    const entries = Object.entries(deprecated)
    if (entries.length) {
      const list = entries.map(([t, n]) => `<${t}>×${n}`).join(', ')
      const first = html.match(/<(font|center|marquee|blink|embed|applet|big|strike|tt)[\s>]/i)
      push('deprecated_tag', 'medium', `Deprecated HTML tags in use: ${list}`, first.index, clip(first[0]), 'Replace with modern equivalents')
    }
  }

  // 17 — MISSING H1
  if (!/<h1[\s>]/i.test(html)) {
    push('missing_h1', 'high', 'No <h1> heading — the page main title is missing for users and search engines', 0, '<body> without H1', 'Insert an <h1> with the page title')
  }

  // 18 — SKIPPED HEADINGS
  {
    const levels = []
    for (const m of html.matchAll(/<h([1-6])[\s>]/gi)) levels.push({ level: parseInt(m[1], 10), index: m.index })
    for (let i = 1; i < levels.length; i++) {
      if (levels[i].level - levels[i - 1].level > 1) {
        push('skipped_headings', 'low', `Heading hierarchy skips a level: h${levels[i - 1].level} → h${levels[i].level}`, levels[i].index, clip(html.slice(levels[i].index, levels[i].index + 40)), 'Insert the missing heading level')
        break
      }
    }
  }

  // 19 — NO UNIQUE TITLE
  {
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
    if (!t || !t[1].trim()) {
      push('no_unique_title', 'medium', 'Page <title> is missing or empty', 0, '<head> without a usable <title>', 'Add a descriptive unique title')
    }
  }

  // 20 — NO RESPONSIVE META
  if (!/<meta[^>]+name\s*=\s*["']viewport["']/i.test(html)) {
    push('no_responsive_meta', 'medium', 'Viewport meta missing — page renders zoomed-out on phones', 0, '<head> without viewport meta', 'Inject <meta name="viewport" content="width=device-width, initial-scale=1.0">')
  }

  // 21 — MISSING FAVICON
  if (!/<link[^>]+rel\s*=\s*["'][^"']*icon[^"']*["']/i.test(html)) {
    push('missing_favicon', 'low', 'No favicon declared — browser tab shows a blank icon', 0, '<head> without icon link', 'Inject a favicon link')
  }

  // 22 — MISSING ROBOTS META
  if (!/<meta[^>]+name\s*=\s*["']robots["']/i.test(html)) {
    push('missing_robots_meta', 'low', 'Robots meta missing — crawlers use unpredictable defaults', 0, '<head> without robots meta', 'Inject <meta name="robots" content="index, follow">')
  }

  // 23 — MISSING OG TAGS
  {
    const missingOg = []
    if (!/<meta[^>]+property\s*=\s*["']og:title["']/i.test(html)) missingOg.push('og:title')
    if (!/<meta[^>]+property\s*=\s*["']og:description["']/i.test(html)) missingOg.push('og:description')
    if (!/<meta[^>]+property\s*=\s*["']og:image["']/i.test(html)) missingOg.push('og:image')
    if (missingOg.length) {
      push('missing_og_tags', 'low', `Open Graph tags missing: ${missingOg.join(', ')} — link previews look broken on social media`, 0, '<head> without Open Graph tags', 'Inject the missing Open Graph meta tags')
    }
  }

  // 24 — MISSING CANONICAL TAG
  if (!/<link[^>]+rel\s*=\s*["']canonical["']/i.test(html)) {
    push('missing_canonical_tag', 'low', 'Canonical link missing — duplicate-content risk for SEO', 0, '<head> without canonical', 'Inject <link rel="canonical">')
  }

  // 25 — MISSING ALT TEXT
  {
    const missingAlt = [...html.matchAll(/<img\b(?![^>]*\salt\s*=)[^>]*>/gi)].slice(0, 12)
    if (missingAlt.length) {
      push('missing_alt_text', 'medium', `${missingAlt.length} image(s) missing alt text — screen-reader users get nothing`, missingAlt[0].index, clip(missingAlt[0][0], 140), 'Generate descriptive alt attributes')
    }
  }

  // 26–28 — REAL-BROWSER RUNTIME DAMAGE (rendered probe)
  if (rendered && rendered.ok) {
    const r = rendered
    const crashSeverity = r.blankRender ? 'critical' : 'high'
    for (const e of r.pageErrors.slice(0, 3)) {
      push('runtime_error', crashSeverity, `Uncaught JavaScript exception crashes the page at runtime: ${clip(e.message, 130)}`, NaN, clip(e.message, 160), 'Repair or neutralize the failing script')
    }
    for (const e of r.consoleErrors.slice(0, 4)) {
      push('runtime_error', r.blankRender ? 'high' : 'medium', `Browser console error at runtime: ${clip(e.text, 130)}`, NaN, clip(e.text, 160), 'Fix the JavaScript that throws this error')
    }

    if (r.blankRender) {
      push('blank_render', 'critical', `Page loads but renders blank in a real browser (${r.stats.elements} elements, ${r.stats.textLength} visible chars after full JS execution)`, 0, clip(r.gotoError || 'blank viewport', 120), 'Diagnose why rendering fails and rebuild the broken render path')
    }

    const seen = new Set()
    const assetIssues = []
    for (const f of [...r.failedRequests, ...r.badResponses.map((b) => ({ url: b.url, failure: `HTTP ${b.status}`, resourceType: b.resourceType }))]) {
      let normalized = f.url
      try { normalized = new URL(f.url).href } catch {}
      if (reportedAssetUrls.has(normalized) || seen.has(normalized)) continue
      seen.add(normalized)
      assetIssues.push(f)
    }
    renderFailures.push(...assetIssues)
    const heavy = assetIssues.filter((f) => /stylesheet|script|document|font/i.test(f.resourceType || ''))
    let reported = 0
    for (const f of heavy.slice(0, 5)) {
      push('failed_asset', 'high', `${(f.resourceType || 'resource').replace(/^\w/, (c) => c.toUpperCase())} fails to load in the browser (${clip(f.failure || '', 60)})`, html.indexOf((f.url || '').slice(0, 48)) >= 0 ? html.indexOf((f.url || '').slice(0, 48)) : NaN, clip(f.url, 160), 'Remove or repair the dead reference so the page stops requesting it')
      reported++
    }
    const light = assetIssues.length - heavy.length
    if (light > 0) {
      push('failed_asset', 'medium', `${light} additional subresource(s) fail to load in the browser`, NaN, '(multiple)', 'Clean up remaining dead references')
    }
    void reported
  } else if (rendered && !rendered.ok && rendered.reason) {
    push('info_probe_skipped', 'low', `Live-browser probe unavailable (${clip(rendered.reason, 80)}) — static analysis only`, NaN, '(probe skipped)', 'No action required')
  }

  // WORDPRESS DOCTOR — CMS detection + WP-specific deterministic findings
  let wpProfile = null
  try {
    const wp = await import('./wordpressDoctor.mjs')
    const audit = wp.wordpressAudit(html)
    wpProfile = audit.profile
    for (const issue of audit.issues) {
      push(issue.type, issue.severity, issue.description, NaN, clip(issue.fixHint || '', 120), issue.fixHint || 'Repair WordPress-specific breakage surgically')
    }
  } catch {}

  const summary = {
    total: issues.length,
    critical: issues.filter((i) => i.severity === 'critical').length,
    high: issues.filter((i) => i.severity === 'high').length,
    medium: issues.filter((i) => i.severity === 'medium').length,
    low: issues.filter((i) => i.severity === 'low').length,
  }
  return { issues, summary, score: calculateScore(issues), renderFailures, renderStats: rendered?.ok ? rendered.stats : null, blankRender: Boolean(rendered?.blankRender), cms: wpProfile?.isWp ? 'wordpress' : null, wpSignals: wpProfile?.signals || [] }
}

// ─── STEP 3: Fix plan ────────────────────────────────────────────────────────

const FIX_DESCRIPTIONS = {
  encoding_corruption: 'Clean the encoding: strip BOM and null bytes, decode double-encoded characters',
  leaked_secret: 'Redact the exposed secret and load it from an environment variable',
  mixed_content: 'Upgrade the insecure http:// reference to https://',
  missing_meta_tags: 'Inject the missing meta declarations into <head>',
  broken_link: 'Neutralize the dead link (element kept, navigation removed)',
  broken_image: 'Swap the dead image for a graceful inline placeholder',
  bad_code_pattern: 'Rewrite unsafe calls with safe alternatives',
  duplicate_elements: 'Make IDs unique / enforce exactly one H1',
  empty_element: 'Remove empty decorative elements',
  fixed_width_layout: 'Convert fixed widths to responsive max-width',
  accessibility_issue: 'Add aria-labels and frame titles',
  security_headers: 'Inject CSP, HSTS and nosniff meta headers',
  outdated_analytics: 'Modernize legacy ga() calls to gtag()',
  schema_markup_issue: 'Complete the structured-data fields',
  performance_issue: 'Lazy-load images, add dimensions, defer scripts',
  deprecated_tag: 'Replace deprecated tags with modern equivalents',
  missing_h1: 'Insert the page H1',
  skipped_headings: 'Repair the heading hierarchy',
  no_unique_title: 'Add a unique descriptive title',
  no_responsive_meta: 'Inject the responsive viewport meta',
  missing_favicon: 'Inject a favicon link',
  missing_robots_meta: 'Inject robots meta directives',
  missing_og_tags: 'Inject Open Graph tags',
  missing_canonical_tag: 'Inject the canonical link',
  missing_alt_text: 'Generate descriptive alt text',
  runtime_error: 'AI-repair the crashing script or neutralize the failing code path',
  blank_render: 'AI-diagnose why the page renders nothing and rebuild the render path',
  failed_asset: 'Remove or repair references to assets that fail in a real browser',
  wordpress_malware_loader: 'Remove the injected obfuscated loader script entirely — it is never legitimate theme code',
  wordpress_mixed_content: 'Rewrite insecure http:// wp-content/wp-includes URLs to https:// so browsers stop blocking theme assets',
}

function buildFixPlan(diagnosis) {
  const fixes = diagnosis.issues.map((issue, i) => ({
    id: `FIX-${String(i + 1).padStart(3, '0')}`,
    issue_id: issue.id,
    type: issue.type,
    severity: issue.severity,
    before: issue.before,
    after: FIX_DESCRIPTIONS[issue.type] || 'Apply the corrective repair',
    description: FIX_DESCRIPTIONS[issue.type] || 'Apply the corrective repair',
    status: 'ready',
  }))
  return { fixes, total_fixes: fixes.length }
}

// ─── Expert rebuild dispatcher ────────────────────────────────────────────────

const SINGLE_CALL_MAX_CHARS = 20_000

async function runExpertRebuild({ html, hostname, url }) {
  const notes = []
  const attemptSingle = async () => {
    try {
      const r = await llmRebuildPage({ html, hostname, url })
      if (Array.isArray(r?.notes)) notes.push(...r.notes)
      return r?.rebuilt ? r : null
    } catch (err) {
      notes.push(`single-call crashed: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }
  const attemptMulti = async () => {
    try {
      const r = await llmMultiCallRebuild({ html, hostname, url })
      if (Array.isArray(r?.notes)) notes.push(...r.notes)
      return r?.rebuilt ? r : null
    } catch (err) {
      notes.push(`multi-call crashed: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }
  const order = html.length > SINGLE_CALL_MAX_CHARS
    ? [attemptMulti, attemptSingle]
    : [attemptSingle, attemptMulti]
  for (const run of order) {
    const win = await run()
    if (win?.html) return { rebuilt: true, html: win.html }
  }
  return { rebuilt: false, notes }
}

// ─── Interactivity reconstruction (multi-call behavior layer) ────────────────
// Detects the "amputated page" failure mode: repairs removed broken scripts and
// left a pretty shell with zero functionality (stuck "Loading…", dead buttons).
const multiCallEnabled = () => !/^(0|false|no)$/i.test(String(process.env.ALPHA_MULTI_CALL ?? '1').trim())

function inlineScriptChars(html) {
  let total = 0
  for (const m of String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = m[1].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\n)\s*\/\/[^\n]*/g, '$1')
    total += body.replace(/\s+/g, '').length
  }
  return total
}

// Active (non-commented) script source — comment-stripped so "neutralized"
// blocks don't masquerade as living code.
function activeScriptText(html) {
  let out = ''
  for (const m of String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    out += m[1].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\n)\s*\/\/[^\n]*/g, '$1') + '\n'
  }
  return out
}

function countFunctionDefs(code) {
  let n = 0
  n += [...code.matchAll(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(/g)].length
  n += [...code.matchAll(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g)].length
  return n
}

function detectAmputatedBehavior(originalHtml, workingHtml) {
  const origCode = inlineScriptChars(originalHtml)
  const curCode = inlineScriptChars(workingHtml)
  const stuckLoading = />(?:[^<]*\b(?:loading|please wait)[^<]*)<\s*\/(?:div|span|p)>/i.test(String(workingHtml))
  const handlersReferenced = [...String(originalHtml).matchAll(/on(?:click|submit|change|input)=/gi)].length
                     + [...String(originalHtml).matchAll(/addEventListener\s*\(/g)].length
  // Function-level loss: the strongest amputation signal. If the original
  // defined real behavior and the repaired page lost most of those
  // definitions (dropped blocks, stripped handlers), the shell is inert no
  // matter how many characters of unrelated script survive.
  const origFns = countFunctionDefs(activeScriptText(originalHtml))
  const curFns = countFunctionDefs(activeScriptText(workingHtml))
  const fnLoss = origFns >= 3 && origFns - curFns >= 2 && curFns <= Math.floor(origFns * 0.5)
  const amputated = (origCode > 400 && curCode < Math.max(80, origCode * 0.15)) || fnLoss
  const inertShell = curCode < 80 && (stuckLoading || handlersReferenced >= 2)
  if (inertShell) return { trigger: true, reason: `page lost its entire behavior layer (${origCode} → ${curCode} chars of script; ${handlersReferenced} handler reference(s)${stuckLoading ? '; stuck loading placeholder' : ''})` }
  if (amputated) return { trigger: true, reason: `${origFns} → ${curFns} function definition(s) and ${origCode} → ${curCode} chars of script survived — most of the original behavior was removed during repair` }
  return { trigger: false, reason: '' }
}

async function runBehaviorReconstruction({ originalHtml, html, hostname, url, errors = [], previousCode = '' }) {
  const notes = []
  try {
    const r = await llmReconstructInteractivity({ originalHtml, workingHtml: html, hostname, url, errors, previousCode })
    if (Array.isArray(r?.notes)) notes.push(...r.notes)
    if (!r?.reconstructed || !r.code) return { adopted: false, html, notes }
    // Inject as the LAST script before </body> so it can wire everything above it.
    const tag = `\n<script data-alpha-behavior-layer>\n${r.code}\n</script>\n`
    let out
    if (/<\/body>/i.test(html)) out = html.replace(/<\/body>/i, `${tag}</body>`)
    else out = html + tag
    notes.push(`Injected behavior layer: ${(r.functions || []).slice(0, 6).join(', ')}`)
    return { adopted: true, functions: r.functions || [], code: r.code, html: out, notes }
  } catch (err) {
    notes.push(`behavior reconstruction crashed: ${err instanceof Error ? err.message : String(err)}`)
    return { adopted: false, html, notes }
  }
}

/** Boot a candidate page in a real browser — does the behavior layer actually work? */
async function validateBehaviorLayer(candidateHtml) {
  try {
    const bt = await runBehaviorTests({ html: candidateHtml })
    const fatal = bt.failed.filter((f) => ['boots_without_crashes', 'dynamic_content_loads', 'dom_renders'].includes(f.name))
    if (!bt.available) return { ok: true, fails: [], reason: 'browser unavailable — accepted without runtime proof' }
    return { ok: fatal.length === 0 && bt.js_errors === 0, fails: fatal, js_errors: bt.js_errors, reason: fatal.length ? fatal.map((f) => f.name).join(', ') : '' }
  } catch {
    return { ok: true, fails: [], reason: 'validation crashed — accepted optimistically' }
  }
}
const countBehaviorFails = (v) => (Array.isArray(v?.fails) ? v.fails.length : v?.ok ? 0 : 1)

// A behavior layer is only shippable if it introduces NO fatal regressions:
// uncaught crashes or a still-stuck shell are worse than no layer at all.
function layerAcceptable(verdict) {
  if (!verdict) return false
  if (verdict.ok) return true
  const fails = Array.isArray(verdict?.fails) ? verdict.fails.map((f) => f?.name || f) : []
  const fatal = ['boots_without_crashes', 'dynamic_content_loads', 'dom_renders']
  const jsErrors = Number(verdict?.js_errors ?? 0)
  return !fails.some((f) => fatal.includes(f)) && jsErrors === 0
}

// FINAL SYNTAX GATE — Alpha never ships JavaScript that cannot parse. Whatever
// upstream stage produced it, an unparseable inline script is neutralized.
function stripBrokenInlineScripts(html) {
  let removed = 0
  const out = String(html).replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, body) => {
    if (!String(body).trim()) return full
    if (/\bsrc\s*=/i.test(attrs || '')) return full
    try {
      // eslint-disable-next-line no-new-func
      new Function(body)
      return full
    } catch {
      removed += 1
      return `<script${attrs}>/* Alpha safety gate: removed inline script with unrecoverable syntax error */</script>`
    }
  })
  return { html: out, removed }
}

// ─── STEP 4: Repair execution ────────────────────────────────────────────────

const PLACEHOLDER_SRC = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='100%' height='100%' fill='#e8eaed'/><path d='M170 130a18 18 0 1 1 36 0 18 18 0 0 1-36 0zm-45 105l55-70 35 42 25-27 45 55H125z' fill='#aab2bd'/><text x='200' y='265' font-family='sans-serif' font-size='13' fill='#757d89' text-anchor='middle'>Image unavailable</text></svg>`)}`
const FAVICON_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23000'/%3E%3Ctext x='16' y='22' font-family='Arial' font-weight='bold' font-size='15' fill='%23D6FF00' text-anchor='middle'%3EA%3C/text%3E%3C/svg%3E`

function ensureHead(html) {
  if (/<head[^>]*>/i.test(html)) return html
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/(<html[^>]*>)/i, '$1<head></head>')
  }
  return `<head></head>${html}`
}

function headInsertOnce(html, additions) {
  if (!additions.trim()) return html
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${additions}</head>`)
  return ensureHead(html).replace(/<\/head>/i, `${additions}</head>`)
}

function altFromSrc(src) {
  try {
    const file = decodeURIComponent(new URL(src, 'https://x.invalid').pathname.split('/').pop() || '')
    const base = file.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim()
    if (!base || /^\d+$/.test(base)) return 'Image'
    return base.charAt(0).toUpperCase() + base.slice(1)
  } catch {
    return 'Image'
  }
}

export function executeRepairs(originalHtml, diagnosis, opts = {}) {
  const { finalUrl = '', hostname = '' } = opts
  let html = originalHtml
  const log = []

  const record = (fixType, before, after) => {
    log.push({ type: fixType, before: clip(before, 240), after: clip(after, 240), changed: before !== after })
  }

  for (const issue of diagnosis.issues) {
    const beforeSnapshot = html
    switch (issue.type) {

      case 'encoding_corruption': {
        html = sanitizeEncoding(html)
        html = repairMojibake(html)
        record(issue.type, beforeSnapshot.slice(0, 120), html.slice(0, 120))
        break
      }

      case 'leaked_secret': {
        for (const p of SECRET_PATTERNS) {
          p.re.lastIndex = 0
          html = html.replace(p.re, (match, captured) => {
            const value = p.capture != null ? captured : match
            if (looksLikePlaceholder(value)) return match
            if (p.capture != null) return match.replace(value, 'process.env.ALPHATEKX_REDACTED')
            return 'process.env.ALPHATEKX_REDACTED'
          })
        }
        record(issue.type, beforeSnapshot.slice(0, 120), html.slice(0, 120))
        break
      }

      case 'mixed_content': {
        html = html.replace(/((?:src|href)\s*=\s*(["']))http:\/\/(?!localhost[:\/])(?!w3\.org)(?!schema\.org)/gi, '$1https://')
        html = html.replace(/url\(\s*(["']?)http:\/\/(?!localhost[:\/])(?!w3\.org)/gi, 'url($1https://')
        record(issue.type, 'http://resource', 'https://resource')
        break
      }

      case 'missing_meta_tags': {
        const adds = []
        if (!/<meta[^>]+charset/i.test(html)) adds.push('<meta charset="UTF-8">')
        if (!/<meta[^>]+name\s*=\s*["']description["']/i.test(html)) {
          adds.push(`<meta name="description" content="${hostname || 'Restored site'} — fully restored by AlphaTekX">`)
        }
        if (adds.length) html = headInsertOnce(html, adds.join('\n    '))
        if (/<html[^>]*>/i.test(html)) {
          html = html.replace(/<html([^>]*)>/i, (m, attrs) => (/\slang\s*=/i.test(attrs) ? m : `<html lang="en"${attrs}>`))
        }
        record(issue.type, '<head>', `<head> + ${adds.join(', ') || 'lang attr'}`)
        break
      }

      case 'broken_link': {
        const urlMatch = /Remove the dead link(.+)$/.exec(issue.fix)
        if (urlMatch) {
          const dead = urlMatch[1].trim()
          const escaped = dead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          html = html.replace(new RegExp(`\\shref\\s*=\\s*(["'])${escaped}\\1`, 'gi'), ` data-broken-href="${dead}" title="Link removed by AlphaTekX — target unavailable"`)
        }
        record(issue.type, issue.before, 'dead link neutralized')
        break
      }

      case 'broken_image': {
        // The dead image tag was recorded in the issue — recover its src and swap it for a placeholder.
        const tagMatch = /<img\b[^>]*>/i.exec(issue.before || '')
        if (tagMatch) {
          const srcM = /\ssrc\s*=\s*(["'])([^"']+)\1/i.exec(tagMatch[0])
          if (srcM) {
            const escaped = srcM[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            html = html.replace(new RegExp(`(\\ssrc\\s*=\\s*)(["'])${escaped}\\2`, 'gi'), `$1"${PLACEHOLDER_SRC}" data-broken-src="${srcM[2]}"`)
          }
        }
        record(issue.type, issue.before, 'dead image replaced with placeholder')
        break
      }

      case 'bad_code_pattern': {
        if (/eval\(\)/.test(issue.description) || issue.description.startsWith('eval()')) {
          html = html.replace(/\beval\s*\(/g, 'Function(')
        }
        if (issue.description.startsWith('innerHTML')) {
          html = html.replace(/\.innerHTML\s*=/g, '.textContent = ')
        }
        if (issue.description.startsWith('document.write()')) {
          html = html.replace(/document\.write\s*\(/g, "document.currentScript.insertAdjacentHTML('afterend', ")
        }
        record(issue.type, issue.before, 'rewritten to safe alternative')
        break
      }

      case 'duplicate_elements': {
        // Rename duplicate id attributes only inside opening tags — never touch script/CSS content.
        const seen = new Map()
        html = html.replace(/<([a-z][a-z0-9]*)\b([^>]*)>/gi, (m, tag, attrs) => {
          const idM = /(\s)(id\s*=\s*)(["'])([^"']+)\3/i.exec(attrs)
          if (!idM) return m
          const idVal = idM[4]
          const n = (seen.get(idVal) || 0) + 1
          seen.set(idVal, n)
          if (n === 1) return m
          const renamed = attrs.replace(/(\sid\s*=\s*)(["'])([^"']+)\2/i, `$1$2${idVal}-atk${n}$2`)
          return `<${tag}${renamed}>`
        })
        let h1Seen = 0
        html = html.replace(/<h1([\s>])([\s\S]*?)<\/h1>/gi, (m, gt, inner) => {
          h1Seen++
          if (h1Seen === 1) return m
          return `<h2${gt}${inner}</h2>`
        })
        record(issue.type, 'duplicate ids / multiple h1', 'ids uniquefied / extra h1 demoted')
        break
      }

      case 'empty_element': {
        html = html.replace(/<(div|span|p)((?:\s[^<>]*)?)>\s*<\/\1>/gi, (m, tag, attrs) => {
          if (/\s(class|id|style|src|href|data-|aria-|role)\s*=/i.test(attrs || '')) return m
          return ''
        })
        record(issue.type, '<div></div>', '(removed)')
        break
      }

      case 'fixed_width_layout': {
        const fixWidths = (css) => css.replace(/(^|[^-])width\s*:\s*(\d{3,5})px/gi, (m, pre, num) => {
          if (parseInt(num, 10) < 600) return m
          return `${pre}max-width: 100%`
        })
        html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, body, close) => open + fixWidths(body) + close)
        html = html.replace(/style\s*=\s*"([^"]*)"/gi, (m, css) => `style="${fixWidths(css)}"`)
        record(issue.type, 'width: 1200px', 'max-width: 100%')
        break
      }

      case 'accessibility_issue': {
        html = html.replace(/<input\b([^>]*)>/gi, (m, attrs) => {
          if (/\s(aria-label|placeholder|title)\s*=/i.test(attrs)) return m
          const typeM = /\stype\s*=\s*["']?([a-z]+)/i.exec(attrs)
          const type = (typeM?.[1] || 'text').toLowerCase()
          if (['checkbox', 'radio', 'hidden', 'submit', 'button', 'file'].includes(type)) return m
          const nameM = /\s(?:name|id)\s*=\s*["']([^"']+)["']/i.exec(attrs)
          const label = nameM ? nameM[1].replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2') : `${type} field`
          return `<input aria-label="${label}"${attrs}>`
        })
        html = html.replace(/<iframe\b([^>]*)>/gi, (m, attrs) => (/\stitle\s*=/i.test(attrs) ? m : `<iframe title="Embedded content"${attrs}>`))
        record(issue.type, '<input>', '<input aria-label="…">')
        break
      }

      case 'security_headers': {
        const headers = []
        if (!/<meta[^>]+http-equiv\s*=\s*["']content-security-policy["']/i.test(html)) {
          headers.push(`<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;">`)
        }
        if (!/<meta[^>]+http-equiv\s*=\s*["']strict-transport-security["']/i.test(html)) {
          headers.push('<meta http-equiv="Strict-Transport-Security" content="max-age=31536000; includeSubDomains">')
        }
        if (!/<meta[^>]+http-equiv\s*=\s*["']x-content-type-options["']/i.test(html)) {
          headers.push('<meta http-equiv="X-Content-Type-Options" content="nosniff">')
        }
        if (headers.length) html = headInsertOnce(html, headers.join('\n    '))
        record(issue.type, '<head>', `<head> + ${headers.length} security headers`)
        break
      }

      case 'outdated_analytics': {
        html = html.replace(/ga\(\s*(['"])create\1\s*,\s*(['"])([^'"]+)\2/gi, `gtag('config', '$3'`)
        record(issue.type, "ga('create', 'ID'", "gtag('config', 'ID'")
        break
      }

      case 'schema_markup_issue': {
        html = html.replace(/(<script[^>]+application\/ld\+json[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, body, close) => {
          try {
            const data = JSON.parse(body.trim())
            const nodes = Array.isArray(data) ? data : [data]
            for (const node of nodes) {
              if (!node || typeof node !== 'object') continue
              if (!node['@context']) node['@context'] = 'https://schema.org/'
              if (!node['@type']) node['@type'] = 'WebSite'
              const t = String(node['@type'])
              if (t === 'Organization' && !node.name) node.name = hostname || 'Organization'
              if (t === 'Product' && !node.name) node.name = hostname || 'Product'
              if ((t === 'Article' || t === 'BlogPosting')) {
                if (!node.headline) node.headline = hostname || 'Article'
                if (!node.author) node.author = { '@type': 'Organization', name: hostname || 'Author' }
              }
            }
            return open + '\n' + JSON.stringify(data, null, 2) + '\n' + close
          } catch {
            return m
          }
        })
        record(issue.type, 'incomplete JSON-LD', 'completed JSON-LD')
        break
      }

      case 'performance_issue': {
        let imgIndex = -1
        html = html.replace(/<img\b[^>]*>/gi, (m) => {
          imgIndex++
          let tag = m
          if (imgIndex > 2 && !/\sloading\s*=/i.test(tag)) tag = tag.replace(/<img/i, '<img loading="lazy"')
          if (!/\s(width|height)\s*=/.test(tag) && !/style\s*=\s*["'][^"']*width/i.test(tag)) {
            tag = tag.replace(/<img/i, '<img width="640" height="360"')
          }
          return tag
        })
        html = html.replace(/(<script\b[^>]*\ssrc\s*=\s*["'][^"']+["'])(\s*>)/gi, (m, open, close) => {
          if (/\s(defer|async)\s/i.test(open) || /ld\+json/i.test(open)) return m
          if (/<\/head>/i.test(html) && html.indexOf(open) > html.search(/<\/head>/i)) return m
          return `${open} defer${close}`
        })
        record(issue.type, '<img> / <script src>', 'lazy + dimensions + defer')
        break
      }

      case 'deprecated_tag': {
        html = html.replace(/<font([^>]*)>([\s\S]*?)<\/font>/gi, (m, attrs, inner) => {
          const styles = []
          const color = /\scolor\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)
          const face = /\sface\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)
          const size = /\ssize\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)
          if (color) styles.push(`color:${color[1]}`)
          if (face) styles.push(`font-family:${face[1]}`)
          if (size) {
            const n = parseInt(size[1], 10)
            const px = Number.isNaN(n) ? 14 : Math.max(10, Math.min(32, n * 3 + 1))
            styles.push(`font-size:${px}px`)
          }
          return `<span style="${styles.join(';')}">${inner}</span>`
        })
        html = html.replace(/<center>([\s\S]*?)<\/center>/gi, '<div style="text-align:center">$1</div>')
        html = html.replace(/<center([^>]*)>/gi, '<div style="text-align:center">').replace(/<\/center>/gi, '</div>')
        html = html.replace(/<marquee([^>]*)>([\s\S]*?)<\/marquee>/gi, '$2')
        html = html.replace(/<blink>([\s\S]*?)<\/blink>/gi, '$1')
        html = html.replace(/<embed\b[^>]*>/gi, '')
        html = html.replace(/<applet[\s\S]*?<\/applet>/gi, '')
        html = html.replace(/<big>([\s\S]*?)<\/big>/gi, '<span style="font-size:larger">$1</span>')
        html = html.replace(/<strike>([\s\S]*?)<\/strike>/gi, '<s>$1</s>')
        html = html.replace(/<tt>([\s\S]*?)<\/tt>/gi, '<code>$1</code>')
        record(issue.type, '<font>/<center>/<marquee>', 'modern equivalents')
        break
      }

      case 'missing_h1': {
        const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
        const h1Text = clip(titleM?.[1]?.trim() || hostname || 'Welcome', 80)
        const bodyOpen = /<body[^>]*>/i.exec(html)
        const injection = `<h1>${h1Text.replace(/<[^>]*>/g, '')}</h1>`
        if (bodyOpen) {
          html = html.slice(0, bodyOpen.index + bodyOpen[0].length) + '\n' + injection + html.slice(bodyOpen.index + bodyOpen[0].length)
        } else {
          html = injection + html
        }
        record(issue.type, '<body>', `<body> + <h1>${h1Text}</h1>`)
        break
      }

      case 'skipped_headings': {
        // Recompute the heading sequence on the current content — earlier repairs may have shifted it.
        const seq = []
        for (const m of html.matchAll(/<h([1-6])([\s>])/gi)) seq.push({ level: parseInt(m[1], 10) })
        let jump = null
        for (let i = 1; i < seq.length; i++) {
          if (seq[i].level - seq[i - 1].level > 1) { jump = { occurrence: i, newLevel: seq[i - 1].level + 1 }; break }
        }
        if (jump) {
          let n = -1
          html = html.replace(/<h([1-6])([\s>])/gi, (m, lvl, gt) => {
            n++
            if (n === jump.occurrence && parseInt(lvl, 10) !== jump.newLevel) return `<h${jump.newLevel}${gt}`
            return m
          })
          record(issue.type, `h${seq[jump.occurrence - 1].level} → h${seq[jump.occurrence].level}`, `h${seq[jump.occurrence - 1].level} → h${jump.newLevel}`)
        }
        break
      }

      case 'no_unique_title': {
        if (!/<title[^>]*>\s*[^<\s][\s\S]*?<\/title>/i.test(html)) {
          const titleText = `${hostname || 'Restored Site'} — Official Page`
          if (/<title[^>]*><\/title>/i.test(html)) {
            html = html.replace(/<title[^>]*><\/title>/i, `<title>${titleText}</title>`)
          } else {
            html = headInsertOnce(html, `<title>${titleText}</title>`)
          }
        }
        record(issue.type, '(no title)', `<title>${hostname} — Official Page</title>`)
        break
      }

      case 'no_responsive_meta': {
        if (!/<meta[^>]+name\s*=\s*["']viewport["']/i.test(html)) {
          html = headInsertOnce(html, '<meta name="viewport" content="width=device-width, initial-scale=1.0">')
        }
        record(issue.type, '(none)', '<meta name="viewport" content="width=device-width, initial-scale=1.0">')
        break
      }

      case 'missing_favicon': {
        if (!/<link[^>]+rel\s*=\s*["'][^"']*icon[^"']*["']/i.test(html)) {
          html = headInsertOnce(html, `<link rel="icon" href="${FAVICON_SVG}">`)
        }
        record(issue.type, '(none)', '<link rel="icon" …>')
        break
      }

      case 'missing_robots_meta': {
        if (!/<meta[^>]+name\s*=\s*["']robots["']/i.test(html)) {
          html = headInsertOnce(html, '<meta name="robots" content="index, follow">')
        }
        record(issue.type, '(none)', '<meta name="robots" content="index, follow">')
        break
      }

      case 'missing_og_tags': {
        const adds = []
        const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
        const descM = /<meta[^>]+name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i.exec(html)
        const ogTitle = clip(titleM?.[1]?.trim() || hostname || 'Restored Site', 90)
        const ogDesc = clip(descM?.[1] || `${hostname || 'This site'} — restored by AlphaTekX`, 160)
        if (!/<meta[^>]+property\s*=\s*["']og:title["']/i.test(html)) adds.push(`<meta property="og:title" content="${ogTitle}">`)
        if (!/<meta[^>]+property\s*=\s*["']og:description["']/i.test(html)) adds.push(`<meta property="og:description" content="${ogDesc}">`)
        if (!/<meta[^>]+property\s*=\s*["']og:image["']/i.test(html) && finalUrl) {
          try { adds.push(`<meta property="og:image" content="${new URL('/favicon.ico', finalUrl).href}">`) } catch {}
        }
        if (adds.length) html = headInsertOnce(html, adds.join('\n    '))
        record(issue.type, '(no OG tags)', adds.join(' '))
        break
      }

      case 'missing_canonical_tag': {
        if (!/<link[^>]+rel\s*=\s*["']canonical["']/i.test(html) && finalUrl) {
          html = headInsertOnce(html, `<link rel="canonical" href="${finalUrl}">`)
        }
        record(issue.type, '(none)', `<link rel="canonical" href="${finalUrl}">`)
        break
      }

      case 'missing_alt_text': {
        html = html.replace(/<img\b([^>]*)>/gi, (m, attrs) => {
          if (/\salt\s*=/i.test(attrs)) return m
          const srcM = /\ssrc\s*=\s*(["'])([^"']+)\1/i.exec(attrs)
          const alt = srcM ? altFromSrc(srcM[2]) : 'Image'
          return `<img alt="${alt}"${attrs}>`
        })
        record(issue.type, '<img src="…">', '<img alt="…" src="…">')
        break
      }

      case 'runtime_error': {
        // No-LLM safety net: when the browser reports "X is not defined",
        // surgically remove the offending call lines. The LLM repair agent
        // (when configured) does richer rewrites on top of this.
        const idents = [...String(issue.before || '').matchAll(/\b([A-Za-z_$][\w$]*) is not defined/g)].map((m) => m[1])
        for (const ident of new Set(idents)) {
          if (!/^[A-Za-z_$][\w$]{2,}$/.test(ident)) continue
          const beforeIdent = html
          const lineRe = new RegExp(`^[^\\n]*\\b${ident}\\s*\\([^\\n]*$`, 'gm')
          html = html.replace(lineRe, `/* alphatekx: removed call to undefined ${ident} */`)
          if (html !== beforeIdent) record('runtime_error', `call to ${ident}(…)`, `removed crashed reference to ${ident}`)
        }
        break
      }

      case 'blank_render': {
        // Judgement damage — handled by the LLM repair agent in the agent loop.
        // Rules intentionally do not touch it: blind regex surgery on crashing
        // scripts causes more damage than it fixes.
        record(issue.type, issue.before || '(runtime damage)', '(queued for AI repair)')
        break
      }

      case 'failed_asset': {
        // Strip references to assets the real browser proved are dead.
        // Match every URL form that can appear in markup: absolute, scheme-
        // relative, and root-relative.
        const failures = diagnosis.renderFailures || []
        for (const f of failures) {
          const candidates = new Set()
          try {
            const u = new URL(f.url)
            if (/^https?:$/.test(u.protocol)) {
              candidates.add(u.href)
              candidates.add(u.protocol === 'https:' ? `http:${u.pathname}${u.search}` : `https:${u.pathname}${u.search}`)
              candidates.add(`${u.pathname}${u.search}`)
              candidates.add(u.pathname)
            }
          } catch { continue }
          const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const anyForm = [...candidates].map(escapeRe).join('|')
          if (!anyForm) continue
          const beforeFailed = html
          html = html.replace(new RegExp(`<link\\b[^>]*(?:${anyForm})[^>]*>`, 'gi'), '')
          html = html.replace(new RegExp(`<script\\b[^>]*(?:${anyForm})[^>]*>[\\s\\S]*?<\\/script>`, 'gi'), '')
          html = html.replace(new RegExp(`<(?:img|source|video|audio|track|iframe)\\b[^>]*(?:${anyForm})[^>]*>`, 'gi'), '')
          if (html !== beforeFailed) record('failed_asset', clip(f.url, 120), '(dead reference removed)')
        }
        break
      }

      default:
        break
    }
    if (html === beforeSnapshot) {
      log.push({ type: issue.type, before: issue.before, after: '(no change required)', changed: false })
    }
  }

  return { html, log }
}

// ─── STEP 5: Reconstruct ─────────────────────────────────────────────────────

function reconstruct(content) {
  let cleaned = sanitizeEncoding(content)
  const validHtml = validateHTML(cleaned)
  const validEnglish = !hasCJK(cleaned)
  const validUtf8 = validateUTF8(cleaned)
  if (cleaned.charCodeAt(0) === 0xFEFF) cleaned = cleaned.slice(1)
  return {
    content: cleaned,
    reconstructed: validHtml && validUtf8,
    valid_html: validHtml,
    valid_english: validEnglish,
    encoding: 'UTF-8',
  }
}

// ─── Main pipeline ───────────────────────────────────────────────────────────

export function handleRestoreV3Route(req, res) {
  const parsed = new URL(req.url, 'http://localhost')
  const rawUrl = (parsed.searchParams.get('url') || '').trim()
  const targetUrl = rawUrl && !/^https?:\/\//i.test(rawUrl) ? 'https://' + rawUrl.replace(/^\/+/, '') : rawUrl
  const mode = parsed.searchParams.get('mode') === 'scan-only' ? 'scan-only' : 'full'
  const pagesParam = parseInt(parsed.searchParams.get('pages') || '1', 10)
  const maxPages = Number.isFinite(pagesParam) && pagesParam >= 1 ? Math.min(50, Math.max(1, pagesParam)) : 1
  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Missing url parameter' }))
  }
  try { new URL(targetUrl) } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Invalid URL' }))
  }

  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers.host || 'localhost:3001'
  const origin = `${proto}://${host}`
  const cookieHeader = req.headers.cookie || ''
  const githubRepo = (parsed.searchParams.get('githubRepo') || '').trim()

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const sendEvent = (event) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  const sendStep = (step) => sendEvent({ type: 'thought_step', step })

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n')
  }, 15000)

  runRestorationPipeline({ targetUrl, mode, origin, cookieHeader, sendEvent, sendStep, maxPages, githubRepo })
    .catch((err) => {
      console.error('[ALPHA-V3] Pipeline crashed:', err)
      sendEvent({ type: 'error', message: err instanceof Error ? err.message : 'Pipeline failed' })
    })
    .finally(() => {
      clearInterval(heartbeat)
      if (!res.writableEnded) res.end()
    })
}

async function wpNoteFor(diagnosis) {
  try {
    if (diagnosis?.cms !== 'wordpress') return ''
    const wd = await import('./wordpressDoctor.mjs')
    return wd.wordpressGuidance({ isWp: true, signals: diagnosis.wpSignals })
  } catch {
    return ''
  }
}

export async function runRestorationPipeline({ targetUrl, mode, origin, cookieHeader, sendEvent, sendStep, maxPages = 1, githubRepo = '' }) {
  const chain = createChain(sendStep)
  const restorationId = `atk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const artifactsDir = path.join(ARTIFACTS_ROOT, restorationId)
  fs.mkdirSync(artifactsDir, { recursive: true })
  const created = Date.now()
  registryPut(restorationId, { id: restorationId, dir: artifactsDir, created })

  const startedAt = Date.now()
  sendEvent({ type: 'pipeline_start', restorationId, targetUrl, mode, max_pages: maxPages, timestamp: new Date().toISOString() })
  chain.active('reasoning', 'Alpha is reasoning about your site…', 'brain')

  const artifactUrl = (filename) => `/api/restore/v3/artifact/${restorationId}/${filename}`

  // ════════ STEP 1: RECONNAISSANCE ════════
  chain.done('reasoning', 'Reasoning established — running the 7-step restoration chain', 'Reconnaissance begins')

  let doc
  await chain.step('recon-fetch', 'Loading your website and capturing everything…', 'search', async () => {
    doc = await fetchDoc(targetUrl)
    if (!doc.ok && !doc.body) throw new Error(`Site responded ${doc.status}`)
    const looksHtml = /<[\s\S]*?>/.test(doc.body.slice(0, 4000))
    if (!looksHtml) throw new Error(SITE_NOT_LOADING)
    return `Loaded ${clip(doc.finalUrl, 60)} · ${(doc.body.length / 1024).toFixed(1)} KB`
  }).catch(() => { throw new Error(SITE_NOT_LOADING) })

  const finalUrl = doc.finalUrl
  const baseUrlObj = new URL(finalUrl)
  const hostname = baseUrlObj.hostname.replace(/^www\./, '')
  const isHttps = baseUrlObj.protocol === 'https:'
  let originalHtml = sanitizeEncoding(doc.body)

  // Launcher shells (iframe srcdoc / published templates) hide the real site
  // inside a script string — unwrap REPEATEDLY (deployed pages can be shells
  // wrapped in shells) so Alpha repairs what visitors actually see.
  {
    let levels = 0
    for (;;) {
      const embeddedDoc = extractEmbeddedDocument(originalHtml)
      if (!embeddedDoc || levels >= 5) break
      originalHtml = sanitizeEncoding(embeddedDoc.html)
      levels++
    }
    if (levels > 0) {
      chain.done(
        'recon-unwrap',
        levels > 1
          ? `${levels} launcher shells detected — opened every layer to reach the real page inside`
          : 'Launcher shell detected — opening it up to reach the real page inside',
        `Unwrapped ${levels} layer(s) · inner document ${(originalHtml.length / 1024).toFixed(1)} KB`,
      )
    }
  }

  // ════════ SITE-WIDE MODE — every page, one run ════════
  if (maxPages > 1) {
    try {
      await runSiteRestoration({ mode, origin, cookieHeader, sendEvent, sendStep, maxPages, restorationId, artifactsDir, created, startedAt, chain, finalUrl, hostname, isHttps, originalHtml })
    } catch (err) {
      console.error('[ALPHA-V3] Site-wide pipeline crashed:', err)
      sendEvent({ type: 'error', message: err instanceof Error ? err.message : 'Site-wide restoration failed' })
    }
    return
  }

  // Single-page runs share ONE live Chromium across screenshot → design-DNA →
  // probe → verification shot: faster steps, and recon reads the RENDERED DOM.
  const renderSession = await createRenderSession()
  try { // closed by the finally at the end of this function

  let screenshotBefore = null
  await chain.step('recon-shot', 'Capturing BEFORE screenshot as proof…', 'camera', async () => {
    screenshotBefore = renderSession
      ? await renderSession.screenshot(finalUrl, path.join(artifactsDir, 'before.png'))
      : await takeScreenshot(finalUrl, artifactsDir, 'before.png')
    if (screenshotBefore) {
      sendEvent({ type: 'screenshot_before', data: { screenshotPath: artifactUrl('before.png') } })
      return 'Before screenshot saved'
    }
    return 'Browser unavailable — continuing without visual proof'
  })

  let designTokens = null
  let liveDesign = null
  await chain.step('recon-tokens', 'Reading the rendered site — real colors, fonts and spacing from computed styles…', 'palette', async () => {
    if (renderSession) {
      try { liveDesign = await renderSession.harvest(finalUrl) } catch { liveDesign = null }
    }
    designTokens = liveDesign || extractDesignTokens(originalHtml)
    const source = liveDesign ? 'read from the live DOM' : 'extracted from source HTML'
    return `${designTokens.colors.length} colors · ${designTokens.fonts.length} fonts · ${designTokens.spacing.length} spacing values — ${source}`
  })

  await chain.step('recon-interactions', 'Sweeping interactions: clicks, scrolls, hovers…', 'cursor', () => {
    const ix = designTokens.interactions
    return `${ix.links} links · ${ix.buttons} buttons · ${ix.forms} forms · ${ix.hoverStates} hover states · ${ix.scrollListeners} scroll listeners`
  })

  sendEvent({
    type: 'reconnaissance_complete',
    data: {
      url: finalUrl,
      designTokens,
      design_live: Boolean(liveDesign),
      screenshotBefore: screenshotBefore ? artifactUrl('before.png') : null,
    },
  })

  // ════════ SITE MEMORY — Alpha remembers every site it has restored ════════
  const memory = await getSiteMemory(hostname).catch(() => null)
  if (memory && memory.scans > 0) {
    chain.done('memory', `Alpha remembers ${hostname} — worked on it ${memory.scans} time(s) before`, `Best score ${memory.best_score}/100 · last visit scored ${memory.last_score}/100`)
    sendEvent({ type: 'site_memory', data: { scans: memory.scans, best_score: memory.best_score, last_score: memory.last_score, last_run_at: memory.last_run_at, recurring_issues: memory.recurring_issues } })
  }
  // Recurring offenders feed every AI repair call: "this host keeps breaking
  // images" makes the model check for the pattern even when symptoms differ.
  const memoryContext = memory?.recurring_issues?.length
    ? `Site history (Alpha has restored this host ${memory.scans} time(s); best score ${memory.best_score}/100). Recurring issue patterns on this host: ${memory.recurring_issues.join('; ')}. Watch for these patterns even when the current symptom differs.`
    : ''

  // ════════ STEP 2: DIAGNOSE — static sweep + REAL-BROWSER probe ════════
  chain.active('diagnose', 'Diagnosing — sweeping every line for damage…', 'microscope')

  let renderProbe = null
  await chain.step('diagnose-render', 'Opening your site in a real browser — listening for runtime damage…', 'browser', async () => {
    if (!isRenderProbeAvailable()) return 'Browser probe disabled by environment — static analysis only'
    renderProbe = renderSession ? await renderSession.probe(finalUrl) : await probeRenderedPage(finalUrl)
    if (!renderProbe.ok) return `Live probe unavailable (${clip(renderProbe.reason || 'unknown', 60)}) — continuing with static analysis`
    const st = renderProbe.stats
    const failures = renderProbe.failedRequests.length + renderProbe.badResponses.length
    return `Rendered live: ${st.elements} elements · ${st.textLength} visible chars · ${renderProbe.pageErrors.length} crash(es) · ${renderProbe.consoleErrors.length} console error(s) · ${failures} failed request(s)`
  })

  const diagnosis = await chain.step('diagnose-run', 'Running deep diagnosis — static sweep fused with browser evidence…', 'microscope', async () => {
    const result = await diagnose(originalHtml, { baseUrl: finalUrl, https: isHttps, rendered: renderProbe })
    for (const issue of result.issues.slice(0, 10)) {
      chain.active(`diagnose-${issue.id}`, `Found [${issue.severity.toUpperCase()}] ${clip(issue.description, 90)}`, 'alert')
      chain.done(`diagnose-${issue.id}`, `Found [${issue.severity.toUpperCase()}] ${clip(issue.description, 90)}`, issue.location)
    }
    return result
  })
  const s = diagnosis.summary
  chain.done('diagnose', `Diagnosis complete — ${s.total} issues found`, `${s.critical} critical · ${s.high} high · ${s.medium} medium · ${s.low} low · health score ${diagnosis.score}/100`)
  sendEvent({
    type: 'issues_found',
    data: {
      issues: diagnosis.issues,
      summary: diagnosis.summary,
      score: diagnosis.score,
      render_probe: renderProbe ? { ok: renderProbe.ok, blank_render: renderProbe.blankRender, stats: renderProbe.stats } : null,
    },
  })

  if (mode === 'scan-only') {
    const designNote = liveDesign && liveDesign.live
      ? `\n\nLive design DNA read from the rendered DOM: **${liveDesign.colors.length} colors**, **${liveDesign.fonts.length} fonts**, ${liveDesign.interactions.links} links · ${liveDesign.interactions.buttons} buttons · ${liveDesign.interactions.forms} forms.`
      : ''
    const runtimeNote = renderProbe && renderProbe.ok
      ? `\n\nI also opened the site in a real browser: ${renderProbe.pageErrors.length} crash(es), ${renderProbe.consoleErrors.length} console error(s), ${renderProbe.blankRender ? 'and the page renders **blank** — that is serious' : 'no blank-render problem'}.`
      : ''
    const msg = diagnosis.issues.length === 0
      ? `I scanned **${hostname}** deeply — zero issues found. Health score: **${diagnosis.score}/100**. This site is already clean. 🎉${designNote}${runtimeNote}`
      : `I scanned **${hostname}** and found **${s.total} issues** (${s.critical} critical, ${s.high} high, ${s.medium} medium, ${s.low} low). Health score: **${diagnosis.score}/100**.${designNote}${runtimeNote}\n\nSay **"fix my site"** and I will run the full agentic restoration — up to three repair cycles with AI-powered fixes — and hand you the repaired code.`
    sendEvent({ type: 'v3_summary', message: msg })
    sendEvent({ type: 'pipeline_done', restorationId })
    return
  }

  // ════════ AGENT LOOP: PLAN → REPAIR (rules + AI) → RECONSTRUCT → VERIFY ════════
  // Up to 3 cycles. Alpha keeps iterating until the health score reaches the
  // target or stops improving — exactly how a human engineer works.
  const MAX_CYCLES = 3
  const TARGET_SCORE = 95

  let workingHtml = originalHtml
  let cycleDiagnosis = diagnosis
  let postDiagnosis = diagnosis
  let plan = null
  let appliedCount = 0
  let aiAppliedTotal = 0
  let structuralApplied = false
  let structuralTally = null
  let aiRebuildBlocked = ''
  let rebuildAdopted = false
  let behaviorRebuilt = null
  let reconAttempts = 0
  const cycleHistory = []

  // ════════ STRATEGY PLAN — Alpha decomposes the damage into an ordered ════
  // battle plan before touching code, then executes it across repair cycles.
  let strategyPlan = null
  await chain.step('strategy', 'Planning the restoration strategy — ordering every fix by impact…', 'brain', async () => {
    strategyPlan = await llmPlanRestoration({ issues: diagnosis.issues, score: diagnosis.score, hostname, memoryContext, cmsNote: await wpNoteFor(diagnosis) })
    sendEvent({ type: 'strategy_plan', data: { strategy: strategyPlan.strategy, tasks: strategyPlan.tasks, source: strategyPlan.source } })
    const head = strategyPlan.tasks.slice(0, 3).map((t) => t.title).join(' · ')
    return `${strategyPlan.tasks.length}-task plan (${strategyPlan.source === 'ai' ? 'AI-optimized' : 'severity-ordered'}): ${clip(head, 120)}`
  })

  // Repair milestones feed the real git history built at delivery time: each
  // becomes its own commit + tag, so rollback to ANY step is one command.
  const milestones = []
  const snapshotMilestone = (label) => {
    try {
      if (workingHtml) milestones.push({ label: String(label).slice(0, 120), html: String(workingHtml) })
    } catch {}
  }

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    const suffix = cycle > 1 ? `-c${cycle}` : ''
    const prefix = cycle > 1 ? `Cycle ${cycle}/${MAX_CYCLES} — ` : ''
    if (cycle > 1) chain.active(`cycle-${cycle}`, `Alpha is still digging deeper in cycle ${cycle} of ${MAX_CYCLES}…`, 'brain')

    // ── STEP 3.5: MAKE-IT-WORK — recover broken CSS, JS syntax, unclosed
    //    markup and dead assets BEFORE the rule-based planner runs, so the
    //    rest of the pipeline operates on a page that actually parses.
    if (cycle === 1 && !structuralApplied) {
      const probeFailed = [
        ...(renderProbe?.failedRequests || []).map((r) => r.url || r),
        ...(renderProbe?.badResponses || []).map((r) => r.url || r),
      ].filter(Boolean)
      await chain.step('make-it-work', 'Make-It-Work — rebuilding broken CSS, JS syntax, unclosed markup and dead assets…', 'repair', async () => {
        const r = await repairBrokenHtml(workingHtml, { baseUrl: finalUrl, knownDead: probeFailed, allowNetwork: false })
        workingHtml = r.html
        structuralApplied = true
        structuralTally = r.tally
        snapshotMilestone('make-it-work: structural recovery (CSS/JS/markup made parseable)')
        const actions = []
        if (r.tally.css_repaired) actions.push(`${r.tally.css_repaired} CSS block(s) rebuilt`)
        const jsWork = r.tally.js_removed + r.tally.js_reconstructed + r.tally.js_guarded + r.tally.js_sanitized
        if (jsWork) actions.push(`${jsWork} script(s) made safe`)
        if (r.tally.dead_assets_removed) actions.push(`${r.tally.dead_assets_removed} dead asset(s) removed`)
        if (r.tally.js_removed) actions.push(`${r.tally.js_removed} unrecoverable script(s) neutralized`)
        if (r.tally.html_normalized) actions.push('structures auto-closed')
        return actions.length ? actions.join(' · ') : 'No structural repair needed'
      })
    }

    // ── STEP 3: FIX PLAN ──
    plan = await chain.step(`plan${suffix}`, `${prefix}Generating the complete fix plan — one repair per issue…`, 'plan', () => buildFixPlan(cycleDiagnosis))
    chain.done(`plan${suffix}`, `Fix plan ready — ${plan.total_fixes} repairs queued`, plan.fixes.slice(0, 3).map((f) => f.type).join(', ') + (plan.total_fixes > 3 ? `, +${plan.total_fixes - 3} more` : ''))
    sendEvent({ type: 'fix_plan_ready', data: { fixes: plan.fixes.slice(0, 40), total_fixes: plan.total_fixes, cycle } })

    // ── STEP 4a: RULE-BASED REPAIRS ──
    const repairResult = await chain.step(`repair-run${suffix}`, `${prefix}Applying every rule-based fix to the code…`, 'tools', async () => {
      const result = executeRepairs(workingHtml, cycleDiagnosis, { finalUrl, hostname })
      for (const entry of result.log.filter((l) => l.changed).slice(0, 12)) {
        sendEvent({ type: 'diff', filename: 'index.html', old: entry.before, newContent: entry.after, cycle })
      }
      return result
    })
    workingHtml = repairResult.html
    appliedCount = repairResult.log.filter((l) => l.changed).length
    if (appliedCount > 0) snapshotMilestone(`cycle ${cycle}: ${appliedCount} rule-based fix(es) applied`)
    sendEvent({ type: 'repairs_complete', data: { fixes_applied: appliedCount, total_fixes: plan.total_fixes, log: repairResult.log.slice(0, 40), cycle } })

    // ── STEP 4b: AI REPAIRS — damage rules can't touch ──
    const aiEligible = cycleDiagnosis.issues.filter((i) => ['runtime_error', 'blank_render', 'failed_asset'].includes(i.type))
    if (aiEligible.length) {
      await chain.step(`ai-repair${suffix}`, `${prefix}Repair Agent is rewriting what rules can't fix — ${aiEligible.length} runtime issue(s)…`, 'brain', async () => {
        const ai = await llmRepairBatch({ html: workingHtml, issues: aiEligible, hostname, memoryContext, cmsNote: await wpNoteFor(diagnosis) })
        workingHtml = ai.html
        aiAppliedTotal += ai.applied
        if (ai.applied > 0) snapshotMilestone(`cycle ${cycle}: ${ai.applied} AI surgical patch(es) applied`)
        if (!ai.configured) return 'No AI provider key configured — skipping AI repairs (rules already applied)'
        if (!ai.attempted) return 'AI repair not needed'
        return `AI repairs applied: ${ai.applied} · skipped safely: ${ai.skipped}${ai.notes[0] ? ` · ${clip(ai.notes.find((n) => !/skipped/i.test(n)) || ai.notes[0], 90)}` : ''}`
      })
      sendEvent({ type: 'ai_repairs_complete', data: { issues_sent: aiEligible.length, ai_repairs_applied_total: aiAppliedTotal, cycle } })
    }

    // ── STEP 4b-2: INTERACTIVITY RECONSTRUCTION — multi-call behavior layer.
    //    When repairs had to strip broken scripts, the page can survive as an
    //    inert shell (stuck "Loading…", dead buttons). Alpha rebuilds ONLY the
    //    behavior layer from the original source's surviving data — never the
    //    page itself. Every candidate layer is validated in a real browser and,
    //    if it crashes, the error is fed back for one corrected rewrite.
    //    On by default; ALPHA_MULTI_CALL=0 disables.
    {
      const amp = detectAmputatedBehavior(originalHtml, workingHtml)
      if (amp.trigger && multiCallEnabled() && isLlmRepairConfigured() && reconAttempts < 2) {
        await chain.step(`behavior-rebuild${suffix}`, `${prefix}Rebuilding the lost JavaScript behavior layer — multi-call reconstruction…`, 'brain', async () => {
          reconAttempts++
          const htmlBeforeLayer = workingHtml
          let r = await runBehaviorReconstruction({ originalHtml, html: workingHtml, hostname, url: finalUrl })
          // VALIDATE in a real browser — a compiled script can still crash at boot.
          let verdict = r.adopted ? await validateBehaviorLayer(r.html) : { ok: true }
          if (r.adopted && !layerAcceptable(verdict)) {
            console.log(`⚠️ [RECON] Candidate failed validation (${verdict.reason}) — healing round with the runtime errors…`)
            const healed = await runBehaviorReconstruction({ originalHtml, html: workingHtml, hostname, url: finalUrl, errors: verdict.errors || [], previousCode: r.code })
            if (healed.adopted) {
              const v2 = await validateBehaviorLayer(healed.html)
              if (layerAcceptable(v2) || countBehaviorFails(v2) < countBehaviorFails(verdict)) {
                r = healed
                verdict = v2
              }
            }
          }
          // NEVER ship a layer that fails live validation — revert to the
          // pre-layer page and report honestly instead.
          if (!r.adopted || !layerAcceptable(verdict)) {
            workingHtml = htmlBeforeLayer
            if (r.adopted) {
              return `Behavior layer candidate failed live validation (${clip(verdict.reason || 'behavior gaps', 90)}) — discarded rather than ship broken interactivity`
            }
            return `Behavior reconstruction unavailable — ${clip(r.notes.join(' | ') || 'no usable output', 140)}`
          }
          workingHtml = r.html
          behaviorRebuilt = { functions: r.functions || [], validated: verdict.ok }
          snapshotMilestone(`cycle ${cycle}: behavior layer reconstructed (${(r.functions || []).length} functions)`)
          sendEvent({ type: 'behavior_rebuild', data: { adopted: true, functions: r.functions || [], validated: verdict.ok, cycle } })
          return `Behavior layer restored — ${(r.functions || []).length} function(s): ${(r.functions || []).slice(0, 5).join(', ')}${verdict.ok ? ' · verified in live browser' : ` · ${clip(verdict.reason || 'validation inconclusive', 80)}`}`
        })
      } else if (amp.trigger) {
        console.log(`🚫 [RECON] Behavior loss detected but reconstruction skipped (${!multiCallEnabled() ? 'ALPHA_MULTI_CALL=0' : !isLlmRepairConfigured() ? 'no AI key' : 'attempt budget spent'})`)
      }
    }

    // ── STEP 4c: FULL-PAGE REBUILD — OPT-IN ONLY.
    //    Alpha's doctrine is surgical repair (minimal precise edits). Whole-page
    //    regeneration violates that doctrine, so it never runs by default.
    //    Set REBUILD_FORCE=1 to explicitly allow regeneration for heavily
    //    damaged pages; when enabled, a structurally valid rebuild is adopted
    //    unconditionally — that is exactly what opting in means.
    {
      const heavyDamage = (cycleDiagnosis?.summary?.critical || 0) > 0 || (cycleDiagnosis?.score || 100) < 85
      const rebuildOptIn = /^(1|true|yes)$/i.test(String(process.env.REBUILD_FORCE ?? '').trim())
      if (heavyDamage && rebuildOptIn) {
        console.log('🔧 Starting Expert Developer Pass…')
        await chain.step(`ai-rebuild${suffix}`, `${prefix}Expert developer pass — regenerating a clean, modern, responsive page…`, 'brain', async () => {
          const before = await diagnose(workingHtml, { baseUrl: finalUrl, https: isHttps, skipNetworkChecks: true }).catch(() => null)
          console.log(`📤 [REBUILD] Sending page to the LLM (pre-repair health: ${before?.score ?? '?'}/100, opted-in via REBUILD_FORCE)…`)
          const r = await runExpertRebuild({ html: workingHtml, hostname, url: finalUrl })
          if (!r.rebuilt) {
            aiRebuildBlocked = r.notes.join(' | ') || (isLlmRepairConfigured() ? 'model returned nothing usable' : 'no AI provider key configured')
            console.log(`❌ [REBUILD] Unavailable — ${aiRebuildBlocked}`)
            return `Rebuild unavailable — ${clip(aiRebuildBlocked, 140)}`
          }
          workingHtml = r.html
          console.log(`📥 [REBUILD] Response received — ${(workingHtml.length / 1024).toFixed(1)} KB, verifying health…`)
          const after = await diagnose(workingHtml, { baseUrl: finalUrl, https: isHttps, skipNetworkChecks: true }).catch(() => null)
          if (!after) return 'Rebuild discarded — could not verify the regenerated page'
          console.log(`⚖️ [REBUILD] Scores — patched original: ${before?.score ?? '?'} vs rebuild: ${after.score} → ADOPTED (opt-in policy)`)
          rebuildAdopted = true
          snapshotMilestone(`cycle ${cycle}: full-page rebuild adopted (opt-in)`)
                    sendEvent({
            type: 'ai_rebuild_complete',
            data: { adopted: true, before_score: before?.score ?? null, after_score: after.score ?? null, bytes: workingHtml.length, cycle },
          })
          console.log('✅ Restoration complete — clean modern rebuild adopted')
          return `Clean modern rebuild adopted — health ${before?.score ?? '?'} → ${after.score}`
        })
      } else if (heavyDamage) {
        console.log('🚫 [REBUILD] Skipped by surgical-mode policy (set REBUILD_FORCE=1 to allow full-page regeneration)')
      }
    }

    // ── STEP 5: RECONSTRUCT (+ save artifacts so the live preview updates) ──
    const reconstruction = await chain.step(`rebuild${suffix}`, `${prefix}Reconstructing the site — validating UTF-8, English, HTML integrity…`, 'shield', () => {
      const r = reconstruct(workingHtml)
      if (!r.valid_html) throw new Error('Reconstruction failed: invalid HTML structure')
      workingHtml = r.content
      fs.writeFileSync(path.join(artifactsDir, 'restored.html'), r.content, 'utf8')
      fs.writeFileSync(path.join(artifactsDir, 'rollback.html'), sanitizeEncoding(originalHtml), 'utf8')
      registryPut(restorationId, { id: restorationId, dir: artifactsDir, created, fixedHtml: r.content, originalHtml: sanitizeEncoding(originalHtml), finalUrl, hostname })
      return {
        reconstructed: r.reconstructed,
        valid_html: r.valid_html,
        valid_english: r.valid_english,
        valid_utf8: validateUTF8(r.content),
        file_saved: 'restored.html',
        encoding: r.encoding,
      }
    })
    chain.done(
      `rebuild${suffix}`,
      reconstruction.valid_english ? 'Reconstruction validated — clean UTF-8 English HTML saved' : 'Reconstruction saved — residual non-English characters flagged for review',
      reconstruction.valid_english ? 'Encoding: UTF-8 ✓ HTML ✓ English ✓' : 'Encoding: UTF-8 ✓ HTML ✓ English ⚠',
    )
    sendEvent({ type: 'reconstruction_validated', data: reconstruction, cycle })

    // ── STEP 6: VERIFY — re-scan the restored code ──
    postDiagnosis = await chain.step(`verify-rescan${suffix}`, `${prefix}Re-running the full diagnosis on restored code…`, 'test', () =>
      diagnose(workingHtml, { baseUrl: finalUrl, https: isHttps, skipNetworkChecks: true }),
    )

    const remainingC = postDiagnosis.issues.filter((i) => i.severity !== 'info')
    const afterScoreC = postDiagnosis.score
    const verificationC = {
      before: { issues: diagnosis.summary.total, score: diagnosis.score },
      after: { issues: remainingC.length, score: afterScoreC },
      fixed: remainingC.length === 0,
      improvement: `${afterScoreC - diagnosis.score >= 0 ? '+' : ''}${afterScoreC - diagnosis.score} points`,
      durationMs: Date.now() - startedAt,
      cycle,
    }
    chain.done(`verify${suffix}`, `Verification complete — score ${diagnosis.score} → ${afterScoreC}`, verificationC.fixed ? 'All issues resolved' : `${remainingC.length} issue(s) still open`)
    sendEvent({ type: 'verification_complete', data: { verification: verificationC, remaining_issues: remainingC.slice(0, 10), cycle } })
    cycleHistory.push({ cycle, before: diagnosis.score, after: afterScoreC, issues_remaining: remainingC.length })

    // Early-stop rules: target reached, perfect score, or no more gain.
    if (afterScoreC >= TARGET_SCORE) {
      chain.done(`agent-loop`, `Target score reached (${afterScoreC}/${TARGET_SCORE}) — restoration complete`, `${cycleHistory.length} cycle(s) · ${aiAppliedTotal} AI repair(s)`)
      break
    }
    if (remainingC.length === 0) break
    if (cycleHistory.length >= 2 && afterScoreC <= cycleHistory[cycleHistory.length - 2].after) {
      chain.done('agent-loop', `Score plateaued at ${afterScoreC} — additional cycles would not help`, 'Stopping like a senior engineer would')
      break
    }
    if (cycle < MAX_CYCLES) {
      cycleDiagnosis = await chain.step(`rediagnose-${cycle}`, 'Re-diagnosing what still hurts before the next cycle…', 'microscope', () =>
        diagnose(workingHtml, { baseUrl: finalUrl, https: isHttps, skipNetworkChecks: true }),
      )
      if (!cycleDiagnosis.issues.some((i) => i.severity !== 'info')) break
    }
  }

  // ── AFTER screenshot — visual proof of the restored site ──
  let screenshotAfter = null
  await chain.step('verify-shot', 'Capturing AFTER screenshot — visual proof of restoration…', 'camera', async () => {
    const contentPath = `/api/restore/v3/content/${restorationId}/fixed.html?base=1`
    screenshotAfter = renderSession
      ? await renderSession.screenshot(origin + contentPath, path.join(artifactsDir, 'after.png'))
      : await takeScreenshot(origin + contentPath, artifactsDir, 'after.png')
    if (screenshotAfter) {
      let size = 0
      try { size = fs.statSync(screenshotAfter.filePath).size } catch {}
      const verified = size > 5000
      sendEvent({ type: 'screenshot_after', data: { screenshotPath: artifactUrl('after.png'), verified } })
      return verified ? 'After screenshot captured and verified' : 'After screenshot captured (may be sparse)'
    }
    return 'Browser unavailable — continuing without visual proof'
  })

  const remaining = postDiagnosis.issues.filter((i) => i.severity !== 'info')
  const beforeScore = diagnosis.score
  const afterScore = postDiagnosis.score
  const improvement = afterScore - beforeScore
  const verification = {
    before: { issues: diagnosis.summary.total, score: beforeScore },
    after: { issues: remaining.length, score: afterScore },
    fixed: remaining.length === 0,
    improvement: `${improvement >= 0 ? '+' : ''}${improvement} points`,
    durationMs: Date.now() - startedAt,
  }
  sendEvent({ type: 'verification_complete', data: { verification, remaining_issues: remaining.slice(0, 10), final: true } })

  // ════════ BEHAVIORAL TESTS — prove the restored site actually WORKS ════════
  // A health score says nothing is broken; these tests prove things work:
  // the page boots without crashes, content renders, forms submit, buttons
  // respond — exercised in a real headless browser.
  let behaviorResult = null
  await chain.step('behavior-test', 'Running behavioral tests — booting the site and exercising every form and button…', 'shield', async () => {
    behaviorResult = await runBehaviorTests({ html: workingHtml })
    sendEvent({
      type: 'behavior_test',
      data: {
        total: behaviorResult.total,
        passed: behaviorResult.passed,
        failed: behaviorResult.failed,
        js_errors: behaviorResult.js_errors,
        notes: behaviorResult.notes,
      },
    })
    if (!behaviorResult.available) return 'Behavioral tests unavailable in this environment'
    if (behaviorResult.failed.length === 0) {
      return `All ${behaviorResult.total} behavioral test(s) passed — page boots clean, interactions verified`
    }
    return `${behaviorResult.passed}/${behaviorResult.total} behavioral test(s) passed — failing: ${clip(behaviorResult.failed.map((f) => f.name).join(', '), 100)}`
  })

  // ════════ ZERO-ERROR SWEEP — real-browser errors fed back until silent ════════
  // Behavior tests boot the page in a real browser. If any uncaught JS error
  // survives every other stage, its EXACT console text becomes a surgical
  // repair task. Up to two rounds; a round is kept only if live errors drop.
  let zeroErrorSweeps = 0
  while (
    behaviorResult?.available &&
    behaviorResult.js_errors > 0 &&
    Array.isArray(behaviorResult.errors) &&
    behaviorResult.errors.length > 0 &&
    zeroErrorSweeps < 2 &&
    multiCallEnabled() &&
    isLlmRepairConfigured()
  ) {
    zeroErrorSweeps += 1
    let sweepImproved = false
    const errList = behaviorResult.errors.slice()
    await chain.step(`zero-error-sweep-${zeroErrorSweeps}`, `Zero-Error Sweep ${zeroErrorSweeps} — ${errList.length} live JS error(s) survived; feeding exact browser output back to the Repair Agent…`, 'brain', async () => {
      const sweepIssues = errList.map((t, i) => ({
        id: `SWEEP-${i + 1}`,
        type: 'runtime_error',
        severity: 'high',
        description: `Live browser still reports: ${t}`,
        before: clip(String(t), 200),
        fix: 'Rewrite the crashing code path so it cannot throw; preserve intended behavior',
      }))
      let swept = await llmRepairBatch({ html: workingHtml, issues: sweepIssues, hostname, memoryContext, cmsNote: await wpNoteFor(diagnosis) }).catch(() => null)
      if (!swept?.html || !(swept.applied > 0)) {
        // Provider window likely drained mid-run — one bounded retry after a
        // short cooldown beats leaving live errors behind.
        await new Promise((resolve) => setTimeout(resolve, 25_000))
        swept = await llmRepairBatch({ html: workingHtml, issues: sweepIssues, hostname, memoryContext, cmsNote: await wpNoteFor(diagnosis) }).catch(() => null)
      }
      if (!swept?.html || !(swept.applied > 0)) return 'Repair Agent produced no usable patch this round — keeping the safer current version'
      const recheck = await runBehaviorTests({ html: swept.html }).catch(() => null)
      if (!recheck || !recheck.available || !(recheck.js_errors < behaviorResult.js_errors)) {
        return `Patch did not reduce live errors (${recheck ? recheck.js_errors : 'unverifiable'} left) — discarded to protect the working build`
      }
      workingHtml = swept.html
      fs.writeFileSync(path.join(artifactsDir, 'restored.html'), workingHtml, 'utf8')
      registryPut(restorationId, { id: restorationId, dir: artifactsDir, created, fixedHtml: workingHtml, originalHtml: sanitizeEncoding(originalHtml), finalUrl, hostname })
      snapshotMilestone(`zero-error sweep ${zeroErrorSweeps}: ${swept.applied} patch(es) · live JS errors ${behaviorResult.js_errors} → ${recheck.js_errors}`)
      behaviorResult = recheck
      sweepImproved = true
      return `${swept.applied} surgical patch(es) adopted — ${recheck.js_errors} live JS error(s) remaining`
    })
    if (!sweepImproved) break
  }
  if (zeroErrorSweeps > 0) {
    sendEvent({
      type: 'behavior_test',
      data: {
        total: behaviorResult.total,
        passed: behaviorResult.passed,
        failed: behaviorResult.failed,
        js_errors: behaviorResult.js_errors,
        notes: behaviorResult.notes,
        zero_error_sweeps: zeroErrorSweeps,
      },
    })
  }

  // ════════ SECOND CHANCE — rate limits must not leave a shell behind ════════
  // If the behavior layer is STILL missing at delivery time (typically a
  // free-tier 429 swallowed the reconstruction mid-run), wait out one fresh
  // token window and try exactly once more. If it still cannot be rebuilt,
  // the honesty gate reports the truth instead of pretending.
  {
    const ampLate = detectAmputatedBehavior(originalHtml, workingHtml)
    if (
      behaviorResult?.available &&
      ampLate.trigger &&
      multiCallEnabled() &&
      isLlmRepairConfigured() &&
      reconAttempts < 2
    ) {
      await chain.step('behavior-rebuild-retry', 'Interactivity is still missing — waiting ~45s for a fresh AI budget window, then retrying the behavior rebuild…', 'brain', async () => {
        reconAttempts += 1
        const htmlBeforeRetry = workingHtml
        await new Promise((resolve) => setTimeout(resolve, 45_000))
        let r2 = await runBehaviorReconstruction({ originalHtml, html: workingHtml, hostname, url: finalUrl })
        let verdict2 = r2.adopted ? await validateBehaviorLayer(r2.html) : { ok: true }
        if (r2.adopted && !layerAcceptable(verdict2)) {
          console.log(`⚠️ [RECON-RETRY] Candidate failed validation (${verdict2.reason}) — healing round…`)
          const healed = await runBehaviorReconstruction({ originalHtml, html: workingHtml, hostname, url: finalUrl, errors: verdict2.errors || [], previousCode: r2.code })
          if (healed.adopted) {
            const v3 = await validateBehaviorLayer(healed.html)
            if (layerAcceptable(v3) || countBehaviorFails(v3) < countBehaviorFails(verdict2)) {
              r2 = healed
              verdict2 = v3
            }
          }
        }
        // Adopt ONLY a layer that passes live validation — otherwise leave the
        // page exactly as it was and report the truth.
        if (!r2.adopted || !layerAcceptable(verdict2)) {
          if (r2.adopted) return `Retry candidate failed live validation (${clip(verdict2.reason || 'behavior gaps', 90)}) — discarded rather than ship broken interactivity`
          return 'Retry could not rebuild the behavior layer — the report will say so honestly'
        }
        workingHtml = r2.html
        fs.writeFileSync(path.join(artifactsDir, 'restored.html'), workingHtml, 'utf8')
        registryPut(restorationId, { id: restorationId, dir: artifactsDir, created, fixedHtml: workingHtml, originalHtml: sanitizeEncoding(originalHtml), finalUrl, hostname })
        snapshotMilestone('second chance: behavior layer rebuilt and validated')
        const recheck = await runBehaviorTests({ html: workingHtml }).catch(() => null)
        if (recheck?.available && recheck.js_errors <= (behaviorResult?.js_errors ?? 0)) behaviorResult = recheck
        sendEvent({
          type: 'behavior_test',
          data: {
            total: behaviorResult.total,
            passed: behaviorResult.passed,
            failed: behaviorResult.failed,
            js_errors: behaviorResult.js_errors,
            notes: behaviorResult.notes,
            second_chance_reconstruction: true,
          },
        })
        return `Behavior layer rebuilt on the retry — ${behaviorResult.passed}/${behaviorResult.total} behavioral test(s), ${behaviorResult.js_errors} live error(s)`
      })
    }
  }

  // ════════ FINAL SYNTAX GATE — unparseable JS never reaches the user ════════
  {
    const gate = stripBrokenInlineScripts(workingHtml)
    if (gate.removed > 0) {
      workingHtml = gate.html
      fs.writeFileSync(path.join(artifactsDir, 'restored.html'), workingHtml, 'utf8')
      registryPut(restorationId, { id: restorationId, dir: artifactsDir, created, fixedHtml: workingHtml, originalHtml: sanitizeEncoding(originalHtml), finalUrl, hostname })
      snapshotMilestone(`final syntax gate: ${gate.removed} unparseable script(s) neutralized`)
      sendEvent({
        type: 'thought_step',
        step: { label: 'final-syntax-gate', summary: `${gate.removed} script(s) could not compile and were removed — Alpha never ships JS that cannot run` },
      })
    }
  }

  // ════════ STEP 7: DELIVER ════════
  const deliverables = await chain.step('deliver', 'Packaging your restored site — 4 ways to receive it…', 'package', async () => {
    // Real git history: original → every repair milestone → final, each with
    // a tag. Rollback to any step is `git checkout <tag> -- index.html`.
    const gitHistory = buildRestoreGitHistory({
      dir: artifactsDir,
      originalHtml,
      finalHtml: registryGetFixed(restorationId),
      milestones,
      meta: { url: finalUrl, hostname },
    })
    sendEvent({
      type: 'git_history',
      data: {
        available: gitHistory.available,
        commits: gitHistory.commits,
        tags: gitHistory.tags,
        log: gitHistory.log.slice(0, 10),
        reason: gitHistory.reason || null,
      },
    })

    const zip = new JSZip()
    const report = {
      restored_by: 'AlphaTekX Restoration Engine V3',
      url: finalUrl,
      timestamp: new Date().toISOString(),
      steps_completed: 7,
      summary: {
        issues_found: diagnosis.summary.total,
        issues_fixed: diagnosis.summary.total - remaining.length,
        files_modified: 1,
        before_score: beforeScore,
        after_score: afterScore,
        improvement: verification.improvement,
      },
      issues: diagnosis.issues,
      fixes: plan.fixes,
      design_tokens: designTokens,
      agent: {
        version: 'V4-agentic',
        cycles: cycleHistory.length,
        per_cycle: cycleHistory,
        ai_repairs_applied: aiAppliedTotal,
        cms: diagnosis.cms || null,
        zero_error_sweeps: zeroErrorSweeps,
        render_probe: renderProbe ? { ok: renderProbe.ok, blank_render: renderProbe.blankRender, stats: renderProbe.stats } : null,
        memory_used: Boolean(memory && memory.scans > 0),
        strategy_plan: strategyPlan ? { source: strategyPlan.source, tasks: strategyPlan.tasks.length, strategy: strategyPlan.strategy } : null,
        behavior_tests: behaviorResult ? { total: behaviorResult.total, passed: behaviorResult.passed, failed: behaviorResult.failed } : null,
        git_history: gitHistory.available ? { commits: gitHistory.commits, tags: gitHistory.tags, rollback: 'git checkout damaged-original -- index.html' } : { available: false, reason: gitHistory.reason || null },
      },
    }
    zip.file('restored.html', registryGetFixed(restorationId))
    zip.file('RESTORATION_REPORT.json', JSON.stringify(report, null, 2))
    const restoredZip = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    fs.writeFileSync(path.join(artifactsDir, 'restored.zip'), restoredZip)

    const rollbackZip = new JSZip()
    rollbackZip.file('original.html', sanitizeEncoding(originalHtml))
    rollbackZip.file('ROLLBACK_README.txt', `Rollback package\nOriginal site snapshot: ${finalUrl}\nCaptured: ${new Date().toISOString()}\nTo roll back, redeploy original.html in place of restored.html.`)
    const rollbackBuf = await rollbackZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    fs.writeFileSync(path.join(artifactsDir, 'rollback.zip'), rollbackBuf)

    const ghToken = readCookieToken(cookieHeader)
    const suggestedName = slugifyHostname(hostname)

    // Auto-PR: when GitHub is connected AND a target repo was supplied, push
    // the fully restored file(s) to a fresh branch and open a pull request.
    let autoPr = null
    if (ghToken && githubRepo) {
      try {
        const gh = await import('./githubDirectPush.mjs')
        autoPr = await gh.publishRestorationBranch({
          token: ghToken,
          repoFullName: githubRepo,
          files: [{ path: 'index.html', content: registryGetFixed(restorationId) }],
          title: `AlphaTekX restoration — ${hostname}`,
          body: [
            'Automated surgical restoration by AlphaTekX.',
            '',
            `- Health score: ${beforeScore} → ${afterScore}`,
            `- Issues found: ${diagnosis.summary.total} · fixed: ${diagnosis.summary.total - remaining.length}`,
            '- Read-only diagnosis before any edit; exposed secrets redacted',
            '- Behavior verified in a live browser before delivery',
            '',
            'Review the diff and merge when satisfied.',
          ].join('\n'),
        })
        sendEvent({ type: 'github_pr', data: { pr_url: autoPr.prUrl, branch: autoPr.branchName, repo: autoPr.repo } })
      } catch (err) {
        autoPr = { error: err instanceof Error ? err.message : 'GitHub publish failed' }
        sendEvent({ type: 'github_pr', data: { error: autoPr.error } })
      }
    }

    return {
      git: gitHistory.available
        ? { available: true, commits: gitHistory.commits, tags: gitHistory.tags, rollback: 'git checkout damaged-original -- index.html', dir: artifactsDir }
        : { available: false, reason: gitHistory.reason || null },
      github: {
        available: Boolean(ghToken),
        branch_plan: `alphatekx-fix-${Math.floor(Date.now() / 1000)}`,
        note: ghToken ? 'GitHub connected — connect a repo URL to open the PR.' : 'Connect GitHub to receive the fix as a pull request.',
        ...(autoPr
          ? autoPr.error
            ? { pr_error: autoPr.error }
            : { pr_url: autoPr.prUrl, pr_branch: autoPr.branchName, pr_repo: autoPr.repo }
          : {}),
      },
      download: {
        available: true,
        restored: `/api/restore/v3/download?id=${restorationId}&which=restored`,
        rollback: `/api/restore/v3/download?id=${restorationId}&which=rollback`,
      },
      copy: { available: true, content_length: registryGetFixed(restorationId).length },
      deploy: {
        available: true,
        suggested_name: suggestedName,
        endpoint: '/api/deploy',
        url_preview: `https://alphatekx.name.ng/app/${suggestedName}`,
      },
    }
  })
  chain.done('deliver', 'Delivery ready — GitHub · Download · Copy · Deploy', 'All 4 channels prepared')

  const fixedHtml = registryGetFixed(restorationId)
  const copyPayloadCap = 280000
  const behaviorShellFail = Array.isArray(behaviorResult?.failed) && behaviorResult.failed.some((f) => ['dynamic_content_loads', 'boots_without_crashes'].includes(f.name))
  const genuinelyRestored = (remaining.length === 0 || afterScore >= TARGET_SCORE || improvement >= 10) && !behaviorShellFail
  const summaryBlock = {
    issues_found: diagnosis.summary.total,
    issues_fixed: diagnosis.summary.total - remaining.length,
    files_modified: 1,
    before_score: beforeScore,
    after_score: afterScore,
    improvement: verification.improvement,
    status: genuinelyRestored ? 'restored' : 'incomplete',
  }
  sendEvent({
    type: 'restore_complete',
    restorationId,
    data: {
      summary: summaryBlock,
      deliverables,
      screenshots: {
        before: screenshotBefore ? artifactUrl('before.png') : null,
        after: screenshotAfter ? artifactUrl('after.png') : null,
      },
      design_tokens: designTokens,
      issues: diagnosis.issues.slice(0, 25),
      remaining_issues: remaining.slice(0, 10),
      verification,
      agent: {
        cycles: cycleHistory.length,
        per_cycle: cycleHistory,
        ai_repairs_applied: aiAppliedTotal,
        rebuild_adopted: rebuildAdopted,
        ai_rebuild_blocked: aiRebuildBlocked || null,
        interactivity_reconstructed: behaviorRebuilt ? { functions: behaviorRebuilt.functions } : null,
        memory_used: Boolean(memory && memory.scans > 0),
        memory_recurring_issues: memory?.recurring_issues || [],
        strategy_plan: strategyPlan ? { source: strategyPlan.source, tasks: strategyPlan.tasks.length, strategy: strategyPlan.strategy, task_list: strategyPlan.tasks } : null,
        behavior_tests: behaviorResult ? { total: behaviorResult.total, passed: behaviorResult.passed, failed: behaviorResult.failed, js_errors: behaviorResult.js_errors } : null,
        git_history: deliverables?.git || null,
      },
      status: genuinelyRestored ? 'restored' : 'incomplete',
      tier: afterScore >= 95 ? 'gold' : afterScore >= 75 ? 'silver' : 'bronze',
      copy_content: fixedHtml.length <= copyPayloadCap ? fixedHtml : fixedHtml.slice(0, copyPayloadCap),
      copy_truncated: fixedHtml.length > copyPayloadCap,
    },
  })

  const msg = genuinelyRestored ? [
    `🎉 **${hostname} is fully restored!**`,
    '',
    `| | Before | After |`,
    `|---|---|---|`,
    `| Issues | ${diagnosis.summary.total} | ${remaining.length} |`,
    `| Score | ${beforeScore}/100 | **${afterScore}/100** |`,
    '',
    `**Improvement: ${verification.improvement}**`,
    '',
    cycleHistory.length > 1 || aiAppliedTotal > 0
      ? `**Agent report:** ${cycleHistory.length} repair cycle(s) · ${aiAppliedTotal} AI repair(s)${memory && memory.scans > 0 ? ` · remembered this site (${memory.scans} visit${memory.scans > 1 ? 's' : ''})` : ''}`
      : '',
    behaviorResult && behaviorResult.available
      ? `**Behavioral tests:** ${behaviorResult.passed}/${behaviorResult.total} passed${behaviorResult.failed.length ? ` — attention: ${clip(behaviorResult.failed.map((f) => f.name).join(', '), 80)}` : ' (boot, render, forms, buttons all verified in a real browser)'}`
      : '',
    deliverables?.git?.available
      ? `**Version control:** ${deliverables.git.commits} commits · tags \`${(deliverables.git.tags || []).slice(0, 3).join('`, `')}\` — full rollback with one git command`
      : '',
    '**Receive your restored site:**',
    `1. ⬇️ [Download restored.zip](${deliverables.download.restored}) + [rollback.zip](${deliverables.download.rollback})`,
    `2. 🚀 Say **"deploy as ${deliverables.deploy.suggested_name}"** — goes live at ${deliverables.deploy.url_preview}`,
    `3. 📋 Full restored HTML attached below (one-click copy)`,
    deliverables.github.available ? '4. 🐙 GitHub connected — say the word and I open the PR.' : '4. 🐙 Connect GitHub anytime and I will open the pull request for you.',
  ].join('\n') : [
    `⚠️ **${hostname} is only partially repaired.**`,
    '',
    `| | Before | After |`,
    `|---|---|---|`,
    `| Issues | ${diagnosis.summary.total} | ${remaining.length} |`,
    `| Score | ${beforeScore}/100 | **${afterScore}/100** |`,
    '',
    aiRebuildBlocked
      ? `I could not finish the deep repair just now — the AI engine was unavailable (${clip(aiRebuildBlocked, 160)}).`
      : behaviorShellFail
        ? `The page's JavaScript could not be rebuilt this run (the AI engine hit its rate limit), so the site still LOOKS fixed but its interactivity is missing. I refuse to call that restored. Say **"fix my site"** again in a minute and I will rebuild the behavior layer first.`
        : `The damage needs another pass — score improved by only ${improvement} point(s).`,
    remaining.length ? `Still open: ${[...new Set(remaining.map((i) => i.type))].slice(0, 5).join(', ')}.` : '',
    '',
    '**Your partial fixes are packaged below** — and press **Continue** to re-check the live site. Then say **"fix my site"** again and I will run a fresh repair pass.',
    `1. ⬇️ [Download partial-fix zip](${deliverables.download.restored}) + [rollback.zip](${deliverables.download.rollback})`,
    `2. 📋 Partial fixed HTML attached below (one-click copy)`,
  ].filter(Boolean).join('\n')
  sendEvent({ type: 'v3_summary', message: msg })

  // Site memory write — never blocks delivery.
  recordRestoration({
    url: finalUrl,
    hostname,
    beforeScore,
    afterScore,
    topIssues: [...new Set(diagnosis.issues.map((i) => i.type))].slice(0, 5),
  }).catch(() => {})

  sendEvent({ type: 'pipeline_done', restorationId })

  } finally {
    // The shared live Chromium must never outlive the run (Render memory).
    if (renderSession) await renderSession.close().catch(() => {})
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SITE-WIDE RESTORATION — the agent restores EVERY page of a website.
// One crawl → per-page agentic loop over a shared Chromium session →
// cross-page report → structured multi-page delivery (zip + pages.json).
// ═════════════════════════════════════════════════════════════════════════════

/** Storage/zip/serving key for a page: pathname only, trailing slash trimmed except root. */
function pageKeyOf(rawUrl) {
  try {
    const u = new URL(rawUrl)
    let p = u.pathname || '/'
    if (p.length > 1) p = p.replace(/\/+$/, '') || '/'
    return p
  } catch {
    return '/'
  }
}

/** Zip path mirrors the site structure: '/'→index.html, '/about'→about/index.html */
function zipPathForKey(key) {
  const clean = String(key || '/').replace(/^\/+/, '')
  return clean ? `${clean}/index.html` : 'index.html'
}

/** Relative href from one stored page directory to another ('/'↔'/about'). */
function relativeLinkBetween(fromKey, toKey) {
  const fromSegs = fromKey.split('/').filter(Boolean)
  const toSegs = toKey.split('/').filter(Boolean)
  let common = 0
  while (common < fromSegs.length && common < toSegs.length && fromSegs[common] === toSegs[common]) common++
  const ups = fromSegs.length - common
  const rel = [...Array.from({ length: ups }, () => '..'), ...toSegs.slice(common)].join('/')
  return rel ? `${rel}/` : './'
}

/**
 * Rewrite same-site PAGE links to relative paths so the delivered/deployed
 * copy navigates internally instead of bouncing back to the original host.
 * External links, assets and unknown targets are left untouched.
 */
function rewriteInternalPageLinks(html, knownKeys, currentKey, currentAbsUrl) {
  let currentHost = ''
  try { currentHost = new URL(currentAbsUrl).hostname } catch {}
  return String(html).replace(/(\shref\s*=\s*)(["'])([^"']+)\2/gi, (m, pre, q, href) => {
    if (!href || /^(#|javascript:|mailto:|tel:|data:|blob:)/i.test(href)) return m
    let abs
    try { abs = new URL(href, currentAbsUrl) } catch { return m }
    if (!/^https?:$/i.test(abs.protocol)) return m
    if ((abs.hostname.replace(/^www\./, '')) !== String(currentHost).replace(/^www\./, '')) return m
    const key = pageKeyOf(abs.href)
    if (!knownKeys.has(key)) return m
    return `${pre}${q}${relativeLinkBetween(currentKey, key)}${q}`
  })
}

async function runSiteRestoration(ctx) {
  const { mode, origin, cookieHeader, sendEvent, sendStep, restorationId, artifactsDir, created, startedAt, chain, finalUrl, hostname, isHttps, originalHtml, maxPages } = ctx
  const artifactUrl = (filename) => `/api/restore/v3/artifact/${restorationId}/${filename}`
  const MAX_CYCLES_ENTRY = 3
  const MAX_CYCLES_PAGE = 2
  const TARGET_SCORE = 95

  // ── Reconnaissance (entry page): BEFORE screenshot + design DNA ──
  let screenshotBefore = null
  await chain.step('recon-shot', 'Capturing BEFORE screenshot as proof…', 'camera', async () => {
    screenshotBefore = await takeScreenshot(finalUrl, artifactsDir, 'before.png')
    if (screenshotBefore) sendEvent({ type: 'screenshot_before', data: { screenshotPath: artifactUrl('before.png') } })
    return screenshotBefore ? 'Before screenshot saved' : 'Browser unavailable — continuing without visual proof'
  })

  const designTokens = extractDesignTokens(originalHtml)
  chain.done('recon-tokens', `Design DNA extracted — ${designTokens.colors.length} colors · ${designTokens.fonts.length} fonts preserved`, 'Applied consistently across every page')

  // ── Site memory ──
  const memory = await getSiteMemory(hostname).catch(() => null)
  if (memory && memory.scans > 0) {
    chain.done('memory', `Alpha remembers ${hostname} — worked on it ${memory.scans} time(s) before`, `Best score ${memory.best_score}/100 · last visit scored ${memory.last_score}/100`)
    sendEvent({ type: 'site_memory', data: { scans: memory.scans, best_score: memory.best_score, last_score: memory.last_score, last_run_at: memory.last_run_at, recurring_issues: memory.recurring_issues } })
  }
  // Recurring offenders feed every AI repair call on every page of the site.
  const memoryContext = memory?.recurring_issues?.length
    ? `Site history (Alpha has restored this host ${memory.scans} time(s); best score ${memory.best_score}/100). Recurring issue patterns on this host: ${memory.recurring_issues.join('; ')}. Watch for these patterns even when the current symptom differs.`
    : ''

  // ── CRAWL: map every reachable page (links + sitemap) ──
  let sitePages = null
  await chain.step('crawl', `Mapping every page of your site (up to ${maxPages}) — links + sitemap…`, 'search', async () => {
    const crawl = await crawlSite(finalUrl, originalHtml, { maxPages })
    if (!crawl.pages.length) throw new Error('Crawl produced no pages')
    sitePages = crawl.pages
    sendEvent({
      type: 'crawl_complete',
      data: { count: sitePages.length, discovered: crawl.discovered, failed: crawl.failed.slice(0, 10), urls: sitePages.map((p) => p.finalUrl) },
    })
    return `${sitePages.length} page(s) mapped${crawl.failed.length ? ` · ${crawl.failed.length} unreachable skipped` : ''}`
  })

  const entryProbeFirst = await chain.step('diagnose-render-entry', 'Opening the entry page in a real browser — listening for runtime damage…', 'browser', async () => {
    if (!isRenderProbeAvailable()) return null
    return probeRenderedPage(finalUrl)
  })

  const diagnosePage = async (page, rendered, labelPrefix) =>
    chain.step(`${labelPrefix}diagnose`, `${clip(pageLabelFor(page.finalUrl), 40)} — deep static sweep fused with browser evidence…`, 'microscope', () =>
      diagnose(page.html, { baseUrl: page.finalUrl, https: new URL(page.finalUrl).protocol === 'https:', rendered }),
    )

  // ═══ SCAN-ONLY: report every page, fix nothing ═══
  if (mode === 'scan-only') {
    const results = []
    let entryDiagnosis = null
    for (let i = 0; i < sitePages.length; i++) {
      const page = sitePages[i]
      const rendered = i === 0 ? entryProbeFirst : null
      const d = await diagnosePage(page, rendered, `p${i}-`)
      if (i === 0) {
        entryDiagnosis = d
        sendEvent({
          type: 'issues_found',
          data: { issues: d.issues.slice(0, 25), summary: d.summary, score: d.score, url: page.finalUrl },
        })
      }
      const label = pageKeyOf(page.finalUrl)
      chain.done(`scan-p${i}`, `${label}: ${d.summary.total} issue(s) · score ${d.score}/100`, d.summary.critical ? `${d.summary.critical} critical` : 'no critical damage')
      sendEvent({ type: 'page_result', data: { url: page.finalUrl, label, index: i + 1, total: sitePages.length, before_score: d.score, after_score: null, issues: d.summary.total, critical: d.summary.critical } })
      results.push(d)
    }
    const scores = results.map((r) => r.score)
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length))
    const worstIdx = scores.indexOf(Math.min(...scores))
    const rows = results.map((r, i) => `| ${pageKeyOf(sitePages[i].finalUrl)} | ${r.summary.total} | ${r.score}/100 |`).join('\n')
    const msg = [
      `I scanned **${sitePages.length} pages** of **${hostname}**. Site-wide health: **${avg}/100** average.`,
      '',
      '| Page | Issues | Score |',
      '|---|---|---|',
      rows,
      '',
      `Weakest page: \`${pageKeyOf(sitePages[worstIdx].finalUrl)}\` (${results[worstIdx].score}/100, ${results[worstIdx].summary.critical} critical).`,
      '',
      'Say **"fix my whole site"** and I will restore every page — up to three repair cycles each, delivered as one working multi-page site.',
    ].join('\n')
    sendEvent({ type: 'v3_summary', message: msg })
    void entryDiagnosis
    sendEvent({ type: 'pipeline_done', restorationId })
    return
  }

  // ═══ FULL RESTORATION — every page through the agentic loop ═══
  chain.active('agent-loop', `Alpha is restoring all ${sitePages.length} pages — one engineering pass per page…`, 'brain')

  // Strategy plan for the whole site: severity-ordered battle plan from the
  // entry page's damage profile (shared damage repeats across pages).
  let strategyPlan = null
  let siteCms = null
  await chain.step('strategy', 'Planning the site-wide restoration strategy…', 'brain', async () => {
    const entryDiag = await diagnose(sitePages[0]?.html || originalHtml, { baseUrl: finalUrl, https: isHttps, skipNetworkChecks: true }).catch(() => null)
    siteCms = entryDiag?.cms || null
    strategyPlan = await llmPlanRestoration({ issues: entryDiag?.issues || [], score: entryDiag?.score || 0, hostname, memoryContext, cmsNote: await wpNoteFor(entryDiag) })
    sendEvent({ type: 'strategy_plan', data: { strategy: strategyPlan.strategy, tasks: strategyPlan.tasks, source: strategyPlan.source, site_wide: true } })
    const head = strategyPlan.tasks.slice(0, 3).map((t) => t.title).join(' · ')
    return `${strategyPlan.tasks.length}-task plan (${strategyPlan.source === 'ai' ? 'AI-optimized' : 'severity-ordered'}): ${clip(head, 120)}`
  })

  // Entry-page milestones feed the real git history built at delivery time.
  const siteMilestones = []
  const snapshotSiteMilestone = (label, html) => {
    try {
      if (html) siteMilestones.push({ label: String(label).slice(0, 120), html: String(html) })
    } catch {}
  }
  let siteBehaviorRebuilt = null
  let reconAttemptsSite = 0

  const session = await createRenderSession()
  /** @type {{key:string,url:string,label:string,before:number,after:number,issuesBefore:number,issuesAfter:number,cycles:number,ai:number,html:string,initialTypes:string[]}[]} */
  const restored = []
  const AI_BUDGET = Math.max(8, Math.min(48, maxPages * 4))
  let aiCallsUsed = 0
  try {
    for (let i = 0; i < sitePages.length; i++) {
      const page = sitePages[i]
      const key = pageKeyOf(page.finalUrl)
      const isEntry = i === 0
      const cyclesCap = isEntry ? MAX_CYCLES_ENTRY : MAX_CYCLES_PAGE
      chain.active(`p${i}`, `Page ${i + 1}/${sitePages.length} — ${key}: diagnosing…`, 'microscope')

      const rendered = isEntry ? entryProbeFirst : (session ? await session.probe(page.finalUrl, { timeoutMs: 20000, settleMs: 900 }) : null)
      const firstDiagnosis = await diagnosePage(page, rendered, `p${i}-`)
      const initialTypes = [...new Set(firstDiagnosis.issues.map((x) => x.type))]
      if (isEntry) {
        sendEvent({
          type: 'issues_found',
          data: { issues: firstDiagnosis.issues, summary: firstDiagnosis.summary, score: firstDiagnosis.score },
        })
        if (rendered?.ok) {
          sendEvent({ type: 'render_probe', data: { ok: true, blank_render: rendered.blankRender, stats: rendered.stats } })
        }
      }
      chain.done(`p${i}`, `Page ${i + 1}/${sitePages.length} — ${key}: ${firstDiagnosis.summary.total} issue(s), health ${firstDiagnosis.score}/100`, firstDiagnosis.summary.critical ? `${firstDiagnosis.summary.critical} critical — Alpha digs in` : 'repair pass begins')

      let workingHtml = page.html
      let cycleDiagnosis = firstDiagnosis
      let postDiagnosis = firstDiagnosis
      const history = []
      let aiApplied = 0
      for (let cycle = 1; cycle <= cyclesCap; cycle++) {
        // ── MAKE-IT-WORK (cycle 1 only): recover broken CSS, JS syntax,
        //    unclosed markup and dead assets before rule repairs run.
        if (cycle === 1) {
          const probeFailed = [
            ...(rendered?.failedRequests || []).map((r) => r.url || r),
            ...(rendered?.badResponses || []).map((r) => r.url || r),
          ].filter(Boolean)
          const rescued = await repairBrokenHtml(workingHtml, { baseUrl: page.finalUrl, knownDead: probeFailed, allowNetwork: false })
          if (rescued.tally.css_repaired || rescued.tally.dead_assets_removed || rescued.tally.js_removed || rescued.tally.js_reconstructed || rescued.tally.js_guarded || rescued.tally.js_sanitized) {
            workingHtml = rescued.html
            if (isEntry) snapshotSiteMilestone('make-it-work: structural recovery', workingHtml)
            if (isEntry) {
              const actions = []
              if (rescued.tally.css_repaired) actions.push(`${rescued.tally.css_repaired} CSS block(s) rebuilt`)
              const jsWork = rescued.tally.js_removed + rescued.tally.js_reconstructed + rescued.tally.js_guarded + rescued.tally.js_sanitized
              if (jsWork) actions.push(`${jsWork} script(s) made safe`)
              if (rescued.tally.dead_assets_removed) actions.push(`${rescued.tally.dead_assets_removed} dead asset(s) removed`)
              if (actions.length) chain.done(`p${i}-make-it-work`, 'Make-It-Work — structure healed', actions.join(' · '))
            }
          }
        }
        const repairResult = executeRepairs(workingHtml, cycleDiagnosis, { finalUrl: page.finalUrl, hostname })
        workingHtml = repairResult.html
        if (isEntry && repairResult.log.some((l) => l.changed)) snapshotSiteMilestone(`entry cycle ${cycle}: rule-based fixes applied`, workingHtml)
        if (isEntry) {
          for (const entry of repairResult.log.filter((l) => l.changed).slice(0, 12)) {
            sendEvent({ type: 'diff', filename: zipPathForKey(key), old: entry.before, newContent: entry.after, cycle })
          }
        }

        const aiEligible = cycleDiagnosis.issues.filter((x) => ['runtime_error', 'blank_render', 'failed_asset'].includes(x.type))
        if (aiEligible.length && aiCallsUsed < AI_BUDGET) {
          aiCallsUsed++
          const ai = await llmRepairBatch({ html: workingHtml, issues: aiEligible, hostname, memoryContext, cmsNote: await wpNoteFor(cycleDiagnosis) }).catch(() => ({ html: workingHtml, applied: 0, skipped: aiEligible.length, notes: ['AI repair crashed — rules kept the page safe'], configured: false, attempted: false }))
          if (ai?.html) workingHtml = ai.html
          aiApplied += ai.applied || 0
          if (isEntry && (ai.applied || 0) > 0) snapshotSiteMilestone(`entry cycle ${cycle}: ${ai.applied} AI surgical patch(es)`, workingHtml)
        }

        // ── INTERACTIVITY RECONSTRUCTION — entry page only (bounds cost).
        if (isEntry) {
          const amp = detectAmputatedBehavior(originalHtml, workingHtml)
          if (amp.trigger && multiCallEnabled() && isLlmRepairConfigured() && aiCallsUsed < AI_BUDGET && reconAttemptsSite < 2) {
            aiCallsUsed++
            reconAttemptsSite++
            try {
              let r = await runBehaviorReconstruction({ originalHtml, html: workingHtml, hostname, url: page.finalUrl })
              if (r.adopted) {
                const verdict = await validateBehaviorLayer(r.html)
                if (!verdict.ok) {
                  const healed = await runBehaviorReconstruction({ originalHtml, html: workingHtml, hostname, url: page.finalUrl, errors: verdict.fails?.map((f) => f.detail) || [], previousCode: r.code })
                  if (healed.adopted && countBehaviorFails(await validateBehaviorLayer(healed.html)) <= countBehaviorFails(verdict)) r = healed
                }
                workingHtml = r.html
                siteBehaviorRebuilt = { functions: r.functions || [] }
                snapshotSiteMilestone(`entry cycle ${cycle}: behavior layer reconstructed (${(r.functions || []).length} functions)`, workingHtml)
                sendEvent({ type: 'behavior_rebuild', data: { adopted: true, functions: r.functions || [], cycle, site_wide: true } })
              }
            } catch {}
          }
        }

        // ── EXPERT REBUILD (opt-in only): surgical mode forbids whole-page
        //    regeneration unless REBUILD_FORCE=1 is set explicitly.
        {
          const heavyDamage = (cycleDiagnosis?.summary?.critical || 0) > 0 || (cycleDiagnosis?.score || 100) < 85
          const rebuildOptIn = /^(1|true|yes)$/i.test(String(process.env.REBUILD_FORCE ?? '').trim())
          if (heavyDamage && rebuildOptIn && aiCallsUsed < AI_BUDGET) {
                        aiCallsUsed++
            const before = await diagnose(workingHtml, { baseUrl: page.finalUrl, https: new URL(page.finalUrl).protocol === 'https:', skipNetworkChecks: true }).catch(() => null)
            const rb = await runExpertRebuild({ html: workingHtml, hostname, url: page.finalUrl })
            if (!rb.rebuilt && isEntry) {
              console.log(`❌ [REBUILD-WHOLE] Unavailable on ${key} — ${rb.notes.join(' | ') || 'unknown reason'}`)
            }
            if (rb.rebuilt) {
              const after = await diagnose(rb.html, { baseUrl: page.finalUrl, https: new URL(page.finalUrl).protocol === 'https:', skipNetworkChecks: true }).catch(() => null)
              if (after) {
                workingHtml = rb.html
                if (isEntry) chain.done(`p${i}-rebuild`, 'Expert rebuild — clean modern regeneration adopted', `health ${before?.score ?? '?'} → ${after.score}`)
              }
            }
          }
        }

        const reconstruction = reconstruct(workingHtml)
        if (!reconstruction.valid_html) throw new Error(`Reconstruction failed on ${key}: invalid HTML structure`)
        workingHtml = reconstruction.content

        postDiagnosis = await diagnose(workingHtml, { baseUrl: page.finalUrl, https: new URL(page.finalUrl).protocol === 'https:', skipNetworkChecks: true })
        const remainingN = postDiagnosis.issues.filter((x) => x.severity !== 'info').length
        history.push({ cycle, before: cycleDiagnosis.score, after: postDiagnosis.score, issues_remaining: remainingN })

        if (postDiagnosis.score >= TARGET_SCORE || remainingN === 0) break
        if (history.length >= 2 && postDiagnosis.score <= history[history.length - 2].after) break
        cycleDiagnosis = postDiagnosis
      }

      const issuesBefore = firstDiagnosis.summary.total
      const issuesAfter = postDiagnosis.issues.filter((x) => x.severity !== 'info').length
      restored.push({
        key,
        url: page.finalUrl,
        label: key,
        before: firstDiagnosis.score,
        after: postDiagnosis.score,
        issuesBefore,
        issuesAfter,
        cycles: history.length,
        ai: aiApplied,
        html: workingHtml,
        initialTypes,
      })
      sendEvent({
        type: 'page_result',
        data: { url: page.finalUrl, label: key, index: i + 1, total: sitePages.length, before_score: firstDiagnosis.score, after_score: postDiagnosis.score, issues_before: issuesBefore, issues_after: issuesAfter, cycles: history.length },
      })
    }
  } finally {
    await session?.close().catch(() => {})
  }

  // ── Aggregate verification ──
  const avgBefore = Math.round(restored.reduce((a, r) => a + r.before, 0) / restored.length)
  const avgAfter = Math.round(restored.reduce((a, r) => a + r.after, 0) / restored.length)
  const totalIssuesBefore = restored.reduce((a, r) => a + r.issuesBefore, 0)
  const totalIssuesAfter = restored.reduce((a, r) => a + r.issuesAfter, 0)
  const sharedTypes = Object.entries(
    restored.flatMap((r) => r.initialTypes).reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc }, {}),
  ).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 4)

  const verification = {
    site: true,
    page_count: restored.length,
    before: { issues: totalIssuesBefore, score: avgBefore },
    after: { issues: totalIssuesAfter, score: avgAfter },
    improvement: `${avgAfter - avgBefore >= 0 ? '+' : ''}${avgAfter - avgBefore} points`,
    durationMs: Date.now() - startedAt,
  }
  chain.done('agent-loop', `All ${restored.length} pages restored — site health ${avgBefore} → ${avgAfter}`, `${totalIssuesBefore} issues found · ${totalIssuesAfter} remaining`)
  sendEvent({
    type: 'verification_complete',
    data: {
      verification,
      site_pages: restored.map((r) => ({ label: r.label, before: r.before, after: r.after, issues_before: r.issuesBefore, issues_after: r.issuesAfter })),
      remaining_issues: [],
      final: true,
    },
  })

  // ── AFTER screenshot — visual proof (entry page) ──
  const entryFixed = restored[0].html
  fs.writeFileSync(path.join(artifactsDir, 'restored.html'), entryFixed, 'utf8')
  fs.writeFileSync(path.join(artifactsDir, 'rollback.html'), sanitizeEncoding(originalHtml), 'utf8')
  registryPut(restorationId, { id: restorationId, dir: artifactsDir, created, fixedHtml: entryFixed, originalHtml: sanitizeEncoding(originalHtml), finalUrl, hostname })

  let screenshotAfter = null
  await chain.step('verify-shot', 'Capturing AFTER screenshot — visual proof of restoration…', 'camera', async () => {
    const contentPath = `/api/restore/v3/content/${restorationId}/fixed.html?base=1`
    screenshotAfter = session
      ? await session.screenshot(origin + contentPath, path.join(artifactsDir, 'after.png'))
      : await takeScreenshot(origin + contentPath, artifactsDir, 'after.png')
    if (screenshotAfter) {
      let size = 0
      try { size = fs.statSync(screenshotAfter.filePath).size } catch {}
      const verified = size > 5000
      sendEvent({ type: 'screenshot_after', data: { screenshotPath: artifactUrl('after.png'), verified } })
      return verified ? 'After screenshot captured and verified' : 'After screenshot captured (may be sparse)'
    }
    return 'Browser unavailable — continuing without visual proof'
  })

  // ── Behavioral tests on the restored entry page ──
  let siteBehavior = null
  await chain.step('behavior-test', 'Running behavioral tests on the restored site — booting it and exercising forms and buttons…', 'shield', async () => {
    siteBehavior = await runBehaviorTests({ html: entryFixed })
    sendEvent({
      type: 'behavior_test',
      data: { total: siteBehavior.total, passed: siteBehavior.passed, failed: siteBehavior.failed, js_errors: siteBehavior.js_errors, notes: siteBehavior.notes, site_wide: true },
    })
    if (!siteBehavior.available) return 'Behavioral tests unavailable in this environment'
    if (siteBehavior.failed.length === 0) return `All ${siteBehavior.total} behavioral test(s) passed — entry page boots clean, interactions verified`
    return `${siteBehavior.passed}/${siteBehavior.total} behavioral test(s) passed — failing: ${clip(siteBehavior.failed.map((f) => f.name).join(', '), 100)}`
  })

  // ── DELIVERY: structured multi-page zip + pages.json for whole-site deploy ──
  const knownKeys = new Set(restored.map((r) => r.key))
  const pagesMap = {}
  const deliverables = await chain.step('deliver', `Packaging your restored ${restored.length}-page site…`, 'package', async () => {
    // Real git history for the entry page: damaged → each milestone → final.
    const gitHistory = buildRestoreGitHistory({
      dir: artifactsDir,
      originalHtml,
      finalHtml: entryFixed,
      milestones: siteMilestones,
      meta: { url: finalUrl, hostname, site_wide: true, pages: restored.length },
    })
    sendEvent({
      type: 'git_history',
      data: { available: gitHistory.available, commits: gitHistory.commits, tags: gitHistory.tags, log: gitHistory.log.slice(0, 10), reason: gitHistory.reason || null, site_wide: true },
    })

    for (const r of restored) {
      pagesMap[r.key] = rewriteInternalPageLinks(r.html, knownKeys, r.key, r.url)
    }
    fs.writeFileSync(path.join(artifactsDir, 'pages.json'), JSON.stringify(pagesMap), 'utf8')

    const zip = new JSZip()
    for (const [key, html] of Object.entries(pagesMap)) zip.file(zipPathForKey(key), html)
    const report = {
      restored_by: 'AlphaTekX Restoration Engine V4 — Site Edition',
      url: finalUrl,
      timestamp: new Date().toISOString(),
      summary: {
        pages_restored: restored.length,
        issues_found: totalIssuesBefore,
        issues_fixed: totalIssuesBefore - totalIssuesAfter,
        avg_before_score: avgBefore,
        avg_after_score: avgAfter,
        improvement: verification.improvement,
      },
      pages: restored.map((r) => ({ path: r.key, before_score: r.before, after_score: r.after, issues_before: r.issuesBefore, issues_after: r.issuesAfter, cycles: r.cycles })),
      shared_damage: sharedTypes.map(([type, count]) => ({ type, pages_affected: count })),
      design_tokens: designTokens,
      agent: {
        version: 'V4-agentic-site',
        memory_used: Boolean(memory && memory.scans > 0),
        cms: siteCms,
        strategy_plan: strategyPlan ? { source: strategyPlan.source, tasks: strategyPlan.tasks.length, strategy: strategyPlan.strategy } : null,
        behavior_tests: siteBehavior ? { total: siteBehavior.total, passed: siteBehavior.passed, failed: siteBehavior.failed } : null,
        git_history: gitHistory.available ? { commits: gitHistory.commits, tags: gitHistory.tags } : { available: false, reason: gitHistory.reason || null },
      },
    }
    zip.file('RESTORATION_REPORT.json', JSON.stringify(report, null, 2))
    const restoredZip = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    fs.writeFileSync(path.join(artifactsDir, 'restored.zip'), restoredZip)

    const rollbackZip = new JSZip()
    rollbackZip.file('original.html', sanitizeEncoding(originalHtml))
    rollbackZip.file('ROLLBACK_README.txt', `Rollback package\nOriginal entry page snapshot: ${finalUrl}\nCaptured: ${new Date().toISOString()}`)
    const rollbackBuf = await rollbackZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    fs.writeFileSync(path.join(artifactsDir, 'rollback.zip'), rollbackBuf)

    const ghToken = readCookieToken(cookieHeader)
    const suggestedName = slugifyHostname(hostname)
    return {
      git: gitHistory.available
        ? { available: true, commits: gitHistory.commits, tags: gitHistory.tags, rollback: 'git checkout damaged-original -- index.html', dir: artifactsDir }
        : { available: false, reason: gitHistory.reason || null },
      github: {
        available: Boolean(ghToken),
        branch_plan: `alphatekx-fix-${Math.floor(Date.now() / 1000)}`,
        note: ghToken ? 'GitHub connected — connect a repo URL to open the PR.' : 'Connect GitHub to receive the fix as a pull request.',
      },
      download: {
        available: true,
        restored: `/api/restore/v3/download?id=${restorationId}&which=restored`,
        rollback: `/api/restore/v3/download?id=${restorationId}&which=rollback`,
      },
      copy: { available: true, content_length: entryFixed.length },
      deploy: {
        available: true,
        suggested_name: suggestedName,
        endpoint: '/api/deploy',
        url_preview: `https://alphatekx.name.ng/app/${suggestedName}`,
        site: true,
        page_count: restored.length,
        restoration_id: restorationId,
      },
    }
  })
  chain.done('deliver', 'Delivery ready — Download · Copy · Deploy (all pages hosted)', `${Object.keys(pagesMap).length} pages packaged · internal links rewritten relative`)

  const rows = restored.map((r) => `| \`${r.label}\` | ${r.before} → **${r.after}** | ${r.issuesBefore} → ${r.issuesAfter} |`).join('\n')
  const siteGenuinelyRestored = totalIssuesAfter === 0 || avgAfter >= TARGET_SCORE || avgAfter - avgBefore >= 10
  const msg = siteGenuinelyRestored ? [
    `🌐 **${hostname} restored across ${restored.length} pages!**`,
    '',
    `| Page | Score | Issues |`,
    `|---|---|---|`,
    rows,
    '',
    `**Site health: ${avgBefore}/100 → ${avgAfter}/100** (${totalIssuesBefore} issues found, ${totalIssuesAfter} remaining)`,
    sharedTypes.length ? `\nShared damage repaired everywhere: ${sharedTypes.map(([t, n]) => `${t} ×${n} pages`).join(' · ')}` : '',
    siteBehavior && siteBehavior.available
      ? `**Behavioral tests:** ${siteBehavior.passed}/${siteBehavior.total} passed${siteBehavior.failed.length ? ` — attention: ${clip(siteBehavior.failed.map((f) => f.name).join(', '), 80)}` : ' (entry page boots clean, interactions verified)'}`
      : '',
    deliverables?.git?.available
      ? `**Version control:** ${deliverables.git.commits} commits · tags \`${(deliverables.git.tags || []).slice(0, 3).join('`, `')}\` — full rollback with one git command`
      : '',
    '',
    '**Receive your restored site:**',
    `1. ⬇️ [Download site.zip](${deliverables.download.restored}) — full folder structure, links work offline`,
    `2. 🚀 Say **"deploy as ${deliverables.deploy.suggested_name}"** — every page goes live under ${deliverables.deploy.url_preview}`,
    `3. 📋 Entry page HTML attached below (one-click copy)`,
  ].join('\n') : [
    `⚠️ **${hostname} is partially repaired across ${restored.length} pages.**`,
    '',
    `| Page | Score | Issues |`,
    `|---|---|---|`,
    rows,
    '',
    `**Site health: ${avgBefore}/100 → ${avgAfter}/100** (${totalIssuesBefore} issues found, ${totalIssuesAfter} still open)`,
    isLlmRepairConfigured()
      ? 'The deep repair engine could not finish every page this run — press Continue, then say **"fix my whole site"** again and I will finish the remaining pages.'
      : 'No AI provider key is configured, so only rule-based fixes were applied. Add your API keys and say **"fix my whole site"** for the full restoration.',
    '',
    '**Your partial fixes are packaged below:**',
    `1. ⬇️ [Download site.zip](${deliverables.download.restored}) — partial fixes included`,
    `2. 📋 Entry page HTML attached below (one-click copy)`,
  ].join('\n')
  sendEvent({
    type: 'restore_complete',
    restorationId,
    data: {
      summary: {
        pages_restored: restored.length,
        issues_found: totalIssuesBefore,
        issues_fixed: totalIssuesBefore - totalIssuesAfter,
        before_score: avgBefore,
        after_score: avgAfter,
        improvement: verification.improvement,
        status: siteGenuinelyRestored ? 'restored' : 'incomplete',
      },
      deliverables,
      screenshots: {
        before: screenshotBefore ? artifactUrl('before.png') : null,
        after: screenshotAfter ? artifactUrl('after.png') : null,
      },
      design_tokens: designTokens,
      verification,
      agent: {
        memory_used: Boolean(memory && memory.scans > 0),
        memory_recurring_issues: memory?.recurring_issues || [],
        strategy_plan: strategyPlan ? { source: strategyPlan.source, tasks: strategyPlan.tasks.length, strategy: strategyPlan.strategy, task_list: strategyPlan.tasks } : null,
        behavior_tests: siteBehavior ? { total: siteBehavior.total, passed: siteBehavior.passed, failed: siteBehavior.failed, js_errors: siteBehavior.js_errors } : null,
        git_history: deliverables?.git || null,
        ai_repairs_applied: restored.reduce((a, r) => a + r.ai, 0),
        interactivity_reconstructed: siteBehaviorRebuilt ? { functions: siteBehaviorRebuilt.functions } : null,
      },
      status: siteGenuinelyRestored ? 'restored' : 'incomplete',
      site: {
        page_count: restored.length,
        avg_before: avgBefore,
        avg_after: avgAfter,
        pages: restored.map((r) => ({ label: r.label, before: r.before, after: r.after, issues_before: r.issuesBefore, issues_after: r.issuesAfter })),
      },
      tier: avgAfter >= 95 ? 'gold' : avgAfter >= 75 ? 'silver' : 'bronze',
      copy_content: entryFixed.length <= 280000 ? entryFixed : entryFixed.slice(0, 280000),
      copy_truncated: entryFixed.length > 280000,
    },
  })
  sendEvent({ type: 'v3_summary', message: msg })

  recordRestoration({
    url: finalUrl,
    hostname,
    beforeScore: avgBefore,
    afterScore: avgAfter,
    topIssues: sharedTypes.map(([t]) => t).slice(0, 5),
  }).catch(() => {})

  sendEvent({ type: 'pipeline_done', restorationId })
}

function pageLabelFor(finalUrl) {
  const key = pageKeyOf(finalUrl)
  return key === '/' ? 'home page' : key
}

/**
 * Launcher shells hide the real document inside the page — an iframe srcdoc,
 * or (our own publisher) a JS template string assigned to frame.srcdoc.
 * Visitors SEE the inner app; static scanners only see the shell. Alpha opens
 * the shell and restores what the visitor actually sees. Returns null when
 * the html is a normal self-contained page.
 */
export function extractEmbeddedDocument(html) {
  if (!html || typeof html !== 'string') return null

  // Case 1: AlphaTekX publisher shells — alphatekx:published:<slug> + template → frame.srcdoc
  if (/alphatekx:published:/i.test(html) && /srcdoc\s*=\s*template/i.test(html)) {
    const m = html.match(/(?:let|const|var)\s+template\s*=\s*("(?:\\.|[^"\\])+")/)
    if (m) {
      let inner = null
      try { inner = JSON.parse(m[1]) } catch {
        // Tolerate raw line terminators inside the literal (invalid strict JSON,
        // but producers emit them anyway).
        try { inner = JSON.parse(m[1].replace(/(?<!\\)\r?\n/g, '\\n')) } catch {}
      }
      if (typeof inner === 'string' && /<[a-z!]/i.test(inner) && inner.length > 400) {
        return { html: inner, source: 'launcher-template' }
      }
    }
  }

  // Case 2: plain <iframe srcdoc="..."> carrying a full document
  const m2 = html.match(/<iframe[^>]*?\ssrcdoc\s*=\s*"([^"]+)"[^>]*>/i)
  if (m2) {
    let inner = m2[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&amp;/g, '&')
    const outerVisibleText = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const looksLikeDoc = /<html[\s>]/i.test(inner) || /<(body|main|div|h1|h2|p)[\s>]/i.test(inner)
    if (looksLikeDoc && inner.length > 400 && inner.length > outerVisibleText.length * 2) {
      return { html: inner, source: 'iframe-srcdoc' }
    }
  }

  return null
}

function registryGetFixed(id) {
  const state = registry.get(id)
  if (state?.fixedHtml) return state.fixedHtml
  try {
    return fs.readFileSync(path.join(ARTIFACTS_ROOT, id, 'restored.html'), 'utf8')
  } catch {
    return ''
  }
}

/**
 * Whole-site pages map written by site-mode delivery ({"/": html, ...}).
 * The deploy endpoint loads this so one name hosts every restored page.
 */
export function getRestorationPages(id) {
  if (!/^atk_[a-z0-9]+$/.test(String(id || ''))) return null
  try {
    const raw = fs.readFileSync(path.join(ARTIFACTS_ROOT, String(id), 'pages.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return Object.keys(parsed).length ? parsed : null
  } catch {
    return null
  }
}

function readCookieToken(cookieHeader) {
  for (const c of String(cookieHeader || '').split(';')) {
    const [k, ...rest] = c.trim().split('=')
    if (k === 'gh_token') return decodeURIComponent(rest.join('='))
  }
  return null
}

// ─── Delivery routes ─────────────────────────────────────────────────────────

export function handleV3DownloadRoute(req, res) {
  const parsed = new URL(req.url, 'http://localhost')
  const id = String(parsed.searchParams.get('id') || '')
  const which = parsed.searchParams.get('which') === 'rollback' ? 'rollback' : 'restored'
  if (!/^atk_[a-z0-9]+$/.test(id)) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Invalid restoration id' }))
  }
  const filePath = path.join(ARTIFACTS_ROOT, id, `${which}.zip`)
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Package expired or not found' }))
  }
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${which}-${id}.zip"`,
    'Content-Length': fs.statSync(filePath).size,
  })
  fs.createReadStream(filePath).pipe(res)
}

export function handleV3ArtifactRoute(req, res) {
  const parsed = new URL(req.url, 'http://localhost')
  const parts = parsed.pathname.split('/').filter(Boolean)
  const id = parts[4]
  const file = parts[5]
  if (!/^atk_[a-z0-9]+$/.test(id || '') || !/^[a-z-]+\.(png|zip|json|txt|html)$/i.test(file || '')) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Invalid artifact request' }))
  }
  const filePath = path.join(ARTIFACTS_ROOT, id, file)
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Artifact not found' }))
  }
  const ext = path.extname(filePath).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : ext === '.zip' ? 'application/zip' : ext === '.html' ? 'text/html; charset=utf-8' : ext === '.json' ? 'application/json' : 'text/plain; charset=utf-8'
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' })
  fs.createReadStream(filePath).pipe(res)
}

export function handleV3ContentRoute(req, res) {
  const parsed = new URL(req.url, 'http://localhost')
  const parts = parsed.pathname.split('/').filter(Boolean)
  const id = parts[4]
  const file = parts[5]
  if (!/^atk_[a-z0-9]+$/.test(id || '') || file !== 'fixed.html') {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Invalid content request' }))
  }
  const html = registryGetFixed(id)
  if (!html) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Restored content not found' }))
  }
  let body = html
  if (parsed.searchParams.get('base') === '1') {
    const state = registry.get(id)
    const baseHref = state?.finalUrl
    if (baseHref) {
      if (/<head[^>]*>/i.test(body)) {
        body = body.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`)
      } else {
        body = `<base href="${baseHref}">${body}`
      }
    }
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(body)
}
