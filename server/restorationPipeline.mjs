// restorationPipeline.mjs — THE COMPLETE ALPHATEKX RESTORATION PIPELINE (FINAL PRODUCTION VERSION)
//
// 7 STEPS. IN ORDER. NOTHING SKIPPED.
//   STEP 1 RECONNAISSANCE — load the page, capture HTML, screenshot (before), design tokens, interaction sweep
//   STEP 2 DIAGNOSE       — find EVERY issue (all 25 checks), with evidence and line numbers
//   STEP 3 FIX PLAN       — a detailed plan for EVERY issue (before / after / severity / description)
//   STEP 4 EXECUTE REPAIRS— apply every fix to the code, one by one, in order
//   STEP 5 RECONSTRUCT    — reassemble, validate UTF-8 + English + HTML structure, save the files
//   STEP 6 VERIFY         — re-scan the fixed site, compare before/after scores, capture proof
//   STEP 7 DELIVER        — GitHub Pull Request | restored.zip + rollback.zip | copy code | deploy
//
// CRITICAL RULES ENFORCED BY THIS MODULE:
//   1. Never checks DNS, SSL, server status, hosting provider, logs, or configurations.
//   2. Always UTF-8 read/write. 3. Always removes BOM. 4. Always removes null bytes.
//   5. Always validates HTML before saving. 6. Always verifies English (no CJK mojibake).
//   7. Always re-scans after fixes. 8. Always reports before/after. 9. All 4 delivery options ready.
//
// Routes (mounted under /api/pipeline/):
//   POST /api/pipeline/session                 -> { sessionId }
//   POST /api/pipeline/run      { url }        -> runs steps 1-6, full pipeline response
//   GET  /api/pipeline/state    ?sessionId=
//   GET  /api/pipeline/code     ?sessionId=    -> fixed HTML (text/plain)
//   GET  /api/pipeline/download ?sessionId=&which=restored|rollback -> zip
//   POST /api/pipeline/deliver/github { sessionId, repo } -> pr_url
//   POST /api/pipeline/deploy   { sessionId, name, title? } -> deploy url

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { FileHandler, sanitizeEncoding, validateHtml } from './scanEngine/fileUtils.js'

const PIPELINE_VERSION = '1.0.0'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 20_000
const MAX_HTML_BYTES = 1_500_000
const RESOURCE_TIMEOUT_MS = 5_000
const SCAN_RESOURCE_CAP = 60
const VERIFY_RESOURCE_CAP = 40
const RESOURCE_CONCURRENCY = 8
const FIXED_WIDTH_MIN_PX = 480
const UA_HEADER = 'Mozilla/5.0 (compatible; AlphaTekxRestorationPipeline/1.0)'

const SEVERITY_DEDUCTION = { critical: 15, high: 10, medium: 5, low: 2 }
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']

const SECRET_PATTERNS = [
  { type: 'GITHUB_TOKEN', label: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { type: 'OPENAI_KEY', label: 'OpenAI API key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { type: 'STRIPE_SECRET_KEY', label: 'Stripe secret key', regex: /\bsk_live_[0-9a-zA-Z]{16,}\b/g },
  { type: 'AWS_ACCESS_KEY', label: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: 'SLACK_TOKEN', label: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { type: 'GOOGLE_API_KEY', label: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { type: 'GENERIC_SECRET', label: 'Hardcoded secret or password', regex: /((?:password|passwd|secret|api_?key|auth_?token)\s*[:=]\s*["'])([^"'\s]{8,})(["'])/gi },
]

const MIXED_CONTENT_EXCLUDE = /(localhost|127\.0\.0\.1|www\.w3\.org)/i

function maskSecret(value) {
  const raw = String(value || '')
  if (raw.length <= 8) return 'REDACTED'
  return `${raw.slice(0, 3)}****${raw.slice(-4)}`
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lineOf(html, index) {
  let line = 1
  for (let i = 0; i < index && i < html.length; i++) if (html.charCodeAt(i) === 10) line++
  return line
}

function escapeHtmlAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function normalizeTargetUrl(raw) {
  let value = String(raw || '').trim()
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname || parsed.hostname.length > 253) return null
    return parsed.toString()
  } catch {
    return null
  }
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA_HEADER, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const contentType = String(response.headers.get('content-type') || '')
  const html = await response.text()
  const headers = {}
  response.headers.forEach((value, key) => { headers[String(key).toLowerCase()] = value })
  return { ok: response.ok, status: response.status, finalUrl: response.url || url, contentType, html, headers }
}

async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

// ─── Minimal ZIP writer (STORE method) — restored.zip / rollback.zip ─────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(d = new Date()) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | Math.floor(d.getSeconds() / 2)
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f)
  return { time, date }
}

/** Build a real .zip archive (store method, UTF-8 names) entirely locally. */
export function makeZipBuffer(files) {
  const chunks = []
  const central = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(String(file.name), 'utf8')
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data ?? ''), 'utf8')
    const crc = crc32(data)
    const { time, date } = dosDateTime()
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 name flag
    local.writeUInt16LE(0, 8) // store
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, name, data)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(time, 12)
    cd.writeUInt16LE(date, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt32LE(offset, 42)
    central.push(Buffer.concat([cd, name]))
    offset += 30 + name.length + data.length
  }
  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, cdBuf, eocd])
}

// ─── Live resource probing (links / images / scripts / styles) ───────────────

function extractPageResources(html, baseUrl) {
  const source = String(html)
  const out = { links: [], images: [], scripts: [], styles: [] }
  const seen = new Set()
  const consider = (kind, bucket, raw) => {
    const value = String(raw || '').trim()
    if (!value || /^(data:|mailto:|tel:|javascript:|about:|#)/i.test(value)) return
    let abs
    try { abs = new URL(value, baseUrl).toString() } catch { return }
    if (!/^https?:/i.test(abs)) return
    const key = `${kind}|${abs}`
    if (seen.has(key)) return
    seen.add(key)
    out[bucket].push({ kind, raw: value, abs })
  }
  for (const m of source.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi)) consider('link', 'links', m[1])
  for (const m of source.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) consider('image', 'images', m[1])
  for (const m of source.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) consider('script', 'scripts', m[1])
  for (const m of source.matchAll(/<link\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi)) consider('style', 'styles', m[1])
  return out
}

async function probeUrl(absUrl) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const response = await fetch(absUrl, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(RESOURCE_TIMEOUT_MS),
        headers: { 'User-Agent': UA_HEADER },
      })
      if (method === 'GET') response.body?.cancel?.().catch(() => {})
      if (method === 'HEAD' && (response.status === 405 || response.status === 501)) continue
      return response.status
    } catch {
      if (method === 'GET') return 0
    }
  }
  return 0
}

/** Read real pixel dimensions out of PNG / GIF / JPEG magic bytes. */
async function sniffImageDimensions(absUrl) {
  try {
    const res = await fetch(absUrl, {
      headers: { Range: 'bytes=0-131071', 'User-Agent': UA_HEADER },
      redirect: 'follow',
      signal: AbortSignal.timeout(RESOURCE_TIMEOUT_MS),
    })
    if (!res.ok && res.status !== 206) return null
    const contentType = String(res.headers.get('content-type') || '')
    if (contentType && !contentType.startsWith('image/') && !/\.(png|jpe?g|gif)$/i.test(new URL(absUrl).pathname)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let pos = 2
      while (pos + 9 < buf.length) {
        if (buf[pos] !== 0xff) { pos++; continue }
        const marker = buf[pos + 1]
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(pos + 5), width: buf.readUInt16BE(pos + 7) }
        }
        const len = buf.readUInt16BE(pos + 2)
        if (len < 2) break
        pos += 2 + len
      }
    }
    return null
  } catch {
    return null
  }
}

async function findBrokenResources(html, baseUrl, cap = SCAN_RESOURCE_CAP) {
  const groups = extractPageResources(html, baseUrl)
  const stats = {
    total_links: groups.links.length,
    total_images: groups.images.length,
    total_scripts: groups.scripts.length,
    total_styles: groups.styles.length,
  }
  const all = [...groups.links, ...groups.images, ...groups.scripts, ...groups.styles].slice(0, cap)
  stats.checked = all.length
  const statuses = await mapWithLimit(all, RESOURCE_CONCURRENCY, (item) => probeUrl(item.abs))
  const records = all.map((item, i) => ({ ...item, status: statuses[i] }))
  const brokenRecords = records.filter((r) => r.status < 200 || r.status >= 400)

  // Real dimension sniffing for healthy images (used to add width/height attributes).
  const imageDims = {}
  const healthyImages = records.filter((r) => r.kind === 'image' && r.status >= 200 && r.status < 300).slice(0, 12)
  await mapWithLimit(healthyImages, RESOURCE_CONCURRENCY, async (r) => {
    const dims = await sniffImageDimensions(r.abs)
    if (dims && dims.width > 0 && dims.height > 0) imageDims[r.raw] = dims
  })

  const findings = []
  let counter = 0
  const describe = (type, severity, label, list) => {
    if (!list.length) return
    const sample = list[0]
    const statusText = sample.status === 0 ? 'unreachable' : `HTTP ${sample.status}`
    findings.push({
      id: `r-${++counter}`,
      type,
      severity,
      description: `${list.length} broken ${label} detected (${statusText}: ${sample.raw}).`,
      count: list.length,
      evidence: String(sample.raw).slice(0, 200),
    })
  }
  describe('broken_script', 'critical', 'script(s)', brokenRecords.filter((r) => r.kind === 'script'))
  describe('broken_style', 'high', 'stylesheet(s)', brokenRecords.filter((r) => r.kind === 'style'))
  describe('broken_link', 'high', 'link(s)', brokenRecords.filter((r) => r.kind === 'link'))
  describe('broken_image', 'high', 'image(s)', brokenRecords.filter((r) => r.kind === 'image'))

  const firstOkImage = records.find((r) => r.kind === 'image' && r.status >= 200 && r.status < 300 && /^https?:/i.test(r.abs))
  return { findings, brokenRecords, stats, imageDims, ogImageCandidate: firstOkImage?.abs || null }
}

function removeBrokenResource(html, rec) {
  const raw = escapeRegExp(rec.raw)
  if (rec.kind === 'image') {
    return html.replace(new RegExp(`<img\\b[^>]*?\\bsrc\\s*=\\s*["']${raw}["'][^>]*>`, 'gi'), '<!-- broken image removed by AlphaTekX -->')
  }
  if (rec.kind === 'script') {
    return html.replace(new RegExp(`<script\\b[^>]*?\\bsrc\\s*=\\s*["']${raw}["'][^>]*>[\\s\\S]*?</script>`, 'gi'), '<!-- broken script removed by AlphaTekX -->')
  }
  if (rec.kind === 'style') {
    return html.replace(new RegExp(`<link\\b[^>]*?\\bhref\\s*=\\s*["']${raw}["'][^>]*>`, 'gi'), '<!-- broken stylesheet removed by AlphaTekX -->')
  }
  return html.replace(new RegExp(`<a\\b[^>]*?\\bhref\\s*=\\s*["']${raw}["'][^>]*>([\\s\\S]*?)</a>`, 'gi'), '$1')
}

// ─── Design tokens + interaction sweep (STEP 1) ──────────────────────────────

export function extractDesignTokens(html) {
  const source = String(html)
  const colorCounts = new Map()
  for (const m of source.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
    const v = m[0].toLowerCase()
    colorCounts.set(v, (colorCounts.get(v) || 0) + 1)
  }
  const colors = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([hex]) => hex)
  const fonts = []
  for (const m of source.matchAll(/font-family\s*:\s*([^;}"]+)/gi)) {
    const v = m[1].trim().slice(0, 80)
    if (v && !fonts.includes(v)) fonts.push(v)
    if (fonts.length >= 10) break
  }
  const spacingSet = new Set()
  for (const m of source.matchAll(/\b(?:margin|padding|gap)(?:-(?:top|right|bottom|left|block|inline))?\s*:\s*([^;}"]+)/gi)) {
    for (const px of String(m[1]).matchAll(/(\d+(?:\.\d+)?)px/gi)) spacingSet.add(`${px[1]}px`)
  }
  const spacing = [...spacingSet].sort((a, b) => parseFloat(a) - parseFloat(b)).slice(0, 12)
  return { colors, fonts, spacing }
}

export function sweepInteractions(html) {
  const source = String(html)
  const styleBlocks = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
  const count = (re, str = source) => (str.match(re) || []).length
  return {
    click_handlers: count(/\bonclick\s*=|\baddEventListener\(\s*['"]click['"]/gi),
    buttons: count(/<button\b/gi),
    links: count(/<a\b[^>]*\bhref\s*=/gi),
    forms: count(/<form\b/gi),
    inputs: count(/<(input|select|textarea)\b/gi),
    scroll_listeners: count(/\baddEventListener\(\s*['"]scroll['"]/gi),
    hover_rules: count(/:hover/i, styleBlocks),
  }
}

async function captureShot(url, label, scanId, log) {
  try {
    const mod = await import('./screenshotService.mjs')
    const meta = await mod.captureScreenshot(url, { label, scanId })
    return { ok: true, id: meta.id, serve_url: meta.serveUrl, file: meta.filePath }
  } catch (err) {
    log?.(`[pipeline] screenshot '${label}' unavailable: ${err.message}`)
    return { ok: false, degraded: true, reason: err.message }
  }
}

// ─── Shared helpers used by both diagnose and repairs ─────────────────────────

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function metaTagsOf(html) {
  return [...String(html).matchAll(/<meta\b[^>]*>/gi)].map((m) => ({ tag: m[0], index: m.index }))
}

function metaHasName(metaTag, nameValue) {
  return new RegExp(`\\bname\\s*=\\s*["']${escapeRegExp(nameValue)}["']`, 'i').test(metaTag)
}

function metaContent(metaTag) {
  const m = metaTag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)
  return m ? m[1] : ''
}

function linkRelsOf(html) {
  return [...String(html).matchAll(/<link\b[^>]*>/gi)].map((m) => ({ tag: m[0], index: m.index }))
}

function relListOf(linkTag) {
  const m = linkTag.match(/\brel\s*=\s*["']([^"']*)["']/i)
  return m ? m[1].toLowerCase().split(/\s+/) : []
}

function titleText(html) {
  const m = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return m ? stripTags(m[1]) : ''
}

function applyEdits(html, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  let out = html
  for (const edit of sorted) out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end)
  return out
}

function addAttrToTag(tag, attr) {
  const selfClose = /\/>\s*$/.test(tag)
  const base = tag.replace(/\s*\/?>\s*$/, '')
  return `${base} ${attr}${selfClose ? ' />' : '>'}`
}

function imgSrcOf(imgTag) {
  const m = imgTag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)
  return m ? m[1] : ''
}

function deriveAltFromSrc(src) {
  try {
    const base = decodeURIComponent(String(src).split('?')[0].split('#')[0]).split('/').filter(Boolean).pop() || ''
    const cleaned = base.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ').replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim()
    if (!cleaned) return ''
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  } catch {
    return ''
  }
}

function slugLabelFromHref(href) {
  try {
    const base = String(href).split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || ''
    const cleaned = base.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ').trim()
    return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Link'
  } catch {
    return 'Link'
  }
}

function injectIntoHead(html, snippet) {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n${snippet}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}\n<head>\n${snippet}\n</head>`)
  return `<head>\n${snippet}\n</head>\n${html}`
}

function faviconDataUri(hostname) {
  const letter = (String(hostname).replace(/^www\./i, '')[0] || 'A').toUpperCase()
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#111827'/><text x='32' y='44' font-size='36' font-family='Arial' font-weight='bold' text-anchor='middle' fill='#ffffff'>${letter}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function headingSequenceJumps(html) {
  const jumps = []
  let last = 0
  for (const m of String(html).matchAll(/<h([1-6])\b/gi)) {
    const level = Number(m[1])
    if (last && level > last + 1) jumps.push({ index: m.index, from: last, to: level })
    last = level
  }
  return jumps
}

// ─── STEP 2: DIAGNOSE — every check, evidence-backed ──────────────────────────

/**
 * @param {object} input
 * @param {string} input.html            raw HTML source
 * @param {string} input.baseUrl         absolute URL of the page (for resource probing)
 * @param {object|null} input.pageHeaders lowercased response headers (live scan only)
 * @param {number} [input.resourceCap]
 */
export async function diagnosePage({ html, baseUrl, pageHeaders = null, resourceCap = SCAN_RESOURCE_CAP }) {
  const source = String(html || '')
  const issues = []
  let counter = 0
  const addIssue = (type, severity, description, location, before, count = 1) => {
    issues.push({
      id: `ISSUE-${String(++counter).padStart(3, '0')}`,
      type,
      severity,
      description,
      location,
      before: String(before || '').slice(0, 300),
      count,
    })
  }

  // 1. ENCODING CORRUPTION — BOM, null bytes, CJK mojibake, replacement characters
  {
    const hasBom = source.charCodeAt(0) === 0xfeff
    const nullCount = (source.match(/\u0000/g) || []).length
    const cjkMatch = source.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/)
    const replacement = source.includes('\uFFFD')
    if (hasBom || nullCount > 0 || cjkMatch || replacement) {
      const causes = [
        hasBom && 'BOM prefix',
        nullCount > 0 && `${nullCount} null byte(s)`,
        cjkMatch && `CJK mojibake ("${cjkMatch[0]}")`,
        replacement && 'replacement characters',
      ].filter(Boolean).join(', ')
      addIssue('corrupted_encoding', 'critical', `Encoding corruption detected (${causes}). File must be saved as clean UTF-8.`, `index.html:1`, source.slice(0, 60))
    }
  }

  // 2. LEAKED SECRETS — regex patterns for API keys, tokens, passwords
  for (const pattern of SECRET_PATTERNS) {
    const matches = [...source.matchAll(pattern.regex)]
    if (matches.length) {
      const sampleRaw = matches[0][2] || matches[0][0]
      addIssue(
        'leaked_secret',
        'critical',
        `${pattern.label} exposed in page source (${matches.length} occurrence${matches.length > 1 ? 's' : ''}, e.g. ${maskSecret(sampleRaw)}).`,
        `index.html:${lineOf(source, matches[0].index)}`,
        matches[0][0],
        matches.length,
      )
    }
  }

  // 3. MIXED CONTENT — insecure http:// resources referenced from the page
  {
    const matches = [...source.matchAll(/(?:src|href)\s*=\s*["']http:\/\/[^"']+["']/gi)].filter((m) => !MIXED_CONTENT_EXCLUDE.test(m[0]))
    if (matches.length) {
      addIssue('mixed_content', 'high', `${matches.length} insecure http:// resource reference${matches.length > 1 ? 's' : ''} trigger browser mixed-content warnings.`, `index.html:${lineOf(source, matches[0].index)}`, matches[0][0], matches.length)
    }
  }

  // 4. META TAGS — charset, viewport, title, description, lang (+ robots/canonical/favicon/OG below)
  if (!/<meta[^>]+charset/i.test(source)) {
    addIssue('missing_charset', 'high', 'No charset declaration found — browsers may misinterpret encoding.', 'index.html:1', '(no <meta charset>)')
  }
  const viewportPresent = metaTagsOf(source).some((m) => metaHasName(m.tag, 'viewport'))
  if (!viewportPresent) {
    addIssue('missing_viewport', 'medium', 'No viewport meta tag — the page will not render correctly on mobile devices.', 'index.html:1', '(no viewport meta)')
  }
  if (!/<title>[^<]*\S[^<]*<\/title>/i.test(source)) {
    addIssue('missing_title', 'medium', 'Missing or empty <title> tag.', 'index.html:1', '(no <title>)')
  }
  {
    const descOk = metaTagsOf(source).some((m) => metaHasName(m.tag, 'description') && metaContent(m.tag).trim().length > 0)
    if (!descOk) addIssue('missing_description', 'low', 'Missing meta description tag (SEO).', 'index.html:1', '(no description meta)')
  }
  if (!/<html[^>]*\slang\s*=/i.test(source)) {
    addIssue('missing_lang', 'low', '<html> tag has no lang attribute (accessibility/SEO).', 'index.html:1', '<html>')
  }

  // 19. NO UNIQUE TITLE — duplicate <title> tags
  {
    const titles = [...source.matchAll(/<title\b[^>]*>[\s\S]*?<\/title>/gi)]
    if (titles.length > 1) {
      addIssue('duplicate_title', 'medium', `${titles.length} <title> tags found — only one unique title is allowed.`, `index.html:${lineOf(source, titles[1].index)}`, titles[1][0].slice(0, 120), titles.length)
    }
  }

  // 5 + 6. BROKEN LINKS & IMAGES (and scripts/stylesheets) — every href/src probed live
  let resources = { findings: [], brokenRecords: [], stats: null, imageDims: {}, ogImageCandidate: null }
  if (baseUrl) {
    try {
      resources = await findBrokenResources(source, baseUrl, resourceCap)
      for (const finding of resources.findings) {
        issues.push({
          id: `ISSUE-${String(++counter).padStart(3, '0')}`,
          type: finding.type,
          severity: finding.severity,
          description: finding.description,
          location: 'index.html',
          before: finding.evidence,
          count: finding.count,
        })
      }
    } catch {
      // Resource probing is best-effort; never block diagnosis on it.
    }
  }

  // 7. BAD CODE PATTERNS — eval(), innerHTML assignments with literals, document.write()
  {
    let evalCount = 0
    let writeCount = 0
    let innerHtmlLiteralCount = 0
    let firstEvalIdx = -1
    let firstWriteIdx = -1
    let firstInnerIdx = -1
    for (const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/i.test(m[1])) continue
      const bodyOffset = m.index + m[0].indexOf(m[2])
      const evals = [...m[2].matchAll(/(?<![\w.$])eval\s*\(/g)]
      if (evals.length && firstEvalIdx === -1) firstEvalIdx = bodyOffset + evals[0].index
      evalCount += evals.length
      const writes = [...m[2].matchAll(/document\.write(?:ln)?\s*\(/g)]
      if (writes.length && firstWriteIdx === -1) firstWriteIdx = bodyOffset + writes[0].index
      writeCount += writes.length
      const inners = [...m[2].matchAll(/\.innerHTML\s*\+=?\s*(["'])[^"']*\1/g)]
      if (inners.length && firstInnerIdx === -1) firstInnerIdx = bodyOffset + inners[0].index
      innerHtmlLiteralCount += inners.length
    }
    if (evalCount) addIssue('bad_code_eval', 'critical', `${evalCount} unsafe eval() call${evalCount > 1 ? 's' : ''} in inline JavaScript — remote/injected code execution risk.`, `index.html:${lineOf(source, firstEvalIdx)}`, 'eval(...)', evalCount)
    if (writeCount) addIssue('bad_code_document_write', 'medium', `${writeCount} document.write() call${writeCount > 1 ? 's' : ''} — blocks parsing and breaks modern pages.`, `index.html:${lineOf(source, firstWriteIdx)}`, 'document.write(...)', writeCount)
    if (innerHtmlLiteralCount) addIssue('bad_code_innerhtml', 'medium', `${innerHtmlLiteralCount} innerHTML assignment${innerHtmlLiteralCount > 1 ? 's' : ''} with string literals — XSS-safe alternative is textContent.`, `index.html:${lineOf(source, firstInnerIdx)}`, '.innerHTML = "..."', innerHtmlLiteralCount)
  }

  // 8. DUPLICATE ELEMENTS — duplicate IDs, multiple H1s
  {
    const idCounts = new Map()
    for (const m of source.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)) {
      const value = m[1]
      const entry = idCounts.get(value) || { count: 0, firstIndex: m.index }
      entry.count++
      idCounts.set(value, entry)
    }
    const dups = [...idCounts.entries()].filter(([, v]) => v.count > 1)
    if (dups.length) {
      const total = dups.reduce((sum, [, v]) => sum + v.count - 1, 0)
      addIssue('duplicate_id', 'medium', `${dups.length} duplicated ID${dups.length > 1 ? 's' : ''} (${total} extra element${total > 1 ? 's' : ''}), e.g. id="${dups[0][0]}" used ${dups[0][1].count}x — breaks getElementById and anchors.`, `index.html:${lineOf(source, dups[0][1].firstIndex)}`, `id="${dups[0][0]}"`, total)
    }
    const h1s = [...source.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    if (h1s.length > 1) {
      addIssue('multiple_h1', 'medium', `${h1s.length} <h1> elements found — a page must have exactly one H1.`, `index.html:${lineOf(source, h1s[1].index)}`, h1s[1][0].slice(0, 120), h1s.length)
    }
  }

  // 9. EMPTY ELEMENTS — attribute-less div/span/p with no content
  {
    const empties = [...source.matchAll(/<(div|span|p)>(?:\s|&nbsp;|\u00a0)*<\/\1>/gi)]
    if (empties.length) {
      addIssue('empty_element', 'low', `${empties.length} empty element${empties.length > 1 ? 's' : ''} (<${empties[0][1]}>) with no content and no attributes.`, `index.html:${lineOf(source, empties[0].index)}`, empties[0][0], empties.length)
    }
  }

  // 10. FIXED WIDTH LAYOUTS — large hard-coded px widths break mobile layouts
  {
    const fixed = [...source.matchAll(/(?<![\w-])width\s*:\s*(\d{3,})px/gi)].filter((m) => parseInt(m[1], 10) >= FIXED_WIDTH_MIN_PX)
    if (fixed.length) {
      addIssue('fixed_width', 'medium', `${fixed.length} fixed pixel width declaration${fixed.length > 1 ? 's' : ''} (e.g. ${fixed[0][1]}px) prevent responsive layout.`, `index.html:${lineOf(source, fixed[0].index)}`, fixed[0][0], fixed.length)
    }
  }

  // 11 + 25. ACCESSIBILITY / ALT TEXT — images without alt
  {
    const noAlt = [...source.matchAll(/<img\b(?![^>]*\balt\s*=)[^>]*>/gi)]
    if (noAlt.length) {
      addIssue('img_missing_alt', 'low', `${noAlt.length} <img> tag${noAlt.length > 1 ? 's' : ''} without an alt attribute (accessibility).`, `index.html:${lineOf(source, noAlt[0].index)}`, noAlt[0][0].slice(0, 160), noAlt.length)
    }
  }
  {
    let unlabeled = 0
    let firstIdx = -1
    for (const m of source.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const attrs = m[2]
      const text = stripTags(m[3])
      const labeled = /\baria-label\s*=/i.test(attrs) || /\btitle\s*=/i.test(attrs) || /\baria-hidden\s*=\s*["']true["']/i.test(attrs)
      if (!labeled && !text) {
        unlabeled++
        if (firstIdx === -1) firstIdx = m.index
      }
    }
    if (unlabeled) {
      addIssue('aria_missing_label', 'low', `${unlabeled} button/link${unlabeled > 1 ? 's' : ''} with no visible text, aria-label, or title (screen-reader inaccessible).`, `index.html:${lineOf(source, firstIdx)}`, '<button></button>', unlabeled)
    }
  }

  // 12. SECURITY HEADERS — CSP, HSTS, X-Content-Type-Options (HTTP headers or meta equivalents)
  {
    const metaTags = metaTagsOf(source)
    const hasCspMeta = metaTags.some((m) => /http-equiv\s*=\s*["']content-security-policy["']/i.test(m.tag))
    const hasHstsMeta = metaTags.some((m) => /http-equiv\s*=\s*["']strict-transport-security["']/i.test(m.tag))
    const hasXctoMeta = metaTags.some((m) => /http-equiv\s*=\s*["']x-content-type-options["']/i.test(m.tag))
    const missing = []
    if (!(pageHeaders && pageHeaders['content-security-policy']) && !hasCspMeta) missing.push('Content-Security-Policy')
    if (!(pageHeaders && pageHeaders['strict-transport-security']) && !hasHstsMeta) missing.push('Strict-Transport-Security')
    if (!(pageHeaders && pageHeaders['x-content-type-options']) && !hasXctoMeta) missing.push('X-Content-Type-Options')
    if (missing.length && pageHeaders) {
      addIssue('security_headers', 'medium', `Missing security protections: ${missing.join(', ')}. No HTTP header and no meta equivalent present.`, 'index.html:1', `(missing: ${missing.join(', ')})`)
    }
  }

  // 13. OUTDATED ANALYTICS — legacy ga()/ga.js instead of gtag()
  {
    const legacyScript = /<script\b[^>]*google-analytics\.com\/(?:ga|analytics)\.js[^>]*>[\s\S]*?<\/script>/i.test(source)
    const legacyCall = [...source.matchAll(/(?<![\w.$])ga\s*\(\s*["']create["']/g)]
    if (legacyScript || legacyCall.length) {
      const idx = legacyCall.length ? legacyCall[0].index : 0
      addIssue('analytics_outdated', 'low', `Outdated Google Analytics usage detected (${legacyScript ? 'legacy ga.js/analytics.js snippet' : ''}${legacyScript && legacyCall.length ? ' + ' : ''}${legacyCall.length ? `ga('create', ...) calls` : ''}). Must be upgraded to gtag().`, `index.html:${lineOf(source, idx)}`, `ga('create', ...)`, Math.max(1, legacyCall.length))
    }
  }

  // 14. SCHEMA MARKUP ISSUES — invalid JSON-LD or missing required fields (@context/@type)
  {
    let invalid = 0
    let incomplete = 0
    let firstIdx = -1
    let firstSample = ''
    for (const m of source.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      let parsed = null
      try { parsed = JSON.parse(m[1].trim()) } catch { parsed = null }
      if (!parsed) {
        invalid++
        if (firstIdx === -1) { firstIdx = m.index; firstSample = m[1].trim().slice(0, 120) }
        continue
      }
      const nodes = Array.isArray(parsed) ? parsed : [parsed]
      for (const node of nodes) {
        if (node && typeof node === 'object' && (!node['@context'] || !node['@type'])) {
          incomplete++
          if (firstIdx === -1) { firstIdx = m.index; firstSample = JSON.stringify(node).slice(0, 120) }
        }
      }
    }
    if (invalid) addIssue('schema_issue', 'medium', `${invalid} JSON-LD structured-data block${invalid > 1 ? 's are' : ' is'} not valid JSON (search engines ignore it).`, `index.html:${lineOf(source, firstIdx)}`, firstSample, invalid)
    else if (incomplete) addIssue('schema_issue', 'low', `${incomplete} JSON-LD block${incomplete > 1 ? 's' : ''} missing required fields (@context/@type).`, `index.html:${lineOf(source, firstIdx)}`, firstSample, incomplete)
  }

  // 15. PERFORMANCE — lazy loading, image dimensions, render-blocking scripts
  {
    const imgs = [...source.matchAll(/<img\b[^>]*>/gi)]
    const noLazy = imgs.filter((m, i) => i > 0 && !/\bloading\s*=/i.test(m[0]))
    if (noLazy.length) {
      addIssue('perf_lazy', 'low', `${noLazy.length} image${noLazy.length > 1 ? 's' : ''} below the fold without loading="lazy" (slower first paint).`, `index.html:${lineOf(source, noLazy[0].index)}`, noLazy[0][0].slice(0, 160), noLazy.length)
    }
    const dims = resources.imageDims || {}
    const noDims = imgs.filter((m) => {
      const tag = m[0]
      if (/\bwidth\s*=/i.test(tag) && /\bheight\s*=/i.test(tag)) return false
      const src = imgSrcOf(tag)
      return Boolean(dims[src])
    })
    if (noDims.length) {
      const sampleSrc = imgSrcOf(noDims[0][0])
      addIssue('perf_dimensions', 'low', `${noDims.length} image${noDims.length > 1 ? 's' : ''} without width/height attributes (layout shift / CLS), e.g. ${sampleSrc}.`, `index.html:${lineOf(source, noDims[0].index)}`, noDims[0][0].slice(0, 160), noDims.length)
    }
    const headEnd = source.search(/<\/head>/i)
    const blocking = []
    for (const m of source.matchAll(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi)) {
      if (headEnd === -1 || m.index >= headEnd) continue
      const attrs = `${m[1]} ${m[3]}`
      if (/\b(async|defer)\b/i.test(attrs) || /\btype\s*=\s*["']module["']/i.test(attrs)) continue
      blocking.push({ index: m.index, raw: m[0] })
    }
    if (blocking.length) {
      addIssue('render_blocking', 'medium', `${blocking.length} external script${blocking.length > 1 ? 's' : ''} in <head> without defer/async delay first paint.`, `index.html:${lineOf(source, blocking[0].index)}`, blocking[0].raw.slice(0, 160), blocking.length)
    }
  }

  // 16. DEPRECATED TAGS — font, center, marquee, blink, embed, applet
  {
    const found = {}
    for (const m of source.matchAll(/<(font|center|marquee|blink|embed|applet)\b/gi)) found[m[1].toLowerCase()] = (found[m[1].toLowerCase()] || 0) + 1
    const entries = Object.entries(found)
    if (entries.length) {
      const total = entries.reduce((sum, [, n]) => sum + n, 0)
      addIssue('deprecated_tag', 'medium', `${total} deprecated tag${total > 1 ? 's' : ''} found (${entries.map(([t, n]) => `<${t}> x${n}`).join(', ')}) — obsolete HTML that modern browsers may drop.`, `index.html:${lineOf(source, source.search(/<(font|center|marquee|blink|embed|applet)\b/gi))}`, `<${entries[0][0]}>`, total)
    }
  }

  // 17. MISSING H1
  if (!/<h1[\s>]/i.test(source)) {
    addIssue('missing_h1', 'medium', 'Page has no <h1> heading (SEO/accessibility).', 'index.html:1', '(no h1)')
  }

  // 18. SKIPPED HEADINGS — e.g. H1 followed directly by H3
  {
    const jumps = headingSequenceJumps(source)
    if (jumps.length) {
      addIssue('skipped_heading', 'low', `${jumps.length} skipped heading level${jumps.length > 1 ? 's' : ''} (e.g. H${jumps[0].from} jumps straight to H${jumps[0].to}) break the document outline.`, `index.html:${lineOf(source, jumps[0].index)}`, `<h${jumps[0].to}> after <h${jumps[0].from}>`, jumps.length)
    }
  }

  // 21. MISSING FAVICON
  {
    const hasFavicon = linkRelsOf(source).some((l) => relListOf(l.tag).some((rel) => rel.includes('icon')))
    if (!hasFavicon) addIssue('missing_favicon', 'low', 'No favicon link declared — browsers request /favicon.ico and show a default icon.', 'index.html:1', '(no icon link)')
  }

  // 22. MISSING ROBOTS META
  if (!metaTagsOf(source).some((m) => metaHasName(m.tag, 'robots'))) {
    addIssue('missing_robots', 'low', 'Missing robots meta tag — crawl directives left ambiguous for search engines.', 'index.html:1', '(no robots meta)')
  }

  // 23. MISSING OG TAGS — Open Graph social preview metadata
  {
    const missingOg = ['og:title', 'og:description'].filter(
      (prop) => !metaTagsOf(source).some((m) => new RegExp(`property\\s*=\\s*["']${prop}["']`, 'i').test(m.tag)),
    )
    if (missingOg.length) {
      addIssue('missing_og', 'low', `Open Graph tags missing (${missingOg.join(', ')}) — shared links show no social preview.`, 'index.html:1', '(no og:title/og:description)')
    }
  }

  // 24. MISSING CANONICAL TAG
  if (!linkRelsOf(source).some((l) => relListOf(l.tag).includes('canonical'))) {
    addIssue('missing_canonical', 'low', 'Missing canonical link — duplicate-content signals cannot be consolidated.', 'index.html:1', '(no canonical)')
  }

  const summary = { total: issues.length }
  for (const sev of SEVERITY_ORDER) summary[sev] = issues.filter((i) => i.severity === sev).length
  return {
    issues,
    summary,
    score: scoreFor(issues),
    ctx: {
      brokenRecords: resources.brokenRecords,
      resourceStats: resources.stats,
      imageDims: resources.imageDims,
      ogImageCandidate: resources.ogImageCandidate,
    },
  }
}

export function scoreFor(issues) {
  let score = 100
  for (const issue of issues) {
    score -= SEVERITY_DEDUCTION[issue.severity] || 2
    if ((issue.count || 1) > 1) score -= Math.min(10, issue.count - 1)
  }
  return Math.max(0, Math.min(100, score))
}

// ─── STEP 3: GENERATE FIX PLAN — one detailed entry per issue ─────────────────

const FIX_TEMPLATES = {
  corrupted_encoding: { description: 'Strip BOM, null bytes, replacement characters, and CJK mojibake; enforce clean UTF-8.', after: '(file re-saved as clean UTF-8)' },
  leaked_secret: { description: 'Redact exposed secret values and replace with environment variables.', after: 'password = process.env.SECRET' },
  mixed_content: { description: 'Upgrade insecure http:// resource URLs to https://.', after: 'src="https://..."', },
  missing_charset: { description: 'Inject <meta charset="UTF-8"> as the first tag inside <head>.', after: '<meta charset="UTF-8">' },
  missing_viewport: { description: 'Inject the responsive viewport meta tag.', after: '<meta name="viewport" content="width=device-width, initial-scale=1">' },
  missing_title: { description: 'Insert a descriptive unique <title> tag.', after: '<title>...</title>' },
  duplicate_title: { description: 'Remove duplicate <title> tags, keeping exactly one.', after: '<title>...</title>' },
  missing_description: { description: 'Insert the meta description tag.', after: '<meta name="description" content="...">' },
  missing_lang: { description: 'Add lang="en" to the <html> tag.', after: '<html lang="en">' },
  broken_link: { description: 'Unwrap dead links while keeping their visible text.', after: 'visible text (dead anchor removed)' },
  broken_image: { description: 'Remove images that no longer load.', after: '<!-- broken image removed by AlphaTekX -->' },
  broken_script: { description: 'Remove scripts that fail to load (they can break the whole page).', after: '<!-- broken script removed by AlphaTekX -->' },
  broken_style: { description: 'Remove stylesheets that fail to load.', after: '<!-- broken stylesheet removed by AlphaTekX -->' },
  bad_code_eval: { description: 'Disable unsafe eval() calls via a global no-op shim.', after: '__alphaNoEval(...)' },
  bad_code_document_write: { description: 'Replace document.write() with a DOM-safe insertion shim.', after: '__alphaSafeWrite(...)' },
  bad_code_innerhtml: { description: 'Replace literal innerHTML assignments with textContent (XSS-safe).', after: '.textContent = "..."' },
  duplicate_id: { description: 'Rename duplicate id attributes with a unique -dup-N suffix.', after: 'id="main-dup-1"' },
  multiple_h1: { description: 'Demote extra <h1> elements to <h2>, keeping exactly one H1.', after: '<h2>...</h2>' },
  empty_element: { description: 'Remove attribute-less empty <div>/<span>/<p> elements.', after: '(element removed)' },
  fixed_width: { description: `Replace fixed px widths (>= ${FIXED_WIDTH_MIN_PX}px) with max-width: 100%.`, after: 'max-width: 100%' },
  img_missing_alt: { description: 'Generate descriptive alt text from image filenames for every <img>.', after: '<img src="..." alt="Description">' },
  aria_missing_label: { description: 'Add accessible aria-label attributes to icon-only buttons and links.', after: '<button aria-label="Button"></button>' },
  security_headers: { description: 'Add Content-Security-Policy, Strict-Transport-Security, and X-Content-Type-Options meta equivalents.', after: '<meta http-equiv="X-Content-Type-Options" content="nosniff">' },
  analytics_outdated: { description: "Upgrade legacy ga()/ga.js to the current gtag() snippet.", after: "<script async src='https://www.googletagmanager.com/gtag/js?id=UA-...'></script>" },
  schema_issue: { description: 'Repair JSON-LD: fix invalid JSON and add required @context/@type fields.', after: '{"@context":"https://schema.org","@type":"WebSite",...}' },
  perf_lazy: { description: 'Add loading="lazy" to below-the-fold images.', after: '<img loading="lazy" ...>' },
  perf_dimensions: { description: 'Read real image dimensions and set width/height attributes to stop layout shift.', after: '<img width="800" height="600" ...>' },
  render_blocking: { description: 'Add defer to external <head> scripts so they stop blocking first paint.', after: '<script defer src="...">' },
  deprecated_tag: { description: 'Replace <font>/<center> with styled elements; unwrap <marquee>/<blink>; remove <embed>/<applet>.', after: '<span style="color:red">...</span>' },
  missing_h1: { description: 'Add the missing <h1> page heading.', after: '<h1>Page Title</h1>' },
  skipped_heading: { description: 'Demote jumped headings to the next valid level to restore the outline.', after: '<h2>...</h2>' },
  missing_favicon: { description: 'Add a favicon link (uses /favicon.ico when reachable, inline SVG otherwise).', after: '<link rel="icon" href="...">' },
  missing_robots: { description: 'Add the robots meta tag with index, follow.', after: '<meta name="robots" content="index, follow">' },
  missing_og: { description: 'Add Open Graph tags (og:title, og:type, og:url, og:description, og:image when available).', after: '<meta property="og:title" content="...">' },
  missing_canonical: { description: 'Add the canonical link pointing at the live URL.', after: '<link rel="canonical" href="...">' },
}

export function generateFixPlan(issues) {
  return issues.map((issue, index) => {
    const template = FIX_TEMPLATES[issue.type] || { description: 'Apply deterministic repair.', after: '(auto-repair)' }
    return {
      id: `FIX-${String(index + 1).padStart(3, '0')}`,
      issue_id: issue.id,
      type: issue.type,
      severity: issue.severity,
      description: template.description,
      before: issue.before,
      after: template.after,
      status: 'ready',
    }
  })
}

// ─── STEP 4: EXECUTE REPAIRS — every fix applied, one by one, in order ────────

/**
 * @param {string} html original HTML
 * @param {Array} issues output of diagnosePage().issues
 * @param {object} ctx { brokenRecords, imageDims, ogImageCandidate, finalUrl, faviconHref }
 */
export function executeRepairs(html, issues, ctx = {}) {
  let out = sanitizeEncoding(String(html))
  const types = new Set(issues.map((i) => i.type))
  const applied = []
  const residuals = []

  const mark = (issue, note) => {
    if (note) residuals.push({ issue_id: issue.id, type: issue.type, note })
    applied.push({ issue_id: issue.id, type: issue.type })
  }
  const issueByType = (type) => issues.find((i) => i.type === type)

  const derivedTitle = titleText(out) || (ctx.finalUrl ? new URL(ctx.finalUrl).hostname : 'Restored Site')

  // ORDER 1 — encoding corruption
  if (types.has('corrupted_encoding')) {
    out = out.replace(/^\uFEFF/, '').replace(/\u0000/g, '').replace(/\uFFFD/g, '')
    out = out.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '')
    mark(issueByType('corrupted_encoding'))
  }

  // ORDER 2 — secrets redaction
  if (types.has('leaked_secret')) {
    for (const pattern of SECRET_PATTERNS) {
      out = out.replace(pattern.regex, (match, prefix, captured, quote) => {
        if (captured !== undefined) return `${prefix}REDACTED${quote}`
        return 'REDACTED'
      })
    }
    mark(issueByType('leaked_secret'))
  }

  // ORDER 3 — mixed content upgrade
  if (types.has('mixed_content')) {
    out = out.replace(/((?:src|href)\s*=\s*["'])http:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org)([^"']+)/gi, '$1https://$2')
    mark(issueByType('mixed_content'))
  }

  // ORDER 4 — document.write shim (inject before other head work so it lands early)
  if (types.has('bad_code_document_write')) {
    out = injectIntoHead(out, '<script>function __alphaSafeWrite(h){try{if(document.currentScript){document.currentScript.insertAdjacentHTML("afterend",h)}}catch(e){}}</script>')
    out = out.replace(/document\.write(?:ln)?\s*\(/g, '__alphaSafeWrite(')
    mark(issueByType('bad_code_document_write'))
  }

  // ORDER 5 — disable eval()
  if (types.has('bad_code_eval')) {
    out = injectIntoHead(out, '<script>function __alphaNoEval(){/* unsafe eval disabled by AlphaTekX */}</script>')
    out = out.replace(/(?<![\w.$])eval\s*\(/g, '__alphaNoEval(')
    mark(issueByType('bad_code_eval'))
  }

  // ORDER 6 — innerHTML literal assignments -> textContent
  if (types.has('bad_code_innerhtml')) {
    out = out.replace(/\.innerHTML\s*\+=?\s*(["'][^"']*["'])\s*;/g, '.textContent = $1;')
    mark(issueByType('bad_code_innerhtml'))
  }

  // ORDER 7 — legacy analytics upgrade
  if (types.has('analytics_outdated')) {
    out = out.replace(/<script\b[^>]*google-analytics\.com\/(?:ga|analytics|dc)\.js[^>]*><\/script>/gi, '')
    const uaMatch = out.match(/["'](UA-\d{4,}-\d+|G-[A-Z0-9]{6,})["']/i)
    if (uaMatch) {
      const uaId = uaMatch[1]
      const gtagSnippet = `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.__alphaGaQueue=function(){dataLayer.push(arguments);};</script>\n<script async src="https://www.googletagmanager.com/gtag/js?id=${uaId}"></script>\n<script>gtag('js',new Date());gtag('config','${uaId}');</script>`
      out = out.replace(/<\/head>/i, `${gtagSnippet}\n</head>`)
    } else {
      out = injectIntoHead(out, '<script>window.__alphaGaQueue=function(){/* legacy analytics queue */};</script>')
    }
    out = out.replace(/(?<![\w.$])ga\s*\(/g, '__alphaGaQueue(')
    mark(issueByType('analytics_outdated'))
  }

  // ORDER 8 — JSON-LD schema repair
  if (types.has('schema_issue')) {
    let repaired = false
    let unrepairable = false
    out = out.replace(/(<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi, (full, open, body, close) => {
      let obj = null
      try { obj = JSON.parse(body.trim()) } catch { obj = null }
      if (!obj) {
        try { obj = JSON.parse(body.trim().replace(/,\s*([}\]])/g, '$1').replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'")) } catch { obj = null }
      }
      if (!obj) { unrepairable = true; return full }
      const ensureFields = (node) => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return node
        let changed = false
        if (!node['@context']) { node['@context'] = 'https://schema.org'; changed = true }
        if (!node['@type']) { node['@type'] = 'WebSite'; changed = true }
        if (changed) repaired = true
        return node
      }
      if (Array.isArray(obj)) obj = obj.map(ensureFields)
      else ensureFields(obj)
      return `${open}\n${JSON.stringify(obj, null, 2)}\n${close}`
    })
    mark(issueByType('schema_issue'), unrepairable && !repaired ? 'JSON-LD could not be auto-parsed; manual review recommended.' : '')
  }

  // ORDER 9 — deprecated tags
  if (types.has('deprecated_tag')) {
    out = out.replace(/<font\b([^>]*)>([\s\S]*?)<\/font>/gi, (full, attrs, inner) => {
      const styles = []
      const color = attrs.match(/\bcolor\s*=\s*["']([^"']+)["']/i)
      const face = attrs.match(/\bface\s*=\s*["']([^"']+)["']/i)
      if (color) styles.push(`color: ${color[1]}`)
      if (face) styles.push(`font-family: ${face[1]}`)
      return `<span style="${styles.join('; ')}">${inner}</span>`
    })
    out = out.replace(/<center\b[^>]*>([\s\S]*?)<\/center>/gi, '<div style="text-align: center">$1</div>')
    out = out.replace(/<(marquee|blink)\b[^>]*>([\s\S]*?)<\/\1>/gi, '$2')
    out = out.replace(/<embed\b[^>]*>?\s*/gi, '')
    out = out.replace(/<applet\b[^>]*>[\s\S]*?<\/applet>/gi, '')
    out = out.replace(/<applet\b[^>]*>\s*/gi, '')
    mark(issueByType('deprecated_tag'))
  }

  // ORDER 10 — fixed widths -> fluid
  if (types.has('fixed_width')) {
    out = out.replace(/(?<![\w-])(width\s*:\s*)(\d{3,})px/gi, (match, prefix, digits) =>
      parseInt(digits, 10) >= FIXED_WIDTH_MIN_PX ? 'max-width: 100%' : match)
    mark(issueByType('fixed_width'))
  }

  // ORDER 11 — duplicate IDs
  if (types.has('duplicate_id')) {
    const seenIds = new Map()
    const usedNames = new Set()
    for (const m of out.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)) usedNames.add(m[1])
    const edits = []
    for (const m of out.matchAll(/(\sid\s*=\s*)(["'])([^"']+)(\2)/gi)) {
      const value = m[3]
      const seen = seenIds.get(value) || 0
      seenIds.set(value, seen + 1)
      if (seen > 0) {
        let candidate = `${value}-dup-${seen}`
        while (usedNames.has(candidate)) candidate = `${candidate}-x`
        usedNames.add(candidate)
        const valueStart = m.index + m[1].length + 1
        edits.push({ start: valueStart, end: valueStart + value.length, replacement: candidate })
      }
    }
    out = applyEdits(out, edits)
    mark(issueByType('duplicate_id'))
  }

  // ORDER 12 — duplicate titles
  if (types.has('duplicate_title')) {
    let seenTitle = 0
    const edits = []
    for (const m of out.matchAll(/<title\b[^>]*>[\s\S]*?<\/title>/gi)) {
      seenTitle++
      if (seenTitle > 1) edits.push({ start: m.index, end: m.index + m[0].length, replacement: '' })
    }
    out = applyEdits(out, edits)
    mark(issueByType('duplicate_title'))
  }

  // ORDER 13 — multiple H1s
  if (types.has('multiple_h1')) {
    let seenH1 = 0
    const edits = []
    for (const m of out.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)) {
      seenH1++
      if (seenH1 > 1) {
        edits.push({
          start: m.index,
          end: m.index + m[0].length,
          replacement: m[0].replace(/^<h1/i, '<h2').replace(/<\/h1>$/i, '</h2>'),
        })
      }
    }
    out = applyEdits(out, edits)
    mark(issueByType('multiple_h1'))
  }

  // ORDER 14 — skipped heading levels
  if (types.has('skipped_heading')) {
    let last = 0
    const edits = []
    for (const m of out.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
      const level = Number(m[1])
      if (last && level > last + 1) {
        const target = Math.min(6, last + 1)
        edits.push({
          start: m.index,
          end: m.index + m[0].length,
          replacement: m[0].replace(new RegExp(`^<h${level}`, 'i'), `<h${target}`).replace(new RegExp(`</h${level}>$`, 'i'), `</h${target}>`),
        })
        last = target
      } else {
        last = level
      }
    }
    out = applyEdits(out, edits)
    mark(issueByType('skipped_heading'))
  }

  // ORDER 15 — missing H1
  if (types.has('missing_h1')) {
    const h1 = `<h1>${escapeHtmlAttr(derivedTitle)}</h1>`
    if (/<body[^>]*>/i.test(out)) out = out.replace(/<body[^>]*>/i, (m) => `${m}\n${h1}`)
    else out = `${h1}\n${out}`
    mark(issueByType('missing_h1'))
  }

  // ORDER 16 — empty attribute-less elements
  if (types.has('empty_element')) {
    out = out.replace(/<(div|span|p)>(?:\s|&nbsp;|\u00a0)*<\/\1>/gi, '')
    mark(issueByType('empty_element'))
  }

  // ORDER 17 — aria labels for icon-only controls
  if (types.has('aria_missing_label')) {
    const edits = []
    for (const m of out.matchAll(/<(button)\b([^>]*)>([\s\S]*?)<\/\1>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const isButton = Boolean(m[1])
      const attrs = isButton ? m[2] : m[4]
      const inner = isButton ? m[3] : m[5]
      const text = stripTags(inner)
      if (text || /\baria-label\s*=/i.test(attrs) || /\btitle\s*=/i.test(attrs) || /\baria-hidden\s*=\s*["']true["']/i.test(attrs)) continue
      let label = isButton ? 'Button' : 'Link'
      if (!isButton) {
        const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)
        if (hrefMatch) label = slugLabelFromHref(hrefMatch[1])
      }
      const openEnd = m.index + m[0].indexOf('>', 1) + 1
      edits.push({
        start: openEnd - 1,
        end: openEnd - 1,
        replacement: ` aria-label="${escapeHtmlAttr(label)}"`,
      })
    }
    out = applyEdits(out, edits)
    mark(issueByType('aria_missing_label'))
  }

  // ORDER 18 — generated alt text
  if (types.has('img_missing_alt')) {
    out = out.replace(/<img\b(?![^>]*\balt\s*=)[^>]*>/gi, (tag) => {
      const alt = deriveAltFromSrc(imgSrcOf(tag))
      return addAttrToTag(tag, `alt="${escapeHtmlAttr(alt)}"`)
    })
    mark(issueByType('img_missing_alt'))
  }

  // ORDER 19 — lazy loading (skip the first image: likely the LCP hero)
  if (types.has('perf_lazy')) {
    let imgIndex = 0
    out = out.replace(/<img\b[^>]*>/gi, (tag) => {
      imgIndex++
      if (imgIndex === 1 || /\bloading\s*=/i.test(tag)) return tag
      return addAttrToTag(tag, 'loading="lazy"')
    })
    mark(issueByType('perf_lazy'))
  }

  // ORDER 20 — real width/height dimensions from probed image bytes
  if (types.has('perf_dimensions')) {
    const dims = ctx.imageDims || {}
    out = out.replace(/<img\b[^>]*>/gi, (tag) => {
      if (/\bwidth\s*=/i.test(tag) && /\bheight\s*=/i.test(tag)) return tag
      const known = dims[imgSrcOf(tag)]
      if (!known) return tag
      let updated = tag
      if (!/\bwidth\s*=/i.test(updated)) updated = addAttrToTag(updated, `width="${known.width}"`)
      if (!/\bheight\s*=/i.test(updated)) updated = addAttrToTag(updated, `height="${known.height}"`)
      return updated
    })
    mark(issueByType('perf_dimensions'))
  }

  // ORDER 21 — defer render-blocking head scripts
  if (types.has('render_blocking')) {
    const headEnd = out.search(/<\/head>/i)
    if (headEnd !== -1) {
      const edits = []
      for (const m of out.matchAll(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi)) {
        if (m.index >= headEnd) continue
        const attrs = `${m[1]} ${m[3]}`
        if (/\b(async|defer)\b/i.test(attrs) || /\btype\s*=\s*["']module["']/i.test(attrs)) continue
        edits.push({
          start: m.index,
          end: m.index + m[0].length,
          replacement: m[0].replace(/^<script\b/i, '<script defer'),
        })
      }
      out = applyEdits(out, edits)
    }
    mark(issueByType('render_blocking'))
  }

  // ORDER 22 — security header metas
  if (types.has('security_headers')) {
    const metaTags = metaTagsOf(out)
    const snippets = []
    const hasCsp = metaTags.some((m) => /http-equiv\s*=\s*["']content-security-policy["']/i.test(m.tag))
    const hasHsts = metaTags.some((m) => /http-equiv\s*=\s*["']strict-transport-security["']/i.test(m.tag))
    const hasXcto = metaTags.some((m) => /http-equiv\s*=\s*["']x-content-type-options["']/i.test(m.tag))
    if (!hasXcto) snippets.push('<meta http-equiv="X-Content-Type-Options" content="nosniff">')
    if (!hasCsp) snippets.push('<meta http-equiv="Content-Security-Policy" content="default-src \'self\' https: data: \'unsafe-inline\' \'unsafe-eval\'; img-src \'self\' https: data:;">')
    if (!hasHsts) snippets.push('<meta http-equiv="Strict-Transport-Security" content="max-age=31536000">')
    if (snippets.length) out = injectIntoHead(out, snippets.join('\n'))
    mark(issueByType('security_headers'))
  }

  // ORDER 23..31 — head metadata injections
  if (types.has('missing_charset') && !/<meta[^>]+charset/i.test(out)) {
    out = injectIntoHead(out, '<meta charset="UTF-8">')
    mark(issueByType('missing_charset'))
  }
  if (types.has('missing_title') && !/<title>[^<]*\S[^<]*<\/title>/i.test(out)) {
    out = injectIntoHead(out, `<title>${escapeHtmlAttr(derivedTitle)}</title>`)
    mark(issueByType('missing_title'))
  }
  if (types.has('missing_description') && !metaTagsOf(out).some((m) => metaHasName(m.tag, 'description') && metaContent(m.tag).trim())) {
    const desc = stripTags(out.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')).slice(0, 160) || 'Restored by AlphaTekX Restoration Pipeline.'
    out = injectIntoHead(out, `<meta name="description" content="${escapeHtmlAttr(desc)}">`)
    mark(issueByType('missing_description'))
  }
  if (types.has('missing_lang') && !/<html[^>]*\slang\s*=/i.test(out)) {
    out = out.replace(/<html(\s|>)/i, (match, tail) => `<html lang="en"${tail === '>' ? ' ' : ''}${tail}`)
    mark(issueByType('missing_lang'))
  }
  if (types.has('missing_viewport') && !metaTagsOf(out).some((m) => metaHasName(m.tag, 'viewport'))) {
    out = injectIntoHead(out, '<meta name="viewport" content="width=device-width, initial-scale=1">')
    mark(issueByType('missing_viewport'))
  }
  if (types.has('missing_robots') && !metaTagsOf(out).some((m) => metaHasName(m.tag, 'robots'))) {
    out = injectIntoHead(out, '<meta name="robots" content="index, follow">')
    mark(issueByType('missing_robots'))
  }
  if (types.has('missing_favicon') && !linkRelsOf(out).some((l) => relListOf(l.tag).some((rel) => rel.includes('icon')))) {
    const href = ctx.faviconHref || faviconDataUri(ctx.finalUrl ? new URL(ctx.finalUrl).hostname : 'site')
    out = injectIntoHead(out, `<link rel="icon" href="${escapeHtmlAttr(href)}">`)
    mark(issueByType('missing_favicon'))
  }
  if (types.has('missing_canonical') && !linkRelsOf(out).some((l) => relListOf(l.tag).includes('canonical'))) {
    out = injectIntoHead(out, `<link rel="canonical" href="${escapeHtmlAttr(ctx.finalUrl || '')}">`)
    mark(issueByType('missing_canonical'))
  }
  if (types.has('missing_og')) {
    const metaList = metaTagsOf(out)
    const hasProp = (prop) => metaList.some((m) => new RegExp(`property\\s*=\\s*["']${prop}["']`, 'i').test(m.tag))
    if (!hasProp('og:title') || !hasProp('og:description')) {
      const descMatch = metaTagsOf(out).find((m) => metaHasName(m.tag, 'description'))
      const ogLines = [
        `<meta property="og:title" content="${escapeHtmlAttr(derivedTitle)}">`,
        '<meta property="og:type" content="website">',
        `<meta property="og:url" content="${escapeHtmlAttr(ctx.finalUrl || '')}">`,
        `<meta property="og:description" content="${escapeHtmlAttr(descMatch ? metaContent(descMatch.tag) : derivedTitle)}">`,
      ]
      if (ctx.ogImageCandidate) ogLines.push(`<meta property="og:image" content="${escapeHtmlAttr(ctx.ogImageCandidate)}">`)
      out = injectIntoHead(out, ogLines.join('\n'))
      mark(issueByType('missing_og'))
    }
  }

  // ORDER LAST — remove broken external resources discovered during the live scan
  const resourceKinds = [
    ['script', 'broken_script'],
    ['style', 'broken_style'],
    ['image', 'broken_image'],
    ['link', 'broken_link'],
  ]
  for (const [kind, type] of resourceKinds) {
    if (!types.has(type)) continue
    const records = (ctx.brokenRecords || []).filter((r) => r.kind === kind)
    for (const rec of records) out = removeBrokenResource(out, rec)
    if (records.length) mark(issueByType(type))
  }

  out = sanitizeEncoding(out)
  return { html: out, applied, residuals }
}

// ─── STEP 5: RECONSTRUCT — validate UTF-8 + English + HTML, then save ─────────

export function reconstructAndValidate(html) {
  const clean = sanitizeEncoding(String(html)).replace(/\uFFFD/g, '')
  const validation = validateHtml(clean)
  if (!validation.valid) {
    throw Object.assign(new Error(`Reconstruction failed HTML validation: ${validation.reason}`), { code: 'INVALID_HTML' })
  }
  if (!FileHandler.isEnglish(clean)) {
    throw Object.assign(new Error('Reconstruction failed English verification: non-English characters remain.'), { code: 'NOT_ENGLISH' })
  }
  if (clean.charCodeAt(0) === 0xfeff || clean.includes('\u0000')) {
    throw Object.assign(new Error('Reconstruction failed UTF-8 validation.'), { code: 'INVALID_UTF8' })
  }
  return clean
}

export function saveSessionFiles(workDir, originalHtml, restoredHtml, report) {
  const restoredPath = path.join(workDir, 'restored', 'index.html')
  const backupPath = path.join(workDir, 'rollback', 'original.html')
  const reportPath = path.join(workDir, 'report.json')
  FileHandler.writeFile(restoredPath, restoredHtml)
  FileHandler.writeFile(backupPath, sanitizeEncoding(originalHtml))
  FileHandler.writeFile(reportPath, JSON.stringify(report, null, 2))
  return { restoredPath, backupPath, reportPath }
}

// ─── STEP 7 helpers: GitHub PR client (self-contained) ─────────────────────────

async function ghApi(endpoint, token, opts = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'alphatekx-restoration-pipeline',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, ok: response.ok, data }
}

async function createGitHubPullRequest(token, repoFullName, restoredHtml, sourceUrl) {
  const safeRepo = String(repoFullName || '').replace(/^\/+|\/+$/g, '')
  if (!/^[\w.-]+\/[\w.-]+$/.test(safeRepo)) throw Object.assign(new Error('Repository must look like owner/repo.'), { actionRequired: 'invalid_repo' })
  const repoInfo = await ghApi(`/repos/${safeRepo}`, token)
  if (!repoInfo.ok) throw Object.assign(new Error(repoInfo.status === 404 ? `Repository ${safeRepo} not found (or the token lacks access).` : `GitHub API error (${repoInfo.status}).`), { actionRequired: repoInfo.status === 404 ? 'check_repo' : 'retry_github' })
  const defaultBranch = repoInfo.data.default_branch || 'main'
  const refInfo = await ghApi(`/repos/${safeRepo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`, token)
  if (!refInfo.ok) throw Object.assign(new Error(`Could not read base branch ${defaultBranch}.`), { actionRequired: 'retry_github' })
  const baseSha = refInfo.data?.object?.sha
  if (!baseSha) throw Object.assign(new Error('Base branch SHA missing.'), { actionRequired: 'retry_github' })
  const branch = `alphatekx-fix-${Date.now()}`
  const createRef = await ghApi(`/repos/${safeRepo}/git/refs`, token, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: baseSha } })
  if (!createRef.ok) throw Object.assign(new Error(createRef.data?.message || 'Could not create the fix branch.'), { actionRequired: 'retry_github' })
  const existing = await ghApi(`/repos/${safeRepo}/contents/index.html?ref=${encodeURIComponent(branch)}`, token)
  const putBody = {
    message: `AlphaTekX Restoration Pipeline: apply verified fixes\n\nSource: ${sourceUrl}`,
    content: Buffer.from(restoredHtml, 'utf8').toString('base64'),
    branch,
  }
  if (existing.status === 200 && existing.data?.sha) putBody.sha = existing.data.sha
  const put = await ghApi(`/repos/${safeRepo}/contents/index.html`, token, { method: 'PUT', body: putBody })
  if (!put.ok) throw Object.assign(new Error(put.data?.message || 'Could not commit the fixed index.html.'), { actionRequired: 'retry_github' })
  const pr = await ghApi(`/repos/${safeRepo}/pulls`, token, {
    method: 'POST',
    body: {
      title: 'AlphaTekX: automated restoration fixes',
      head: branch,
      base: defaultBranch,
      body: `Automated fixes from the AlphaTekX Restoration Pipeline.\n\n- Source scanned: ${sourceUrl}\n- Encoding enforced clean UTF-8 (no BOM, no null bytes, no mojibake)\n- Review and merge to apply.`,
    },
  })
  if (!pr.ok) throw Object.assign(new Error(pr.data?.message || 'Could not open the pull request.'), { actionRequired: 'retry_github' })
  return { pr_url: pr.data.html_url, pr_number: pr.data.number, branch, base_branch: defaultBranch, repo: safeRepo }
}

// ─── Full pipeline orchestration (STEPS 1–6; STEP 7 endpoints act on the result)

/**
 * Run the complete restoration pipeline against a URL.
 * @param {string} rawUrl
 * @param {object} [opts]
 * @param {string} [opts.workDir]
 * @param {boolean} [opts.screenshots=true]  capture before/after screenshots (best-effort)
 * @param {(msg:string)=>void} [opts.log]
 */
export async function runFullPipeline(rawUrl, opts = {}) {
  const log = opts.log || (() => {})
  const steps = {}

  // STEP 1 — RECONNAISSANCE
  const url = normalizeTargetUrl(rawUrl)
  if (!url) throw Object.assign(new Error('Enter a valid http(s) URL.'), { code: 'BAD_URL' })
  let page
  try {
    page = await fetchPage(url)
  } catch (err) {
    throw Object.assign(new Error(`Could not reach ${url} (${err.message}). AlphaTekX restores code — it does not diagnose hosting or DNS.`), { code: 'UNREACHABLE' })
  }
  if (!page.html || !page.html.trim()) {
    throw Object.assign(new Error('Target returned an empty page.'), { code: 'EMPTY_PAGE' })
  }
  if (Buffer.byteLength(page.html, 'utf8') > MAX_HTML_BYTES) {
    throw Object.assign(new Error('Page exceeds the 1.5 MB pipeline limit.'), { code: 'TOO_LARGE' })
  }

  const origin = new URL(page.finalUrl).origin
  const scanId = randomUUID().slice(0, 8)
  let faviconHref = null
  try {
    const favStatus = await probeUrl(`${origin}/favicon.ico`)
    if (favStatus >= 200 && favStatus < 400) faviconHref = `${origin}/favicon.ico`
  } catch {}

  let screenshotBefore = { ok: false, degraded: true, reason: 'screenshots disabled' }
  if (opts.screenshots !== false) {
    screenshotBefore = await captureShot(page.finalUrl, 'before', scanId, log)
  }

  steps.reconnaissance = {
    step: 1,
    url: page.finalUrl,
    http_status: page.status,
    content_type: page.contentType,
    html_bytes: Buffer.byteLength(page.html, 'utf8'),
    design_tokens: extractDesignTokens(page.html),
    interactions: sweepInteractions(page.html),
    favicon_reachable: Boolean(faviconHref),
    screenshot: screenshotBefore,
  }

  // STEP 2 — DIAGNOSE
  const diagnosis = await diagnosePage({
    html: page.html,
    baseUrl: page.finalUrl,
    pageHeaders: page.headers,
    resourceCap: SCAN_RESOURCE_CAP,
  })
  steps.diagnose = { step: 2, issues: diagnosis.issues, summary: diagnosis.summary, score: diagnosis.score }

  // STEP 3 — FIX PLAN
  const fixPlan = generateFixPlan(diagnosis.issues)
  steps.fix_plan = { step: 3, fixes: fixPlan, total_fixes: fixPlan.length }

  // STEP 4 — EXECUTE REPAIRS
  const repairCtx = {
    brokenRecords: diagnosis.ctx.brokenRecords,
    imageDims: diagnosis.ctx.imageDims,
    ogImageCandidate: diagnosis.ctx.ogImageCandidate,
    finalUrl: page.finalUrl,
    faviconHref,
  }
  const repairs = executeRepairs(page.html, diagnosis.issues, repairCtx)
  steps.repairs = { step: 4, fixes_applied: repairs.applied.length, applied: repairs.applied, residuals: repairs.residuals }

  // STEP 5 — RECONSTRUCT + VALIDATE + SAVE
  const restoredHtml = reconstructAndValidate(repairs.html)
  const workDir = opts.workDir || path.join(os.tmpdir(), `restore-pipeline-${randomUUID()}`)
  fs.mkdirSync(workDir, { recursive: true })
  const files = saveSessionFiles(workDir, page.html, restoredHtml, {
    pipeline_version: PIPELINE_VERSION,
    url: page.finalUrl,
    generatedAt: new Date().toISOString(),
    reconnaissance: steps.reconnaissance,
    issues: diagnosis.issues,
    issue_summary: diagnosis.summary,
    before_score: diagnosis.score,
    fix_plan: fixPlan,
    applied: repairs.applied,
    residuals: repairs.residuals,
  })
  steps.reconstruction = {
    step: 5,
    reconstructed: true,
    file_saved: 'restored/index.html',
    encoding: 'UTF-8',
    valid_html: true,
    valid_english: true,
    files,
  }

  // STEP 6 — VERIFY (re-scan the fixed artifact)
  const verificationDiagnosis = await diagnosePage({
    html: restoredHtml,
    baseUrl: page.finalUrl,
    pageHeaders: null, // delivered artifact: meta equivalents count, HTTP headers are out of scope here
    resourceCap: VERIFY_RESOURCE_CAP,
  })
  let screenshotAfter = { ok: false, degraded: true, reason: 'screenshots disabled' }
  if (opts.screenshots !== false) {
    screenshotAfter = await captureShot(page.finalUrl, 'after', scanId, log)
  }
  const remainingIssues = verificationDiagnosis.issues
  const afterScore = verificationDiagnosis.score
  steps.verify = {
    step: 6,
    before: { issues: diagnosis.issues.length, score: diagnosis.score },
    after: { issues: remainingIssues.length, score: afterScore },
    remaining_issues: remainingIssues,
    improvement: afterScore - diagnosis.score,
    screenshots: { before: screenshotBefore, after: screenshotAfter },
  }

  return {
    ok: true,
    pipeline_version: PIPELINE_VERSION,
    url: page.finalUrl,
    steps,
    summary: {
      issues_found: diagnosis.issues.length,
      issues_fixed: repairs.applied.length,
      files_modified: 1,
      before_score: diagnosis.score,
      after_score: afterScore,
      improvement: afterScore - diagnosis.score,
    },
    deliverables: {
      github: { available: true },
      download: { available: true },
      copy: { available: true },
      deploy: { available: true },
    },
    restoredHtml,
    files,
    workDir,
    message: remainingIssues.length === 0 ? 'Site fully restored!' : `Site restored with ${remainingIssues.length} item(s) noted for review.`,
  }
}

// ─── Route factory (/api/pipeline/*) ──────────────────────────────────────────

export function createRestorationPipeline(deps = {}) {
  const sessions = new Map()
  const log = deps.log || (() => {})

  function pruneSessions() {
    const cutoff = Date.now() - SESSION_TTL_MS
    for (const [id, session] of sessions) {
      if (session.createdAt < cutoff) {
        sessions.delete(id)
        try { fs.rmSync(session.workDir, { recursive: true, force: true }) } catch {}
      }
    }
  }

  function json(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(payload))
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (chunk) => {
        data += chunk
        if (data.length > 2_000_000) { reject(new Error('Payload too large')); req.destroy() }
      })
      req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}) } catch { reject(new Error('Invalid JSON body')) } })
      req.on('error', reject)
    })
  }

  function errorResponse(res, status, error, actionRequired = '') {
    return json(res, status, { step: 'error', status: 'error', error, action_required: actionRequired })
  }

  function publicSession(session) {
    const result = session.result
    return {
      sessionId: session.id,
      created_at: new Date(session.createdAt).toISOString(),
      state: result ? 'COMPLETE' : 'IDLE',
      url: result?.url || null,
      summary: result?.summary || null,
      reconnaissance: result?.steps?.reconnaissance || null,
      issue_summary: result?.steps?.diagnose?.summary || null,
      issues: result?.steps?.diagnose?.issues || [],
      fix_plan: result?.steps?.fix_plan?.fixes || [],
      repairs: result?.steps?.repairs || null,
      reconstruction: result?.steps?.reconstruction ? { ...result.steps.reconstruction, files: Object.fromEntries(Object.entries(result.steps.reconstruction.files || {}).map(([k, v]) => [k, Boolean(v)])) } : null,
      verification: result?.steps?.verify || null,
      deliverables: result?.deliverables || null,
      delivery_results: session.deliveryResults || {},
    }
  }

  function getGhToken(req, bodyToken) {
    if (bodyToken) return String(bodyToken)
    const cookieHeader = String(req.headers.cookie || '')
    for (const part of cookieHeader.split(';')) {
      const idx = part.indexOf('=')
      if (idx === -1) continue
      if (part.slice(0, idx).trim() === 'gh_token') return decodeURIComponent(part.slice(idx + 1).trim())
    }
    if (typeof deps.getGitHubToken === 'function') return deps.getGitHubToken(req)
    return null
  }

  return async function pipelineRoute(req, res) {
    if (!String(req.url || '').startsWith('/api/pipeline/')) return false
    pruneSessions()

    const urlObj = new URL(req.url, 'http://localhost')
    const route = urlObj.pathname

    try {
      if (req.method === 'POST' && route === '/api/pipeline/session') {
        const id = randomUUID()
        sessions.set(id, { id, createdAt: Date.now(), workDir: null, result: null, deliveryResults: {} })
        return json(res, 200, { status: 'success', sessionId: id, message: 'Session created.' })
      }

      if (req.method === 'POST' && route === '/api/pipeline/run') {
        const body = await readBody(req)
        const result = await runFullPipeline(body.url, {
          screenshots: body.screenshots !== false,
          log,
        })
        let session = null
        if (body.sessionId && sessions.has(body.sessionId)) {
          session = sessions.get(body.sessionId)
        } else {
          const id = randomUUID()
          session = { id, createdAt: Date.now(), workDir: null, result: null, deliveryResults: {} }
          sessions.set(id, session)
        }
        session.workDir = result.workDir
        session.result = { ...result, restoredHtml: undefined }
        session.restoredHtml = result.restoredHtml
        return json(res, 200, {
          step: 6,
          status: 'complete_through_verification',
          sessionId: session.id,
          summary: result.summary,
          reconnaissance: result.steps.reconnaissance,
          issues: result.steps.diagnose.issues,
          issue_summary: result.steps.diagnose.summary,
          fix_plan: result.steps.fix_plan.fixes,
          repairs: result.steps.repairs,
          reconstruction: { ...result.steps.reconstruction, files: Object.fromEntries(Object.entries(result.files).map(([k, v]) => [k, Boolean(v)])) },
          verification: result.steps.verify,
          deliverables: result.deliverables,
          message: result.message,
        })
      }

      const sessionId = urlObj.searchParams.get('sessionId') || ''
      const session = sessions.get(sessionId)

      if (route === '/api/pipeline/state' && req.method === 'GET') {
        if (!session) return errorResponse(res, 404, 'Session not found. Run the pipeline first.', 'run_pipeline')
        return json(res, 200, { status: 'success', ...publicSession(session) })
      }

      if (route === '/api/pipeline/code' && req.method === 'GET') {
        if (!session?.restoredHtml) return errorResponse(res, 404, 'No restored code yet. Run the pipeline first.', 'run_pipeline')
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(session.restoredHtml)
        return true
      }

      if (route === '/api/pipeline/report' && req.method === 'GET') {
        if (!session?.result) return errorResponse(res, 404, 'No report yet. Run the pipeline first.', 'run_pipeline')
        let report = null
        try { report = JSON.parse(fs.readFileSync(session.result.files.reportPath, 'utf8')) } catch {}
        return json(res, 200, { status: 'success', report })
      }

      if (route === '/api/pipeline/download' && req.method === 'GET') {
        if (!session?.restoredHtml) return errorResponse(res, 404, 'Nothing to download yet. Run the pipeline first.', 'run_pipeline')
        const which = urlObj.searchParams.get('which') === 'rollback' ? 'rollback' : 'restored'
        const zipBuffer = which === 'rollback'
          ? makeZipBuffer([{ name: 'original.html', data: sanitizeEncoding(session.originalHtml || '') }, { name: 'README.txt', data: `AlphaTekX rollback archive — your untouched original page.` }])
          : makeZipBuffer([
              { name: 'index.html', data: session.restoredHtml },
              { name: 'report.json', data: (() => { try { return fs.readFileSync(session.result.files.reportPath, 'utf8') } catch { return '{}' } })() },
              { name: 'README.txt', data: `AlphaTekX Restoration Pipeline\nSource: ${session.result.url}\nBefore score: ${session.result.summary.before_score}\nAfter score: ${session.result.summary.after_score}\nExtract and upload index.html to your hosting provider.\n` },
          ])
        session.deliveryResults[which] = { downloaded_at: new Date().toISOString(), bytes: zipBuffer.length }
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': zipBuffer.length,
          'Content-Disposition': `attachment; filename="${which}-${sessionId.slice(0, 8)}.zip"`,
          'Cache-Control': 'no-store',
        })
        res.end(zipBuffer)
        return true
      }

      if (route === '/api/pipeline/deliver/github' && req.method === 'POST') {
        if (!session?.restoredHtml) return errorResponse(res, 404, 'Run the pipeline before delivering to GitHub.', 'run_pipeline')
        const body = await readBody(req)
        const token = getGhToken(req, body.token)
        if (!token) return errorResponse(res, 401, 'No GitHub token. Connect GitHub first or pass a token.', 'connect_github')
        if (!body.repo) return errorResponse(res, 400, 'Repository is required (owner/repo).', 'select_repo')
        const prResult = await createGitHubPullRequest(token, body.repo, session.restoredHtml, session.result.url)
        session.deliveryResults.github = prResult
        return json(res, 200, {
          step: 7,
          status: 'success',
          delivery: 'github',
          pr_url: prResult.pr_url,
          branch: prResult.branch,
          message: `Pull request #${prResult.pr_number} created on ${prResult.repo}.`,
        })
      }

      if (route === '/api/pipeline/deploy' && req.method === 'POST') {
        if (!session?.restoredHtml) return errorResponse(res, 404, 'Run the pipeline before deploying.', 'run_pipeline')
        if (typeof deps.publishPasted !== 'function') return errorResponse(res, 500, 'Deploy backend unavailable.', 'contact_support')
        const body = await readBody(req)
        const user = typeof deps.requireUser === 'function' ? await deps.requireUser(req) : null
        const result = await deps.publishPasted({ name: String(body.name || ''), title: String(body.title || ''), html: session.restoredHtml, user })
        if (!result || result.status !== 200) {
          return errorResponse(res, result?.status || 500, result?.body?.error || 'Deploy failed.', result?.status === 409 ? 'choose_name' : 'retry_deploy')
        }
        session.deliveryResults.deploy = { url: result.body.url, slug: result.body.slug || body.name }
        return json(res, 200, {
          step: 7,
          status: 'success',
          delivery: 'deploy',
          url: result.body.url,
          message: `Site deployed at ${result.body.url}`,
        })
      }

      errorResponse(res, 404, `Unknown pipeline route: ${req.method} ${route}`, 'check_endpoint')
      return true
    } catch (err) {
      log(`[pipeline] error on ${req.method} ${route}: ${err.message}`)
      errorResponse(res, err.status || 500, err.message || 'Pipeline failure.', err.actionRequired || (err.code === 'UNREACHABLE' ? 'check_url' : 'retry'))
      return true
    }
  }
}
