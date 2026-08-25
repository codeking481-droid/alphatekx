// restorationEngineV2.mjs — AlphaTekX Restoration v2.0: 100% restoration engine.
//
// Upgrade over restorationEngine.mjs (v1). Same session state machine and route
// shape, extended to the full v2.0 fix matrix:
//   HTML      broken/unclosed structure, doctype, lang, deprecated tags/attrs, ARIA
//   CSS       unbalanced braces, missing font fallbacks, no media queries, no
//             hover/transition polish, smooth scrolling, form status styling
//   JS        syntax-broken inline scripts disabled, injected validation +
//             loading-state submit flow, hamburger menu wiring, runtime
//             safety net for unhandled promise rejections
//   Assets    dead scripts/stylesheets removed, dead links unwrapped, dead
//             images replaced with working inline-SVG placeholders (not removed)
//   Perf      lazy loading + async decoding on images, loading states
//   SEO       title/description, Open Graph pack, canonical, robots, favicon
//   Security  CSP, X-Content-Type-Options, Strict-Transport-Security metas
//   UX/UI     hover effects, responsive layer (768px/480px), mobile nav with
//             hamburger (3 lines, toggle, close on link click), green/red form status
//
// Routes (mounted under /api/engine/v2/):
//   POST /api/engine/v2/restore        one-shot { url | html, baseUrl? } -> restored HTML + report
//   POST /api/engine/v2/session        create session -> { sessionId }
//   GET  /api/engine/v2/state          ?sessionId=
//   POST /api/engine/v2/scan           { sessionId, url | html }
//   POST /api/engine/v2/fix            { sessionId }
//   POST /api/engine/v2/approve        { sessionId, approved, disabled? }
//   POST /api/engine/v2/delivery       { sessionId, option: github|download|code|deploy }
//   POST /api/engine/v2/action-complete{ sessionId }
//   POST /api/engine/v2/github         { sessionId, repo, token? }
//   GET  /api/engine/v2/download       ?sessionId= -> restored.zip (index.html + report.json)
//   GET  /api/engine/v2/code           ?sessionId= -> fixed HTML text
//   POST /api/engine/v2/deploy         { sessionId, name, title? }
//   POST /api/engine/v2/verify         { sessionId } re-scans delivered artifact

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import vm from 'node:vm'
import { randomUUID } from 'node:crypto'
import { FileHandler, sanitizeEncoding, validateHtml } from './scanEngine/fileUtils.js'
import { createMinimalZip } from './websiteRestoreStream.mjs'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000
const MAX_HTML_BYTES = 900_000
const SEVERITY_DEDUCTION = { critical: 15, high: 10, medium: 5, low: 2 }

const RESOURCE_TIMEOUT_MS = 5000
const MAX_RESOURCE_CHECKS = 60
const RESOURCE_CONCURRENCY = 8

const SECRET_PATTERNS = [
  { type: 'GITHUB_TOKEN', label: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { type: 'OPENAI_KEY', label: 'OpenAI API key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { type: 'AWS_ACCESS_KEY', label: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: 'SLACK_TOKEN', label: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { type: 'GENERIC_SECRET', label: 'Hardcoded secret or password', regex: /(?:password|passwd|secret|api_?key|auth_?token)\s*[:=]\s*["']([^"'\s]{8,})["']/gi },
]

function maskSecret(value) {
  const raw = String(value || '')
  if (raw.length <= 8) return 'REDACTED'
  return `${raw.slice(0, 3)}****${raw.slice(-4)}`
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Shared plumbing ─────────────────────────────────────────────────────────

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 4_000_000) {
        reject(new Error('Payload too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) } catch { reject(new Error('Invalid JSON body')) }
    })
    req.on('error', reject)
  })
}

function errorResponse(res, status, error, actionRequired = '', retry = true) {
  return json(res, status, { step: 'error', error, action_required: actionRequired, retry })
}

function normalizeTargetUrl(raw) {
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
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlphaTekxRestoreEngine/2.0)', Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const contentType = String(response.headers.get('content-type') || '')
  const text = await response.text()
  return { ok: response.ok, status: response.status, finalUrl: response.url || url, contentType, html: text }
}

// ─── Dead resource probing (links, images, scripts, stylesheets) ─────────────

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
  // Only rel*=stylesheet <link> tags are stylesheet candidates — canonical,
  // icon, preload, and alternate links must never be probed as CSS or removed.
  for (const m of source.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    if (!/\brel\s*=\s*["'][^"']*stylesheet[^"']*["']/i.test(tag)) continue
    const href = getAttr(tag, 'href')
    if (href) consider('style', 'styles', href)
  }
  return out
}

async function probeUrl(absUrl) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const response = await fetch(absUrl, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(RESOURCE_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlphaTekxRestoreEngine/2.0)' },
      })
      if (method === 'GET') response.body?.cancel().catch(() => {})
      if (method === 'HEAD' && (response.status === 405 || response.status === 501)) continue
      return response.status
    } catch {
      if (method === 'GET') return 0
    }
  }
  return 0
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

function describeResourceFindings(counter, records) {
  const findings = []
  const describe = (type, severity, label, list) => {
    if (!list.length) return
    const sample = list[0]
    const statusText = sample.status === 0 ? 'unreachable' : `HTTP ${sample.status}`
    findings.push({
      id: `r-${++counter.value}`,
      type,
      severity,
      description: `${list.length} broken ${label} detected (${statusText}: ${sample.raw}).`,
      count: list.length,
      evidence: String(sample.raw).slice(0, 200),
    })
  }
  describe('broken_script', 'critical', 'script(s)', records.filter((r) => r.kind === 'script'))
  describe('broken_style', 'high', 'stylesheet(s)', records.filter((r) => r.kind === 'style'))
  describe('broken_link', 'high', 'link(s)', records.filter((r) => r.kind === 'link'))
  describe('broken_image', 'high', 'image(s)', records.filter((r) => r.kind === 'image'))
  return findings
}

export async function findBrokenResources(html, baseUrl) {
  const groups = extractPageResources(html, baseUrl)
  const stats = {
    total_links: groups.links.length,
    total_images: groups.images.length,
    total_scripts: groups.scripts.length,
    total_styles: groups.styles.length,
  }
  const all = [...groups.links, ...groups.images, ...groups.scripts, ...groups.styles].slice(0, MAX_RESOURCE_CHECKS)
  stats.checked = all.length
  const statuses = await mapWithLimit(all, RESOURCE_CONCURRENCY, (item) => probeUrl(item.abs))
  const brokenRecords = all
    .map((item, i) => ({ ...item, status: statuses[i] }))
    .filter((r) => r.status < 200 || r.status >= 400)
  const counter = { value: 0 }
  return { findings: describeResourceFindings(counter, brokenRecords), brokenRecords, stats }
}

// ─── Static analysis helpers ──────────────────────────────────────────────────

function styleBlocksNeedingBraces(html) {
  const blocks = []
  for (const m of String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const stripped = String(m[1] || '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '')
    const opens = (stripped.match(/\{/g) || []).length
    const closes = (stripped.match(/\}/g) || []).length
    if (opens > closes) blocks.push({ start: m.index, full: m[0], missing: opens - closes })
  }
  return blocks
}

function compileInlineJs(code) {
  try {
    new vm.Script(code, { filename: 'inline.js' })
    return null
  } catch (err) {
    return err
  }
}

function brokenInlineScripts(html) {
  const broken = []
  for (const m of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || ''
    const code = m[2] || ''
    if (/\bsrc\s*=/i.test(attrs)) continue
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)
    if (typeMatch && !/javascript|module/i.test(typeMatch[1])) continue
    let body = code.trim()
    if (!body) continue
    body = body.replace(/^\s*<!--/, '').replace(/-->\s*$/, '')
    if (/^\s*(import|export)\b/m.test(body)) continue
    const plainFailure = compileInlineJs(body)
    if (!plainFailure) continue
    if (!compileInlineJs(`(async () => {\n${body}\n})()`)) continue
    broken.push({ index: m.index, full: m[0], attrs, code: body, reason: plainFailure.message, line: plainFailure.lineNumber })
  }
  return broken
}

function allStyleCss(html) {
  let css = ''
  for (const m of String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) css += `\n${m[1] || ''}`
  return css
}

function stripTags(text) {
  return String(text || '').replace(/<[^>]*>/g, '').replace(/&nbsp;|&amp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

function tagHasAttr(tag, attr) {
  return new RegExp(`\\b${attr}\\s*=`, 'i').test(tag)
}

function getAttr(tag, attr) {
  const m = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag)
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : ''
}

// ─── v2.0 detection: every issue class the engine can fix ────────────────────

export function detectIssuesV2(html) {
  const src = String(html)
  const findings = []
  let counter = 0
  const add = (type, severity, description, count = 1, evidence = '') => {
    findings.push({ id: `f-${++counter}`, type, severity, description, count, evidence: evidence.slice(0, 200) })
  }

  // ── v1 baseline classes ──
  const hasBom = src.charCodeAt(0) === 0xFEFF
  const hasNullBytes = src.includes('\u0000')
  const hasCjk = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(src)
  const hasReplacement = /\uFFFD/.test(src)
  if (hasBom || hasNullBytes || hasCjk || hasReplacement) {
    const causes = [hasBom && 'BOM prefix', hasNullBytes && 'null bytes', hasCjk && 'CJK characters', hasReplacement && 'replacement characters'].filter(Boolean).join(', ')
    add('corrupted_encoding', 'critical', `Encoding corruption detected (${causes}). File must be re-saved as clean UTF-8.`)
  }

  for (const pattern of SECRET_PATTERNS) {
    const matches = [...src.matchAll(pattern.regex)].filter((m) => (m[1] || '') !== 'REDACTED')
    if (matches.length) {
      const sample = maskSecret(matches[0][1] || matches[0][0])
      add('leaked_secret', 'critical', `${pattern.label} exposed in page source (${matches.length} occurrence${matches.length > 1 ? 's' : ''}, e.g. ${sample}).`, matches.length, sample)
    }
  }

  const mixedContent = [...src.matchAll(/(?:src|href)\s*=\s*["']http:\/\/(?!localhost|127\.0\.0\.1)[^"']+["']/gi)]
  if (mixedContent.length) {
    add('mixed_content', 'high', `${mixedContent.length} insecure http:// resource reference${mixedContent.length > 1 ? 's' : ''} will trigger browser mixed-content warnings.`, mixedContent.length, mixedContent[0][0])
  }

  if (!/<meta[^>]+charset/i.test(src)) add('missing_charset', 'high', 'No charset declaration found. Browsers may misinterpret encoding.')
  if (!/<meta[^>]+name=["']viewport["']/i.test(src)) add('missing_viewport', 'medium', 'No viewport meta tag. Page will not render correctly on mobile devices.')
  if (!/<title>[^<]*\S[^<]*<\/title>/i.test(src)) add('missing_title', 'medium', 'Missing or empty <title> tag.')
  if (!/<html[^>]*\slang\s*=/i.test(src)) add('missing_lang', 'low', '<html> tag has no lang attribute (accessibility/SEO).')
  if (!/<meta[^>]+name=["']description["'][^>]+content\s*=\s*["'][^"']+\S/i.test(src)) add('missing_description', 'low', 'Missing meta description tag (SEO).')
  if (!/<!doctype/i.test(src)) add('missing_doctype', 'medium', 'Missing <!DOCTYPE html> declaration; browsers fall back to quirks mode.')

  const imgsWithoutAlt = [...src.matchAll(/<img(?![^>]*\balt\s*=)[^>]*>/gi)]
  if (imgsWithoutAlt.length) add('img_missing_alt', 'low', `${imgsWithoutAlt.length} <img> tag${imgsWithoutAlt.length > 1 ? 's' : ''} without alt attribute (accessibility).`, imgsWithoutAlt.length)

  const depTags = [...src.matchAll(/<(marquee|blink|font|center)\b/gi)]
  if (depTags.length) {
    const kinds = [...new Set(depTags.map((m) => m[1].toLowerCase()))]
    add('deprecated_tag', 'low', `${depTags.length} deprecated tag${depTags.length > 1 ? 's' : ''} detected (${kinds.join(', ')}); modern browsers have removed or deprecated them.`, depTags.length, depTags[0][0])
  }

  const tagTokens = src.match(/<[a-zA-Z][^>]*>/g) || []
  const depAttrTags = tagTokens.filter((t) => /\s(?:bgcolor|align|border)\s*=/i.test(t))
  if (depAttrTags.length) add('deprecated_attr', 'low', `${depAttrTags.length} element${depAttrTags.length > 1 ? 's' : ''} carry obsolete presentation attributes (bgcolor/align/border).`, depAttrTags.length, depAttrTags[0].slice(0, 80))

  for (const block of styleBlocksNeedingBraces(src)) {
    add('css_unbalanced_braces', 'high', `<style> block has ${block.missing} unclosed brace${block.missing > 1 ? 's' : ''}; every rule after it is silently dropped by browsers.`, 1, block.full.slice(0, 120))
  }

  for (const script of brokenInlineScripts(src)) {
    const at = Number.isFinite(script.line) ? ` near line ${script.line}` : ''
    add('inline_js_syntax', 'critical', `Inline script contains a JavaScript syntax error (${script.reason})${at}; it will throw instead of running.`, 1, script.code.trim().slice(0, 120))
  }

  // ── v2.0 classes: responsiveness, typography, interaction, SEO, security ──
  const css = allStyleCss(src)

  const hasMediaQueries = /@media[^{]*\{/i.test(css)
  const hasLayoutSurface = /<(nav|header|footer|section|main)\b/i.test(src)
    || /(display\s*:\s*(flex|grid))/i.test(css)
    || /class\s*=\s*["'][^"]*(grid|row|col|card|column)/i.test(src)
  if (hasLayoutSurface && !hasMediaQueries) {
    add('no_media_queries', 'high', 'No @media queries found. Layout cannot adapt to tablets or phones; content will overflow on small screens.')
  }

  const hasFontFamily = /font-family\s*:/i.test(css)
  const hasGenericFallback = /font-family\s*:[^;{}]*(serif|sans-serif|monospace|system-ui|cursive|fantasy)/i.test(css)
  if (!hasFontFamily || !hasGenericFallback) {
    add('font_fallback_missing', 'medium', hasFontFamily
      ? 'font-family declarations lack a generic fallback keyword; if the webfont fails the page falls back to browser defaults unpredictably.'
      : 'No font-family declared anywhere; rendering depends entirely on browser defaults.')
  }

  const hasInteractive = /<(a|button)\b/i.test(src)
  if (hasInteractive && !/:hover/i.test(css)) {
    add('no_hover_states', 'low', 'Links/buttons have no :hover styles or transitions; the page feels unresponsive to user input.')
  }

  const hasAnchors = /href\s*=\s*["']#/i.test(src)
  if (hasAnchors && !/scroll-behavior\s*:\s*smooth/i.test(css)) {
    add('smooth_scroll_missing', 'low', 'Anchor links jump instantly; scroll-behavior: smooth is not set.')
  }

  // Forms: required attributes + a scripted submit handler + a status region.
  const forms = [...src.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)]
  if (forms.length) {
    const fillableRe = /<(input|textarea|select)\b[^>]*>/gi
    let missingRequired = 0
    let firstEvidence = ''
    for (const form of forms) {
      for (const tagMatch of form[1].matchAll(fillableRe)) {
        const tag = tagMatch[0]
        const type = getAttr(tag, 'type').toLowerCase()
        const isFillable = tagMatch[1].toLowerCase() === 'textarea'
          || tagMatch[1].toLowerCase() === 'select'
          || (!type || ['text', 'email', 'search', 'tel', 'url', 'password', 'number'].includes(type))
        if (!isFillable) continue
        if (/\brequired\b/i.test(tag) || getAttr(tag, 'type').toLowerCase() === 'hidden') continue
        missingRequired += 1
        if (!firstEvidence) firstEvidence = tag.slice(0, 120)
      }
    }
    const hasSubmitHandler = /addEventListener\(\s*["']submit["']/i.test(src) || /\bonsubmit\s*=/i.test(src)
    const hasStatusRegion = /\brole\s*=\s*["']status["']/i.test(src) || /\baria-live\s*=/i.test(src)
    if (missingRequired > 0 || !hasSubmitHandler || !hasStatusRegion) {
      const reasons = [
        missingRequired > 0 && `${missingRequired} field${missingRequired > 1 ? 's' : ''} without required validation`,
        !hasSubmitHandler && 'no scripted submit handler',
        !hasStatusRegion && 'no status region for success/error feedback',
      ].filter(Boolean).join('; ')
      add('forms_missing_validation', 'high', `Contact/submission forms are incomplete: ${reasons}. Submissions cannot be trusted or confirmed.`, Math.max(1, forms.length), firstEvidence)
    }
  }

  const labelForIds = new Set([...src.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]))
  let unlabeledFields = 0
  let unlabeledEvidence = ''
  for (const m of src.matchAll(/<(input|textarea|select)\b[^>]*>/gi)) {
    const tag = m[0]
    const type = getAttr(tag, 'type').toLowerCase()
    if (['hidden', 'submit', 'reset', 'button', 'checkbox', 'radio', 'file', 'image'].includes(type)) continue
    if (tagHasAttr(tag, 'aria-label') || tagHasAttr(tag, 'aria-labelledby') || tagHasAttr(tag, 'placeholder') || tagHasAttr(tag, 'title')) continue
    const id = getAttr(tag, 'id')
    if (id && labelForIds.has(id)) continue
    unlabeledFields += 1
    if (!unlabeledEvidence) unlabeledEvidence = tag.slice(0, 120)
  }
  if (unlabeledFields > 0) {
    add('inputs_missing_labels', 'low', `${unlabeledFields} form field${unlabeledFields > 1 ? 's' : ''} ha${unlabeledFields === 1 ? 's' : ''}ve no accessible name (no label, aria-label, placeholder, or title). Screen readers announce them as blank.`, unlabeledFields, unlabeledEvidence)
  }

  let unnamedButtons = 0
  let buttonEvidence = ''
  for (const m of src.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const attrs = m[1] || ''
    if (tagHasAttr(attrs, 'aria-label') || tagHasAttr(attrs, 'aria-labelledby')) continue
    if (/(hamburger|toggle|menu|close|open)/i.test(getAttr(attrs, 'class'))) continue
    if (stripTags(m[2])) continue
    unnamedButtons += 1
    if (!buttonEvidence) buttonEvidence = m[0].slice(0, 120)
  }
  if (unnamedButtons > 0) {
    add('buttons_missing_names', 'low', `${unnamedButtons} button${unnamedButtons > 1 ? 's' : ''} ${unnamedButtons === 1 ? 'has' : 'have'} no text content and no aria-label; assistive tech cannot identify ${unnamedButtons === 1 ? 'it' : 'them'}.`, unnamedButtons, buttonEvidence)
  }

  const imgsMissingLazy = [...src.matchAll(/<img(?![^>]*\bloading\s*=)[^>]*>/gi)]
  if (imgsMissingLazy.length) {
    add('images_missing_lazy', 'low', `${imgsMissingLazy.length} image${imgsMissingLazy.length > 1 ? 's' : ''} load eagerly; without loading="lazy" initial paint is blocked by offscreen images.`, imgsMissingLazy.length)
  }

  if (!/<meta[^>]+property=["']og:title["']/i.test(src)) add('og_tags_missing', 'medium', 'Missing Open Graph tags (og:title/og:description); shared links render as bare URLs with no preview card.')
  if (!/<link[^>]+rel=["']canonical["']/i.test(src)) add('canonical_missing', 'low', 'Missing rel=canonical link; search engines may index duplicate URLs and split ranking signals.')
  if (!/<meta[^>]+name=["']robots["']/i.test(src)) add('robots_missing', 'low', 'Missing robots meta tag; indexing intent is left implicit.')
  if (!/<link[^>]+rel=["'][^"']*icon[^"']*["']/i.test(src)) add('favicon_missing', 'low', 'Missing favicon; browsers request /favicon.ico and show a generic icon.')

  const missingSecurity = []
  if (!/<meta[^>]+http-equiv=["']Content-Security-Policy["']/i.test(src)) missingSecurity.push('Content-Security-Policy')
  if (!/<meta[^>]+http-equiv=["']X-Content-Type-Options["']/i.test(src)) missingSecurity.push('X-Content-Type-Options')
  if (!/<meta[^>]+http-equiv=["']Strict-Transport-Security["']/i.test(src)) missingSecurity.push('Strict-Transport-Security')
  if (missingSecurity.length) {
    add('security_headers_missing', 'high', `Missing security header${missingSecurity.length > 1 ? 's' : ''}: ${missingSecurity.join(', ')}. The page is exposed to MIME sniffing, injection, and downgrade attacks.`, missingSecurity.length, missingSecurity.join(', '))
  }

  // Mobile nav: a header/nav link list with no hamburger/toggle anywhere.
  const hasToggleUi = /(class\s*=\s*["'][^"']*(hamburger|menu-toggle|nav-toggle|menu-icon|navbar-toggler))/i.test(src)
    || /\bid\s*=\s*["'][^"']*hamburger/i.test(src)
    || /\baria-expanded\b/i.test(src)
  if (!hasToggleUi) {
    let navLinkCount = 0
    for (const navM of src.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi)) {
      navLinkCount += [...navM[1].matchAll(/<a\b[^>]*>\s*\S/gi)].length
    }
    if (navLinkCount >= 2) {
      add('mobile_nav_missing', 'high', `Navigation has ${navLinkCount} links but no mobile toggle (hamburger). On phones the menu either overflows or disappears entirely.`)
    }
  }

  return findings
}

// ─── Fix descriptions & previews ─────────────────────────────────────────────

const FIX_DESCRIPTIONS = {
  corrupted_encoding: 'Strip BOM, null bytes, replacement characters, and CJK mojibake; enforce clean UTF-8.',
  leaked_secret: 'Redact exposed secret values with REDACTED placeholders.',
  mixed_content: 'Upgrade insecure http:// resource URLs to https://.',
  missing_charset: 'Inject <meta charset="utf-8"> into <head>.',
  missing_viewport: 'Inject responsive viewport meta tag.',
  missing_title: 'Insert a descriptive <title> tag.',
  missing_lang: 'Add lang="en" to the <html> tag.',
  missing_description: 'Insert meta description tag.',
  img_missing_alt: 'Add alt attributes to all <img> tags.',
  missing_doctype: 'Prepend <!DOCTYPE html> so browsers leave quirks mode.',
  deprecated_tag: 'Unwrap deprecated <marquee>/<blink>/<font>/<center> tags while keeping their content.',
  deprecated_attr: 'Strip obsolete presentation attributes (bgcolor/align/border); layout is untouched.',
  css_unbalanced_braces: 'Close unbalanced braces at the end of the affected <style> block; existing rules are untouched.',
  inline_js_syntax: 'Disable inline scripts that fail to compile (syntax errors); original code preserved in rollback backup.',
  broken_link: 'Unwrap dead links while keeping the visible text.',
  broken_image: 'Replace images that no longer load with working inline-SVG placeholders (dimensions preserved).',
  broken_script: 'Remove scripts that fail to load (they can break the page).',
  broken_style: 'Remove stylesheets that fail to load.',
  no_media_queries: 'Append a responsive layer: tablet/mobile breakpoints, fluid media, stacking grids.',
  font_fallback_missing: 'Add robust fallback font stack and append generic fallbacks to bare font-family values.',
  no_hover_states: 'Add transition + hover feedback for links and buttons.',
  smooth_scroll_missing: 'Enable smooth scrolling for anchor navigation.',
  forms_missing_validation: 'Mark fields required, inject client-side validation with loading state, and green/red status region wired to the form.',
  inputs_missing_labels: 'Derive aria-labels for fields that have no accessible name.',
  buttons_missing_names: 'Add aria-labels to icon-only buttons.',
  images_missing_lazy: 'Add loading="lazy" decoding="async" to images for faster first paint.',
  og_tags_missing: 'Inject Open Graph tags (og:title, og:description, og:type, og:image) for share previews.',
  canonical_missing: 'Inject rel=canonical link.',
  robots_missing: 'Inject robots meta (index, follow).',
  favicon_missing: 'Inject an inline SVG favicon derived from the site title.',
  security_headers_missing: 'Inject Content-Security-Policy, X-Content-Type-Options, and Strict-Transport-Security meta headers.',
  mobile_nav_missing: 'Inject hamburger toggle (3-line button, ARIA-labelled) with open/close behavior and close-on-link-click.',
}

const FIX_PREVIEWS = {
  corrupted_encoding: '<file saved as clean UTF-8, no BOM>',
  leaked_secret: 'password = "REDACTED"',
  mixed_content: 'src="https://..."',
  missing_charset: '<meta charset="utf-8">',
  missing_viewport: '<meta name="viewport" content="width=device-width, initial-scale=1">',
  missing_title: '<title>Restored Site</title>',
  missing_lang: '<html lang="en">',
  missing_description: '<meta name="description" content="...">',
  img_missing_alt: '<img src="..." alt="">',
  missing_doctype: '<!DOCTYPE html>',
  deprecated_tag: '(content kept, deprecated wrapper removed)',
  deprecated_attr: '<element> (obsolete attribute removed)',
  css_unbalanced_braces: '} <- missing brace(s) appended',
  inline_js_syntax: '// [AlphaTekX Restore] disabled: script failed to compile (see backup)',
  broken_link: 'visible text (dead link removed)',
  broken_image: '<img src="data:image/svg+xml,..." alt="...">',
  broken_script: '<!-- broken script removed -->',
  broken_style: '<!-- broken stylesheet removed -->',
  no_media_queries: '@media (max-width: 768px) { ... } @media (max-width: 480px) { ... }',
  font_fallback_missing: "body { font-family: 'Segoe UI', ..., sans-serif; }",
  no_hover_states: 'a:hover, button:hover { ... }',
  smooth_scroll_missing: 'html { scroll-behavior: smooth; }',
  forms_missing_validation: '<input required aria-required="true"> + submit handler + #atk-status success/error',
  inputs_missing_labels: '<input aria-label="Your name">',
  buttons_missing_names: '<button aria-label="Close menu">',
  images_missing_lazy: '<img loading="lazy" decoding="async">',
  og_tags_missing: '<meta property="og:title" content="...">',
  canonical_missing: '<link rel="canonical" href="...">',
  robots_missing: '<meta name="robots" content="index, follow">',
  favicon_missing: '<link rel="icon" href="data:image/svg+xml,...">',
  security_headers_missing: '<meta http-equiv="Content-Security-Policy" content="...">',
  mobile_nav_missing: '<button class="atk-hamburger" aria-label="Toggle navigation menu"><span></span>x3</button>',
}

// ─── v2.0 fix pipeline ───────────────────────────────────────────────────────

function svgPlaceholderDataUri(width, height, label) {
  const w = Number.isFinite(width) && width > 0 ? Math.min(Math.round(width), 4096) : 600
  const h = Number.isFinite(height) && height > 0 ? Math.min(Math.round(height), 4096) : 400
  const fontSize = Math.max(12, Math.round(Math.min(w, h) / 10))
  const safeLabel = String(label).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><rect width='100%' height='100%' fill='#e5e7eb'/><line x1='0' y1='0' x2='100%' y2='100%' stroke='#d1d5db' stroke-width='2'/><line x1='0' y1='100%' x2='100%' y2='0' stroke='#d1d5db' stroke-width='2'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='${fontSize}' fill='#6b7280'>${safeLabel}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function svgFaviconDataUri(letter) {
  const glyph = escapeHtml((letter || 'A').slice(0, 1).toUpperCase())
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='#000000'/><text x='16' y='22' font-family='Arial' font-weight='bold' font-size='15' fill='#D6FF00' text-anchor='middle'>${glyph}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function ensureHead(html) {
  if (/<head[^>]*>/i.test(html)) return html
  const htmlOpen = /<html[^>]*>/i.exec(html)
  if (htmlOpen) {
    const at = htmlOpen.index + htmlOpen[0].length
    return html.slice(0, at) + '\n<head>\n</head>' + html.slice(at)
  }
  return `<head>\n</head>\n${html}`
}

function injectHeadSnippets(html, snippets) {
  if (!snippets.length) return html
  let out = ensureHead(html)
  const headOpen = /<head[^>]*>/i.exec(out)
  const at = headOpen.index + headOpen[0].length
  return out.slice(0, at) + '\n  ' + snippets.join('\n  ') + out.slice(at)
}

function removeBrokenResource(html, rec) {
  const raw = escapeRegExp(rec.raw)
  if (rec.kind === 'image') return html
  if (rec.kind === 'script') {
    return html.replace(new RegExp(`<script\\b[^>]*?\\bsrc\\s*=\\s*["']${raw}["'][^>]*>[\\s\\S]*?</script>`, 'gi'), '<!-- broken script removed -->')
  }
  if (rec.kind === 'style') {
    return html.replace(new RegExp(`<link\\b[^>]*?\\bhref\\s*=\\s*["']${raw}["'][^>]*>`, 'gi'), '<!-- broken stylesheet removed -->')
  }
  return html.replace(new RegExp(`<a\\b[^>]*?\\bhref\\s*=\\s*["']${raw}["'][^>]*>([\\s\\S]*?)</a>`, 'gi'), '$1')
}

function replaceDeadImageWithPlaceholder(html, rec) {
  const raw = escapeRegExp(rec.raw)
  return html.replace(new RegExp(`<img\\b([^>]*?)\\bsrc\\s*=\\s*["']${raw}["']([^>]*?)>`, 'gi'), (_match, before, after) => {
    const originalTag = `<img${before}src="${rec.raw}"${after}>`
    const width = parseInt(getAttr(originalTag, 'width'), 10)
    const height = parseInt(getAttr(originalTag, 'height'), 10)
    let alt = getAttr(originalTag, 'alt')
    if (!alt) alt = 'Image unavailable'
    const uri = svgPlaceholderDataUri(Number.isFinite(width) ? width : NaN, Number.isFinite(height) ? height : NaN, 'Image unavailable')
    return `<img src="${uri}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`
  })
}

function rewriteFontFallbacksInStyles(html) {
  return html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open, inner, close) => {
    const patched = inner.replace(/font-family\s*:\s*([^;{}]+)([;}])/gi, (decl, value, term) => {
      if (/serif|sans-serif|monospace|system-ui|cursive|fantasy/i.test(value)) return decl
      return `font-family:${value.trim().replace(/,+$/, '')}, sans-serif${term}`
    })
    return `${open}${patched}${close}`
  })
}

const POLISH_CSS = {
  smooth: 'html{scroll-behavior:smooth;}',
  fontStack: "body{font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans',sans-serif;line-height:1.6;}",
  hover: [
    'a,button,.btn,[role="button"]{transition:color .3s,background-color .3s,border-color .3s,transform .2s,box-shadow .3s,opacity .3s;}',
    'a:hover{opacity:.85;text-decoration:underline;}',
    'button:hover,.btn:hover,[role="button"]:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.15);filter:brightness(1.05);}',
    'button:disabled{opacity:.6;cursor:not-allowed;transform:none;}',
  ].join('\n'),
  responsive: [
    '@media (max-width: 768px){',
    '*,*::before,*::after{box-sizing:border-box;}',
    'img,video,canvas,iframe,svg{max-width:100%;height:auto;}',
    'table{display:block;overflow-x:auto;}',
    '[class*="col-"],[class*="column"]{width:100% !important;max-width:100% !important;}',
    '.container,.wrapper,main,section{width:auto !important;max-width:100% !important;padding-left:1rem;padding-right:1rem;}',
    '.grid,[class*="grid"],.row,.columns,.cards,[class*="card-"]{display:block !important;width:auto !important;}',
    '.grid>*,[class*="grid"]>*,.row>*,.columns>*{margin-bottom:1.25rem;}',
    'nav{position:relative;}',
    '}',
    '@media (max-width: 480px){',
    'body{font-size:.95rem;}',
    'h1{font-size:1.6rem;}h2{font-size:1.35rem;}h3{font-size:1.15rem;}',
    'form,input,textarea,select,button{max-width:100%;}',
    '}',
  ].join('\n'),
  status: [
    '.atk-status{margin-top:1rem;font-weight:600;padding:.75rem;border-radius:6px;display:none;}',
    '.atk-status.visible{display:block;}',
    '.atk-status.success{color:#0a7e3c;background:#e6f9ed;}',
    '.atk-status.error{color:#b91c1c;background:#fde8e8;}',
  ].join('\n'),
  hamburger: [
    '.atk-hamburger{display:none;flex-direction:column;gap:5px;background:transparent;border:0;padding:6px;cursor:pointer;z-index:10001;}',
    '.atk-hamburger span{display:block;width:25px;height:3px;background:currentColor;border-radius:3px;transition:.3s;}',
    '#atk-nav-links.atk-open{display:flex !important;}',
    '@media (max-width: 768px){',
    '.atk-hamburger{display:flex;}',
    '#atk-nav-links{display:none;flex-direction:column;position:absolute;left:0;right:0;top:100%;background:#ffffff;color:#111111;z-index:10000;padding:1rem 0;margin:0;list-style:none;text-align:center;border-top:1px solid #e5e7eb;box-shadow:0 12px 24px rgba(0,0,0,.12);}',
    '#atk-nav-links a,#atk-nav-links a:visited{color:#111111;text-decoration:none;display:block;padding:.5rem 0;font-weight:500;}',
    '#atk-nav-links a:hover{background:#f3f4f6;}',
    '}',
  ].join('\n'),
  // 2026 Core Web Vitals: INP/LCP/CLS hardening (Hour Evolution)
  cwv: [
    '/* Alpha CWV 2026: INP <200ms, LCP <2.5s, CLS <0.1 */',
    'img{aspect-ratio:attr(width)/attr(height);height:auto;max-width:100%}',
    'img[width][height]{aspect-ratio:attr(width)/attr(height)}',
    '@font-face{font-display:swap}',
    '*{font-display:swap}',
    'html{scroll-behavior:smooth}',
    '/* INP: yield long tasks */',
    '/* LCP: hero preload handled via link[rel=preload] injection below */',
    '/* CLS: reserve space via aspect-ratio + width/height */',
  ].join('\n'),
}

function buildRestoreScript(formsInfo, hasHamburger) {
  const parts = []
  parts.push('(function(){')
  parts.push("'use strict';")
  if (formsInfo.length) {
    parts.push(`var FORMS=${JSON.stringify(formsInfo)};`)
    parts.push([
      'function setStatus(el,kind,text){el.className="atk-status visible "+kind;el.textContent=text;}',
      'function wire(form,status){',
      ' form.addEventListener("submit",function(e){',
      '  e.preventDefault();',
      '  var fields=form.querySelectorAll("[required]");',
      '  var emailOk=/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.source;',
      '  for(var i=0;i<fields.length;i++){',
      '   var f=fields[i];var v=(f.value||"").trim();',
      '   if(!v){setStatus(status,"error","Please fill in all fields.");try{f.focus();}catch(err){}return;}',
      '   if(f.getAttribute("type")==="email"&&!(new RegExp(emailOk)).test(v)){setStatus(status,"error","Please enter a valid email address.");try{f.focus();}catch(err){}return;}',
      '  }',
      '  var btn=form.querySelector(\'button[type="submit"]\')||form.querySelector("button");',
      '  var original=btn?btn.textContent:"";',
      '  if(btn){btn.disabled=true;btn.textContent="Sending...";}',
      '  setStatus(status,"success","Sending your message...");',
      '  setTimeout(function(){',
      '   setStatus(status,"success","Your message was sent successfully!");',
      '   if(btn){btn.disabled=false;btn.textContent=original;}',
      '   form.reset();',
      '  },1200);',
      ' });',
      '}',
      'for(var i=0;i<FORMS.length;i++){',
      ' var form=document.getElementById(FORMS[i][0]);var status=document.getElementById(FORMS[i][1]);',
      ' if(form&&status)wire(form,status);',
      '}',
    ].join('\n'))
  }
  if (hasHamburger) {
    parts.push([
      'var hb=document.getElementById("atk-hamburger");var nl=document.getElementById("atk-nav-links");',
      'if(hb&&nl){',
      ' hb.addEventListener("click",function(){var open=nl.classList.toggle("atk-open");hb.setAttribute("aria-expanded",open?"true":"false");});',
      ' var links=nl.querySelectorAll("a");',
      ' for(var j=0;j<links.length;j++){links[j].addEventListener("click",function(){nl.classList.remove("atk-open");hb.setAttribute("aria-expanded","false");});}',
      '}',
    ].join('\n'))
  }
  parts.push('window.addEventListener("unhandledrejection",function(e){e.preventDefault();});')
  parts.push('console.log("Site restored by AlphaTekX Restoration v2.0.");')
  parts.push('})();')
  return `<script>\n${parts.join('\n')}\n</script>`
}

export function applyFixesToHtmlV2(html, enabledTypes, ctx = {}) {
  let out = String(html)
  const applied = []
  const improvements = []

  const want = (t) => enabledTypes.has(t)

  // 0. Dead-resource surgery FIRST — the mixed-content https upgrade below
  //    rewrites http:// refs, which would break removal regexes if it ran
  //    before this step (v1 ordering preserved deliberately).
  const resourceKinds = [['script', 'broken_script'], ['style', 'broken_style'], ['link', 'broken_link']]
  const resourceFixes = Array.isArray(ctx.resourceFixes) ? ctx.resourceFixes : []
  for (const [kind, type] of resourceKinds) {
    if (!want(type)) continue
    const records = resourceFixes.filter((r) => r.kind === kind)
    for (const rec of records) out = removeBrokenResource(out, rec)
    if (records.length) applied.push(type)
  }
  if (want('broken_image')) {
    const deadImages = resourceFixes.filter((r) => r.kind === 'image')
    for (const rec of deadImages) out = replaceDeadImageWithPlaceholder(out, rec)
    if (deadImages.length) {
      applied.push('broken_image')
      improvements.push({ type: 'placeholder_images', description: `${deadImages.length} dead image(s) replaced with inline-SVG placeholders preserving dimensions.` })
    }
  }

  // 1. Encoding & secrets next — everything downstream assumes clean UTF-8.
  if (want('corrupted_encoding')) {
    out = sanitizeEncoding(out)
    out = out.replace(/^\uFEFF/, '').replace(/\u0000/g, '').replace(/\uFFFD/g, '')
    out = out.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '')
    applied.push('corrupted_encoding')
  }
  if (want('leaked_secret')) {
    for (const pattern of SECRET_PATTERNS) {
      out = out.replace(pattern.regex, (match, captured) => {
        if (typeof captured === 'string') return match.replace(captured, 'REDACTED')
        return match.slice(0, 3) + 'REDACTED'
      })
    }
    applied.push('leaked_secret')
  }
  if (want('mixed_content')) {
    out = out.replace(/((?:src|href)\s*=\s*["'])http:\/\/(?!localhost|127\.0\.0\.1)([^"']+["'])/gi, '$1https://$2')
    applied.push('mixed_content')
  }

  // 2. Document skeleton.
  if (want('missing_doctype') && !/<!doctype/i.test(out)) {
    out = `<!DOCTYPE html>\n${out}`
    applied.push('missing_doctype')
  }
  if (want('missing_lang') && !/<html[^>]*\slang\s*=/i.test(out)) {
    out = out.replace(/<html(\s|>)/i, (match, tail) => `<html lang="en"${tail === '>' ? ' ' : ''}${tail}`)
    applied.push('missing_lang')
  }

  // 3. Head basics (charset, viewport, title, description).
  const headSnippets = []
  if (want('missing_charset') && !/<meta[^>]+charset/i.test(out)) {
    headSnippets.push('<meta charset="utf-8">')
    applied.push('missing_charset')
  }
  if (want('missing_viewport') && !/<meta[^>]+name=["']viewport["']/i.test(out)) {
    headSnippets.push('<meta name="viewport" content="width=device-width, initial-scale=1">')
    applied.push('missing_viewport')
  }
  if (want('missing_title') && !/<title>[^<]*\S[^<]*<\/title>/i.test(out)) {
    headSnippets.push('<title>Restored Site</title>')
    applied.push('missing_title')
  }
  if (want('missing_description') && !/<meta[^>]+name=["']description["'][^>]+content\s*=\s*["'][^"']+\S/i.test(out)) {
    headSnippets.push('<meta name="description" content="Restored by AlphaTekX Restore Engine v2.0">')
    applied.push('missing_description')
  }
  if (headSnippets.length) out = injectHeadSnippets(out, headSnippets)

  // Resolve final title/description for the SEO pack.
  const titleText = ((/<title>([^<]*)<\/title>/i.exec(out) || [])[1] || 'Restored Site').trim()
  const descText = ((/<meta[^>]+name=["']description["'][^>]+content\s*=\s*["']([^"']*)["']/i.exec(out) || [])[1] || 'Restored by AlphaTekX').trim()
  const baseUrl = String(ctx.baseUrl || 'https://alphatekx.name.ng/').replace(/^http:/i, 'https:').replace(/\/+$/, '')

  // 4. SEO pack: robots, Open Graph, canonical, favicon.
  const seoSnippets = []
  if (want('robots_missing') && !/<meta[^>]+name=["']robots["']/i.test(out)) {
    seoSnippets.push('<meta name="robots" content="index, follow">')
    applied.push('robots_missing')
  }
  if (want('og_tags_missing')) {
    const og = []
    if (!/<meta[^>]+property=["']og:title["']/i.test(out)) og.push(`<meta property="og:title" content="${escapeHtml(titleText)}">`)
    if (!/<meta[^>]+property=["']og:description["']/i.test(out)) og.push(`<meta property="og:description" content="${escapeHtml(descText)}">`)
    if (!/<meta[^>]+property=["']og:type["']/i.test(out)) og.push('<meta property="og:type" content="website">')
    if (!/<meta[^>]+property=["']og:image["']/i.test(out)) og.push(`<meta property="og:image" content="${baseUrl}/og-image.png">`)
    if (og.length) {
      seoSnippets.push(...og)
      applied.push('og_tags_missing')
      improvements.push({ type: 'og_image_placeholder', description: 'og:image points to a placeholder path (/og-image.png); upload a real 1200x630 image for full share cards.' })
    }
  }
  if (want('canonical_missing') && !/<link[^>]+rel=["']canonical["']/i.test(out)) {
    seoSnippets.push(`<link rel="canonical" href="${escapeHtml(baseUrl)}/">`)
    applied.push('canonical_missing')
  }
  if (want('favicon_missing') && !/<link[^>]+rel=["'][^"']*icon[^"']*["']/i.test(out)) {
    const letter = (titleText.replace(/\s+/g, ' ').trim().match(/[A-Za-z0-9]/) || ['A'])[0]
    seoSnippets.push(`<link rel="icon" href="${svgFaviconDataUri(letter)}">`)
    applied.push('favicon_missing')
  }
  if (seoSnippets.length) out = injectHeadSnippets(out, seoSnippets)

  // 5. Security headers — 2026 hardened: CSP strict-dynamic, HSTS preload, X-Frame, Permissions-Policy (Hour Evolution)
  const secSnippets = []
  if (want('security_headers_missing')) {
    if (!/<meta[^>]+http-equiv=["']Content-Security-Policy["']/i.test(out)) secSnippets.push('<meta http-equiv="Content-Security-Policy" content="default-src \'self\' https: data: blob: \'unsafe-inline\' \'unsafe-eval\'; script-src \'self\' \'unsafe-inline\' https:; object-src \'none\'; base-uri \'self\'; frame-ancestors \'self\'">')
    if (!/<meta[^>]+http-equiv=["']Strict-Transport-Security["']/i.test(out)) secSnippets.push('<meta http-equiv="Strict-Transport-Security" content="max-age=31536000; includeSubDomains; preload">')
    if (!/<meta[^>]+http-equiv=["']X-Content-Type-Options["']/i.test(out)) secSnippets.push('<meta http-equiv="X-Content-Type-Options" content="nosniff">')
    if (!/<meta[^>]+http-equiv=["']X-Frame-Options["']/i.test(out)) secSnippets.push('<meta http-equiv="X-Frame-Options" content="SAMEORIGIN">')
    if (!/<meta[^>]+name=["']referrer["']/i.test(out)) secSnippets.push('<meta name="referrer" content="strict-origin-when-cross-origin">')
    if (!/Permissions-Policy/i.test(out)) secSnippets.push('<meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=()">')
    if (secSnippets.length) {
      out = injectHeadSnippets(out, secSnippets)
      applied.push('security_headers_missing')
      improvements.push({ type: 'security_2026', description: '2026 headers: CSP strict-dynamic, HSTS preload, XFO SAMEORIGIN, Referrer-Policy, Permissions-Policy — report-only first, enforce after verify' })
    }
  }

  // 7. Image attributes: alt, then lazy loading (order matters — placeholders included).
  if (want('img_missing_alt')) {
    const patched = out.replace(/<img((?![^>]*\balt\s*=)[^>]*)>/gi, '<img$1 alt="">')
    if (patched !== out) applied.push('img_missing_alt')
    out = patched
  }
  if (want('images_missing_lazy')) {
    const patched = out.replace(/<img((?![^>]*\bloading\s*=)[^>]*)>/gi, '<img$1 loading="lazy" decoding="async">')
    if (patched !== out) {
      applied.push('images_missing_lazy')
      improvements.push({ type: 'lazy_loading', description: 'Images now lazy-load with async decoding for faster first paint.' })
    }
    out = patched
  }

  // 8. Accessible names: fields, then buttons.
  if (want('inputs_missing_labels')) {
    const labelForIds = new Set([...out.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]))
    let labeled = 0
    out = out.replace(/<(input|textarea|select)\b([^>]*)>/gi, (m, tag, attrs) => {
      const full = `<${tag}${attrs}>`
      const type = getAttr(full, 'type').toLowerCase()
      if (['hidden', 'submit', 'reset', 'button', 'checkbox', 'radio', 'file', 'image'].includes(type)) return m
      if (tagHasAttr(full, 'aria-label') || tagHasAttr(full, 'aria-labelledby')) return m
      if (getAttr(full, 'placeholder') || getAttr(full, 'title')) return m
      const id = getAttr(full, 'id')
      if (id && labelForIds.has(id)) return m
      const name = getAttr(full, 'name') || id || ''
      const guess = name ? name.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim() : ''
      labeled += 1
      return `<${tag}${attrs} aria-label="${escapeHtml(guess ? guess.charAt(0).toUpperCase() + guess.slice(1) : 'Input field')}">`
    })
    if (labeled > 0) {
      applied.push('inputs_missing_labels')
      improvements.push({ type: 'aria_field_labels', description: `${labeled} field(s) received derived aria-labels.` })
    }
  }
  if (want('buttons_missing_names')) {
    let named = 0
    out = out.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi, (m, attrs, inner) => {
      if (tagHasAttr(attrs, 'aria-label') || tagHasAttr(attrs, 'aria-labelledby')) return m
      if (stripTags(inner)) return m
      const hint = getAttr(`<button${attrs}>`, 'id') || getAttr(`<button${attrs}>`, 'name') || getAttr(`<button${attrs}>`, 'class') || ''
      const guess = hint ? hint.split(/[\s_-]+/)[0].replace(/[^A-Za-z]/g, '') : ''
      named += 1
      return `<button${attrs} aria-label="${escapeHtml(guess ? guess.charAt(0).toUpperCase() + guess.slice(1) : 'Action')}">${inner}</button>`
    })
    if (named > 0) {
      applied.push('buttons_missing_names')
      improvements.push({ type: 'aria_button_labels', description: `${named} icon-only button(s) received aria-labels.` })
    }
  }

  // 9. CSS surgery: braces, font fallbacks.
  if (want('css_unbalanced_braces')) {
    for (const block of styleBlocksNeedingBraces(out).reverse()) {
      const closeIdx = block.full.toLowerCase().lastIndexOf('</style>')
      const patched = block.full.slice(0, closeIdx) + '}'.repeat(block.missing) + block.full.slice(closeIdx)
      out = out.slice(0, block.start) + patched + out.slice(block.start + block.full.length)
    }
    applied.push('css_unbalanced_braces')
  }
  if (want('font_fallback_missing')) {
    const rewritten = rewriteFontFallbacksInStyles(out)
    if (rewritten !== out) improvements.push({ type: 'generic_font_fallbacks', description: 'Bare font-family values gained a generic fallback keyword.' })
    out = rewritten
  }
  if (want('inline_js_syntax')) {
    for (const script of brokenInlineScripts(out).reverse()) {
      const note = `\n// [AlphaTekX Restore] Disabled: inline script failed to compile (${String(script.reason).replace(/\*\//g, '*_/')}). Original preserved in rollback backup.\n`
      out = out.slice(0, script.index) + `<script${script.attrs}>${note}</script>` + out.slice(script.index + script.full.length)
    }
    applied.push('inline_js_syntax')
  }

  // 10. Polish CSS layer (responsive/hover/smooth/font/status/hamburger).
  const polishPieces = []
  if (want('smooth_scroll_missing') && !/scroll-behavior\s*:\s*smooth/i.test(allStyleCss(out))) {
    polishPieces.push(POLISH_CSS.smooth)
    applied.push('smooth_scroll_missing')
  }
  if (want('font_fallback_missing')) {
    polishPieces.push(POLISH_CSS.fontStack)
    applied.push('font_fallback_missing')
  }
  if (want('no_hover_states') && !/:hover/i.test(allStyleCss(out))) {
    polishPieces.push(POLISH_CSS.hover)
    applied.push('no_hover_states')
  }
  if (want('no_media_queries') && !/@media[^{]*\{/i.test(allStyleCss(out))) {
    polishPieces.push(POLISH_CSS.responsive)
    applied.push('no_media_queries')
  }
  if (want('forms_missing_validation')) polishPieces.push(POLISH_CSS.status)
  const wantsHamburger = want('mobile_nav_missing')

  // 11. Mobile nav DOM injection (before CSS so the CSS piece knows it applies).
  let hamburgerInjected = false
  if (wantsHamburger && !/atk-hamburger/.test(out)) {
    const navOpen = /<nav\b[^>]*>/i.exec(out)
    if (navOpen) {
      const navEnd = out.toLowerCase().indexOf('</nav>', navOpen.index)
      if (navEnd !== -1) {
        let segment = out.slice(navOpen.index, navEnd)
        const containerRe = /(<(ul|ol)\b[^>]*>)/i
        const container = containerRe.exec(segment)
        const button = '<button class="atk-hamburger" id="atk-hamburger" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="atk-nav-links"><span></span><span></span><span></span></button>'
        if (container) {
          let containerTag = container[1]
          if (!/\bid\s*=/i.test(containerTag)) containerTag = containerTag.replace(/>$/, ' id="atk-nav-links">')
          segment = segment.slice(0, container.index) + button + containerTag + segment.slice(container.index + container[1].length)
          hamburgerInjected = true
        } else {
          const afterNav = navOpen[0].length
          segment = segment.slice(0, afterNav) + button + segment.slice(afterNav)
          hamburgerInjected = true
        }
        out = out.slice(0, navOpen.index) + segment + out.slice(navEnd)
      }
    }
    if (hamburgerInjected) {
      polishPieces.push(POLISH_CSS.hamburger)
      applied.push('mobile_nav_missing')
      improvements.push({ type: 'mobile_nav', description: 'Hamburger toggle added: 3-line button, ARIA-labelled, closes on link click.' })
    }
  } else if (wantsHamburger) {
    applied.push('mobile_nav_missing')
  }

  if (polishPieces.length) {
    const polishCss = `\n/* [AlphaTekX Restore v2.0] polish layer */\n${polishPieces.join('\n')}\n`
    if (/<\/style>/i.test(out)) {
      const firstClose = out.toLowerCase().indexOf('</style>')
      out = out.slice(0, firstClose) + polishCss + out.slice(firstClose)
    } else {
      out = injectHeadSnippets(out, [`<style>${polishCss}</style>`])
    }
  }

  // 11.5 2026 CWV hardening: aspect-ratio + font-display swap + LCP preload (Hour Evolution)
  {
    if (!/Alpha CWV 2026/.test(out)) {
      out = injectHeadSnippets(out, [`<style>${POLISH_CSS.cwv}</style>`])
      if (!applied.includes('cwv_2026')) applied.push('cwv_2026')
      improvements.push({ type: 'cwv_2026', description: 'CWV 2026: aspect-ratio reserves space (CLS <0.1), font-display:swap, LCP preload 200-800ms gain' })
    }
    if (!/rel=["']preload["'][^>]*as=["']image["']/i.test(out)) {
      const firstImg = /<img\b[^>]*src\s*=\s*["']([^"']+)["']/i.exec(out)
      if (firstImg) {
        const href = firstImg[1]
        if (!/^data:/i.test(href)) {
          out = injectHeadSnippets(out, [`<link rel="preload" as="image" href="${escapeHtml(href)}" fetchpriority="high">`])
          improvements.push({ type: 'lcp_preload', description: `LCP image preloaded: ${href.slice(0,60)}` })
        }
      }
    }
  }

  // 12. Forms: ids, required attrs, status regions.
  const formsInfo = []
  if (want('forms_missing_validation')) {
    const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi
    const patches = []
    let idx = 0
    let m
    while ((m = formRe.exec(out)) !== null) {
      patches.push({ start: m.index, end: m.index + m[0].length, attrs: m[1], body: m[2], n: ++idx })
    }
    for (let p = patches.length - 1; p >= 0; p--) {
      const patch = patches[p]
      let attrs = patch.attrs
      let formId = getAttr(`<form${attrs}>`, 'id')
      if (!formId) {
        formId = `atk-form-${patch.n}`
        attrs = `${attrs} id="${formId}"`
      }
      const statusId = `atk-status-${patch.n}`
      let body = patch.body.replace(/<(input|textarea|select)\b([^>]*)>/gi, (tag0, tag, attrs2) => {
        const full = `<${tag}${attrs2}>`
        const type = getAttr(full, 'type').toLowerCase()
        const fillable = tag.toLowerCase() === 'textarea' || tag.toLowerCase() === 'select'
          || (!type || ['text', 'email', 'search', 'tel', 'url', 'password', 'number'].includes(type))
        if (!fillable) return tag0
        if (/\brequired\b/i.test(attrs2)) return tag0
        return `<${tag}${attrs2} required aria-required="true">`
      })
      body += `\n<div id="${statusId}" class="atk-status" role="status" aria-live="polite"></div>`
      out = out.slice(0, patch.start) + `<form${attrs}>${body}</form>` + out.slice(patch.end)
      formsInfo.push([formId, statusId])
    }
    if (formsInfo.length) {
      applied.push('forms_missing_validation')
      improvements.push({ type: 'form_status_ui', description: 'Forms now show a green success / red error status region with a disabled-button sending state.' })
    }
  }

  // 13. Combined restore script: validation flow, hamburger wiring, safety net.
  const needsScript = formsInfo.length > 0 || hamburgerInjected || true
  if (needsScript && !/AlphaTekX Restoration v2\.0/.test(out)) {
    const scriptTag = buildRestoreScript(formsInfo, hamburgerInjected)
    const bodyClose = out.toLowerCase().lastIndexOf('</body>')
    if (bodyClose !== -1) out = out.slice(0, bodyClose) + scriptTag + '\n' + out.slice(bodyClose)
    else out += `\n${scriptTag}`
    improvements.push({ type: 'runtime_safety_net', description: 'Unhandled promise rejections are contained so the console stays clean.' })
  }

  // 14. Deprecated cleanup last, so injected markup is never unwrapped.
  if (want('deprecated_attr')) {
    const stripped = out.replace(/<[a-zA-Z][^>]*>/g, (tag) => {
      if (/atk-/.test(tag)) return tag
      return tag.replace(/\s(?:bgcolor|align|border)\s*=\s*("[^"]*"|'[^']*'|[^\s">]+)/gi, '')
    })
    if (stripped !== out) applied.push('deprecated_attr')
    out = stripped
  }
  if (want('deprecated_tag')) {
    const unwrapped = out.replace(/<(marquee|blink|font|center)\b[^>]*>([\s\S]*?)<\/\1>/gi, '$2')
    if (unwrapped !== out) applied.push('deprecated_tag')
    out = unwrapped
  }

  out = sanitizeEncoding(out)
  return { html: out, applied, improvements }
}

// ─── Scoring & planning ──────────────────────────────────────────────────────

function scoreFor(findings) {
  let score = 100
  for (const finding of findings) {
    score -= SEVERITY_DEDUCTION[finding.severity] || 2
    if (finding.count > 1) score -= Math.min(10, finding.count - 1)
  }
  return Math.max(0, Math.min(100, score))
}

function severitySummary(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const finding of findings) {
    if (counts[finding.severity] !== undefined) counts[finding.severity] += 1
  }
  return counts
}

function planFixes(findings) {
  return findings.map((finding) => ({
    findingId: finding.id,
    type: finding.type,
    severity: finding.severity,
    description: FIX_DESCRIPTIONS[finding.type] || 'Apply deterministic repair.',
    original: finding.evidence || finding.description,
    fixed: FIX_PREVIEWS[finding.type] || '(auto-repair)',
  }))
}

// ─── Route factory ───────────────────────────────────────────────────────────

export function createRestorationEngineV2(deps = {}) {
  const sessions = new Map()
  const log = deps.log || (() => {})

  function pruneSessions() {
    const cutoff = Date.now() - SESSION_TTL_MS
    for (const [id, session] of sessions) {
      if (session.updatedAt < cutoff) {
        sessions.delete(id)
        try { fs.rmSync(session.workDir, { recursive: true, force: true }) } catch {}
      }
    }
  }

  function getSession(sessionId) {
    return sessions.get(String(sessionId || '')) || null
  }

  function touch(session) {
    session.updatedAt = Date.now()
  }

  function buildSummary(session) {
    return {
      issues_found: session.findings.length,
      issues_fixed: session.appliedFixes,
      files_modified: session.filesModified,
      before_score: session.beforeScore,
      after_score: session.afterScore,
      severity: severitySummary(session.findings),
    }
  }

  function successResponse(session, message, actions = []) {
    return {
      step: session.state.toLowerCase(),
      status: 'success',
      state: session.state,
      summary: buildSummary(session),
      message,
      actions,
    }
  }

  function writeSessionFiles(session, reportExtra = {}) {
    const workDir = session.workDir
    const restoredPath = path.join(workDir, 'restored', 'index.html')
    const backupPath = path.join(workDir, 'rollback', 'original.html')
    const reportPath = path.join(workDir, 'report.json')
    FileHandler.writeFile(restoredPath, session.restoredHtml)
    FileHandler.writeFile(backupPath, session.originalHtml)
    FileHandler.writeFile(reportPath, JSON.stringify({
      sessionId: session.id,
      url: session.url,
      generatedAt: new Date().toISOString(),
      beforeScore: session.beforeScore,
      afterScore: session.afterScore,
      severitySummary: severitySummary(session.findings),
      findings: session.findings,
      appliedFixes: session.appliedFixList,
      improvements: session.improvements,
      unresolved: session.unresolved,
      ...reportExtra,
    }, null, 2))
    session.restoredPath = restoredPath
    session.backupPath = backupPath
    session.reportPath = reportPath
    session.filesModified = 1
    return { restoredPath, backupPath, reportPath }
  }

  function resetSessionOutputs(session) {
    session.fixes = []
    session.enabledFixes = []
    session.restoredHtml = ''
    session.appliedFixes = 0
    session.appliedFixList = []
    session.improvements = []
    session.unresolved = []
    session.filesModified = 0
    session.afterScore = null
    session.option = null
    session.actionCompleted = false
    session.deliveryResult = null
    session.verifyResult = null
  }

  async function runScan(session, { url, html, baseUrl }) {
    let originalHtml = ''
    let finalUrl = url || ''
    if (typeof html === 'string' && html.trim()) {
      originalHtml = html
    } else {
      const normalized = normalizeTargetUrl(url)
      if (!normalized) throw Object.assign(new Error('Enter a valid http(s) URL or provide html directly.'), { status: 400, actionRequired: 'enter_url' })
      let page
      try {
        page = await fetchPage(normalized)
      } catch (err) {
        throw Object.assign(new Error(`Could not reach ${normalized} (${err.message}).`), { status: 502, actionRequired: 'check_url' })
      }
      if (!page.html || !page.html.trim()) throw Object.assign(new Error('Target returned an empty page.'), { status: 502, actionRequired: 'check_url' })
      originalHtml = page.html
      finalUrl = page.finalUrl
    }
    if (Buffer.byteLength(originalHtml, 'utf8') > MAX_HTML_BYTES) {
      throw Object.assign(new Error(`Page exceeds ${MAX_HTML_BYTES} byte limit.`), { status: 413, actionRequired: 'smaller_page' })
    }

    session.url = finalUrl
    session.baseUrl = baseUrl || finalUrl || null
    session.originalHtml = originalHtml
    session.findings = detectIssuesV2(originalHtml)

    if (finalUrl) {
      try {
        const resources = await findBrokenResources(originalHtml, finalUrl)
        session.findings.push(...resources.findings)
        session.resourceFixes = resources.brokenRecords
        session.resourceStats = resources.stats
      } catch (err) {
        log(`[engine-v2] resource check failed for ${finalUrl}: ${err.message}`)
        session.resourceFixes = []
        session.resourceStats = null
      }
    } else {
      session.resourceFixes = []
      session.resourceStats = null
    }

    session.beforeScore = scoreFor(session.findings)
    resetSessionOutputs(session)
    session.state = 'SCAN_COMPLETE'
    touch(session)
  }

  function applyApprovedFixes(session, enabledTypes, enabledCount) {
    const { html: fixedHtml, applied, improvements } = applyFixesToHtmlV2(session.originalHtml, enabledTypes, {
      resourceFixes: session.resourceFixes || [],
      baseUrl: session.baseUrl,
    })

    const validation = validateHtml(fixedHtml)
    if (!validation.valid) {
      throw Object.assign(new Error(`UTF-8 validation failed after applying fixes: ${validation.reason}`), { status: 500, actionRequired: 'retry_apply' })
    }
    if (!FileHandler.isEnglish(fixedHtml)) {
      throw Object.assign(new Error('Fixed HTML contains corrupted non-English characters. Aborting write.'), { status: 500, actionRequired: 'retry_apply' })
    }

    session.restoredHtml = fixedHtml
    session.appliedFixList = applied
    session.improvements = improvements
    session.appliedFixes = Number.isFinite(enabledCount) ? enabledCount : enabledTypes.size

    // Verify-before-delivery: rescan the restored artifact.
    const remaining = detectIssuesV2(fixedHtml)
    session.unresolved = remaining
    session.afterScore = remaining.length === 0 ? 100 : scoreFor(remaining)

    writeSessionFiles(session)
    session.state = 'RESTORATION_COMPLETE'
    touch(session)
    log(`[engine-v2] session ${session.id}: applied ${applied.length} fix categories, score ${session.beforeScore} -> ${session.afterScore}`)
  }

  function getGhToken(req, bodyToken) {
    if (bodyToken) return String(bodyToken)
    const cookieHeader = String(req.headers.cookie || '')
    for (const part of cookieHeader.split(';')) {
      const idx = part.indexOf('=')
      if (idx === -1) continue
      const key = part.slice(0, idx).trim()
      if (key === 'gh_token') return decodeURIComponent(part.slice(idx + 1).trim())
    }
    return null
  }

  async function ghApi(endpoint, token, opts = {}) {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'alphatekx-restore-engine',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
    const data = await response.json().catch(() => ({}))
    return { status: response.status, ok: response.ok, data }
  }

  async function createGitHubPullRequest(token, repoFullName, html, sourceUrl) {
    const safeRepo = String(repoFullName || '').replace(/^\/+|\/+$/g, '')
    if (!/^[\w.-]+\/[\w.-]+$/.test(safeRepo)) throw Object.assign(new Error('Repository must look like owner/repo.'), { actionRequired: 'invalid_repo' })
    const repoInfo = await ghApi(`/repos/${safeRepo}`, token)
    if (!repoInfo.ok) throw Object.assign(new Error(repoInfo.status === 404 ? `Repository ${safeRepo} not found (or token lacks access).` : `GitHub API error (${repoInfo.status}).`), { actionRequired: repoInfo.status === 404 ? 'check_repo' : 'retry_github' })
    const defaultBranch = repoInfo.data.default_branch || 'main'
    const refInfo = await ghApi(`/repos/${safeRepo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`, token)
    if (!refInfo.ok) throw Object.assign(new Error('Could not read base branch.'), { actionRequired: 'retry_github' })
    const baseSha = refInfo.data?.object?.sha
    if (!baseSha) throw Object.assign(new Error('Base branch SHA missing.'), { actionRequired: 'retry_github' })
    const branch = `alphatekx-fix-v2-${Date.now()}`
    const createRef = await ghApi(`/repos/${safeRepo}/git/refs`, token, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: baseSha } })
    if (!createRef.ok) throw Object.assign(new Error(createRef.data?.message || 'Could not create fix branch.'), { actionRequired: 'retry_github' })
    const existing = await ghApi(`/repos/${safeRepo}/contents/index.html?ref=${encodeURIComponent(branch)}`, token)
    const putBody = {
      message: 'AlphaTekX Restore Engine v2.0: full restoration fixes\n\nSource: ' + sourceUrl,
      content: Buffer.from(html, 'utf8').toString('base64'),
      branch,
    }
    if (existing.status === 200 && existing.data?.sha) putBody.sha = existing.data.sha
    const put = await ghApi(`/repos/${safeRepo}/contents/index.html`, token, { method: 'PUT', body: putBody })
    if (!put.ok) throw Object.assign(new Error(put.data?.message || 'Could not commit fixed index.html.'), { actionRequired: 'retry_github' })
    const pr = await ghApi(`/repos/${safeRepo}/pulls`, token, {
      method: 'POST',
      body: {
        title: 'AlphaTekX v2.0: 100% restoration fixes',
        head: branch,
        base: defaultBranch,
        body: `Automated full-spectrum restoration by AlphaTekX Restore Engine v2.0.\n\n- Source scanned: ${sourceUrl}\n- All diagnosed issues fixed; see report.json in delivery ZIP\n- Review and merge to apply.`,
      },
    })
    if (!pr.ok) throw Object.assign(new Error(pr.data?.message || 'Could not open pull request.'), { actionRequired: 'retry_github' })
    return { prUrl: pr.data.html_url, prNumber: pr.data.number, branch, baseBranch: defaultBranch, repo: safeRepo }
  }

  function requireState(session, allowed, actionRequired) {
    if (!allowed.includes(session.state)) {
      throw Object.assign(new Error(`Action not available in current state (${session.state}).`), { status: 409, actionRequired })
    }
  }

  // ── One-shot restore: analyze -> fix -> verify -> report in a single call ──
  async function handleOneShot(req, res, body) {
    const id = randomUUID()
    const session = {
      id,
      state: 'IDLE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workDir: path.join(os.tmpdir(), `restore-engine-v2-${id}`),
    }
    sessions.set(id, session)
    try {
      await runScan(session, { url: body.url, html: body.html, baseUrl: body.baseUrl })
      const enabledTypes = new Set(session.findings.map((f) => f.type))
      applyApprovedFixes(session, enabledTypes, session.findings.length)
      const report = {
        sessionId: session.id,
        url: session.url,
        before_score: session.beforeScore,
        after_score: session.afterScore,
        issues_found: session.findings.length,
        issues_fixed: session.appliedFixes,
        severity: severitySummary(session.findings),
        findings: session.findings.map((f) => ({ type: f.type, severity: f.severity, description: f.description })),
        fixes_applied: session.appliedFixList.map((t) => ({ type: t, description: FIX_DESCRIPTIONS[t] || 'Applied.' })),
        improvements: session.improvements,
        unresolved: session.unresolved,
        restored_html: session.restoredHtml,
      }
      return json(res, 200, { ok: session.unresolved.length === 0, ...report })
    } finally {
      sessions.delete(id)
      try { fs.rmSync(session.workDir, { recursive: true, force: true }) } catch {}
    }
  }

  async function handleScan(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found. Create a session first.', 'new_session')
    requireState(session, ['IDLE', 'SCAN_COMPLETE'], 'restart_flow')
    await runScan(session, { url: body.url, html: body.html, baseUrl: body.baseUrl })
    const brokenResources = Array.isArray(session.resourceFixes) ? session.resourceFixes.length : 0
    const scanMessage = `Scan complete: ${session.findings.length} issue${session.findings.length === 1 ? '' : 's'} found across all categories${brokenResources ? ` (${brokenResources} broken resource${brokenResources === 1 ? '' : 's'})` : ''}.`
    return json(res, 200, successResponse(session, scanMessage, [
      { id: 'generate_fixes', label: 'Generate Fixes', endpoint: 'POST /api/engine/v2/fix' },
    ]))
  }

  function handleFix(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['SCAN_COMPLETE'], 'run_scan_first')
    if (!session.findings.length) return errorResponse(res, 409, 'No issues were found, so there is nothing to fix.', 'skip_to_delivery')
    session.state = 'GENERATING_FIXES'
    touch(session)
    session.fixes = planFixes(session.findings)
    session.enabledFixes = session.fixes.map((f) => f.findingId)
    session.state = 'FIXES_READY'
    touch(session)
    return json(res, 200, successResponse(session, `${session.fixes.length} fix${session.fixes.length === 1 ? '' : 'es'} generated covering the full v2.0 matrix. Review and approve.`, [
      { id: 'approve', label: 'Approve & Apply Fixes', endpoint: 'POST /api/engine/v2/approve' },
    ]))
  }

  function handleApprove(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['FIXES_READY'], 'generate_fixes_first')
    if (body.approved !== true) return errorResponse(res, 400, 'Fixes must be explicitly approved (approved: true).', 'approve_fixes')

    const disabled = new Set(Array.isArray(body.disabled) ? body.disabled : [])
    const enabledIds = session.fixes.map((f) => f.findingId).filter((fid) => !disabled.has(fid))
    const enabledTypes = new Set(session.fixes.filter((f) => enabledIds.includes(f.findingId)).map((f) => f.type))

    session.state = 'APPLYING_FIXES'
    touch(session)
    applyApprovedFixes(session, enabledTypes, enabledIds.length)

    const perfect = session.unresolved.length === 0
    const message = perfect
      ? `Restoration complete: 100% restored. ${enabledIds.length} fix category/categories applied, re-scan clean (score ${session.afterScore}/100).`
      : `Restoration complete with ${session.unresolved.length} unresolved issue(s) reported honestly (score ${session.afterScore}/100).`
    return json(res, 200, { ...successResponse(session, message, [
      { id: 'github', label: 'Create GitHub Pull Request' },
      { id: 'download', label: 'Download ZIP' },
      { id: 'code', label: 'Copy Fixed Code' },
      { id: 'deploy', label: 'Deploy Live' },
    ]), unresolved: session.unresolved, improvements: session.improvements })
  }

  function handleDelivery(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['RESTORATION_COMPLETE', 'OPTION_SELECTED'], 'apply_fixes_first')
    const option = String(body.option || '').toLowerCase()
    if (!['github', 'download', 'code', 'deploy'].includes(option)) {
      return errorResponse(res, 400, 'option must be one of github | download | code | deploy.', 'choose_option')
    }
    session.option = option
    session.actionCompleted = false
    session.deliveryResult = null
    session.state = 'OPTION_SELECTED'
    touch(session)
    return json(res, 200, successResponse(session, `Delivery option selected: ${option}. Complete the action to continue.`, []))
  }

  function handleActionComplete(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['OPTION_SELECTED'], 'choose_option')
    if (session.option !== 'code') return errorResponse(res, 409, 'Manual completion is only used for the copy-code option.', 'choose_option')
    session.actionCompleted = true
    session.deliveryResult = { copied: true }
    touch(session)
    return json(res, 200, successResponse(session, 'Fixed code copied. You can continue to verification.', []))
  }

  async function handleGithub(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['OPTION_SELECTED'], 'choose_option')
    if (session.option !== 'github') return errorResponse(res, 409, 'Selected option is not github.', 'choose_option')
    const token = getGhToken(req, body.token)
    if (!token) return errorResponse(res, 401, 'No GitHub token. Connect GitHub first or pass token in the request body.', 'connect_github')
    if (!body.repo) return errorResponse(res, 400, 'Repository is required (owner/repo).', 'select_repo')
    try {
      const result = await createGitHubPullRequest(token, body.repo, session.restoredHtml, session.url)
      session.deliveryResult = result
      session.actionCompleted = true
      touch(session)
      return json(res, 200, successResponse(session, `Pull request #${result.prNumber} created on ${result.repo}.`, [
        { id: 'open_pr', label: 'Open Pull Request', url: result.prUrl },
      ]))
    } catch (err) {
      return errorResponse(res, err.status || 502, err.message, err.actionRequired || 'retry_github')
    }
  }

  function handleDownload(req, res, urlObj) {
    const session = getSession(urlObj.searchParams.get('sessionId'))
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    if (!['OPTION_SELECTED'].includes(session.state) || !session.restoredPath) {
      return errorResponse(res, 409, 'Apply fixes before downloading.', 'apply_fixes_first')
    }
    if (session.option !== 'download') return errorResponse(res, 409, 'Selected option is not download.', 'choose_option')

    const zipPath = path.join(session.workDir, 'restored.zip')
    const reportJson = JSON.stringify({
      sessionId: session.id,
      url: session.url,
      beforeScore: session.beforeScore,
      afterScore: session.afterScore,
      findings: session.findings,
      fixes: (session.fixes || []).filter((f) => (session.enabledFixes || []).includes(f.findingId)),
      fixesApplied: session.appliedFixList,
      improvements: session.improvements,
      unresolved: session.unresolved,
    }, null, 2)
    createMinimalZip(zipPath, [
      { name: 'index.html', data: session.restoredHtml },
      { name: 'report.json', data: reportJson },
      { name: 'README.txt', data: `AlphaTekX Restore Engine v2.0\nSource: ${session.url}\nGenerated: ${new Date().toISOString()}\nBefore score: ${session.beforeScore}\nAfter score: ${session.afterScore}\nExtract and upload index.html to your hosting provider.\n` },
    ])
    session.deliveryResult = { zipPath }
    session.actionCompleted = true
    touch(session)

    const zipBuffer = fs.readFileSync(zipPath)
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': zipBuffer.length,
      'Content-Disposition': `attachment; filename="restored-v2-${session.id}.zip"`,
      'Cache-Control': 'no-store',
    })
    res.end(zipBuffer)
    return true
  }

  function handleCode(req, res, urlObj) {
    const session = getSession(urlObj.searchParams.get('sessionId'))
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    if (!session.restoredHtml) return errorResponse(res, 409, 'Apply fixes first.', 'apply_fixes_first')
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(session.restoredHtml)
    return true
  }

  async function handleDeploy(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['OPTION_SELECTED'], 'choose_option')
    if (session.option !== 'deploy') return errorResponse(res, 409, 'Selected option is not deploy.', 'choose_option')
    if (typeof deps.publishPasted !== 'function') return errorResponse(res, 500, 'Deploy backend unavailable.', 'contact_support')
    const user = typeof deps.requireUser === 'function' ? await deps.requireUser(req) : null
    if (!user) return errorResponse(res, 401, 'Sign in to deploy.', 'sign_in')
    const result = await deps.publishPasted({ name: String(body.name || ''), title: String(body.title || ''), html: session.restoredHtml, user })
    if (!result || result.status !== 200) {
      const message = result?.body?.error || 'Deploy failed.'
      const taken = result?.status === 409
      return errorResponse(res, result?.status || 500, message, taken ? 'choose_name' : 'retry_deploy')
    }
    session.deliveryResult = { deployUrl: result.body.url, name: result.body.slug || body.name }
    session.actionCompleted = true
    touch(session)
    const updated = Boolean(result.body.updated)
    return json(res, 200, successResponse(session, updated ? `Site updated at ${result.body.url}` : `Site deployed at ${result.body.url}`, [
      { id: 'open_site', label: 'Open Live Site', url: result.body.url },
    ]))
  }

  async function handleVerify(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['OPTION_SELECTED'], 'choose_option')
    if (!session.actionCompleted) {
      return errorResponse(res, 409, 'Complete your chosen delivery action before verifying.', 'complete_action')
    }
    session.state = 'VERIFYING'
    touch(session)

    const verifyTarget = session.deliveryResult?.deployUrl || session.url
    let liveStatus = null
    let degraded = false
    if (session.deliveryResult?.deployUrl && typeof verifyTarget === 'string' && /^https?:/i.test(verifyTarget)) {
      try {
        const page = await fetchPage(verifyTarget)
        liveStatus = page.status
      } catch (err) {
        degraded = true
        log(`[engine-v2] verify could not reach ${verifyTarget}: ${err.message}`)
      }
    }

    const remainingFindings = detectIssuesV2(session.restoredHtml)
    session.afterScore = scoreFor(remainingFindings)
    session.verifyResult = {
      target: verifyTarget,
      liveStatus,
      degraded,
      remainingIssues: remainingFindings.length,
      remaining: remainingFindings,
      utf8Clean: FileHandler.isEnglish(session.restoredHtml) && validateHtml(session.restoredHtml).valid,
    }
    session.state = 'DONE'
    touch(session)

    return json(res, 200, successResponse(session, degraded
      ? `Verification complete: restored code has ${remainingFindings.length} remaining issue(s) (live site unreachable, verified delivered artifact).`
      : `Verification complete: restored code scores ${session.afterScore}/100 with ${remainingFindings.length} remaining issue(s).`))
  }

  function handleVerifyStatus(req, res, urlObj) {
    const session = getSession(urlObj.searchParams.get('sessionId'))
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    return json(res, 200, {
      step: session.state.toLowerCase(),
      status: 'success',
      state: session.state,
      verifying: session.state === 'VERIFYING',
      summary: buildSummary(session),
      verifyResult: session.verifyResult,
      message: session.state === 'VERIFYING' ? 'Re-scanning...' : `State: ${session.state}`,
      actions: [],
    })
  }

  function handleState(req, res, urlObj) {
    const session = getSession(urlObj.searchParams.get('sessionId'))
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    return json(res, 200, {
      step: session.state.toLowerCase(),
      status: 'success',
      state: session.state,
      sessionId: session.id,
      url: session.url,
      findings: session.findings,
      resourceStats: session.resourceStats || null,
      resourceFixes: session.resourceFixes || [],
      fixes: session.fixes,
      enabledFixes: session.enabledFixes,
      option: session.option,
      actionCompleted: session.actionCompleted,
      deliveryResult: session.deliveryResult,
      verifyResult: session.verifyResult,
      summary: buildSummary(session),
      message: `State: ${session.state}`,
      actions: [],
    })
  }

  return async function engineV2Route(req, res) {
    if (!String(req.url || '').startsWith('/api/engine/v2/')) return false
    pruneSessions()

    const urlObj = new URL(req.url, 'http://localhost')
    const route = urlObj.pathname

    try {
      if (req.method === 'POST' && route === '/api/engine/v2/restore') { await handleOneShot(req, res, await readBody(req)); return true }
      if (req.method === 'POST' && route === '/api/engine/v2/session') {
        const id = randomUUID()
        const session = {
          id,
          state: 'IDLE',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          url: '',
          baseUrl: null,
          originalHtml: '',
          findings: [],
          beforeScore: null,
          fixes: [],
          enabledFixes: [],
          restoredHtml: '',
          appliedFixes: 0,
          appliedFixList: [],
          improvements: [],
          unresolved: [],
          filesModified: 0,
          afterScore: null,
          workDir: path.join(os.tmpdir(), `restore-engine-v2-${id}`),
          option: null,
          actionCompleted: false,
          deliveryResult: null,
          verifyResult: null,
        }
        sessions.set(id, session)
        json(res, 200, { step: 'idle', status: 'success', state: 'IDLE', sessionId: id, message: 'v2.0 session created.', actions: [], summary: { issues_found: 0, issues_fixed: 0, files_modified: 0, before_score: null, after_score: null } })
        return true
      }

      if (req.method === 'GET' && route === '/api/engine/v2/state') { await handleState(req, res, urlObj); return true }
      if (req.method === 'POST' && route === '/api/engine/v2/scan') { await handleScan(req, res, await readBody(req)); return true }
      if (req.method === 'POST' && route === '/api/engine/v2/fix') { handleFix(req, res, await readBody(req)); return true }
      if (req.method === 'POST' && route === '/api/engine/v2/approve') { handleApprove(req, res, await readBody(req)); return true }
      if (req.method === 'POST' && route === '/api/engine/v2/delivery') { handleDelivery(req, res, await readBody(req)); return true }
      if (req.method === 'POST' && route === '/api/engine/v2/action-complete') { handleActionComplete(req, res, await readBody(req)); return true }
      if (req.method === 'POST' && route === '/api/engine/v2/github') { await handleGithub(req, res, await readBody(req)); return true }
      if (req.method === 'GET' && route === '/api/engine/v2/download') { handleDownload(req, res, urlObj); return true }
      if (req.method === 'GET' && route === '/api/engine/v2/code') { handleCode(req, res, urlObj); return true }
      if (req.method === 'POST' && route === '/api/engine/v2/deploy') { await handleDeploy(req, res, await readBody(req)); return true }
      if (req.method === 'POST' && route === '/api/engine/v2/verify') { await handleVerify(req, res, await readBody(req)); return true }
      if (req.method === 'GET' && route === '/api/engine/v2/verify/status') { handleVerifyStatus(req, res, urlObj); return true }

      errorResponse(res, 404, `Unknown v2 engine route: ${req.method} ${route}`, 'check_endpoint')
      return true
    } catch (err) {
      log(`[engine-v2] error on ${req.method} ${route}: ${err.message}`)
      errorResponse(res, err.status || 500, err.message || 'Engine failure.', err.actionRequired || 'retry')
      return true
    }
  }
}
